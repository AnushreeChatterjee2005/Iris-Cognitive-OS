from research_service import EvidenceResearchService, SourceEvidence, validate_citations


SOURCES = [
    SourceEvidence("https://docs.example.test/a", "Official A", "Verified detail A."),
    SourceEvidence("https://docs.example.test/b", "Official B", "Verified detail B."),
]


class NoopAdapter:
    def close(self):
        return None


def test_citation_validator_accepts_only_collected_urls():
    valid, _ = validate_citations(
        "A supported claim [1](https://docs.example.test/a).",
        SOURCES,
    )
    assert valid is True

    valid, reason = validate_citations(
        "A fabricated claim [3](https://fabricated.example/fake).",
        SOURCES,
    )
    assert valid is False
    assert "uncollected" in reason


def test_citation_validator_rejects_uncited_factual_paragraphs():
    report = (
        "Supported detail with enough context to qualify as a factual paragraph "
        "[1](https://docs.example.test/a).\n\n"
        "This second factual paragraph is long enough but has no evidence attached to it."
    )
    valid, reason = validate_citations(report, SOURCES)
    assert valid is False
    assert "no inline citation" in reason


def test_missing_openai_key_returns_truthful_partial_with_collected_sources(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    service = EvidenceResearchService(NoopAdapter())
    result = service.synthesize("Compare official options", SOURCES)

    assert result.status == "partial"
    assert "could not produce a fully verified synthesis" in result.report
    assert "https://docs.example.test/a" in result.report


def test_zero_sources_is_a_failure_not_a_generated_report():
    service = EvidenceResearchService(NoopAdapter())
    result = service.synthesize("Research a niche topic", [])

    assert result.status == "failed"
    assert result.report == ""
    assert "No readable sources" in result.error
