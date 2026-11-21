import { useState } from 'react';
import { FileText, UploadCloud } from 'lucide-react';
import useAsync from '../../hooks/useAsync.js';
import { getKyc, submitKyc } from '../../services/dataService.js';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Select, Spinner } from '../../components/ui/index.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { DOC_TYPES, dateTime } from '../../utils/format.js';

const MAX = 5 * 1024 * 1024;
const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png'];

export default function Kyc() {
  const { data, loading, error, reload } = useAsync(getKyc, []);
  const toast = useToast();
  const [docType, setDocType] = useState('aadhaar');
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [busy, setBusy] = useState(false);

  // Quick checks for a fast answer. The server checks the real file contents again.
  const pick = (e) => {
    const f = e.target.files[0];
    setFileError('');
    if (!f) return setFile(null);
    if (!ALLOWED.includes(f.type)) { setFile(null); return setFileError('Upload a PDF, JPG or PNG file.'); }
    if (f.size > MAX) { setFile(null); return setFileError('File is larger than 5 MB.'); }
    setFile(f);
  };

  const submit = async () => {
    if (!file) return setFileError('Choose a file to upload.');
    setBusy(true);
    try {
      await submitKyc(docType, file);
      setFile(null);
      toast.success('Document submitted for review.');
      reload();
    } catch (e) {
      if (e.code === 'INVALID_FILE_TYPE' || e.code === 'FILE_TOO_LARGE') setFileError(e.message);
      else toast.error(e.message);
    } finally { setBusy(false); }
  };

  if (loading && !data) return <Spinner />;
  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>;

  const copy = {
    verified: 'You are verified. All account features are unlocked.',
    rejected: data.rejectReason ? `Your last submission was rejected: ${data.rejectReason}` : 'Your last submission was rejected. Upload a clearer copy of a valid document.',
    pending: data.hasDocuments ? 'Your documents are waiting for review. This usually takes 1 to 2 business days.' : 'Upload an ID document to start verification.',
  };

  return (
    <>
      <PageHeader title="KYC verification" subtitle="Verify your identity to unlock deposits, withdrawals and transfers." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2"><h2 className="font-bold">Status</h2><Badge>{data.status}</Badge></div>
          <p className="mb-6 text-sm text-navy-600">{copy[data.status]}</p>
          {data.status !== 'verified' && (
            <div className="space-y-4">
              <Select label="Document type" value={docType} onChange={(e) => setDocType(e.target.value)}>
                {Object.entries(DOC_TYPES).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </Select>
              <label className="grid cursor-pointer place-items-center rounded-xl border-2 border-dashed border-navy-200 px-4 py-8 text-center hover:border-brand">
                <UploadCloud className="h-7 w-7 text-brand" />
                <span className="mt-2 text-sm font-semibold">{file ? file.name : 'Choose a file'}</span>
                <span className="text-xs text-navy-400">PDF, JPG or PNG, up to 5 MB</span>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="sr-only" onChange={pick} />
              </label>
              {fileError && <p className="text-xs font-medium text-red-600" role="alert">{fileError}</p>}
              <Button className="w-full" loading={busy} onClick={submit}>Submit for review</Button>
            </div>
          )}
        </Card>
        <Card>
          <h2 className="p-6 pb-2 font-bold">Submitted documents</h2>
          {!data.documents.length ? <EmptyState title="No documents yet" message="Upload an ID document to start verification." /> : (
            <ul className="divide-y divide-navy-100">
              {data.documents.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-6 py-4">
                  <FileText className="h-5 w-5 text-navy-300" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{DOC_TYPES[d.docType] || d.docType}</p>
                    <p className="truncate text-xs text-navy-400">{d.fileName} · {dateTime(d.uploadedAt)}</p>
                    {d.status === 'rejected' && d.rejectReason && <p className="text-xs text-red-600">{d.rejectReason}</p>}
                  </div>
                  <Badge>{d.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
