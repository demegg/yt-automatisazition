# ShortForge

Turn long videos into vertical shorts for YouTube Shorts, TikTok, and Instagram Reels.

ShortForge is a web application. The browser handles the workspace. FFmpeg and optional faster-whisper captions run on the server. A separate desktop window is available for local use; it opens the same web UI.

Tagline: Long videos. More moments. Less editing.

## What works

- Account registration, sign-in, logout, and password change while signed in
- Projects saved in SQLite and video files stored on disk
- Primary video plus an optional second video
- File upload, or an http(s) link when yt-dlp can retrieve it
- Trim, custom parts, layouts, optional soundtrack, optional burned-in captions
- Draggable timeline, editor keyboard shortcuts, and a live count of how many shorts a render will create
- Command palette, toasts, and re-editing a finished or failed project without re-uploading
- Background rendering to 1080×1920 MP4 (H.264, AAC, 30 fps)
- Download one short or a zip
- Rename, delete, and cancel
- Optional YouTube and TikTok scheduling when those API credentials are set
- Public marketing pages and a private workspace

## What this build does not do

- Charge a card or run a subscription
- Email a password reset
- Store video blobs in the database or in object storage
- Download every YouTube, TikTok, or Instagram URL
- Offer a multi-track editor, undo history, or alternate export codecs

Set `AUTH_REQUIRED=true` before a public deployment. With it left false, visitors share one local guest account.

## Requirements

- Python 3.10+
- Node.js 18+
- FFmpeg on `PATH` (`ffmpeg` and `ffprobe`)
- The faster-whisper model downloads on first caption job (about 150 MB for `base`)

## Local development

From the repository root.

### API

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8891
```

### Web UI

```powershell
cd frontend
npm install
copy .env.example .env
npm run dev
```

Open http://localhost:5174

The dev server proxies `/api` to http://127.0.0.1:8891. Set `VITE_API_PROXY` (for example `http://127.0.0.1:8892`) and `VITE_PORT` to run a second copy alongside it.

### Workspace shortcuts

| Keys | Where | Action |
| --- | --- | --- |
| `Ctrl`/`⌘` + `K`, or `/` | Workspace | Command palette: search projects, jump to pages |
| `Space` | Editor | Play or pause |
| `←` / `→` (`Shift` for 5 s) | Editor | Seek |
| `I` / `O` | Editor | Set start / end at the playhead (trim, or the selected part) |
| `S` | Editor | Split the part under the playhead |
| `N` | Editor | Add a part |
| `Delete` | Editor | Remove the selected part |
| `?` | Editor | Show shortcuts |

The timeline is draggable: scrub anywhere, drag the trim handles in auto mode, or drag a selected part's edges in custom mode.

`AUTH_REQUIRED` defaults to false in code when the variable is unset, so local use can continue as a guest. The example env file sets it to true. For a private laptop session, set `AUTH_REQUIRED=false` in `backend/.env`.

### Desktop window

Build the frontend, then launch the local window. It serves the built UI and opens `/app`.

```powershell
cd frontend
npm run build
cd ..\backend
.\venv\Scripts\Activate.ps1
python -m app.desktop
```

## Production

Serve one origin when you can. The API can serve `frontend/dist` itself: requests that are not `/api` fall through to `index.html`.

```powershell
cd frontend
$env:VITE_SITE_URL="https://your-domain.example"
npm run build
cd ..\backend
$env:AUTH_REQUIRED="true"
$env:JWT_SECRET="replace-with-a-long-random-string"
$env:COOKIE_SECURE="true"
$env:BACKEND_URL="https://your-domain.example"
$env:FRONTEND_URL="https://your-domain.example"
$env:ALLOWED_ORIGINS="https://your-domain.example"
uvicorn app.main:app --host 0.0.0.0 --port 8891
```

Put a TLS proxy in front. Restarting the process marks jobs that were `queued`, `processing`, or `importing` as failed.

The render worker runs inside the API process. One server is enough to start. A second public node needs shared disk for `uploads`, `output`, and the SQLite file, or a later move to object storage and a queue. That move is not implemented.

### Worker and storage

- Metadata: `data/shortforge.db`
- Uploads: `uploads/`
- Finished shorts: `output/<batch-slug>/`
- Override all three with `SHORTFORGE_DATA_DIR`
- Delete a project to remove its files. There is no background retention sweeper.
- `MAX_UPLOAD_MB` limits each uploaded file (default 2048)
- Do not point the process at a shell command supplied by a user. FFmpeg arguments are built by the server.

### Environment

Copy `backend/.env.example` and `frontend/.env.example`.

| Variable | Purpose |
| --- | --- |
| `JWT_SECRET` | Session signing secret. Required for a real deployment. |
| `AUTH_REQUIRED` | `true` rejects anonymous API calls. |
| `COOKIE_SECURE` | `true` when the site is HTTPS. |
| `BACKEND_URL` | Public API origin, used for OAuth callbacks. |
| `FRONTEND_URL` | Where OAuth returns the browser. |
| `ALLOWED_ORIGINS` | Browser origins allowed to call the API. |
| `MAX_UPLOAD_MB` | Per-file upload cap. |
| `SHORTFORGE_DATA_DIR` | Optional data root. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | YouTube Data API OAuth. Optional. |
| `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` | TikTok Content Posting. Optional. |
| `VITE_SITE_URL` | Absolute origin written into `robots.txt` and `sitemap.xml` at build time. |
| `VITE_CONTACT_EMAIL` | Optional footer address. Leave unset if you do not have one. |

YouTube redirect: `{BACKEND_URL}/api/social/youtube/callback`

TikTok redirect: `{BACKEND_URL}/api/social/tiktok/callback`

Indexing: `robots.txt` allows the public pages and disallows `/app`, `/sign-in`, and `/register`. Building does not submit the site to Google.

Privacy and terms pages are drafts. Have them reviewed before you rely on them.

## Tests

```powershell
cd backend
.\venv\Scripts\python -m pip install -r requirements.txt
.\venv\Scripts\python -m pytest tests -q
```

```powershell
cd frontend
npm run build
```

The API tests use a temporary data directory. One test renders a six-second fixture with FFmpeg when `ffmpeg` is on `PATH`.

## Layouts

| Layout | Needs two videos |
| --- | --- |
| Single | No |
| Top and bottom | Yes |
| Main and reaction | Yes |
| Picture in picture | Yes |
| Side by side | Yes |

Captions add time. Use Max shorts while you try settings.

## Agency notes

Specialists used before implementation: UX architect, brand guardian, frontend developer, backend architect, software architect, SEO specialist, and the identity guidance already present in the JWT session design. Review followed the evidence collector, API tester, and reality checker checklists in the final verification notes.
