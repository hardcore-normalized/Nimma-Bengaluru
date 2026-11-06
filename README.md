# Nimma Bengaluru

Nimma Bengaluru is a mobile-first academic prototype for reporting civic issues in Bengaluru and managing them through a single administrator portal that covers all 369 GBA wards. It is not a Government of Karnataka or GBA service and does not automatically send complaints to a public authority.

## Start on Windows

1. Install Node.js 20.19 or newer (a current LTS release) on the Windows PC. npm is included with Node.js.
2. Copy or extract the project folder onto that PC.
3. Double-click `start-windows.bat`.
4. On first run, the script installs npm packages. With no Atlas connection configured, the app downloads and runs its built-in local MongoDB database; this needs internet access once.
5. Keep the terminal window open. It prints the local site address, phone address, and a QR code.
6. Connect the phone and PC to the same Wi-Fi, scan the QR code with the phone camera, and open the HTTPS link. Accept the local certificate warning once, then allow camera and location access.

If Windows Firewall blocks phone access, run `allow-firewall-windows.bat` as administrator while connected to a trusted private Wi-Fi network. If campus Wi-Fi blocks connections between devices, connect the PC to a phone hotspot and restart the app.

The reporting form is designed for a phone because it uses the camera and GPS. The official portal and administration pages also work from a desktop browser.

## MongoDB Atlas

The project does not require a separately installed MongoDB service. To use Atlas, copy `.env.example` to `.env` if needed, paste the Atlas connection string into `MONGODB_URI`, and set `DB_MODE=atlas` (or leave `auto` to fall back to the local demo database if Atlas is unavailable). In Atlas, allow network access from the PC running the app and use a database user with access to the selected database. Keep `.env` private and do not share it in a source archive.

When no Atlas URL is configured, the local demo database stores data under `data/local-db`. A fresh local database is seeded with sample issues and the admin account below. Sample reports are inserted only when the database has no reports.

## Admin account

There is one account: the administrator. It sees and manages complaints from all 369 wards (5 city corporations).

| Username | Password |
| --- | --- |
| `admin` | `Admin@2026` |

This fixed demo password is for presentations only — change it from **Admin portal → Change password** before anyone else can reach the app. The earlier ward-officer demo accounts (`ravi.central`, `priya.east`, `arjun.south`) are removed automatically when the server starts.

## Issue categories and moderation

Categories include road damage, footpaths, waste collection and dumping, streetlights, drainage and waterlogging, water supply, sewage, trees, unsafe manholes, construction debris and other civic issues. They reflect issue types documented by BBMP's public grievance and civic-service pages. Reports remain subject to official review; an automated risk signal is not proof that a report is false.

Sensitive allegations are disabled by default. Enable that intake only after an institution approves the reviewer roles, evidence handling, retention and referral process. The app records technical evidence for review but does not identify a person with certainty, decide guilt, or impose legal penalties.

## Useful commands

- `npm start` — build the web app if needed, then start the server.
- `npm run build` — build the browser app.
- `npm run typecheck` — check TypeScript.
- `npm run seed` — add the admin account and sample reports if the database is empty.
- `npm run reset-demo` — replace records marked as demo data only; other records are preserved.

For a local development session, use `npm run dev` in one terminal and `npm run server` in another after installing packages.

## Look and feel

The interface uses a hand-drawn "crayon box" theme (paper texture, wax-crayon colours, Caveat Brush / Patrick Hand / Nunito fonts bundled locally). It is designed phone-first: a bottom tab bar on phones, a sidebar on desktop, and tables that turn into cards on small screens.

## Deploy for free (Render + MongoDB Atlas)

1. Put the project in a GitHub repository (private is fine). `.env` is excluded by `.gitignore`, so your database password is not uploaded.
2. In MongoDB Atlas → **Network Access**, add `0.0.0.0/0` (Render's addresses change).
3. On [render.com](https://render.com): **New → Blueprint**, pick the repository. `render.yaml` sets everything up; paste your Atlas URL when asked for `MONGODB_URI`.
4. Open the `https://….onrender.com` link. Camera and GPS work on any phone, on any network.
5. Before sharing the link: sign in as admin, **change the password**, and turn off "Show demo accounts on the official login page" in Anti-misuse settings.

The free web service sleeps after 15 idle minutes and takes about a minute to wake – open it a couple of minutes before a demo.

## Firewall

Render's free plan has no firewall, so the app has its own (Admin portal → **Firewall**). It refuses hacking tools and probes for things like `/wp-admin` or `/.env`, slows down request floods, limits how many uploads run at once, and automatically bans a network that keeps misbehaving (1 hour, then 6 hours, then 24 hours by default). The signed-in admin is never rate-limited. Limits are adjustable in Anti-misuse settings.

## Free-tier monitor

Admin portal → **Free-tier usage** shows how close the app is to each free limit: Atlas storage (0.5 GB), Atlas transfer (10 GB / 7 days, estimated), Render hours (750 / month) and Render bandwidth (100 GB / month).

- At 80% the admin sees a warning banner and an entry is written to the audit log.
- At 90% of storage, video uploads pause (photos still work) and citizens see a notice that the app runs on a free plan.
- At 98% of storage, new reports pause with a friendly message instead of failing.

Each item lists what can be done – free up space (buttons to remove old videos of closed complaints or the demo data) or upgrade the plan.
