============================================
  AI Digital Human - Playback Control
============================================

These scripts are for the playback machine.
No GPU, no Python, no LibreOffice needed.
Only Node.js is required.


Files:
  start.bat     Launch backend + frontend
  stop.bat      Kill all services
  restart.bat   Stop then start
  status.bat    Check if services are running


First-time setup:
  1. Install Node.js 18+ from https://nodejs.org
  2. Copy .env from dev machine to app/.env
  3. Double-click start.bat
     (it auto-installs dependencies)
  4. Open http://localhost:5173/player


What you need from the dev machine:
  - app/.env                   (API keys)
  - app/server/video-cache/    (videos + scripts)
  - app/server/images/         (PPT images)
  - app/public/knowledge/      (knowledge base)
