/** Service mix atoms used on margin dossiers (hour-line `service` + mix completeness). */
export const SERVICE_CODES = [
  { code: 'biomix', label: 'Biomix', needsSpray: true },
  { code: 'algimouss', label: 'Algimouss', needsSpray: true },
  { code: 'algivert', label: 'Algivert', needsSpray: true },
  { code: 'kleenkup', label: 'Kleenkup', needsSpray: true },
  { code: 'amphiclean', label: 'Amphiclean', needsSpray: true },
  { code: 'nettoyage', label: 'Nettoyage', needsSpray: false },
  { code: 'hydrogommage', label: 'Hydrogommage', needsSpray: false },
  { code: 'peinture', label: 'Peinture', needsSpray: false },
  { code: 'demoussage', label: 'Démoussage', needsSpray: false },
  { code: 'autre', label: 'Autre', needsSpray: false },
];

export const SERVICE_BY_CODE = Object.fromEntries(SERVICE_CODES.map((s) => [s.code, s]));

export const PRODUCT_SLUGS = [
  { slug: 'biomix', label: 'Biomix' },
  { slug: 'algimouss', label: 'Algimouss' },
  { slug: 'algivert', label: 'Algivert' },
  { slug: 'kleenkup', label: 'Kleenkup' },
  { slug: 'amphiclean', label: 'Amphiclean' },
];

export const DEFAULT_PRODUCT_PRICES = {
  biomix: 4.712,
  algimouss: 2.58,
  algivert: 2.7965,
  kleenkup: 8.26,
  amphiclean: 7.056,
};

export const VAT_RATES = [
  { rate: 0.06, label: '6 %', divisor: 1.06 },
  { rate: 0.21, label: '21 %', divisor: 1.21 },
];

export const DEFAULT_CLOSERS = ['Anthony', 'Bastien', 'Emilie', 'Thibeau'];

export const MARGIN_PARAMS_ID = 1;

export const DIESEL_CACHE_MS = 24 * 60 * 60 * 1000;

export const MA_OK = 0.4;
export const MA_WARN = 0.2;

const MIX_SPLIT = /[+,;/|]+/;

export function parseMix(mix) {
  if (Array.isArray(mix)) {
    return mix.map((a) => String(a).trim().toLowerCase()).filter(Boolean);
  }
  if (!mix || typeof mix !== 'string') return [];
  return mix
    .split(MIX_SPLIT)
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
}

export function formatMix(atoms) {
  return (atoms || []).filter(Boolean).join('+');
}

export function mixNeedsSpray(atoms) {
  return (atoms || []).some((code) => SERVICE_BY_CODE[code]?.needsSpray);
}

export function serviceLabel(code) {
  return SERVICE_BY_CODE[code]?.label || code || '—';
}

export function productLabel(slug) {
  return PRODUCT_SLUGS.find((p) => p.slug === slug)?.label || slug || '—';
}

/** TTC → HT. vatRate is 0.06 or 0.21 (not 6/21). */
export function ttcToHt(ttc, vatRate) {
  const amount = Number(ttc);
  const rate = Number(vatRate);
  if (!Number.isFinite(amount) || !Number.isFinite(rate) || rate < 0) return null;
  return amount / (1 + rate);
}

export function htToTtc(ht, vatRate) {
  const amount = Number(ht);
  const rate = Number(vatRate);
  if (!Number.isFinite(amount) || !Number.isFinite(rate) || rate < 0) return null;
  return amount * (1 + rate);
}

export function sumInvoiceCaHt(invoices) {
  if (!Array.isArray(invoices) || !invoices.length) return null;
  let sum = 0;
  let any = false;
  for (const inv of invoices) {
    const v = Number(inv?.caHt ?? inv?.ca_ht);
    if (Number.isFinite(v)) {
      sum += v;
      any = true;
    }
  }
  return any ? roundMoney(sum) : null;
}

export function isCommercialCloser(closer, commercialClosers) {
  if (!closer || !Array.isArray(commercialClosers) || !commercialClosers.length) return false;
  const c = String(closer).trim().toLowerCase();
  if (!c) return false;
  return commercialClosers.some((name) => {
    const n = String(name).trim().toLowerCase();
    if (!n) return false;
    return c === n || c.startsWith(`${n} `) || n.startsWith(`${c} `);
  });
}

export function roundMoney(n) {
  if (n == null || !Number.isFinite(Number(n))) return n;
  return Math.round(Number(n) * 100) / 100;
}

export function toNumberOrNull(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function mapSprayProductToSlug(productName) {
  const n = String(productName || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!n) return null;
  if (n.includes('biomix')) return 'biomix';
  if (n.includes('algimouss')) return 'algimouss';
  if (n.includes('algivert')) return 'algivert';
  if (n.includes('kleenku')) return 'kleenkup';
  if (n.includes('amphi')) return 'amphiclean';
  return null;
}

export function mapTaskLabelToService(taskLabel) {
  if (!taskLabel) return null;
  const n = String(taskLabel)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  for (const s of SERVICE_CODES) {
    if (n.includes(s.code) || n.includes(s.label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))) {
      return s.code;
    }
  }
  if (n.includes('nettoy') || n.includes('pression') || n.includes('eau')) return 'nettoyage';
  if (n.includes('pulve') || n.includes('spray') || n.includes('traitement')) return 'biomix';
  if (n.includes('hydro')) return 'hydrogommage';
  if (n.includes('peint')) return 'peinture';
  if (n.includes('demouss') || n.includes('mouss')) return 'demoussage';
  return null;
}
