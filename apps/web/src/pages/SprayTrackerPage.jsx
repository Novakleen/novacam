import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import {
  Plus,
  Download,
  Calendar,
  Users,
  Filter,
  RefreshCw,
  Loader2,
  Droplets,
} from 'lucide-react';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import SprayEntriesTable from '@/components/spray/SprayEntriesTable';
import SprayEntryFormDialog from '@/components/spray/SprayEntryFormDialog';
import {
  sprayProductDisplayName,
  sprayProductKey,
  useSprayProducts,
} from '@/lib/sprayProducts';
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
import { formatDateDisplay } from '@/lib/timeTracking';
import { prefetchRecentProjects } from '@/lib/companycamService';

const SprayTrackerPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { products: sprayProducts } = useSprayProducts();
  const [entries, setEntries] = useState([]);
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const [filterUser, setFilterUser] = useState('all');
  const [filterProduct, setFilterProduct] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [rangePreset, setRangePreset] = useState('all');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [entriesRes, projectsRes, usersRes] = await Promise.all([
        supabase
          .from('spray_entries')
          .select(`
            *,
            profiles:user_id(id, full_name, email, initials),
            projects:project_id(id, name)
          `)
          .order('work_date', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('projects')
          .select('id, name, is_archived, companycam_project_id')
          .eq('is_archived', false)
          .order('name'),
        supabase.from('profiles').select('id, full_name, email, initials').order('full_name'),
      ]);

      if (entriesRes.error) throw entriesRes.error;
      if (projectsRes.error) throw projectsRes.error;
      if (usersRes.error) throw usersRes.error;

      setEntries(entriesRes.data || []);
      setProjects(projectsRes.data || []);
      setUsers(usersRes.data || []);
    } catch (err) {
      console.error(err);
      toast({
        variant: 'destructive',
        title: t('common.error'),
        description: 'Impossible de charger le spray tracker.',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (user) fetchAll();
  }, [user, fetchAll]);

  useEffect(() => {
    if (user) prefetchRecentProjects();
  }, [user]);

  const applyPreset = (preset) => {
    setRangePreset(preset);
    const now = new Date();
    if (preset === 'week') {
      const start = startOfWeek(now, { weekStartsOn: 1 });
      const end = endOfWeek(now, { weekStartsOn: 1 });
      setDateFrom(format(start, 'yyyy-MM-dd'));
      setDateTo(format(end, 'yyyy-MM-dd'));
    } else if (preset === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setDateFrom(format(start, 'yyyy-MM-dd'));
      setDateTo(format(end, 'yyyy-MM-dd'));
    } else {
      setDateFrom('');
      setDateTo('');
    }
  };

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (filterUser !== 'all' && e.user_id !== filterUser) return false;
      if (filterProduct !== 'all' && sprayProductKey(e, sprayProducts) !== filterProduct) {
        return false;
      }
      if (dateFrom && e.work_date < dateFrom) return false;
      if (dateTo && e.work_date > dateTo) return false;
      return true;
    });
  }, [entries, filterUser, filterProduct, dateFrom, dateTo, sprayProducts]);

  const totals = useMemo(() => {
    let qty = 0;
    let surface = 0;
    let hours = 0;
    filtered.forEach((e) => {
      qty += Number(e.product_quantity) || 0;
      surface += Number(e.surface_m2) || 0;
      hours += Number(e.spray_hours) || 0;
    });
    return { qty, surface, hours };
  }, [filtered]);

  // Catalog products (margin params) + free-text / removed products still present on entries
  const productOptions = useMemo(() => {
    const map = new Map();
    sprayProducts.forEach((p) => map.set(`slug:${p.slug}`, p.name));
    entries.forEach((e) => {
      const key = sprayProductKey(e, sprayProducts);
      if (key && !map.has(key)) map.set(key, sprayProductDisplayName(e, sprayProducts));
    });
    return Array.from(map, ([value, label]) => ({ value, label })).sort((a, b) =>
      a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' })
    );
  }, [entries, sprayProducts]);

  const handleDelete = async () => {
    if (!deleting?.id) return;
    setDeletingBusy(true);
    try {
      const { error } = await supabase.from('spray_entries').delete().eq('id', deleting.id);
      if (error) throw error;
      toast({ title: 'Supprimé', description: 'La pulvérisation a été supprimée.' });
      setDeleting(null);
      fetchAll();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: t('common.error'),
        description: err.message || 'Suppression impossible.',
      });
    } finally {
      setDeletingBusy(false);
    }
  };

  const handleExportCsv = () => {
    const header = [
      'Date',
      'Client',
      'Membre',
      'Produit',
      'Surface (m2)',
      'Temps (h)',
      'Matériel',
      'Quantité produit',
      'Dilution',
      'Source client',
      'CompanyCam ID',
      'Notes',
    ];
    const lines = filtered.map((e) =>
      [
        formatDateDisplay(e.work_date),
        e.client_name || e.companycam_project_name || e.projects?.name || '',
        e.profiles?.full_name || '',
        sprayProductDisplayName(e, sprayProducts).replace(/^—$/, ''),
        e.surface_m2 ?? '',
        e.spray_hours ?? '',
        e.method || '',
        e.product_quantity ?? '',
        e.dilution || '',
        e.client_source || (e.companycam_project_id ? 'companycam' : e.project_id ? 'app' : ''),
        e.companycam_project_id || '',
        (e.notes || '').replace(/"/g, '""'),
      ]
        .map((c) => `"${c}"`)
        .join(';')
    );
    const bom = '\uFEFF';
    const csv = bom + [header.join(';'), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spray-tracker-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout>
      <Helmet>
        <title>Spray Tracker - Novakleen</title>
        <meta
          name="description"
          content="Suivi des quantités de produit pulvérisées Novakleen : dilution, surface, méthode et client."
        />
      </Helmet>

      <div className="space-y-6 animate-in-fade">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-baseline gap-3">
              <h1 className="text-2xl md:text-3xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
                <Droplets className="h-7 w-7 text-primary" />
                Spray Tracker
              </h1>
              <span className="text-primary font-semibold tabular-nums">
                {totals.qty.toLocaleString('fr-BE')} qté · {totals.surface.toLocaleString('fr-BE')} m² ·{' '}
                {totals.hours.toFixed(1)} h
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Quantité de produit pulvérisée par client, avec dilution, surface et méthode.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="rounded-xl h-11 bg-slate-100 border-0 hover:bg-slate-200 dark:bg-slate-800"
              onClick={handleExportCsv}
              disabled={!filtered.length}
            >
              <Download className="h-4 w-4 mr-2" /> Export
            </Button>
            <Button
              variant="outline"
              className="rounded-xl h-11"
              onClick={fetchAll}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              {!loading && 'Actualiser'}
            </Button>
            <Button
              className="rounded-xl h-11 bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" /> Nouvelle entrée
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <Button
            variant={rangePreset === 'week' ? 'default' : 'outline'}
            size="sm"
            className="rounded-xl h-10 gap-2"
            onClick={() => applyPreset('week')}
          >
            <Calendar className="h-3.5 w-3.5" /> Semaine
          </Button>
          <Button
            variant={rangePreset === 'month' ? 'default' : 'outline'}
            size="sm"
            className="rounded-xl h-10 gap-2"
            onClick={() => applyPreset('month')}
          >
            <Calendar className="h-3.5 w-3.5" /> Mois
          </Button>
          <Button
            variant={rangePreset === 'all' ? 'default' : 'outline'}
            size="sm"
            className="rounded-xl h-10 gap-2"
            onClick={() => applyPreset('all')}
          >
            <Filter className="h-3.5 w-3.5" /> Tout
          </Button>

          <div className="h-6 w-px bg-border hidden sm:block mx-1" />

          <Select value={filterUser} onValueChange={setFilterUser}>
            <SelectTrigger className="w-full min-w-0 sm:w-[180px] h-10 rounded-xl">
              <Users className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Membres" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les membres</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.full_name || u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterProduct} onValueChange={setFilterProduct}>
            <SelectTrigger className="w-full min-w-0 sm:w-[180px] h-10 rounded-xl">
              <Droplets className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Produit" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les produits</SelectItem>
              {productOptions.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            type="date"
            className="w-auto h-10 rounded-xl"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setRangePreset('custom');
            }}
          />
          <span className="text-muted-foreground text-sm">→</span>
          <Input
            type="date"
            className="w-auto h-10 rounded-xl"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setRangePreset('custom');
            }}
          />
        </div>

        <SprayEntriesTable
          entries={filtered}
          loading={loading}
          emptyMessage="Aucune pulvérisation pour ces filtres. Cliquez sur « Nouvelle entrée » pour encoder."
          onEdit={(row) => {
            setEditing(row);
            setFormOpen(true);
          }}
          onDelete={setDeleting}
        />
      </div>

      <SprayEntryFormDialog
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setEditing(null);
        }}
        entry={editing}
        projects={projects}
        users={users}
        onSuccess={fetchAll}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette entrée ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est définitive et retirera la pulvérisation du suivi.
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
    </DashboardLayout>
  );
};

export default SprayTrackerPage;
