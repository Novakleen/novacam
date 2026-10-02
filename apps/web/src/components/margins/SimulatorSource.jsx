import React, { useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHubSpotContacts } from '@/hooks/useHubSpotContacts';

const inputCls =
  'h-10 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30';

/**
 * HubSpot contact / deal / quote picker for the simulator.
 * Search stays local; selecting a contact is handled by the parent (prefill).
 */
const SimulatorSource = ({
  t,
  form,
  deals = [],
  quotes = [],
  loading = false,
  onSelectContact,
  onSelectDeal,
  onSelectQuote,
  onClearContact,
  onClearProject,
}) => {
  const { contacts, fetchHubSpotContacts, loading: searching } = useHubSpotContacts();
  const fetchRef = useRef(fetchHubSpotContacts);
  fetchRef.current = fetchHubSpotContacts;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const handle = setTimeout(() => {
      fetchRef.current({ query });
    }, 300);
    return () => clearTimeout(handle);
  }, [query, open]);

  const contactLabel = form.hubspotContactName
    ? `${form.hubspotContactName}${form.hubspotContactId ? ` · ${form.hubspotContactId}` : ''}`
    : '';

  return (
    <div className="space-y-3 rounded-xl bg-gray-50/80 dark:bg-gray-900/40 p-3">
      <p className="text-xs font-bold uppercase tracking-widest text-gray-400">{t('margins.sim.sectionSource')}</p>
      {form.hubspotContactId ? (
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold min-w-0 flex-1 truncate">{contactLabel}</p>
          <button
            type="button"
            onClick={onClearContact}
            className="h-8 px-2 inline-flex items-center gap-1 rounded-lg text-xs font-semibold text-gray-500 hover:bg-white dark:hover:bg-gray-800"
          >
            <X className="h-3.5 w-3.5" /> {t('margins.sim.contactClear')}
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            className={inputCls}
            value={query}
            placeholder={t('margins.sim.contactSearchPh')}
            aria-label={t('margins.sim.contactSearch')}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
          />
          {open && (
            <div className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 shadow-lg">
              {searching && (
                <p className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('margins.sim.contactSearching')}
                </p>
              )}
              {!searching && contacts.length === 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">{t('margins.sim.contactEmpty')}</p>
              )}
              {contacts.slice(0, 12).map((contact) => {
                const first = contact.first_name || contact.firstname || '';
                const last = contact.last_name || contact.lastname || '';
                const name = `${first} ${last}`.trim() || contact.email || contact.id;
                return (
                  <button
                    key={contact.id}
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-900 text-sm"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setOpen(false);
                      setQuery('');
                      onSelectContact(contact);
                    }}
                  >
                    <span className="font-medium">{name}</span>
                    {contact.email && <span className="block text-[11px] text-muted-foreground truncate">{contact.email}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('margins.sim.deal')}</span>
          <select
            className={inputCls}
            value={form.hubspotDealId || ''}
            disabled={!form.hubspotContactId || loading}
            onChange={(e) => onSelectDeal(e.target.value)}
          >
            <option value="">{t('margins.sim.dealNone')}</option>
            {deals.map((deal) => (
              <option key={deal.id} value={deal.id}>
                {deal.name || deal.id}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('margins.sim.quote')}</span>
          <select
            className={inputCls}
            value={form.hubspotQuoteId || ''}
            disabled={!form.hubspotContactId || loading}
            onChange={(e) => onSelectQuote(e.target.value)}
          >
            <option value="">{t('margins.sim.quoteNone')}</option>
            {quotes.map((quote) => (
              <option key={quote.id} value={quote.id}>
                {quote.title || quote.number || quote.id}
                {quote.amount != null ? ` — ${quote.amount} ${quote.currency || 'EUR'}` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      {form.hubspotQuoteId && <p className="text-[11px] text-muted-foreground">{t('margins.sim.quoteHint')}</p>}
      {loading && (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('margins.sim.dealsLoading')}
        </p>
      )}
      {form.projectId && (
        <p className={cn('text-[11px] text-muted-foreground flex items-center gap-2')}>
          <span>{t('margins.sim.linkedProject', { name: form.projectName || form.projectId })}</span>
          <button type="button" className="underline" onClick={onClearProject}>
            {t('margins.sim.linkedProjectClear')}
          </button>
        </p>
      )}
    </div>
  );
};

export default SimulatorSource;
