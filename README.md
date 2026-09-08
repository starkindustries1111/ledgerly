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

The backend can be deployed as a Vercel Node function. It uses Neon Postgres in production because Vercel function filesystems are not persistent. Neon has a $0 Free plan with storage and usage limits. The existing `server/budgeting.db` remains available for local development and backups.

### Vercel backend

Deploy the repository as a Vercel project. The `api/index.js` function imports the existing Express app. Add these Vercel environment variables:

- `NODE_ENV=production`
- `VERCEL=1`
- `CLIENT_ORIGIN` set to the exact HTTPS Netlify site origin
- `COOKIE_SAME_SITE=none`
- `JWT_SECRET` set to a private random value of at least 32 characters
- `DATABASE_URL` set to the private Neon Postgres connection string
- `ERROR_MONITOR_URL` and `ADMIN_EMAILS` when needed

The health check is `GET /api/health`. Do not set `DATABASE_PATH` on Vercel.

### Netlify frontend

Add `VITE_API_URL` to the Netlify build environment, set to the Vercel API origin with `/api`, for example `https://your-project.vercel.app/api`. Redeploy Netlify after adding it. The existing client sends credentials, so login, signup, logout, and session cookies continue to work across the two HTTPS origins.

For local development, keep `DATABASE_PATH=./budgeting.db`, `NODE_ENV=development`, and `COOKIE_SAME_SITE=lax`; leave `DATABASE_URL` empty. Run `npm run dev` from the project root.
