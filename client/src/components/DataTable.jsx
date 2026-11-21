import { Spinner, EmptyState } from './ui/index.jsx';

// columns: [{ key, label, render?(row), align? }]
export default function DataTable({ columns, rows, loading, emptyTitle = 'Nothing here yet', emptyMessage }) {
  if (loading) return <Spinner />;
  if (!rows?.length) return <EmptyState title={emptyTitle} message={emptyMessage} />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-navy-100 text-navy-500">
            {columns.map((c) => (
              <th key={c.key} className={`px-5 py-3 font-semibold ${c.align === 'right' ? 'text-right' : ''}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || i} className="border-b border-navy-50 last:border-0 hover:bg-navy-50/60">
              {columns.map((c) => (
                <td key={c.key} className={`px-5 py-3.5 ${c.align === 'right' ? 'text-right' : ''}`}>
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
