import React, { useEffect, useState } from 'react';
import { Loader2, Wallet } from 'lucide-react';
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

export const EXPENSE_CATEGORIES = [
  { value: 'nacelle', label: 'Nacelle' },
  { value: 'hotel', label: 'Hôtel' },
  { value: 'parking', label: 'Parking' },
  { value: 'materiel', label: 'Matériel' },
  { value: 'other', label: 'Autre' },
];

export const EXPENSE_CATEGORY_LABELS = Object.fromEntries(
  EXPENSE_CATEGORIES.map((c) => [c.value, c.label])
);

const emptyForm = (defaults = {}) => ({
  user_id: defaults.user_id || '',
  project_id: defaults.project_id || '',
  companycam_project_id: defaults.companycam_project_id || '',
  expense_date: defaults.expense_date || todayISODate(),
  category: defaults.category || 'nacelle',
  label: defaults.label || '',
  amount_ht: defaults.amount_ht ?? '',
  vat_rate: defaults.vat_rate ?? '',
  notes: defaults.notes || '',
});

const ExpenseEntryFormDialog = ({
  open,
  onOpenChange,
  entry = null,
  projects = [],
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
      setForm({
        user_id: entry.user_id || user?.id || '',
        project_id: entry.project_id || defaultProjectId || '',
        companycam_project_id: entry.companycam_project_id
          ? String(entry.companycam_project_id)
          : '',
        expense_date: entry.expense_date || todayISODate(),
        category: entry.category || 'nacelle',
        label: entry.label || '',
        amount_ht: entry.amount_ht ?? '',
        vat_rate: entry.vat_rate ?? '',
        notes: entry.notes || '',
      });
    } else {
      setForm(
        emptyForm({
          user_id: user?.id || '',
          project_id: lockProject ? defaultProjectId || '' : '',
          companycam_project_id: lockCompanyCam ? String(ccProjectId || '') : '',
        })
      );
    }
  }, [
    open,
    entry,
    user?.id,
    defaultProjectId,
    lockProject,
    lockCompanyCam,
    ccProjectId,
  ]);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const lockedProjectLabel = lockCompanyCam
    ? ccProjectName || 'Projet CompanyCam'
    : projects.find((p) => p.id === (form.project_id || defaultProjectId))?.name ||
      'Projet actuel';

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.label?.trim()) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Le libellé est obligatoire.' });
      return;
    }
    if (!form.expense_date) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'La date est obligatoire.' });
      return;
    }
    if (!form.category) {
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: 'Choisissez une catégorie.',
      });
      return;
    }

    const toNum = (v) => {
      if (v === '' || v == null) return null;
      const n = Number(String(v).replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    };

    const amount = toNum(form.amount_ht);
    if (amount == null || amount < 0) {
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: 'Indiquez un montant HT valide (≥ 0).',
      });
      return;
    }

    let projectId = lockProject
      ? defaultProjectId || form.project_id || null
      : form.project_id || null;
    let ccId = lockCompanyCam
      ? String(ccProjectId || form.companycam_project_id || '') || null
      : form.companycam_project_id
        ? String(form.companycam_project_id)
        : null;

    if (lockProject) ccId = ccId || null;
    if (lockCompanyCam) projectId = projectId || null;

    if (!projectId && !ccId) {
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: 'Aucun projet lié à cette dépense.',
      });
      return;
    }

    const payload = {
      user_id: form.user_id || user?.id || null,
      project_id: projectId,
      companycam_project_id: ccId,
      expense_date: form.expense_date,
      category: form.category,
      label: form.label.trim(),
      amount_ht: amount,
      vat_rate: toNum(form.vat_rate),
      notes: form.notes?.trim() || null,
    };

    setSaving(true);
    try {
      let error;
      if (entry?.id) {
        ({ error } = await supabase.from('project_expenses').update(payload).eq('id', entry.id));
      } else {
        ({ error } = await supabase.from('project_expenses').insert(payload));
      }
      if (error) throw error;
      toast({
        title: entry ? 'Dépense mise à jour' : 'Dépense enregistrée',
        description: entry
          ? 'Les modifications ont été sauvegardées.'
          : 'La dépense a été ajoutée au projet.',
      });
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      console.error(err);
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: err.message || "Impossible d'enregistrer la dépense.",
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
            <Wallet className="h-5 w-5 text-amber-600" />
            {entry ? 'Modifier la dépense' : 'Nouvelle dépense'}
          </DialogTitle>
          <DialogDescription>
            Nacelle, hôtel, parking, matériel ou autre — montant HT hors calcul de marge.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {(lockProject || lockCompanyCam) && (
            <div className="space-y-2">
              <Label>Projet</Label>
              <Input className="h-11 rounded-xl bg-muted" value={lockedProjectLabel} disabled />
            </div>
          )}

          <div className="space-y-2">
            <Label>Date</Label>
            <Input
              type="date"
              className="h-11 rounded-xl"
              value={form.expense_date}
              onChange={(e) => setField('expense_date', e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Catégorie</Label>
            <Select
              value={form.category || 'nacelle'}
              onValueChange={(v) => setField('category', v)}
            >
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue placeholder="Choisir une catégorie" />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Libellé</Label>
            <Input
              className="h-11 rounded-xl"
              placeholder="Ex. Location nacelle jour 1"
              value={form.label}
              onChange={(e) => setField('label', e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Montant HT (€)</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                className="h-11 rounded-xl"
                value={form.amount_ht}
                onChange={(e) => setField('amount_ht', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>TVA % (optionnel)</Label>
              <Input
                type="number"
                min={0}
                step={0.1}
                className="h-11 rounded-xl"
                placeholder="21"
                value={form.vat_rate}
                onChange={(e) => setField('vat_rate', e.target.value)}
              />
            </div>
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
              className="rounded-xl bg-amber-600 hover:bg-amber-700"
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

export default ExpenseEntryFormDialog;
