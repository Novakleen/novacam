import React, { useEffect, useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import AddressSearchInput from '@/components/ui/AddressSearchInput';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { SERVICE_CODES, formatMix, parseMix } from '@/lib/margin/constants';
import { saveDossier } from '@/lib/margin/api';
import { importFromProject } from '@/lib/margin/importFromProject';
import InvoicesEditor from './InvoicesEditor';
import HourLinesEditor from './HourLinesEditor';
import ProductLinesEditor from './ProductLinesEditor';

const emptyForm = () => ({
  project_id: '',
  client_name: '',
  mixAtoms: [],
  closer: '',
  exception: false,
  client_address: '',
  notes: '',
  invoices: [],
  hourLines: [],
  productLines: [],
});

function dossierToForm(dossier) {
  if (!dossier) return emptyForm();
  return {
    project_id: dossier.project_id || '',
    client_name: dossier.client_name || '',
    mixAtoms: parseMix(dossier.mix),
    closer: dossier.closer || '',
    exception: Boolean(dossier.exception),
    client_address: dossier.client_address || '',
    notes: dossier.notes || '',
    invoices: Array.isArray(dossier.invoices) ? dossier.invoices : [],
    hourLines: (dossier.hour_lines || []).map((l) => ({
      work_date: l.work_date,
      service: l.service || 'autre',
      people: l.people || [],
    })),
    productLines: (dossier.product_lines || []).map((l) => ({
      work_date: l.work_date,
      product: l.product || l.slug,
      liters: l.liters,
      m2: l.m2,
    })),
  };
}

const DossierForm = ({
  open,
  onOpenChange,
  dossier,
  projects = [],
  profiles = [],
  closers = [],
  onSaved,
}) => {
  const { toast } = useToast();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (open) setForm(dossierToForm(dossier));
  }, [open, dossier]);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const closerOptions = useMemo(() => {
    const names = new Set();
    (closers || []).forEach((n) => n && names.add(n));
    profiles.forEach((p) => {
      const first = (p.full_name || '').split(' ')[0];
      if (first) names.add(first);
      if (p.full_name) names.add(p.full_name);
    });
    if (form.closer) names.add(form.closer);
    return [...names];
  }, [closers, profiles, form.closer]);

  const toggleMix = (code) => {
    setForm((prev) => {
      const has = prev.mixAtoms.includes(code);
      return {
        ...prev,
        mixAtoms: has ? prev.mixAtoms.filter((c) => c !== code) : [...prev.mixAtoms, code],
      };
    });
  };

  const handleProjectChange = (projectId) => {
    if (projectId === '__none__') {
      setField('project_id', '');
      return;
    }
    const project = projects.find((p) => p.id === projectId);
    setForm((prev) => ({
      ...prev,
      project_id: projectId,
      client_name: prev.client_name || project?.name || '',
      client_address: prev.client_address || project?.full_address || project?.address || '',
    }));
  };

  const handleImport = async () => {
    if (!form.project_id) {
      toast({
        variant: 'destructive',
        title: 'Projet requis',
        description: 'Liez un projet Novacam avant d’importer.',
      });
      return;
    }
    setImporting(true);
    try {
      const result = await importFromProject(supabase, form.project_id);
      if (result.error) throw new Error(result.error);
      setForm((prev) => ({
        ...prev,
        client_name: result.client_name || prev.client_name,
        client_address: result.client_address || prev.client_address,
        project_id: result.project_id || prev.project_id,
        hourLines: result.hourLines?.length ? result.hourLines : prev.hourLines,
        productLines: result.productLines?.length ? result.productLines : prev.productLines,
      }));
      toast({
        title: 'Import projet',
        description: `${result.imported.timeCount} entrée(s) temps, ${result.imported.sprayCount} spray → ${result.imported.hourLineCount} ligne(s) heures, ${result.imported.productLineCount} produit(s).`,
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Import impossible',
        description: err.message,
      });
    } finally {
      setImporting(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.client_name.trim()) {
      toast({ variant: 'destructive', title: 'Client requis' });
      return;
    }
    setSaving(true);
    try {
      await saveDossier({
        existingId: dossier?.id || null,
        dossier: {
          project_id: form.project_id || null,
          client_name: form.client_name.trim(),
          mix: formatMix(form.mixAtoms),
          closer: form.closer || null,
          exception: form.exception,
          client_address: form.client_address || null,
          notes: form.notes || null,
          invoices: form.invoices,
        },
        hourLines: form.hourLines,
        productLines: form.productLines,
      });
      toast({ title: dossier?.id ? 'Dossier mis à jour' : 'Dossier créé' });
      onOpenChange(false);
      if (onSaved) onSaved();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Enregistrement impossible',
        description: err.message,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{dossier?.id ? 'Modifier le dossier' : 'Nouveau dossier'}</DialogTitle>
          <DialogDescription>
            Client, mix, factures HT, heures et produits. Le carburant se calcule à partir des adresses.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Client</Label>
              <Input
                value={form.client_name}
                onChange={(e) => setField('client_name', e.target.value)}
                placeholder="Nom du client"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Projet Novacam (optionnel)</Label>
              <div className="flex gap-2">
                <Select value={form.project_id || '__none__'} onValueChange={handleProjectChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Lier un projet" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Aucun</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleImport}
                  disabled={!form.project_id || importing}
                  className="shrink-0"
                >
                  {importing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-1" />
                  )}
                  Importer depuis projet
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Adresse chantier</Label>
            <AddressSearchInput
              defaultValue={form.client_address}
              placeholder="Adresse du client…"
              onInputChange={(v) => setField('client_address', v)}
              onSelect={(item) =>
                setField('client_address', item.display_name || item.formattedAddress || '')
              }
            />
          </div>

          <div className="space-y-2">
            <Label>Mix (atomes)</Label>
            <div className="flex flex-wrap gap-3">
              {SERVICE_CODES.filter((s) => s.code !== 'autre').map((s) => {
                const checked = form.mixAtoms.includes(s.code);
                return (
                  <label key={s.code} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleMix(s.code)}
                    />
                    {s.label}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Closer</Label>
              <Select
                value={form.closer || '__none__'}
                onValueChange={(v) => setField('closer', v === '__none__' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Closer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Aucun</SelectItem>
                  {closerOptions.map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={form.exception}
                  onCheckedChange={(v) => setField('exception', Boolean(v))}
                />
                Exception
              </label>
            </div>
          </div>

          <InvoicesEditor invoices={form.invoices} onChange={(invoices) => setField('invoices', invoices)} />
          <HourLinesEditor
            lines={form.hourLines}
            onChange={(hourLines) => setField('hourLines', hourLines)}
            profiles={profiles}
          />
          <ProductLinesEditor
            lines={form.productLines}
            onChange={(productLines) => setField('productLines', productLines)}
          />

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setField('notes', e.target.value)}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default DossierForm;
