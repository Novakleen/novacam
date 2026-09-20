import React, { useCallback, useMemo, useState } from 'react';
import { Check, ChevronsUpDown, FileSpreadsheet, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { defaultQuantityDoneForLineItem } from '@/lib/timeTracking';

/**
 * Pick an exact poste from the project's linked HubSpot devis snapshot.
 * Shows fait / reste; selecting a poste pre-fills label + planned qty and
 * defaults quantity_done to remaining (editable).
 *
 * Nested inside TimeEntryFormDialog (Radix Dialog): Popover must be modal +
 * CommandItem must select on pointerdown — same pattern as HubSpotTaskPicker.
 */
const QuoteLineItemPicker = ({
  lineItems = [],
  selectedLineItemId = '',
  quantityDone = '',
  onSelect,
  onQuantityDoneChange,
  quoteTitle = null,
  disabled = false,
  className,
}) => {
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => lineItems.find((li) => String(li.id) === String(selectedLineItemId)) || null,
    [lineItems, selectedLineItemId]
  );

  const pick = useCallback(
    (item) => {
      const qtyDone = defaultQuantityDoneForLineItem(item);
      onSelect?.({
        hubspot_line_item_id: item.id ? String(item.id) : '',
        task_label: item.name || '',
        quote_quantity: item.planned ?? item.quantity ?? null,
        quantity_done: qtyDone,
      });
      setOpen(false);
    },
    [onSelect]
  );

  const clear = useCallback(() => {
    onSelect?.({
      hubspot_line_item_id: '',
      task_label: '',
      quote_quantity: null,
      quantity_done: '',
    });
  }, [onSelect]);

  const triggerLabel = selected
    ? selected.name
    : 'Choisir un poste du devis…';

  return (
    <div className={cn('space-y-3', className)}>
      <div className="space-y-1.5">
        <Popover modal open={open} onOpenChange={setOpen}>
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
                <span className={cn('truncate', !selected && 'text-muted-foreground')}>
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
                      : 'Postes du devis lié'
                  }
                >
                  {lineItems.map((li) => {
                    const isSelected = String(li.id) === String(selectedLineItemId);
                    const remLabel =
                      li.remaining != null
                        ? `Reste ${li.remaining}`
                        : null;
                    const doneLabel =
                      li.done != null || li.planned != null
                        ? `Fait ${li.done ?? 0}/${li.planned ?? '—'}`
                        : null;
                    return (
                      <CommandItem
                        key={li.id || li.name}
                        value={`${li.id || ''} ${li.name || ''}`}
                        keywords={[li.name, li.sku, li.id].filter(Boolean)}
                        onSelect={() => pick(li)}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          pick(li);
                        }}
                        className="rounded-lg cursor-pointer"
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4 shrink-0',
                            isSelected ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{li.name}</div>
                          <div className="text-[10px] text-muted-foreground flex gap-2">
                            {doneLabel && <span>{doneLabel}</span>}
                            {remLabel && (
                              <span
                                className={cn(
                                  li.remaining > 0
                                    ? 'text-amber-700 dark:text-amber-400'
                                    : 'text-emerald-700 dark:text-emerald-400'
                                )}
                              >
                                {remLabel}
                              </span>
                            )}
                            {li.sku ? <span className="ml-auto">{li.sku}</span> : null}
                          </div>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <p className="text-[11px] text-muted-foreground px-0.5 flex items-center gap-1">
          <ListChecks className="h-3 w-3 shrink-0" />
          Postes exacts du devis lié — quantité pré-remplie (modifiable)
        </p>
      </div>

      {selected && (
        <div className="grid grid-cols-2 gap-3 rounded-xl border bg-muted/30 p-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Qté devis</Label>
            <div className="h-10 rounded-lg border bg-background px-3 flex items-center text-sm font-medium tabular-nums">
              {selected.planned ?? selected.quantity ?? '—'}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Qté faite (cette entrée)</Label>
            <Input
              type="number"
              min={0}
              step="any"
              className="h-10 rounded-lg"
              value={quantityDone === '' || quantityDone == null ? '' : quantityDone}
              disabled={disabled}
              onChange={(e) => onQuantityDoneChange?.(e.target.value)}
            />
          </div>
          <div className="col-span-2 text-[11px] text-muted-foreground">
            Reste après cette entrée :{' '}
            <span className="font-semibold text-foreground">
              {(() => {
                const planned = Number(selected.planned ?? selected.quantity) || 0;
                const already = Number(selected.done) || 0;
                const thisDone = Number(quantityDone);
                const add = Number.isFinite(thisDone) ? thisDone : 0;
                return Math.max(0, Math.round((planned - already - add) * 1000) / 1000);
              })()}
            </span>
            {' · '}
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={clear}
              disabled={disabled}
            >
              Retirer le poste
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuoteLineItemPicker;
