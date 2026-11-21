import ApiError from '../utils/ApiError.js';

// Who may move an account from one status to another. Pure logic, no database.
//   customer: can only close their own account.
//   admin:    can freeze, unfreeze and close (used by the admin routes in Phase 9).
// Closed is final. Closing additionally requires a zero balance (enforced atomically in the service).
const ALLOWED = {
  customer: { active: ['closed'] },
  admin: { active: ['frozen', 'closed'], frozen: ['active', 'closed'] },
};

export function transitionError({ actor, from, to }) {
  if (from === 'closed') return ApiError.conflict('Closed accounts cannot be changed', { code: 'ACCOUNT_CLOSED' });
  if (from === to) return ApiError.conflict(`The account is already ${to}`, { code: 'NO_CHANGE' });
  if (ALLOWED[actor]?.[from]?.includes(to)) return null;
  if (actor === 'customer' && from === 'frozen') {
    return ApiError.forbidden('This account was frozen by the bank. Contact support.', { code: 'ACCOUNT_FROZEN' });
  }
  if (actor === 'customer' && to === 'frozen') {
    return ApiError.forbidden('Only the bank can freeze an account', { code: 'TRANSITION_NOT_ALLOWED' });
  }
  return ApiError.forbidden('You cannot make this change', { code: 'TRANSITION_NOT_ALLOWED' });
}
