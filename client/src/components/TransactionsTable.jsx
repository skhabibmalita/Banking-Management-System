import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { Badge } from './ui/index.jsx';
import DataTable from './DataTable.jsx';
import { inr, dateTime } from '../utils/format.js';

export const txnColumns = [
  {
    key: 'description', label: 'Transaction',
    render: (t) => (
      <div className="flex items-center gap-3">
        <span className={`grid h-9 w-9 place-items-center rounded-full ${t.direction === 'credit' ? 'bg-emerald-50 text-emerald-600' : 'bg-navy-50 text-navy-600'}`}>
          {t.direction === 'credit' ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
        </span>
        <div>
          <p className="font-semibold">{t.description}</p>
          <p className="text-xs capitalize text-navy-400">{t.type} · {t.reference}</p>
        </div>
      </div>
    ),
  },
  { key: 'date', label: 'Date', render: (t) => dateTime(t.date) },
  { key: 'status', label: 'Status', render: (t) => <Badge>{t.status}</Badge> },
  {
    key: 'amount', label: 'Amount', align: 'right',
    render: (t) => (
      <span className={`font-bold ${t.direction === 'credit' ? 'text-emerald-600' : ''}`}>
        {t.direction === 'credit' ? '+' : '−'}{inr(t.amount)}
      </span>
    ),
  },
];

export default function TransactionsTable({ rows, loading }) {
  return <DataTable columns={txnColumns} rows={rows} loading={loading} emptyTitle="No transactions yet" emptyMessage="Deposits, withdrawals and transfers will show up here." />;
}
