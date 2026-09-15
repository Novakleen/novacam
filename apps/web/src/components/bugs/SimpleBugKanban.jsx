import React, { useState } from 'react';
import { DragDropContext, Droppable } from '@hello-pangea/dnd';
import BugCard from './BugCard';
import { cn } from '@/lib/utils';
import { Clock, CheckCircle2, ListTodo, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import BugDetailsModal from './BugDetailsModal';
import { supabase } from '@/lib/customSupabaseClient';

const COLUMNS = {
  'To Do': { id: 'To Do', title: 'To Do', icon: ListTodo, color: 'text-blue-500', bgHeader: 'bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-900/40', borderColor: 'border-t-blue-500' },
  'In Progress': { id: 'In Progress', title: 'In Progress', icon: Clock, color: 'text-orange-500', bgHeader: 'bg-gradient-to-r from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-900/40', borderColor: 'border-t-orange-500' },
  'In Review': { id: 'In Review', title: 'In Review', icon: Eye, color: 'text-purple-500', bgHeader: 'bg-gradient-to-r from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-900/40', borderColor: 'border-t-purple-500' },
  'Done': { id: 'Done', title: 'Done', icon: CheckCircle2, color: 'text-green-600', bgHeader: 'bg-gradient-to-r from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-900/40', borderColor: 'border-t-green-600' }
};

const SimpleBugKanban = ({ bugs, setBugs, onUpdateStatus }) => {
  const { toast } = useToast();
  const [selectedBug, setSelectedBug] = useState(null);
  const [showBugDetailsModal, setShowBugDetailsModal] = useState(false);

  // We rely on parent providing onUpdateStatus for actual API calls, but we do optimistic local update here
  // or use the one provided by parent if it handles list state.
  // Actually, parent passes setBugs, so we can use that for optimistic updates if onUpdateStatus doesn't handle it
  // But let's check BugHunterPage implementation... it passes handleUpdateBugStatus.
  
  const onDragEnd = async (result) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const newStatus = destination.droppableId;
    
    if (onUpdateStatus) {
       onUpdateStatus(draggableId, newStatus);
    }
  };

  const getBugsByStatus = (statusId) => {
    return bugs.filter(bug => bug.status === statusId);
  };

  const handleCardClick = (bug) => {
    setSelectedBug(bug);
    setShowBugDetailsModal(true);
  };

  const handleDeleteBug = (bugId) => {
    setBugs(prevBugs => prevBugs.filter(bug => bug.id !== bugId));
  };

  return (
    <div className="relative">
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 h-full min-h-[500px]">
          {Object.values(COLUMNS).map((column) => {
            const columnBugs = getBugsByStatus(column.id);
            const Icon = column.icon;
            
            return (
              <div 
                key={column.id} 
                className="flex flex-col h-full bg-gray-50 rounded-lg border border-gray-100 shadow-sm"
              >
                <div className={cn(
                  "p-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-800 border-t-4",
                  column.bgHeader,
                  column.borderColor
                )}>
                   <div className="flex items-center gap-2">
                      <Icon className={cn("h-4 w-4", column.color)} />
                      <h3 className="font-bold text-xs uppercase tracking-wide text-gray-700 dark:text-gray-200">
                        {column.title}
                      </h3>
                   </div>
                   <Badge variant="secondary" className="bg-white/80 dark:bg-black/40 text-gray-600 dark:text-gray-300 shadow-sm text-xs px-1.5 h-5">
                     {columnBugs.length}
                   </Badge>
                </div>

                <Droppable droppableId={column.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={cn(
                        "flex-1 p-2 min-h-[100px] transition-colors overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-800",
                        snapshot.isDraggingOver ? "bg-gray-100/80 dark:bg-gray-800/80" : "bg-transparent"
                      )}
                    >
                      {columnBugs.length === 0 ? (
                        <div className="h-32 flex flex-col items-center justify-center text-gray-400 opacity-60">
                           <Icon className="h-8 w-8 mb-2 opacity-20" />
                          <p className="text-xs font-medium">No bugs</p>
                        </div>
                      ) : (
                        columnBugs.map((bug, index) => (
                          <BugCard 
                            key={bug.id} 
                            bug={bug} 
                            index={index} 
                            onClick={handleCardClick}
                          />
                        ))
                      )}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>
      {selectedBug && (
        <BugDetailsModal
          bug={selectedBug}
          open={showBugDetailsModal}
          onOpenChange={setShowBugDetailsModal}
          onDelete={handleDeleteBug}
        />
      )}
    </div>
  );
};

export default SimpleBugKanban;