/** Parse "HH:MM" or "HH:MM:SS" to minutes from midnight */
export function timeToMinutes(timeStr) {
  if (!timeStr) return null;
  const parts = String(timeStr).split(':').map(Number);
  if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return null;
  return parts[0] * 60 + parts[1];
}

/** Minutes worked = end - start - break (handles overnight) */
export function computeWorkedMinutes(startTime, endTime, breakMinutes = 0) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start == null || end == null) return null;
  let diff = end - start;
  if (diff < 0) diff += 24 * 60;
  const breakMin = Math.max(0, Number(breakMinutes) || 0);
  return Math.max(0, diff - breakMin);
}

export function minutesToHoursDecimal(minutes) {
  if (minutes == null) return null;
  return Math.round((minutes / 60) * 100) / 100;
}

export function formatHoursDecimal(hours) {
  if (hours == null || Number.isNaN(hours)) return '—';
  return Number(hours).toFixed(2);
}

/** Standard day = 8h; overtime = max(0, worked - 8) */
export function computeOvertimeHours(workedMinutes, standardMinutes = 8 * 60) {
  if (workedMinutes == null) return null;
  return minutesToHoursDecimal(Math.max(0, workedMinutes - standardMinutes));
}

export function formatDurationHM(minutes) {
  if (minutes == null) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatTimeDisplay(timeStr) {
  if (!timeStr) return '—';
  const parts = String(timeStr).split(':');
  return `${parts[0]}:${parts[1]}`;
}

const DAY_NAMES_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const DAY_NAMES_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function getDayLabel(dateStr, locale = 'fr') {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  const names = locale === 'fr' ? DAY_NAMES_FR : DAY_NAMES_EN;
  return names[d.getDay()];
}

export function formatDateDisplay(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = String(dateStr).split('-');
  if (!d) return dateStr;
  return `${d}/${m}/${y}`;
}

export function todayISODate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function nowTimeHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function enrichEntry(entry) {
  const workedMin = computeWorkedMinutes(entry.start_time, entry.end_time, entry.break_minutes);
  const hours = minutesToHoursDecimal(workedMin);
  const overtime = computeOvertimeHours(workedMin);
  return {
    ...entry,
    _workedMinutes: workedMin,
    _hoursWorked: hours,
    _overtime: overtime,
  };
}

export function sumHours(entries) {
  return entries.reduce((acc, e) => {
    const enriched = e._hoursWorked != null ? e : enrichEntry(e);
    return acc + (enriched._hoursWorked || 0);
  }, 0);
}
