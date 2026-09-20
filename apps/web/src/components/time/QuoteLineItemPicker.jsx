import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, FileSpreadsheet, ListChecks, X } from 'lucide-react';
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
import {
  defaultQuantityDoneForLineItem,
  formatQuoteLineItemTaskLabel,
} from '@/lib/timeTracking';

/**
 * Multi-select postes from the project's linked HubSpot devis snapshot.
 * Keep the popover open while toggling; Terminer commits draft → parent.
 * Selected postes render as compact rows: qté faite editable + tiny /planned reste.
 *
 * Nested inside TimeEntryFormDialog (Radix Dialog): Popover must be modal +
 * CommandItem must toggle on pointerdown — same pattern as HubSpotTaskPicker.
 *
 * Critical multi-select detail: cmdk fires onClick → onSelect AFTER our
 * onPointerDown. Calling toggle in both handlers add-then-removes (no checkmarks).
 * Guard: toggle on pointerdown, skip the trailing onSelect; keyboard Enter still
 * reaches onSelect alone.
 */
const QuoteLineItemPicker = ({
  lineItems = [],
  /** @type {{ hubspot_line_item_id: string, task_label?: string, quote_quantity?: number|null, quantity_done?: number|string }[]} */
  selectedPostes = [],
  onChange,
  quoteTitle = null,
  disabled = false,
  /** When false (edit mode), selecting another poste replaces the current one. */
  allowMulti = true,
  className,
}) => {
  const [open, setOpen] = useState(false);
  /** Draft while the popover is open; Terminer commits to parent. */
  const [draftPostes, setDraftPostes] = useState(selectedPostes);
  /** Skip cmdk onSelect when the same gesture already toggled via pointerdown. */
  const skipSelectRef = useRef(false);

  const workingPostes = open && allowMulti ? draftPostes : selectedPostes;

  const selectedIds = useMemo(
    () => new Set(workingPostes.map((p) => String(p.hubspot_line_item_id)).filter(Boolean)),
    [workingPostes]
  );

  const emit = useCallback(
    (next) => {
      onChange?.(next);
    },
    [onChange]
  );

  const handleOpenChange = useCallback(
    (next) => {
      if (next) {
        setDraftPostes(Array.isArray(selectedPostes) ? selectedPostes : []);
      }
      setOpen(next);
    },
    [selectedPostes]
  );

  const toggleItem = useCallback(
    (item) => {
      const id = item.id ? String(item.id) : '';
      if (!id) return;

      const qtyDone = defaultQuantityDoneForLineItem(item);
      const nextPoste = {
        hubspot_line_item_id: id,
        task_label: item.name || '',
        quote_quantity: item.planned ?? item.quantity ?? null,
        quantity_done: qtyDone,
      };

      if (!allowMulti) {
        emit([nextPoste]);
        setOpen(false);
        return;
      }

      // Functional update so rapid toggles accumulate correctly
      setDraftPostes((prev) => {
        const already = prev.some((p) => String(p.hubspot_line_item_id) === id);
        if (already) {
          return prev.filter((p) => String(p.hubspot_line_item_id) !== id);
        }
        return [...prev, nextPoste];
      });
    },
    [allowMulti, emit]
  );

  const handleItemPointerDown = useCallback(
    (e, item) => {
      // Keep focus out of Dialog traps; ensure pointer events commit the toggle
      e.preventDefault();
      skipSelectRef.current = true;
      toggleItem(item);
    },
    [toggleItem]
  );

  const handleItemSelect = useCallback(
    (item) => {
      // cmdk onClick → onSelect after pointerdown would double-toggle and cancel
      if (skipSelectRef.current) {
        skipSelectRef.current = false;
        return;
      }
      toggleItem(item);
    },
    [toggleItem]
  );

  const commitAndClose = useCallback(() => {
    emit(draftPostes);
    setOpen(false);
  }, [draftPostes, emit]);

  const updateQty = useCallback(
    (id, value) => {
      emit(
        selectedPostes.map((p) =>
          String(p.hubspot_line_item_id) === String(id)
            ? { ...p, quantity_done: value }
            : p
        )
      );
    },
    [emit, selectedPostes]
  );

  const removePoste = useCallback(
    (id) => {
      emit(selectedPostes.filter((p) => String(p.hubspot_line_item_id) !== String(id)));
    },
    [emit, selectedPostes]
  );

  const clearAll = useCallback(() => emit([]), [emit]);

  const triggerLabel = useMemo(() => {
    const list = open && allowMulti ? draftPostes : selectedPostes;
    if (list.length === 0) {
      return allowMulti ? 'Choisir des postes du devis…' : 'Choisir un poste du devis…';
    }
    return formatQuoteLineItemTaskLabel(
      list.map((p) => ({ name: p.task_label || p.hubspot_line_item_id }))
    );
  }, [allowMulti, draftPostes, open, selectedPostes]);

  const footerCount = open && allowMulti ? draftPostes.length : selectedPostes.length;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="space-y-1.5">
        {/* modal={true} required so pointer events work inside parent Dialog */}
        <Popover modal open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              disabled={disabled || lineItems.length === 0}
              className="h-11 w-full justify-between rounded-xl font-normal"
            >
              <span className="flex items-center gap-2 truncate">
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span
                  className={cn(
                    'truncate',
                    (open && allowMulti ? draftPostes : selectedPostes).length === 0 &&
                      'text-muted-foreground'
                  )}
                >
                  {triggerLabel}
                </span>
              </span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
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
              <CommandInput placeholder="Rechercher un poste…" />
              <CommandList>
                <CommandEmpty>Aucun poste dans le devis.</CommandEmpty>
                <CommandGroup
                  heading={
                    quoteTitle
                      ? `Devis — ${quoteTitle}`
                      : allowMulti
                        ? 'Postes du devis (multi)'
                        : 'Postes du devis lié'
                  }
                >
                  {lineItems.map((li) => {
                    const isSelected = selectedIds.has(String(li.id));
                    const planned = li.planned ?? li.quantity;
                    const done = li.done ?? 0;
                    // Compact: one progress hint only (done/planned), not « Fait + Reste »
                    const progressHint =
                      planned != null
                        ? `${done}/${planned}`
                        : li.remaining != null
                          ? `reste ${li.remaining}`
                          : null;
                    return (
                      <CommandItem
                        key={li.id || li.name}
                        value={`${li.id || ''} ${li.name || ''}`}
                        keywords={[li.name, li.sku, li.id].filter(Boolean)}
                        onSelect={() => handleItemSelect(li)}
                        onPointerDown={(e) => handleItemPointerDown(e, li)}
                        className="rounded-lg cursor-pointer"
                        data-checked={isSelected ? 'true' : 'false'}
                        aria-checked={isSelected}
                      >
                        <span
                          className={cn(
                            'mr-2 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                            isSelected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-muted-foreground/40 bg-background'
                          )}
                          aria-hidden
                        >
                          {isSelected ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                        </span>
                        <div className="min-w-0 flex-1 flex items-center gap-2">
                          <div className="truncate font-medium flex-1">{li.name}</div>
                          {progressHint && (
                            <span
                              className={cn(
                                'text-[10px] tabular-nums shrink-0',
                                li.remaining > 0
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-emerald-700 dark:text-emerald-400'
                              )}
                            >
                              {progressHint}
                            </span>
                          )}
                          {li.sku ? (
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {li.sku}
                            </span>
                          ) : null}
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
            {allowMulti && (
              <div className="border-t p-2 flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground px-1">
                  {footerCount === 0
                    ? 'Sélectionnez un ou plusieurs postes'
                    : `${footerCount} poste${footerCount > 1 ? 's' : ''} sélectionné${footerCount > 1 ? 's' : ''}`}
                </span>
                <Button
                  type="button"
                  size="sm"
                  className="rounded-lg h-8"
                  onClick={commitAndClose}
                >
                  Terminer
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
        <p className="text-[11px] text-muted-foreground px-0.5 flex items-center gap-1">
          <ListChecks className="h-3 w-3 shrink-0" />
          {allowMulti
            ? 'Plusieurs postes possibles (ex. SC + SPRE) — une entrée par poste'
            : 'Poste exact du devis — quantité pré-remplie (modifiable)'}
        </p>
      </div>

      {selectedPostes.length > 0 && (
        <div className="rounded-xl border bg-muted/30 p-2 space-y-1.5">
          {selectedPostes.map((poste) => {
            const li =
              lineItems.find(
                (x) => String(x.id) === String(poste.hubspot_line_item_id)
              ) || null;
            const planned =
              Number(poste.quote_quantity ?? li?.planned ?? li?.quantity) || 0;
            const already = Number(li?.done) || 0;
            const thisDone = Number(poste.quantity_done);
            const add = Number.isFinite(thisDone) ? thisDone : 0;
            const resteAfter = Math.max(
              0,
              Math.round((planned - already - add) * 1000) / 1000
            );
            const name = poste.task_label || li?.name || poste.hubspot_line_item_id;
            return (
              <div
                key={poste.hubspot_line_item_id}
                className="flex items-center gap-2 rounded-lg bg-background border px-2 py-1.5"
              >
                <div className="min-w-0 flex-1 truncate text-sm font-medium">{name}</div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    aria-label={`Qté faite — ${name}`}
                    className="h-8 w-16 rounded-md text-sm tabular-nums px-2"
                    value={
                      poste.quantity_done === '' || poste.quantity_done == null
                        ? ''
                        : poste.quantity_done
                    }
                    disabled={disabled}
                    onChange={(e) =>
                      updateQty(poste.hubspot_line_item_id, e.target.value)
                    }
                  />
                  <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
                    /{planned || '—'}
                    {planned ? (
                      <span
                        className={cn(
                          'ml-1',
                          resteAfter > 0
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-emerald-700 dark:text-emerald-400'
                        )}
                      >
                        reste {resteAfter}
                      </span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                    onClick={() => removePoste(poste.hubspot_line_item_id)}
                    disabled={disabled}
                    aria-label={`Retirer ${name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
          {selectedPostes.length > 1 && (
            <button
              type="button"
              className="text-[11px] text-primary hover:underline px-1"
              onClick={clearAll}
              disabled={disabled}
            >
              Tout retirer
            </button>
          )}
          {selectedPostes.length === 1 && (
            <button
              type="button"
              className="text-[11px] text-primary hover:underline px-1"
              onClick={clearAll}
              disabled={disabled}
            >
              Retirer le poste
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default QuoteLineItemPicker;
