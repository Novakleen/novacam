import React from 'react';
import { nodeName } from '@/lib/fleet/inventory';
import NodeSheet from './NodeSheet';
import ReportDialog from './ReportDialog';
import MoveNodeDialog from './MoveNodeDialog';
import NodeEditDialog from './NodeEditDialog';
import PlaceArticleDialog from './PlaceArticleDialog';
import TicketSheet from './TicketSheet';

/**
 * All inventory dialogs, driven by one state object:
 *   { sheet: node, report: node, move: node, edit: { node?, parent? }, ticket: ticket }
 *   edit.node → NodeEditDialog; edit.parent (no node) → PlaceArticleDialog (catalog picker, v1.10.0)
 * `ctx` = { tree, tickets, articles, isAdmin, canActNode(node), canMoveNode(node), moveRoots, lang, profileById, onReload, onOpen(node) }
 */
const InventoryDialogs = ({ state, setState, ctx }) => {
  const { tree, tickets, articles, isAdmin, canActNode, canMoveNode, moveRoots, lang, profileById, onReload, onOpen } = ctx;
  const close = (key) => setState((s) => ({ ...s, [key]: null }));
  const refresh = () => onReload?.();
  // Always show the fresh row after a reload
  const fresh = (n) => (n ? tree.byId.get(n.id) || n : null);
  const sheet = fresh(state.sheet);
  const ticketNode = state.ticket ? tree.byId.get(state.ticket.node_id) : null;
  const freshTicket = state.ticket ? tickets.find((tk) => tk.id === state.ticket.id) || state.ticket : null;

  return (
    <>
      {sheet && (
        <NodeSheet
          node={sheet}
          tree={tree}
          tickets={tickets}
          isAdmin={isAdmin}
          canAct={canActNode(sheet)}
          canMove={canMoveNode ? canMoveNode(sheet) : canActNode(sheet)}
          lang={lang}
          profileById={profileById}
          onClose={() => close('sheet')}
          onReport={(n) => setState((s) => ({ ...s, report: n }))}
          onMove={(n) => setState((s) => ({ ...s, move: n }))}
          onEdit={(n) => setState((s) => ({ ...s, edit: { node: n } }))}
          onOpen={(n) => {
            close('sheet');
            onOpen?.(n);
          }}
          onTicket={(tk) => setState((s) => ({ ...s, ticket: tk }))}
          onChanged={refresh}
        />
      )}
      <ReportDialog
        open={Boolean(state.report)}
        onOpenChange={(o) => !o && close('report')}
        node={fresh(state.report)}
        lang={lang}
        onDone={refresh}
      />
      <MoveNodeDialog
        open={Boolean(state.move)}
        onOpenChange={(o) => !o && close('move')}
        node={fresh(state.move)}
        tree={tree}
        roots={moveRoots}
        lang={lang}
        onDone={() => {
          setState((s) => ({ ...s, sheet: null }));
          refresh();
        }}
      />
      <NodeEditDialog
        open={Boolean(state.edit?.node)}
        onOpenChange={(o) => !o && close('edit')}
        node={state.edit?.node ? fresh(state.edit.node) : null}
        lang={lang}
        onDone={refresh}
      />
      <PlaceArticleDialog
        open={Boolean(state.edit?.parent && !state.edit?.node)}
        onOpenChange={(o) => !o && close('edit')}
        parent={state.edit?.parent ? fresh(state.edit.parent) : null}
        articles={articles || []}
        lang={lang}
        onDone={refresh}
      />
      {freshTicket && ticketNode && (
        <TicketSheet
          ticket={freshTicket}
          node={ticketNode}
          byId={tree.byId}
          pathLabel={tree
            .path(ticketNode.id)
            .slice(0, -1)
            .map((p) => nodeName(p, lang))
            .join(' › ')}
          isAdmin={isAdmin}
          canAct={canActNode(ticketNode)}
          profileById={profileById}
          lang={lang}
          onClose={() => close('ticket')}
          onChanged={refresh}
        />
      )}
    </>
  );
};

export default InventoryDialogs;
