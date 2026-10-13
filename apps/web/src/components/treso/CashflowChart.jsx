import { useTranslation } from 'react-i18next';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatEuro } from '@/lib/treso/screen';

const IN = '#15803d';
const OUT = '#dc2626';
const INK = '#111111';
const YELLOW = '#facc15';

function axisTick(value) {
  const number = Math.round(Number(value) || 0);
  const abs = Math.abs(number);
  if (abs < 1000) return String(number);
  const thousands = number / 1000;
  const text = abs >= 10000
    ? String(Math.round(thousands))
    : thousands.toFixed(1).replace(/\.0$/, '');
  return `${number < 0 ? '−' : ''}${text.replace('-', '')}k`;
}

function Tip({ active, payload, title, language, rows }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="max-w-[220px] rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold text-neutral-950">{title(point)}</div>
      <dl className="space-y-0.5">
        {rows(point).map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className="text-neutral-500">{label}</dt>
            <dd className="tabular-nums font-medium text-neutral-950">{formatEuro(value, language)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Swatch({ color, line = false }) {
  if (line) {
    return <span className="inline-block h-0.5 w-4 rounded" style={{ background: color }} />;
  }
  return <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />;
}

export function CashBars({ rows, labels, language }) {
  const { t } = useTranslation();
  return (
    <div className="min-w-0">
      <div className="h-[220px] w-full min-w-0 sm:h-[260px]" data-testid="treso-bars">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#f0f0f0" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: '#737373' }}
              tickMargin={8}
              interval="preserveStartEnd"
              minTickGap={20}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={axisTick}
              tick={{ fontSize: 11, fill: '#737373' }}
              width={36}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={(
                <Tip
                  language={language}
                  title={(point) => point.label}
                  rows={(point) => [
                    [t('treso.legendIn'), point.cashIn],
                    [t('treso.legendOut'), point.cashOut],
                    [t('treso.legendBalance'), point.balance],
                  ]}
                />
              )}
              wrapperStyle={{ zIndex: 30, outline: 'none' }}
            />
            <Bar dataKey="cashIn" fill={IN} radius={[3, 3, 0, 0]} maxBarSize={16} isAnimationActive={false} />
            <Bar dataKey="cashOut" fill={OUT} radius={[3, 3, 0, 0]} maxBarSize={16} isAnimationActive={false} />
            <Line type="monotone" dataKey="balance" stroke={INK} strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
        <li className="inline-flex items-center gap-1.5"><Swatch color={IN} />{labels.in}</li>
        <li className="inline-flex items-center gap-1.5"><Swatch color={OUT} />{labels.out}</li>
        <li className="inline-flex items-center gap-1.5"><Swatch color={INK} line />{labels.balance}</li>
      </ul>
    </div>
  );
}

export function CashLine({ rows, language }) {
  const { t } = useTranslation();
  return (
    <div className="h-[220px] w-full min-w-0 sm:h-[260px]" data-testid="treso-line">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#f0f0f0" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: '#737373' }}
            tickMargin={8}
            interval="preserveStartEnd"
            minTickGap={16}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={axisTick}
            tick={{ fontSize: 11, fill: '#737373' }}
            width={40}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={(
              <Tip
                language={language}
                title={(point) => t('treso.weekOf', { date: point.label })}
                rows={(point) => [[t('treso.legendBalance'), point.balance]]}
              />
            )}
            wrapperStyle={{ zIndex: 30, outline: 'none' }}
          />
          <Line
            type="monotone"
            dataKey="balance"
            stroke={INK}
            strokeWidth={2.5}
            dot={{ r: 3, fill: YELLOW, stroke: INK, strokeWidth: 1.5 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
