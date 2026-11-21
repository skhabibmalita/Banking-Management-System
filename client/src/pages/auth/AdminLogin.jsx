import { Link } from 'react-router-dom';
import AuthLayout from '../../layouts/AuthLayout.jsx';
import { LoginForm } from './Login.jsx';

export default function AdminLogin() {
  return (
    <AuthLayout
      title="Admin sign-in"
      subtitle="For authorised bank staff. Admin accounts are created by a super admin."
      footer={<Link to="/login" className="font-semibold text-brand">Back to customer sign-in</Link>}
    >
      <LoginForm role="admin" />
    </AuthLayout>
  );
}
