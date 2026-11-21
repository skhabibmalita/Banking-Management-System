import ResourcePage from '../../components/ResourcePage.jsx';
import { Badge } from '../../components/ui/index.jsx';
import { listAdminTransactions } from '../../services/dataService.js';
import { dateTime, inr } from '../../utils/format.js';

const columns = [
  { key: 'reference', label: 'Reference', render: (t) => <div><p className="font-semibold">{t.reference}</p><p className="text-xs text-navy-400">{t.customer?.name}</p></div> },
  { key: 'account', label: 'Account', render: (t) => <div><p>{t.account}</p>{t.counterparty && <p className="text-xs text-navy-400">to {t.counterparty}</p>}</div> },
  { key: 'type', label: 'Type', render: (t) => <span className="capitalize">{t.type}</span> },
  { key: 'amount', label: 'Amount', align: 'right', render: (t) => inr(t.amount) },
  { key: 'status', label: 'Status', render: (t) => <Badge>{t.status}</Badge> },
  { key: 'flagged', label: 'Flag', render: (t) => (t.flagged ? <Badge tone="red">Flagged</Badge> : null) },
  { key: 'date', label: 'Date', render: (t) => dateTime(t.date) },
];

export default function Transactions() {
  return <ResourcePage title="Transactions" subtitle="Monitor all money movement." load={listAdminTransactions} columns={columns}
    filter={{ key: 'type', label: 'Type', options: ['deposit', 'withdrawal', 'transfer'] }} />;
}
