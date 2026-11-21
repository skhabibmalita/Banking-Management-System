import { Landmark, ShieldCheck, Lock } from 'lucide-react';

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-navy-900 p-12 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand"><Landmark className="h-5 w-5" /></span>
          <span className="text-lg font-extrabold">Northwind Bank</span>
        </div>
        <div>
          <h2 className="max-w-md text-4xl font-extrabold leading-tight">Every rupee accounted for, on both sides of the ledger.</h2>
          <p className="mt-4 max-w-md text-navy-200">Deposits, withdrawals and peer-to-peer transfers are recorded as paired debit and credit entries, so balances always add up.</p>
          <ul className="mt-8 space-y-3 text-sm text-navy-100">
            <li className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-brand-light" /> KYC-verified customers only</li>
            <li className="flex items-center gap-3"><Lock className="h-5 w-5 text-brand-light" /> HTTP-only cookie sessions</li>
          </ul>
        </div>
        <p className="text-xs text-navy-300">Academic demo. Simulated money only.</p>
      </div>
      <div className="grid place-items-center px-5 py-12">
        <div className="w-full max-w-md">
          <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-navy-500">{subtitle}</p>
          <div className="mt-8">{children}</div>
          {footer && <p className="mt-6 text-center text-sm text-navy-500">{footer}</p>}
        </div>
      </div>
    </div>
  );
}
