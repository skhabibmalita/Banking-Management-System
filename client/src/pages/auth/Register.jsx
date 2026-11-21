import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../../layouts/AuthLayout.jsx';
import { Button, Input } from '../../components/ui/index.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';

export default function Register() {
  const { register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [f, setF] = useState({ name: '', email: '', phone: '', dob: '', address: '', password: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const validate = () => {
    const e = {};
    if (f.name.trim().length < 2) e.name = 'Enter your full name.';
    if (!/^\S+@\S+\.\S+$/.test(f.email)) e.email = 'Enter a valid email address.';
    if (!/^\+?[0-9 ]{10,14}$/.test(f.phone)) e.phone = 'Enter a 10 to 14 digit phone number.';
    if (!f.dob) e.dob = 'Enter your date of birth.';
    else if ((Date.now() - new Date(f.dob)) / 31557600000 < 18) e.dob = 'You must be at least 18 years old.';
    if (f.address.trim().length < 8) e.address = 'Enter your full address.';
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(f.password)) e.password = 'Use 8+ characters with letters and numbers.';
    return e;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setLoading(true);
    try {
      await register(f);
      toast.success('Account created. Complete KYC to unlock transfers.');
      navigate('/app/kyc', { replace: true });
    } catch (err) {
      // Show the server's field-level messages next to the fields they belong to.
      if (err.details?.length) {
        setErrors(Object.fromEntries(err.details.map((d) => [d.path, d.message])));
        toast.error('Please fix the highlighted fields.');
      } else {
        toast.error(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Open your account" subtitle="It takes about two minutes." footer={<>Already a customer? <Link to="/login" className="font-semibold text-brand">Sign in</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Input label="Full name" value={f.name} onChange={set('name')} error={errors.name} autoComplete="name" />
        <Input label="Email" type="email" value={f.email} onChange={set('email')} error={errors.email} autoComplete="email" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Phone" value={f.phone} onChange={set('phone')} error={errors.phone} autoComplete="tel" />
          <Input label="Date of birth" type="date" value={f.dob} onChange={set('dob')} error={errors.dob} />
        </div>
        <Input label="Address" value={f.address} onChange={set('address')} error={errors.address} autoComplete="street-address" />
        <Input label="Password" type="password" value={f.password} onChange={set('password')} error={errors.password} autoComplete="new-password" hint="At least 8 characters, with letters and numbers." />
        <Button type="submit" loading={loading} className="w-full">Create account</Button>
      </form>
    </AuthLayout>
  );
}
