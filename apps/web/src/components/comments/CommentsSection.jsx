import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, MessageSquare, User as UserIcon } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useComments } from '@/hooks/useComments';
import CommentForm from './CommentForm';

const CommentsSection = ({ projectId }) => {
  const { user } = useAuth();
  const { comments, loading, addComment, deleteComment } = useComments(projectId);

  const handleDelete = async (commentId) => {
    if (window.confirm('Are you sure you want to delete this comment?')) {
      await deleteComment(commentId);
    }
  };

  return (
    <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden flex flex-col h-full max-h-[600px]">
      <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm">
        <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-blue-500" />
          Comments
          <span className="text-xs font-normal text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
            {comments.length}
          </span>
        </h3>
      </div>

      <div className="flex-1 overflow-hidden relative min-h-[200px] flex flex-col">
        {loading ? (
          <div className="p-4 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
                  <div className="h-16 w-full bg-gray-200 dark:bg-gray-700 rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 p-8 text-center text-gray-400">
            <div className="h-12 w-12 rounded-full bg-gray-50 dark:bg-gray-800/50 flex items-center justify-center mb-3">
              <MessageSquare className="h-6 w-6 opacity-50" />
            </div>
            <p className="text-sm">No comments yet.</p>
            <p className="text-xs opacity-70 mt-1">Be the first to share your thoughts!</p>
          </div>
        ) : (
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              <AnimatePresence initial={false}>
                {comments.map((comment) => (
                  <motion.div
                    key={comment.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="group flex gap-3"
                  >
                    <Avatar className="h-8 w-8 mt-1 border border-gray-200 dark:border-gray-700">
                      <AvatarImage src={comment.profile?.avatar_url} />
                      <AvatarFallback className="bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300 text-xs font-bold">
                        {comment.profile?.initials || <UserIcon className="h-3 w-3" />}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="bg-white dark:bg-gray-800/80 rounded-2xl rounded-tl-none p-3 shadow-sm border border-gray-100 dark:border-gray-700/50 relative group-hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {comment.profile?.full_name || 'Unknown User'}
                          </span>
                          <span className="text-[10px] text-gray-400 whitespace-nowrap">
                            {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        
                        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words leading-relaxed">
                          {comment.text}
                        </p>

                        {user?.id === comment.uploaded_by && (
                          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full"
                              onClick={() => handleDelete(comment.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </ScrollArea>
        )}
      </div>

      <div className="p-4 bg-gray-50/50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-800 backdrop-blur-sm">
        <CommentForm onAddComment={addComment} />
      </div>
    </div>
  );
};

export default CommentsSection;