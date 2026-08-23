# Security policy

## Design guarantees

- Local services bind to loopback interfaces.
- Browser-originated API calls require a trusted origin and per-launch token.
- Electron renderers use context isolation, sandboxing, sender-checked IPC, blocked popups, and restricted navigation.
- Commands and payloads are length-, type-, URL-, content-type-, body-size-, and rate-limited.
- Child processes receive structured argument arrays; user text is not interpolated into a shell.
- Sensitive or destructive actions require explicit confirmation.
- OpenAI keys remain backend-only and are redacted from watcher logs.
- Model-returned coordinates are validated and cannot bypass post-action verification.

## Reporting

Do not include API keys, launch tokens, personal activity databases, screenshots, or user files in reports. Provide the affected component, reproduction steps, impact, and a minimal safe proof of concept.

## Scope

IRIS Parallel Desktop is not a malware sandbox. Do not use it to execute untrusted binaries. Captchas, authentication prompts, payments, account changes, uploads, downloads, and destructive actions require user involvement or confirmation.
