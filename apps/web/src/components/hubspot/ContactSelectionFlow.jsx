import React from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import HubSpotContactSelector from './HubSpotContactSelector';

function ErrorFallback({ error, resetErrorBoundary }) {
  return (
    <Alert variant="destructive" className="my-2">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Something went wrong</AlertTitle>
      <AlertDescription className="mt-2">
        <p className="text-sm mb-2">{error.message}</p>
        <Button size="sm" variant="outline" onClick={resetErrorBoundary} className="bg-white/10 hover:bg-white/20 border-white/20">
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}

const ContactSelectionFlow = (props) => {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <div className="space-y-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            Select HubSpot Contact
          </label>
          <p className="text-[0.8rem] text-muted-foreground">
            Search and link a contact from your HubSpot CRM.
          </p>
        </div>
        
        <HubSpotContactSelector {...props} />
      </div>
    </ErrorBoundary>
  );
};

export default ContactSelectionFlow;