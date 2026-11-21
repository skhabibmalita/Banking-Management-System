import { Link } from 'react-router-dom';
import { ArrowDownToLine, ArrowUpFromLine, Send, History, Wallet, TrendingUp, TrendingDown, Landmark } from 'lucide-react';
import useAsync from '../../hooks/useAsync.js';
import { getCustomerDashboard } from '../../services/dataService.js';
import { Badge, Card, ErrorState, Skeleton, StatCard, PageHeader } from '../../components/ui/index.jsx';
import TrendChart from '../../components/charts/TrendChart.jsx';
import TransactionsTable from '../../components/TransactionsTable.jsx';
import { inr, maskAccount } from '../../utils/format.js';
import { useAuth } from '../../context/AuthContext.jsx';

const actions = [
  { to: '/app/transfer?tab=deposit', label: 'Deposit', icon: ArrowDownToLine },
  { to: '/app/transfer?tab=withdraw', label: 'Withdraw', icon: ArrowUpFromLine },
  { to: '/app/transfer?tab=transfer', label: 'Transfer', icon: Send },
  { to: '/app/transactions', label: 'Transaction History', icon: History },
];

export default function Dashboard() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useAsync(getCustomerDashboard, []);

  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>;
  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  const { accounts, recent, trend, totals } = data;

  return (
    <>
      <PageHeader title={`Welcome back, ${user.name.split(' ')[0]}`} subtitle="Here is where your money stands today." />

      <div className="grid gap-4 xl:grid-cols-4">
        <section className="rounded-xl bg-navy-900 p-6 text-white shadow-panel sm:col-span-2 xl:col-span-2">
          <p className="text-sm font-semibold text-navy-200">Total balance</p>
          <p className="mt-2 text-4xl font-extrabold tracking-tight">{inr(totals.balance)}</p>
          <p className="mt-2 text-sm text-navy-300">Across {accounts.length} accounts · {totals.activeAccounts} active</p>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {actions.map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to} className="flex flex-col items-center gap-2 rounded-lg bg-navy-800 px-2 py-3 text-center text-xs font-semibold transition-colors hover:bg-brand">
                <Icon className="h-5 w-5" /> {label}
              </Link>
            ))}
          </div>
        </section>
        <StatCard label="Total deposits" value={inr(totals.deposits)} icon={TrendingUp} note="Completed deposits" />
        <StatCard label="Total withdrawals" value={inr(totals.withdrawals)} icon={TrendingDown} note="Completed withdrawals" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <h2 className="mb-4 font-bold">Money in and out</h2>
          <TrendChart data={trend} />
        </Card>
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold">Your accounts</h2>
            <Link to="/app/accounts" className="text-sm font-semibold text-brand">View all</Link>
          </div>
          <ul className="space-y-3">
            {accounts.map((a) => (
              <li key={a.id} className="flex items-center gap-3 rounded-lg border border-navy-100 p-3">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-soft text-brand">{a.accountType === 'savings' ? <Wallet className="h-5 w-5" /> : <Landmark className="h-5 w-5" />}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold capitalize">{a.accountType} {maskAccount(a.accountNumber)}</p>
                  <p className="text-sm text-navy-500">{inr(a.balance)}</p>
                </div>
                <Badge>{a.status}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-6">
        <div className="flex items-center justify-between p-5 pb-2">
          <h2 className="font-bold">Recent transactions</h2>
          <Link to="/app/transactions" className="text-sm font-semibold text-brand">See all</Link>
        </div>
        <TransactionsTable rows={recent} />
      </Card>
    </>
  );
}
