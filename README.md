# Client Report System

A Node.js + Express backend serving a static frontend for creating and managing client reports with MongoDB. Telegram notifications are supported and optional in local mode.

## Quick Start (Windows)

- Prerequisites: Node.js 18+ and MongoDB Server (Community). If you only have MongoDB Compass, install the MongoDB Server as well.
- First time:
  1. Double‑click `setup.bat` (installs deps, prepares config, starts Mongo + server).
  2. The app opens at http://localhost:3001.
- Next times:
  - Double‑click `start-server.bat` (auto checks/starts MongoDB and launches the app).

## One-time Telegram Setup (no editor needed)

If you want to enable Telegram sending and prefer not to edit files manually:

- Double‑click `configure-telegram.bat`
- Paste your `BOT_TOKEN` and `CHAT_ID` when prompted
- It creates `backend/.env`, runs setup, and you can then run `start-server.bat`

## Local‑Only Mode (No Telegram)

The repo supports a local mode that disables Telegram to avoid needing tokens.
- `backend/setup.js` sets `TELEGRAM_DISABLED=true` in `config.json` if `BOT_TOKEN` or `CHAT_ID` are missing in `backend/.env`.
- You can force it by setting `TELEGRAM_DISABLED=true` in `backend/.env`.

When disabled, the server runs normally and simply skips Telegram sending.

## Enable Telegram Locally

To send reports to Telegram from your machine (or your friend’s):

- Copy `backend/.env.example` to `backend/.env`.
- Set `TELEGRAM_DISABLED=false`.
- Fill `BOT_TOKEN` and `CHAT_ID` with valid values.
- Run `setup.bat` once, then `start-server.bat`.
  - Or just run `configure-telegram.bat` to be prompted interactively.

How to get values:
- `BOT_TOKEN`: Create a bot via BotFather in Telegram and copy the token.
- `CHAT_ID`: Add the bot to your target chat/channel and use a simple helper bot or logs to get the chat id, or send a message and inspect updates via `getUpdates`.

## Configuration

- Secrets are never committed (see `.gitignore`). Local config is generated into `backend/config.json` from `backend/.env` via `backend/setup.js`.
- First run creates `backend/.env` with placeholders. Edit it if you want to enable Telegram or point to Atlas.

Important variables:
- `MONGODB_URI` (default local) – use Atlas URI if preferred
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` – initial admin credentials
- `BOT_TOKEN`, `CHAT_ID` – required only when Telegram is enabled
- `PORT` (default 3001)
- `TELEGRAM_DISABLED` – set `true` to skip Telegram

## Project Structure

- `backend/` – Express API, MongoDB models, routes, Telegram service
- `frontend/` – static assets served by Express
- Scripts:
  - `setup.bat` – first‑run installer + launcher
  - `start-mongodb.bat` – starts local MongoDB
  - `start-server.bat` – checks MongoDB, generates config if needed, launches server

## Alternative: MongoDB Atlas

If you don’t want a local MongoDB:
1. Create a free cluster on MongoDB Atlas
2. Get the connection string (e.g. `mongodb+srv://...`)
3. Put it in `backend/.env` as `MONGODB_URI="..."`
4. Run `setup.bat` again or start the server

## Troubleshooting

- MongoDB not found: install MongoDB Community Server and ensure `mongod` is on PATH. Or run Atlas.
- Port in use: change `PORT` in `backend/.env` and re‑run `setup.bat`.
- Telegram errors: set `TELEGRAM_DISABLED=true` for local or provide valid `BOT_TOKEN`/`CHAT_ID`.

## Security & GitHub Checklist

- Secret files are ignored: `backend/config.json`, `backend/.env`, uploads.
- Before pushing, ensure no secrets are tracked:
  ```powershell
  git rm --cached backend/config.json backend/.env 2>$null
  git commit -m "chore: stop tracking local secrets"
  ```
- Rotate any tokens that may have been exposed previously.

## Git Commands to Publish

From the project root, run:

```powershell
git add .
git commit -m "docs: add quick start + local telegram mode; improve MongoDB startup"
git branch -M main
git remote add origin https://github.com/Jimmy229922/client-report-system.git 2>$null
git push -u origin main
```
