# Birhane Hiwot Permission Desk

A responsive Telegram Mini App prototype for requesting time away and reviewing requests as an admin.

## Run locally

```sh
npm install
npm run dev:vercel
```

The Vercel dev server runs the frontend and `/api` functions together. Plain `npm run dev` serves only the Vite UI and uses browser-local sample data for preview.

To check the production build:

```sh
npm run build
```

## Included

- Permission type, date, employee name, Telegram username, phone number, and reason fields.
- Request statuses with approve and reject actions in the admin review screen.
- Admin review is gated by a username/password sign-in screen; the employee request list shows awaiting, approved, and rejected statuses.
- Admin filters by employee name, Telegram username, and requested date.
- Telegram WebApp bridge initialization and profile name/username prefill when opened in Telegram.
- Responsive layout for desktop and Telegram's mobile webview.
- English and Amharic interface language switch; the selected language is saved in the browser.

## Prototype data

When the API is configured, requests are stored in MongoDB and shared between employees and admins. Employees must open the app through Telegram so the server can verify Telegram's signed Mini App data and show each person only their own requests. The phone number is entered by the employee because Telegram does not provide it through Mini App profile data. Plain Vite development mode uses browser-local sample data only.

## Configure services

Copy `.env.example` to `.env.local` for local Vercel development. Set these values in `.env.local` and in the Vercel project's **Settings → Environment Variables** for Production and Preview:

- `MONGODB_URI`: the full MongoDB Atlas connection URI, including a database user and password.
- `MONGODB_DB`: database name; defaults to `birhane_hiwot`.
- `TELEGRAM_BOT_TOKEN`: the bot token used to verify Telegram Mini App `initData`.
- `ADMIN_TELEGRAM_IDS`: optional, comma-separated Telegram chat IDs (e.g. `123456789,987654321`) that get a bot message for every new permission request. Each admin must press **Start** in the bot once, otherwise Telegram blocks the message. To find your chat ID, message `@userinfobot` on Telegram.
- `ADMIN_USERNAME`: the admin login username.
- `ADMIN_PASSWORD`: a unique, strong admin password.
- `SESSION_SECRET`: a random secret of at least 32 characters used to sign the HTTP-only admin session cookie.

Do not commit `.env.local` or put secrets in `VITE_` variables; those are bundled into browser code. In MongoDB Atlas, create a database user and allow connections from Vercel in Network Access. Never use a publicly exposed database password.

Admin sign-in and request review run through Vercel API functions. Employees' submissions are associated with their verified Telegram account, and admins receive a signed, HTTP-only session cookie. The Telegram bot's Mini App URL must point to the deployed HTTPS URL.