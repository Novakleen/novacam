import React from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

class CompanyCamErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('CompanyCam Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card className="border-red-200 bg-red-50/50 dark:bg-red-950/20 max-w-xl mx-auto mt-8">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <AlertTriangle className="h-12 w-12 text-red-500" />
            </div>
            <CardTitle className="text-red-700 dark:text-red-400">Integration Error</CardTitle>
            <CardDescription className="text-red-600/80 dark:text-red-500/80">
              There was a problem communicating with the CompanyCam API.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <p className="text-sm font-mono bg-white dark:bg-black p-3 rounded-lg border border-red-100 dark:border-red-900 mb-6 text-red-800 dark:text-red-300 w-full overflow-x-auto">
              {this.state.error?.message || 'Unknown error occurred'}
            </p>
            <Button 
              onClick={() => this.setState({ hasError: false, error: null })} 
              variant="outline"
              className="gap-2"
            >
              <RefreshCcw className="h-4 w-4" /> Try Again
            </Button>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}

export default CompanyCamErrorBoundary;