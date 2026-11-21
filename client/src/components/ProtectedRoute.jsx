import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Spinner } from './ui/index.jsx';

// Frontend guard only (UX). The backend re-checks every request.
export default function ProtectedRoute({ role }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="min-h-screen"><Spinner /></div>;
  if (!user) return <Navigate to={role === 'admin' ? '/admin/login' : '/login'} state={{ from: location }} replace />;
  if (user.role !== role) return <Navigate to={user.role === 'admin' ? '/admin' : '/app'} replace />;
  return <Outlet />;
}
