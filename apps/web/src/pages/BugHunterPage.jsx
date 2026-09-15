import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Plus, Bug, AlertTriangle, RefreshCw } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import SimpleBugKanban from '@/components/bugs/SimpleBugKanban';
import CreateBugDialog from '@/components/bugs/CreateBugDialog';

const BugHunterPage = () => {
  const { toast } = useToast();
  const [bugs, setBugs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const fetchBugs = useCallback(async () => {
    // Only set loading on initial fetch
    if (bugs.length === 0) setLoading(true);
    setError(null);
    try {
      // We fetch counts by joining with count aggregation
      const { data, error } = await supabase
        .from('bugs')
        .select(`
          id,
          title,
          description,
          status,
          priority,
          reported_by,
          created_at,
          updated_at,
          reporter_profile:profiles!reported_by(full_name, email, avatar_url, initials),
          bug_comments(count),
          bug_attachments(count)
        `)
        .order('created_at', { ascending: false });

      if (error) {
        if (error.code === '42501') {
          throw new Error("You don't have permission to view bugs. Please check your RLS policies.");
        }
        throw error;
      }
      setBugs(data || []);
    } catch (err) {
      console.error('Fetch error:', err);
      setError(err.message || "Failed to load bugs");
      toast({
        variant: "destructive",
        title: "Error",
        description: err.message || "Failed to load bugs."
      });
    } finally {
      setLoading(false);
    }
  }, [toast, bugs.length]);

  const handleUpdateBugStatus = useCallback(async (bugId, newStatus) => {
    // Optimistic update
    setBugs(prevBugs => prevBugs.map(bug => 
        bug.id === bugId ? { ...bug, status: newStatus } : bug
    ));

    try {
      const { error } = await supabase
        .from('bugs')
        .update({ status: newStatus })
        .eq('id', bugId);

      if (error) {
        if (error.code === '42501') {
          throw new Error("You don't have permission to update this bug.");
        } else if (error.code === '23514') {
          throw new Error(`Invalid status: "${newStatus}".`);
        }
        throw error;
      }
      
      toast({
        title: "Status Updated",
        description: `Bug moved to ${newStatus}`,
      });
    } catch (error) {
      console.error('Update bug status error:', error);
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: error.message || "Failed to update bug status.",
      });
      fetchBugs(); // Revert on error
    }
  }, [toast, fetchBugs]);


  useEffect(() => {
    fetchBugs();

    // Subscribe to multiple channels to keep cards updated
    // 1. Bugs table for new bugs/status changes
    const bugsChannel = supabase
      .channel('public:bugs_list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bugs' }, () => {
        fetchBugs(); 
      })
      .subscribe();

    // 2. Comments table for count updates on cards
    const commentsChannel = supabase
      .channel('public:bug_comments_counts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bug_comments' }, () => {
        // Refetch to get updated counts
        fetchBugs();
      })
      .subscribe();

    // 3. Attachments table for count updates on cards
    const attachmentsChannel = supabase
      .channel('public:bug_attachments_counts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bug_attachments' }, () => {
        // Refetch to get updated counts
        fetchBugs();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(bugsChannel);
      supabase.removeChannel(commentsChannel);
      supabase.removeChannel(attachmentsChannel);
    };
  }, [fetchBugs]);


  return (
    <DashboardLayout>
      <Helmet>
        <title>Bug Hunter - Novakleen</title>
      </Helmet>
      
      <div className="min-h-screen space-y-6 p-6">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-red-100 p-2 rounded-lg text-red-600">
              <Bug className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Bug Hunter</h1>
              <p className="text-sm text-gray-500">Simple application-wide bug tracking</p>
            </div>
          </div>
          
          <Button 
            onClick={() => setShowCreateDialog(true)} 
            className="bg-red-600 hover:bg-red-700 text-white shadow-sm"
          >
            <Plus className="mr-2 h-4 w-4" /> Report New Bug
          </Button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg flex items-center gap-3">
            <AlertTriangle className="h-5 w-5" />
            <span className="flex-1">{error}</span>
            <Button variant="outline" size="sm" onClick={fetchBugs} className="border-red-200 hover:bg-red-100 text-red-700">
              <RefreshCw className="h-4 w-4 mr-2" /> Retry
            </Button>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-96 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <SimpleBugKanban 
            bugs={bugs} 
            setBugs={setBugs} 
            onUpdateStatus={handleUpdateBugStatus} 
          />
        )}

        <CreateBugDialog 
          open={showCreateDialog} 
          onOpenChange={setShowCreateDialog} 
          onSuccess={fetchBugs} 
        />
      </div>
    </DashboardLayout>
  );
};

export default BugHunterPage;