# IRIS evaluation guide

## Automated gate

```powershell
npm ci --ignore-scripts
py -3.12 -m pip install -r requirements.txt
npm run check
```

The gate performs linting, production renderer/main/preload builds, activity-gateway contract tests, and mocked Python API, security, lifecycle, browser-loop, coordinate, research, export, and planning tests.

The deterministic command corpus is stored in [`evaluation/scenarios.json`](evaluation/scenarios.json). CI executes those scenarios without calling paid APIs or controlling the desktop.

## Machine-readable readiness

With the backend running:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/readiness
```

The endpoint exposes only booleans and architecture contracts—never API keys or tokens. `ready` means the OpenAI key, Playwright package, UI Automation package, and a supported browser are present. `degraded` identifies missing prerequisites.

## Live judging sequence

1. Start a clean single instance with `npm start`.
2. Ask IRIS to open YouTube Music, search for top hits, and play the first song.
3. Verify the timeline shows DOM targeting attempts before vision fallback.
4. Confirm `success` appears only after visible playback evidence.
5. Start background research and inspect visited-source evidence and inline citations.
6. Export the report as PDF and verify the returned file exists and contains report text.
7. Issue a sensitive command and verify IRIS requests confirmation before acting.

## Expected limitations

Captchas, login walls, and ambiguous visual targets require user takeover. Parallel Desktop is workflow isolation, not malware containment. Live OpenAI tests consume API quota and are opt-in.
