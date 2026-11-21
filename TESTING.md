# Testing guide

## Run everything
```bash
npm run install:all
npm test                           # unit + API tests: fast, no database
npm --prefix server run test:db    # integration tests on an in-memory MongoDB replica set
npm --prefix client run build      # the frontend compiles
```
The first `test:db` run downloads a MongoDB binary (about 100 MB, cached afterwards). GitHub Actions runs all three on every push (`.github/workflows/ci.yml`).

## Your 14 required scenarios, and where each is tested

| # | Scenario | Test file and group |
|---|---|---|
| 1 | Customer registration | `integration/auth.test.js` "registration"; `auth.unit.test.js` "auth validators" |
| 2 | Customer login and logout | `integration/auth.test.js` "login and sessions", "refresh token rotation" |
| 3 | Admin login | `integration/auth.test.js` "admin realm and RBAC"; `integration/admin.test.js` |
| 4 | Account creation | `integration/accounts.test.js` "opening accounts" |
| 5 | Deposit | `integration/transactions.test.js` "deposit" |
| 6 | Withdrawal | `integration/transactions.test.js` "withdrawal" |
| 7 | Insufficient balance | `integration/transactions.test.js` "refuses an overdraft by even one paisa" |
| 8 | Peer-to-peer transfer | `integration/transactions.test.js` "transfer" |
| 9 | Transaction history | `integration/transactions.test.js` "history and details" |
| 10 | KYC approval and rejection | `integration/admin.test.js` "KYC review" |
| 11 | Unauthorized API access | `integration/admin.test.js` "access control"; `transactions.test.js` "never lets one customer touch another customer's account"; `accounts.test.js` "hides other customers' accounts" |
| 12 | Duplicate transaction prevention | `integration/transactions.test.js` "duplicate prevention" (retry, mismatch, 6 simultaneous identical requests) |
| 13 | Account freezing | `integration/admin.test.js` "freezing accounts" |
| 14 | Role-based permissions | `integration/admin.test.js` "gives each role exactly the endpoints its permissions allow", "admin management" |

Beyond the list, the suites also prove: no overdraft under 10 simultaneous withdrawals, exact money conservation when transfers cross in both directions, rollback of the sender's debit when the recipient cannot receive, a ledger that explains every balance, CSRF enforcement, refresh-token theft detection, expired-token handling, upload safety (disguised files, size), CSV formula neutralisation, and that the demo seed data is internally consistent.

## Manual end-to-end check (10 minutes, after `npm run seed` and `npm run dev`)
1. Sign in as `aarav.mehta@example.com` / `Customer2026!`. Dashboard shows 3 accounts, charts, recent activity.
2. Transactions: search "rent", filter by type, download a receipt PDF.
3. Move money: transfer Rs 100 to Priya's savings number (see README). Balance drops, a notification appears for her.
4. Try to withdraw more than the balance: you get "Insufficient balance" and a failed entry appears in history.
5. Sign in as `rohan.kapoor@example.com`: deposit is refused until KYC is verified.
6. Sign in as `farah.khan@northwind.test` (admin login page): approve Rohan's KYC, download his document.
7. Back as Rohan: KYC shows verified and a deposit now works.
8. Sign in as `sam.dsouza@northwind.test`: fraud queue has open alerts. Freeze Vikram's account with a reason, then as Vikram confirm the account is frozen and a notification arrived.
9. Sign in as `leena.pillai@northwind.test` (auditor): no action buttons exist, and direct API calls return 403.
10. Sign in as `neel.sharma@northwind.test`: add an admin (copy the one-time password), run a CSV report, read the audit log.

## What the automated tests cannot cover
- Visual layout and responsiveness: check the pages at phone and desktop widths.
- Real browser cookie behaviour: the manual flow above exercises sign-in, silent token refresh (leave a tab open 16+ minutes, then click around) and sign-out.
