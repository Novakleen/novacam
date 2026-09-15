import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { MessageSquare, Send, RefreshCw, Smartphone, Save, FileText, CheckCircle, AlertCircle, MessageCircle } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import useDirectSMS from '@/hooks/useDirectSMS';
import HubSpotContactSelector from '@/components/hubspot/HubSpotContactSelector';
import { useHubSpotContacts } from '@/hooks/useHubSpotContacts';
import { format } from 'date-fns';
import WhatsAppMessenger from '@/components/whatsapp/WhatsAppMessenger';
import WhatsAppHistory from '@/components/whatsapp/WhatsAppHistory';

const Direct7DebugPage = () => {
  const { sendSMS, getSMSHistory, loading, historyLoading } = useDirectSMS();
  const { contacts } = useHubSpotContacts();
  const { toast } = useToast();
  
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [selectedContactId, setSelectedContactId] = useState(null);
  const [logs, setLogs] = useState([]);
  const [lastResponse, setLastResponse] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [templateName, setTemplateName] = useState('');
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [activeTab, setActiveTab] = useState('sms');

  // WhatsApp-specific State
  const [waPhone, setWaPhone] = useState('');
  const [isQuickSendOpen, setIsQuickSendOpen] = useState(false);

  useEffect(() => {
    fetchHistory();
    fetchTemplates();
  }, []);

  // Update phone when contact is selected
  useEffect(() => {
    if (selectedContactId && contacts.length > 0) {
      const contact = contacts.find(c => c.id === selectedContactId);
      if (contact && contact.phone) {
        setPhone(contact.phone);
        setWaPhone(contact.phone);
      }
    }
  }, [selectedContactId, contacts]);

  const fetchHistory = async () => {
    const data = await getSMSHistory(20);
    if (data && data.success) {
      setLogs(data.logs || []);
    }
  };

  const fetchTemplates = async () => {
    const { data } = await supabase.from('sms_templates').select('*').order('name');
    if (data) setTemplates(data);
  };

  const handleSendSMS = async () => {
    if (!phone || !message) {
      toast({ title: "Validation Error", description: "Phone and message required", variant: "destructive" });
      return;
    }

    const result = await sendSMS({ 
      phone, 
      message, 
      contactId: selectedContactId 
    });

    setLastResponse(result);
    
    if (result.success) {
      toast({ title: "Success", description: "SMS sent successfully!", className: "bg-green-50 text-green-900 border-green-200" });
      setMessage(''); 
      fetchHistory(); 
    }
  };

  const handleSaveTemplate = async () => {
    if (!templateName || !message) {
      toast({ title: "Validation Error", description: "Name and content required for template", variant: "destructive" });
      return;
    }

    setIsSavingTemplate(true);
    const { error } = await supabase.from('sms_templates').insert({
      name: templateName,
      content: message,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    setIsSavingTemplate(false);

    if (error) {
      toast({ title: "Error", description: "Failed to save template", variant: "destructive" });
    } else {
      toast({ title: "Saved", description: "Template saved successfully" });
      setTemplateName('');
      fetchTemplates();
    }
  };

  const handleTemplateSelect = (value) => {
    const template = templates.find(t => t.id === value);
    if (template) {
      setMessage(template.content);
    }
  };

  return (
    <DashboardLayout>
      <Helmet>
        <title>Direct7 Messaging - Novakleen</title>
      </Helmet>
      
      <div className="max-w-[1600px] mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <MessageSquare className="h-8 w-8 text-primary" />
            Direct7 Messaging Center
          </h1>
          <p className="text-muted-foreground mt-1">Manage SMS and WhatsApp communications</p>
        </div>

        {/* Global Contact Selector */}
        <div className="max-w-md space-y-2">
            <Label>Active Contact</Label>
            <div className="flex gap-2 items-start">
                <div className="flex-1">
                    <HubSpotContactSelector 
                        value={selectedContactId} 
                        onChange={setSelectedContactId} 
                    />
                </div>
                {selectedContactId && waPhone && (
                     <Dialog open={isQuickSendOpen} onOpenChange={setIsQuickSendOpen}>
                        <DialogTrigger asChild>
                            <Button className="shrink-0 bg-green-600 hover:bg-green-700">
                                <MessageCircle className="h-4 w-4 mr-2" />
                                Quick WA
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[500px]">
                            <DialogHeader>
                                <DialogTitle>Quick WhatsApp Message</DialogTitle>
                                <DialogDescription>
                                    Send to {contacts.find(c => c.id === selectedContactId)?.first_name} ({waPhone})
                                </DialogDescription>
                            </DialogHeader>
                            <div className="mt-4">
                                <WhatsAppMessenger 
                                    defaultPhone={waPhone} 
                                    contactId={selectedContactId}
                                    onSuccess={() => setIsQuickSendOpen(false)}
                                />
                            </div>
                        </DialogContent>
                     </Dialog>
                )}
            </div>
            {selectedContactId && waPhone && (
                <p className="text-xs text-muted-foreground">
                    Selected: {waPhone}
                </p>
            )}
        </div>

        <Tabs defaultValue="sms" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
            <TabsTrigger value="sms">SMS Messaging</TabsTrigger>
            <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
          </TabsList>
          
          <TabsContent value="sms" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Send Form */}
              <div className="lg:col-span-1 space-y-6">
                <Card className="border-t-4 border-t-blue-600 shadow-md">
                  <CardHeader>
                    <CardTitle>Send SMS</CardTitle>
                    <CardDescription>Standard text messaging</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone Number</Label>
                      <div className="relative">
                        <Smartphone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input 
                          id="phone" 
                          placeholder="+1234567890" 
                          className="pl-9"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label>Message Template</Label>
                      </div>
                      <Select onValueChange={handleTemplateSelect}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a template..." />
                        </SelectTrigger>
                        <SelectContent>
                          {templates.map(t => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="message">Message Content</Label>
                      <Textarea 
                        id="message" 
                        placeholder="Type your message here..." 
                        rows={5}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                      />
                      <div className="text-xs text-right text-muted-foreground">
                        {message.length} characters
                      </div>
                    </div>

                    <Button 
                      className="w-full" 
                      onClick={handleSendSMS}
                      disabled={loading}
                    >
                      {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                      {loading ? 'Sending...' : 'Send SMS'}
                    </Button>
                  </CardContent>
                </Card>

                {/* Template Manager */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Save as Template</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex gap-2">
                       <Input 
                         placeholder="Template Name" 
                         value={templateName}
                         onChange={(e) => setTemplateName(e.target.value)}
                         className="flex-1"
                       />
                       <Button variant="outline" size="icon" onClick={handleSaveTemplate} disabled={isSavingTemplate}>
                         <Save className="h-4 w-4" />
                       </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Right Column: History & Response */}
              <div className="lg:col-span-2 space-y-6">
                <Tabs defaultValue="history">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="history">SMS History</TabsTrigger>
                    <TabsTrigger value="debug">API Debug</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="history" className="mt-4">
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <div className="space-y-1">
                          <CardTitle>SMS Log</CardTitle>
                          <CardDescription>Recent SMS activity</CardDescription>
                        </div>
                        <Button variant="ghost" size="sm" onClick={fetchHistory} disabled={historyLoading}>
                          <RefreshCw className={`h-4 w-4 ${historyLoading ? 'animate-spin' : ''}`} />
                        </Button>
                      </CardHeader>
                      <CardContent>
                        <div className="rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-[100px]">Status</TableHead>
                                <TableHead className="w-[150px]">Time</TableHead>
                                <TableHead>Phone</TableHead>
                                <TableHead className="hidden md:table-cell">Message</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {logs.length === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                    No history found.
                                  </TableCell>
                                </TableRow>
                              ) : (
                                logs.map((log) => (
                                  <TableRow key={log.id}>
                                    <TableCell>
                                      {log.status === 'sent' || log.status === 'success' ? (
                                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 flex w-fit items-center gap-1">
                                          <CheckCircle className="h-3 w-3" /> Sent
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 flex w-fit items-center gap-1">
                                          <AlertCircle className="h-3 w-3" /> {log.status}
                                        </Badge>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">
                                      {format(new Date(log.created_at), 'MMM d, h:mm a')}
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">{log.phone}</TableCell>
                                    <TableCell className="hidden md:table-cell text-sm max-w-[200px] truncate">
                                      {log.content}
                                    </TableCell>
                                  </TableRow>
                                ))
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
                  
                  <TabsContent value="debug" className="mt-4">
                     <Card>
                       <CardHeader>
                         <CardTitle>Last API Response</CardTitle>
                         <CardDescription>Details of the last send attempt</CardDescription>
                       </CardHeader>
                       <CardContent>
                         {lastResponse ? (
                           <ScrollArea className="h-[400px] rounded-md border bg-slate-950 p-4">
                             <pre className="text-xs text-slate-50 font-mono">
                               {JSON.stringify(lastResponse, null, 2)}
                             </pre>
                           </ScrollArea>
                         ) : (
                           <div className="h-[200px] flex items-center justify-center text-muted-foreground border border-dashed rounded-md">
                             No request made yet in this session.
                           </div>
                         )}
                       </CardContent>
                     </Card>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="whatsapp" className="mt-6">
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                 <div className="lg:col-span-1">
                    <WhatsAppMessenger 
                        defaultPhone={waPhone} 
                        contactId={selectedContactId}
                    />
                 </div>
                 <div className="lg:col-span-2">
                    <Card className="h-full">
                        <CardHeader>
                            <CardTitle>WhatsApp History</CardTitle>
                            <CardDescription>Log of all WhatsApp messages sent via API</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <WhatsAppHistory />
                        </CardContent>
                    </Card>
                 </div>
             </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Direct7DebugPage;