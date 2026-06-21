# ShortForge

Turn long videos into **YouTube Shorts** and **TikTok** clips automatically.

Upload one or two long videos, pick clip length (30s / 1min / 2min), choose a layout, enable AI captions, and generate dozens of vertical 9:16 shorts in one batch.

## Features

- **Batch shorts** — Slice a long video into many clips at 30s, 60s, or 120s
- **Dual video layouts** — Single, top/bottom, side-by-side, picture-in-picture, main + reaction
- **9:16 vertical output** — 1080×1920, ready for Shorts & TikTok
- **Auto captions** — Whisper AI transcription with TikTok-style burned-in subtitles
- **Modern UI** — Step-by-step wizard with preview and progress tracking
- **Bulk download** — Download individual shorts or everything as a ZIP

## Requirements

- **Python 3.10+**
- **Node.js 18+**
- **FFmpeg** (must be on your PATH)

## Quick Start

### 1. Backend

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8888
```

First run downloads the faster-whisper `base` model (~150 MB) for captions.

### 2. Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**

## How It Works

1. **Upload** — Primary video (file or link) + optional second video (file or link)
2. **Configure** — Clip length, layout, caption style, max shorts limit
3. **Process** — FFmpeg cuts & crops to vertical; Whisper adds captions
4. **Download** — Preview clips in-browser, download individually or as ZIP

## Layout Options

| Layout | Description |
|--------|-------------|
| Single Video | Full-screen one video |
| Top & Bottom | 50/50 vertical split |
| Main + Reaction | 72% main on top, reaction cam below |
| Picture in Picture | Main video with corner overlay |
| Side by Side | Two videos side by side in vertical frame |

## Project Structure

```
yt automation/
├── backend/
│   ├── app/
│   │   ├── main.py        # FastAPI routes
│   │   ├── processor.py   # FFmpeg video processing
│   │   ├── captions.py    # Whisper caption generation
│   │   ├── worker.py      # Background job runner
│   │   └── models.py      # API schemas
│   └── requirements.txt
└── frontend/
    └── src/
        ├── App.tsx
        └── components/
```

## Scheduling posts to YouTube & TikTok

After generating shorts, use **Schedule uploads** on the results page.

- Choose **YouTube Shorts** and/or **TikTok**
- Set **posts per day** (1, 2, 3, or 5)
- Clips are spread between 9 AM – 9 PM
- **Never reposts the same clip** — tracks posted and scheduled files per platform

### Setup (one-time)

1. Copy `backend/.env.example` to `backend/.env`
2. **YouTube:** [Google Cloud Console](https://console.cloud.google.com/) → enable YouTube Data API v3 → OAuth credentials → redirect URI: `http://127.0.0.1:8890/api/social/youtube/callback`
3. **TikTok:** [TikTok Developers](https://developers.tiktok.com/) → Content Posting API → redirect URI: `http://127.0.0.1:8890/api/social/tiktok/callback`
4. Restart the backend after adding keys
5. On the results page, click **Connect** for each platform

The scheduler runs every minute and posts pending clips automatically.


- Captions add processing time (~30–60s per clip). Disable them for faster batch exports.
- Use **Max Shorts** to test settings on a few clips before running the full batch.
- For dual-video layouts, both videos should be roughly the same length (uses the shorter one).

## License

MIT
