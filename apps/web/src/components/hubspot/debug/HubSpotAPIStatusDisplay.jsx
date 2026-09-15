import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, CheckCircle, AlertTriangle, XCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

const HubSpotAPIStatusDisplay = ({ 
  apiStatus = 'idle', 
  lastError = null, 
  rateLimits = null,
  lastCheckTime = null
}) => {
  const getStatusColor = () => {
    if (apiStatus === 'error') return 'border-red-200 bg-red-50 dark:bg-red-900/10';
    if (apiStatus === 'loading') return 'border-blue-200 bg-blue-50 dark:bg-blue-900/10';
    if (lastError) return 'border-red-200 bg-red-50 dark:bg-red-900/10';
    return 'border-green-200 bg-green-50 dark:bg-green-900/10';
  };

  const getStatusIcon = () => {
    if (apiStatus === 'loading') return <RefreshCw className="h-5 w-5 animate-spin text-blue-500" />;
    if (apiStatus === 'error' || lastError) return <XCircle className="h-5 w-5 text-red-500" />;
    return <CheckCircle className="h-5 w-5 text-green-500" />;
  };

  const getRateLimitStatus = () => {
    if (!rateLimits) return { label: 'Unknown', color: 'gray' };
    const used = rateLimits.total - rateLimits.remaining;
    const percent = (used / rateLimits.total) * 100;
    
    if (percent > 90) return { label: 'Critical', color: 'red' };
    if (percent > 70) return { label: 'Warning', color: 'yellow' };
    return { label: 'Healthy', color: 'green' };
  };

  const rateStatus = getRateLimitStatus();

  return (
    <Card className={cn("shadow-sm", getStatusColor())}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            HubSpot API Health
          </div>
          {getStatusIcon()}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-medium text-muted-foreground">API Connection</span>
              <Badge variant={apiStatus === 'error' || lastError ? "destructive" : "outline"} className={cn(
                "text-[10px] px-1.5 h-5", 
                !lastError && apiStatus !== 'error' && "bg-green-100 text-green-700 border-green-200"
              )}>
                {apiStatus === 'error' || lastError ? 'Issues Detected' : 'Operational'}
              </Badge>
            </div>
            {lastError && (
              <p className="text-[10px] text-red-600 font-medium truncate" title={lastError}>
                Error: {lastError}
              </p>
            )}
          </div>

          <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
             <div className="flex justify-between items-center mb-1">
               <span className="text-xs font-medium text-muted-foreground">Rate Limits</span>
               <Badge variant="outline" className={cn(
                 "text-[10px] px-1.5 h-5",
                 rateStatus.color === 'green' ? "bg-green-100 text-green-700 border-green-200" : 
                 rateStatus.color === 'yellow' ? "bg-yellow-100 text-yellow-700 border-yellow-200" : 
                 "bg-red-100 text-red-700 border-red-200"
               )}>
                 {rateStatus.label}
               </Badge>
             </div>
             {rateLimits ? (
               <div className="text-[10px] text-muted-foreground flex justify-between">
                 <span>{rateLimits.remaining} remaining</span>
                 <span>{rateLimits.total} limit</span>
               </div>
             ) : (
               <div className="text-[10px] text-muted-foreground italic">
                 No rate limit info available
               </div>
             )}
          </div>

          {lastCheckTime && (
            <div className="text-[10px] text-right text-muted-foreground pt-1">
              Checked: {lastCheckTime.toLocaleTimeString()}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default HubSpotAPIStatusDisplay;