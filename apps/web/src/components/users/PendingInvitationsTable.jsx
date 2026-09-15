import React, { useState, useEffect } from 'react';
import { 
  Mail, Clock, Copy, RefreshCw, Trash2, MoreVertical, Shield, Send
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from '@/components/ui/use-toast';
import { format, intervalToDuration, isPast } from 'date-fns';
import { useInvitation } from '@/contexts/InvitationContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const CountdownTimer = ({ expiresAt }) => {
  const [timeLeft, setTimeLeft] = useState('');
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date();
      const expiry = new Date(expiresAt);
      
      if (isPast(expiry)) {
        setIsExpired(true);
        setTimeLeft('Expired');
        return;
      }

      const duration = intervalToDuration({ start: now, end: expiry });
      
      if (duration.days > 0) {
        setTimeLeft(`${duration.days}d ${duration.hours}h left`);
      } else if (duration.hours > 0) {
        setTimeLeft(`${duration.hours}h ${duration.minutes}m left`);
      } else {
        setTimeLeft(`${duration.minutes}m ${duration.seconds}s left`);
      }
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(timer);
  }, [expiresAt]);

  return (
    <span className={`text-xs font-medium ${isExpired ? 'text-red-600' : 'text-orange-600'}`}>
      {timeLeft}
    </span>
  );
};

const PendingInvitationsTable = ({ invitations, onActionComplete, loading }) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { regenerateInvitationLink, revokeInvitation, generateLink, sendInvitationEmail } = useInvitation();
  const [processingId, setProcessingId] = useState(null);
  const [invitationToRevoke, setInvitationToRevoke] = useState(null);

  const handleCopyLink = async (token) => {
    const link = generateLink(token);
    try {
      await navigator.clipboard.writeText(link);
      toast({
        title: "Copied!",
        description: "Invitation link copied to clipboard.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to copy link.",
      });
    }
  };

  const handleResend = async (invitation) => {
    setProcessingId(invitation.id);
    
    try {
      // 1. Regenerate token
      const result = await regenerateInvitationLink(invitation.id);
      
      if (result.success && result.data) {
        // 2. Resend email with new token
        const emailResult = await sendInvitationEmail({
          email: invitation.email,
          link: result.data.link,
          expiresAt: result.data.expires_at,
          invitedByName: user?.user_metadata?.full_name || user?.email
        });
        
        if (emailResult.success) {
           toast({
            title: "Invitation Resent",
            description: `New link generated and email sent to ${invitation.email}`,
          });
        } else {
           toast({
            variant: "destructive",
            title: "Email Failed",
            description: "Link regenerated but email failed to send.",
          });
        }
        
        onActionComplete();
      }
    } catch (error) {
       console.error(error);
    } finally {
      setProcessingId(null);
    }
  };

  const handleRevokeClick = (id) => {
    setInvitationToRevoke(id);
  };

  const confirmRevoke = async () => {
    if (!invitationToRevoke) return;
    
    setProcessingId(invitationToRevoke);
    const result = await revokeInvitation(invitationToRevoke);
    if (result.success) {
      onActionComplete();
      setInvitationToRevoke(null);
    }
    setProcessingId(null);
  };

  if (loading) {
    return (
      <div className="py-12 text-center text-gray-500 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
        <div className="flex justify-center items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500"></div>
          Loading pending invitations...
        </div>
      </div>
    );
  }

  if (invitations.length === 0) {
    return (
      <div className="py-12 text-center text-gray-500 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
        <div className="flex flex-col items-center gap-3">
          <div className="h-12 w-12 bg-amber-50 dark:bg-amber-900/20 rounded-full flex items-center justify-center">
            <Mail className="h-6 w-6 text-amber-500" />
          </div>
          <p>No pending invitations found.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700">
              <tr>
                <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Email / User</th>
                <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Expires</th>
                <th className="text-right py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {invitations.map((invite) => {
                const isExpired = isPast(new Date(invite.expires_at));
                const isProcessing = processingId === invite.id;

                return (
                  <tr key={invite.id} className="hover:bg-amber-50/30 dark:hover:bg-amber-900/10 transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0 border border-amber-200 dark:border-amber-800">
                          <Mail className="h-4 w-4" />
                        </div>
                        <span className="font-medium text-gray-900 dark:text-white">{invite.email}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                        <Shield className="h-3.5 w-3.5" />
                        <span className="text-sm">{invite.role}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <Badge variant="outline" className={`${isExpired ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                        {isExpired ? 'Expired' : 'Pending'}
                      </Badge>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <Clock className="h-3.5 w-3.5" />
                          <span>{format(new Date(invite.expires_at), 'MMM d, h:mm a')}</span>
                        </div>
                        <CountdownTimer expiresAt={invite.expires_at} />
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex justify-end gap-2">
                         {/* Desktop Buttons */}
                         <div className="hidden md:flex gap-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              disabled={isProcessing}
                              onClick={() => handleCopyLink(invite.token)}
                              className="h-8"
                            >
                              <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy
                            </Button>
                            <Button 
                              variant="outline"
                              size="sm"
                              disabled={isProcessing}
                              onClick={() => handleResend(invite)}
                              className="h-8"
                            >
                               {isProcessing ? (
                                  <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                               ) : (
                                  <Send className="h-3.5 w-3.5 mr-1.5" />
                               )}
                               {isExpired ? 'Renew & Send' : 'Resend'}
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              disabled={isProcessing}
                              onClick={() => handleRevokeClick(invite.id)}
                              className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                         </div>

                         {/* Mobile Dropdown */}
                         <div className="md:hidden">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4 text-gray-500" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuItem disabled={isProcessing} onClick={() => handleCopyLink(invite.token)}>
                                <Copy className="mr-2 h-4 w-4" /> Copy Link
                              </DropdownMenuItem>
                              <DropdownMenuItem disabled={isProcessing} onClick={() => handleResend(invite)}>
                                <RefreshCw className="mr-2 h-4 w-4" /> {isExpired ? 'Renew & Send' : 'Resend Email'}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                 onClick={() => handleRevokeClick(invite.id)} 
                                 className="text-red-600 focus:text-red-600"
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> Revoke
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                         </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!invitationToRevoke} onOpenChange={(open) => !open && setInvitationToRevoke(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke Invitation</DialogTitle>
            <DialogDescription>
              Are you sure you want to revoke this invitation? The link will stop working immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvitationToRevoke(null)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={confirmRevoke}
              disabled={processingId === invitationToRevoke}
            >
              {processingId === invitationToRevoke ? 'Revoking...' : 'Revoke Invitation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PendingInvitationsTable;