import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserPlus, Search, X, Loader2, Phone, Mail } from 'lucide-react';
import { useHubSpotContacts } from '@/hooks/useHubSpotContacts';
import { useCompanyCamCustomer } from '@/hooks/useCompanyCamCustomer';
import { supabase } from '@/lib/customSupabaseClient';
import { useTranslation } from 'react-i18next';

const isUuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));

const formatAddress = (project) => {
  if (!project) return null;
  if (typeof project.address === 'string' && project.address) return project.address;
  if (typeof project.full_address === 'string' && project.full_address) return project.full_address;
  const a = project.address;
  if (a && typeof a === 'object') {
    const parts = [
      a.street_address_1 || a.street_address_2,
      [a.city, a.state].filter(Boolean).join(', '),
      a.postal_code,
      a.country,
    ].filter(Boolean);
    return parts.join(' · ') || null;
  }
  return null;
};

/**
 * Persist hubspot_contact_id (+ cached name/email) on the projects row.
 * For CompanyCam-only projects (numeric id / no supabase uuid), upsert a row
 * keyed by companycam_project_id so a missing row does not silently no-op.
 */
export const upsertProjectHubSpotContact = async (project, contact) => {
  const contactId = contact?.hs_object_id || contact?.id;
  if (!contactId || !project) return { error: new Error('Missing contact or project') };

  const contactName = `${contact.first_name || contact.firstname || ''} ${contact.last_name || contact.lastname || ''}`.trim() || null;
  const contactEmail = contact.email || null;
  const payload = {
    hubspot_contact_id: String(contactId),
    hubspot_contact_name: contactName,
    hubspot_contact_email: contactEmail,
  };

  if (isUuid(project.id)) {
    const { error } = await supabase.from('projects').update(payload).eq('id', project.id);
    return { error };
  }

  const ccId = String(project.companycam_project_id || project.id);
  const { data: existing, error: selectError } = await supabase
    .from('projects')
    .select('id')
    .eq('companycam_project_id', ccId)
    .maybeSingle();

  if (selectError) return { error: selectError };

  if (existing?.id) {
    const { error } = await supabase.from('projects').update(payload).eq('id', existing.id);
    return { error, projectId: existing.id };
  }

  const address = formatAddress(project);
  const insertPayload = {
    companycam_project_id: ccId,
    name: project.name || `CompanyCam #${ccId}`,
    address: address,
    full_address: address,
    ...payload,
  };

  const { data: inserted, error } = await supabase
    .from('projects')
    .insert([insertPayload])
    .select('id')
    .single();

  return { error, projectId: inserted?.id };
};

export const ContactAssignmentDialog = ({ project, open, onOpenChange, onSuccess }) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContact, setSelectedContact] = useState(null);

  const { fetchHubSpotContacts, contacts, loading: hsLoading } = useHubSpotContacts();
  const { assignAndSync, loading } = useCompanyCamCustomer();

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      fetchHubSpotContacts({ query: searchQuery });
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, open, fetchHubSpotContacts]);

  useEffect(() => {
    if (!open) {
      setSearchQuery('');
      setSelectedContact(null);
    }
  }, [open]);

  const handleAssign = async () => {
    if (!selectedContact || !project) return;

    try {
      const { error } = await upsertProjectHubSpotContact(project, selectedContact);
      if (error) {
        console.warn('Could not upsert Supabase project contact reference:', error.message);
      }
    } catch (err) {
      console.warn('Could not update Supabase project contact reference:', err.message);
    }

    const success = await assignAndSync(project, selectedContact);
    if (success) {
      onSuccess?.();
      onOpenChange(false);
    }
  };

  const currentContactId = project?.hubspot_contact_id;
  const hasCurrentContact = !!currentContactId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-blue-600" />
            {t('hubspotAdmin.assignContactTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('hubspotAdmin.assignContactDesc', { name: project?.name || '' })}
          </DialogDescription>
        </DialogHeader>

        {hasCurrentContact && (
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800 mb-2">
            <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2">
              {t('hubspotAdmin.currentlyAssigned')}
            </h4>
            <div className="flex items-center justify-between">
              <div className="text-sm text-blue-800 dark:text-blue-200 truncate pr-4">
                <span className="font-medium">ID:</span> {currentContactId}
              </div>
            </div>
          </div>
        )}

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder={t('hubspotAdmin.searchContactsPlaceholder')}
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              onClick={() => setSearchQuery('')}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 min-h-[250px] p-1">
          {hsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : contacts.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              {searchQuery ? t('hubspotAdmin.noContactsFound') : t('hubspotAdmin.typeToSearch')}
            </div>
          ) : (
            contacts.map((c) => {
              const cId = c.hs_object_id || c.id;
              const isSelected = selectedContact?.hs_object_id === cId || selectedContact?.id === cId;
              return (
                <div
                  key={cId}
                  onClick={() => setSelectedContact(c)}
                  className={`p-3 rounded-xl border cursor-pointer transition-colors flex items-center justify-between
                    ${isSelected
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                      : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700'
                    }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
                      {c.firstname || c.first_name} {c.lastname || c.last_name}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {c.email && (
                        <span className="flex items-center gap-1 truncate">
                          <Mail className="h-3 w-3" /> {c.email}
                        </span>
                      )}
                      {c.phone && (
                        <span className="flex items-center gap-1 shrink-0">
                          <Phone className="h-3 w-3" /> {c.phone}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t mt-auto">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleAssign} disabled={!selectedContact || loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {loading ? t('hubspotAdmin.syncing') : t('hubspotAdmin.assignAndSync')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ContactAssignmentDialog;
