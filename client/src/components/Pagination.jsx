import { Button } from './ui/index.jsx';

// meta comes straight from the API: { page, pages, total }.
export default function Pagination({ meta, onPage }) {
  if (!meta || meta.pages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-navy-100 px-5 py-3 text-sm">
      <span className="text-navy-500">Page {meta.page} of {meta.pages} · {meta.total} total</span>
      <div className="flex gap-2">
        <Button variant="outline" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>Previous</Button>
        <Button variant="outline" disabled={meta.page >= meta.pages} onClick={() => onPage(meta.page + 1)}>Next</Button>
      </div>
    </div>
  );
}
