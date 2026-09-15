import React, { useState, useEffect } from 'react';
import { Send, Smartphone, Loader2, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import useWhatsApp from '@/hooks/useWhatsApp';

const WhatsAppMessenger = ({ 
  defaultPhone = '', 
  defaultMessage = '', 
  contactId = null, 
  onSuccess 
}) => {
  const [phone, setPhone] = useState(defaultPhone);
  const [message, setMessage] = useState(defaultMessage);
  const { sendWhatsApp, loading } = useWhatsApp();
  const { toast } = useToast();

  useEffect(() => {
    setPhone(defaultPhone);
  }, [defaultPhone]);

  const handleSend = async () => {
    if (!phone || !message) {
      toast({ 
        title: "Validation Error", 
        description: "Please provide both a phone number and message content.", 
        variant: "destructive" 
      });
      return;
    }

    const result = await sendWhatsApp({ 
      phoneNumber: phone, 
      message, 
      contactId 
    });

    if (result.success) {
      toast({ 
        title: "Message Sent", 
        description: "WhatsApp message has been sent successfully.",
        className: "bg-green-50 text-green-900 border-green-200"
      });
      setMessage(''); // Clear message
      if (onSuccess) onSuccess();
    } else {
      toast({ 
        title: "Send Failed", 
        description: result.error || "Could not send message. Check logs for details.", 
        variant: "destructive" 
      });
    }
  };

  return (
    <Card className="h-full border-t-4 border-t-green-600 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-green-600" />
          Send WhatsApp
        </CardTitle>
        <CardDescription>Send direct messages via Direct7 API</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="wa-phone">Phone Number</Label>
          <div className="relative">
            <Smartphone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              id="wa-phone" 
              placeholder="+1234567890" 
              className="pl-9"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">Include country code (e.g. +1 for US)</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="wa-message">Message</Label>
          <Textarea 
            id="wa-message" 
            placeholder="Type your WhatsApp message..." 
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="resize-none"
          />
          <div className="flex justify-end">
             <span className="text-xs text-muted-foreground">{message.length} chars</span>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button 
          className="w-full bg-green-600 hover:bg-green-700 text-white" 
          onClick={handleSend}
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              Send Message
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default WhatsAppMessenger;