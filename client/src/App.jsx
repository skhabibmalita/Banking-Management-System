import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import CustomerLayout from './layouts/CustomerLayout.jsx';
import AdminLayout from './layouts/AdminLayout.jsx';

import Login from './pages/auth/Login.jsx';
import Register from './pages/auth/Register.jsx';
import AdminLogin from './pages/auth/AdminLogin.jsx';
import NotFound from './pages/NotFound.jsx';

import Dashboard from './pages/customer/Dashboard.jsx';
import Profile from './pages/customer/Profile.jsx';
import Accounts from './pages/customer/Accounts.jsx';
import Transactions from './pages/customer/Transactions.jsx';
import Transfer from './pages/customer/Transfer.jsx';
import Kyc from './pages/customer/Kyc.jsx';
import Notifications from './pages/customer/Notifications.jsx';
import Settings from './pages/customer/Settings.jsx';

import Overview from './pages/admin/Overview.jsx';
import AdminCustomers from './pages/admin/Customers.jsx';
import AdminAccounts from './pages/admin/Accounts.jsx';
import AdminTransactions from './pages/admin/Transactions.jsx';
import KycManagement from './pages/admin/KycManagement.jsx';
import Fraud from './pages/admin/Fraud.jsx';
import AdminManagement from './pages/admin/AdminManagement.jsx';
import Reports from './pages/admin/Reports.jsx';
import AuditLogs from './pages/admin/AuditLogs.jsx';
import AdminSettings from './pages/admin/AdminSettings.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/admin/login" element={<AdminLogin />} />

      <Route element={<ProtectedRoute role="customer" />}>
        <Route path="/app" element={<CustomerLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="profile" element={<Profile />} />
          <Route path="accounts" element={<Accounts />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="transfer" element={<Transfer />} />
          <Route path="kyc" element={<Kyc />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute role="admin" />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Overview />} />
          <Route path="customers" element={<AdminCustomers />} />
          <Route path="accounts" element={<AdminAccounts />} />
          <Route path="transactions" element={<AdminTransactions />} />
          <Route path="kyc" element={<KycManagement />} />
          <Route path="fraud" element={<Fraud />} />
          <Route path="admins" element={<AdminManagement />} />
          <Route path="reports" element={<Reports />} />
          <Route path="audit-logs" element={<AuditLogs />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
