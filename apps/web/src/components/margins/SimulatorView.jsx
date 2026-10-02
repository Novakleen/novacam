import React from 'react';
import { Calculator, Fuel, Plus, RotateCcw, Save, Target, Trash2, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatEntryMonth, formatHours, formatKm, formatMoney, formatPct } from '@/lib/margin/format';
import HourLinesEditor from './HourLinesEditor';
import MaPercentBadge from './MaPercentBadge';

/**
 * v1.13.0 presentational « Simulateur » (no data access) — used by SimulatorTab and by
 * tools/render-simulator-preview. All numbers come from `calc` (= calculateProjectMargin output).
 *
 * form = { amountHt, techIds[], days, hoursPerDay, service, serviceValue, hoursMode, hourLines[],
 *          productLines[{product, liters}], clientAddress, kmOverride{id: km}, closer, monthKey,
 *          extras[{label, amount}], targetPct, name, hubspot* }
 * routing = { [profileId]: { status: 'loading'|'ok'|'failed'|'noaddress'|'idle', km } }
 */
const inputCls =
  'h-10 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30';

const Section = ({ title, icon: Icon, children, className }) => (
  <div className={cn('rounded-2xl border border-gray-100 dark:border-gray-800 p-4 space-y-3', className)}>
    <p className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {title}
    </p>
    {children}
  </div>
);

const Field = ({ label, hint, children, className }) => (
  <label className={cn('block space-y-1', className)}>
    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{label}</span>
    {children}
    {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
  </label>
);

const Row = ({ label, value, strong, muted, className }) => (
  <div className={cn('flex items-center justify-between gap-3 py-1.5 text-sm', className)}>
    <span className={cn('min-w-0', strong ? 'font-semibold text-gray-900 dark:text-white' : 'text-muted-foreground')}>{label}</span>
    <span className={cn('tabular-nums shrink-0', strong ? 'font-bold text-gray-900 dark:text-white' : muted ? 'text-muted-foreground' : 'font-medium')}>
      {value}
    </span>
  </div>
);

const SimulatorView = ({
  t,
  lang = 'fr',
  form,
  set,
  patch,
  options,
  routing = {},
  cac,
  calc,
  minPrice,
  dieselEurL,
  params = {},
  onReset,
  onHoursMode,
  sourceSlot = null,
  saving = false,
  editingId = null,
  onSave,
  onSaveNew,
  onDelete,
}) => {
  const { profiles = [], services = [], products = [], closers = [] } = options || {};
  const linesMode = form.hoursMode === 'lines';
  const selected = linesMode
    ? profiles.filter((p) => (form.hourLines || []).some((line) => (line.people || []).some((person) => person.profileId === p.id)))
    : profiles.filter((p) => (form.techIds || []).includes(p.id));
  const techIds = form.techIds || [];
  const toggleTech = (id) => set('techIds', techIds.includes(id) ? techIds.filter((x) => x !== id) : [...techIds, id]);
  const setLine = (key, i, patchLine) => set(key, form[key].map((l, j) => (j === i ? { ...l, ...patchLine } : l)));
  const removeLine = (key, i) => set(key, form[key].filter((_, j) => j !== i));
  const apply = patch || ((partial) => {
    Object.entries(partial).forEach(([key, value]) => set(key, value));
  });
  const essenceSet = new Set((params.essence_services || []).map((s) => String(s).toLowerCase()));
  const essenceOn = linesMode
    ? (form.hourLines || []).some((line) => essenceSet.has(String(line.service || '').toLowerCase()))
    : essenceSet.has(String(form.service || '').toLowerCase());
  const personHours = linesMode
    ? calc?.personHours
    : selected.length * (Number(form.days) || 0) * (Number(form.hoursPerDay) || 0);
  const serviceValue = form.serviceValue || form.service;
  const mbPct = calc?.caHt != null && Number(calc.caHt) !== 0 && calc?.mb != null ? calc.mb / calc.caHt : null;

  const cacValue =
    cac?.status === 'ok'
      ? formatMoney(calc?.ads)
      : cac?.status === 'zero_clients'
        ? t('margins.cacStatusZeroClients')
        : cac?.status === 'no_spend'
          ? t('margins.cacStatusNoSpend')
          : cac?.status === 'clients_unknown'
            ? t('margins.cacStatusUnknown')
            : formatMoney(calc?.ads);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] items-start">
      {/* ── Inputs ── */}
      <div className="space-y-4">
        <Section title={t('margins.sim.sectionJob')} icon={Calculator}>
          {sourceSlot}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('margins.sim.amountHt')}>
              <input
                type="number"
                min="0"
                step="10"
                inputMode="decimal"
                className={cn(inputCls, 'text-base font-semibold')}
                placeholder="0"
                value={form.amountHt}
                onChange={(e) => set('amountHt', e.target.value)}
              />
            </Field>
            <Field label={t('margins.sim.service')} hint={essenceOn ? t('margins.sim.essenceOn') : t('margins.sim.essenceOff')}>
              <select
                className={inputCls}
                value={serviceValue}
                onChange={(e) => {
                  const opt = services.find((s) => (s.value || s.code) === e.target.value);
                  apply({
                    service: opt?.code || e.target.value,
                    serviceLabel: opt?.label || '',
                    serviceValue: e.target.value,
                  });
                }}
              >
                {services.map((s) => (
                  <option key={s.value || s.code} value={s.value || s.code}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('margins.sim.clientAddress')} className="sm:col-span-2">
              <input
                className={inputCls}
                placeholder={t('margins.sim.clientAddressPh')}
                value={form.clientAddress}
                onChange={(e) => set('clientAddress', e.target.value)}
              />
            </Field>
          </div>
        </Section>

        <Section title={t('margins.sim.sectionTeam')} icon={Users}>
          <div className="inline-flex rounded-full border border-gray-200 dark:border-gray-700 p-0.5">
            <button
              type="button"
              onClick={() => onHoursMode?.('simple')}
              className={cn(
                'rounded-full px-3 h-8 text-xs font-semibold',
                !linesMode ? 'bg-primary text-white' : 'text-gray-600 dark:text-gray-300'
              )}
              aria-pressed={!linesMode}
            >
              {t('margins.sim.hoursSimple')}
            </button>
            <button
              type="button"
              onClick={() => onHoursMode?.('lines')}
              className={cn(
                'rounded-full px-3 h-8 text-xs font-semibold',
                linesMode ? 'bg-primary text-white' : 'text-gray-600 dark:text-gray-300'
              )}
              aria-pressed={linesMode}
            >
              {t('margins.sim.hoursLines')}
            </button>
          </div>
          {linesMode ? (
            <HourLinesEditor
              lines={form.hourLines || []}
              onChange={(lines) => set('hourLines', lines)}
              profiles={profiles}
              services={services}
            />
          ) : (
          <>
          <div className="flex flex-wrap gap-1.5">
            {profiles.map((p) => {
              const on = techIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleTech(p.id)}
                  className={cn(
                    'rounded-full border px-3 h-9 text-sm font-semibold transition-colors',
                    on ? 'border-transparent bg-primary text-white' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                  )}
                  aria-pressed={on}
                >
                  {(p.full_name || p.email || '—').trim()}
                </button>
              );
            })}
          </div>
          {selected.length === 0 && <p className="text-xs text-amber-700 dark:text-amber-300">{t('margins.sim.noTechs')}</p>}
          <div className="grid gap-3 grid-cols-2">
            <Field label={t('margins.sim.days')}>
              <input type="number" min="0" max="60" step="1" className={inputCls} value={form.days} onChange={(e) => set('days', e.target.value)} />
            </Field>
            <Field label={t('margins.sim.hoursPerDay')}>
              <input type="number" min="0" max="24" step="0.25" className={inputCls} value={form.hoursPerDay} onChange={(e) => set('hoursPerDay', e.target.value)} />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('margins.sim.personHours', { techs: selected.length, days: Number(form.days) || 0, hours: Number(form.hoursPerDay) || 0, total: formatHours(personHours) })}
          </p>
          {selected.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <p className="text-xs font-semibold text-gray-500 flex items-center gap-1">
                <Fuel className="h-3.5 w-3.5" /> {t('margins.sim.trips')}
              </p>
              {selected.map((p) => {
                const r = routing[p.id] || { status: 'idle' };
                const status =
                  r.status === 'loading'
                    ? t('margins.sim.routing')
                    : r.status === 'ok'
                      ? `${formatKm(r.km)} ${t('margins.sim.oneWay')}`
                      : r.status === 'noaddress'
                        ? t('margins.sim.noHomeAddress')
                        : r.status === 'failed'
                          ? t('margins.sim.routeFailed')
                          : t('margins.sim.routeIdle');
                return (
                  <div key={p.id} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 min-w-0">
                      <span className="font-medium">{(p.full_name || '—').trim()}</span>
                      <span className={cn('block text-[11px] truncate', r.status === 'failed' || r.status === 'noaddress' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
                        {status}
                      </span>
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className={cn(inputCls, 'w-28 h-9')}
                      placeholder={t('margins.sim.kmManual')}
                      value={form.kmOverride[p.id] ?? ''}
                      onChange={(e) => set('kmOverride', { ...form.kmOverride, [p.id]: e.target.value })}
                      aria-label={t('margins.sim.kmManual')}
                    />
                  </div>
                );
              })}
              <p className="text-[11px] text-muted-foreground">{t('margins.sim.kmHint')}</p>
            </div>
          )}
          </>
          )}
          {linesMode && selected.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <p className="text-xs font-semibold text-gray-500 flex items-center gap-1">
                <Fuel className="h-3.5 w-3.5" /> {t('margins.sim.trips')}
              </p>
              {selected.map((p) => {
                const r = routing[p.id] || { status: 'idle' };
                const status =
                  r.status === 'loading'
                    ? t('margins.sim.routing')
                    : r.status === 'ok'
                      ? `${formatKm(r.km)} ${t('margins.sim.oneWay')}`
                      : r.status === 'noaddress'
                        ? t('margins.sim.noHomeAddress')
                        : r.status === 'failed'
                          ? t('margins.sim.routeFailed')
                          : t('margins.sim.routeIdle');
                return (
                  <div key={p.id} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 min-w-0">
                      <span className="font-medium">{(p.full_name || '—').trim()}</span>
                      <span className={cn('block text-[11px] truncate', r.status === 'failed' || r.status === 'noaddress' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
                        {status}
                      </span>
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className={cn(inputCls, 'w-28 h-9')}
                      placeholder={t('margins.sim.kmManual')}
                      value={form.kmOverride[p.id] ?? ''}
                      onChange={(e) => set('kmOverride', { ...form.kmOverride, [p.id]: e.target.value })}
                      aria-label={t('margins.sim.kmManual')}
                    />
                  </div>
                );
              })}
              <p className="text-[11px] text-muted-foreground">{t('margins.sim.kmHint')}</p>
            </div>
          )}
          {linesMode && <p className="text-[11px] text-muted-foreground">{t('margins.sim.hoursModeHint')}</p>}
        </Section>

        <Section title={t('margins.sim.sectionProducts')}>
          {form.productLines.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <select className={cn(inputCls, 'flex-1')} value={l.product} onChange={(e) => setLine('productLines', i, { product: e.target.value })}>
                <option value="">{t('margins.sim.pickProduct')}</option>
                {products.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.label}
                    {p.price != null ? ` — ${formatMoney(p.price)}/L` : ''}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="1"
                className={cn(inputCls, 'w-24')}
                placeholder="L"
                value={l.liters}
                onChange={(e) => setLine('productLines', i, { liters: e.target.value })}
                aria-label={t('margins.sim.liters')}
              />
              <button type="button" className="h-10 w-10 shrink-0 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500" onClick={() => removeLine('productLines', i)} aria-label={t('common.delete')}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold text-primary" onClick={() => set('productLines', [...form.productLines, { product: '', liters: '' }])}>
            <Plus className="h-4 w-4" /> {t('margins.sim.addProduct')}
          </button>
        </Section>

        <Section title={t('margins.sim.sectionExtras')}>
          {form.extras.length === 0 && <p className="text-xs text-muted-foreground">{t('margins.sim.extrasHint')}</p>}
          {form.extras.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className={cn(inputCls, 'flex-1')} placeholder={t('margins.sim.extraLabelPh')} value={l.label} onChange={(e) => setLine('extras', i, { label: e.target.value })} />
              <input
                type="number"
                min="0"
                step="1"
                className={cn(inputCls, 'w-28')}
                placeholder="€ HT"
                value={l.amount}
                onChange={(e) => setLine('extras', i, { amount: e.target.value })}
                aria-label={t('margins.sim.extraAmount')}
              />
              <button type="button" className="h-10 w-10 shrink-0 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500" onClick={() => removeLine('extras', i)} aria-label={t('common.delete')}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold text-primary" onClick={() => set('extras', [...form.extras, { label: '', amount: '' }])}>
              <Plus className="h-4 w-4" /> {t('margins.sim.addExtra')}
            </button>
            <button type="button" className="text-xs font-semibold rounded-full border border-gray-200 dark:border-gray-700 px-2.5 h-7" onClick={() => set('extras', [...form.extras, { label: t('margins.sim.hotelPreset'), amount: '' }])}>
              {t('margins.sim.hotelPreset')}
            </button>
            <button type="button" className="text-xs font-semibold rounded-full border border-gray-200 dark:border-gray-700 px-2.5 h-7" onClick={() => set('extras', [...form.extras, { label: t('margins.sim.liftPreset'), amount: '' }])}>
              {t('margins.sim.liftPreset')}
            </button>
          </div>
        </Section>

        <Section title={t('margins.sim.sectionAcquisition')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('margins.sim.closer')} hint={calc?.commercial ? t('margins.sim.comRate', { rate: formatPct(params.com_rate) }) : t('margins.sim.noCom')}>
              <select className={inputCls} value={form.closer} onChange={(e) => set('closer', e.target.value)}>
                <option value="">{t('margins.sim.closerNone')}</option>
                {closers.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label={t('margins.sim.entryMonth')}
              hint={cac?.status === 'ok' ? t('margins.sim.cacPerClient', { amount: formatMoney(cac.amount) }) : null}
            >
              <input type="month" className={inputCls} value={form.monthKey} onChange={(e) => set('monthKey', e.target.value)} />
            </Field>
          </div>
        </Section>
      </div>

      {/* ── Results ── */}
      <div className="space-y-4 lg:sticky lg:top-4">
        <div className="rounded-2xl border border-gray-100 dark:border-gray-800 p-4 space-y-1 bg-white dark:bg-gray-900">
          <div className="flex items-center justify-between gap-2 pb-2">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">{t('margins.sim.result')}</p>
            <button type="button" onClick={onReset} className="inline-flex items-center gap-1 rounded-full border border-gray-200 dark:border-gray-700 px-3 h-8 text-xs font-semibold hover:bg-gray-50 dark:hover:bg-gray-800">
              <RotateCcw className="h-3.5 w-3.5" /> {t('margins.sim.reset')}
            </button>
          </div>
          {onSave && (
            <div className="space-y-2 pb-2">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-gray-500">{t('margins.sim.name')}</span>
                <input
                  className={inputCls}
                  placeholder={t('margins.sim.namePh')}
                  value={form.name || ''}
                  onChange={(e) => set('name', e.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={onSave}
                  className="inline-flex items-center gap-1 rounded-full bg-primary text-white px-3 h-8 text-xs font-semibold disabled:opacity-60"
                >
                  <Save className="h-3.5 w-3.5" /> {t('margins.sim.save')}
                </button>
                {editingId && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={onSaveNew}
                    className="inline-flex items-center gap-1 rounded-full border border-gray-200 dark:border-gray-700 px-3 h-8 text-xs font-semibold disabled:opacity-60"
                  >
                    {t('margins.sim.saveNew')}
                  </button>
                )}
                {editingId && onDelete && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={onDelete}
                    className="inline-flex items-center gap-1 rounded-full border border-red-200 text-red-600 px-3 h-8 text-xs font-semibold disabled:opacity-60"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> {t('margins.sim.delete')}
                  </button>
                )}
              </div>
              {editingId && <p className="text-[11px] text-muted-foreground">{t('margins.sim.editing')}</p>}
            </div>
          )}
          <div className="flex items-center gap-3 pb-2">
            <MaPercentBadge maPct={calc?.maPct} className="text-base px-3 py-1" />
            <span className="text-lg font-black tabular-nums">{formatMoney(calc?.ma)}</span>
          </div>
          <Row label={t('margins.sim.caHt')} value={formatMoney(calc?.caHt)} strong />
          <Row label={t('margins.sim.mo', { hours: formatHours(calc?.personHours) })} value={formatMoney(calc?.mo)} muted />
          <Row label={t('margins.sim.products')} value={formatMoney(calc?.productCost)} muted />
          <Row
            label={t('margins.sim.diesel', { price: dieselEurL != null ? formatMoney(dieselEurL) : '—' })}
            value={
              calc?.dieselFuel != null
                ? formatMoney(calc.dieselFuel)
                : calc?.fuelRoutingFailed
                  ? t('margins.sim.routeFailedShort')
                  : calc?.fuelIncomplete
                    ? t('margins.sim.addressesMissing')
                    : formatMoney(0)
            }
            muted
          />
          <Row
            label={t('margins.sim.essence', { factor: String(calc?.essenceTimeFactor ?? 0.6).replace('.', ','), hours: formatHours(calc?.essenceHours) })}
            value={formatMoney(calc?.essenceFuel)}
            muted
          />
          <Row label={t('margins.sim.extras')} value={formatMoney(calc?.otherExpenses)} muted />
          <div className="border-t border-dashed my-1" />
          <Row label={t('margins.sim.direct')} value={formatMoney(calc?.direct)} strong />
          <Row label={t('margins.sim.mb')} value={formatMoney(calc?.mb)} strong />
          <Row label={t('margins.sim.mbPct')} value={formatPct(mbPct)} strong />
          <Row label={calc?.commercial ? t('margins.sim.com') : t('margins.sim.comNone')} value={formatMoney(calc?.com)} muted />
          <Row
            label={cac?.monthKey ? t('margins.cacLineMonthOnly', { month: formatEntryMonth(cac.monthKey, lang) }) : t('margins.cacLinePlain')}
            value={cacValue}
            muted
          />
          <div className="border-t my-1" />
          <Row label={t('margins.sim.ma')} value={formatMoney(calc?.ma)} strong />
          <Row label={t('margins.sim.maPct')} value={formatPct(calc?.maPct)} strong />
          {calc?.caHt == null && <p className="text-[11px] text-amber-700 dark:text-amber-300 pt-1">{t('margins.sim.enterAmount')}</p>}
        </div>

        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5" /> {t('margins.sim.minPriceTitle')}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{t('margins.sim.targetMa')}</span>
            <input
              type="number"
              min="0"
              max="95"
              step="1"
              className={cn(inputCls, 'w-20 h-9')}
              value={form.targetPct}
              onChange={(e) => set('targetPct', e.target.value)}
              aria-label={t('margins.sim.targetMa')}
            />
            <span className="text-sm">%</span>
          </div>
          <p className="text-2xl font-black tabular-nums">{minPrice != null ? formatMoney(minPrice) : '—'}</p>
          <p className="text-[11px] text-muted-foreground">{minPrice != null ? t('margins.sim.minPriceHint') : t('margins.sim.minPriceImpossible')}</p>
        </div>
        <p className="text-[11px] text-muted-foreground">{t('margins.sim.draftHint')}</p>
        <p className="text-[11px] text-muted-foreground">{t('margins.sim.notSaved')}</p>
      </div>
    </div>
  );
};

export default SimulatorView;
