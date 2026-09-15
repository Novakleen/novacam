import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { 
  Users, Mail, Search, Clock, CheckCircle2, RotateCw, Shield, Filter
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import InviteUserDialog from '@/components/users/InviteUserDialog';
import PendingInvitationsTable from '@/components/users/PendingInvitationsTable';
import AcceptedInvitationsTable from '@/components/users/AcceptedInvitationsTable';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const UserManagementPage = () => {
  const [activeTab, setActiveTab] = useState('pending');
  const [pendingInvitations, setPendingInvitations] = useState([]);
  const [acceptedInvitations, setAcceptedInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filtering
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const fetchInvitations = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch Pending
      const { data: pending, error: pendingError } = await supabase
        .from('invitations')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (pendingError) throw pendingError;

      // Fetch Accepted
      const { data: accepted, error: acceptedError } = await supabase
        .from('invitations')
        .select('*')
        .eq('status', 'accepted')
        .order('accepted_at', { ascending: false });

      if (acceptedError) throw acceptedError;

      setPendingInvitations(pending || []);
      setAcceptedInvitations(accepted || []);
    } catch (error) {
      console.error('Error fetching invitations:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvitations();
  }, [fetchInvitations]);

  const filterInvitations = (invitations) => {
    return invitations.filter(inv => {
      const matchesSearch = inv.email.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRole = roleFilter === 'all' || inv.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  };

  const filteredPending = filterInvitations(pendingInvitations);
  const filteredAccepted = filterInvitations(acceptedInvitations);

  return (
    <DashboardLayout>
      <Helmet>
        <title>User Management - Novakleen</title>
      </Helmet>

      <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">User Management</h1>
            <p className="text-gray-500 dark:text-gray-400">Manage pending and accepted invitations</p>
          </div>
          <InviteUserDialog onUserInvited={fetchInvitations} />
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col md:flex-row gap-4 items-center">
            <div className="relative flex-1 w-full">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
               <Input 
                  placeholder="Search by email..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
               />
            </div>
            
            <div className="w-full md:w-64">
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                   <SelectTrigger>
                      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                         <Filter className="h-4 w-4" />
                         <span className="truncate">{roleFilter === 'all' ? 'All Roles' : roleFilter}</span>
                      </div>
                   </SelectTrigger>
                   <SelectContent>
                      <SelectItem value="all">All Roles</SelectItem>
                      <SelectItem value="Admin">Admin</SelectItem>
                      <SelectItem value="Manager">Manager</SelectItem>
                      <SelectItem value="Member">Member</SelectItem>
                      <SelectItem value="Viewer">Viewer</SelectItem>
                   </SelectContent>
                </Select>
            </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full md:w-auto md:inline-grid grid-cols-2 h-auto p-1 bg-gray-100 dark:bg-gray-800 rounded-lg mb-6">
            <TabsTrigger 
               value="pending" 
               className="px-6 py-2.5 rounded-md data-[state=active]:bg-white data-[state=active]:text-amber-600 data-[state=active]:shadow-sm transition-all"
            >
               <div className="flex items-center gap-2">
                 <Clock className="h-4 w-4" />
                 <span>Pending</span>
                 <span className="ml-1 bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full font-medium">
                    {filteredPending.length}
                 </span>
               </div>
            </TabsTrigger>
            <TabsTrigger 
               value="accepted"
               className="px-6 py-2.5 rounded-md data-[state=active]:bg-white data-[state=active]:text-green-600 data-[state=active]:shadow-sm transition-all"
            >
               <div className="flex items-center gap-2">
                 <CheckCircle2 className="h-4 w-4" />
                 <span>Accepted</span>
                 <span className="ml-1 bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium">
                    {filteredAccepted.length}
                 </span>
               </div>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-0">
             <PendingInvitationsTable 
               invitations={filteredPending} 
               loading={loading}
               onActionComplete={fetchInvitations}
             />
          </TabsContent>

          <TabsContent value="accepted" className="mt-0">
             <AcceptedInvitationsTable 
               invitations={filteredAccepted}
               loading={loading}
             />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default UserManagementPage;