import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea.jsx';
import { Send, RefreshCw } from 'lucide-react';

const CustomAPITester = ({ onSend, loading, apiResponse }) => { // Added apiResponse prop
  const [method, setMethod] = useState('GET');
  const [endpoint, setEndpoint] = useState('/crm/v3/objects/contacts');
  const [body, setBody] = useState('{\n  "properties": {\n    "firstname": "Test",\n    "lastname": "Contact",\n    "email": "test@example.com",\n    "phone": "(123) 456-7890"\n  }\n}');

  const handleSubmit = (e) => {
    e.preventDefault();
    let parsedBody = null;
    
    if (method !== 'GET' && method !== 'DELETE' && body.trim()) {
      try {
        parsedBody = JSON.parse(body);
      } catch (err) {
        alert('Invalid JSON in body');
        return;
      }
    }

    onSend({
      endpoint,
      method,
      body: parsedBody,
      label: 'Custom API Test'
    });
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Manual API Tester</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-between">
        <form onSubmit={handleSubmit} className="space-y-4 flex-1 flex flex-col">
          <div className="grid grid-cols-[100px_1fr] gap-4">
            <div className="space-y-2">
              <Label>Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="PATCH">PATCH</SelectItem>
                  <SelectItem value="DELETE">DELETE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Endpoint</Label>
              <Input 
                value={endpoint} 
                onChange={(e) => setEndpoint(e.target.value)} 
                placeholder="/crm/v3/..." 
                className="font-mono"
              />
            </div>
          </div>

          {(method === 'POST' || method === 'PUT' || method === 'PATCH') && (
            <div className="space-y-2 flex-1 flex flex-col">
              <Label>Request Body (JSON)</Label>
              <Textarea 
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="font-mono text-xs min-h-[150px] flex-1"
              />
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full gap-2">
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send Request
          </Button>
        </form>

        {apiResponse && (
          <div className="mt-6 space-y-2">
            <Label>API Response</Label>
            <pre className="p-3 bg-gray-100 dark:bg-gray-800 rounded-md text-xs overflow-auto max-h-[200px]">
              {JSON.stringify(apiResponse, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CustomAPITester;