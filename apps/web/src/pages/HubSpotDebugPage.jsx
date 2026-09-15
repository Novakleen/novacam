import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2, AlertCircle, CheckCircle, Clock, ShieldCheck, ShieldAlert, Key, Activity, Database } from 'lucide-react';

import { useHubSpotDebug } from '@/hooks/useHubSpotDebug';
import HubSpotAPILimitDisplay from '@/components/hubspot/debug/HubSpotAPILimitDisplay';
import CustomAPITester from '@/components/hubspot/debug/CustomAPITester';
import HubSpotContactTester from '@/components/hubspot/debug/HubSpotContactTester';
import HubSpotPropertyInspector from '@/components/hubspot/debug/HubSpotPropertyInspector';
import HubSpotContactDebugSection from '@/components/hubspot/debug/HubSpotContactDebugSection';

const HubSpotDebugPage = () => {
  const { 
    logs, 
    clearLogs, 
    loading, 
    rateLimits, 
    makeApiCall, 
    testConnection,
    fetchContacts,
    createContact,
    fetchProperties
  } = useHubSpotDebug();

  const [activeTab, setActiveTab] = useState('overview');
  const [tokenStatus, setTokenStatus] = useState('unknown'); // unknown, verified, error
  const [tokenDetails, setTokenDetails] = useState(null);

  // Auto-test connection on load to verify token
  useEffect(() => {
    verifyToken();
  }, []);

  const verifyToken = async () => {
    setTokenStatus('checking');
    const result = await testConnection();
    
    if (result.success) {
      setTokenStatus('verified');
      if (result.debug) {
        setTokenDetails(result.debug);
      }
    } else {
      setTokenStatus('error');
      if (result.debug) {
        setTokenDetails(result.debug);
      }
    }
  };

  return (
    <DashboardLayout>
      <Helmet>
        <title>HubSpot Debugger - Novakleen</title>
      </Helmet>
      
      <div className="max-w-[1600px] mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">HubSpot API Debugger</h1>
            <p className="text-muted-foreground mt-1">Diagnostic tools for HubSpot CRM integration</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={verifyToken} disabled={loading} variant={tokenStatus === 'verified' ? "outline" : "default"} className={tokenStatus === 'error' ? 'bg-red-600 hover:bg-red-700 text-white' : ''}>
              {loading ? <Activity className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
              {tokenStatus === 'verified' ? 'Re-verify Connection' : 'Verify Token & Connection'}
            </Button>
          </div>
        </div>

        {/* Auth Status Banner */}
        <Card className={`border-l-4 ${tokenStatus === 'verified' ? 'border-l-green-500' : tokenStatus === 'error' ? 'border-l-red-500' : 'border-l-yellow-500'}`}>
           <CardContent className="pt-6 pb-6">
              <div className="flex items-start gap-4">
                 <div className={`p-2 rounded-full ${tokenStatus === 'verified' ? 'bg-green-100 text-green-600' : tokenStatus === 'error' ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-600'}`}>
                    {tokenStatus === 'verified' ? <Key className="h-6 w-6" /> : <ShieldAlert className="h-6 w-6" />}
                 </div>
                 <div className="space-y-1 flex-1">
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                       Authentication Status: 
                       <span className={tokenStatus === 'verified' ? 'text-green-600' : tokenStatus === 'error' ? 'text-red-600' : 'text-yellow-600'}>
                          {tokenStatus === 'verified' ? 'Active & Verified' : tokenStatus === 'error' ? 'Authentication Failed' : 'Checking...'}
                       </span>
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4 text-sm">
                       <div className="space-y-1">
                          <span className="text-muted-foreground block text-xs uppercase tracking-wider font-semibold">Token Source</span>
                          <span className="font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-xs">Supabase Secrets (Deno.env)</span>
                       </div>
                       <div className="space-y-1">
                          <span className="text-muted-foreground block text-xs uppercase tracking-wider font-semibold">Token Status</span>
                          <span className="font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-xs">
                             {tokenDetails?.tokenStatus || 'Waiting for check...'}
                          </span>
                       </div>
                       <div className="space-y-1">
                          <span className="text-muted-foreground block text-xs uppercase tracking-wider font-semibold">Auth Header</span>
                          <span className="font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-xs truncate max-w-[150px] block" title={tokenDetails?.authHeaderPreview}>
                             {tokenDetails?.authHeaderPreview || '...'}
                          </span>
                       </div>
                       <div className="space-y-1">
                          <span className="text-muted-foreground block text-xs uppercase tracking-wider font-semibold">Last Verified</span>
                          <span className="font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-xs">
                             {new Date().toLocaleTimeString()}
                          </span>
                       </div>
                    </div>
                 </div>
              </div>
           </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content Area */}
          <div className="lg:col-span-2 space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="database" className="flex items-center gap-2"><Database className="h-3 w-3" /> Database</TabsTrigger>
                <TabsTrigger value="contacts">Live API</TabsTrigger>
                <TabsTrigger value="properties">Properties</TabsTrigger>
                <TabsTrigger value="manual">Manual</TabsTrigger>
              </TabsList>
              
              <TabsContent value="overview" className="space-y-4 mt-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <HubSpotAPILimitDisplay rateLimits={rateLimits} />
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">System Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                         <div className="flex justify-between text-sm">
                           <span>Environment</span>
                           <span className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">Production</span>
                         </div>
                         <div className="flex justify-between text-sm">
                           <span>Edge Function</span>
                           <span className="text-green-600 flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Active</span>
                         </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                   <CardHeader>
                     <CardTitle>Recent Activity Logs</CardTitle>
                     <CardDescription>Real-time logs from your debugging session.</CardDescription>
                   </CardHeader>
                   <CardContent>
                     {logs.length === 0 ? (
                       <div className="text-center py-10 text-muted-foreground">No logs yet. Perform an action to see details.</div>
                     ) : (
                       <div className="space-y-3">
                         {logs.slice(0, 5).map(log => (
                           <LogItem key={log.id} log={log} />
                         ))}
                         <Button variant="link" onClick={() => document.getElementById('log-section').scrollIntoView({ behavior: 'smooth' })}>
                           View all logs below
                         </Button>
                       </div>
                     )}
                   </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="database" className="mt-4">
                <HubSpotContactDebugSection />
              </TabsContent>

              <TabsContent value="contacts" className="mt-4">
                <HubSpotContactTester 
                  createContact={createContact}
                  fetchContacts={fetchContacts}
                  loading={loading}
                />
              </TabsContent>

              <TabsContent value="properties" className="mt-4">
                <HubSpotPropertyInspector 
                  fetchProperties={fetchProperties}
                  loading={loading}
                />
              </TabsContent>

              <TabsContent value="manual" className="mt-4">
                <CustomAPITester onSend={makeApiCall} loading={loading} />
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar: Logs & Quick Stats */}
          <div className="lg:col-span-1 space-y-6" id="log-section">
            <Card className="h-[calc(100vh-200px)] flex flex-col sticky top-6">
              <CardHeader className="pb-3 flex flex-row items-center justify-between border-b">
                <CardTitle className="text-sm">Request Logs</CardTitle>
                <Button variant="ghost" size="icon" onClick={clearLogs} title="Clear Logs">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="flex-1 p-0 overflow-hidden bg-gray-50/50 dark:bg-gray-900/50">
                <ScrollArea className="h-full p-4">
                  {logs.length === 0 ? (
                    <div className="text-center text-sm text-muted-foreground pt-20">
                      Logs will appear here
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {logs.map((log) => (
                        <LogItem key={log.id} log={log} expanded />
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

const LogItem = ({ log, expanded = false }) => {
  const isSuccess = log.type === 'success';
  const status = log.details?.response?.status;
  
  return (
    <div className="bg-white dark:bg-gray-800 border rounded-lg overflow-hidden shadow-sm text-sm">
      <div className="p-3 border-b flex items-start justify-between bg-gray-50/50 dark:bg-gray-900/50">
        <div className="flex items-center gap-2">
          {isSuccess ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : (
            <AlertCircle className="h-4 w-4 text-red-500" />
          )}
          <span className="font-semibold">{log.label}</span>
          {status && (
            <Badge variant={status < 300 ? "success" : "destructive"} className="text-[10px] h-5 px-1.5">
              {status}
            </Badge>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {log.timestamp.toLocaleTimeString()}
        </span>
      </div>
      
      <div className="p-3 space-y-2">
        {log.details.request && (
          <div className="grid grid-cols-[60px_1fr] gap-2">
            <span className="text-xs font-medium text-muted-foreground">REQ:</span>
            <code className="text-[10px] break-all font-mono bg-gray-100 dark:bg-gray-900 p-1 rounded">
              {log.details.request.method} {log.details.request.url.split('api.hubapi.com')[1]}
            </code>
          </div>
        )}
        
        {/* Debug Info Section */}
        {log.details.response?.debug && (
           <div className="space-y-1 bg-blue-50 dark:bg-blue-900/20 p-2 rounded border border-blue-100 dark:border-blue-900">
             <span className="text-xs font-bold text-blue-600 dark:text-blue-400 block mb-1">🔍 DEBUG INFO:</span>
             <ul className="list-disc pl-4 space-y-0.5">
               {log.details.response.debug.steps?.map((step, i) => (
                 <li key={i} className="text-[10px] text-blue-800 dark:text-blue-200">{step}</li>
               ))}
             </ul>
           </div>
        )}

        {log.details.response && (
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground block">RESPONSE BODY:</span>
            <pre className="text-[10px] font-mono bg-gray-900 text-gray-100 p-2 rounded overflow-x-auto max-h-40">
              {JSON.stringify(log.details.response.data || log.details.error, null, 2)}
            </pre>
          </div>
        )}

        {log.details.duration && (
          <div className="text-[10px] text-right text-muted-foreground">
            Duration: {log.details.duration}ms
          </div>
        )}
      </div>
    </div>
  );
};

export default HubSpotDebugPage;