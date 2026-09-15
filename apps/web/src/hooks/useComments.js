import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';

export const useComments = (projectId) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchComments = useCallback(async () => {
    if (!projectId) return;
    
    try {
      // Using existing table structure: uploaded_by (user_id), text (content)
      const { data, error } = await supabase
        .from('project_comments')
        .select(`
          *,
          profile:profiles!uploaded_by(
            id,
            full_name,
            initials,
            avatar_url
          )
        `)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setComments(data || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching comments:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const addComment = async (content) => {
    if (!user) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "You must be logged in to comment.",
      });
      return false;
    }

    try {
      const { error } = await supabase
        .from('project_comments')
        .insert({
          project_id: projectId,
          uploaded_by: user.id, // Mapping to existing schema column
          text: content         // Mapping to existing schema column
        });

      if (error) throw error;

      // Realtime subscription will handle the update, but we can optimistically update or re-fetch
      // For simplicity and correctness with joined data, we'll let the subscription or subsequent fetch handle it
      // However, to ensure immediate feedback if subscription lags:
      await fetchComments(); 
      return true;
    } catch (err) {
      console.error('Error adding comment:', err);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to post comment. Please try again.",
      });
      return false;
    }
  };

  const deleteComment = async (commentId) => {
    try {
      const { error } = await supabase
        .from('project_comments')
        .delete()
        .eq('id', commentId);

      if (error) throw error;
      
      setComments(prev => prev.filter(c => c.id !== commentId));
      return true;
    } catch (err) {
      console.error('Error deleting comment:', err);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete comment.",
      });
      return false;
    }
  };

  useEffect(() => {
    fetchComments();

    // Set up realtime subscription
    const channel = supabase
      .channel(`comments-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'project_comments',
          filter: `project_id=eq.${projectId}`
        },
        () => {
          // Re-fetch to get the profile data associated with new comments
          fetchComments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, fetchComments]);

  return {
    comments,
    loading,
    error,
    addComment,
    deleteComment,
    refetch: fetchComments
  };
};