import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button, Card, Input, PageHeader, Select } from '../../components/ui/index.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { downloadReport } from '../../services/dataService.js';
import { saveBlob } from '../../utils/format.js';

const reports = {
  transactions: 'Transaction report',
  'daily-summary': 'Daily summary',
  customers: 'Customer and KYC summary',
};

const iso = (d) => d.toISOString().slice(0, 10);

export default function Reports() {
  const toast = useToast();
  const [type, setType] = useState('transactions');
  const [from, setFrom] = useState(iso(new Date(Date.now() - 30 * 86_400_000)));
  const [to, setTo] = useState(iso(new Date()));
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const { blob, name } = await downloadReport(type, type === 'customers' ? {} : { from, to });
      saveBlob(blob, name || `${type}-report.csv`);
      toast.success('Report downloaded.');
    } catch (e) { toast.error(e.details?.[0]?.message || e.message); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Reports" subtitle="Export banking summaries as CSV. Each export is recorded in the audit log." />
      <Card className="max-w-lg space-y-4 p-6">
        <Select label="Report" value={type} onChange={(e) => setType(e.target.value)}>
          {Object.entries(reports).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </Select>
        {type !== 'customers' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} hint="Up to 366 days." />
          </div>
        )}
        <Button loading={busy} onClick={download}><Download className="h-4 w-4" /> Download CSV</Button>
      </Card>
    </>
  );
}
