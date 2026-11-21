import { Loader2, Inbox, X } from 'lucide-react';
import { cx } from '../../utils/format.js';

export function Button({ variant = 'primary', loading, className, children, ...rest }) {
  return (
    <button className={cx('btn', `btn-${variant}`, className)} disabled={loading || rest.disabled} {...rest}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Field({ label, error, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-navy-800">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-navy-400">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-medium text-red-600" role="alert">{error}</span>}
    </label>
  );
}

export const Input = ({ label, error, hint, className, ...rest }) => (
  <Field label={label} error={error} hint={hint}>
    <input className={cx('field', error && 'border-red-400', className)} {...rest} />
  </Field>
);

export const Select = ({ label, error, hint, children, ...rest }) => (
  <Field label={label} error={error} hint={hint}>
    <select className="field" {...rest}>{children}</select>
  </Field>
);

export const Card = ({ className, children }) => <section className={cx('card', className)}>{children}</section>;

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-navy-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const tones = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  slate: 'bg-navy-50 text-navy-600 ring-navy-300/40',
};
const statusTone = {
  active: 'green', verified: 'green', completed: 'green', approved: 'green', low: 'slate',
  pending: 'amber', medium: 'amber', frozen: 'blue',
  failed: 'red', rejected: 'red', high: 'red', closed: 'slate', reversed: 'slate',
};
export function Badge({ children, tone }) {
  const t = tone || statusTone[String(children).toLowerCase()] || 'slate';
  return (
    <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ring-1 ring-inset', tones[t])}>
      {children}
    </span>
  );
}

export function StatCard({ label, value, icon: Icon, note }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-navy-500">{label}</p>
        {Icon && <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-soft text-brand"><Icon className="h-5 w-5" /></span>}
      </div>
      <p className="mt-3 text-2xl font-extrabold tracking-tight">{value}</p>
      {note && <p className="mt-1 text-xs text-navy-400">{note}</p>}
    </Card>
  );
}

export const Spinner = () => (
  <div className="grid place-items-center py-16" role="status" aria-label="Loading">
    <Loader2 className="h-7 w-7 animate-spin text-brand" />
  </div>
);

export const Skeleton = ({ className }) => <div className={cx('animate-pulse rounded-lg bg-navy-100', className)} />;

export function EmptyState({ title, message, action }) {
  return (
    <div className="grid place-items-center px-6 py-14 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-navy-50 text-navy-300"><Inbox className="h-6 w-6" /></span>
      <h3 className="mt-4 font-bold">{title}</h3>
      {message && <p className="mt-1 max-w-sm text-sm text-navy-500">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="grid place-items-center px-6 py-14 text-center">
      <h3 className="font-bold text-red-700">Could not load this page</h3>
      <p className="mt-1 text-sm text-navy-500">{message}</p>
      {onRetry && <Button variant="outline" className="mt-4" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function Modal({ open, title, onClose, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy-950/50 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-navy-400 hover:text-navy-800"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
