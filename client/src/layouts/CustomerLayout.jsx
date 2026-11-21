import AppShell from './AppShell.jsx';
import { customerNav } from '../utils/navigation.js';

export default function CustomerLayout() {
  return <AppShell nav={customerNav} label="Online banking" logoutTo="/login" />;
}
