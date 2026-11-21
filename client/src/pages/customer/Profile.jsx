import { useEffect, useState } from 'react';
import useAsync from '../../hooks/useAsync.js';
import { getProfile, updateProfile } from '../../services/dataService.js';
import { Badge, Button, Card, ErrorState, Input, PageHeader, Spinner } from '../../components/ui/index.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { dateOnly, initials } from '../../utils/format.js';

export default function Profile() {
  const { data, loading, error, reload, setData } = useAsync(getProfile, []);
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (data) setForm({ name: data.name, phone: data.phone, address: data.address }); }, [data]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (ev) => {
    ev.preventDefault();
    const e = {};
    if (form.name.trim().length < 2) e.name = 'Enter your full name.';
    if (!/^\+?[0-9 ]{10,14}$/.test(form.phone)) e.phone = 'Enter a 10 to 14 digit phone number.';
    if (form.address.trim().length < 8) e.address = 'Enter your full address.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      setData(await updateProfile(form));
      toast.success('Profile saved.');
      setEditing(false);
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  if (loading) return <Spinner />;
  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>;

  return (
    <>
      <PageHeader title="My profile" subtitle="Your email and date of birth are locked, and your name locks once KYC is verified."
        actions={!editing && <Button variant="outline" onClick={() => setEditing(true)}>Edit profile</Button>} />
      <Card className="max-w-2xl p-6">
        <div className="mb-6 flex items-center gap-4">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-navy-900 text-lg font-bold text-white">{initials(data.name)}</span>
          <div>
            <p className="text-lg font-bold">{data.name}</p>
            <div className="mt-1 flex items-center gap-2 text-sm text-navy-500">KYC status <Badge>{data.kycStatus}</Badge></div>
          </div>
        </div>
        {editing ? (
          <form onSubmit={save} className="space-y-4" noValidate>
            <Input label="Full name" value={form.name} onChange={set('name')} error={errors.name}
              disabled={data.kycStatus === 'verified'} hint={data.kycStatus === 'verified' ? 'Locked after KYC verification. Contact support to change it.' : undefined} />
            <Input label="Phone" value={form.phone} onChange={set('phone')} error={errors.phone} />
            <Input label="Address" value={form.address} onChange={set('address')} error={errors.address} />
            <div className="flex gap-2">
              <Button type="submit" loading={busy}>Save changes</Button>
              <Button type="button" variant="outline" onClick={() => { setEditing(false); setErrors({}); }}>Cancel</Button>
            </div>
          </form>
        ) : (
          <dl className="grid gap-4 sm:grid-cols-2">
            {[['Email', data.email], ['Phone', data.phone], ['Date of birth', dateOnly(data.dob)], ['Address', data.address]].map(([k, v]) => (
              <div key={k} className={k === 'Address' ? 'sm:col-span-2' : ''}>
                <dt className="text-sm text-navy-400">{k}</dt><dd className="mt-0.5 font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>
    </>
  );
}
