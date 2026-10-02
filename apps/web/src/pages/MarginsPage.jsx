import React, { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Calculator, PieChart, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import ParamsTab from '@/components/margins/ParamsTab';
import SimulatorTab from '@/components/margins/SimulatorTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fetchMarginParams, fetchProductPrices } from '@/lib/margin/api';

/**
 * /margins (Admin + Manager) — Paramètres + Simulateur (brouillon local + historique Supabase).
 * Le calcul de marge réel se fait sur la fiche chantier (onglet Marge).
 * DossierList / DossierForm restent dans le code pour réutilisation.
 */
const MarginsPage = () => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [tab, setTab] = useState('simulator');
  const [loading, setLoading] = useState(true);
  const [params, setParams] = useState(null);
  const [prices, setPrices] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, pr] = await Promise.all([fetchMarginParams(), fetchProductPrices()]);
      setParams(p);
      setPrices(pr);
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
            <p className="text-gray-500 dark:text-gray-400">{t('margins.pageSubtitle')}</p>
          </div>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
        </div>

        {params ? (
          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="simulator" className="gap-1.5">
                <Calculator className="h-4 w-4" />
                {t('margins.tabSimulator')}
              </TabsTrigger>
              <TabsTrigger value="params" className="gap-1.5">
                <SlidersHorizontal className="h-4 w-4" />
                {t('margins.tabParams')}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="simulator" className="mt-0">
              <SimulatorTab params={params} prices={prices} />
            </TabsContent>
            <TabsContent value="params" className="mt-0">
              <ParamsTab params={params} prices={prices} onReload={load} />
            </TabsContent>
          </Tabs>
        ) : (
          <p className="text-sm text-muted-foreground">
            {loading ? 'Chargement…' : 'Paramètres introuvables (table margin_params, id=1).'}
          </p>
        )}
      </div>
    </DashboardLayout>
  );
};

export default MarginsPage;
