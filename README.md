# Northwind Bank: Smart Banking & Account Management System

A full-stack MERN banking simulation: customer onboarding with KYC, multiple accounts, atomic deposits, withdrawals and peer-to-peer transfers on a double-entry ledger, and a role-based admin console with fraud monitoring, audit logs and reports.

> **Simulation only.** No real money, no real banking networks. Built as an academic and portfolio project. Demo passwords are public, so never reuse them anywhere real.

## Contents
- [Features](#features) · [Tech stack](#tech-stack) · [Quick start](#quick-start) · [Demo credentials](#demo-credentials)
- [Configuration](#configuration) · [Database setup](#database-setup) · [Project structure](#project-structure)
- [How it stays correct and secure](#how-it-stays-correct-and-secure) · [API](#api) · [Testing](#testing)
- [Scripts](#scripts) · [Deploying](#deploying) · [Troubleshooting](#troubleshooting) · [Limitations](#limitations-and-ideas)

## Features

| Module | What it does |
|---|---|
| **Customer management** | Register and sign in, edit profile, upload KYC documents (PDF/JPG/PNG), see Pending / Verified / Rejected status with reasons, notifications. |
| **Account management** | Open up to 5 accounts (Savings, Current, Salary) with generated 10-digit numbers, see balances and status (Active / Frozen / Closed), close empty accounts. |
| **Transaction hub** | Deposit, withdraw and send money to any account number. Search and filter history, PDF receipts, references, credit and debit views, failed attempts recorded. |
| **Admin controller** | Separate admin login, dashboard, customers, accounts, transactions, KYC review (with document download), freeze / unfreeze, fraud queue, admin and permission management, CSV reports, audit log. |

## Tech stack
- **Frontend:** React 18, Vite, Tailwind CSS, React Router, Axios, Recharts, Lucide icons
- **Backend:** Node.js, Express, MongoDB with Mongoose, JWT, bcrypt, Multer, Zod, Helmet, PDFKit
- **Tooling:** Vitest, Supertest, mongodb-memory-server, Docker Compose, GitHub Actions

## Quick start

Requires **Node.js 18.18+** and **Docker** (for the local database).

```bash
npm install                        # root tooling (runs both apps together)
npm run install:all                # client and server dependencies
cp server/.env.example server/.env

# Put two DIFFERENT random secrets into server/.env as JWT_ACCESS_SECRET and JWT_REFRESH_SECRET.
# Run this twice and paste each result:
node -e 'console.log(require("crypto").randomBytes(48).toString("hex"))'

npm run db:up                      # MongoDB replica set in Docker
npm run seed                       # demo customers, admins and 6 months of history
npm run dev                        # API on :5000, web app on :5173
```

Open **http://localhost:5173** and sign in with a demo account below. Admins sign in at **/admin/login**.
`npm run seed:reset` wipes everything and reseeds. The seed refuses to run in production and refuses non-local databases unless `SEED_ALLOW_REMOTE=true`.

## Demo credentials

**Customers** (password for all: `Customer2026!`)

| Email | KYC | Accounts |
|---|---|---|
| aarav.mehta@example.com | verified | savings 4021883014<br>current 4021883022<br>salary 4021883030 |
| priya.nair@example.com | verified | savings 4021883048<br>current 4021883055 |
| rohan.kapoor@example.com | pending | savings 4021883063 |
| meera.iyer@example.com | rejected | savings 4021883071 |
| kabir.singh@example.com | pending | none |
| ananya.rao@example.com | verified | savings 4021883089<br>salary 4021883097 |
| vikram.shah@example.com | verified | current 4021883105 |
| isha.gupta@example.com | verified | savings 4021883113 |
| dev.patel@example.com | pending | savings 4021883121 |
| neha.joshi@example.com | verified | savings 4021883139<br>current 4021883147 |

**Admins**, sign in at `/admin/login` (password for all: `AdminDemo2026!`)

| Email | Role |
|---|---|
| neel.sharma@northwind.test | superadmin |
| farah.khan@northwind.test | kyc_officer |
| sam.dsouza@northwind.test | operations |
| leena.pillai@northwind.test | auditor |

Things worth trying:
- **Aarav** (verified): dashboard with charts, 6 months of history, a frozen salary account, send money to Priya using her savings number.
- **Rohan / Dev** (KYC pending): sign in as Farah, approve or reject and download the document, then sign in as Rohan and try a deposit.
- **Sam** (operations): open fraud alerts, freeze an account and watch the customer's notification appear.
- **Leena** (auditor): read-only, so every action button is missing and direct API calls return 403.
- **Neel** (super admin): create admins (one-time password), reset passwords, run reports, read the full audit log.

A guided 10-minute walkthrough is in [TESTING.md](TESTING.md).

## Configuration

All settings live in `server/.env` (see `server/.env.example`). The server validates them at startup and refuses to start with a clear message if something is missing or weak.

| Variable | Required | Meaning |
|---|---|---|
| `MONGODB_URI` | yes | MongoDB connection string. Must be a replica set (the server checks). |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | yes | 32+ characters each, and different from each other. |
| `CLIENT_URL` | yes | Web app origin(s) allowed to call the API, comma-separated. Default `http://localhost:5173`. |
| `PORT` | no | API port, default 5000. |
| `NODE_ENV` | no | `development`, `test` or `production`. Production turns on Secure cookies, proxy trust and stricter limits. |
| `JWT_ACCESS_TTL` | no | Access token life, default `15m`. |
| `JWT_REFRESH_TTL_DAYS` | no | Session life, default 7. |
| `COOKIE_SECURE` | no | Overrides the Secure-cookie default. |
| `UPLOAD_DIR`, `MAX_UPLOAD_MB` | no | Private KYC folder (default `uploads`) and size cap (default 5). |
| `ADMIN_PASSWORD` | no | Used by `npm run admin:create`. |
| `SEED_ALLOW_REMOTE` | no | Lets `npm run seed` target a non-local database. |

The frontend needs no configuration in development: Vite proxies `/api` to the backend, which keeps cookies same-site. Business rules (limits, fraud thresholds) are in `server/config/policy.js`.

## Database setup

MongoDB **transactions** power every money operation, and they only work on a replica set. Pick one:

**Docker (recommended locally).** `npm run db:up` starts a single-node replica set from `docker-compose.yml` and initialises it automatically. Use the default `MONGODB_URI`. `npm run db:down` stops it; data persists in a Docker volume.

**MongoDB Atlas.** Create a free cluster (replica set by default), add a database user, allow your IP, and paste the `mongodb+srv://...` string into `MONGODB_URI`.

Indexes are created automatically in development. In production run `npm --prefix server run db:indexes` once per deployment.

## Project structure

```
bank-system/
├── client/                      React app (Vite)
│   └── src/
│       ├── components/          UI kit, tables, charts, route guard, pagination
│       ├── context/             AuthContext (session), ToastContext
│       ├── hooks/               useAsync, useDebounced
│       ├── layouts/             AppShell, customer and admin layouts, auth layout
│       ├── pages/               auth/, customer/ (8 pages), admin/ (10 pages)
│       ├── services/            api.js (Axios, CSRF, silent refresh), dataService.js
│       └── utils/               formatting, navigation
├── server/
│   ├── config/                  env validation, db, cors, rbac, realms, policy
│   ├── models/                  9 Mongoose models
│   ├── routes/ controllers/     thin HTTP layer
│   ├── services/                ledger, accounts, KYC, fraud, reports, admin, audit
│   ├── middleware/              auth, CSRF/origin, validation, rate limits, upload, errors
│   ├── validators/              Zod schemas
│   ├── scripts/                 seed, createAdmin, syncIndexes
│   ├── tests/                   unit/ + integration/ (in-memory replica set)
│   └── server.js
├── docs/                        API.md, ARCHITECTURE.md, Postman collection
├── docker-compose.yml           MongoDB replica set
├── .github/workflows/ci.yml     tests and build on every push
├── TESTING.md
└── README.md
```

## How it stays correct and secure

**Money correctness** (details in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md))
- Amounts are **integer paise**, never floats.
- Each deposit, withdrawal and transfer is **one MongoDB transaction**: guarded balance update, transaction record, double-entry ledger rows and audit row commit together or not at all. A transfer cannot update only one side.
- Balance checks are part of the update itself (`balance >= amount`), so simultaneous withdrawals cannot overdraw an account.
- An **Idempotency-Key** header makes retries safe: the same key returns the original result and never moves money twice.
- The ledger and audit log are **append-only** at the model level, and every balance is explained by its ledger entries.

**Security**
- Passwords hashed with bcrypt (cost 12); lockout after 5 failed logins; failed-only login rate limit.
- Sessions in **HTTP-only cookies** with 15-minute access tokens and **rotating refresh tokens** stored only as hashes. Replaying an old refresh token revokes every session.
- **CSRF**: session-bound token in a header, plus an Origin check and SameSite cookies.
- Customers and admins are separate realms (different cookies, token audiences and login endpoints). No public admin signup.
- **RBAC** with four roles; permissions are re-read on every request, so a role change or deactivation applies immediately.
- Every customer query is scoped by the session, so another customer's records look like "not found". Ids from the client are never trusted on their own.
- Zod validation on every input (unknown fields rejected), NoSQL operator stripping, escaped search patterns, Helmet, strict CORS.
- KYC uploads are checked by **real file bytes**, stored privately under random names, downloadable only by authorised admins (as attachments), and every view is audited.
- CSV exports neutralise spreadsheet formulas. Receipts and API errors never leak internals.

## API

Full reference with examples, error codes and conventions: **[docs/API.md](docs/API.md)**.
A ready-to-import **Postman collection** is in [docs/postman_collection.json](docs/postman_collection.json).

| Area | Base path |
|---|---|
| Auth (customer) | `/api/auth` |
| Auth (admin) | `/api/admin/auth` |
| Customer profile, KYC, dashboard | `/api/customers` |
| Notifications | `/api/notifications` |
| Accounts | `/api/accounts` |
| Transactions | `/api/transactions` |
| Admin console | `/api/admin` |
| Health | `/api/health`, `/api/health/ready` |

## Testing

```bash
npm test                           # unit and API tests, no database
npm --prefix server run test:db    # integration tests on an in-memory replica set
npm --prefix client run build      # the frontend compiles
```
The first `test:db` run downloads a MongoDB binary. [TESTING.md](TESTING.md) maps your 14 required scenarios to the exact tests and has a manual walkthrough. CI runs everything on each push.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API and web app together |
| `npm run db:up` / `db:down` | Start or stop the local MongoDB replica set |
| `npm run seed` / `seed:reset` | Fill an empty database / wipe and reseed |
| `npm --prefix server run admin:create -- --name "..." --email ... --role superadmin` | Create an admin (the only way to make the first one) |
| `npm --prefix server run db:indexes` | Build indexes explicitly (production) |
| `npm test` | Unit and API tests |
| `npm run client:build` | Production build of the web app |

## Deploying

This is a portfolio project, but it is built to deploy sensibly:
1. Use MongoDB Atlas, a strong `JWT_*` pair, `NODE_ENV=production`, `CLIENT_URL` set to your real site origin.
2. Serve the site over **HTTPS** and keep the web app and API on the **same site** (reverse proxy), because auth uses SameSite cookies. Example nginx:
   ```nginx
   server {
     listen 443 ssl;
     server_name bank.example.com;
     root /var/www/bank/client/dist;            # output of: npm run client:build
     location /api/ { proxy_pass http://127.0.0.1:5000; proxy_set_header X-Forwarded-For $remote_addr; }
     location / { try_files $uri /index.html; }
   }
   ```
3. Run `npm --prefix server run db:indexes`, then create the first admin with `admin:create`. **Do not run the seed in production.**
4. Put `server/uploads` on persistent storage and back it up with the database.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Invalid environment configuration` on start | Copy `server/.env.example` to `server/.env` and fill both JWT secrets (32+ characters, different). |
| `MongoDB is not running as a replica set` | Use `npm run db:up` or Atlas. A plain `mongod` cannot do transactions. |
| `ECONNREFUSED 127.0.0.1:27017` | The database is not up: `npm run db:up`, wait a few seconds. |
| `403 CSRF_INVALID` in Postman or curl | Authenticated changes need `X-CSRF-Token` set to the value of the `bank_csrf` (or `bank_admin_csrf`) cookie. The Postman collection does this automatically. |
| `403 Origin not allowed` | Add the browser's origin to `CLIENT_URL`. |
| Login says "locked" | 5 failed attempts lock an account for 15 minutes. `npm run seed:reset` clears it in development. |
| `npm run seed` refuses | The database already has data (use `seed:reset`), or the URI is non-local (`SEED_ALLOW_REMOTE=true`). |
| Port in use | Change `PORT` (and the proxy target in `client/vite.config.js`), or stop the other process. |
| First integration test run is slow | It downloads a MongoDB binary once. |

## Limitations and ideas
- No email service, so no self-service password reset or email verification. Admins can reset admin passwords; customer resets would need a mail provider.
- No multi-factor authentication.
- KYC files live on local disk; multiple server instances would need shared object storage.
- Fraud rules are fixed in `config/policy.js`; an admin-editable settings collection would be a natural next step.
- Transaction reversals are not built (the `reversed` status is reserved).
- Single currency (INR). The frontend has no automated tests of its own.
- This has not been security-audited or load-tested; treat it as a learning and portfolio project, not a production bank.
