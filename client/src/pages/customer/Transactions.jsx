import { useState } from 'react';
import { Download, Search } from 'lucide-react';
import useAsync from '../../hooks/useAsync.js';
import useDebounced from '../../hooks/useDebounced.js';
import { downloadReceipt, getHistory } from '../../services/dataService.js';
import { Button, Card, ErrorState, PageHeader } from '../../components/ui/index.jsx';
import DataTable from '../../components/DataTable.jsx';
import Pagination from '../../components/Pagination.jsx';
import { txnColumns } from '../../components/TransactionsTable.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { saveBlob } from '../../utils/format.js';

export default function Transactions() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);

  // Search, filters and pagination all run on the server.
  const { data, loading, error, reload } = useAsync(
    () => getHistory({ q: dq, type, status, page, limit: 8 }),
    [dq, type, status, page]
  );

  const receipt = async (t) => {
    try {
      const { blob, name } = await downloadReceipt(t.id);
      saveBlob(blob, name || `receipt-${t.reference}.pdf`);
      toast.success('Receipt downloaded.');
    } catch (e) { toast.error(e.message); }
  };

  const columns = [
    ...txnColumns,
    {
      key: 'receipt', label: 'Receipt', align: 'right',
      render: (t) => (
        <Button variant="ghost" className="px-2 py-1.5" aria-label={`Download receipt ${t.reference}`}
          disabled={t.status !== 'completed'} onClick={() => receipt(t)}>
          <Download className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  const reset = (setter) => (e) => { setter(e.target.value); setPage(1); };

  return (
    <>
      <PageHeader title="Transactions" subtitle="Search and filter every deposit, withdrawal and transfer." />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-navy-100 p-4">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
            <input className="field pl-9" placeholder="Search by note or reference" aria-label="Search transactions" value={q} onChange={reset(setQ)} />
          </div>
          <select className="field w-auto" aria-label="Type" value={type} onChange={reset(setType)}>
            <option value="all">All types</option><option value="deposit">Deposits</option><option value="withdrawal">Withdrawals</option><option value="transfer">Transfers</option>
          </select>
          <select className="field w-auto" aria-label="Status" value={status} onChange={reset(setStatus)}>
            <option value="all">All statuses</option><option value="completed">Completed</option><option value="pending">Pending</option><option value="failed">Failed</option>
          </select>
        </div>
        {error ? <ErrorState message={error} onRetry={reload} />
          : <DataTable columns={columns} rows={data?.items} loading={loading} emptyTitle="No matching transactions" emptyMessage="Try clearing your search or filters." />}
        {!loading && !error && <Pagination meta={data?.meta} onPage={setPage} />}
      </Card>
    </>
  );
}
