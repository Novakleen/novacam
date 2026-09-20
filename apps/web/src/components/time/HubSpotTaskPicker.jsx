import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Loader2, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { fetchHubSpotServicesForTaskPicker } from '@/lib/hubspotService';

/**
 * Searchable task/service picker fed by HubSpot:
 * - preferred: line items on the linked contact's latest deal/transaction
 * - then: line items on other deals/quotes/invoices
 * - then: deal type_of_service (when line-item scopes are missing)
 * - then: product catalog / type_of_service enum catalog
 * Always allows a custom free-text value. Surfaces emptyReason when HubSpot returns none.
 *
 * Nested inside TimeEntryFormDialog (Radix Dialog): Popover must be modal +
 * CommandItem must select on pointerdown — same pattern as CompanyCamProjectPicker.
 */
const HubSpotTaskPicker = ({
  value = '',
  onChange,
  hubspotContactId = null,
  disabled = false,
  placeholder = 'Choisir un service HubSpot…',
  className,
}) => {
  const [open, setOpen] = useState(false);
  const [services, setServices] = useState([]);
  const [source, setSource] = useState('empty');
  const [emptyReason, setEmptyReason] = useState(null);
  const [requiredScopes, setRequiredScopes] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [customMode, setCustomMode] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setEmptyReason(null);
    setRequiredScopes([]);
    setMeta(null);
    try {
      const res = await fetchHubSpotServicesForTaskPicker(hubspotContactId);
      setServices(Array.isArray(res.services) ? res.services : []);
      setSource(res.source || 'empty');
      setEmptyReason(res.emptyReason || null);
      setRequiredScopes(Array.isArray(res.requiredScopes) ? res.requiredScopes : []);
      setMeta(res.meta || null);
    } catch (err) {
      setError(err?.message || 'Chargement HubSpot impossible');
      setServices([]);
      setSource('empty');
      setEmptyReason(err?.message || 'Chargement HubSpot impossible');
      setRequiredScopes(Array.isArray(err?.requiredScopes) ? err.requiredScopes : []);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, [hubspotContactId]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedInList = useMemo(
    () => services.some((s) => s.name === value),
    [services, value]
  );

  // If current value is custom (not in list), keep custom mode available
  useEffect(() => {
    if (value && !selectedInList && services.length > 0) {
      setCustomMode(true);
    }
  }, [value, selectedInList, services.length]);

  const sourceHint = useMemo(() => {
    if (source === 'latest_deal_line_items') {
      const dealLabel = meta?.dealName ? ` (« ${meta.dealName} »)` : '';
      return `Line items de la dernière transaction HubSpot${dealLabel}`;
    }
    if (source === 'contact_line_items') {
      return 'Services (line items) du devis / deal / facture HubSpot liés au contact';
    }
    if (source === 'deal_type_of_service') {
      return 'Services depuis le champ HubSpot « type_of_service » du deal (line items non lisibles)';
    }
    if (source === 'product_catalog') {
      return 'Catalogue produits HubSpot (aucun service contact trouvé)';
    }
    if (source === 'type_of_service_catalog') {
      return 'Catalogue HubSpot type_of_service (fallback — line items / produits indisponibles)';
    }
    if (emptyReason) return emptyReason;
    if (hubspotContactId) return 'Aucun service HubSpot trouvé — saisie libre possible';
    return 'Pas de contact HubSpot — catalogue ou saisie libre';
  }, [source, emptyReason, hubspotContactId, meta]);

  const emptyListMessage = loading
    ? 'Chargement…'
    : error || emptyReason || 'Aucun service. Utilisez « Saisie libre ».';

  const pickService = useCallback(
    (name) => {
      onChange?.(name);
      setOpen(false);
    },
    [onChange]
  );

  const enterCustomMode = useCallback(() => {
    setCustomMode(true);
    setOpen(false);
  }, []);

  if (customMode) {
    return (
      <div className={cn('space-y-1.5', className)}>
        <Input
          className="h-11 rounded-xl"
          placeholder="ex. SC + SP / Nettoyage toiture…"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.value)}
        />
        <button
          type="button"
          className="text-xs text-primary hover:underline"
          onClick={() => setCustomMode(false)}
          disabled={disabled}
        >
          Revenir à la liste HubSpot
        </button>
      </div>
    );
  }

  const latestDealItems = services.filter((s) => s.source === 'line_item' && s.fromLatestDeal);
  const otherItems = services.filter((s) => !(s.source === 'line_item' && s.fromLatestDeal));
  const showLatestGroup =
    source === 'latest_deal_line_items' || latestDealItems.length > 0;

  return (
    <div className={cn('space-y-1.5', className)}>
      {/* modal={true} required so pointer events work inside parent Dialog */}
      <Popover modal open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="h-11 w-full justify-between rounded-xl font-normal"
          >
            <span className="flex items-center gap-2 truncate">
              <ListChecks className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className={cn('truncate', !value && 'text-muted-foreground')}>
                {value || placeholder}
              </span>
            </span>
            {loading ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin opacity-60" />
            ) : (
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="z-[200] w-[var(--radix-popover-trigger-width)] p-0 rounded-xl"
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onWheel={(e) => e.stopPropagation()}
        >
          <Command>
            <CommandInput placeholder="Rechercher un service…" />
            <CommandList>
              <CommandEmpty>{emptyListMessage}</CommandEmpty>
              {showLatestGroup && latestDealItems.length > 0 && (
                <CommandGroup
                  heading={
                    meta?.dealName
                      ? `Dernière transaction — ${meta.dealName}`
                      : 'Dernière transaction'
                  }
                >
                  {latestDealItems.map((s) => (
                    <CommandItem
                      key={`latest-${s.id || s.name}`}
                      value={`latest ${s.id || ''} ${s.name}`}
                      keywords={[s.name, s.sku, s.id].filter(Boolean)}
                      onSelect={() => pickService(s.name)}
                      onPointerDown={(e) => {
                        // Ensure selection works even when nested in a Dialog
                        e.preventDefault();
                        pickService(s.name);
                      }}
                      className="rounded-lg cursor-pointer"
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4 shrink-0',
                          value === s.name ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <span className="truncate">{s.name}</span>
                      {s.sku ? (
                        <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                          {s.sku}
                        </span>
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              <CommandGroup
                heading={
                  showLatestGroup && latestDealItems.length > 0
                    ? otherItems.length
                      ? 'Autres services'
                      : undefined
                    : undefined
                }
              >
                {(showLatestGroup && latestDealItems.length > 0 ? otherItems : services).map(
                  (s) => (
                    <CommandItem
                      key={`${s.source}-${s.id || s.name}`}
                      value={`${s.source || ''} ${s.id || ''} ${s.name}`}
                      keywords={[s.name, s.sku, s.id].filter(Boolean)}
                      onSelect={() => pickService(s.name)}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        pickService(s.name);
                      }}
                      className="rounded-lg cursor-pointer"
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4 shrink-0',
                          value === s.name ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <span className="truncate">{s.name}</span>
                    </CommandItem>
                  )
                )}
                <CommandItem
                  value="__custom__"
                  onSelect={enterCustomMode}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    enterCustomMode();
                  }}
                  className="rounded-lg cursor-pointer"
                >
                  <span className="text-muted-foreground">Saisie libre…</span>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <p className="text-[11px] text-muted-foreground px-0.5">{sourceHint}</p>
      {requiredScopes.length > 0 && services.length === 0 && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400 px-0.5 break-all">
          Scopes manquants : {requiredScopes.slice(0, 6).join(', ')}
        </p>
      )}
    </div>
  );
};

export default HubSpotTaskPicker;
