# API reference

Base URL: `http://localhost:5000/api` (or `/api` through the Vite dev server). All bodies are JSON unless noted.
A Postman collection with every request is in [postman_collection.json](postman_collection.json).

## Conventions

**Responses.** Success: `{ "success": true, "message"?, "data", "meta"? }`. Error: `{ "success": false, "message", "code", "details"?, "requestId" }`. `code` is stable and meant for programs; `message` is meant for people.

**Authentication.** Cookies only, all set by the server (you never handle a token):

| | Customer | Admin |
|---|---|---|
| Access token (HTTP-only, 15 min) | `bank_at` | `bank_admin_at` |
| Refresh token (HTTP-only, 7 days, sent only to its auth path) | `bank_rt` | `bank_admin_rt` |
| CSRF token (readable) | `bank_csrf` | `bank_admin_csrf` |

**CSRF.** Every `POST`, `PUT`, `PATCH` and `DELETE` from a signed-in client must send `X-CSRF-Token` with the value of the matching CSRF cookie. The refresh endpoint needs it too. Missing or wrong: `403 CSRF_INVALID`.

**Silent refresh.** On `401 TOKEN_EXPIRED` (or `UNAUTHENTICATED` with a live refresh cookie) call the realm's `POST .../refresh`, then retry once. Refresh tokens rotate: each works once, and replaying an old one revokes every session (`401`).

**Money.** Always **integer paise** (Rs 1 = 100). Decimals and numeric strings are rejected. Limits: Rs 1 to Rs 1,00,00,000 per transaction.

**Idempotency.** `deposit`, `withdraw` and `transfer` require an `Idempotency-Key` header (8 to 80 characters of letters, digits, `-`, `_`; a UUID is ideal). Repeating a request with the same key returns the original result with `200` and `Idempotent-Replay: true` and never moves money again. The same key with a different body returns `422 IDEMPOTENCY_MISMATCH`. Failed attempts do not consume the key.

**Pagination.** `?page=1&limit=20` (limit max 50). Lists return `meta: { page, limit, total, pages }`.

**Rate limits** (per IP): 600 requests per 15 min overall (production); 10 failed logins per 15 min; 10 sign-ups per hour; 20 money requests per minute; 10 KYC uploads and 10 new accounts per hour. Exceeding returns `429 RATE_LIMITED`.

**Dates** are ISO 8601 UTC strings. Account numbers are 10 digits ending in a Luhn check digit.

## Error codes

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Bad input. `details: [{ path, message }]` names each field. |
| 400 | `INVALID_JSON`, `UPLOAD_ERROR`, `FILE_REQUIRED`, `INVALID_FILE_TYPE`, `WRONG_PASSWORD`, `SAME_ACCOUNT`, `IDEMPOTENCY_KEY_REQUIRED`, `IDEMPOTENCY_KEY_INVALID` | Specific bad requests. |
| 401 | `UNAUTHENTICATED`, `TOKEN_EXPIRED`, `INVALID_CREDENTIALS` | Not signed in, token expired (refresh), wrong email or password. |
| 403 | `CSRF_INVALID`, `ORIGIN_BLOCKED`, `CORS_BLOCKED` | Cross-site protection. |
| 403 | `FORBIDDEN`, `SUPERADMIN_ONLY`, `CANNOT_MODIFY_SELF` | Missing permission or protected action. |
| 403 | `KYC_REQUIRED`, `ACCOUNT_FROZEN`, `NAME_LOCKED`, `TRANSITION_NOT_ALLOWED`, `ACCOUNT_DISABLED` | Business rule blocks it. |
| 404 | `NOT_FOUND` | Missing, or not yours (never distinguishes the two). |
| 409 | `EMAIL_TAKEN`, `ACCOUNT_CLOSED`, `TOO_MANY_ACCOUNTS`, `BALANCE_NOT_ZERO`, `ALREADY_VERIFIED`, `TOO_MANY_PENDING`, `ALREADY_REVIEWED`, `NO_CHANGE`, `STATE_CHANGED`, `NOT_COMPLETED`, `LAST_SUPERADMIN` | Conflicts with current state. |
| 413 | `FILE_TOO_LARGE`, `PAYLOAD_TOO_LARGE` | Upload or body too big. |
| 422 | `INSUFFICIENT_FUNDS` (`details.available`), `RECIPIENT_UNAVAILABLE`, `IDEMPOTENCY_MISMATCH`, `REPORT_TOO_LARGE` | Understood but cannot be done. |
| 423 | `ACCOUNT_LOCKED` | 5 failed logins; wait 15 minutes. |
| 429 | `RATE_LIMITED` | Slow down. |
| 503 | `NOT_READY` | `/health/ready` while the database is down. |

---

## Health
| Method | Path | Notes |
|---|---|---|
| GET | `/health` | Always 200: `{ status, database, uptimeSeconds, timestamp }`. |
| GET | `/health/ready` | 200 only when MongoDB is connected. |

## Customer authentication (`/auth`)

**POST `/auth/register`** creates the account and signs in. `201`.
```json
{ "name": "Aarav Mehta", "email": "aarav@example.com", "phone": "+91 98765 43210",
  "dob": "1998-04-12", "address": "14 Lake View Road, Pune", "password": "Passw0rdOK1" }
```
Password: 8+ characters, letters and numbers, at most 72 bytes. Must be 18+. Returns `{ user }` (no secrets). Errors: `EMAIL_TAKEN`, `VALIDATION_ERROR`.

**POST `/auth/login`** `{ "email", "password" }` returns `{ user }` and sets cookies. Errors: `INVALID_CREDENTIALS` (same answer for unknown email), `ACCOUNT_LOCKED`, `ACCOUNT_DISABLED`.

**POST `/auth/refresh`** (refresh cookie + `X-CSRF-Token`) rotates tokens, returns `{ user }`.
**POST `/auth/logout`** revokes the session and clears cookies (works even if the access token expired).
**GET `/auth/me`** returns `{ user }`.
**PUT `/auth/password`** `{ "currentPassword", "newPassword" }`. Signs out every other device.

## Admin authentication (`/admin/auth`)
Same shape as above without `register` (admins are created by a super admin or `npm run admin:create`). The `user` includes `role`, `permissions` (extra grants) and `effectivePermissions` (what they can actually do).

## Customer (`/customers`, `/notifications`)

| Method | Path | Notes |
|---|---|---|
| GET | `/customers/profile` | `{ customer }` |
| PUT | `/customers/profile` | `{ name?, phone?, address? }` only; other fields are rejected. Name is locked after KYC verification (`NAME_LOCKED`). |
| GET | `/customers/dashboard` | `{ totals: { balance, activeAccounts, deposits, withdrawals }, accounts[], recent[], trend: [{ month, deposits, withdrawals }] }` (6 months) |
| POST | `/customers/kyc` | `multipart/form-data`: `document` (PDF/JPG/PNG, 5 MB) and `docType` (`aadhaar`, `pan`, `passport`, `driving_licence`). `201 { document, kycStatus }`. Type is checked from file bytes. Max 3 documents pending; verified customers get `ALREADY_VERIFIED`. |
| GET | `/customers/kyc-status` | `{ status, rejectReason, hasDocuments, documents: [{ id, docType, fileName, status, rejectReason, uploadedAt, reviewedAt }] }` |
| GET | `/notifications` | `?page&limit&unread=true`. `meta.unread` is the unread count. |
| PUT | `/notifications/:id/read` | Own notifications only. |
| PUT | `/notifications/read-all` | `{ updated }` |

## Accounts (`/accounts`)

**POST `/accounts`** `{ "accountType": "savings" | "current" | "salary" }` returns `201 { account }`. Zero balance, server-generated number. Up to 5 open accounts (`TOO_MANY_ACCOUNTS`). Other fields (balance, owner) are rejected.

**GET `/accounts`** `?status=active|frozen|closed&page&limit`. **GET `/accounts/:id`** own accounts only.

**PUT `/accounts/:id/status`** `{ "status": "closed", "reason"? }`. Customers can only close; balance must be 0 (`BALANCE_NOT_ZERO`); frozen accounts are admin-only (`ACCOUNT_FROZEN`); closed is final.

Account object: `{ id, accountNumber, accountType, balance, currency: "INR", status, createdAt, closedAt? }`.

## Transactions (`/transactions`)
All three money endpoints need KYC `verified` (`KYC_REQUIRED`), `Idempotency-Key`, and `X-CSRF-Token`. Each runs as one database transaction and returns `201 { transaction, account: { id, balance } }`.

**POST `/transactions/deposit`** `{ "accountId", "amount", "description"? }`
**POST `/transactions/withdraw`** `{ "accountId", "amount", "description"? }` (`INSUFFICIENT_FUNDS` if balance is short)
**POST `/transactions/transfer`** `{ "fromAccountId", "toAccountNumber", "amount", "description"? }`. The recipient number needs a valid check digit. A missing, frozen or closed recipient all give `RECIPIENT_UNAVAILABLE` and leave the sender untouched.

```json
{ "success": true, "message": "Transfer completed",
  "data": {
    "transaction": { "id": "...", "reference": "TXN3F9A1C2B7D4E8A60", "type": "transfer", "direction": "debit",
                     "amount": 30000, "description": "Rent", "status": "completed", "date": "2026-11-07T10:00:00.000Z",
                     "accountId": "...", "counterparty": { "last4": "3048" } },
    "account": { "id": "...", "balance": 70000 } } }
```

**GET `/transactions/history`** `?page&limit&accountId&type&status&direction&from&to&q`. `type`: deposit/withdrawal/transfer. `status`: pending/completed/failed/reversed. `direction`: credit/debit. `from`/`to`: dates (`to=2026-11-07` includes that whole day). `q`: text in note or reference (plain text, not a pattern). Recipients see only completed transfers into their accounts.

**GET `/transactions/:id`** returns `{ transaction, ledger: [{ accountId, direction, amount, balanceAfter }] }` showing only your side.
**GET `/transactions/:id/receipt`** returns a PDF (completed transactions only; sender and recipient).

## Admin (`/admin`)
All routes need an admin session. The permission column is what the admin must hold.

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/dashboard` | any admin | `{ totals, trend, byType, recent }`; sections the admin may not see are `null` |
| GET | `/customers` | customers:read | `?kycStatus&active&q&page&limit` (no address or DOB in lists) |
| GET | `/accounts` | accounts:read | `?status&accountType&customerId&q&page&limit` (`q`: owner name/email or number prefix) |
| PUT | `/accounts/:id/freeze` | accounts:freeze | `{ "frozen": true, "reason": "..." }` (reason of 5+ characters required to freeze) |
| PUT | `/accounts/:id/status` | accounts:freeze | `{ "status": "active"\|"frozen"\|"closed", "reason"? }`; closing needs zero balance |
| GET | `/transactions` | transactions:read | `?type&status&flagged&accountNumber&minAmount&maxAmount&from&to&q` |
| GET | `/kyc` | kyc:review | `?status=pending\|approved\|rejected&docType` (pending oldest first) |
| PUT | `/kyc/:id` | kyc:review | `{ "decision": "approve"\|"reject", "reason" }` (reason required to reject) |
| GET | `/kyc/:id/file` | kyc:review | Document as an attachment; every view is audited |
| GET | `/fraud` | fraud:read | `?reviewed=false\|true&severity` |
| PUT | `/fraud/:id/review` | fraud:review | `{ "note"? }` |
| GET | `/audit-logs` | audit:read | `?action&actorId&entityType&entityId&from&to&q` |
| GET | `/admins` | admins:manage | |
| POST | `/admins` | admins:manage | `{ name, email, role }` returns `{ admin, temporaryPassword }` (shown once) |
| PUT | `/admins/:id` | admins:manage | `{ name?, role?, permissions?, isActive? }` |
| POST | `/admins/:id/reset-password` | admins:manage | `{ temporaryPassword }`; revokes their sessions |
| GET | `/reports/:type` | reports:read | `type`: `transactions`, `customers`, `daily-summary`. `?format=json\|csv&from&to` (default last 30 days, max 366) |

**Roles.** `superadmin`: everything. `kyc_officer`: customers:read, kyc:review. `operations`: customers:read, accounts:read, accounts:freeze, transactions:read, fraud:read, fraud:review, reports:read. `auditor`: customers:read, accounts:read, transactions:read, fraud:read, reports:read, audit:read.

**Rules.** Only a super admin can create or change super admins. Nobody can change their own role, permissions or status. Deactivating an admin signs them out immediately. Role changes apply on the next request.

**Fraud flags** (never block a transaction): `LARGE_AMOUNT` (Rs 4,50,000+), `RAPID_TRANSFERS` (5 transfers in 10 min), `DEPOSIT_THEN_WITHDRAW` (90%+ of a deposit moved out within 15 min), `REPEATED_FAILURES` (3 failures in 15 min). Severity: high (large amount or 2+ reasons), medium, low.
