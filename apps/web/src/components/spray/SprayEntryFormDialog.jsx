import React, { useEffect, useState } from 'react';
import { Loader2, Droplets, Building2, FolderKanban } from 'lucide-react';
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
import { todayISODate } from '@/lib/timeTracking';
import { cn } from '@/lib/utils';
import CompanyCamProjectPicker from '@/components/time/CompanyCamProjectPicker';

export const SPRAY_PRODUCTS = [
  'Amphiclean',
  'Biomix',
  'Algimouss',
  'Algivert',
  'Product Kleenku',
];

export const SPRAY_EQUIPMENT = [
  'Gladiator pump',
  '24V electric pump',
  '220v electric pump',
];

export const SPRAY_DILUTIONS = [
  '1%',
  '2%',
  '5%',
  '10%',
  '15%',
  '25%',
  '33%',
  '50%',
  '100%',
];

const emptyForm = (defaults = {}) => ({
  user_id: defaults.user_id || '',
  project_id: defaults.project_id || '',
  work_date: defaults.work_date || todayISODate(),
  product: defaults.product || '',
  surface_m2: defaults.surface_m2 ?? '',
  spray_hours: defaults.spray_hours ?? '',
  method: defaults.method || '',
  product_quantity: defaults.product_quantity ?? '',
  dilution: defaults.dilution || '33%',
  notes: defaults.notes || '',
  client_name: defaults.client_name || '',
  client_source: defaults.client_source || 'app',
  companycam_project_id: defaults.companycam_project_id || '',
  companycam_project_name: defaults.companycam_project_name || '',
});

const SprayEntryFormDialog = ({
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
      let source = entry.client_source || 'app';
      if (hasCc) source = 'companycam';
      else if (hasApp) source = 'app';
      else if (entry.client_name) source = 'manual';
      else source = 'app';

      setForm({
        user_id: entry.user_id || user?.id || '',
        project_id: entry.project_id || '',
        work_date: entry.work_date || todayISODate(),
        product: entry.product || '',
        surface_m2: entry.surface_m2 ?? '',
        spray_hours: entry.spray_hours ?? '',
        method: entry.method || '',
        product_quantity: entry.product_quantity ?? '',
        dilution: entry.dilution || '33%',
        notes: entry.notes || '',
        client_name: entry.client_name || '',
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

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleClientSourceChange = (source) => {
    if (lockProject) return;
    setForm((prev) => ({
      ...prev,
      client_source: source,
      project_id: source === 'app' ? prev.project_id : '',
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
        project_id: '',
      }));
      return;
    }
    const name = pickedName || `CompanyCam #${ccId}`;
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
      project_id: linkedAppId || '',
      client_source: 'companycam',
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.user_id) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Sélectionnez un membre.' });
      return;
    }
    if (!form.work_date) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'La date est obligatoire.' });
      return;
    }
    if (!form.product?.trim()) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Indiquez le produit.' });
      return;
    }

    const source = lockProject ? 'app' : form.client_source || 'app';
    let projectId = form.project_id && form.project_id !== 'none' ? form.project_id : null;
    if (lockProject) projectId = defaultProjectId || projectId;
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
      if (!projectId) projectId = null;
      if (ccId && !clientName) clientName = ccName;
    }

    const toNum = (v) => {
      if (v === '' || v == null) return null;
      const n = Number(String(v).replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    };

    const payload = {
      user_id: form.user_id,
      project_id: projectId,
      work_date: form.work_date,
      product: form.product.trim(),
      surface_m2: toNum(form.surface_m2),
      spray_hours: toNum(form.spray_hours),
      method: form.method?.trim() || null,
      product_quantity: toNum(form.product_quantity),
      dilution: form.dilution?.trim() || null,
      notes: form.notes?.trim() || null,
      client_name: clientName,
      client_source: source,
      companycam_project_id: ccId,
      companycam_project_name: ccName,
    };

    setSaving(true);
    try {
      let error;
      if (entry?.id) {
        ({ error } = await supabase.from('spray_entries').update(payload).eq('id', entry.id));
      } else {
        ({ error } = await supabase.from('spray_entries').insert(payload));
      }
      if (error) throw error;
      toast({
        title: entry ? 'Entrée mise à jour' : 'Pulvérisation enregistrée',
        description: entry
          ? 'Les modifications ont été sauvegardées.'
          : 'La quantité de produit a été ajoutée.',
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
            <Droplets className="h-5 w-5 text-primary" />
            {entry ? 'Modifier la pulvérisation' : 'Nouvelle pulvérisation'}
          </DialogTitle>
          <DialogDescription>
            Quantité de produit, dilution, surface et méthode — par client.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Membre d&apos;équipe</Label>
            <Select
              value={form.user_id || 'none'}
              onValueChange={(v) => setField('user_id', v === 'none' ? '' : v)}
            >
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue placeholder="Choisir un membre" />
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

          <div className="space-y-2">
            <Label>Client / projet</Label>
            {lockProject || lockCompanyCam ? (
              <Input
                className="h-11 rounded-xl bg-muted"
                value={
                  lockCompanyCam
                    ? ccProjectName || form.companycam_project_name || 'Projet CompanyCam'
                    : projects.find((p) => p.id === (form.project_id || defaultProjectId))?.name || 'Projet actuel'
                }
                disabled
              />
            ) : (
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

            {!lockProject && !lockCompanyCam &&
              (form.client_source === 'app' ? (
                <Select
                  value={form.project_id || 'none'}
                  onValueChange={handleAppProjectSelect}
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
              ))}

            {form.client_name && (
              <p className="text-xs text-muted-foreground px-1">
                Client : <span className="font-medium text-foreground">{form.client_name}</span>
              </p>
            )}
          </div>

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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Produit</Label>
              <Select
                value={form.product || 'custom'}
                onValueChange={(v) => {
                  if (v === 'custom') setField('product', '');
                  else setField('product', v);
                }}
              >
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder="Choisir un produit" />
                </SelectTrigger>
                <SelectContent>
                  {SPRAY_PRODUCTS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">Autre…</SelectItem>
                </SelectContent>
              </Select>
              {!SPRAY_PRODUCTS.includes(form.product) && (
                <Input
                  className="h-11 rounded-xl mt-2"
                  placeholder="Nom du produit"
                  value={form.product}
                  onChange={(e) => setField('product', e.target.value)}
                />
              )}
            </div>
            <div className="space-y-2">
              <Label>Dilution</Label>
              <Select
                value={SPRAY_DILUTIONS.includes(form.dilution) ? form.dilution : 'custom'}
                onValueChange={(v) => {
                  if (v === 'custom') setField('dilution', '');
                  else setField('dilution', v);
                }}
              >
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder="Choisir une dilution" />
                </SelectTrigger>
                <SelectContent>
                  {SPRAY_DILUTIONS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">Autre…</SelectItem>
                </SelectContent>
              </Select>
              {!SPRAY_DILUTIONS.includes(form.dilution) && (
                <Input
                  className="h-11 rounded-xl mt-2"
                  placeholder="Dilution personnalisée"
                  value={form.dilution}
                  onChange={(e) => setField('dilution', e.target.value)}
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Surface (m²)</Label>
              <Input
                type="number"
                min={0}
                step={1}
                className="h-11 rounded-xl"
                value={form.surface_m2}
                onChange={(e) => setField('surface_m2', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Temps (h)</Label>
              <Input
                type="number"
                min={0}
                step={0.5}
                className="h-11 rounded-xl"
                value={form.spray_hours}
                onChange={(e) => setField('spray_hours', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Qté produit</Label>
              <Input
                type="number"
                min={0}
                step={1}
                className="h-11 rounded-xl"
                value={form.product_quantity}
                onChange={(e) => setField('product_quantity', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Matériel utilisé</Label>
            <Select
              value={SPRAY_EQUIPMENT.includes(form.method) ? form.method : 'none'}
              onValueChange={(v) => {
                if (v === 'none') {
                  setField('method', '');
                  return;
                }
                setField('method', v);
              }}
            >
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue placeholder="Choisir le matériel…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {SPRAY_EQUIPMENT.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              className="rounded-xl min-h-[70px]"
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

export default SprayEntryFormDialog;
