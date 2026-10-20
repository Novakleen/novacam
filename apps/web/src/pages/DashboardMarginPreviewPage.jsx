import { useEffect } from 'react';
import i18n from '@/i18n';
import DashboardPage from '@/pages/DashboardPage';

const swatch = (color) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="${color}"/></svg>`
  )}`;

const photos = (color) =>
  ['#0f766e', '#0369a1', '#b45309', '#7c3aed'].map((tint, index) => ({
    id: `${color}-${index}`,
    url: swatch(index === 0 ? color : tint),
  }));

const nova = (id, name, address, tags, margin, updatedAt) => ({
  id,
  source: 'novacam',
  list_key: `nova-${id}`,
  name,
  address,
  full_address: address,
  updated_at: updatedAt,
  created_at: '2026-03-12T08:00:00.000Z',
  is_archived: false,
  companycam_project_id: null,
  created_by_profile: { full_name: 'Camille Martin', initials: 'CM' },
  project_tags: tags.map((name) => ({ tags: { name } })),
  recent_photos: photos('#0f766e'),
  thumbnail_url: swatch('#0f766e'),
  stats: {
    photos: 18,
    hours: 14.5,
    product_qty: 6.5,
    surface_m2: 220,
    ma_pct: margin?.ma_pct ?? null,
    ma: margin?.ma ?? null,
  },
});

const cc = (id, name, city, tags, margin, updatedAt) => ({
  id,
  source: 'companycam',
  list_key: `cc-${id}`,
  name,
  address: {
    street_address_1: name,
    city,
    postal_code: '1000',
    country: 'BE',
  },
  updated_at: updatedAt,
  created_at: 1760500000,
  is_archived: false,
  tags,
  created_by_profile: { full_name: 'CompanyCam', initials: 'CC' },
  recent_photos: photos('#c2410c'),
  thumbnail_url: swatch('#c2410c'),
  stats: {
    photos: 32,
    hours: 9.0,
    product_qty: 4.0,
    surface_m2: 140,
    ma_pct: margin?.ma_pct ?? null,
    ma: margin?.ma ?? null,
  },
});

const PREVIEW = {
  withMargin: true,
  sourceFilter: 'all',
  tab: 'active',
  tags: [
    { id: 'sc', name: 'SC' },
    { id: 'spre', name: 'SPRE' },
  ],
  novacamProjects: [
    nova(
      'n1',
      'Résidence Les Tilleuls',
      '12 rue des Tilleuls, 1050 Ixelles',
      ['SC', 'SPRE'],
      { ma_pct: 0.46, ma: 1840.5 },
      '2026-10-18T09:30:00.000Z'
    ),
    nova(
      'n2',
      'Bureaux Meir',
      '48 Meir, 2000 Antwerpen',
      ['SC'],
      { ma_pct: 0.28, ma: 960 },
      '2026-10-16T14:10:00.000Z'
    ),
    nova(
      'n3',
      'École Saint-Luc',
      '8 place Saint-Luc, 4000 Liège',
      ['SPRE'],
      null,
      '2026-10-15T11:00:00.000Z'
    ),
  ],
  ccProjects: [
    cc(
      'c1',
      'Chantier Grand-Place',
      'Bruxelles',
      ['SC'],
      { ma_pct: 0.52, ma: 3120 },
      '2026-10-19T16:45:00.000Z'
    ),
    cc(
      'c2',
      'Entrepôt Tour & Taxis',
      'Bruxelles',
      ['SPRE'],
      { ma_pct: 0.18, ma: 430.25 },
      '2026-10-14T08:20:00.000Z'
    ),
    cc('c3', 'Villa Uccle', 'Uccle', ['SC', 'SPRE'], null, '2026-10-12T13:00:00.000Z'),
  ],
  archivedProjects: [
    {
      id: 'a1',
      name: 'Archive avec marge',
      address: '1 rue Archivée, 1000 Bruxelles',
      is_archived: true,
      companycam_project_id: null,
      media: [],
      stats: { ma_pct: 0.33, ma: 500 },
      updated_at: '2026-09-01T10:00:00.000Z',
    },
    {
      id: 'a2',
      name: 'Archive sans marge',
      address: '2 rue Archivée, 1000 Bruxelles',
      is_archived: true,
      companycam_project_id: '999',
      media: [],
      stats: { ma_pct: null, ma: null },
      updated_at: '2026-08-01T10:00:00.000Z',
    },
  ],
};

/** Dev-only dashboard with synthetic projects. Not linked from the menu. */
const DashboardMarginPreviewPage = () => {
  useEffect(() => {
    i18n.changeLanguage('fr');
  }, []);

  return <DashboardPage preview={PREVIEW} />;
};

export default DashboardMarginPreviewPage;
