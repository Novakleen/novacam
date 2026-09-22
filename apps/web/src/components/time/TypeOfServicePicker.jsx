import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, ListChecks, Tags, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
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
import { formatTypeOfServiceTaskLabel } from '@/lib/timeTracking';

/**
 * Multi-select type_of_service values from the project's linked HubSpot deal.
 * Keep the popover open while toggling; Terminer commits draft → parent.
 * One time entry per selected service (parent). No devis quantity remaining.
 *
 * Nested inside TimeEntryFormDialog (Radix Dialog): Popover must be modal +
 * CommandItem must toggle on pointerdown — same pattern as QuoteLineItemPicker.
 */
const TypeOfServicePicker = ({
  /** @type {string[]} */
  options = [],
  /** @type {{ value: string, task_label?: string }[]} */
  selectedServices = [],
  onChange,
  dealName = null,
  disabled = false,
  /** When false (edit mode), selecting another service replaces the current one. */
  allowMulti = true,
  className,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [draftServices, setDraftServices] = useState(selectedServices);
  const skipSelectRef = useRef(false);

  const working = open && allowMulti ? draftServices : selectedServices;

  const selectedIds = useMemo(
    () => new Set(working.map((s) => String(s.value)).filter(Boolean)),
    [working]
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
        setDraftServices(Array.isArray(selectedServices) ? selectedServices : []);
      }
      setOpen(next);
    },
    [selectedServices]
  );

  const toggleItem = useCallback(
    (label) => {
      const value = label ? String(label).trim() : '';
      if (!value) return;

      const nextService = { value, task_label: value };

      if (!allowMulti) {
        emit([nextService]);
        setOpen(false);
        return;
      }

      setDraftServices((prev) => {
        const already = prev.some((s) => String(s.value) === value);
        if (already) {
          return prev.filter((s) => String(s.value) !== value);
        }
        return [...prev, nextService];
      });
    },
    [allowMulti, emit]
  );

  const handleItemPointerDown = useCallback(
    (e, label) => {
      e.preventDefault();
      skipSelectRef.current = true;
      toggleItem(label);
    },
    [toggleItem]
  );

  const handleItemSelect = useCallback(
    (label) => {
      if (skipSelectRef.current) {
        skipSelectRef.current = false;
        return;
      }
      toggleItem(label);
    },
    [toggleItem]
  );

  const commitAndClose = useCallback(() => {
    emit(draftServices);
    setOpen(false);
  }, [draftServices, emit]);

  const removeService = useCallback(
    (value) => {
      emit(selectedServices.filter((s) => String(s.value) !== String(value)));
    },
    [emit, selectedServices]
  );

  const clearAll = useCallback(() => emit([]), [emit]);

  const triggerLabel = useMemo(() => {
    const list = open && allowMulti ? draftServices : selectedServices;
    if (list.length === 0) {
      return allowMulti
        ? t('time.tosChooseMulti')
        : t('time.tosChooseSingle');
    }
    return formatTypeOfServiceTaskLabel(
      list.map((s) => ({ name: s.task_label || s.value }))
    );
  }, [allowMulti, draftServices, open, selectedServices, t]);

  const footerCount = open && allowMulti ? draftServices.length : selectedServices.length;

  return (
    <div className={cn('min-w-0 space-y-2', className)}>
      <div className="space-y-1.5">
        <Popover modal open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              disabled={disabled || options.length === 0}
              className="min-h-11 h-auto w-full min-w-0 justify-between rounded-xl font-normal py-2"
            >
              <span className="flex min-w-0 flex-1 items-start gap-2 text-left">
                <Tags className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span
                  className={cn(
                    'min-w-0 whitespace-normal break-words',
                    (open && allowMulti ? draftServices : selectedServices).length === 0 &&
                      'text-muted-foreground'
                  )}
                >
                  {triggerLabel}
                </span>
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50 self-start mt-0.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="z-[200] w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0 rounded-xl overflow-x-hidden"
            align="start"
            sideOffset={4}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            onWheel={(e) => e.stopPropagation()}
          >
            <Command>
              <CommandInput placeholder={t('time.tosSearch')} />
              <CommandList>
                <CommandEmpty>{t('time.tosEmptyOptions')}</CommandEmpty>
                <CommandGroup
                  heading={
                    dealName
                      ? t('time.tosGroupWithDeal', { name: dealName })
                      : allowMulti
                        ? t('time.tosGroupMulti')
                        : t('time.tosGroupSingle')
                  }
                >
                  {options.map((label) => {
                    const isSelected = selectedIds.has(String(label));
                    return (
                      <CommandItem
                        key={label}
                        value={label}
                        keywords={[label]}
                        onSelect={() => handleItemSelect(label)}
                        onPointerDown={(e) => handleItemPointerDown(e, label)}
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
                        <div className="min-w-0 flex-1 whitespace-normal break-words font-medium">
                          {label}
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
                    ? t('time.tosSelectHint')
                    : t('time.tosSelectedCount', { count: footerCount })}
                </span>
                <Button
                  type="button"
                  size="sm"
                  className="rounded-lg h-8"
                  onClick={commitAndClose}
                >
                  {t('time.tosDone')}
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
        <p className="text-[11px] text-muted-foreground px-0.5 flex items-center gap-1">
          <ListChecks className="h-3 w-3 shrink-0" />
          {allowMulti ? t('time.tosHintMulti') : t('time.tosHintSingle')}
        </p>
      </div>

      {selectedServices.length > 0 && (
        <div className="rounded-xl border bg-muted/30 p-2 space-y-1.5">
          {selectedServices.map((svc) => {
            const name = svc.task_label || svc.value;
            return (
              <div
                key={svc.value}
                className="flex min-w-0 items-start gap-2 rounded-lg bg-background border px-2 py-1.5"
              >
                <div className="min-w-0 flex-1 whitespace-normal break-words text-sm font-medium">
                  {name}
                </div>
                <button
                  type="button"
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
                  onClick={() => removeService(svc.value)}
                  disabled={disabled}
                  aria-label={t('time.tosRemoveOne', { name })}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
          {selectedServices.length > 1 && (
            <button
              type="button"
              className="text-[11px] text-primary hover:underline px-1"
              onClick={clearAll}
              disabled={disabled}
            >
              {t('time.tosClearAll')}
            </button>
          )}
          {selectedServices.length === 1 && (
            <button
              type="button"
              className="text-[11px] text-primary hover:underline px-1"
              onClick={clearAll}
              disabled={disabled}
            >
              {t('time.tosClearOne')}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default TypeOfServicePicker;
