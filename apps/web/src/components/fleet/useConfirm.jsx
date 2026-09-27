import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/**
 * In-app confirm dialog (v1.9.3). Replaces window.confirm(), which browsers can
 * silently suppress ("prevent this page from creating additional dialogs"),
 * making destructive buttons look dead.
 * Usage: const [confirm, confirmDialog] = useConfirm(); if (!(await confirm({ title }))) return;
 */
export default function useConfirm() {
  const { t } = useTranslation();
  const [opts, setOpts] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback(
    (o) =>
      new Promise((resolve) => {
        resolver.current = resolve;
        setOpts(typeof o === 'string' ? { title: o } : o || {});
      }),
    []
  );

  const close = (value) => {
    resolver.current?.(value);
    resolver.current = null;
    setOpts(null);
  };

  const dialog = (
    <AlertDialog open={Boolean(opts)} onOpenChange={(o) => !o && close(false)}>
      <AlertDialogContent className="rounded-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{opts?.title}</AlertDialogTitle>
          {opts?.description && (
            <AlertDialogDescription className="whitespace-pre-line">{opts.description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-full" onClick={() => close(false)}>
            {t('common.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            className={opts?.destructive === false ? 'rounded-full' : 'rounded-full bg-red-600 hover:bg-red-700 text-white'}
            onClick={() => close(true)}
          >
            {opts?.confirmLabel || (opts?.destructive === false ? t('common.confirm') : t('common.delete'))}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return [confirm, dialog];
}
