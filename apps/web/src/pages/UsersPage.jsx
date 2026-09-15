import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/layout/DashboardLayout';
import InviteUserDialog from '@/components/users/InviteUserDialog';
import DirectUserCreationDialog from '@/components/users/DirectUserCreationDialog';
import PendingInvitationsTable from '@/components/users/PendingInvitationsTable';
import AcceptedInvitationsTable from '@/components/users/AcceptedInvitationsTable';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Users, Clock, CheckCircle2 } from 'lucide-react';

const UsersPage = () => {
  const [activeTab, setActiveTab] = useState('accepted');
  const [pendingInvitations, setPendingInvitations] = useState([]);
  const [acceptedUsers, setAcceptedUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch Pending Invitations
      const { data: pendingData, error: pendingError } = await supabase
        .from('invitations')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (pendingError) throw pendingError;
      setPendingInvitations(pendingData || []);

      // 2. Fetch All Active Users (Accepted/Created Profiles)
      const { data: userData, error: userError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (userError) throw userError;
      setAcceptedUsers(userData || []);

    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load user data.",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handler for refreshing data after any action
  const handleRefresh = () => {
    fetchData();
  };

  return (
    <DashboardLayout>
      <Helmet>
        <title>User Management - Novakleen</title>
      </Helmet>

      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-100 dark:border-gray-700 pb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <Users className="h-8 w-8 text-blue-600" />
              User Management
            </h1>
            <p className="text-gray-500 mt-1">Manage team access, invitations, and active users.</p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <DirectUserCreationDialog onUserCreated={handleRefresh} />
            <InviteUserDialog onUserInvited={handleRefresh} />
          </div>
        </div>

        {/* Tabs Section */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-[400px] grid-cols-2 mb-8">
            <TabsTrigger value="accepted" className="gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Active Users
              <span className="ml-1.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 py-0.5 px-2 rounded-full text-xs font-semibold">
                {acceptedUsers.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="pending" className="gap-2">
              <Clock className="h-4 w-4" />
              Pending Invitations
              {pendingInvitations.length > 0 && (
                <span className="ml-1.5 bg-amber-100 text-amber-700 py-0.5 px-2 rounded-full text-xs font-semibold">
                  {pendingInvitations.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="accepted" className="space-y-4 animate-in fade-in-50 duration-300 slide-in-from-left-2">
             <AcceptedInvitationsTable
               users={acceptedUsers}
               loading={loading}
               onActionComplete={handleRefresh}
               currentUserId={user?.id}
             />
          </TabsContent>

          <TabsContent value="pending" className="space-y-4 animate-in fade-in-50 duration-300 slide-in-from-right-2">
            <PendingInvitationsTable 
              invitations={pendingInvitations} 
              loading={loading} 
              onActionComplete={handleRefresh} 
            />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default UsersPage;