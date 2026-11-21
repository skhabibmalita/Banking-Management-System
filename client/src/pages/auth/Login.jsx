import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '../../layouts/AuthLayout.jsx';
import { Button, Input } from '../../components/ui/index.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';

const emailOk = (v) => /^\S+@\S+\.\S+$/.test(v);

// Shared by customer and admin sign-in; role decides copy and destination.
export function LoginForm({ role }) {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const next = {};
    if (!emailOk(form.email)) next.email = 'Enter a valid email address.';
    if (form.password.length < 8) next.password = 'Password must be at least 8 characters.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setLoading(true);
    try {
      await login({ ...form, role });
      toast.success('Welcome back.');
      navigate(location.state?.from?.pathname || (role === 'admin' ? '/admin' : '/app'), { replace: true });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Input label="Email" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} placeholder="you@example.com" />
      <Input label="Password" type="password" autoComplete="current-password" value={form.password} onChange={set('password')} error={errors.password} />
      <Button type="submit" loading={loading} className="w-full">Sign in</Button>
    </form>
  );
}

export default function Login() {
  return (
    <AuthLayout
      title="Sign in"
      subtitle="Access your accounts, transfers and statements."
      footer={<>New to Northwind? <Link to="/register" className="font-semibold text-brand">Open an account</Link> · <Link to="/admin/login" className="font-semibold text-navy-700">Admin sign-in</Link></>}
    >
      <LoginForm role="customer" />
    </AuthLayout>
  );
}
