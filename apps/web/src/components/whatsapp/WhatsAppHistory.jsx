import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion.jsx";
import { 
  RefreshCw, 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  MoreHorizontal 
} from 'lucide-react';
import useWhatsApp from '@/hooks/useWhatsApp';

const WhatsAppHistory = () => {
  const { getWhatsAppHistory, historyLoading } = useWhatsApp();
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState('all');

  const fetchLogs = async () => {
    const result = await getWhatsAppHistory();
    if (result.success) {
      setLogs(result.logs);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter(log => {
    if (filter === 'all') return true;
    if (filter === 'sent') return log.status === 'sent' || log.status === 'success';
    if (filter === 'failed') return log.status === 'failed' || log.status === 'error';
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button 
            variant={filter === 'all' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setFilter('all')}
          >
            All
          </Button>
          <Button 
            variant={filter === 'sent' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setFilter('sent')}
            className={filter === 'sent' ? "bg-green-600 hover:bg-green-700" : ""}
          >
            Sent
          </Button>
          <Button 
            variant={filter === 'failed' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setFilter('failed')}
            className={filter === 'failed' ? "bg-red-600 hover:bg-red-700" : ""}
          >
            Failed
          </Button>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchLogs} disabled={historyLoading}>
          <RefreshCw className={`h-4 w-4 ${historyLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Status</TableHead>
              <TableHead className="w-[180px]">Date</TableHead>
              <TableHead className="w-[150px]">Phone</TableHead>
              <TableHead>Message</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {historyLoading && logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Loading logs...
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredLogs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  No WhatsApp logs found.
                </TableCell>
              </TableRow>
            ) : (
              filteredLogs.map((log) => (
                <TableRow key={log.id} className="group">
                  <TableCell>
                     {log.status === 'sent' || log.status === 'success' ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 flex w-fit items-center gap-1">
                          <CheckCircle className="h-3 w-3" /> Sent
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 flex w-fit items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> Failed
                        </Badge>
                      )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(log.created_at), 'MMM d, yyyy HH:mm')}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{log.phone_number}</TableCell>
                  <TableCell>
                    <Accordion type="single" collapsible className="w-full">
                      <AccordionItem value="item-1" className="border-0">
                        <AccordionTrigger className="py-1 hover:no-underline text-sm font-normal text-left justify-start gap-2">
                           <span className="truncate max-w-[300px]">{log.message_content}</span>
                           <MoreHorizontal className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </AccordionTrigger>
                        <AccordionContent>
                           <div className="p-3 mt-2 bg-muted/50 rounded-md space-y-2 text-xs">
                              <div><strong>Full Message:</strong> <p className="mt-1">{log.message_content}</p></div>
                              {log.error_message && (
                                <div className="text-red-500"><strong>Error:</strong> {log.error_message}</div>
                              )}
                              <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-muted-foreground/10">
                                <div><strong>Msg ID:</strong> {log.message_id || '-'}</div>
                                <div><strong>Contact ID:</strong> {log.contact_id || '-'}</div>
                              </div>
                              {log.provider_response && (
                                <div className="mt-2">
                                  <strong>Raw Response:</strong>
                                  <ScrollArea className="h-20 mt-1 rounded border bg-background p-2">
                                    <pre className="text-[10px]">{JSON.stringify(log.provider_response, null, 2)}</pre>
                                  </ScrollArea>
                                </div>
                              )}
                           </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default WhatsAppHistory;