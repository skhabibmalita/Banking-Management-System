import { useState } from 'react';
import { Search } from 'lucide-react';
import useAsync from '../hooks/useAsync.js';
import useDebounced from '../hooks/useDebounced.js';
import { Card, PageHeader, ErrorState } from './ui/index.jsx';
import DataTable from './DataTable.jsx';
import Pagination from './Pagination.jsx';

// A list page driven by the server: search, one filter and pagination all become query parameters.
// load({ q, [filter.key], page, limit }) must return { items, meta }. Bump refreshKey to reload.
export default function ResourcePage({ title, subtitle, load, columns, filter, actions, emptyTitle, refreshKey = 0 }) {
  const [q, setQ] = useState('');
  const [f, setF] = useState('all');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);

  const { data, loading, error, reload } = useAsync(
    () => load({ q: dq, ...(filter && f !== 'all' ? { [filter.key]: f } : {}), page, limit: 10 }),
    [dq, f, page, refreshKey]
  );

  return (
    <>
      <PageHeader title={title} subtitle={subtitle} actions={actions} />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-navy-100 p-4">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
            <input className="field pl-9" placeholder="Search" aria-label="Search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
          {filter && (
            <select className="field w-auto" aria-label={filter.label} value={f} onChange={(e) => { setF(e.target.value); setPage(1); }}>
              <option value="all">{filter.label}: all</option>
              {filter.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          )}
        </div>
        {error ? <ErrorState message={error} onRetry={reload} />
          : <DataTable columns={columns} rows={data?.items} loading={loading} emptyTitle={emptyTitle || 'No results'} emptyMessage="Try a different search or filter." />}
        {!loading && !error && <Pagination meta={data?.meta} onPage={setPage} />}
      </Card>
    </>
  );
}
