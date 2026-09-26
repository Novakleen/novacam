import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ClipboardCheck, Droplets, History, LayoutGrid, Loader2, RefreshCw, Truck, Warehouse } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { buildFleetIndex, fetchFleetData, fetchMoves } from '@/lib/fleet/api';
import { NAVY, Pill, YELLOW } from '@/components/fleet/FleetUI';
import FleetOverview from '@/components/fleet/FleetOverview';
import LocationDetail from '@/components/fleet/LocationDetail';
import ProductsPanel from '@/components/fleet/ProductsPanel';
import MovesPanel from '@/components/fleet/MovesPanel';
import EquipmentPanel from '@/components/fleet/EquipmentPanel';

const UNKNOWN_VAN_WINDOW_DAYS = 30;

/**
 * Flotte / Vloot / Fleet (v1.7.0)
 * /fleet                → admin: overview · member: « Mon van »
 * /fleet/products       → catalog (admin)
 * /fleet/moves          → timeline
 * /fleet/equipment      → kit checklists + template (admin)
 * /fleet/van/:id        → van sheet
 * /fleet/depot          → depot sheet
 */
const FleetPage = () => {
  const { section, id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage || i18n.language || 'fr').slice(0, 2);

  const [role, setRole] = useState(null);
  const [data, setData] = useState(null);
  const [moves, setMoves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [movesLoading, setMovesLoading] = useState(true);

  const isAdmin = role === 'Admin';

  useEffect(() => {
    let alive = true;
    if (!user) return undefined;
    supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
      .then(({ data: p }) => {
        if (alive) setRole(p?.role || 'Member');
      });
    return () => {
      alive = false;
    };
  }, [user]);

  const loadMoves = useCallback(async () => {
    setMovesLoading(true);
    try {
      setMoves(await fetchMoves({ limit: 400 }));
    } catch (err) {
      console.warn('[fleet] moves:', err?.message || err);
    } finally {
      setMovesLoading(false);
    }
  }, []);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!role) return;
      if (!silent) setLoading(true);
      try {
        const d = await fetchFleetData(role === 'Admin');
        setData(d);
      } catch (err) {
        toast({ variant: 'destructive', title: t('fleet.loadFailed'), description: err.message });
      } finally {
        setLoading(false);
      }
      loadMoves();
    },
    [role, toast, t, loadMoves]
  );

  useEffect(() => {
    load();
  }, [load]);

  const reload = useCallback(() => load({ silent: true }), [load]);

  const index = useMemo(() => (data ? buildFleetIndex(data, lang) : null), [data, lang]);

  const myVan = useMemo(() => {
    if (!data || !user) return null;
    const a = data.assignments.find((x) => !x.end_at && x.user_id === user.id);
    return a ? data.vans.find((v) => v.id === a.van_id) || null : null;
  }, [data, user]);

  const unknownVanCount = useMemo(() => {
    const since = Date.now() - UNKNOWN_VAN_WINDOW_DAYS * 86400000;
    return moves.filter((m) => m.unknown_van && new Date(m.created_at).getTime() >= since).length;
  }, [moves]);

  const onLocalEquipment = useCallback((row) => {
    setData((prev) =>
      prev ? { ...prev, equipment: prev.equipment.map((e) => (e.id === row.id ? { ...e, ...row } : e)) } : prev
    );
  }, []);

  // Resolve current view
  const view = (() => {
    if (section === 'van' && id) return 'van';
    if (section === 'depot') return 'depot';
    if (section === 'products') return isAdmin ? 'products' : 'mine';
    if (section === 'moves') return 'moves';
    if (section === 'equipment') return 'equipment';
    return isAdmin ? 'overview' : 'mine';
  })();

  const go = (path) => navigate(path);

  const pills = isAdmin
    ? [
        ['overview', '/fleet', LayoutGrid, t('fleet.tabs.overview')],
        ['products', '/fleet/products', Droplets, t('fleet.tabs.products')],
        ['moves', '/fleet/moves', History, t('fleet.tabs.moves')],
        ['equipment', '/fleet/equipment', ClipboardCheck, t('fleet.tabs.equipment')],
      ]
    : [
        ['mine', '/fleet', Truck, t('fleet.tabs.myVan')],
        ['depot', '/fleet/depot', Warehouse, t('fleet.depot')],
        ['moves', '/fleet/moves', History, t('fleet.tabs.moves')],
      ];
  const activePill = view === 'van' ? (isAdmin ? 'overview' : 'mine') : view === 'depot' && isAdmin ? 'overview' : view;

  const renderBody = () => {
    if (loading || !data || !index) {
      return (
        <div className="py-24 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      );
    }
    switch (view) {
      case 'overview':
        return (
          <FleetOverview
            data={data}
            index={index}
            isAdmin={isAdmin}
            unknownVanCount={unknownVanCount}
            onOpenVan={(vanId) => go(`/fleet/van/${vanId}`)}
            onOpenDepot={() => go('/fleet/depot')}
            onReload={reload}
          />
        );
      case 'products':
        return <ProductsPanel data={data} index={index} onReload={reload} />;
      case 'moves':
        return <MovesPanel moves={moves} data={data} index={index} loading={movesLoading} />;
      case 'equipment':
        return (
          <EquipmentPanel
            data={data}
            index={index}
            isAdmin={isAdmin}
            onOpenVan={(vanId) => go(`/fleet/van/${vanId}`)}
            onReload={reload}
          />
        );
      case 'depot':
        return (
          <LocationDetail
            location={index.depot}
            van={null}
            index={index}
            data={data}
            isAdmin={isAdmin}
            canEdit={isAdmin}
            moves={moves}
            onReload={reload}
            onLocalEquipment={onLocalEquipment}
          />
        );
      case 'van':
      case 'mine': {
        const van = view === 'van' ? data.vans.find((v) => v.id === id) : myVan;
        if (!van) {
          return (
            <div className="max-w-md mx-auto text-center py-16 space-y-4">
              <div className="mx-auto h-20 w-20 rounded-3xl flex items-center justify-center" style={{ backgroundColor: NAVY }}>
                <Truck className="h-10 w-10" style={{ color: YELLOW }} />
              </div>
              <h2 className="text-xl font-black">{view === 'mine' ? t('fleet.noVanTitle') : t('fleet.vanNotFound')}</h2>
              {view === 'mine' && <p className="text-sm text-gray-500">{t('fleet.noVanDesc')}</p>}
              <Button variant="outline" className="rounded-full" onClick={() => go(view === 'mine' ? '/fleet/depot' : '/fleet')}>
                {view === 'mine' ? t('fleet.seeDepot') : t('fleet.tabs.overview')}
              </Button>
            </div>
          );
        }
        const current = index.currentAssignment.get(van.id);
        const canEdit = isAdmin || current?.user_id === user?.id;
        return (
          <LocationDetail
            location={index.locationByVan.get(van.id)}
            van={van}
            index={index}
            data={data}
            isAdmin={isAdmin}
            canEdit={canEdit}
            moves={moves}
            onReload={reload}
            onLocalEquipment={onLocalEquipment}
          />
        );
      }
      default:
        return null;
    }
  };

  return (
    <DashboardLayout>
      <Helmet>
        <title>{t('nav.fleet')} · Novakleen</title>
      </Helmet>
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {pills.map(([key, path, Icon, label]) => (
              <Pill key={key} active={activePill === key} icon={Icon} onClick={() => go(path)}>
                {label}
              </Pill>
            ))}
          </div>
          <Button variant="ghost" size="icon" className="rounded-full shrink-0" onClick={reload} aria-label={t('common.refresh')}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        {renderBody()}
      </div>
    </DashboardLayout>
  );
};

export default FleetPage;
