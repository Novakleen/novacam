import { computeWorkedMinutes, minutesToHoursDecimal } from '@/lib/timeTracking';
import { mapSprayProductToSlug, mapTaskLabelToService } from './constants';

/**
 * Pull a Novacam project + time_entries + spray_entries into dossier form fields.
 * Hours = start/end − break. Spray product_quantity → liters with best-effort slug mapping.
 */
export async function importFromProject(supabase, projectId) {
  if (!projectId) {
    return { error: 'Aucun projet sélectionné' };
  }

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, name, address, full_address')
    .eq('id', projectId)
    .maybeSingle();

  if (projectError) return { error: projectError.message };
  if (!project) return { error: 'Projet introuvable' };

  const [timeRes, sprayRes] = await Promise.all([
    supabase
      .from('time_entries')
      .select('*, profiles:user_id(id, full_name, address)')
      .eq('project_id', projectId)
      .order('work_date', { ascending: true }),
    supabase
      .from('spray_entries')
      .select('*')
      .eq('project_id', projectId)
      .order('work_date', { ascending: true }),
  ]);

  if (timeRes.error) return { error: timeRes.error.message };
  if (sprayRes.error) return { error: sprayRes.error.message };

  const hourLines = buildHourLines(timeRes.data || []);
  const productLines = buildProductLines(sprayRes.data || []);

  return {
    client_name: project.name || '',
    client_address: project.full_address || project.address || '',
    project_id: project.id,
    hourLines,
    productLines,
    imported: {
      timeCount: (timeRes.data || []).length,
      sprayCount: (sprayRes.data || []).length,
      hourLineCount: hourLines.length,
      productLineCount: productLines.length,
    },
  };
}

function buildHourLines(entries) {
  // Group by work_date + inferred service so several people land on the same line.
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
      homeAddress: e.profiles?.address || '',
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
