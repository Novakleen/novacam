import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Trash2, User, Loader2, Paperclip, MessageSquare, Upload, X, Reply } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { useRealTimeBugUpdates } from '@/hooks/useRealTimeBugUpdates';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const BugDetailsModal = ({ bug, open, onOpenChange, onDelete }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Attachments State
  const [attachments, setAttachments] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Comments State
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [replyContent, setReplyContent] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [isPostingComment, setIsPostingComment] = useState(false);

  // Fetch initial data
  const fetchAttachments = useCallback(async () => {
    if (!bug?.id) return;
    const { data, error } = await supabase
      .from('bug_attachments')
      .select('*')
      .eq('bug_id', bug.id)
      .order('created_at', { ascending: false });
    
    if (error) console.error('Error fetching attachments:', error);
    else setAttachments(data || []);
  }, [bug?.id]);

  const fetchComments = useCallback(async () => {
    if (!bug?.id) return;
    const { data, error } = await supabase
      .from('bug_comments')
      .select(`
        *,
        author_profile:profiles!author_id(full_name, avatar_url, initials)
      `)
      .eq('bug_id', bug.id)
      .order('created_at', { ascending: true });

    if (error) console.error('Error fetching comments:', error);
    else setComments(data || []);
  }, [bug?.id]);

  // Initial load
  useEffect(() => {
    if (bug?.id && open) {
      fetchAttachments();
      fetchComments();
    }
  }, [bug?.id, open, fetchAttachments, fetchComments]);

  // Real-time updates handler
  const handleCommentChange = useCallback(async (payload) => {
    if (payload.eventType === 'INSERT') {
      // Optimistically we might have already added it, but let's fetch the fresh one with relations (profile)
      // to ensure consistency and correct display.
      // If the ID matches a temp ID in our state, we replace it.
      
      const { data: newComment, error } = await supabase
        .from('bug_comments')
        .select(`*, author_profile:profiles!author_id(full_name, avatar_url, initials)`)
        .eq('id', payload.new.id)
        .single();

      if (!error && newComment) {
        setComments(prev => {
          // Check if already exists (deduplication) or replace optimistic
          const exists = prev.some(c => c.id === newComment.id);
          if (exists) return prev;
          
          // Remove optimistic comments that match this content/author roughly, or just append
          // For simplicity, we filter out any 'pending' comments that match this new one's ID if we had the real ID,
          // but since we generate temp IDs, we'll just keep the new one and filter out optimistic ones 
          // that we know we just created.
          const realComments = prev.filter(c => !c.isOptimistic);
          return [...realComments, newComment].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        });
      }
    } else if (payload.eventType === 'DELETE') {
      setComments(prev => prev.filter(c => c.id !== payload.old.id));
    } else if (payload.eventType === 'UPDATE') {
      // Refresh list or update specific item
      fetchComments();
    }
  }, [fetchComments]);

  const handleAttachmentChange = useCallback((payload) => {
    if (payload.eventType === 'INSERT') {
      setAttachments(prev => {
        if (prev.some(a => a.id === payload.new.id)) return prev;
        return [payload.new, ...prev];
      });
    } else if (payload.eventType === 'DELETE') {
      setAttachments(prev => prev.filter(a => a.id !== payload.old.id));
    }
  }, []);

  // Use the hook
  useRealTimeBugUpdates(bug?.id, handleCommentChange, handleAttachmentChange);


  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    
    // Optimistic UI
    const tempId = `temp-${Date.now()}`;
    const optimisticAttachment = {
      id: tempId,
      file_name: file.name,
      created_at: new Date().toISOString(),
      file_url: null, // Loading state
      isOptimistic: true
    };
    setAttachments(prev => [optimisticAttachment, ...prev]);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `${bug.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('bug-attachments')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('bug-attachments')
        .getPublicUrl(filePath);

      const { error: dbError } = await supabase
        .from('bug_attachments')
        .insert({
          bug_id: bug.id,
          file_url: publicUrl,
          file_name: file.name,
          uploaded_by: user.id
        });

      if (dbError) throw dbError;

      toast({ title: "Success", description: "Attachment uploaded successfully" });
      // Realtime subscription will handle the actual list update
    } catch (error) {
      console.error('Upload error:', error);
      toast({ variant: "destructive", title: "Upload Failed", description: error.message });
      // Remove optimistic attachment on error
      setAttachments(prev => prev.filter(a => a.id !== tempId));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteAttachment = async (attachmentId, fileUrl) => {
    try {
      const { error } = await supabase.from('bug_attachments').delete().eq('id', attachmentId);
      if (error) throw error;
      toast({ title: "Deleted", description: "Attachment removed" });
      // Realtime will update UI
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const handlePostComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    const contentToPost = newComment;
    setIsPostingComment(true);
    setNewComment(''); // Clear input immediately

    // Optimistic UI
    const tempId = `temp-${Date.now()}`;
    const optimisticComment = {
      id: tempId,
      content: contentToPost,
      author_id: user.id,
      created_at: new Date().toISOString(),
      author_profile: {
        full_name: user.user_metadata?.full_name || 'You',
        initials: 'YO', // Simplified
      },
      isOptimistic: true
    };
    
    setComments(prev => [...prev, optimisticComment]);

    try {
      const { error } = await supabase
        .from('bug_comments')
        .insert({
          bug_id: bug.id,
          content: contentToPost,
          author_id: user.id
        });

      if (error) throw error;
      
      toast({ title: "Success", description: "Comment posted successfully" });
      // Realtime subscription will replace the optimistic comment
    } catch (error) {
      console.error('Comment error:', error);
      toast({ variant: "destructive", title: "Error", description: error.message });
      setComments(prev => prev.filter(c => c.id !== tempId)); // Remove failed optimistic comment
      setNewComment(contentToPost); // Restore text
    } finally {
      setIsPostingComment(false);
    }
  };

  const handleReplySubmit = async (parentId) => {
    if (!replyContent.trim()) return;

    const contentToPost = replyContent;
    setReplyContent('');
    setReplyingTo(null);

    // Optimistic Reply
    const tempId = `temp-reply-${Date.now()}`;
    const optimisticReply = {
      id: tempId,
      content: contentToPost,
      author_id: user.id,
      parent_comment_id: parentId,
      created_at: new Date().toISOString(),
      author_profile: {
        full_name: user.user_metadata?.full_name || 'You',
        initials: 'YO',
      },
      isOptimistic: true
    };
    setComments(prev => [...prev, optimisticReply]);

    try {
      const { error } = await supabase
        .from('bug_comments')
        .insert({
          bug_id: bug.id,
          content: contentToPost,
          author_id: user.id,
          parent_comment_id: parentId
        });

      if (error) throw error;
      toast({ title: "Success", description: "Reply posted successfully" });
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: error.message });
      setComments(prev => prev.filter(c => c.id !== tempId));
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (!confirm('Are you sure you want to delete this comment?')) return;
    try {
      const { error } = await supabase.from('bug_comments').delete().eq('id', commentId);
      if (error) throw error;
      toast({ title: "Deleted", description: "Comment deleted" });
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const handleDeleteBug = async () => {
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('bugs').delete().eq('id', bug.id);
      if (error) throw error;

      toast({ title: "Bug Deleted", description: "The bug report has been successfully deleted." });
      onDelete(bug.id);
      setShowDeleteAlert(false);
      onOpenChange(false);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsDeleting(false);
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'Critical': return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800';
      case 'High': return 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800';
      case 'Medium': return 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800';
      case 'Low': return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getStatusColor = (status) => {
      switch (status) {
          case 'Done': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
          case 'In Progress': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
          case 'In Review': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
          case 'To Do': return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
          default: return 'bg-gray-100 text-gray-700';
      }
  };

  if (!bug) return null;

  const rootComments = comments.filter(c => !c.parent_comment_id);
  const getReplies = (parentId) => comments.filter(c => c.parent_comment_id === parentId);

  const CommentItem = ({ comment, isReply = false }) => (
    <div className={cn("group flex gap-3", isReply ? "ml-12 mt-2" : "mt-4", comment.isOptimistic && "opacity-70")}>
      <Avatar className="h-8 w-8">
        <AvatarImage src={comment.author_profile?.avatar_url} />
        <AvatarFallback>{comment.author_profile?.initials || '?'}</AvatarFallback>
      </Avatar>
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
            {comment.author_profile?.full_name || 'Unknown'}
          </span>
          <span className="text-xs text-gray-500">
            {comment.isOptimistic ? "Posting..." : formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
          </span>
        </div>
        <div className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
          {comment.content}
        </div>
        <div className="flex items-center gap-4 mt-1">
          {!isReply && !comment.isOptimistic && (
            <button 
              onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
              className="text-xs text-gray-500 hover:text-blue-600 flex items-center gap-1"
            >
              <Reply className="h-3 w-3" /> Reply
            </button>
          )}
          {user?.id === comment.author_id && !comment.isOptimistic && (
            <button 
              onClick={() => handleDeleteComment(comment.id)}
              className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          )}
        </div>

        {replyingTo === comment.id && (
          <div className="mt-2 flex gap-2">
             <Input 
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder={`Replying to ${comment.author_profile?.full_name}...`}
                className="h-8 text-sm"
             />
             <Button size="sm" onClick={() => handleReplySubmit(comment.id)}>Reply</Button>
          </div>
        )}

        {/* Nested Replies */}
        {getReplies(comment.id).map(reply => (
           <CommentItem key={reply.id} comment={reply} isReply={true} />
        ))}
      </div>
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto p-0 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-2xl rounded-xl">
          <DialogHeader className="p-6 border-b border-gray-100 dark:border-gray-800 bg-gray-50/30 dark:bg-gray-800/20 sticky top-0 z-10 backdrop-blur-sm">
             <div className="flex flex-col gap-4">
               <div className="flex items-center gap-2">
                 <Badge variant="outline" className={cn("font-semibold border-none px-2.5 py-0.5", getStatusColor(bug.status))}>
                      {bug.status}
                  </Badge>
                  <span className="text-xs text-gray-400 font-mono ml-auto">ID: {bug.id.substring(0, 8)}</span>
               </div>
               
               <DialogTitle className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">
                 {bug.title}
               </DialogTitle>
               
               <div className="flex gap-2">
                  <Badge variant="outline" className={cn("font-medium px-3 py-1 text-xs uppercase tracking-wide", getPriorityColor(bug.priority))}>
                    {bug.priority} Priority
                  </Badge>
                  <div className="flex items-center gap-1 text-xs text-gray-500 border border-gray-200 rounded-full px-2 py-0.5 bg-white">
                    <User className="h-3 w-3" />
                    Reported by {bug.reporter_profile?.full_name || 'Unknown'}
                  </div>
               </div>
             </div>
          </DialogHeader>
          
          <div className="p-6 space-y-8">
             {/* Description Section */}
             <div className="space-y-3">
               <h4 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                 Description
               </h4>
               <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg border border-gray-100 dark:border-gray-800">
                 <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                   {bug.description || "No description provided."}
                 </p>
               </div>
             </div>

             {/* Attachments Section */}
             <div className="space-y-4">
               <div className="flex items-center justify-between">
                 <h4 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                   <Paperclip className="h-4 w-4" /> Attachments ({attachments.length})
                 </h4>
                 <div className="relative">
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      onChange={handleFileUpload}
                      disabled={isUploading}
                    />
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="h-8 text-xs"
                    >
                      {isUploading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Upload className="h-3 w-3 mr-1" />}
                      Upload File
                    </Button>
                 </div>
               </div>
               
               {attachments.length > 0 ? (
                 <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {attachments.map(att => (
                      <div key={att.id} className={cn("relative group border border-gray-200 rounded-lg p-2 bg-white hover:shadow-sm transition-all", att.isOptimistic && "opacity-60")}>
                         <div className="flex items-start gap-2">
                            <div className="h-10 w-10 bg-gray-100 rounded flex items-center justify-center flex-shrink-0 text-gray-400">
                              {att.isOptimistic ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                              ) : att.file_name.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                                <img src={att.file_url} alt="thumbnail" className="h-full w-full object-cover rounded" />
                              ) : (
                                <Paperclip className="h-5 w-5" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                               <a href={att.file_url || '#'} target="_blank" rel="noopener noreferrer" className={cn("text-xs font-medium text-blue-600 hover:underline truncate block", !att.file_url && "pointer-events-none text-gray-500")}>
                                 {att.file_name}
                               </a>
                               <p className="text-[10px] text-gray-400">
                                 {att.isOptimistic ? "Uploading..." : format(new Date(att.created_at), 'MMM d, h:mm a')}
                               </p>
                            </div>
                            {user?.id === att.uploaded_by && !att.isOptimistic && (
                               <button 
                                 onClick={() => handleDeleteAttachment(att.id)}
                                 className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-opacity absolute top-1 right-1 bg-white rounded-full shadow-sm"
                               >
                                 <X className="h-3 w-3" />
                               </button>
                            )}
                         </div>
                      </div>
                    ))}
                 </div>
               ) : (
                 <p className="text-xs text-gray-500 italic">No attachments yet.</p>
               )}
             </div>

             {/* Comments Section */}
             <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-800">
               <h4 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                 <MessageSquare className="h-4 w-4" /> Comments ({comments.length})
               </h4>
               
               <div className="space-y-1 max-h-[400px] overflow-y-auto pr-2">
                 {rootComments.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-8">No comments yet. Be the first to start the discussion.</p>
                 ) : (
                    rootComments.map(comment => (
                      <CommentItem key={comment.id} comment={comment} />
                    ))
                 )}
               </div>

               <form onSubmit={handlePostComment} className="flex flex-col gap-2 pt-2">
                 <Textarea 
                   value={newComment}
                   onChange={(e) => setNewComment(e.target.value)}
                   placeholder="Write a comment..."
                   className="min-h-[80px]"
                 />
                 <div className="flex justify-end">
                   <Button type="submit" disabled={isPostingComment || !newComment.trim()} size="sm">
                     {isPostingComment && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                     Post Comment
                   </Button>
                 </div>
               </form>
             </div>
          </div>

          <DialogFooter className="p-4 bg-gray-50/50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-800 flex justify-between w-full">
             <Button 
               variant="ghost" 
               size="sm" 
               onClick={() => setShowDeleteAlert(true)}
               className="text-red-500 hover:text-red-700 hover:bg-red-50"
             >
               <Trash2 className="h-4 w-4 mr-2" /> Delete Issue
             </Button>
             
             <Button variant="outline" onClick={() => onOpenChange(false)}>
               Close
             </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600">Delete Bug Report?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{bug.title}"? This will permanently remove the bug, attachments, and comments.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <Button 
              onClick={handleDeleteBug}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? "Deleting..." : "Yes, Delete It"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default BugDetailsModal;