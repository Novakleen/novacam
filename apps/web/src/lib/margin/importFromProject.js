import { computeWorkedMinutes, minutesToHoursDecimal } from '@/lib/timeTracking';
import { resolveCloserFromContactOwner } from '@/lib/hubspotService';
import { mapSprayProductToSlug, mapTaskLabelToService, roundMoney, toNumberOrNull } from './constants';
import { normalizeFuelAddress } from './fuel';

/**
 * Pull Suivi data (time + spray + expenses) + HubSpot invoice into dossier form fields.
 * Accepts Novacam `projectId` and/or `companycamProjectId` (same OR filters as ProjectTimeSection).
 */
export async function importFromProject(supabase, projectIdOrOpts, maybeCcId) {
  const opts =
    projectIdOrOpts && typeof projectIdOrOpts === 'object'
      ? projectIdOrOpts
      : { projectId: projectIdOrOpts, companycamProjectId: maybeCcId };

  const projectId = opts.projectId || null;
  const companycamProjectId = opts.companycamProjectId
    ? String(opts.companycamProjectId)
    : null;
  const clientAddressHint = normalizeFuelAddress(opts.clientAddressHint || opts.clientAddress || '');

  if (!projectId && !companycamProjectId) {
    return { error: 'Aucun projet sélectionné' };
  }

  const project = await resolveProject(supabase, projectId, companycamProjectId);
  if (project?.error) return { error: project.error };

  const [timeRes, sprayRes, expenseRes] = await Promise.all([
    fetchScoped(supabase, 'time_entries', project?.id, companycamProjectId || project?.companycam_project_id, {
      select: '*, profiles:user_id(id, full_name, email, address)',
      orderBy: 'work_date',
    }),
    fetchScoped(supabase, 'spray_entries', project?.id, companycamProjectId || project?.companycam_project_id, {
      select: '*',
      orderBy: 'work_date',
    }),
    fetchScoped(supabase, 'project_expenses', project?.id, companycamProjectId || project?.companycam_project_id, {
      select: 'id, amount_ht, expense_date, updated_at, label, category',
      orderBy: 'expense_date',
    }),
  ]);

  if (timeRes.error) return { error: timeRes.error.message };
  if (sprayRes.error) return { error: sprayRes.error.message };
  if (expenseRes.error) return { error: expenseRes.error.message };

  const timeEntries = timeRes.data || [];
  const sprayEntries = sprayRes.data || [];
  const expenses = expenseRes.data || [];

  let hourLines = buildHourLines(timeEntries);
  hourLines = await enrichHourLinesAddresses(supabase, hourLines, timeEntries);
  const productLines = buildProductLines(sprayEntries);
  const otherExpenses = sumExpensesHt(expenses);

  const invoices = buildInvoicesFromProject(project);
  const caHt = invoices.length
    ? roundMoney(invoices.reduce((s, i) => s + (Number(i.caHt) || 0), 0))
    : null;

  const fingerprint = await buildSourceFingerprint({
    timeEntries,
    sprayEntries,
    expenses,
    hubspotInvoiceId: project?.hubspot_invoice_id || null,
    hubspotInvoiceAmount: project?.hubspot_invoice_amount ?? null,
  });

  const fromProject = normalizeFuelAddress(project?.full_address || project?.address || '');
  const client_address = fromProject || clientAddressHint || '';

  let closer = '';
  const hsContactId = project?.hubspot_contact_id
    ? String(project.hubspot_contact_id)
    : opts.hubspotContactId
      ? String(opts.hubspotContactId)
      : null;
  if (hsContactId) {
    closer = (await resolveCloserFromContactOwner(hsContactId)) || '';
  }

  return {
    client_name: project?.name || '',
    client_address,
    project_id: project?.id || projectId || null,
    companycam_project_id:
      companycamProjectId ||
      (project?.companycam_project_id ? String(project.companycam_project_id) : null),
    hubspot_contact_id: hsContactId,
    closer,
    hourLines,
    productLines,
    invoices,
    ca_ht: caHt,
    otherExpenses,
    expenses,
    source_fingerprint: fingerprint,
    imported: {
      timeCount: timeEntries.length,
      sprayCount: sprayEntries.length,
      expenseCount: expenses.length,
      hourLineCount: hourLines.length,
      productLineCount: productLines.length,
    },
  };
}

async function resolveProject(supabase, projectId, companycamProjectId) {
  const cols =
    'id, name, address, full_address, companycam_project_id, created_by, hubspot_contact_id, hubspot_invoice_id, hubspot_invoice_number, hubspot_invoice_amount, hubspot_invoice_currency, hubspot_invoice_status';

  if (projectId) {
    const { data, error } = await supabase
      .from('projects')
      .select(cols)
      .eq('id', projectId)
      .maybeSingle();
    if (error) return { error: error.message };
    if (data) return data;
    if (!companycamProjectId) return { error: 'Projet introuvable' };
  }

  if (companycamProjectId) {
    const { data, error } = await supabase
      .from('projects')
      .select(cols)
      .eq('companycam_project_id', String(companycamProjectId))
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return { error: error.message };
    // CC-only chantier without a Novacam row is OK — return a stub for naming.
    if (data) return data;
    return {
      id: null,
      name: '',
      address: '',
      full_address: '',
      companycam_project_id: String(companycamProjectId),
      hubspot_contact_id: null,
      hubspot_invoice_id: null,
      hubspot_invoice_amount: null,
      hubspot_invoice_number: null,
    };
  }

  return { error: 'Projet introuvable' };
}

async function fetchScoped(supabase, table, projectId, companycamProjectId, { select, orderBy }) {
  let query = supabase.from(table).select(select);
  const ccId = companycamProjectId ? String(companycamProjectId) : null;

  if (projectId && ccId) {
    query = query.or(`project_id.eq.${projectId},companycam_project_id.eq.${ccId}`);
  } else if (ccId) {
    query = query.eq('companycam_project_id', ccId);
  } else {
    query = query.eq('project_id', projectId);
  }

  if (orderBy) query = query.order(orderBy, { ascending: true });
  return query;
}

function buildInvoicesFromProject(project) {
  if (!project) return [];
  const amount = toNumberOrNull(project.hubspot_invoice_amount);
  if (amount == null || amount <= 0) return [];
  return [
    {
      ref: project.hubspot_invoice_number || project.hubspot_invoice_id || 'HubSpot',
      caHt: roundMoney(amount),
      source: 'hubspot',
      hubspot_invoice_id: project.hubspot_invoice_id || null,
    },
  ];
}

function sumExpensesHt(expenses) {
  let sum = 0;
  let any = false;
  for (const e of expenses || []) {
    const v = Number(e.amount_ht);
    if (Number.isFinite(v)) {
      sum += v;
      any = true;
    }
  }
  return any ? roundMoney(sum) : 0;
}

function buildHourLines(entries) {
  const groups = new Map();

  for (const e of entries) {
    const hours = minutesToHoursDecimal(
      computeWorkedMinutes(e.start_time, e.end_time, e.break_minutes)
    );
    if (hours == null || hours <= 0) continue;

    const service = mapTaskLabelToService(e.task_label) || 'autre';
    const date = e.work_date;
    if (!date) continue;
    const key = `${date}::${service}`;

    if (!groups.has(key)) {
      groups.set(key, { work_date: date, service, people: [] });
    }

    const name = e.profiles?.full_name || e.profiles?.email || 'Inconnu';
    groups.get(key).people.push({
      name,
      hours,
      homeAddress: normalizeFuelAddress(e.profiles?.address || ''),
      profileId: e.user_id || e.profiles?.id || null,
    });
  }

  return [...groups.values()];
}

function buildProductLines(entries) {
  const groups = new Map();

  for (const e of entries) {
    const slug = mapSprayProductToSlug(e.product);
    if (!slug) continue;
    const liters = Number(e.product_quantity);
    if (!Number.isFinite(liters) || liters <= 0) continue;
    const date = e.work_date;
    if (!date) continue;
    const key = `${date}::${slug}`;

    if (!groups.has(key)) {
      groups.set(key, {
        work_date: date,
        product: slug,
        liters: 0,
        m2: null,
      });
    }
    const line = groups.get(key);
    line.liters += liters;
    const m2 = Number(e.surface_m2);
    if (Number.isFinite(m2) && m2 > 0) {
      line.m2 = (line.m2 || 0) + m2;
    }
  }

  return [...groups.values()].map((l) => ({
    ...l,
    liters: Math.round(l.liters * 1000) / 1000,
    m2: l.m2 == null ? null : Math.round(l.m2 * 100) / 100,
  }));
}

/**
 * Re-fetch profiles.address when the time_entries embed left homeAddress empty
 * (RLS/join gaps). Mutates people in hourLines.
 */
async function enrichHourLinesAddresses(supabase, hourLines, timeEntries) {
  const missingIds = new Set();
  for (const line of hourLines || []) {
    for (const p of line.people || []) {
      if (!normalizeFuelAddress(p.homeAddress) && p.profileId) {
        missingIds.add(p.profileId);
      }
    }
  }
  // Also catch entries whose embed failed entirely
  for (const e of timeEntries || []) {
    if (e.user_id && !normalizeFuelAddress(e.profiles?.address)) {
      missingIds.add(e.user_id);
    }
  }
  if (!missingIds.size) return hourLines;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, address')
    .in('id', [...missingIds]);
  if (error || !data?.length) return hourLines;

  const byId = Object.fromEntries(
    data.map((r) => [r.id, normalizeFuelAddress(r.address || '')])
  );

  for (const line of hourLines || []) {
    for (const p of line.people || []) {
      if (!normalizeFuelAddress(p.homeAddress) && p.profileId && byId[p.profileId]) {
        p.homeAddress = byId[p.profileId];
      }
    }
  }
  return hourLines;
}

/** Stable SHA-256 of sorted ids+updated_at for Suivi sources + HubSpot invoice. */
export async function buildSourceFingerprint({
  timeEntries = [],
  sprayEntries = [],
  expenses = [],
  hubspotInvoiceId = null,
  hubspotInvoiceAmount = null,
} = {}) {
  const parts = [
    'time:' + serializeRows(timeEntries),
    'spray:' + serializeRows(sprayEntries),
    'exp:' + serializeRows(expenses),
    `hs:${hubspotInvoiceId || ''}:${hubspotInvoiceAmount ?? ''}`,
  ];
  return sha256Hex(parts.join('|'));
}

function serializeRows(rows) {
  return (rows || [])
    .map((r) => `${r.id || ''}:${r.updated_at || r.created_at || ''}`)
    .sort()
    .join(',');
}

export async function computeLiveFingerprint(supabase, { projectId, companycamProjectId }) {
  const project = await resolveProject(supabase, projectId, companycamProjectId);
  if (project?.error) return { error: project.error };

  const ccId = companycamProjectId || project?.companycam_project_id || null;
  const pid = project?.id || projectId || null;

  const [timeRes, sprayRes, expenseRes] = await Promise.all([
    fetchScoped(supabase, 'time_entries', pid, ccId, {
      select: 'id, updated_at, created_at',
      orderBy: null,
    }),
    fetchScoped(supabase, 'spray_entries', pid, ccId, {
      select: 'id, updated_at, created_at',
      orderBy: null,
    }),
    fetchScoped(supabase, 'project_expenses', pid, ccId, {
      select: 'id, updated_at, created_at',
      orderBy: null,
    }),
  ]);

  if (timeRes.error) return { error: timeRes.error.message };
  if (sprayRes.error) return { error: sprayRes.error.message };
  if (expenseRes.error) return { error: expenseRes.error.message };

  const fingerprint = await buildSourceFingerprint({
    timeEntries: timeRes.data || [],
    sprayEntries: sprayRes.data || [],
    expenses: expenseRes.data || [],
    hubspotInvoiceId: project?.hubspot_invoice_id || null,
    hubspotInvoiceAmount: project?.hubspot_invoice_amount ?? null,
  });

  return { fingerprint, project };
}

async function sha256Hex(text) {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback (non-crypto) for rare environments
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = (h * 33) ^ text.charCodeAt(i);
  return `fnv_${(h >>> 0).toString(16)}_${text.length}`;
}
