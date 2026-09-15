import React, { useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

const MAX_CHARS = 500;

const CommentForm = ({ onAddComment }) => {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;

    setIsSubmitting(true);
    const success = await onAddComment(content);
    setIsSubmitting(false);

    if (success) {
      setContent('');
      toast({
        title: "Success",
        description: "Comment posted successfully.",
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="relative">
        <textarea
          value={content}
          onChange={(e) => {
            if (e.target.value.length <= MAX_CHARS) {
              setContent(e.target.value);
            }
          }}
          placeholder="Write a comment..."
          disabled={isSubmitting}
          className="w-full min-h-[100px] p-3 rounded-xl bg-white/50 dark:bg-black/20 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none text-sm transition-all placeholder:text-gray-400 dark:text-gray-200"
        />
        <div className="absolute bottom-3 right-3 text-xs text-gray-400 font-medium">
          {content.length}/{MAX_CHARS}
        </div>
      </div>
      
      <div className="flex justify-end">
        <Button 
          type="submit" 
          disabled={!content.trim() || isSubmitting}
          className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20"
          size="sm"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              Posting...
            </>
          ) : (
            <>
              Post Comment
              <Send className="ml-2 h-3.5 w-3.5" />
            </>
          )}
        </Button>
      </div>
    </form>
  );
};

export default CommentForm;