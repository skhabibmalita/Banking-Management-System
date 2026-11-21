import { Card, PageHeader } from '../../components/ui/index.jsx';
import ChangePasswordCard from '../../components/ChangePasswordCard.jsx';

export default function AdminSettings() {
  return (
    <>
      <PageHeader title="Settings" subtitle="Your admin account security." />
      <div className="space-y-6">
        <ChangePasswordCard realm="admin" />
        <Card className="max-w-lg p-6">
          <h2 className="mb-2 font-bold">Fraud thresholds</h2>
          <p className="text-sm text-navy-600">
            Fraud rules (large amounts, rapid transfers, deposit then withdraw, repeated failures) are configured by the engineering team in
            {' '}<code className="rounded bg-navy-50 px-1">server/config/policy.js</code> so changes are reviewed and versioned.
          </p>
        </Card>
      </div>
    </>
  );
}
