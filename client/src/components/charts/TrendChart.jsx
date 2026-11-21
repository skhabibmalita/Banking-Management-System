import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { inr } from '../../utils/format.js';

const compact = (minor) => {
  const r = minor / 100;
  if (r >= 1e7) return `₹${(r / 1e7).toFixed(1)}Cr`;
  if (r >= 1e5) return `₹${(r / 1e5).toFixed(1)}L`;
  if (r >= 1e3) return `₹${(r / 1e3).toFixed(0)}k`;
  return `₹${r}`;
};

export default function TrendChart({ data }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="dep" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0891B2" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#0891B2" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="wd" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#173A7A" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#173A7A" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#E3EAF5" vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: '#5D7DB0', fontSize: 12 }} />
          <YAxis tickFormatter={compact} tickLine={false} axisLine={false} width={56} tick={{ fill: '#5D7DB0', fontSize: 12 }} />
          <Tooltip formatter={(v) => inr(v)} contentStyle={{ borderRadius: 10, border: '1px solid #E3EAF5' }} />
          <Legend iconType="circle" />
          <Area type="monotone" dataKey="deposits" name="Deposits" stroke="#0891B2" strokeWidth={2.5} fill="url(#dep)" />
          <Area type="monotone" dataKey="withdrawals" name="Withdrawals" stroke="#173A7A" strokeWidth={2.5} fill="url(#wd)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
