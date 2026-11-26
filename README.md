# Drosak Plus Telegram Business Auto Reply

Node.js app for Telegram Business keyword replies, with a small Arabic dashboard.

## 1) Deploy to Railway via GitHub
1. Create a **private** GitHub repository and upload all files from this folder.
2. In Railway, create a new service from that repository.
3. Add a public domain in Railway: Settings -> Networking -> Generate Domain.
4. Add these Railway Variables:
   - `BOT_TOKEN` = token from BotFather (keep secret)
   - `ADMIN_USER` = dashboard username (example: admin)
   - `ADMIN_PASSWORD` = a long unique password
   - `WEBHOOK_SECRET` = a random secret, 20-50 letters/numbers/underscores/hyphens
   - `DATA_FILE` = `/data/replies.json`
5. Add a Railway Volume and mount it at `/data` so replies persist after deploy/restart.
6. Deploy. The app uses `RAILWAY_PUBLIC_DOMAIN` to register the Telegram webhook at startup.
7. Open `https://YOUR-RAILWAY-DOMAIN/admin`. The browser asks for the username/password you set.

## 2) Telegram setup
- Bot must be created by BotFather and Telegram Business features must be enabled/connected for your account.
- In Telegram Business -> Chat Automation, connect this bot and allow the chats you want it to answer.
- The app handles Telegram `business_message` updates and replies using `business_connection_id`.
- Do not expose BOT_TOKEN or WEBHOOK_SECRET publicly.

## Matching
- Case-insensitive substring matching.
- If multiple keywords match, the longest keyword wins.
- If no keyword matches, optional default reply is sent.
- Empty default reply disables fallback.
- Messages beginning with `/` and bot-sent messages are ignored.

## Note
This app only handles text messages. It does not use or modify your old app/database.
