# IRIS

IRIS is a Windows desktop automation prototype built with Electron, React, FastAPI, Playwright, Windows UI Automation, and the OpenAI Responses API.

It can execute natural-language desktop workflows, control websites through a dedicated browser profile, visually ground controls when semantic targeting fails, record workflow context, and run evidence-backed research tasks in a separate Windows desktop.

IRIS is not a security sandbox and cannot guarantee that websites or applications will behave without affecting the host system. Sensitive and destructive actions require confirmation.

Evaluation references: [architecture](docs/ARCHITECTURE.md), [evaluation guide](EVALUATION.md), [security policy](SECURITY.md), and [deterministic scenarios](evaluation/scenarios.json).

## Architecture

The Electron renderer communicates only with the local FastAPI backend at `127.0.0.1`. Electron retrieves a per-launch authentication token through its isolated preload bridge. The renderer automatically adds that token to local backend requests.

Browser actions use this priority:

1. Playwright semantic DOM locators over Chrome DevTools Protocol (CDP)
2. Windows accessibility and UI Automation controls
3. OpenAI vision grounding

OCR is not part of the automation path. IRIS uses the DOM, accessibility APIs, and OpenAI vision.

The bounded browser loop follows:

```text
capture → understand → act → capture → verify
```

It stops on verified success, cancellation, timeout, maximum steps, repeated state, end of page, login walls, captchas, blocked pages, or action-verification failure.

## Task contract

All new automation tasks use these states:

```text
queued → running ↔ waiting → success | failed | cancelled
```

Terminal states cannot transition back to running. Task responses include timestamps, progress, retry count, cancellation state, error details, timeline events, and verification evidence.

## Security model

- Backend and activity-gateway services bind to `127.0.0.1`.
- CORS accepts only configured Electron/Vite origins.
- FastAPI generates a cryptographically secure token for every backend launch.
- Electron receives the token through preload IPC; it is not embedded in the frontend bundle.
- Protected backend and activity-gateway requests require the token.
- The bundled Chrome extension has a stable ID and is the only browser-extension origin accepted by the gateway.
- Request bodies, command lengths, URLs, content types, and event schemas are validated.
- Mutating routes have body-size and rate limits.
- Process launches use structured arguments instead of user-controlled shell strings.
- Sensitive commands require explicit confirmation.
- `.env`, launch tokens, credentials, and API keys must never be committed.

The launch token is stored for the current Windows user at `%LOCALAPPDATA%\IRIS\launch-token` and is replaced whenever the backend starts.

The public, secret-safe `GET /api/readiness` endpoint reports prerequisite booleans and the automation/security contracts for machine evaluation.

## Setup

Requirements:

- Windows 10 or 11
- Node.js
- Python 3.12
- Chrome or Edge
- An OpenAI API key for planning, vision, and research synthesis

Install dependencies:

```powershell
npm install
py -3.12 -m pip install -r requirements.txt
py -3.12 -m playwright install chromium
```

Copy `.env.example` to a root `.env` file and add the API key:

```dotenv
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4o-mini
OPENAI_VISION_MODEL=gpt-4o
```

Optional configuration:

```dotenv
IRIS_TRUSTED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,null
IRIS_RATE_LIMIT_REQUESTS=120
IRIS_VISION_DEBUG=0
```

Do not use `VITE_OPENAI_API_KEY`; IRIS keeps OpenAI calls in the Python backend.

## Running IRIS

Start the backend, Vite, and Electron together:

```powershell
npm start
```

For troubleshooting, `npm run backend` and `npm run dev` can be run in separate terminals. The Vite Electron plugin starts the desktop shell during development.

IRIS uses strict local ports (`8000`, `5173`, and `32000`) and a single Electron instance. Close any older IRIS process before starting a fresh demo; startup now fails fast instead of silently switching ports.

The browser automation service connects to `http://127.0.0.1:9222`. If no compatible browser is listening, it launches Chrome or Edge with a dedicated profile at `%LOCALAPPDATA%\IRIS\browser-profile`.

Parallel Desktop research uses port `9223` and its own profile under `iris_core/parallel_storage`.

## Browser task API

`POST /api/browser/tasks` requires an objective and at least one explicit success criterion:

```json
{
  "objective": "Open the documentation and find the installation section",
  "initial_url": "https://example.com/docs",
  "expected_text": "Installation",
  "max_steps": 20,
  "max_retries_per_action": 2,
  "total_timeout_seconds": 90
}
```

Protected requests require the `X-IRIS-Token` header. Use Electron’s preload bridge rather than reading the token directly from renderer code.

## Parallel Desktop research

Research tasks navigate real pages and collect final URLs, page titles, publication dates when detectable, and bounded DOM excerpts. Reports are synthesized only from collected evidence. Citation links are checked against successfully visited source URLs.

If source collection, synthesis, or citation validation fails, IRIS returns a partial or failed task instead of fabricating completion. TXT, DOCX, and PDF exports are read back and verified before success is returned.

## Tests

Safe checks:

```powershell
npm run lint
npm run build
py -3.12 -m compileall -q iris_core
npm test
```

`npm run check` runs lint, the production build, and all mocked test suites.

The default suite uses mocks. It does not call paid APIs, browse the live internet, launch applications, or control the real mouse and keyboard.

Live OpenAI test:

```powershell
$env:IRIS_RUN_INTEGRATION_TESTS='1'
py -3.12 -m pytest -q iris_core/test_openai.py
```

Live Windows desktop tests:

```powershell
$env:IRIS_RUN_DESKTOP_TESTS='1'
py -3.12 -m pytest -q iris_core/test_native_engine.py
```

Run live tests only in an interactive test environment.

## Known limitations

- Captchas and login walls require user takeover.
- Browser DOM changes can require locator or planner updates.
- OpenAI vision may return `not_found`; IRIS does not click invalid or low-confidence grounding.
- Some native applications expose incomplete accessibility trees.
- Unusual mixed-DPI driver configurations still require live integration testing.
- Parallel Desktop is a separate Win32 desktop, not a malware-containment boundary.
- Paid OpenAI requests require account access, available quota, and a supported configured model.
