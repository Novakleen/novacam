import React, { useState } from 'react';
import { Mail, Calendar, Shield, UserCheck, User, Trash2, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import EditUserDialog from './EditUserDialog';
import ChangePasswordDialog from './ChangePasswordDialog';

const AcceptedInvitationsTable = ({ users, loading, onActionComplete, currentUserId }) => {
  const { toast } = useToast();
  const [deletingId, setDeletingId] = useState(null);

  const handleDelete = async (user) => {
    if (user.id === currentUserId) {
      toast({
        variant: 'destructive',
        title: 'Action Not Allowed',
        description: 'You cannot delete your own account from here.',
      });
      return;
    }
    const confirmed = window.confirm(
      `Delete user "${user.full_name || user.email}"? This permanently removes their account and related data.`
    );
    if (!confirmed) return;

    setDeletingId(user.id);
    try {
      const { data, error } = await supabase.functions.invoke('admin-delete-user', {
        body: { userId: user.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: 'User Deleted', description: `${user.email} has been removed.` });
      if (onActionComplete) onActionComplete();
    } catch (err) {
      console.error('Delete error:', err);
      toast({
        variant: 'destructive',
        title: 'Delete Failed',
        description: err.message || 'Failed to delete user.',
      });
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="py-12 text-center text-gray-500 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
        <div className="flex justify-center items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500"></div>
          Loading active users...
        </div>
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="py-12 text-center text-gray-500 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
        <div className="flex flex-col items-center gap-3">
          <div className="h-12 w-12 bg-green-50 dark:bg-green-900/20 rounded-full flex items-center justify-center">
            <UserCheck className="h-6 w-6 text-green-500" />
          </div>
          <p>No active users found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700">
            <tr>
              <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
              <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
              <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
              <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
              <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Joined</th>
              <th className="text-right py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {users.map((user) => {
              const isSelf = user.id === currentUserId;
              return (
                <tr key={user.id} className="hover:bg-green-50/30 dark:hover:bg-green-900/10 transition-colors">
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600">
                        <AvatarImage src={user.avatar_url} />
                        <AvatarFallback className="text-gray-600 dark:text-gray-300 font-medium text-xs">
                          {user.initials || <User className="h-4 w-4" />}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {user.full_name || 'Unnamed User'}
                        {isSelf && <span className="ml-2 text-xs text-blue-600">(You)</span>}
                      </span>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-sm text-gray-600 dark:text-gray-300">
                    <div className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-gray-400" />
                      {user.email}
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                      <Shield className="h-3.5 w-3.5" />
                      <span className="text-sm">{user.role || 'Member'}</span>
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100">
                      Active
                    </Badge>
                  </td>
                  <td className="py-4 px-6 text-sm text-gray-500">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>{user.created_at ? format(new Date(user.created_at), 'MMM d, yyyy') : '--'}</span>
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex items-center justify-end gap-1">
                      <EditUserDialog user={user} onUserUpdated={onActionComplete} />
                      <ChangePasswordDialog user={user} onPasswordChanged={onActionComplete} />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(user)}
                        disabled={deletingId === user.id || isSelf}
                        className="gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                        title={isSelf ? 'You cannot delete your own account' : 'Delete user'}
                      >
                        {deletingId === user.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AcceptedInvitationsTable;
