---
title: Kiddometer Backend
emoji: 🎬
colorFrom: purple
colorTo: pink
sdk: docker
app_port: 7860
pinned: false
---

# Kiddometer — download backend

Optional server for the "YouTube" tab of [Kiddometer](https://github.com/digiflowhelp-stack/Kiddometer):
it downloads the video (≤480p) with yt-dlp and streams it to the browser, where
it is analyzed locally. It stores nothing.

Endpoints:

- `GET /api/health` — status, yt-dlp version, POT provider and cookies.
- `GET /api/fetch?url=…` — video stream with CORS headers.

Variables (Space Settings):

- `ALLOWED_ORIGINS` — restricts CORS, e.g. `https://youruser.github.io`.
- `MAX_DURATION_SECONDS` — maximum duration (default 3600).
- `COOKIES_B64` (secret) — `cookies.txt` in base64 from a throwaway account,
  as an extra anti-blocking layer for YouTube.

Anti-blocking included: PO Token provider (bgutil) in the container itself,
yt-dlp's client fallback chain and self-updates every 12 h.

Step-by-step deployment: see `DEPLOY_HF.md` in the main repository.
