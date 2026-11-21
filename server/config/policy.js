// Business rules in one place so they are easy to find, change and test.
// All money is in paise (1 rupee = 100 paise).
export const MAX_OPEN_ACCOUNTS = 5; // accounts per customer that are not closed

export const KYC_REQUIRED_FOR_MONEY = true; // deposits, withdrawals and transfers need verified KYC
export const MIN_TXN_PAISE = 100; // Rs 1
export const MAX_TXN_PAISE = 1_000_000_000; // Rs 1,00,00,000 per transaction

// Fraud flags (see services/fraud.service.js). Flagging never blocks a transaction; admins review flags.
export const LARGE_TXN_PAISE = 45_000_000; // Rs 4,50,000
export const RAPID_TRANSFER_COUNT = 5; // transfers within the window, counting this one
export const RAPID_TRANSFER_WINDOW_MS = 10 * 60_000;
export const DEPOSIT_THEN_WITHDRAW_WINDOW_MS = 15 * 60_000;
export const DEPOSIT_THEN_WITHDRAW_RATIO = 0.9; // moving out 90%+ of what just came in
export const REPEATED_FAILURE_COUNT = 3; // failed attempts within the window, counting this one
export const REPEATED_FAILURE_WINDOW_MS = 15 * 60_000;
