import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import useAsync from '../../hooks/useAsync.js';
import { getAccounts, submitMoney } from '../../services/dataService.js';
import { Button, Card, EmptyState, Input, PageHeader, Select, Spinner } from '../../components/ui/index.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { inr, isValidAccountNumber, maskAccount, toMinor } from '../../utils/format.js';

const tabs = [
  { id: 'deposit', label: 'Deposit' },
  { id: 'withdraw', label: 'Withdraw' },
  { id: 'transfer', label: 'Transfer' },
];
const MIN = 100; // Rs 1
const MAX = 1_000_000_000; // Rs 1,00,00,000

export default function Transfer() {
  const [params, setParams] = useSearchParams();
  const tab = tabs.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'deposit';
  const { data, loading, reload } = useAsync(getAccounts, []);
  const toast = useToast();
  const [form, setForm] = useState({ accountId: '', to: '', amount: '', note: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  // One key per attempt. If the request is retried (slow network, double click), the server returns
  // the original result instead of moving money twice. A new key is made only after success.
  const idempotencyKey = useRef(crypto.randomUUID());

  const usable = useMemo(() => (data || []).filter((a) => a.status === 'active'), [data]);
  const account = usable.find((a) => a.id === (form.accountId || usable[0]?.id));
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const validate = () => {
    const e = {};
    const minor = toMinor(form.amount);
    if (!form.amount || !Number.isFinite(minor)) e.amount = 'Enter an amount.';
    else if (minor < MIN) e.amount = 'The minimum amount is ₹1.';
    else if (minor > MAX) e.amount = 'Amount exceeds the single-transaction limit of ₹1,00,00,000.';
    else if (tab !== 'deposit' && minor > account.balance) e.amount = `Insufficient balance. Available: ${inr(account.balance)}.`;
    if (tab === 'transfer') {
      if (!isValidAccountNumber(form.to)) e.to = 'Check the account number: it should be 10 digits with a valid check digit.';
      else if (form.to === account.accountNumber) e.to = 'Choose a different account than the one you are sending from.';
    }
    return e;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const res = await submitMoney({ kind: tab, accountId: account.id, to: form.to, amount: toMinor(form.amount), note: form.note, idempotencyKey: idempotencyKey.current });
      toast.success(`${tabs.find((t) => t.id === tab).label} completed. Reference ${res.transaction.reference}.`);
      setForm({ accountId: account.id, to: '', amount: '', note: '' });
      idempotencyKey.current = crypto.randomUUID();
      reload(); // balances (including an own-account recipient) come from the server
    } catch (err) {
      if (err.code === 'RECIPIENT_UNAVAILABLE') setErrors({ to: err.message });
      else if (err.code === 'INSUFFICIENT_FUNDS') setErrors({ amount: err.message });
      else toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Move money" subtitle="Deposit, withdraw or send money to another account." />
      <Card className="mx-auto max-w-xl">
        <div className="grid grid-cols-3 gap-1 border-b border-navy-100 p-2" role="tablist">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id}
              onClick={() => { setParams({ tab: t.id }); setErrors({}); }}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${tab === t.id ? 'bg-navy-900 text-white' : 'text-navy-500 hover:bg-navy-50'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {loading && !data ? <Spinner /> : !usable.length ? (
          <EmptyState title="No active accounts" message="Open an account, or contact support if yours is frozen." />
        ) : (
          <form onSubmit={submit} className="space-y-4 p-6" noValidate>
            <Select label={tab === 'deposit' ? 'Deposit into' : 'From account'} value={account.id} onChange={set('accountId')}>
              {usable.map((a) => <option key={a.id} value={a.id}>{a.accountType} {maskAccount(a.accountNumber)} · {inr(a.balance)}</option>)}
            </Select>
            {tab === 'transfer' && (
              <Input label="Recipient account number" inputMode="numeric" maxLength={10} value={form.to} onChange={set('to')} error={errors.to} placeholder="10 digits" />
            )}
            <Input label="Amount (₹)" inputMode="decimal" value={form.amount} onChange={set('amount')} error={errors.amount} placeholder="0.00" />
            <Input label="Note (optional)" maxLength={140} value={form.note} onChange={set('note')} />
            <Button type="submit" variant="accent" loading={busy} className="w-full">
              {tab === 'deposit' ? 'Deposit money' : tab === 'withdraw' ? 'Withdraw money' : 'Send money'}
            </Button>
            <p className="text-center text-xs text-navy-400">Money movement needs completed KYC verification. This is a simulation: no real money moves.</p>
          </form>
        )}
      </Card>
    </>
  );
}
