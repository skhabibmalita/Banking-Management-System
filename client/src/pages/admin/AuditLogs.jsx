import ResourcePage from '../../components/ResourcePage.jsx';
import { listAuditLogs } from '../../services/dataService.js';
import { dateTime } from '../../utils/format.js';

const columns = [
  { key: 'at', label: 'Time', render: (l) => dateTime(l.at) },
  { key: 'actor', label: 'Actor', render: (l) => <div><p className="font-semibold">{l.actor.name}</p><p className="text-xs text-navy-400">{l.actor.type}</p></div> },
  { key: 'action', label: 'Action', render: (l) => l.action.replaceAll('_', ' ').toLowerCase() },
  { key: 'entityType', label: 'Target', render: (l) => [l.entityType, l.entityId].filter(Boolean).join(' ') },
  { key: 'ip', label: 'IP address' },
];

export default function AuditLogs() {
  return <ResourcePage title="Audit logs" subtitle="Who did what, and when." load={listAuditLogs} columns={columns} />;
}
