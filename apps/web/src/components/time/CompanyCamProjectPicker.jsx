import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Loader2, Building2, Search } from 'lucide-react';
import * as ccApi from '@/lib/companycamService';
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

/**
 * Fast CompanyCam project picker:
 * - shows most recent active projects first (API default sort)
 * - in-memory cache for instant reopen
 * - debounced server search by name/address
 * - never blocks the rest of the form
 */
const CompanyCamProjectPicker = ({
  value = '',
  selectedName = '',
  onSelect,
  disabled = false,
  className,
}) => {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState(() => ccApi.getCachedRecentProjects());
  const [loading, setLoading] = useState(() => ccApi.getCachedRecentProjects().length === 0);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState(null);
  const searchTimer = useRef(null);
  const requestId = useRef(0);

  const loadRecent = useCallback(async ({ force = false } = {}) => {
    const cached = ccApi.getCachedRecentProjects();
    if (!force && cached.length > 0) {
      setProjects(cached);
      setLoading(false);
      // Refresh in background
      ccApi.listRecentProjects({ per_page: 25, force: false }).then((res) => {
        if (res.success && Array.isArray(res.data)) setProjects(res.data);
      });
      return;
    }

    setLoading(true);
    setError(null);
    const id = ++requestId.current;
    try {
      const res = await ccApi.listRecentProjects({ per_page: 25, force });
      if (id !== requestId.current) return;
      if (!res.success) throw new Error(res.error || 'Chargement impossible');
      setProjects(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err.message || 'Erreur CompanyCam');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  // Prefetch as soon as the picker mounts (dialog open)
  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  const runSearch = useCallback(async (q) => {
    const trimmed = q.trim();
    const id = ++requestId.current;
    if (!trimmed) {
      setSearching(false);
      await loadRecent();
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const res = await ccApi.searchProjects(trimmed, { per_page: 25 });
      if (id !== requestId.current) return;
      if (!res.success) throw new Error(res.error || 'Recherche impossible');
      setProjects(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err.message || 'Recherche impossible');
    } finally {
      if (id === requestId.current) setSearching(false);
    }
  }, [loadRecent]);

  const handleQueryChange = (q) => {
    setQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => runSearch(q), 280);
  };

  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  const options = useMemo(() => {
    const list = [...projects];
    if (value && !list.some((p) => String(p.id) === String(value))) {
      list.unshift({
        id: value,
        name: selectedName || `Projet ${value}`,
      });
    }
    return list;
  }, [projects, value, selectedName]);

  const displayLabel = useMemo(() => {
    if (!value) return null;
    const found = options.find((p) => String(p.id) === String(value));
    return found?.name || selectedName || `Projet ${value}`;
  }, [value, options, selectedName]);

  const handlePick = (project) => {
    if (!project || project.id === 'none') {
      onSelect?.({ id: '', name: '' });
    } else {
      onSelect?.({
        id: String(project.id),
        name: project.name || `Projet ${project.id}`,
        raw: project,
      });
    }
    setOpen(false);
    setQuery('');
  };

  const busy = loading || searching;

  return (
    // modal={true} is required so pointer events work inside a parent Dialog
    <Popover
      modal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && projects.length === 0) loadRecent();
        if (!next) {
          setQuery('');
          const cached = ccApi.getCachedRecentProjects();
          if (cached.length > 0) setProjects(cached);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'h-11 w-full justify-between rounded-xl font-normal px-3',
            !value && 'text-muted-foreground',
            className
          )}
        >
          <span className="flex items-center gap-2 truncate">
            {loading && !displayLabel ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                Chargement des projets récents…
              </>
            ) : displayLabel ? (
              <>
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{displayLabel}</span>
              </>
            ) : (
              <>
                <Search className="h-4 w-4 shrink-0 opacity-60" />
                Choisir un projet CompanyCam…
              </>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
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
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Rechercher un projet…"
            value={query}
            onValueChange={handleQueryChange}
          />
          <CommandList>
            {busy && (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground border-b">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {searching ? 'Recherche…' : 'Chargement des plus récents…'}
              </div>
            )}
            {error && !busy && (
              <div className="px-3 py-2 text-xs text-destructive border-b flex items-center justify-between gap-2">
                <span className="truncate">{error}</span>
                <button
                  type="button"
                  className="underline shrink-0"
                  onClick={() => loadRecent({ force: true })}
                >
                  Réessayer
                </button>
              </div>
            )}
            <CommandEmpty>
              {busy ? '…' : query ? 'Aucun projet trouvé.' : 'Aucun projet récent.'}
            </CommandEmpty>
            <CommandGroup heading={query ? 'Résultats' : 'Plus récents'}>
              <CommandItem
                value="__none__"
                onSelect={() => handlePick(null)}
                onPointerDown={(e) => {
                  // Ensure selection works even when nested in a Dialog
                  e.preventDefault();
                  handlePick(null);
                }}
                className="rounded-lg cursor-pointer"
              >
                <Check
                  className={cn(
                    'mr-2 h-4 w-4',
                    !value ? 'opacity-100' : 'opacity-0'
                  )}
                />
                Aucun client
              </CommandItem>
              {options.map((p) => {
                const id = String(p.id);
                const selected = id === String(value);
                const label = p.name || `Projet ${id}`;
                return (
                  <CommandItem
                    key={id}
                    value={`${id} ${label}`}
                    keywords={[label, id]}
                    onSelect={() => handlePick(p)}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      handlePick(p);
                    }}
                    className="rounded-lg cursor-pointer"
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4 shrink-0',
                        selected ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <span className="truncate">{label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default CompanyCamProjectPicker;
