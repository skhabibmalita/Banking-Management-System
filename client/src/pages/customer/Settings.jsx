import { PageHeader } from '../../components/ui/index.jsx';
import ChangePasswordCard from '../../components/ChangePasswordCard.jsx';

export default function Settings() {
  return (
    <>
      <PageHeader title="Settings" subtitle="Manage your sign-in security." />
      <ChangePasswordCard realm="customer" />
    </>
  );
}
