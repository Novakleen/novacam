import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatEuro } from '@/lib/treso/screen';

const SURE = '#1d4ed8';
const PROBABLE = '#0f766e';
const SURE_IF = '#60a5fa';
const PROBABLE_IF = '#14b8a6';
const THRESHOLD = '#dc2626';

function axisTick(value) {
  const number = Math.round(Number(value) || 0);
  const abs = Math.abs(number);
  if (abs < 1000) return String(number);
  const thousands = number / 1000;
  const text = abs >= 10000
    ? String(Math.round(thousands))
    : thousands.toFixed(1).replace(/\.0$/, '');
  return `${text}k`;
}

function ChartTip({ active, payload, language }) {
  const { t } = useTranslation();
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const money = (value) => formatEuro(value, language);
  const lines = [
    [t('treso.tooltipInSure'), money(row.inSure)],
    [t('treso.tooltipIn'), money(row.inProbable)],
    [t('treso.tooltipOut'), money(row.out)],
    [t('treso.tooltipSure'), money(row.sure)],
    [t('treso.tooltipProbable'), money(row.probable)],
  ];
  if (row.sureIf != null) {
    lines.push([t('treso.legendSimSure'), money(row.sureIf)]);
    lines.push([t('treso.legendSimProbable'), money(row.probableIf)]);
  }
  return (
    <div className="max-w-[220px] rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-gray-900">{t('treso.weekOf', { date: row.label })}</p>
      <dl className="space-y-0.5">
        {lines.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className="text-gray-500">{label}</dt>
            <dd className="tabular-nums font-medium text-gray-900">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Swatch({ color, dashed = false }) {
  return (
    <span
      className="inline-block h-0.5 w-4 shrink-0 rounded"
      style={{
        background: dashed ? 'transparent' : color,
        borderTop: dashed ? `2px dashed ${color}` : undefined,
      }}
    />
  );
}

const TresoChart = ({ rows, threshold, language, showWhatIf }) => {
  const { t } = useTranslation();
  return (
    <div className="min-w-0">
      <div className="h-[220px] w-full min-w-0 sm:h-[280px]" data-testid="treso-chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#e5e7eb" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: '#6b7280' }}
              tickMargin={6}
              interval="preserveStartEnd"
              minTickGap={16}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={axisTick}
              tick={{ fontSize: 11, fill: '#6b7280' }}
              width={40}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={<ChartTip language={language} />}
              allowEscapeViewBox={{ x: false, y: true }}
              wrapperStyle={{ zIndex: 30, outline: 'none' }}
            />
            <ReferenceLine y={threshold} stroke={THRESHOLD} strokeWidth={1.5} ifOverflow="extendDomain" />
            {showWhatIf && (
              <Line type="monotone" dataKey="probableIf" stroke={PROBABLE_IF} strokeWidth={2} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
            )}
            {showWhatIf && (
              <Line type="monotone" dataKey="sureIf" stroke={SURE_IF} strokeWidth={2} dot={false} isAnimationActive={false} />
            )}
            <Line type="monotone" dataKey="probable" stroke={PROBABLE} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="sure" stroke={SURE} strokeWidth={2.5} dot={false} isAnimationActive={false} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
        <li className="inline-flex items-center gap-1.5"><Swatch color={SURE} />{t('treso.legendSure')}</li>
        <li className="inline-flex items-center gap-1.5"><Swatch color={PROBABLE} dashed />{t('treso.legendProbable')}</li>
        <li className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 bg-red-600" />{t('treso.legendThreshold')}</li>
        {showWhatIf && (
          <>
            <li className="inline-flex items-center gap-1.5"><Swatch color={SURE_IF} />{t('treso.legendSimSure')}</li>
            <li className="inline-flex items-center gap-1.5"><Swatch color={PROBABLE_IF} dashed />{t('treso.legendSimProbable')}</li>
          </>
        )}
      </ul>
    </div>
  );
};

export default TresoChart;
