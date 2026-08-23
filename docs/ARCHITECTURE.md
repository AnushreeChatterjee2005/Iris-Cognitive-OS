# IRIS architecture

IRIS is a local-first Windows automation system with four trust boundaries:

```text
Electron renderer
    │ isolated preload IPC
    ▼
Electron main process ── activity gateway (127.0.0.1:32000)
    │ per-launch token
    ▼
FastAPI backend (127.0.0.1:8000)
    ├── task lifecycle and policy checks
    ├── Playwright/CDP browser automation
    ├── Windows UI Automation
    ├── OpenAI vision fallback
    └── Parallel Desktop research and exports
```

## Browser decision loop

Every browser task uses `capture → understand → act → capture → verify`. Success requires caller-supplied criteria; a model cannot declare success by itself.

Targeting order is deterministic:

1. Playwright semantic DOM and accessibility locators.
2. Windows accessibility controls.
3. OpenAI vision grounding when semantic methods return `not_found`.

Vision boxes use normalized coordinates, are validated, converted for DPI-aware virtual-screen bounds, clamped, and rejected when malformed or low-confidence. Every click is followed by a changed-state or explicit visual verification check.

## Task lifecycle

All asynchronous tasks expose `queued`, `running`, `waiting`, `success`, `failed`, or `cancelled`. Records include timestamps, progress, retries, errors, timeline events, and verification evidence. Terminal states cannot return to running.

## Research integrity

Parallel Desktop records every attempted URL as visited, blocked, skipped, failed, or collected. Synthesis receives only collected excerpts. Reports with unknown URLs or uncited factual paragraphs are downgraded to partial/failed instead of reported as successful. Exported TXT, DOCX, and PDF files are read back before success.

## Configuration

Runtime secrets remain in the Python backend. Electron obtains a per-launch token through an isolated preload bridge. See [`.env.example`](../.env.example) for non-secret configuration names.
