import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { PieChart, Plus, RefreshCw, Settings2 } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import ParamsTab from '@/components/margins/ParamsTab';
import DossierList from '@/components/margins/DossierList';
import DossierForm from '@/components/margins/DossierForm';
import DossierDetail from '@/components/margins/DossierDetail';
import {
  deleteDossier,
  fetchDossiers,
  fetchMarginParams,
  fetchProductPrices,
  fetchProjectsLite,
  fetchTeamProfiles,
  pricesMap,
} from '@/lib/margin/api';
import { calculateProjectMargin, effectiveDiesel } from '@/lib/margin/calculateProjectMargin';
import { resolveFuelByDate } from '@/lib/margin/fuel';

const MarginsPage = () => {
  const { toast } = useToast();
  const [tab, setTab] = useState('dossiers');
  const [loading, setLoading] = useState(true);
  const [params, setParams] = useState(null);
  const [prices, setPrices] = useState([]);
  const [dossiers, setDossiers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [fuelByDossier, setFuelByDossier] = useState({});
  const [fuelLoading, setFuelLoading] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, pr, d, proj, team] = await Promise.all([
        fetchMarginParams(),
        fetchProductPrices(),
        fetchDossiers(),
        fetchProjectsLite(),
        fetchTeamProfiles(),
      ]);
      setParams(p);
      setPrices(pr);
      setDossiers(d);
      setProjects(proj);
      setProfiles(team);
    } catch (err) {
      console.error(err);
      toast({
        variant: 'destructive',
        title: 'Chargement impossible',
        description: err.message,
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!dossiers.length) {
        setFuelByDossier({});
        return;
      }
      setFuelLoading(true);
      const next = {};
      for (const d of dossiers) {
        if (cancelled) return;
        next[d.id] = await resolveFuelByDate({
          hourLines: d.hour_lines || [],
          clientAddress: d.client_address,
        });
      }
      if (!cancelled) {
        setFuelByDossier(next);
        setFuelLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [dossiers]);

  const priceMap = useMemo(() => pricesMap(prices), [prices]);
  const diesel = useMemo(() => effectiveDiesel(params || {}), [params]);

  const calcs = useMemo(() => {
    const map = {};
    for (const d of dossiers) {
      map[d.id] = calculateProjectMargin({
        dossier: d,
        hourLines: d.hour_lines || [],
        productLines: d.product_lines || [],
        params: params || {},
        prices: priceMap,
        fuelByDate: fuelByDossier[d.id] || {},
        dieselEurL: diesel,
      });
    }
    return map;
  }, [dossiers, params, priceMap, fuelByDossier, diesel]);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (d) => {
    setDetail(null);
    setEditing(d);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await deleteDossier(deleting.id);
      toast({ title: 'Dossier supprimé' });
      setDeleting(null);
      setDetail(null);
      await load();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Suppression impossible', description: err.message });
    } finally {
      setDeletingBusy(false);
    }
  };

  return (
    <DashboardLayout>
      <Helmet>
        <title>Marges chantiers - Novakleen</title>
      </Helmet>

      <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <PieChart className="h-7 w-7 text-primary" />
              Marge chantiers
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Paramétrage et vue MB / MA. Admin uniquement.
              {fuelLoading ? ' Calcul des trajets…' : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Actualiser
            </Button>
            {tab === 'dossiers' && (
              <Button onClick={openNew}>
                <Plus className="h-4 w-4 mr-1" /> Nouveau dossier
              </Button>
            )}
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="h-auto p-1">
            <TabsTrigger value="dossiers" className="px-5 py-2">
              <PieChart className="h-4 w-4 mr-2" />
              Marges
            </TabsTrigger>
            <TabsTrigger value="params" className="px-5 py-2">
              <Settings2 className="h-4 w-4 mr-2" />
              Paramétrage
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dossiers" className="mt-6">
            <DossierList
              dossiers={dossiers}
              calcs={calcs}
              loading={loading}
              onNew={openNew}
              onOpen={setDetail}
            />
          </TabsContent>

          <TabsContent value="params" className="mt-6">
            {params ? (
              <ParamsTab params={params} prices={prices} onReload={load} />
            ) : (
              <p className="text-sm text-muted-foreground">
                {loading ? 'Chargement…' : 'Paramètres introuvables (table margin_params, id=1).'}
              </p>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <DossierForm
        open={formOpen}
        onOpenChange={setFormOpen}
        dossier={editing}
        projects={projects}
        profiles={profiles}
        closers={params?.commercial_closers || []}
        onSaved={load}
      />

      <DossierDetail
        dossier={detail}
        calc={detail ? calcs[detail.id] : null}
        open={Boolean(detail)}
        onOpenChange={(o) => {
          if (!o) setDetail(null);
        }}
        onEdit={() => openEdit(detail)}
        onDelete={() => setDeleting(detail)}
      />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce dossier ?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.client_name} sera définitivement retiré, ainsi que ses lignes d’heures et
              produits.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deletingBusy}>
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default MarginsPage;
