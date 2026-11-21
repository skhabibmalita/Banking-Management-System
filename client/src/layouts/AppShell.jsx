import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Landmark, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { initials } from '../utils/format.js';

export default function AppShell({ nav, label, logoutTo }) {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const signOut = async () => {
    await logout();
    toast.info('You have been signed out.');
    navigate(logoutTo, { replace: true });
  };

  // Hide admin pages this admin has no permission for (the server enforces it as well).
  const visible = nav.filter((i) => !i.permission || user?.permissions?.includes(i.permission));

  const sidebar = (
    <div className="flex h-full flex-col bg-navy-900 text-navy-100">
      <div className="flex items-center gap-2.5 px-6 py-6">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-white"><Landmark className="h-5 w-5" /></span>
        <div>
          <p className="font-extrabold leading-tight text-white">Northwind</p>
          <p className="text-xs text-navy-300">{label}</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3" aria-label={`${label} navigation`}>
        {visible.map(({ to, label: text, icon: Icon, end }) => (
          <NavLink
            key={to} to={to} end={end} onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
                isActive ? 'bg-navy-800 text-white shadow-[inset_3px_0_0_#22D3EE]' : 'text-navy-200 hover:bg-navy-800/60 hover:text-white'
              }`}
          >
            <Icon className="h-[18px] w-[18px]" />
            {text}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-navy-800 p-3">
        <button onClick={signOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-navy-200 hover:bg-navy-800/60 hover:text-white">
          <LogOut className="h-[18px] w-[18px]" /> Logout
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85%]">{sidebar}</aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-navy-100 bg-white/90 px-4 py-3 backdrop-blur sm:px-8">
          <button className="btn btn-ghost -ml-2 p-2 lg:hidden" onClick={() => setOpen((o) => !o)} aria-label="Toggle menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right leading-tight">
              <p className="text-sm font-bold">{user?.name}</p>
              <p className="text-xs text-navy-400">{user?.role === 'admin' ? user.adminRole : 'Customer'}</p>
            </div>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-navy-900 text-xs font-bold text-white">{initials(user?.name)}</span>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8"><Outlet /></main>
      </div>
    </div>
  );
}
