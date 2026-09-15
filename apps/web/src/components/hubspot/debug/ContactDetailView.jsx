import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Copy, Check, Code, X, User, Phone, Mail, Building, Globe, Activity, FileJson } from 'lucide-react';
import { format } from 'date-fns';

const ContactDetailView = ({ contact, onClose }) => {
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!contact) {
    return (
      <Card className="h-full flex items-center justify-center p-6 bg-gray-50/50 border-dashed border-2">
        <div className="text-center text-muted-foreground space-y-3">
          <div className="h-16 w-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
             <User className="h-8 w-8 text-gray-400" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">No Contact Selected</h3>
            <p className="text-sm">Click a contact in the table to view details</p>
          </div>
        </div>
      </Card>
    );
  }

  const copyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(contact, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Helper to safely get properties
  const p = (key) => contact.properties?.[key];

  const formatValue = (val) => {
      if (!val) return <span className="text-muted-foreground italic text-xs">Empty</span>;
      return val;
  }

  const mainProperties = [
    { label: 'First Name', value: p('firstname'), icon: User },
    { label: 'Last Name', value: p('lastname'), icon: User },
    { label: 'Email', value: p('email'), icon: Mail },
    { label: 'Phone', value: p('phone'), icon: Phone },
    { label: 'Company', value: p('company'), icon: Building },
    { label: 'Website', value: p('website'), icon: Globe },
    { label: 'Lifecycle Stage', value: p('lifecyclestage'), icon: Activity },
    { label: 'Lead Status', value: p('hs_lead_status'), icon: Activity },
  ];

  return (
    <Card className="h-full flex flex-col border-blue-200 dark:border-blue-900 shadow-sm overflow-hidden transition-all duration-300">
      <CardHeader className="pb-3 bg-gray-50/50 dark:bg-gray-900/50 border-b space-y-1">
        <div className="flex justify-between items-start gap-4">
            <div className="overflow-hidden">
                <CardTitle className="text-lg flex items-center gap-2 truncate">
                    {p('firstname')} {p('lastname')}
                </CardTitle>
                <CardDescription className="font-mono text-[10px] mt-1 truncate" title={contact.id}>
                    ID: {contact.id}
                </CardDescription>
            </div>
            <div className="flex items-center gap-1 shrink-0">
               {onClose && (
                  <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-muted-foreground hover:text-foreground">
                      <X className="h-4 w-4" />
                  </Button>
               )}
            </div>
        </div>
        <div className="flex gap-2 mt-2">
            <Button 
                variant="outline" 
                size="sm" 
                className="h-7 text-xs gap-1.5"
                onClick={copyJson}
            >
                {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy JSON'}
            </Button>
            <Button 
                variant={showRaw ? "secondary" : "outline"} 
                size="sm" 
                className="h-7 text-xs gap-1.5"
                onClick={() => setShowRaw(!showRaw)}
            >
                {showRaw ? <FileJson className="h-3.5 w-3.5" /> : <Code className="h-3.5 w-3.5" />}
                {showRaw ? 'Hide Raw' : 'Show Raw'}
            </Button>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 p-0 overflow-hidden relative">
        <ScrollArea className="h-full">
            {showRaw ? (
                <div className="p-0">
                    <pre className="text-[10px] font-mono bg-[#0d1117] text-gray-300 p-4 min-h-[400px] overflow-x-auto leading-relaxed">
                        {JSON.stringify(contact, null, 2)}
                    </pre>
                </div>
            ) : (
                <div className="p-5 space-y-6">
                    <div className="space-y-4">
                        {mainProperties.map((prop, index) => (
                            <div key={index} className="group flex items-start gap-3">
                                <div className="mt-0.5 p-1.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                                   <prop.icon className="h-4 w-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block mb-0.5">
                                        {prop.label}
                                    </span>
                                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 break-words block">
                                        {formatValue(prop.value)}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="pt-4 border-t">
                        <h4 className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                           <Activity className="h-3.5 w-3.5 text-gray-500" />
                           Metadata
                        </h4>
                        <div className="grid grid-cols-2 gap-4 text-xs bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg border border-gray-100 dark:border-gray-800">
                             <div>
                                <span className="text-gray-500 block mb-1">Created At</span>
                                <span className="font-mono">{contact.createdAt ? format(new Date(contact.createdAt), 'MMM d, HH:mm') : 'N/A'}</span>
                             </div>
                             <div>
                                <span className="text-gray-500 block mb-1">Updated At</span>
                                <span className="font-mono">{contact.updatedAt ? format(new Date(contact.updatedAt), 'MMM d, HH:mm') : 'N/A'}</span>
                             </div>
                             <div>
                                <span className="text-gray-500 block mb-1">Archived</span>
                                <span className="font-mono">{contact.archived ? 'Yes' : 'No'}</span>
                             </div>
                        </div>
                    </div>
                </div>
            )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default ContactDetailView;