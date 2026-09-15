import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { ResponsiveContainer, FunnelChart, Funnel, Tooltip as RechartsTooltip, LabelList, Cell } from 'recharts';
import { RefreshCcw, Loader2, AlertCircle, TrendingUp, Users, DollarSign, Clock, Target } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { fetchFunnelCacheFromDB, getAvailableMonths } from '@/lib/hubspotService';
import { refreshHubspotData } from '@/lib/hubspotDataRefresh';
import DashboardLayout from '@/components/layout/DashboardLayout';

const SALES_REPS = [
  { id: 'ALL', name: 'All Reps' },
  { id: '32059962', name: 'Bastien BURGHART' },
  { id: '32297904', name: 'Anthony Cazier' },
  { id: '32494600', name: 'Thibeau Venken' },
  { id: '176155687', name: 'Rémy Gierech' },
  { id: '645018992', name: 'Danny Joosten' }
];

const FUNNEL_COLORS = ['#3b82f6', '#6366f1', '#10b981', '#14b8a6'];

const HubSpotDashboardPage = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [metrics, setMetrics] = useState(null);
  
  const [months, setMonths] = useState(['ALL']);
  const [selectedMonth, setSelectedMonth] = useState('ALL');
  const [selectedRep, setSelectedRep] = useState('ALL');

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const availableMonths = await getAvailableMonths();
      if (availableMonths.length > 0) {
        setMonths(['ALL', ...availableMonths]);
      }

      const data = await fetchFunnelCacheFromDB(selectedMonth, selectedRep);
      if (data && data.length > 0) {
        setMetrics(data[0]);
      } else {
        setMetrics(null);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedMonth, selectedRep]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshHubspotData();
      toast({
        title: "Data Refreshed",
        description: "HubSpot funnel data has been successfully synchronized.",
      });
      await loadData();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Refresh Failed",
        description: err.message || "Could not sync data from HubSpot.",
      });
    } finally {
      setRefreshing(false);
    }
  };

  const getFunnelData = () => {
    if (!metrics) return [];
    return [
      { name: 'Leads', value: metrics.leads_count, fill: FUNNEL_COLORS[0] },
      { name: 'Opportunities', value: metrics.opportunities_count, fill: FUNNEL_COLORS[1] },
      { name: 'Won', value: metrics.won_count, fill: FUNNEL_COLORS[2] },
      { name: 'Invoiced', value: metrics.invoiced_count, fill: FUNNEL_COLORS[3] }
    ];
  };

  const funnelData = getFunnelData();

  return (
    <DashboardLayout>
      <Helmet>
        <title>HubSpot Sales Funnel | Novakleen</title>
      </Helmet>

      <div className="flex flex-col gap-6">
        {/* Header & Filters */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-gray-900 p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Sales Funnel Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">Track pipeline conversion and revenue metrics from HubSpot.</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[140px] bg-gray-50 dark:bg-gray-800 border-none rounded-xl">
                <SelectValue placeholder="Select Month" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {months.map(m => (
                  <SelectItem key={m} value={m}>
                    {m === 'ALL' ? 'All Months' : new Date(m + '-01').toLocaleDateString('default', { month: 'short', year: 'numeric' })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedRep} onValueChange={setSelectedRep}>
              <SelectTrigger className="w-[180px] bg-gray-50 dark:bg-gray-800 border-none rounded-xl">
                <SelectValue placeholder="Select Rep" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {SALES_REPS.map(rep => (
                  <SelectItem key={rep.id} value={rep.id}>{rep.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button 
              onClick={handleRefresh} 
              disabled={refreshing || loading}
              className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20"
            >
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCcw className="h-4 w-4 mr-2" />}
              Sync HubSpot
            </Button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 p-4 rounded-2xl flex items-center gap-3">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <div className="flex-1">
              <h4 className="font-semibold text-sm">Failed to load data</h4>
              <p className="text-sm mt-0.5 opacity-90">{error}</p>
            </div>
            <Button variant="outline" size="sm" onClick={loadData} className="bg-white dark:bg-gray-800 rounded-lg">Retry</Button>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 bg-white/50 dark:bg-gray-900/50 rounded-2xl border border-dashed border-gray-200 dark:border-gray-800">
            <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
            <p className="text-gray-500 font-medium">Loading metrics...</p>
          </div>
        ) : !metrics ? (
           <div className="flex flex-col items-center justify-center py-24 bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
            <Target className="h-12 w-12 text-gray-300 mb-4" />
            <p className="text-gray-500 font-medium text-lg">No data available for the selected filters.</p>
            <p className="text-gray-400 text-sm mt-1">Try clicking 'Sync HubSpot' or select a different period.</p>
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="rounded-2xl border-none shadow-sm bg-white dark:bg-gray-900">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Leads</p>
                      <h3 className="text-3xl font-bold mt-1 text-gray-900 dark:text-white">{metrics.leads_count}</h3>
                    </div>
                    <div className="h-12 w-12 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center">
                      <Users className="h-6 w-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-none shadow-sm bg-white dark:bg-gray-900">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Opportunities</p>
                      <h3 className="text-3xl font-bold mt-1 text-gray-900 dark:text-white">{metrics.opportunities_count}</h3>
                    </div>
                    <div className="h-12 w-12 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center">
                      <Target className="h-6 w-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-none shadow-sm bg-white dark:bg-gray-900">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Win Rate</p>
                      <h3 className="text-3xl font-bold mt-1 text-gray-900 dark:text-white">{metrics.conversion_rates?.opp_to_won_percent || 0}%</h3>
                    </div>
                    <div className="h-12 w-12 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center">
                      <TrendingUp className="h-6 w-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-none shadow-sm bg-gradient-to-br from-green-500 to-emerald-600 text-white">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-white/80">Total Revenue</p>
                      <h3 className="text-3xl font-bold mt-1">€{metrics.total_revenue?.toLocaleString('fr-FR')}</h3>
                    </div>
                    <div className="h-12 w-12 bg-white/20 rounded-2xl flex items-center justify-center">
                      <DollarSign className="h-6 w-6 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Funnel Chart */}
              <Card className="lg:col-span-2 rounded-2xl border-none shadow-sm bg-white dark:bg-gray-900">
                <CardHeader>
                  <CardTitle className="text-lg">Pipeline Conversion</CardTitle>
                  <CardDescription>Volume at each stage of the sales process</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[400px] w-full">
                    {funnelData.some(d => d.value > 0) ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <FunnelChart>
                          <RechartsTooltip 
                             cursor={{fill: 'transparent'}}
                             contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}
                          />
                          <Funnel
                            dataKey="value"
                            data={funnelData}
                            isAnimationActive
                          >
                            <LabelList position="right" fill="#6b7280" stroke="none" dataKey="name" fontSize={14} fontWeight={500} />
                            {funnelData.map((entry, index) => (
                               <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))}
                          </Funnel>
                        </FunnelChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-gray-400">
                        No funnel data to display
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Status Breakdown & Velocity */}
              <div className="flex flex-col gap-6">
                <Card className="rounded-2xl border-none shadow-sm bg-white dark:bg-gray-900 flex-1">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg">Deal Status Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Won (Not Invoiced)</span>
                        <span className="font-bold text-gray-900 dark:text-white">{metrics.won_count}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/20">
                        <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Invoiced</span>
                        <span className="font-bold text-emerald-700 dark:text-emerald-400">{metrics.invoiced_count}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-300">En Cours (Active)</span>
                        <span className="font-bold text-gray-900 dark:text-white">{metrics.en_cours_count}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20">
                        <span className="text-sm font-medium text-red-700 dark:text-red-400">Lost</span>
                        <span className="font-bold text-red-700 dark:text-red-400">{metrics.lost_count}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border-none shadow-sm bg-white dark:bg-gray-900">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Clock className="h-5 w-5 text-primary" />
                      Sales Velocity
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-500">Contact → Deal</span>
                          <span className="font-bold text-gray-900 dark:text-white">~{metrics.avg_contact_to_deal_days || 0} days</span>
                        </div>
                        <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2">
                           <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${Math.min(100, ((metrics.avg_contact_to_deal_days||0) / 30) * 100)}%` }}></div>
                        </div>
                      </div>
                      
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-500">Deal → Closure</span>
                          <span className="font-bold text-gray-900 dark:text-white">~{metrics.avg_deal_to_closure_days || 0} days</span>
                        </div>
                        <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2">
                           <div className="bg-indigo-500 h-2 rounded-full" style={{ width: `${Math.min(100, ((metrics.avg_deal_to_closure_days||0) / 45) * 100)}%` }}></div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default HubSpotDashboardPage;