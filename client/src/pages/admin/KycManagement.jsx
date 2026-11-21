import { useState } from 'react';
import { Check, Download, X } from 'lucide-react';
import useAsync from '../../hooks/useAsync.js';
import { decideKyc, downloadKycFile, listKycQueue } from '../../services/dataService.js';
import { Badge, Button, Card, ErrorState, Input, Modal, PageHeader } from '../../components/ui/index.jsx';
import DataTable from '../../components/DataTable.jsx';
import Pagination from '../../components/Pagination.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { dateTime, docTypeLabel, saveBlob } from '../../utils/format.js';

export default function KycManagement() {
  const { user } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useAsync(() => listKycQueue({ status, page, limit: 10 }), [status, page]);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [busy, setBusy] = useState(false);
  const canReview = user.permissions.includes('kyc:review');

  const approve = async (row) => {
    try { await decideKyc(row.id, 'approve'); toast.success(`${row.customer?.name}'s KYC approved.`); reload(); }
    catch (e) { toast.error(e.message); }
  };
  const reject = async () => {
    if (reason.trim().length < 5) return setReasonError('Give the customer a reason of at least 5 characters.');
    setBusy(true);
    try {
      await decideKyc(rejecting.id, 'reject', reason.trim());
      toast.success(`${rejecting.customer?.name}'s KYC rejected.`);
      setRejecting(null); setReason(''); setReasonError('');
      reload();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  const view = async (row) => {
    try { const { blob, name } = await downloadKycFile(row.id); saveBlob(blob, name || row.fileName); }
    catch (e) { toast.error(e.message); }
  };

  const columns = [
    { key: 'customer', label: 'Customer', render: (r) => <div><p className="font-semibold">{r.customer?.name}</p><p className="text-xs text-navy-400">{r.customer?.email}</p></div> },
    { key: 'docType', label: 'Document', render: (r) => <div><p>{docTypeLabel(r.docType)}</p><p className="text-xs text-navy-400">{r.fileName}</p></div> },
    { key: 'submittedAt', label: 'Submitted', render: (r) => dateTime(r.submittedAt) },
    { key: 'status', label: 'Status', render: (r) => <div><Badge>{r.status}</Badge>{r.reviewedBy && <p className="mt-1 text-xs text-navy-400">by {r.reviewedBy}</p>}</div> },
    {
      key: 'actions', label: 'Actions', align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" className="px-2 py-1.5" aria-label="Download document" onClick={() => view(r)}><Download className="h-4 w-4" /></Button>
          {canReview && r.status === 'pending' && (
            <>
              <Button variant="outline" className="px-3 py-1.5" onClick={() => approve(r)}><Check className="h-4 w-4" /> Approve</Button>
              <Button variant="outline" className="px-3 py-1.5" onClick={() => setRejecting(r)}><X className="h-4 w-4" /> Reject</Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="KYC management" subtitle="Review identity documents and approve or reject applications."
        actions={
          <select className="field w-auto" aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
          </select>
        } />
      <Card>
        {error ? <ErrorState message={error} onRetry={reload} />
          : <DataTable columns={columns} rows={data?.items} loading={loading} emptyTitle="No applications here" emptyMessage={status === 'pending' ? 'The review queue is empty.' : undefined} />}
        {!loading && !error && <Pagination meta={data?.meta} onPage={setPage} />}
      </Card>
      <Modal open={!!rejecting} title={`Reject ${rejecting?.customer?.name}'s KYC`} onClose={() => setRejecting(null)}>
        <div className="space-y-4">
          <Input label="Reason shown to the customer" value={reason} onChange={(e) => setReason(e.target.value)} error={reasonError} placeholder="For example: document is blurry" />
          <Button variant="danger" className="w-full" loading={busy} onClick={reject}>Reject application</Button>
        </div>
      </Modal>
    </>
  );
}
