import { useState } from 'react';
import { Plus, Wallet, Landmark, Briefcase } from 'lucide-react';
import useAsync from '../../hooks/useAsync.js';
import { closeAccount, createAccount, getAccounts } from '../../services/dataService.js';
import { Badge, Button, Card, EmptyState, ErrorState, Modal, PageHeader, Select, Spinner } from '../../components/ui/index.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { dateOnly, inr } from '../../utils/format.js';

const icons = { savings: Wallet, current: Landmark, salary: Briefcase };

export default function Accounts() {
  const { data, loading, error, reload, setData } = useAsync(getAccounts, []);
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('savings');
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(null);

  const open_ = async () => {
    setBusy(true);
    try {
      const acc = await createAccount(type);
      setData([acc, ...data]);
      toast.success(`${type[0].toUpperCase() + type.slice(1)} account ${acc.accountNumber} opened.`);
      setOpen(false);
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  const close = async () => {
    setBusy(true);
    try {
      const updated = await closeAccount(closing.id);
      setData(data.map((a) => (a.id === closing.id ? updated : a)));
      toast.success(`Account ${closing.accountNumber} closed.`);
      setClosing(null);
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="My accounts" subtitle="Open new accounts and review the ones you have."
        actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Open account</Button>} />

      {loading ? <Spinner /> : error ? <Card><ErrorState message={error} onRetry={reload} /></Card>
        : !data.length ? <Card><EmptyState title="No accounts yet" message="Open your first savings, current or salary account." /></Card>
        : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.map((a) => {
              const Icon = icons[a.accountType];
              return (
                <Card key={a.id} className="p-5">
                  <div className="flex items-start justify-between">
                    <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-soft text-brand"><Icon className="h-5 w-5" /></span>
                    <Badge>{a.status}</Badge>
                  </div>
                  <p className="mt-4 text-sm font-semibold capitalize text-navy-500">{a.accountType} account</p>
                  <p className="mt-1 text-2xl font-extrabold">{inr(a.balance)}</p>
                  <dl className="mt-4 space-y-1 text-sm">
                    <div className="flex justify-between"><dt className="text-navy-400">Account number</dt><dd className="font-semibold">{a.accountNumber}</dd></div>
                    <div className="flex justify-between"><dt className="text-navy-400">Opened</dt><dd className="font-semibold">{dateOnly(a.createdAt)}</dd></div>
                  </dl>
                  {a.status === 'active' && <Button variant="outline" className="mt-4 w-full" onClick={() => setClosing(a)}>Close account</Button>}
                  {a.status === 'frozen' && <p className="mt-4 text-xs text-navy-500">Frozen by the bank. Contact support to resolve this.</p>}
                </Card>
              );
            })}
          </div>
        )}

      <Modal open={open} title="Open a new account" onClose={() => setOpen(false)}>
        <div className="space-y-4">
          <Select label="Account type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="savings">Savings</option><option value="current">Current</option><option value="salary">Salary</option>
          </Select>
          <p className="text-xs text-navy-500">A unique account number is generated for you. New accounts start with a zero balance.</p>
          <Button className="w-full" loading={busy} onClick={open_}>Open account</Button>
        </div>
      </Modal>

      <Modal open={!!closing} title="Close this account?" onClose={() => setClosing(null)}>
        <p className="text-sm text-navy-600">Account {closing?.accountNumber} will be closed. Move any remaining balance first. This cannot be undone.</p>
        <div className="mt-5 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setClosing(null)}>Keep account</Button>
          <Button variant="danger" className="flex-1" loading={busy} onClick={close}>Close account</Button>
        </div>
      </Modal>
    </>
  );
}
