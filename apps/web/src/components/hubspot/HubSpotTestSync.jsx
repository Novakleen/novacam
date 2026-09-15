import React, { useState } from 'react';
import { useHubSpotSync } from '@/hooks/useHubSpotSync';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, AlertTriangle, RefreshCw, Activity, ArrowRight } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';

const StatusRow = ({ label, status, message, loading }) => (
  <div className="flex items-center justify-between p-3 border rounded-lg bg-card">
    <div className="flex items-center gap-3">
      {loading ? (
        <RefreshCw className="h-5 w-5 animate-spin text-blue-500" />
      ) : status === 'success' ? (
        <CheckCircle2 className="h-5 w-5 text-green-500" />
      ) : status === 'error' ? (
        <XCircle className="h-5 w-5 text-red-500" />
      ) : (
        <div className="h-5 w-5 rounded-full border-2 border-gray-200" />
      )}
      <div>
        <div className="font-medium">{label}</div>
        {message && <div className="text-xs text-muted-foreground">{message}</div>}
      </div>
    </div>
    <Badge variant={status === 'success' ? 'success' : status === 'error' ? 'destructive' : 'secondary'}>
      {loading ? 'Running...' : status === 'success' ? 'Passed' : status === 'error' ? 'Failed' : 'Pending'}
    </Badge>
  </div>
);

const HubSpotTestSync = () => {
  const { testConnection } = useHubSpotSync();
  const [connectionStatus, setConnectionStatus] = useState({ status: 'idle', message: '' });
  
  const handleTestConnection = async () => {
    setConnectionStatus({ status: 'loading', message: 'Verifying credentials...' });
    const result = await testConnection();
    if (result.connected) {
      setConnectionStatus({ status: 'success', message: result.message });
    } else {
      setConnectionStatus({ status: 'error', message: result.error });
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">HubSpot Integration Diagnostics</h1>
          <p className="text-muted-foreground">Test and verify your connection to the HubSpot CRM API.</p>
        </div>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-blue-500" />
                Connection Status
              </CardTitle>
              <CardDescription>Verify that Novakleen can communicate with HubSpot API.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <StatusRow 
                label="API Connectivity" 
                status={connectionStatus.status} 
                message={connectionStatus.message}
                loading={connectionStatus.status === 'loading'}
              />
              
              <div className="flex justify-end pt-2">
                <Button 
                  onClick={handleTestConnection} 
                  disabled={connectionStatus.status === 'loading'}
                  className="gap-2"
                >
                  <RefreshCw className={cn("h-4 w-4", connectionStatus.status === 'loading' && "animate-spin")} />
                  Test Connection
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Environment Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 text-sm">
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Edge Function URL</span>
                  <span className="font-mono">/functions/v1/hubspot-sync</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">API Version</span>
                  <span className="font-mono">HubSpot CRM v3</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Auth Method</span>
                  <span className="font-mono">Bearer Token (Private App)</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

// Helper for className conditional
function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

export default HubSpotTestSync;