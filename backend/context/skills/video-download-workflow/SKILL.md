---
name: video-download-workflow
description: Download a video from YouTube, TikTok, Twitter, or Instagram and deliver a sandbox URL.
tags: video, download, youtube, tiktok, media
---

# Video Download Workflow

Goal: take a video URL from the user, download the highest reasonable
quality MP4 into the E2B sandbox, and return a temporary download URL.

## Steps

1. **Try `download_video` first.** Pass the user's URL directly. It already
   wraps `yt-dlp` and handles YouTube, TikTok, Twitter/X, Instagram, and
   most generic sites. Set `max_height: 720` unless the user explicitly
   asked for higher.
2. **If `download_video` fails**, fall back to `run_python` with explicit
   yt-dlp:
   ```python
   import os, subprocess, sys
   os.makedirs("/home/user/downloads", exist_ok=True)
   subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "yt-dlp"])
   import yt_dlp
   opts = {
       "outtmpl": "/home/user/downloads/%(title).80s.%(ext)s",
       "format": "best[ext=mp4][height<=720]/best",
   }
   with yt_dlp.YoutubeDL(opts) as ydl:
       info = ydl.extract_info(URL, download=True)
       print(ydl.prepare_filename(info))
   ```
3. **Verify** the file with `run_terminal "ls -la /home/user/downloads/ && ffprobe -v error -show_entries format=duration -of csv=p=0 <file>"`.
   If size is 0 or ffprobe errors, the download failed — go to step 4.
4. **On repeated failure**, search for an alternative source, OR tell the
   user the platform isn't supported and stop. Do NOT loop forever.
5. **Deliver** with `get_sandbox_file_url(path=<full path>)` and put the
   URL at the END of your response, labeled with file size and duration.

## Anti-patterns

- Don't `browse_web` the video page first — that wastes a tool call.
- Don't dump the binary to terminal output. Use `inspect_sandbox_file` or
  `ffprobe` for verification.
- Don't share the URL twice across turns. Only mention NEW URLs.
