import { useState } from 'react';
import { Button, Card, Input } from './ui/index.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { changePassword } from '../services/dataService.js';

// Shared by the customer and admin settings pages. Other devices are signed out by the server.
export default function ChangePasswordCard({ realm }) {
  const toast = useToast();
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (ev) => {
    ev.preventDefault();
    const e = {};
    if (!f.current) e.current = 'Enter your current password.';
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(f.next)) e.next = 'Use 8+ characters with letters and numbers.';
    if (f.next !== f.confirm) e.confirm = 'Passwords do not match.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await changePassword(realm, { currentPassword: f.current, newPassword: f.next });
      setF({ current: '', next: '', confirm: '' });
      toast.success('Password updated. Other devices were signed out.');
    } catch (err) {
      if (err.code === 'WRONG_PASSWORD') setErrors({ current: err.message });
      else toast.error(err.details?.[0]?.message || err.message);
    } finally { setBusy(false); }
  };

  return (
    <Card className="max-w-lg p-6">
      <h2 className="mb-4 font-bold">Change password</h2>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Input label="Current password" type="password" autoComplete="current-password" value={f.current} onChange={set('current')} error={errors.current} />
        <Input label="New password" type="password" autoComplete="new-password" value={f.next} onChange={set('next')} error={errors.next} />
        <Input label="Confirm new password" type="password" autoComplete="new-password" value={f.confirm} onChange={set('confirm')} error={errors.confirm} />
        <Button type="submit" loading={busy}>Update password</Button>
      </form>
    </Card>
  );
}
