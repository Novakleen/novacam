import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';

const AuthContext = createContext(undefined);

export const AuthProvider = ({ children }) => {
  const { toast } = useToast();

  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(false);

  const handleSession = useCallback(async (session) => {
    setSession(session);
    setUser(session?.user ?? null);
    setLoading(false);
    setConnectionError(false);
  }, []);

  useEffect(() => {
    let mounted = true;
    let retryCount = 0;
    const maxRetries = 3;

    const getSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) throw error;
        
        if (mounted) {
          handleSession(session);
        }
      } catch (error) {
        console.error('Auth Session Error:', error);
        
        // Check for network-related errors or fetch failures
        const isNetworkError = 
          error.message?.includes('fetch') || 
          error.message?.includes('network') ||
          error.status === 500 ||
          !window.navigator.onLine;

        if (isNetworkError && retryCount < maxRetries) {
          retryCount++;
          const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff: 2s, 4s, 8s
          console.log(`Retrying auth check in ${delay}ms (Attempt ${retryCount}/${maxRetries})...`);
          
          if (mounted) {
            setTimeout(getSession, delay);
          }
          return;
        }

        if (mounted) {
          setLoading(false);
          // Only show toast for actual errors, not just missing session
          if (error.message !== 'Auth session missing!') {
             setConnectionError(true);
             toast({
               variant: "destructive",
               title: "Connection Issue",
               description: "Could not connect to authentication service. Please check your internet connection.",
             });
          }
        }
      }
    };

    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (mounted) handleSession(session);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [handleSession, toast]);

  const signUpWithInvitation = useCallback(async (email, password, token, options = {}) => {
    try {
      // 1. Verify token validity first (double check)
      const { data: invitation, error: inviteError } = await supabase
        .from('invitations')
        .select('*')
        .eq('token', token)
        .eq('status', 'pending')
        .single();

      if (inviteError || !invitation || invitation.email !== email) {
        const msg = "Invalid or expired invitation token for this email.";
        toast({
          variant: "destructive",
          title: "Sign up Failed",
          description: msg,
        });
        return { error: { message: msg } };
      }

      // 2. Perform Signup
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          ...options,
          data: {
            ...options.data,
            invitation_token: token,
            role: invitation.role // Assign role from invitation
          }
        }
      });

      if (authError) throw authError;

      // 3. Mark invitation as accepted
      if (authData.user) {
        await supabase
          .from('invitations')
          .update({ 
            status: 'accepted',
            accepted_at: new Date().toISOString()
          })
          .eq('token', token);
          
        // Also update profile immediately if needed
        await supabase
          .from('profiles')
          .update({ role: invitation.role })
          .eq('id', authData.user.id);
      }

      return { data: authData, error: null };
    } catch (error) {
      console.error("Sign Up Error:", error);
      toast({
        variant: "destructive",
        title: "Sign up Failed",
        description: error.message || "Network error during sign up.",
      });
      return { error };
    }
  }, [toast]);

  const signIn = useCallback(async (email, password) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      return { error: null };
    } catch (error) {
      console.error("Sign In Error:", error);
      toast({
        variant: "destructive",
        title: "Sign in Failed",
        description: error.message || "Network connection failed.",
      });
      return { error };
    }
  }, [toast]);

  const signOut = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      return { error: null };
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Sign out Failed",
        description: error.message || "Something went wrong",
      });
      return { error };
    }
  }, [toast]);

  const value = useMemo(() => ({
    user,
    session,
    loading,
    connectionError,
    signUpWithInvitation,
    signIn,
    signOut,
  }), [user, session, loading, connectionError, signUpWithInvitation, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};