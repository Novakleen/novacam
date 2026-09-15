import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Clock, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import TimeEntriesTable from '@/components/time/TimeEntriesTable';
import TimeEntryFormDialog from '@/components/time/TimeEntryFormDialog';
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
import { formatHoursDecimal, sumHours } from '@/lib/timeTracking';

const ProjectTimeSection = ({ projectId, projectName, companycamProjectId }) => {
  const { toast } = useToast();
  const [entries, setEntries] = useState([]);
  const [users, setUsers] = useState([]);
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
        .from('time_entries')
        .select(`
          *,
          profiles:user_id(id, full_name, email, initials),
          projects:project_id(id, name)
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
        .order('work_date', { ascending: false })
        .order('start_time', { ascending: false });

      if (error) throw error;
      setEntries(data || []);
    } catch (err) {
      console.error(err);
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: 'Impossible de charger les heures du projet.',
      });
    } finally {
      setLoading(false);
    }
  }, [projectId, companycamProjectId, toast]);

  const fetchUsers = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, initials')
      .order('full_name');
    setUsers(data || []);
  }, []);

  useEffect(() => {
    fetchEntries();
    fetchUsers();
  }, [fetchEntries, fetchUsers]);

  const handleDelete = async () => {
    if (!deleting?.id) return;
    setDeletingBusy(true);
    try {
      const { error } = await supabase.from('time_entries').delete().eq('id', deleting.id);
      if (error) throw error;
      toast({ title: 'Supprimé', description: "L'entrée de temps a été supprimée." });
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

  const total = sumHours(entries);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Heures prestées
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Total projet : <span className="font-semibold text-foreground">{formatHoursDecimal(total)} h</span>
            {entries.length > 0 && (
              <span className="text-muted-foreground"> · {entries.length} entrée{entries.length > 1 ? 's' : ''}</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="rounded-xl h-10" onClick={fetchEntries}>
            <RefreshCw className="h-4 w-4 mr-2" /> Actualiser
          </Button>
          <Button
            size="sm"
            className="rounded-xl h-10 bg-blue-600 hover:bg-blue-700"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" /> Ajouter des heures
          </Button>
        </div>
      </div>

      <TimeEntriesTable
        entries={entries}
        loading={loading}
        showUser
        showProject={false}
        emptyMessage="Aucune heure encodée sur ce projet. Ajoutez une première entrée."
        onEdit={(row) => {
          setEditing(row);
          setFormOpen(true);
        }}
        onDelete={setDeleting}
      />

      <TimeEntryFormDialog
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setEditing(null);
        }}
        entry={editing}
        projects={projectId ? [{ id: projectId, name: projectName || 'Projet' }] : []}
        users={users}
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
            <AlertDialogTitle>Supprimer cette entrée ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est définitive. Les heures seront retirées du projet.
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

export default ProjectTimeSection;
