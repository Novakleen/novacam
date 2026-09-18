import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  Mail,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import ContactAssignmentDialog from '@/components/projects/ContactAssignmentDialog';

const HUBSPOT_PORTAL_ID = '46368862';
const INVOICE_OBJECT_TYPE = '0-53';

const PROJECT_HS_FIELDS = `
  id,
  name,
  address,
  full_address,
  companycam_project_id,
  hubspot_contact_id,
  hubspot_contact_name,
  hubspot_contact_email,
  hubspot_invoice_id,
  hubspot_invoice_number,
  hubspot_invoice_amount,
  hubspot_invoice_currency,
  hubspot_invoice_status
`;

const isUuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));

const invokeHubSpotProxy = async (path, method = 'GET', body = null) => {
  const { data, error } = await supabase.functions.invoke('hubspot-proxy', {
    body: { path, method, body },
  });
  if (error) throw new Error(error.message);
  if (data?.error) {
    throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
  }
  if (data?.status === 'error' || data?.message === 'An error occurred.') {
    throw new Error(data?.message || 'HubSpot API error');
  }
  return data;
};

const formatMoney = (amount, currency, locale) => {
  if (amount == null || amount === '') return null;
  const num = Number(amount);
  if (Number.isNaN(num)) return String(amount);
  try {
    return new Intl.NumberFormat(locale || 'fr-BE', {
      style: 'currency',
      currency: currency || 'EUR',
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    return `${num} ${currency || ''}`.trim();
  }
};

const invoiceHubSpotUrl = (invoiceId) =>
  `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/record/${INVOICE_OBJECT_TYPE}/${invoiceId}`;

const contactHubSpotUrl = (contactId) =>
  `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/contact/${contactId}`;

const normalizeInvoice = (raw) => {
  if (!raw) return null;
  const props = raw.properties || raw;
  const id = String(raw.id || props.hs_object_id || props.id || '');
  if (!id) return null;
  return {
    id,
    number:
      props.hs_number ||
      props.hs_invoice_number ||
      props.hs_invoice_status_label ||
      props.hs_title ||
      id,
    amount:
      props.hs_amount_billed ??
      props.hs_balance_due ??
      props.hs_invoice_total_amount ??
      props.amount ??
      null,
    currency: props.hs_currency || props.hs_invoice_currency_code || props.currency || 'EUR',
    status: props.hs_invoice_status || props.hs_status || props.status || null,
  };
};

/**
 * Admin-only HubSpot contact + invoice linking for a project (Supabase and/or CompanyCam).
 * Renders null when isAdmin is false — members must not see contact/invoice data.
 */
const ProjectHubSpotAdminPanel = ({
  companycamProjectId,
  projectId,
  projectName,
  projectAddress,
  isAdmin,
  compact = false,
  showContact = true,
  showInvoice = true,
  onLinkedProjectChange,
}) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [linked, setLinked] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showContactDialog, setShowContactDialog] = useState(false);
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);

  const locale = (i18n.resolvedLanguage || i18n.language || 'fr').slice(0, 2);

  const loadLinked = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      let query = supabase.from('projects').select(PROJECT_HS_FIELDS);
      if (projectId && isUuid(projectId)) {
        query = query.eq('id', projectId);
      } else if (companycamProjectId) {
        query = query.eq('companycam_project_id', String(companycamProjectId));
      } else {
        setLinked(null);
        return;
      }
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      setLinked(data || null);
      onLinkedProjectChange?.(data || null);
    } catch (err) {
      console.warn('[ProjectHubSpotAdminPanel] load failed:', err?.message || err);
      setLinked(null);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, projectId, companycamProjectId, onLinkedProjectChange]);

  useEffect(() => {
    loadLinked();
  }, [loadLinked]);

  const projectForDialog = useMemo(() => {
    const ccId = companycamProjectId || linked?.companycam_project_id || null;
    const id = linked?.id || (isUuid(projectId) ? projectId : ccId);
    return {
      id,
      companycam_project_id: ccId ? String(ccId) : null,
      name: linked?.name || projectName || (ccId ? `CompanyCam #${ccId}` : ''),
      address: linked?.address || linked?.full_address || projectAddress || null,
      full_address: linked?.full_address || linked?.address || projectAddress || null,
      hubspot_contact_id: linked?.hubspot_contact_id || null,
      hubspot_contact_name: linked?.hubspot_contact_name || null,
      hubspot_contact_email: linked?.hubspot_contact_email || null,
    };
  }, [linked, companycamProjectId, projectId, projectName, projectAddress]);

  const ensureLinkedRow = useCallback(async () => {
    if (linked?.id) return linked;
    const ccId = companycamProjectId ? String(companycamProjectId) : null;
    if (projectId && isUuid(projectId)) {
      const { data } = await supabase
        .from('projects')
        .select(PROJECT_HS_FIELDS)
        .eq('id', projectId)
        .maybeSingle();
      if (data) {
        setLinked(data);
        return data;
      }
    }
    if (!ccId) throw new Error(t('hubspotAdmin.noProjectRow'));

    const { data: existing } = await supabase
      .from('projects')
      .select(PROJECT_HS_FIELDS)
      .eq('companycam_project_id', ccId)
      .maybeSingle();
    if (existing) {
      setLinked(existing);
      return existing;
    }

    const address =
      typeof projectAddress === 'string'
        ? projectAddress
        : linked?.address || null;
    const { data: inserted, error } = await supabase
      .from('projects')
      .insert([
        {
          companycam_project_id: ccId,
          name: projectName || `CompanyCam #${ccId}`,
          address,
          full_address: address,
        },
      ])
      .select(PROJECT_HS_FIELDS)
      .single();
    if (error) throw error;
    setLinked(inserted);
    return inserted;
  }, [linked, companycamProjectId, projectId, projectName, projectAddress, t]);

  const updateHubSpotFields = useCallback(
    async (fields) => {
      setSaving(true);
      try {
        const row = await ensureLinkedRow();
        const { data, error } = await supabase
          .from('projects')
          .update(fields)
          .eq('id', row.id)
          .select(PROJECT_HS_FIELDS)
          .single();
        if (error) throw error;
        setLinked(data);
        onLinkedProjectChange?.(data);
        return data;
      } finally {
        setSaving(false);
      }
    },
    [ensureLinkedRow, onLinkedProjectChange]
  );

  const handleClearContact = async () => {
    try {
      await updateHubSpotFields({
        hubspot_contact_id: null,
        hubspot_contact_name: null,
        hubspot_contact_email: null,
        hubspot_invoice_id: null,
        hubspot_invoice_number: null,
        hubspot_invoice_amount: null,
        hubspot_invoice_currency: null,
        hubspot_invoice_status: null,
      });
      toast({
        title: t('hubspotAdmin.contactClearedTitle'),
        description: t('hubspotAdmin.contactClearedDesc'),
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: t('common.error'),
        description: err.message || t('hubspotAdmin.saveError'),
      });
    }
  };

  const handleClearInvoice = async () => {
    try {
      await updateHubSpotFields({
        hubspot_invoice_id: null,
        hubspot_invoice_number: null,
        hubspot_invoice_amount: null,
        hubspot_invoice_currency: null,
        hubspot_invoice_status: null,
      });
      toast({
        title: t('hubspotAdmin.invoiceClearedTitle'),
        description: t('hubspotAdmin.invoiceClearedDesc'),
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: t('common.error'),
        description: err.message || t('hubspotAdmin.saveError'),
      });
    }
  };

  const handleSelectInvoice = async (invoice) => {
    try {
      await updateHubSpotFields({
        hubspot_invoice_id: String(invoice.id),
        hubspot_invoice_number: invoice.number ? String(invoice.number) : null,
        hubspot_invoice_amount:
          invoice.amount != null && invoice.amount !== '' ? Number(invoice.amount) : null,
        hubspot_invoice_currency: invoice.currency || 'EUR',
        hubspot_invoice_status: invoice.status || null,
      });
      setShowInvoiceDialog(false);
      toast({
        title: t('hubspotAdmin.invoiceLinkedTitle'),
        description: t('hubspotAdmin.invoiceLinkedDesc', {
          number: invoice.number || invoice.id,
        }),
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: t('common.error'),
        description: err.message || t('hubspotAdmin.saveError'),
      });
    }
  };

  if (!isAdmin) return null;

  const contactName = linked?.hubspot_contact_name;
  const contactEmail = linked?.hubspot_contact_email;
  const hasContact = !!linked?.hubspot_contact_id;
  const hasInvoice = !!linked?.hubspot_invoice_id;
  const amountLabel = formatMoney(
    linked?.hubspot_invoice_amount,
    linked?.hubspot_invoice_currency,
    locale === 'nl' ? 'nl-BE' : locale === 'en' ? 'en-GB' : 'fr-BE'
  );

  return (
    <div className={compact ? 'space-y-3' : 'mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 space-y-4'}>
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-gray-400 py-1">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t('common.loading')}
        </div>
      ) : (
        <>
          {/* Contact */}
          {showContact && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {t('hubspotAdmin.contactLabel')}
              </p>
              <div className="flex items-center gap-1">
                {hasContact && (
                  <button
                    type="button"
                    onClick={handleClearContact}
                    disabled={saving}
                    className="h-7 w-7 rounded-full flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                    title={t('hubspotAdmin.clearContact')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowContactDialog(true)}
                  className="h-7 w-7 rounded-full flex items-center justify-center text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                  title={hasContact ? t('hubspotAdmin.changeContact') : t('hubspotAdmin.assignContact')}
                >
                  {hasContact ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {hasContact ? (
              <div className="space-y-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {contactName || t('hubspotAdmin.contactIdOnly', { id: linked.hubspot_contact_id })}
                </p>
                {contactEmail && (
                  <p className="flex items-center gap-1.5 text-xs text-gray-500 truncate">
                    <Mail className="h-3 w-3 shrink-0" />
                    {contactEmail}
                  </p>
                )}
                <a
                  href={contactHubSpotUrl(linked.hubspot_contact_id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-orange-600 hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  {t('hubspotAdmin.openInHubSpot')}
                </a>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-gray-400">{t('hubspotAdmin.contactUnassigned')}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs rounded-lg"
                  onClick={() => setShowContactDialog(true)}
                >
                  <UserPlus className="h-3.5 w-3.5 mr-1" />
                  {t('hubspotAdmin.assignContact')}
                </Button>
              </div>
            )}
          </div>
          )}

          {/* Invoice */}
          {showInvoice && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {t('hubspotAdmin.invoiceLabel')}
              </p>
              <div className="flex items-center gap-1">
                {hasInvoice && (
                  <button
                    type="button"
                    onClick={handleClearInvoice}
                    disabled={saving}
                    className="h-7 w-7 rounded-full flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                    title={t('hubspotAdmin.clearInvoice')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowInvoiceDialog(true)}
                  disabled={!hasContact}
                  className="h-7 w-7 rounded-full flex items-center justify-center text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 disabled:opacity-40 disabled:pointer-events-none"
                  title={t('hubspotAdmin.linkInvoice')}
                >
                  <Link2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {hasInvoice ? (
              <div className="space-y-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-gray-400" />
                  {linked.hubspot_invoice_number || `#${linked.hubspot_invoice_id}`}
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                  {amountLabel && <span>{amountLabel}</span>}
                  {linked.hubspot_invoice_status && (
                    <span className="capitalize">{linked.hubspot_invoice_status}</span>
                  )}
                </div>
                <a
                  href={invoiceHubSpotUrl(linked.hubspot_invoice_id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-orange-600 hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  {t('hubspotAdmin.openInHubSpot')}
                </a>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-gray-400">{t('hubspotAdmin.noInvoice')}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs rounded-lg"
                  disabled={!hasContact}
                  onClick={() => setShowInvoiceDialog(true)}
                  title={!hasContact ? t('hubspotAdmin.needContactFirst') : undefined}
                >
                  <Link2 className="h-3.5 w-3.5 mr-1" />
                  {t('hubspotAdmin.linkInvoice')}
                </Button>
              </div>
            )}
          </div>
          )}
        </>
      )}

      {showContact && (
        <ContactAssignmentDialog
          project={projectForDialog}
          open={showContactDialog}
          onOpenChange={setShowContactDialog}
          onSuccess={loadLinked}
        />
      )}

      <InvoiceLinkDialog
        open={showInvoiceDialog}
        onOpenChange={setShowInvoiceDialog}
        contactId={linked?.hubspot_contact_id}
        onSelect={handleSelectInvoice}
        saving={saving}
      />
    </div>
  );
};

const InvoiceLinkDialog = ({ open, onOpenChange, contactId, onSelect, saving }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [manualId, setManualId] = useState('');
  const [manualNumber, setManualNumber] = useState('');

  const fetchInvoices = useCallback(async () => {
    if (!contactId) return;
    setLoading(true);
    setSearchError(null);
    setInvoices([]);
    try {
      // Prefer associations API (v4), then batch-read invoice properties
      let invoiceIds = [];
      try {
        const assoc = await invokeHubSpotProxy(
          `/crm/v4/objects/contacts/${contactId}/associations/invoices`
        );
        const results = Array.isArray(assoc?.results) ? assoc.results : [];
        invoiceIds = results
          .map((r) => String(r.toObjectId || r.id || r.to?.id || ''))
          .filter(Boolean);
      } catch (assocErr) {
        console.warn('[InvoiceLink] associations failed, trying search:', assocErr?.message);
      }

      if (!invoiceIds.length) {
        // Fallback: CRM search with association filter (may require scopes)
        const searchBody = {
          filterGroups: [
            {
              filters: [
                {
                  propertyName: 'associations.contact',
                  operator: 'EQ',
                  value: String(contactId),
                },
              ],
            },
          ],
          properties: [
            'hs_number',
            'hs_invoice_number',
            'hs_amount_billed',
            'hs_currency',
            'hs_invoice_status',
            'hs_title',
            'hs_balance_due',
          ],
          limit: 50,
        };
        const search = await invokeHubSpotProxy(
          '/crm/v3/objects/invoices/search',
          'POST',
          searchBody
        );
        const results = Array.isArray(search?.results) ? search.results : [];
        setInvoices(results.map(normalizeInvoice).filter(Boolean));
        return;
      }

      const props =
        'hs_number,hs_invoice_number,hs_amount_billed,hs_currency,hs_invoice_status,hs_title,hs_balance_due';
      const batch = await invokeHubSpotProxy('/crm/v3/objects/invoices/batch/read', 'POST', {
        properties: props.split(','),
        inputs: invoiceIds.slice(0, 50).map((id) => ({ id })),
      });
      const results = Array.isArray(batch?.results) ? batch.results : [];
      setInvoices(results.map(normalizeInvoice).filter(Boolean));
    } catch (err) {
      console.warn('[InvoiceLink] invoice fetch failed:', err?.message || err);
      setSearchError(err?.message || t('hubspotAdmin.invoiceSearchFailed'));
      setInvoices([]);
      toast({
        variant: 'destructive',
        title: t('hubspotAdmin.invoiceSearchFailedTitle'),
        description: t('hubspotAdmin.invoiceSearchFailedDesc'),
      });
    } finally {
      setLoading(false);
    }
  }, [contactId, t, toast]);

  useEffect(() => {
    if (open && contactId) {
      setManualId('');
      setManualNumber('');
      fetchInvoices();
    }
  }, [open, contactId, fetchInvoices]);

  const handleManualSave = () => {
    const id = manualId.trim();
    if (!id) return;
    onSelect({
      id,
      number: manualNumber.trim() || id,
      amount: null,
      currency: 'EUR',
      status: null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-orange-500" />
            {t('hubspotAdmin.linkInvoiceTitle')}
          </DialogTitle>
          <DialogDescription>{t('hubspotAdmin.linkInvoiceDesc')}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 min-h-[180px] p-1">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : invoices.length > 0 ? (
            invoices.map((inv) => (
              <button
                key={inv.id}
                type="button"
                onClick={() => onSelect(inv)}
                disabled={saving}
                className="w-full text-left p-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-orange-300 dark:hover:border-orange-700 transition-colors"
              >
                <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                  {inv.number || inv.id}
                </p>
                <p className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-3">
                  {inv.amount != null && (
                    <span>
                      {formatMoney(inv.amount, inv.currency, 'fr-BE')}
                    </span>
                  )}
                  {inv.status && <span className="capitalize">{inv.status}</span>}
                  <span className="font-mono text-gray-400">#{inv.id}</span>
                </p>
              </button>
            ))
          ) : (
            <div className="text-center py-6 text-sm text-gray-500 space-y-1">
              <p>{searchError ? t('hubspotAdmin.invoiceSearchFailed') : t('hubspotAdmin.noInvoicesFound')}</p>
              <p className="text-xs text-gray-400">{t('hubspotAdmin.pasteInvoiceHint')}</p>
            </div>
          )}
        </div>

        <div className="border-t pt-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            {t('hubspotAdmin.manualInvoice')}
          </p>
          <div className="space-y-2">
            <div>
              <Label htmlFor="hs-invoice-id">{t('hubspotAdmin.invoiceId')}</Label>
              <Input
                id="hs-invoice-id"
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
                placeholder="1234567890"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="hs-invoice-number">{t('hubspotAdmin.invoiceNumberOptional')}</Label>
              <Input
                id="hs-invoice-number"
                value={manualNumber}
                onChange={(e) => setManualNumber(e.target.value)}
                placeholder="INV-2026-001"
                className="mt-1"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleManualSave} disabled={!manualId.trim() || saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {t('hubspotAdmin.saveInvoice')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProjectHubSpotAdminPanel;
