import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Clock, Building2, FolderKanban } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  computeWorkedMinutes,
  formatHoursDecimal,
  minutesToHoursDecimal,
  computeOvertimeHours,
  todayISODate,
  nowTimeHHMM,
} from '@/lib/timeTracking';
import { cn } from '@/lib/utils';
import CompanyCamProjectPicker from '@/components/time/CompanyCamProjectPicker';
import HubSpotTaskPicker from '@/components/time/HubSpotTaskPicker';

const emptyForm = (defaults = {}) => ({
  user_id: defaults.user_id || '',
  project_id: defaults.project_id || '',
  work_date: defaults.work_date || todayISODate(),
  start_time: defaults.start_time || nowTimeHHMM(),
  end_time: defaults.end_time || '',
  break_minutes: defaults.break_minutes ?? 0,
  notes: defaults.notes || '',
  client_name: defaults.client_name || '',
  task_label: defaults.task_label || '',
  client_source: defaults.client_source || 'app',
  companycam_project_id: defaults.companycam_project_id || '',
  companycam_project_name: defaults.companycam_project_name || '',
});

const TimeEntryFormDialog = ({
  open,
  onOpenChange,
  entry = null,
  projects = [],
  users = [],
  defaultProjectId = null,
  lockProject = false,
  lockCompanyCam = false,
  ccProjectId = null,
  ccProjectName = null,
  hubspotContactId: hubspotContactIdProp = null,
  onSuccess,
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() =>
    emptyForm({ user_id: user?.id, project_id: defaultProjectId || '' })
  );

  useEffect(() => {
    if (!open) return;
    if (entry) {
      const hasCc = Boolean(entry.companycam_project_id);
      const hasApp = Boolean(entry.project_id);
      let source = entry.client_source || 'manual';
      if (hasCc) source = 'companycam';
      else if (hasApp) source = 'app';
      else if (entry.client_name) source = 'manual';
      else source = 'app';

      setForm({
        user_id: entry.user_id || user?.id || '',
        project_id: entry.project_id || '',
        work_date: entry.work_date || todayISODate(),
        start_time: entry.start_time ? String(entry.start_time).slice(0, 5) : '',
        end_time: entry.end_time ? String(entry.end_time).slice(0, 5) : '',
        break_minutes: entry.break_minutes ?? 0,
        notes: entry.notes || '',
        client_name: entry.client_name || '',
        task_label: entry.task_label || '',
        client_source: lockProject ? 'app' : source,
        companycam_project_id: entry.companycam_project_id
          ? String(entry.companycam_project_id)
          : '',
        companycam_project_name: entry.companycam_project_name || '',
      });
    } else {
      setForm(
        emptyForm({
          user_id: user?.id || '',
          project_id: defaultProjectId || '',
          client_source: lockCompanyCam ? 'companycam' : 'app',
          companycam_project_id: lockCompanyCam ? String(ccProjectId || '') : '',
          companycam_project_name: lockCompanyCam ? ccProjectName || '' : '',
          client_name: lockCompanyCam ? ccProjectName || '' : '',
        })
      );
    }
  }, [open, entry, user?.id, defaultProjectId, lockProject, lockCompanyCam, ccProjectId, ccProjectName]);

  const preview = useMemo(() => {
    const min = computeWorkedMinutes(form.start_time, form.end_time, form.break_minutes);
    return {
      hours: minutesToHoursDecimal(min),
      overtime: computeOvertimeHours(min),
    };
  }, [form.start_time, form.end_time, form.break_minutes]);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const resolvedHubspotContactId = useMemo(() => {
    if (hubspotContactIdProp) return String(hubspotContactIdProp);
    const pid = form.project_id;
    if (!pid) return null;
    const proj = projects.find((x) => x.id === pid);
    return proj?.hubspot_contact_id ? String(proj.hubspot_contact_id) : null;
  }, [hubspotContactIdProp, form.project_id, projects]);

  const handleClientSourceChange = (source) => {
    setForm((prev) => ({
      ...prev,
      client_source: source,
      // Clear the other source selection when switching
      project_id: source === 'app' ? prev.project_id : lockProject ? prev.project_id : '',
      companycam_project_id: source === 'companycam' ? prev.companycam_project_id : '',
      companycam_project_name: source === 'companycam' ? prev.companycam_project_name : '',
      client_name:
        source === 'app'
          ? projects.find((p) => p.id === prev.project_id)?.name || prev.client_name
          : source === 'companycam'
            ? prev.companycam_project_name || prev.client_name
            : prev.client_name,
    }));
  };

  const handleAppProjectSelect = (projectId) => {
    if (projectId === 'none') {
      setForm((prev) => ({
        ...prev,
        project_id: '',
        client_name: '',
        companycam_project_id: '',
        companycam_project_name: '',
      }));
      return;
    }
    const p = projects.find((x) => x.id === projectId);
    setForm((prev) => ({
      ...prev,
      project_id: projectId,
      client_name: p?.name || '',
      companycam_project_id: '',
      companycam_project_name: '',
      client_source: 'app',
    }));
  };

  const handleCcProjectSelect = ({ id: ccId, name: pickedName, raw }) => {
    if (!ccId) {
      setForm((prev) => ({
        ...prev,
        companycam_project_id: '',
        companycam_project_name: '',
        client_name: '',
        project_id: lockProject ? prev.project_id : '',
      }));
      return;
    }
    const name = pickedName || `CompanyCam #${ccId}`;
    // If CC project is linked to a Supabase project, prefer that link when available
    const linkedAppId =
      raw?.supabase_id ||
      projects.find(
        (ap) => ap.companycam_project_id && String(ap.companycam_project_id) === String(ccId)
      )?.id ||
      '';

    setForm((prev) => ({
      ...prev,
      companycam_project_id: String(ccId),
      companycam_project_name: name,
      client_name: name,
      project_id: lockProject ? prev.project_id : linkedAppId || '',
      client_source: 'companycam',
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.user_id) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Sélectionnez un utilisateur.' });
      return;
    }
    if (!form.work_date || !form.start_time) {
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: 'Date et heure de début obligatoires.',
      });
      return;
    }

    const breakMin = Math.max(0, parseInt(form.break_minutes, 10) || 0);
    const source = lockCompanyCam ? 'companycam' : form.client_source || 'app';

    let projectId = form.project_id && form.project_id !== 'none' ? form.project_id : null;
    let ccId = form.companycam_project_id ? String(form.companycam_project_id) : null;
    let ccName = form.companycam_project_name?.trim() || null;
    let clientName = form.client_name?.trim() || null;

    if (source === 'app') {
      ccId = null;
      ccName = null;
      if (projectId) {
        const p = projects.find((x) => x.id === projectId);
        clientName = p?.name || clientName;
      }
    } else if (source === 'companycam') {
      if (!lockProject) {
        // Keep linked app project if any, otherwise clear
        if (!projectId) projectId = null;
      }
      if (ccId && !clientName) clientName = ccName;
    }

    const payload = {
      user_id: form.user_id,
      project_id: projectId,
      work_date: form.work_date,
      start_time: form.start_time.length === 5 ? `${form.start_time}:00` : form.start_time,
      end_time: form.end_time
        ? form.end_time.length === 5
          ? `${form.end_time}:00`
          : form.end_time
        : null,
      break_minutes: breakMin,
      notes: form.notes?.trim() || null,
      client_name: clientName,
      task_label: form.task_label?.trim() || null,
      client_source: source,
      companycam_project_id: ccId,
      companycam_project_name: ccName,
    };

    setSaving(true);
    try {
      let error;
      if (entry?.id) {
        ({ error } = await supabase.from('time_entries').update(payload).eq('id', entry.id));
      } else {
        ({ error } = await supabase.from('time_entries').insert(payload));
      }
      if (error) throw error;
      toast({
        title: entry ? 'Entrée mise à jour' : 'Heures enregistrées',
        description: entry
          ? 'Les modifications ont été sauvegardées.'
          : 'La prestation a été ajoutée.',
      });
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      console.error(err);
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: err.message || "Impossible d'enregistrer l'entrée.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            {entry ? 'Modifier le pointage' : 'Nouvelle entrée de temps'}
          </DialogTitle>
          <DialogDescription>
            Encodez les heures prestées avec pause, comme sur Excel.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Utilisateur</Label>
            <Select
              value={form.user_id || 'none'}
              onValueChange={(v) => setField('user_id', v === 'none' ? '' : v)}
            >
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue placeholder="Choisir un utilisateur" />
              </SelectTrigger>
              <SelectContent>
                {users.length === 0 && user && (
                  <SelectItem value={user.id}>Moi</SelectItem>
                )}
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name || u.email || u.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(lockProject || lockCompanyCam) && (
            <div className="space-y-2">
              <Label>Projet</Label>
              <Input
                className="h-11 rounded-xl bg-muted"
                value={
                  lockCompanyCam
                    ? ccProjectName || form.companycam_project_name || 'Projet CompanyCam'
                    : projects.find((p) => p.id === form.project_id)?.name || 'Projet actuel'
                }
                disabled
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                className="h-11 rounded-xl"
                value={form.work_date}
                onChange={(e) => setField('work_date', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Début</Label>
              <Input
                type="time"
                className="h-11 rounded-xl"
                value={form.start_time}
                onChange={(e) => setField('start_time', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Fin</Label>
              <Input
                type="time"
                className="h-11 rounded-xl"
                value={form.end_time}
                onChange={(e) => setField('end_time', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Pause (min)</Label>
              <Input
                type="number"
                min={0}
                step={5}
                className="h-11 rounded-xl"
                value={form.break_minutes}
                onChange={(e) => setField('break_minutes', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Aperçu calculé</Label>
              <div className="h-11 rounded-xl border bg-muted/40 px-3 flex items-center text-sm gap-3">
                <span>
                  Presté : <strong>{formatHoursDecimal(preview.hours)} h</strong>
                </span>
                <span className="text-red-500">
                  OT : {formatHoursDecimal(preview.overtime)} h
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Projet / tâche</Label>
            <HubSpotTaskPicker
              value={form.task_label}
              onChange={(v) => setField('task_label', v)}
              hubspotContactId={resolvedHubspotContactId}
              placeholder="Service HubSpot (devis / catalogue)…"
            />
          </div>

          <div className="space-y-2">
            <Label>Client</Label>
            {!lockCompanyCam && (
              <div className="flex rounded-xl border border-border overflow-hidden p-1 bg-muted/40 gap-1">
                <button
                  type="button"
                  onClick={() => handleClientSourceChange('app')}
                  className={cn(
                    'flex-1 h-9 rounded-lg text-sm font-medium inline-flex items-center justify-center gap-1.5 transition-colors',
                    form.client_source === 'app'
                      ? 'bg-white dark:bg-slate-800 text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <FolderKanban className="h-3.5 w-3.5" />
                  Projet app
                </button>
                <button
                  type="button"
                  onClick={() => handleClientSourceChange('companycam')}
                  className={cn(
                    'flex-1 h-9 rounded-lg text-sm font-medium inline-flex items-center justify-center gap-1.5 transition-colors',
                    form.client_source === 'companycam'
                      ? 'bg-white dark:bg-slate-800 text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Building2 className="h-3.5 w-3.5" />
                  CompanyCam
                </button>
              </div>
            )}

            {lockCompanyCam ? (
              <Input
                className="h-11 rounded-xl bg-muted"
                value={ccProjectName || form.companycam_project_name || 'Projet CompanyCam'}
                disabled
              />
            ) : form.client_source === 'app' ? (
              <Select
                value={form.project_id || 'none'}
                onValueChange={handleAppProjectSelect}
                disabled={lockProject}
              >
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder="Choisir un projet de l'app…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucun client</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <CompanyCamProjectPicker
                value={form.companycam_project_id || ''}
                selectedName={form.companycam_project_name || form.client_name || ''}
                onSelect={handleCcProjectSelect}
              />
            )}

            {form.client_name && (
              <p className="text-xs text-muted-foreground px-1">
                Client enregistré : <span className="font-medium text-foreground">{form.client_name}</span>
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              className="rounded-xl min-h-[80px]"
              placeholder="Ajouter une note…"
              value={form.notes}
              onChange={(e) => setField('notes', e.target.value)}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => onOpenChange(false)}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-blue-600 hover:bg-blue-700"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {entry ? 'Enregistrer' : 'Ajouter'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default TimeEntryFormDialog;
