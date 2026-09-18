import React, { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { PieChart, RefreshCw } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import ParamsTab from '@/components/margins/ParamsTab';
import { fetchMarginParams, fetchProductPrices } from '@/lib/margin/api';

/**
 * Admin /margins — paramétrage only.
 * Le calcul de marge se fait sur la fiche chantier (onglet Marge).
 * DossierList / DossierForm restent dans le code pour réutilisation.
 */
const MarginsPage = () => {
  const { toast } = useToast();
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
            <p className="text-gray-500 dark:text-gray-400">
              Paramétrage (coûts, carburant, produits, closers). Admin uniquement.
              Le calcul de marge se fait sur la fiche chantier → onglet Marge.
            </p>
          </div>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
        </div>

        {params ? (
          <ParamsTab params={params} prices={prices} onReload={load} />
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
