import { useState } from 'react';
import { KeyRound, UserPlus } from 'lucide-react';
import useAsync from '../../hooks/useAsync.js';
import { createAdmin, listAdmins, resetAdminPassword, updateAdmin } from '../../services/dataService.js';
import { Badge, Button, Card, ErrorState, Input, Modal, PageHeader, Select } from '../../components/ui/index.jsx';
import DataTable from '../../components/DataTable.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';

const roles = { superadmin: 'Full access', kyc_officer: 'KYC review', operations: 'Accounts, transactions, fraud, reports', auditor: 'Read-only, including audit logs' };

export default function AdminManagement() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useAsync(listAdmins, []);
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', email: '', role: 'kyc_officer' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState(null); // { who, password }, shown once

  const add = async () => {
    const e = {};
    if (f.name.trim().length < 2) e.name = 'Enter a name.';
    if (!/^\S+@\S+\.\S+$/.test(f.email)) e.email = 'Enter a valid email address.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const res = await createAdmin(f);
      setSecret({ who: res.admin.email, password: res.temporaryPassword });
      setF({ name: '', email: '', role: 'kyc_officer' }); setOpen(false);
      reload();
    } catch (err) {
      if (err.code === 'EMAIL_TAKEN') setErrors({ email: err.message }); else toast.error(err.message);
    } finally { setBusy(false); }
  };

  const toggle = async (u) => {
    try { await updateAdmin(u.id, { isActive: !u.isActive }); toast.success(`${u.name} ${u.isActive ? 'deactivated and signed out' : 'reactivated'}.`); reload(); }
    catch (e) { toast.error(e.message); }
  };
  const reset = async (u) => {
    try { const res = await resetAdminPassword(u.id); setSecret({ who: u.email, password: res.temporaryPassword }); }
    catch (e) { toast.error(e.message); }
  };

  const columns = [
    { key: 'name', label: 'Admin', render: (u) => <div><p className="font-semibold">{u.name}</p><p className="text-xs text-navy-400">{u.email}</p></div> },
    { key: 'role', label: 'Role', render: (u) => <div><p className="font-semibold capitalize">{u.role.replace('_', ' ')}</p><p className="text-xs text-navy-400">{roles[u.role]}</p></div> },
    { key: 'isActive', label: 'Status', render: (u) => <Badge tone={u.isActive ? 'green' : 'slate'}>{u.isActive ? 'Active' : 'Inactive'}</Badge> },
    {
      key: 'actions', label: 'Actions', align: 'right',
      render: (u) => u.id === user.id ? <span className="text-xs text-navy-400">You</span> : (
        <div className="flex justify-end gap-2">
          <Button variant="outline" className="px-3 py-1.5" onClick={() => reset(u)}><KeyRound className="h-4 w-4" /> Reset password</Button>
          <Button variant="outline" className="px-3 py-1.5" onClick={() => toggle(u)}>{u.isActive ? 'Deactivate' : 'Reactivate'}</Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Admin management" subtitle="Control who can sign in to the admin console and what they can do."
        actions={<Button onClick={() => setOpen(true)}><UserPlus className="h-4 w-4" /> Add admin</Button>} />
      <Card>{error ? <ErrorState message={error} onRetry={reload} /> : <DataTable columns={columns} rows={data} loading={loading} />}</Card>

      <Modal open={open} title="Add an admin" onClose={() => setOpen(false)}>
        <div className="space-y-4">
          <Input label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={errors.name} />
          <Input label="Email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={errors.email} />
          <Select label="Role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            {Object.keys(roles).filter((r) => r !== 'superadmin' || user.adminRole === 'superadmin').map((r) => <option key={r} value={r}>{r.replace('_', ' ')} · {roles[r]}</option>)}
          </Select>
          <p className="text-xs text-navy-500">A one-time temporary password is generated. Share it securely.</p>
          <Button className="w-full" loading={busy} onClick={add}>Add admin</Button>
        </div>
      </Modal>

      <Modal open={!!secret} title="Temporary password" onClose={() => setSecret(null)}>
        <p className="text-sm text-navy-600">For <b>{secret?.who}</b>. This is shown only once and is not stored anywhere readable. Share it securely and ask them to change it after signing in.</p>
        <code className="mt-4 block select-all rounded-lg bg-navy-50 px-4 py-3 text-center text-lg font-bold tracking-wide">{secret?.password}</code>
        <Button className="mt-5 w-full" onClick={() => setSecret(null)}>Done</Button>
      </Modal>
    </>
  );
}
