import React, { useState } from 'react';
import { Loader2, UserPlus, Mail, AlertCircle, ArrowLeft } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useInvitation } from '@/contexts/InvitationContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import InvitationLinkDisplay from './InvitationLinkDisplay';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const InviteUserDialog = ({ onUserInvited }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { sendInvitation, sendInvitationEmail, loading: invitationLoading } = useInvitation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [error, setError] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  
  // 'form' or 'success'
  const [step, setStep] = useState('form');
  const [createdInvitation, setCreatedInvitation] = useState(null);

  const [formData, setFormData] = useState({
    email: '',
    role: 'Member',
  });

  const validateEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const resetForm = () => {
    setFormData({ email: '', role: 'Member' });
    setStep('form');
    setCreatedInvitation(null);
    setError('');
  };

  const handleOpenChange = (open) => {
    setIsOpen(open);
    if (!open) {
      setTimeout(resetForm, 300); // Reset after transition
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Input Validation
    if (!formData.email || !validateEmail(formData.email)) {
      setError('Please enter a valid email address.');
      return;
    }

    const validRoles = ['Admin', 'Manager', 'Member', 'Viewer'];
    if (!validRoles.includes(formData.role)) {
      setError('Please select a valid role.');
      return;
    }
    
    // 1. Create Invitation Record
    const result = await sendInvitation({
      email: formData.email,
      role: formData.role
    });

    if (result.error) {
      // Check specifically if it's a duplicate invitation error
      if (result.error.message && result.error.message.includes('already exists')) {
        setError("This email already has a pending invitation. Please check the 'Pending' tab to manage it.");
        // We still trigger onUserInvited so the list refreshes and the user can see the duplicate in the table
        if (onUserInvited) onUserInvited();
      } else {
         setError(result.error.message || 'Failed to create invitation.');
      }
      return;
    } 
    
    if (result.data) {
      setCreatedInvitation(result.data);
      
      // 2. Send Email automatically
      setEmailLoading(true);
      const emailResult = await sendInvitationEmail({
        email: result.data.email,
        link: result.data.link,
        expiresAt: result.data.expires_at,
        invitedByName: user?.user_metadata?.full_name || user?.email
      });
      setEmailLoading(false);

      if (emailResult.success) {
        toast({
          title: "Invitation Sent",
          description: `Invitation email sent to ${result.data.email}`,
        });
      } else {
        // Show error but keep success state for the link
        toast({
          variant: "destructive",
          title: "Email Failed",
          description: "Created invitation but failed to send email. Please use copy link.",
        });
        console.error("Email send error:", emailResult.error);
      }

      setStep('success');
      if (onUserInvited) onUserInvited();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-2 shadow-sm hover:shadow-md transition-all">
          <UserPlus className="h-4 w-4" />
          Invite User
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {step === 'form' ? 'Invite Team Member' : 'Invitation Created'}
          </DialogTitle>
          <DialogDescription>
            {step === 'form' 
              ? 'Send an email invitation to a new team member.' 
              : `Invitation link generated for ${formData.email}.`
            }
          </DialogDescription>
        </DialogHeader>
        
        {step === 'form' ? (
          <form onSubmit={handleSubmit} className="grid gap-4 py-4">
            {error && (
              <Alert variant="destructive" className="py-2 bg-red-50 text-red-900 border-red-200">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <AlertDescription className="ml-2">{error}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-2">
              <Label htmlFor="email">Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="pl-10"
                  placeholder="colleague@example.com"
                  required
                />
              </div>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="role">Role</Label>
              <Select 
                value={formData.role} 
                onValueChange={(value) => setFormData({ ...formData, role: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Admin">Admin</SelectItem>
                  <SelectItem value="Manager">Manager</SelectItem>
                  <SelectItem value="Member">Member</SelectItem>
                  <SelectItem value="Viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                {formData.role === 'Admin' && 'Full access to all projects and user management.'}
                {formData.role === 'Manager' && 'Can manage projects and team members.'}
                {formData.role === 'Member' && 'Standard access to assigned projects.'}
                {formData.role === 'Viewer' && 'Read-only access to projects.'}
              </p>
            </div>

            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={invitationLoading || emailLoading}>
                {(invitationLoading || emailLoading) ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 
                    {emailLoading ? 'Sending Email...' : 'Creating...'}
                  </>
                ) : (
                  'Send Invitation'
                )}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="py-2">
            <InvitationLinkDisplay 
              invitationLink={createdInvitation.link} 
              expiresAt={createdInvitation.expires_at}
              invitationData={createdInvitation} // Pass full data for resend capability
            />
            
            <DialogFooter className="mt-6 sm:justify-between">
              <Button type="button" variant="ghost" onClick={() => setStep('form')} className="text-gray-500">
                <ArrowLeft className="mr-2 h-4 w-4" /> Invite Another
              </Button>
              <Button type="button" onClick={() => setIsOpen(false)}>
                Done
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default InviteUserDialog;