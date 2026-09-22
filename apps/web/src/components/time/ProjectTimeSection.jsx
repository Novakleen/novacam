import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Clock, RefreshCw, Tags } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useTranslation } from 'react-i18next';
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
import {
  formatHoursDecimal,
  sumHours,
  fetchProjectDealServiceSnapshot,
  parseTypeOfServiceLabels,
} from '@/lib/timeTracking';
import { fetchHubSpotDealJobInfo } from '@/lib/hubspotService';

const ProjectTimeSection = ({ projectId, projectName, companycamProjectId, hubspotContactId = null }) => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [entries, setEntries] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [resolvedHsContactId, setResolvedHsContactId] = useState(hubspotContactId || null);
  const [projectDeal, setProjectDeal] = useState({
    hubspot_deal_id: null,
    hubspot_deal_name: null,
    hubspot_deal_type_of_service: null,
    type_of_service_labels: [],
  });

  const [resolvedProjectId, setResolvedProjectId] = useState(projectId || null);

  useEffect(() => {
    setResolvedProjectId(projectId || null);
    if (!projectId && !companycamProjectId && !hubspotContactId) {
      setResolvedHsContactId(null);
      setProjectDeal({
        hubspot_deal_id: null,
        hubspot_deal_name: null,
        hubspot_deal_type_of_service: null,
        type_of_service_labels: [],
      });
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await fetchProjectDealServiceSnapshot(supabase, {
        projectId: projectId || null,
        companycamProjectId: companycamProjectId || null,
        hubspotContactId: hubspotContactId || null,
      });
      if (cancelled) return;
      if (error) {
        console.warn('ProjectTimeSection deal resolve failed', error);
      }
      let snapshot = data;
      if (
        snapshot?.hubspot_deal_id &&
        (!snapshot.type_of_service_labels || snapshot.type_of_service_labels.length === 0)
      ) {
        try {
          const live = await fetchHubSpotDealJobInfo(snapshot.hubspot_deal_id);
          if (!cancelled && live?.typeOfServiceLabels?.length) {
            snapshot = {
              ...snapshot,
              hubspot_deal_type_of_service:
                live.typeOfService || snapshot.hubspot_deal_type_of_service,
              hubspot_deal_name: live.dealName || snapshot.hubspot_deal_name,
              type_of_service_labels: live.typeOfServiceLabels,
            };
          }
        } catch (err) {
          console.warn('ProjectTimeSection live ToS failed', err);
        }
      }
      if (cancelled) return;
      if (snapshot?.id) setResolvedProjectId(snapshot.id);
      setResolvedHsContactId(
        hubspotContactId || snapshot?.hubspot_contact_id || null
      );
      setProjectDeal({
        hubspot_deal_id: snapshot?.hubspot_deal_id || null,
        hubspot_deal_name: snapshot?.hubspot_deal_name || null,
        hubspot_deal_type_of_service: snapshot?.hubspot_deal_type_of_service || null,
        type_of_service_labels: Array.isArray(snapshot?.type_of_service_labels)
          ? snapshot.type_of_service_labels
          : parseTypeOfServiceLabels(snapshot?.hubspot_deal_type_of_service),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, companycamProjectId, hubspotContactId]);

  const fetchEntries = useCallback(async () => {
    const novaId = resolvedProjectId || projectId || null;
    if (!novaId && !companycamProjectId) return;
    setLoading(true);
    try {
      let query = supabase
        .from('time_entries')
        .select(`
          *,
          profiles:user_id(id, full_name, email, initials),
          projects:project_id(id, name)
        `);

      if (novaId && companycamProjectId) {
        query = query.or(
          `project_id.eq.${novaId},companycam_project_id.eq.${companycamProjectId}`
        );
      } else if (companycamProjectId) {
        query = query.eq('companycam_project_id', companycamProjectId);
      } else {
        query = query.eq('project_id', novaId);
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
        title: t('common.error'),
        description: t('time.loadError'),
      });
    } finally {
      setLoading(false);
    }
  }, [projectId, resolvedProjectId, companycamProjectId, toast, t]);

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
      toast({ title: t('common.deleted'), description: t('time.deletedDesc') });
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

  const total = sumHours(entries);
  const tosLabels = projectDeal.type_of_service_labels || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            {t('time.title')}
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('time.totalProject')} <span className="font-semibold text-foreground">{formatHoursDecimal(total)} h</span>
            {entries.length > 0 && (
              <span className="text-muted-foreground"> · {t('common.entries', { count: entries.length })}</span>
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
            <Plus className="h-4 w-4 mr-2" /> {t('time.addHours')}
          </Button>
        </div>
      </div>

      {tosLabels.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-2">
          <div className="flex items-center gap-2">
            <Tags className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-semibold">{t('time.tosSectionTitle')}</h4>
            {projectDeal.hubspot_deal_name && (
              <span className="text-xs text-muted-foreground truncate">
                — {projectDeal.hubspot_deal_name}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {tosLabels.map((label) => (
              <span
                key={label}
                className="inline-flex items-center rounded-full border bg-muted/40 px-2.5 py-0.5 text-xs font-medium"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      )}

      <TimeEntriesTable
        entries={entries}
        loading={loading}
        showUser
        showProject={false}
        emptyMessage={t('time.empty')}
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
        projects={
          (resolvedProjectId || projectId)
            ? [
                {
                  id: resolvedProjectId || projectId,
                  name: projectName || t('expenses.project'),
                  companycam_project_id: companycamProjectId || null,
                  hubspot_contact_id: resolvedHsContactId,
                  hubspot_deal_id: projectDeal.hubspot_deal_id,
                  hubspot_deal_name: projectDeal.hubspot_deal_name,
                  hubspot_deal_type_of_service: projectDeal.hubspot_deal_type_of_service,
                },
              ]
            : []
        }
        users={users}
        defaultProjectId={projectId || null}
        lockProject={Boolean(projectId)}
        lockCompanyCam={!projectId && Boolean(companycamProjectId)}
        ccProjectId={companycamProjectId || null}
        ccProjectName={projectName || null}
        hubspotContactId={resolvedHsContactId}
        onSuccess={fetchEntries}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('time.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('time.deleteDesc')}
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

export default ProjectTimeSection;
