import React, { createContext, useContext, useState, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { addDays } from 'date-fns';

const InvitationContext = createContext(undefined);

export const InvitationProvider = ({ children }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const generateLink = (token) => {
    return `${window.location.origin}/invitations/${token}`;
  };

  const sendInvitationEmail = useCallback(async ({ email, link, expiresAt, invitedByName }) => {
    try {
      const { data, error } = await supabase.functions.invoke('send-invitation-email', {
        body: { 
          email, 
          invitationLink: link, 
          expiresAt, 
          invitedByName 
        }
      });

      if (error) {
        console.error('Edge Function Error:', error);
        return { success: false, error: error.message || "Network error calling email service" };
      }
      
      // Check if the function returned an application-level error
      if (data && data.error) {
        console.error('Email Service Error:', data.error);
        return { success: false, error: data.error };
      }

      return { success: true, data };
    } catch (error) {
      console.error('Failed to send email (Exception):', error);
      return { success: false, error: error.message || "Unexpected error sending email" };
    }
  }, []);

  const sendInvitation = useCallback(async ({ email, role = 'Member' }) => {
    if (!user) return { error: 'Not authenticated' };
    setLoading(true);

    try {
      // Check for duplicate pending invitation
      const { data: existing, error: checkError } = await supabase
        .from('invitations')
        .select('id')
        .eq('email', email)
        .eq('status', 'pending')
        .maybeSingle();
        
      if (checkError) throw checkError;
        
      if (existing) {
        throw new Error(`An active invitation already exists for ${email}. Please use the existing one or revoke it first.`);
      }

      // 1. Generate a unique token
      const token = crypto.randomUUID();
      const expiresAt = addDays(new Date(), 7).toISOString();
      
      // 2. Create database record
      const { data: invitation, error: dbError } = await supabase
        .from('invitations')
        .insert({
          created_by: user.id,
          email,
          token,
          role,
          status: 'pending',
          expires_at: expiresAt
        })
        .select()
        .single();

      if (dbError) throw dbError;

      const link = generateLink(token);

      return { 
        data: {
          ...invitation,
          link
        }
      };

    } catch (error) {
      console.error('Error creating invitation:', error);
      return { error };
    } finally {
      setLoading(false);
    }
  }, [user]);

  const validateInvitationToken = useCallback(async (token) => {
    try {
      const { data, error } = await supabase
        .from('invitations')
        .select('*, created_by_profile:profiles!created_by(full_name)')
        .eq('token', token)
        .maybeSingle();

      if (error) {
        console.error("Validation Error:", error);
        return { valid: false, error: "Unable to validate invitation. Please try again." };
      }

      if (!data) {
        return { valid: false, error: 'Invalid invitation link' };
      }

      if (data.status !== 'pending') {
         const statusMsg = data.status === 'revoked' ? 'This invitation has been revoked.' : 'This invitation has already been used.';
         return { valid: false, error: statusMsg };
      }

      if (new Date(data.expires_at) < new Date()) {
        return { valid: false, error: 'Invitation has expired' };
      }

      return { valid: true, invitation: data };
    } catch (error) {
      console.error("Validation Exception:", error);
      return { valid: false, error: error.message || "Network error" };
    }
  }, []);

  const revokeInvitation = useCallback(async (id) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('invitations')
        .delete() 
        .eq('id', id);

      if (error) throw error;
      
      toast({
        title: "Invitation Revoked",
        description: "The invitation has been removed.",
      });
      return { success: true };
    } catch (error) {
      console.error("Revoke Error:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to revoke invitation.",
      });
      return { error };
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Alias for backward compatibility
  const cancelInvitation = revokeInvitation;

  const regenerateInvitationLink = useCallback(async (invitationId) => {
    setLoading(true);
    try {
      const { data: invitation, error: fetchError } = await supabase
        .from('invitations')
        .select('*')
        .eq('id', invitationId)
        .maybeSingle();
        
      if (fetchError) throw fetchError;
      if (!invitation) throw new Error("Invitation not found");
      
      const newToken = crypto.randomUUID();
      const newExpiresAt = addDays(new Date(), 7).toISOString();
      
      const { data: updated, error: updateError } = await supabase
        .from('invitations')
        .update({ 
          token: newToken,
          expires_at: newExpiresAt,
          status: 'pending',
          updated_at: new Date().toISOString()
        })
        .eq('id', invitationId)
        .select()
        .single();
        
      if (updateError) throw updateError;
      
      const link = generateLink(newToken);
      
      toast({
        title: "Link Regenerated",
        description: "Old link is now invalid. New link created.",
      });
      
      return { 
        success: true, 
        data: {
          ...updated,
          link
        }
      };
    } catch (error) {
      console.error("Regenerate error:", error);
      toast({
        variant: "destructive",
        title: "Regeneration Failed",
        description: error.message || "Network error",
      });
      return { error };
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const getInvitationStatus = (invitation) => {
    if (invitation.status === 'accepted') return 'accepted';
    if (invitation.status === 'revoked' || invitation.status === 'cancelled') return 'revoked';
    if (new Date(invitation.expires_at) < new Date()) return 'expired';
    return 'pending';
  };

  return (
    <InvitationContext.Provider value={{ 
      sendInvitation, 
      sendInvitationEmail,
      validateInvitationToken, 
      revokeInvitation,
      cancelInvitation,
      regenerateInvitationLink,
      getInvitationStatus,
      generateLink,
      loading 
    }}>
      {children}
    </InvitationContext.Provider>
  );
};

export const useInvitation = () => {
  const context = useContext(InvitationContext);
  if (context === undefined) {
    throw new Error('useInvitation must be used within an InvitationProvider');
  }
  return context;
};