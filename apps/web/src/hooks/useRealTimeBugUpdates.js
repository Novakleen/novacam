import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

/**
 * Custom hook to subscribe to real-time updates for bug comments and attachments.
 * 
 * @param {string} bugId - The ID of the bug to subscribe to.
 * @param {Function} onCommentChange - Callback for comment changes (insert, update, delete).
 * @param {Function} onAttachmentChange - Callback for attachment changes (insert, delete).
 */
export const useRealTimeBugUpdates = (bugId, onCommentChange, onAttachmentChange) => {
  // Use refs to keep callbacks stable inside useEffect without re-subscribing
  const onCommentChangeRef = useRef(onCommentChange);
  const onAttachmentChangeRef = useRef(onAttachmentChange);

  useEffect(() => {
    onCommentChangeRef.current = onCommentChange;
    onAttachmentChangeRef.current = onAttachmentChange;
  }, [onCommentChange, onAttachmentChange]);

  useEffect(() => {
    if (!bugId) return;

    console.log(`Setting up real-time subscription for bug: ${bugId}`);

    const channel = supabase
      .channel(`bug_realtime_${bugId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bug_comments', filter: `bug_id=eq.${bugId}` },
        (payload) => {
          if (onCommentChangeRef.current) {
            onCommentChangeRef.current(payload);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bug_attachments', filter: `bug_id=eq.${bugId}` },
        (payload) => {
          if (onAttachmentChangeRef.current) {
            onAttachmentChangeRef.current(payload);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`Subscribed to real-time updates for bug: ${bugId}`);
        }
      });

    return () => {
      console.log(`Cleaning up real-time subscription for bug: ${bugId}`);
      supabase.removeChannel(channel);
    };
  }, [bugId]);
};