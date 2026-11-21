import AppShell from './AppShell.jsx';
import { adminNav } from '../utils/navigation.js';

export default function AdminLayout() {
  return <AppShell nav={adminNav} label="Admin console" logoutTo="/admin/login" />;
}
