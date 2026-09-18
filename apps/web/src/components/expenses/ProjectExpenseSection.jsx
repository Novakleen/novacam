import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Wallet, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import ExpenseEntriesTable from '@/components/expenses/ExpenseEntriesTable';
import ExpenseEntryFormDialog from '@/components/expenses/ExpenseEntryFormDialog';
import { formatMoney } from '@/lib/margin/format';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';

const ProjectExpenseSection = ({ projectId, projectName, companycamProjectId }) => {
  const { toast } = useToast();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const fetchEntries = useCallback(async () => {
    if (!projectId && !companycamProjectId) return;
    setLoading(true);
    try {
      let query = supabase
        .from('project_expenses')
        .select(`
          *,
          profiles:user_id(id, full_name, email, initials)
        `);

      if (projectId && companycamProjectId) {
        query = query.or(
          `project_id.eq.${projectId},companycam_project_id.eq.${companycamProjectId}`
        );
      } else if (companycamProjectId) {
        query = query.eq('companycam_project_id', companycamProjectId);
      } else {
        query = query.eq('project_id', projectId);
      }

      const { data, error } = await query
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEntries(data || []);
    } catch (err) {
      console.error(err);
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: 'Impossible de charger les dépenses du projet.',
      });
    } finally {
      setLoading(false);
    }
  }, [projectId, companycamProjectId, toast]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const handleDelete = async () => {
    if (!deleting?.id) return;
    setDeletingBusy(true);
    try {
      const { error } = await supabase.from('project_expenses').delete().eq('id', deleting.id);
      if (error) throw error;
      toast({ title: 'Supprimé', description: 'La dépense a été supprimée.' });
      setDeleting(null);
      fetchEntries();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: err.message || 'Suppression impossible.',
      });
    } finally {
      setDeletingBusy(false);
    }
  };

  const totalHt = useMemo(
    () => entries.reduce((sum, e) => sum + (Number(e.amount_ht) || 0), 0),
    [entries]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Wallet className="h-5 w-5 text-amber-600" />
            Autres dépenses
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Total HT :{' '}
            <span className="font-semibold text-foreground">{formatMoney(totalHt)}</span>
            {entries.length > 0 && (
              <span className="text-muted-foreground">
                {' '}
                · {entries.length} entrée{entries.length > 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="rounded-xl h-10" onClick={fetchEntries}>
            <RefreshCw className="h-4 w-4 mr-2" /> Actualiser
          </Button>
          <Button
            size="sm"
            className="rounded-xl h-10 bg-amber-600 hover:bg-amber-700"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" /> Nouvelle dépense
          </Button>
        </div>
      </div>

      <ExpenseEntriesTable
        entries={entries}
        loading={loading}
        emptyMessage="Aucune dépense sur ce projet. Ajoutez une première entrée."
        onEdit={(row) => {
          setEditing(row);
          setFormOpen(true);
        }}
        onDelete={setDeleting}
      />

      <ExpenseEntryFormDialog
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setEditing(null);
        }}
        entry={editing}
        projects={projectId ? [{ id: projectId, name: projectName || 'Projet' }] : []}
        defaultProjectId={projectId || null}
        lockProject={Boolean(projectId)}
        lockCompanyCam={!projectId && Boolean(companycamProjectId)}
        ccProjectId={companycamProjectId || null}
        ccProjectName={projectName || null}
        onSuccess={fetchEntries}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette dépense ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est définitive et retirera la dépense du projet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-red-600 hover:bg-red-700"
              onClick={handleDelete}
              disabled={deletingBusy}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ProjectExpenseSection;
