import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Droplets, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import SprayEntriesTable from '@/components/spray/SprayEntriesTable';
import SprayEntryFormDialog from '@/components/spray/SprayEntryFormDialog';
import { fetchHubSpotContactLatestDealSurface } from '@/lib/hubspotService';
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

const ProjectSpraySection = ({
  projectId,
  projectName,
  companycamProjectId,
  hubspotContactId = null,
  hubspotDealId = null,
  hubspotDealSurfaceM2 = null,
}) => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [entries, setEntries] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [defaultSurfaceM2, setDefaultSurfaceM2] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const persisted =
      hubspotDealSurfaceM2 != null && Number.isFinite(Number(hubspotDealSurfaceM2))
        ? Number(hubspotDealSurfaceM2)
        : null;
    if (persisted != null) setDefaultSurfaceM2(persisted);

    if (!hubspotDealId && !hubspotContactId) {
      if (persisted == null) setDefaultSurfaceM2(null);
      return undefined;
    }
    (async () => {
      try {
        const res = await fetchHubSpotContactLatestDealSurface(hubspotContactId, {
          dealId: hubspotDealId || null,
        });
        if (!cancelled) setDefaultSurfaceM2(res?.surfaceM2 ?? persisted ?? null);
      } catch {
        if (!cancelled) setDefaultSurfaceM2(persisted ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hubspotContactId, hubspotDealId, hubspotDealSurfaceM2]);

  const fetchEntries = useCallback(async () => {
    if (!projectId && !companycamProjectId) return;
    setLoading(true);
    try {
      let query = supabase
        .from('spray_entries')
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
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEntries(data || []);
    } catch (err) {
      console.error(err);
      toast({
        variant: 'destructive',
        title: t('common.error'),
        description: t('spray.loadError'),
      });
    } finally {
      setLoading(false);
    }
  }, [projectId, companycamProjectId, toast, t]);

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
      const { error } = await supabase.from('spray_entries').delete().eq('id', deleting.id);
      if (error) throw error;
      toast({ title: t('common.deleted'), description: t('spray.deletedDesc') });
      setDeleting(null);
      fetchEntries();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: t('common.error'),
        description: err.message || t('common.deleteFailed'),
      });
    } finally {
      setDeletingBusy(false);
    }
  };

  const totals = useMemo(() => {
    let qty = 0;
    let surface = 0;
    let hours = 0;
    entries.forEach((e) => {
      qty += Number(e.product_quantity) || 0;
      surface += Number(e.surface_m2) || 0;
      hours += Number(e.spray_hours) || 0;
    });
    return { qty, surface, hours };
  }, [entries]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Droplets className="h-5 w-5 text-primary" />
            {t('spray.title')}
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('spray.totalProject')}{' '}
            <span className="font-semibold text-foreground">
              {totals.qty.toLocaleString('fr-BE')} qté · {totals.surface.toLocaleString('fr-BE')} m² ·{' '}
              {totals.hours.toFixed(1)} h
            </span>
            {entries.length > 0 && (
              <span className="text-muted-foreground">
                {' '}
                · {t('common.entries', { count: entries.length })}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="rounded-xl h-10" onClick={fetchEntries}>
            <RefreshCw className="h-4 w-4 mr-2" /> {t('common.refresh')}
          </Button>
          <Button
            size="sm"
            className="rounded-xl h-10 bg-blue-600 hover:bg-blue-700"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" /> {t('spray.newSpray')}
          </Button>
        </div>
      </div>

      <SprayEntriesTable
        entries={entries}
        loading={loading}
        emptyMessage={t('spray.empty')}
        onEdit={(row) => {
          setEditing(row);
          setFormOpen(true);
        }}
        onDelete={setDeleting}
      />

      <SprayEntryFormDialog
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setEditing(null);
        }}
        entry={editing}
        projects={projectId ? [{ id: projectId, name: projectName || t('expenses.project') }] : []}
        users={users}
        defaultProjectId={projectId || null}
        lockProject={Boolean(projectId)}
        lockCompanyCam={!projectId && Boolean(companycamProjectId)}
        ccProjectId={companycamProjectId || null}
        ccProjectName={projectName || null}
        defaultSurfaceM2={defaultSurfaceM2}
        onSuccess={fetchEntries}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('spray.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('spray.deleteDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-red-600 hover:bg-red-700"
              onClick={handleDelete}
              disabled={deletingBusy}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ProjectSpraySection;
