import { useState } from 'react';
import useAsync from '../../hooks/useAsync.js';
import { listFraud, reviewFraud } from '../../services/dataService.js';
import { Badge, Button, Card, EmptyState, ErrorState, Input, Modal, PageHeader, Spinner } from '../../components/ui/index.jsx';
import Pagination from '../../components/Pagination.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { dateTime, inr } from '../../utils/format.js';

export default function Fraud() {
  const { user } = useAuth();
  const toast = useToast();
  const [reviewed, setReviewed] = useState('false');
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useAsync(() => listFraud({ reviewed, page, limit: 10 }), [reviewed, page]);
  const [target, setTarget] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const canReview = user.permissions.includes('fraud:review');

  const submit = async () => {
    setBusy(true);
    try {
      await reviewFraud(target.id, note.trim());
      toast.success(`Alert for ${target.reference} marked as reviewed.`);
      setTarget(null); setNote('');
      reload();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Fraud monitoring" subtitle="Transactions flagged by rule-based checks. Flags never block money; they ask for a human look."
        actions={
          <select className="field w-auto" aria-label="Show" value={reviewed} onChange={(e) => { setReviewed(e.target.value); setPage(1); }}>
            <option value="false">Open alerts</option><option value="true">Reviewed</option>
          </select>
        } />
      <Card>
        {loading && !data ? <Spinner /> : error ? <ErrorState message={error} onRetry={reload} />
          : !data.items.length ? <EmptyState title={reviewed === 'true' ? 'Nothing reviewed yet' : 'No open alerts'} message="New suspicious activity will appear here." />
          : (
            <ul className="divide-y divide-navy-100">
              {data.items.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <Badge>{a.severity}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{a.reasons.join(' · ')} <span className="font-normal text-navy-400">· {a.reference}</span></p>
                    <p className="text-sm text-navy-600 capitalize">{a.type} of {inr(a.amount)} on account {a.account} ({a.customer?.name})</p>
                    <p className="mt-0.5 text-xs text-navy-400">{dateTime(a.date)}</p>
                    {a.reviewed && <p className="mt-1 text-xs text-navy-500">Reviewed by {a.reviewedBy}{a.reviewNote ? `: ${a.reviewNote}` : ''}</p>}
                  </div>
                  {canReview && !a.reviewed && <Button variant="outline" onClick={() => setTarget(a)}>Mark reviewed</Button>}
                </li>
              ))}
            </ul>
          )}
        {!loading && !error && <Pagination meta={data?.meta} onPage={setPage} />}
      </Card>
      <Modal open={!!target} title="Mark alert as reviewed" onClose={() => setTarget(null)}>
        <div className="space-y-4">
          <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you find?" maxLength={200} />
          <Button className="w-full" loading={busy} onClick={submit}>Confirm review</Button>
        </div>
      </Modal>
    </>
  );
}
