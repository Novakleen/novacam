import React from 'react';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

const HubSpotAPILimitDisplay = ({ rateLimits }) => {
  if (!rateLimits || !rateLimits.limit) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4" />
            API Rate Limits
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            No rate limit data available yet. Make a request to fetch status.
          </div>
        </CardContent>
      </Card>
    );
  }

  const limit = parseInt(rateLimits.limit, 10);
  const remaining = parseInt(rateLimits.remaining, 10);
  const used = limit - remaining;
  const percentage = Math.round((used / limit) * 100);
  const isWarning = percentage > 80;

  return (
    <Card className={cn(isWarning ? "border-yellow-500" : "")}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            API Usage (Daily)
          </div>
          {isWarning && <AlertTriangle className="h-4 w-4 text-yellow-500" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span>Used: {used.toLocaleString()}</span>
            <span className="text-muted-foreground">Total: {limit.toLocaleString()}</span>
          </div>
          <Progress value={percentage} className={cn("h-2", isWarning ? "bg-yellow-100" : "")} indicatorClassName={isWarning ? "bg-yellow-500" : ""} />
        </div>
        <div className="text-xs text-muted-foreground">
          Remaining: <span className="font-mono font-medium">{remaining.toLocaleString()}</span> requests
        </div>
      </CardContent>
    </Card>
  );
};

export default HubSpotAPILimitDisplay;