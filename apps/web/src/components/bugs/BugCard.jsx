import React from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { cn } from '@/lib/utils';
import { User, MessageSquare, Paperclip } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const BugCard = ({ bug, index, onClick }) => {
  const getPriorityStyles = (priority) => {
    switch (priority) {
      case 'Critical':
      case 'High':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'Medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Low':
      default:
        return 'bg-green-100 text-green-800 border-green-200';
    }
  };

  const reporterName = bug.reporter_profile?.full_name || bug.reporter_profile?.email || 'Unknown';
  
  // Note: These counts are currently placeholders or would come from a join/view
  // For now we check if we have the properties, otherwise don't show badges or show 0
  const attachmentCount = bug.bug_attachments ? bug.bug_attachments[0]?.count : 0;
  const commentCount = bug.bug_comments ? bug.bug_comments[0]?.count : 0;

  return (
    <Draggable draggableId={bug.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => onClick(bug)}
          className={cn(
            "bg-white p-3 rounded-lg shadow-sm border border-gray-100 mb-3 group cursor-pointer",
            "hover:shadow-md hover:scale-[1.02] transition-all duration-200",
            snapshot.isDragging && "shadow-xl ring-2 ring-blue-500/20 rotate-1 opacity-90 z-50"
          )}
          style={provided.draggableProps.style}
        >
          <div className="flex flex-col gap-2">
            <h4 className="font-semibold text-gray-900 text-sm leading-tight">
              {bug.title}
            </h4>
            
            <div className="flex items-center justify-between mt-1">
              <Badge 
                variant="outline" 
                className={cn("text-[10px] px-2 py-0 h-5 font-semibold border-0", getPriorityStyles(bug.priority))}
              >
                {bug.priority}
              </Badge>
              
              <div className="flex items-center gap-2">
                 {commentCount > 0 && (
                   <div className="flex items-center gap-1 text-[10px] text-gray-400">
                     <MessageSquare className="h-3 w-3" /> {commentCount}
                   </div>
                 )}
                 {attachmentCount > 0 && (
                   <div className="flex items-center gap-1 text-[10px] text-gray-400">
                     <Paperclip className="h-3 w-3" /> {attachmentCount}
                   </div>
                 )}
              </div>

              <div className="flex items-center gap-1.5 text-xs text-gray-500 max-w-[40%]">
                <User className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{reporterName}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </Draggable>
  );
};

export default BugCard;