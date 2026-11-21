import {
  LayoutDashboard, User, Wallet, ArrowLeftRight, Send, ShieldCheck, Bell, Settings,
  Users, Landmark, ListChecks, FileCheck2, Siren, UserCog, BarChart3, ScrollText,
} from 'lucide-react';

export const customerNav = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/profile', label: 'My Profile', icon: User },
  { to: '/app/accounts', label: 'My Accounts', icon: Wallet },
  { to: '/app/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/app/transfer', label: 'Transfer Money', icon: Send },
  { to: '/app/kyc', label: 'KYC Verification', icon: ShieldCheck },
  { to: '/app/notifications', label: 'Notifications', icon: Bell },
  { to: '/app/settings', label: 'Settings', icon: Settings },
];

export const adminNav = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/customers', permission: 'customers:read', label: 'Customers', icon: Users },
  { to: '/admin/accounts', permission: 'accounts:read', label: 'Accounts', icon: Landmark },
  { to: '/admin/transactions', permission: 'transactions:read', label: 'Transactions', icon: ListChecks },
  { to: '/admin/kyc', permission: 'kyc:review', label: 'KYC Management', icon: FileCheck2 },
  { to: '/admin/fraud', permission: 'fraud:read', label: 'Fraud Monitoring', icon: Siren },
  { to: '/admin/admins', permission: 'admins:manage', label: 'Admin Management', icon: UserCog },
  { to: '/admin/reports', permission: 'reports:read', label: 'Reports', icon: BarChart3 },
  { to: '/admin/audit-logs', permission: 'audit:read', label: 'Audit Logs', icon: ScrollText },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];
