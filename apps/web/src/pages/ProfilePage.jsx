import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { User, Mail, Shield, MapPin } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

const ProfilePage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState(null);
  const [fullName, setFullName] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [user]);

  const fetchProfile = async () => {
    try {
      // Use maybeSingle() to handle cases where profile might not exist yet
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setProfile(data);
        setFullName(data.full_name || '');
        setAddress(data.address || '');
      }
    } catch (error) {
      console.error("Profile fetch error:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load profile",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const initials = fullName
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .substring(0, 2);

      // Ensure we don't accidentally send an invalid role if we were to update it here
      // For this form, we are only updating name/initials, but good practice to be safe
      const updates = {
        full_name: fullName,
        address: address,
        initials: initials,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Profile updated successfully",
      });

      fetchProfile();
    } catch (error) {
      console.error("Profile update error:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update profile",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Helmet>
        <title>Profile - Novakleen</title>
        <meta name="description" content="Manage your profile settings" />
      </Helmet>

      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Profile</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Manage your account information
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20 rounded-full">
              <AvatarFallback className="text-2xl">
                {profile?.initials || 'NA'}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {profile?.full_name}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {profile?.email}
              </p>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">
                <User className="inline h-4 w-4 mr-2" />
                Full Name
              </Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your full name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">
                <MapPin className="inline h-4 w-4 mr-2" />
                Adresse
              </Label>
              <Input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Enter your address"
              />
            </div>

            <div className="space-y-2">
              <Label>
                <Mail className="inline h-4 w-4 mr-2" />
                Email
              </Label>
              <Input
                value={profile?.email || ''}
                disabled
                className="bg-gray-100 dark:bg-gray-700"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Email cannot be changed
              </p>
            </div>

            <div className="space-y-2">
              <Label>
                <Shield className="inline h-4 w-4 mr-2" />
                Role
              </Label>
              <Input
                value={profile?.role || 'Member'}
                disabled
                className="bg-gray-100 dark:bg-gray-700"
              />
            </div>

            <Button type="submit" disabled={saving} className="w-full rounded-lg">
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </form>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            <strong>GDPR Compliance:</strong> Your data is stored securely and processed in accordance with EU GDPR regulations. 
            You have the right to access, modify, or delete your personal data at any time.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ProfilePage;