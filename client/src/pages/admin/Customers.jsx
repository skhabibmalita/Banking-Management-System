import ResourcePage from '../../components/ResourcePage.jsx';
import { Badge } from '../../components/ui/index.jsx';
import { listAdminCustomers } from '../../services/dataService.js';
import { dateOnly } from '../../utils/format.js';

const columns = [
  { key: 'name', label: 'Customer', render: (c) => <div><p className="font-semibold">{c.name}</p><p className="text-xs text-navy-400">{c.email}</p></div> },
  { key: 'phone', label: 'Phone' },
  { key: 'accounts', label: 'Open accounts' },
  { key: 'kycStatus', label: 'KYC', render: (c) => <Badge>{c.kycStatus}</Badge> },
  { key: 'joined', label: 'Joined', render: (c) => dateOnly(c.joined) },
];

export default function Customers() {
  return <ResourcePage title="Customers" subtitle="Everyone registered with the bank." load={listAdminCustomers} columns={columns}
    filter={{ key: 'kycStatus', label: 'KYC', options: ['verified', 'pending', 'rejected'] }} />;
}
