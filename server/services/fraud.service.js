import {
  DEPOSIT_THEN_WITHDRAW_RATIO, LARGE_TXN_PAISE, RAPID_TRANSFER_COUNT, REPEATED_FAILURE_COUNT,
} from '../config/policy.js';

// Pure rule check. The ledger service gathers the inputs from the database; this decides the flags.
// A flag never blocks money movement. It puts the transaction in the admin fraud queue (Phase 9).
export function evaluateRules({
  type, amount, failed = false,
  priorTransfersInWindow = 0, recentDepositTotal = 0, priorFailuresInWindow = 0,
}) {
  const reasons = [];
  if (amount >= LARGE_TXN_PAISE) reasons.push('LARGE_AMOUNT');
  if (type === 'transfer' && priorTransfersInWindow + 1 >= RAPID_TRANSFER_COUNT) reasons.push('RAPID_TRANSFERS');
  if ((type === 'withdrawal' || type === 'transfer') && recentDepositTotal > 0 && amount >= recentDepositTotal * DEPOSIT_THEN_WITHDRAW_RATIO) {
    reasons.push('DEPOSIT_THEN_WITHDRAW');
  }
  if (failed && priorFailuresInWindow + 1 >= REPEATED_FAILURE_COUNT) reasons.push('REPEATED_FAILURES');
  return reasons;
}

// How worried an admin should be, from the reasons. Used to sort and colour the fraud queue.
export function severityOf(reasons = []) {
  if (reasons.includes('LARGE_AMOUNT') || reasons.length >= 2) return 'high';
  if (reasons.includes('RAPID_TRANSFERS') || reasons.includes('DEPOSIT_THEN_WITHDRAW')) return 'medium';
  return reasons.length ? 'low' : null;
}

const TEXT = {
  LARGE_AMOUNT: 'Unusually large amount',
  RAPID_TRANSFERS: 'Many transfers in a short time',
  DEPOSIT_THEN_WITHDRAW: 'Most of a fresh deposit moved out quickly',
  REPEATED_FAILURES: 'Repeated failed attempts',
};
export const describeReasons = (reasons = []) => reasons.map((r) => TEXT[r] || r);
