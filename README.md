# Fekad Permission Desk

A responsive Telegram Mini App prototype for requesting time away and reviewing requests as an admin.

## Run locally

```sh
npm install
npm run dev
```

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

## Prototype data

Requests are saved in this browser's `localStorage`, with sample requests provided on first load. The admin and requester screens share data only in the same browser profile; this is not a multi-user backend. The phone number is entered by the user because Telegram does not expose it through the Mini App profile by default.

Before using this with a team, connect a backend or bot API for shared request storage, validate Telegram `initData` on the server, and enforce admin permissions server-side. The in-app admin switch is for trying the workflow and is not an access control mechanism.

## Admin demo sign-in

- Username: `admin`
- Password: `fekad123`

These demo credentials are checked in the frontend and are visible in the app source. They only demonstrate the sign-in flow and do not secure the admin screen. Replace this with backend authentication and server-enforced authorization before deployment; never use these demo credentials for a real account.