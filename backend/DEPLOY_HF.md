# Deploying to Hugging Face Spaces

Result: backend at `https://<user>-kiddometer-backend.hf.space` with automatic
HTTPS, €0/month (CPU basic: 2 vCPU, 16 GB RAM).

## 1. Create the Space (2 minutes)

1. Account at [huggingface.co](https://huggingface.co/join) (free, no card).
2. [New Space](https://huggingface.co/new-space):
   - **Space name**: `kiddometer-backend`
   - **License**: the one you use in the repo (MIT/GPL…)
   - **SDK**: **Docker** → *Blank*
   - **Hardware**: **CPU basic · Free**
   - **Visibility**: **Public**

## 2. Upload the backend files

Option A — web (easiest): in the Space's **Files** tab → *Add file* →
*Upload files* and upload these 5 files from the `backend/` folder:

```
Dockerfile
entrypoint.sh
main.py
requirements.txt
README.md      (it carries the YAML header that configures the Space — it overwrites the one created by default)
```

Option B — git:

```bash
git clone https://huggingface.co/spaces/<user>/kiddometer-backend
cp backend/Dockerfile backend/entrypoint.sh backend/main.py backend/requirements.txt backend/README.md kiddometer-backend/
cd kiddometer-backend && git add -A && git commit -m "Add Kiddometer backend" && git push
# user: your HF user · password: an Access Token (Settings → Access Tokens → write)
```

The Space builds the image on its own (~3–5 min the first time; it compiles the
PO Token provider).

## 3. Configure variables

In the Space → **Settings**:

- **Variables** → `ALLOWED_ORIGINS` = `https://<youruser>.github.io`
- **Secrets** (optional, extra anti-blocking layer) → `COOKIES_B64` = contents
  of `cookies.txt` in base64 (`base64 -w0 cookies.txt`), exported from a
  **throwaway** YouTube account. It expires in ~2 weeks.

Changing variables restarts the Space automatically.

## 4. Check

`https://<user>-kiddometer-backend.hf.space/api/health` must return:

```json
{"ok": true, "ytdlp": "20xx.xx.xx", "pot_provider": true, "cookies": false}
```

## 5. Connect the frontend

In `docs/js/config.js`:

```js
export const BACKEND_URL = 'https://<user>-kiddometer-backend.hf.space';
```

Commit + push → GitHub Pages updates and the YouTube tab becomes active.

## Important detail: the Space sleeps

The free plan pauses the Space after **48 h without requests**. The next
request wakes it up on its own, but it takes ~30–60 s (the frontend already
warns that it may take a while). To keep it always awake: a free
[UptimeRobot](https://uptimerobot.com) monitor pinging `/api/health` every
30 minutes.

## YouTube anti-blocking (already included)

| Layer | What it does |
|---|---|
| PO Token provider (bgutil) | "Proof of origin" tokens — yt-dlp's official solution for datacenter IPs |
| Client chain | Retries with `mweb`, `web_safari`, `tv_embedded` if the default client gets the block |
| Self-update | yt-dlp updates itself every 12 h inside the container |
| Cookies (`COOKIES_B64`) | Strongest layer if the blocks persist |

## Other platforms

They work well from a datacenter: **Vimeo, Dailymotion, Twitch (VODs), TikTok,
Reddit, X/Twitter** and hundreds more. Not supported without login: Instagram,
Facebook. YouTube is the only one with active blocking; hence the layers above.
