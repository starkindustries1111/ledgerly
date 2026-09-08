# Ledgerly

A small daily budgeting app with React, Express, SQLite, JWT sessions, and bcrypt password/PIN hashing.

## Run locally

1. Install Node.js 20+.
2. From the project root, run `npm install`.
3. Copy `server/.env.example` to `server/.env` and replace `JWT_SECRET` with a random value of at least 32 characters. Set `CLIENT_ORIGIN` to the exact frontend origin in production. Set `ERROR_MONITOR_URL` to your approved error intake endpoint if you use one.
4. Run `npm run dev`.
5. Open `http://localhost:5173`.

The API runs on `http://localhost:3001`. SQLite creates `server/budgeting.db` on first start.

## Auth behavior

- Signup hashes the PIN, creates a session, and opens the dashboard immediately.
- A later login looks up the email, then requires PIN verification.
- PINs are validated as 4 or 6 digits and stored only as bcrypt hashes. This is a PIN-only account model, not password authentication.
- The client keeps a separate unlocked flag so a refresh cannot skip PIN verification.

## API routes

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/set-pin`
- `POST /api/auth/verify-pin`
- `POST /api/transactions`
- `GET /api/summary`
- `GET /api/calendar?month=YYYY-MM`
- `GET /api/health`

## Security notes

- The API only accepts requests from the configured `CLIENT_ORIGIN` and limits JSON request bodies to 10 KB.
- Authentication attempts are rate-limited per client IP, and JWT signing requires an environment-provided secret.
- All transaction reads and writes are scoped to the authenticated user's ID.
- Run `npm run backup` regularly to create a SQLite backup in `server/backups/`; store copies outside the application host for disaster recovery.
- `/privacy` and `/terms` are available from the consent banner and footer links.

## Production deployment

The production server serves the built frontend and API from one origin. Build with `npm run build`, then start with `npm start` from the project root.

Set these server environment variables in the hosting provider:

- `NODE_ENV=production`
- `JWT_SECRET` to a new random value of at least 32 characters
- `CLIENT_ORIGIN` to the public HTTPS URL of the app
- `PORT` to the port supplied by the hosting provider
- `DATABASE_PATH` to a file on a persistent mounted volume
- `ERROR_MONITOR_URL` and `ADMIN_EMAILS` when needed

Use persistent disk storage for `DATABASE_PATH` and schedule `npm run backup`; copy backups to off-host durable storage and verify restores regularly. The health check is `GET /api/health`. A reverse proxy must terminate HTTPS and forward `X-Forwarded-Proto: https`.
