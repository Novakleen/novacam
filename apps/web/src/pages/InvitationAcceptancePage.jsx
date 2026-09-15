import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { ShieldCheck, ArrowRight, AlertTriangle, Monitor, Loader2, User, Lock } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useInvitation } from '@/contexts/InvitationContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PasswordStrengthIndicator from '@/components/ui/PasswordStrengthIndicator';

const InvitationAcceptancePage = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const { validateInvitationToken } = useInvitation();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [invitation, setInvitation] = useState(null);
  const [error, setError] = useState(null);
  
  const [formData, setFormData] = useState({
    fullName: '',
    password: '',
    confirmPassword: ''
  });

  useEffect(() => {
    const checkToken = async () => {
      if (!token) {
        setError("Invalid invitation link.");
        setLoading(false);
        return;
      }

      const { valid, invitation: data, error: validationError } = await validateInvitationToken(token);
      
      if (!valid) {
        setError(validationError);
      } else {
        setInvitation(data);
      }
      setLoading(false);
    };

    checkToken();
  }, [token, validateInvitationToken]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      toast({
        variant: "destructive",
        title: "Passwords do not match",
        description: "Please ensure both password fields are identical."
      });
      return;
    }

    setSubmitting(true);

    try {
      // 1. Sign up user
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: invitation.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.fullName,
            role: invitation.role // Store role in metadata initially
          }
        }
      });

      if (signUpError) throw signUpError;

      if (authData.user) {
         // 2. Update Invitation Status
         await supabase
           .from('invitations')
           .update({ 
             status: 'accepted',
             accepted_at: new Date().toISOString()
           })
           .eq('id', invitation.id);

         // 3. Update Profile (if needed beyond trigger)
         await supabase
           .from('profiles')
           .update({ 
             full_name: formData.fullName,
             role: invitation.role,
             initials: formData.fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
           })
           .eq('id', authData.user.id);

         // 4. Sign in immediately (if not auto-signed in)
         const { error: signInError } = await supabase.auth.signInWithPassword({
            email: invitation.email,
            password: formData.password
         });
         
         if (signInError) throw signInError;

         toast({
           title: "Welcome to Novakleen!",
           description: "Your account has been set up successfully.",
         });
         
         navigate('/dashboard');
      }

    } catch (err) {
      console.error("Acceptance error:", err);
      toast({
        variant: "destructive",
        title: "Setup Failed",
        description: err.message
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600 mb-4" />
        <p className="text-gray-500">Verifying invitation...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 text-center">
          <div className="h-16 w-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="h-8 w-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Invalid Invitation</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">{error}</p>
          <Button onClick={() => navigate('/login')} className="w-full">
            Back to Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Helmet>
        <title>Accept Invitation - Novakleen</title>
      </Helmet>
      
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
           <div className="mx-auto w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30 mb-4">
              <Monitor className="h-6 w-6 text-white" />
           </div>
           <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Join Novakleen</h1>
        </div>

        <motion.div 
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-100 dark:border-gray-700"
        >
           <div className="flex items-center gap-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl mb-6 border border-blue-100 dark:border-blue-900/50">
              <div className="h-10 w-10 bg-blue-100 dark:bg-blue-800 rounded-full flex items-center justify-center shrink-0">
                 <ShieldCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                 <p className="text-sm font-medium text-gray-900 dark:text-white">Invitation Verified</p>
                 <p className="text-xs text-gray-500 dark:text-gray-400">
                    Invited by <strong>{invitation?.created_by_profile?.full_name || 'Admin'}</strong>
                 </p>
              </div>
           </div>

           <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                 <Label>Email Address</Label>
                 <Input value={invitation.email} disabled className="bg-gray-50 dark:bg-gray-900 opacity-70" />
              </div>

              <div className="space-y-2">
                 <Label htmlFor="fullName">Full Name</Label>
                 <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input 
                       id="fullName" 
                       placeholder="John Doe" 
                       className="pl-9"
                       value={formData.fullName}
                       onChange={(e) => setFormData({...formData, fullName: e.target.value})}
                       required 
                    />
                 </div>
              </div>

              <div className="space-y-2">
                 <Label htmlFor="password">Create Password</Label>
                 <div className="relative">
                    <Lock className="absolute left-3 top-3 text-gray-400 h-4 w-4" />
                    <Input 
                       id="password" 
                       type="password" 
                       placeholder="••••••••" 
                       className="pl-9"
                       value={formData.password}
                       onChange={(e) => setFormData({...formData, password: e.target.value})}
                       required 
                    />
                 </div>
                 <PasswordStrengthIndicator password={formData.password} />
              </div>

              <div className="space-y-2">
                 <Label htmlFor="confirmPassword">Confirm Password</Label>
                 <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input 
                       id="confirmPassword" 
                       type="password" 
                       placeholder="••••••••" 
                       className="pl-9"
                       value={formData.confirmPassword}
                       onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                       required 
                    />
                 </div>
              </div>

              <Button type="submit" className="w-full h-11 text-base mt-4" disabled={submitting}>
                 {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Setting up account...
                    </>
                 ) : (
                    <>
                      Create Account <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                 )}
              </Button>
           </form>
        </motion.div>
      </div>
    </div>
  );
};

export default InvitationAcceptancePage;