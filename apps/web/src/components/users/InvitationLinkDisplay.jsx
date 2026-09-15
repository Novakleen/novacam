import React, { useState } from 'react';
import { Copy, Check, Clock, AlertCircle, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { format } from 'date-fns';
import { useInvitation } from '@/contexts/InvitationContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const InvitationLinkDisplay = ({ invitationLink, expiresAt, className, invitationData }) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { sendInvitationEmail } = useInvitation();
  const [copied, setCopied] = useState(false);
  const [resending, setResending] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(invitationLink);
      setCopied(true);
      toast({
        title: "Link Copied",
        description: "Invitation link copied to clipboard.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Copy Failed",
        description: "Could not copy link to clipboard.",
      });
    }
  };

  const handleResendEmail = async () => {
    if (!invitationData) return;
    
    setResending(true);
    const result = await sendInvitationEmail({
      email: invitationData.email,
      link: invitationLink,
      expiresAt: expiresAt,
      invitedByName: user?.user_metadata?.full_name || user?.email
    });
    setResending(false);

    if (result.success) {
      toast({
        title: "Email Resent",
        description: `Invitation email sent to ${invitationData.email}`,
      });
    } else {
      toast({
        variant: "destructive",
        title: "Failed to Send",
        description: "Could not send the invitation email.",
      });
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="mt-1 shrink-0">
            <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="text-sm text-blue-900 dark:text-blue-100">
            <p className="font-semibold mb-1">Invitation Created</p>
            <p className="text-blue-700 dark:text-blue-300">
              An email has been sent. You can also copy the link below or resend the email if needed.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="invitation-link">Invitation Link</Label>
        <div className="flex items-center gap-2">
          <Input 
            id="invitation-link" 
            value={invitationLink} 
            readOnly 
            className="font-mono text-sm bg-gray-50 dark:bg-gray-900"
          />
          <Button 
            size="icon" 
            variant="outline" 
            onClick={handleCopy}
            className={copied ? "text-green-600 border-green-200 bg-green-50" : ""}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      
      <div className="flex items-center justify-between pt-2">
         {expiresAt && (
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <Clock className="h-3.5 w-3.5" />
            <span>Expires on {format(new Date(expiresAt), 'MMM d, yyyy h:mm a')}</span>
          </div>
        )}
        
        {invitationData && (
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={handleResendEmail} 
            disabled={resending}
            className="text-xs h-8"
          >
            {resending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <Send className="h-3.5 w-3.5 mr-1.5" />
            )}
            Resend Email
          </Button>
        )}
      </div>

    </div>
  );
};

export default InvitationLinkDisplay;