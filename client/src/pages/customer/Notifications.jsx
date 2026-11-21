import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import useAsync from '../../hooks/useAsync.js';
import { getNotifications, markAllNotificationsRead, markNotificationRead } from '../../services/dataService.js';
import { Button, Card, EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui/index.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { dateTime } from '../../utils/format.js';

const icons = {
  success: [CheckCircle2, 'text-emerald-600 bg-emerald-50'],
  info: [Info, 'text-brand bg-brand-soft'],
  warning: [AlertTriangle, 'text-amber-600 bg-amber-50'],
  error: [AlertCircle, 'text-red-600 bg-red-50'],
};

export default function Notifications() {
  const { data, loading, error, reload, setData } = useAsync(getNotifications, []);
  const toast = useToast();
  const items = data?.items || [];
  const unread = items.filter((n) => !n.read).length;

  const markAll = async () => {
    try { await markAllNotificationsRead(); setData({ ...data, items: items.map((n) => ({ ...n, read: true })) }); }
    catch (e) { toast.error(e.message); }
  };
  const markOne = async (id) => {
    try { await markNotificationRead(id); setData({ ...data, items: items.map((n) => (n.id === id ? { ...n, read: true } : n)) }); }
    catch (e) { toast.error(e.message); }
  };

  return (
    <>
      <PageHeader title="Notifications" subtitle={unread ? `${unread} unread` : 'You are all caught up.'}
        actions={<Button variant="outline" disabled={!unread} onClick={markAll}>Mark all as read</Button>} />
      <Card className="max-w-3xl">
        {loading && !data ? <Spinner /> : error ? <ErrorState message={error} onRetry={reload} />
          : !items.length ? <EmptyState title="No notifications" message="Account and transaction alerts will appear here." />
          : (
            <ul className="divide-y divide-navy-100">
              {items.map((n) => {
                const [Icon, tone] = icons[n.type] || icons.info;
                return (
                  <li key={n.id} className={`flex gap-4 px-5 py-4 ${n.read ? '' : 'bg-brand-soft/40'}`}>
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${tone}`}><Icon className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{n.title}</p>
                      <p className="text-sm text-navy-600">{n.message}</p>
                      <p className="mt-1 text-xs text-navy-400">{dateTime(n.createdAt)}</p>
                    </div>
                    {!n.read && <button className="self-start text-xs font-semibold text-brand" onClick={() => markOne(n.id)}>Mark read</button>}
                  </li>
                );
              })}
            </ul>
          )}
      </Card>
    </>
  );
}
