import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Copy, Check } from 'lucide-react';

const HubSpotPropertyInspector = ({ fetchProperties, loading }) => {
  const [properties, setProperties] = useState([]);
  const [filter, setFilter] = useState('');
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    // Initial fetch not directly triggered here; it's expected from parent or manual user action.
    // If you want it to load on mount, uncomment the line below:
    // handleFetch(); 
  }, []);

  const handleFetch = async () => {
    const result = await fetchProperties();
    if (result.success && result.data && result.data.results) {
      setProperties(result.data.results);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  };

  const filteredProperties = properties.filter(p => 
    p.name.toLowerCase().includes(filter.toLowerCase()) || 
    p.label.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-center">
          <CardTitle>Property Inspector</CardTitle>
          <Button variant="outline" size="sm" onClick={handleFetch} disabled={loading}>
            Fetch Properties
          </Button>
        </div>
        <div className="relative mt-2">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
          <Input 
            placeholder="Search properties (e.g., 'phone', 'email')..." 
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-8"
          />
        </div>
      </CardHeader>
      <CardContent className="flex-1 min-h-[300px] p-0">
        <ScrollArea className="h-[400px] px-6 pb-6">
          {properties.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              Click fetch to load available HubSpot properties.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredProperties.map((prop) => (
                <div key={prop.name} className="flex items-start justify-between p-3 border rounded-lg bg-gray-50/50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{prop.label}</span>
                      <Badge variant="secondary" className="text-[10px] h-5">{prop.type}</Badge>
                      {prop.hidden && <Badge variant="outline" className="text-[10px] h-5">Hidden</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{prop.description}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <code className="text-[10px] bg-gray-200 dark:bg-gray-800 px-1 py-0.5 rounded font-mono">
                        {prop.name}
                      </code>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6" 
                    onClick={() => copyToClipboard(prop.name)}
                  >
                    {copied === prop.name ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default HubSpotPropertyInspector;