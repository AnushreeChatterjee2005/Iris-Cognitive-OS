"""Evidence-first web research for Parallel Desktop."""

from __future__ import annotations

from dataclasses import asdict, dataclass
import json
import os
import re
from typing import Any, Optional
from urllib.parse import parse_qs, quote_plus, urlparse

from browser_automation import BrowserAction, PlaywrightCDPAdapter


@dataclass(frozen=True)
class SourceEvidence:
    url: str
    title: str
    excerpt: str
    published_at: Optional[str] = None


@dataclass(frozen=True)
class SourceAttempt:
    url: str
    status: str
    details: str


@dataclass
class ResearchResult:
    status: str
    report: str
    sources: list[SourceEvidence]
    error: str = ""
    attempts: list[SourceAttempt] = None

    def __post_init__(self) -> None:
        if self.attempts is None:
            self.attempts = []


def validate_citations(report: str, sources: list[SourceEvidence]) -> tuple[bool, str]:
    cited_urls = re.findall(r"\[\d+\]\((https?://[^)]+)\)", report)
    if not cited_urls:
        return False, "The report contains no inline source citations."
    allowed = {source.url for source in sources}
    unknown = [url for url in cited_urls if url not in allowed]
    if unknown:
        return False, f"The report cited uncollected sources: {unknown[:3]}"
    factual_paragraphs = [
        paragraph.strip()
        for paragraph in re.split(r"\n\s*\n", report)
        if len(re.sub(r"[#*`\s]", "", paragraph)) >= 40 and not paragraph.lstrip().startswith("#")
    ]
    if any(not re.search(r"\[\d+\]\(https?://[^)]+\)", paragraph) for paragraph in factual_paragraphs):
        return False, "At least one factual paragraph has no inline citation."
    return True, "Citations map to collected pages."


class EvidenceResearchService:
    def __init__(self, adapter: Optional[PlaywrightCDPAdapter] = None):
        self.adapter = adapter or PlaywrightCDPAdapter()
        self.attempts: list[SourceAttempt] = []

    @staticmethod
    def _normalize_search_link(href: str) -> Optional[str]:
        if href.startswith("/url?"):
            href = parse_qs(urlparse(href).query).get("q", [""])[0]
        parsed = urlparse(href)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            return None
        host = parsed.netloc.lower()
        if host.endswith("google.com") or host.endswith("google.co.in"):
            return None
        return href

    def collect_sources(self, query: str, max_sources: int = 5) -> list[SourceEvidence]:
        self.attempts = []
        result = None
        for search_url in (
            f"https://www.google.com/search?q={quote_plus(query)}",
            f"https://www.bing.com/search?q={quote_plus(query)}",
        ):
            result = self.adapter.act_dom(BrowserAction("navigate", value=search_url), 12.0)
            self.attempts.append(SourceAttempt(search_url, "visited" if result.success else "failed", result.details))
            if result.success:
                break
        if result is None or not result.success:
            raise RuntimeError(f"Search navigation failed: {result.details if result else 'no search attempted'}")
        page = self.adapter.page
        raw_links: list[str] = page.locator("a[href]").evaluate_all(
            "els => els.map(el => el.href || el.getAttribute('href') || '')"
        )
        links: list[str] = []
        for raw_link in raw_links:
            normalized = self._normalize_search_link(raw_link)
            if normalized and normalized not in links:
                links.append(normalized)
            if len(links) >= max_sources * 2:
                break

        sources: list[SourceEvidence] = []
        for url in links:
            try:
                navigation = self.adapter.act_dom(BrowserAction("navigate", value=url), 12.0)
                if not navigation.success:
                    self.attempts.append(SourceAttempt(url, "failed", navigation.details))
                    continue
                observation = self.adapter.capture()
                lowered = observation.visible_text.lower()
                if any(marker in lowered for marker in ("access denied", "verify you are human", "sign in to continue")):
                    self.attempts.append(SourceAttempt(url, "blocked", "The page required authentication or anti-bot verification."))
                    continue
                text = re.sub(r"\s+", " ", observation.visible_text).strip()
                if len(text) < 200:
                    self.attempts.append(SourceAttempt(url, "skipped", "The page did not expose enough readable content."))
                    continue
                date_match = re.search(
                    r"\b(?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+20\d{2})\b",
                    text,
                    re.IGNORECASE,
                )
                sources.append(SourceEvidence(
                    url=observation.url,
                    title=observation.title or urlparse(observation.url).netloc,
                    excerpt=text[:3000],
                    published_at=date_match.group(0) if date_match else None,
                ))
                self.attempts.append(SourceAttempt(observation.url, "collected", f"Collected {len(text)} readable characters."))
                if len(sources) >= max_sources:
                    break
            except Exception as exc:
                self.attempts.append(SourceAttempt(url, "failed", f"{type(exc).__name__}: {exc}"[:500]))
                continue
        return sources

    @staticmethod
    def _partial_report(objective: str, sources: list[SourceEvidence], reason: str) -> str:
        lines = [
            f"# Partial research: {objective}",
            "",
            f"IRIS could not produce a fully verified synthesis: {reason}",
            "",
            "## Collected evidence",
        ]
        for index, source in enumerate(sources, 1):
            lines.extend([
                f"### {index}. {source.title}",
                source.excerpt[:600],
                f"Source: [{index}]({source.url})",
                "",
            ])
        return "\n".join(lines)

    def synthesize(self, objective: str, sources: list[SourceEvidence]) -> ResearchResult:
        if not sources:
            return ResearchResult("failed", "", [], "No readable sources were collected.", list(self.attempts))
        api_key = os.environ.get("OPENAI_API_KEY", "").strip()
        if not api_key:
            reason = "OPENAI_API_KEY is not configured; collected excerpts are provided without synthesis."
            return ResearchResult("partial", self._partial_report(objective, sources, reason), sources, reason, list(self.attempts))
        try:
            from openai import OpenAI
            client = OpenAI(api_key=api_key, timeout=20.0, max_retries=1)
            evidence = [
                {"number": index, **asdict(source)}
                for index, source in enumerate(sources, 1)
            ]
            response = client.responses.create(
                model=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
                instructions=(
                    "Write a concise evidence-backed report using only the supplied source excerpts. "
                    "Every factual paragraph must contain an inline Markdown citation exactly in the form "
                    "[N](URL), using the matching supplied source number and URL. Clearly label inferences. "
                    "Do not invent facts, quotations, dates, prices, or URLs."
                ),
                input=json.dumps({"objective": objective, "sources": evidence}, ensure_ascii=False),
                max_output_tokens=1800,
                store=False,
            )
            report = (response.output_text or "").strip()
            valid, reason = validate_citations(report, sources)
            if not report or not valid:
                return ResearchResult("partial", self._partial_report(objective, sources, reason), sources, reason, list(self.attempts))
            return ResearchResult("success", report, sources, attempts=list(self.attempts))
        except Exception as exc:
            reason = f"OpenAI synthesis failed: {exc}"
            return ResearchResult("partial", self._partial_report(objective, sources, reason), sources, reason, list(self.attempts))

    def research(self, objective: str, max_sources: int = 5) -> ResearchResult:
        try:
            sources = self.collect_sources(objective, max_sources=max_sources)
            return self.synthesize(objective, sources)
        except Exception as exc:
            return ResearchResult("failed", "", [], str(exc), list(self.attempts))
        finally:
            self.adapter.close()
