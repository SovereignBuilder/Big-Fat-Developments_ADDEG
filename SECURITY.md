# Security Policy

## Supported Versions

This project is a "seed" provided as-is. We do not maintain long-term support branches. The latest version on the `master` branch is the only version we actively look at, though no formal support SLA exists.

## Reporting a Vulnerability

If you discover a security issue (e.g., unexpected data exposure or unsafe file operations), please open an Issue on GitHub with the prefix `[SECURITY]`.

## Local-First & Privacy

ADDEG is designed to be **local-first** and privacy-centric:

- **No Telemetry:** The tool does not send data to any remote server.
- **Local Files:** All data (`inbox/*.jsonl`, config files) resides on your local machine unless you explicitly choose to sync it (e.g., via OneDrive/Dropbox/Git).
- **Git Safety:** The default `.gitignore` is configured to prevent accidental commitment of your personal notes (`inbox/`) and local configuration (`addeg.config.json`).

Please verify your `.gitignore` and configuration before pushing to a public repository to ensure no sensitive personal data is exposed.
