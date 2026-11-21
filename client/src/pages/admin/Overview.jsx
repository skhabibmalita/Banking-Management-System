import { Link } from 'react-router-dom';
import { Users, Landmark, ArrowDownToLine, ArrowUpFromLine, Activity, FileCheck2, Siren } from 'lucide-react';
import useAsync from '../../hooks/useAsync.js';
import { getAdminOverview } from '../../services/dataService.js';
import { Card, ErrorState, PageHeader, Skeleton, StatCard } from '../../components/ui/index.jsx';
import TrendChart from '../../components/charts/TrendChart.jsx';
import MixChart from '../../components/charts/MixChart.jsx';
import { dateTime, inr } from '../../utils/format.js';

// The server leaves out sections the signed-in admin may not see (they arrive as null).
const num = (v) => (v === null || v === undefined ? '—' : v.toLocaleString('en-IN'));
const money = (v) => (v === null || v === undefined ? '—' : inr(v));

export default function Overview() {
  const { data, loading, error, reload } = useAsync(getAdminOverview, []);

  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>;
  if (loading) {
    return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-32" />)}</div>;
  }
  const { totals, trend, byType, recent } = data;

  return (
    <>
      <PageHeader title="Overview" subtitle="Live view of customers, money movement and risk." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {totals.customers !== null && <StatCard label="Total customers" value={num(totals.customers)} icon={Users} />}
        {totals.accounts !== null && <StatCard label="Bank accounts" value={num(totals.accounts)} icon={Landmark} />}
        {totals.deposits !== null && <StatCard label="Total deposits" value={money(totals.deposits)} icon={ArrowDownToLine} />}
        {totals.withdrawals !== null && <StatCard label="Total withdrawals" value={money(totals.withdrawals)} icon={ArrowUpFromLine} />}
        {totals.volume !== null && <StatCard label="Transaction volume" value={money(totals.volume)} icon={Activity} />}
        {totals.pendingKyc !== null && <Link to="/admin/kyc"><StatCard label="Pending KYC" value={num(totals.pendingKyc)} icon={FileCheck2} note="Review applications" /></Link>}
        {totals.alerts !== null && <Link to="/admin/fraud"><StatCard label="Open fraud alerts" value={num(totals.alerts)} icon={Siren} note="Open fraud monitoring" /></Link>}
      </div>

      {trend && byType && (
        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <Card className="p-5 xl:col-span-2"><h2 className="mb-4 font-bold">Deposits and withdrawals</h2><TrendChart data={trend} /></Card>
          <Card className="p-5"><h2 className="mb-4 font-bold">Volume by type</h2><MixChart data={byType} /></Card>
        </div>
      )}

      {recent && (
        <Card className="mt-6 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">Recent system activity</h2>
            <Link to="/admin/audit-logs" className="text-sm font-semibold text-brand">All logs</Link>
          </div>
          <ul className="divide-y divide-navy-100">
            {recent.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <span><b>{l.actor.name}</b> · {l.action.replaceAll('_', ' ').toLowerCase()}{l.entityType ? ` · ${l.entityType}` : ''}</span>
                <span className="text-xs text-navy-400">{dateTime(l.at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
