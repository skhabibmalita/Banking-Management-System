import { useState } from 'react';
import ResourcePage from '../../components/ResourcePage.jsx';
import { Badge, Button, Input, Modal } from '../../components/ui/index.jsx';
import { listAdminAccounts, setAccountFrozen } from '../../services/dataService.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { dateOnly, inr } from '../../utils/format.js';

export default function Accounts() {
  const { user } = useAuth();
  const toast = useToast();
  const canFreeze = user.permissions.includes('accounts:freeze');
  const [target, setTarget] = useState(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const unfreezing = target?.status === 'frozen';
  const close = () => { setTarget(null); setReason(''); setReasonError(''); };

  const confirm = async () => {
    if (!unfreezing && reason.trim().length < 5) return setReasonError('Give a reason of at least 5 characters. It is kept in the audit log.');
    setBusy(true);
    try {
      await setAccountFrozen(target.id, !unfreezing, reason.trim());
      toast.success(`Account ${target.accountNumber} ${unfreezing ? 'unfrozen' : 'frozen'}. The customer was notified.`);
      setRefreshKey((k) => k + 1);
      close();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  const columns = [
    { key: 'accountNumber', label: 'Account', render: (a) => <div><p className="font-semibold">{a.accountNumber}</p><p className="text-xs capitalize text-navy-400">{a.accountType}</p></div> },
    { key: 'owner', label: 'Owner', render: (a) => (a.owner ? <div><p>{a.owner.name}</p><p className="text-xs text-navy-400">{a.owner.email}</p></div> : '—') },
    { key: 'balance', label: 'Balance', align: 'right', render: (a) => inr(a.balance) },
    { key: 'status', label: 'Status', render: (a) => <div><Badge>{a.status}</Badge>{a.status === 'frozen' && a.statusReason && <p className="mt-1 max-w-[220px] text-xs text-navy-400">{a.statusReason}</p>}</div> },
    { key: 'createdAt', label: 'Opened', render: (a) => dateOnly(a.createdAt) },
    ...(canFreeze ? [{
      key: 'actions', label: 'Action', align: 'right',
      render: (a) => a.status === 'closed' ? null : (
        <Button variant="outline" className="px-3 py-1.5" onClick={() => setTarget(a)}>{a.status === 'frozen' ? 'Unfreeze' : 'Freeze'}</Button>
      ),
    }] : []),
  ];

  return (
    <>
      <ResourcePage title="Accounts" subtitle="Freeze suspicious accounts or restore them after review." load={listAdminAccounts} columns={columns}
        refreshKey={refreshKey} filter={{ key: 'status', label: 'Status', options: ['active', 'frozen', 'closed'] }} />
      <Modal open={!!target} title={unfreezing ? 'Unfreeze account?' : 'Freeze account?'} onClose={close}>
        <div className="space-y-4">
          <p className="text-sm text-navy-600">{unfreezing ? 'The customer can transact again immediately.' : 'The customer will not be able to deposit, withdraw or send money until you unfreeze it.'}</p>
          {!unfreezing && <Input label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} error={reasonError} placeholder="For example: repeated rapid transfers" />}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={close}>Cancel</Button>
            <Button className="flex-1" loading={busy} onClick={confirm}>Confirm</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
