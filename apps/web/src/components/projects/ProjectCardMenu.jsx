import React, { useState } from 'react';
import { MoreVertical, Edit, Eye, Archive, RotateCcw, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from '@/components/ui/use-toast';
import { useNavigate } from 'react-router-dom';
import { archiveProject } from '@/lib/projectUtils';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const ProjectCardMenu = ({ project, onEdit, onView, onRefresh }) => {
  const [showArchiveAlert, setShowArchiveAlert] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Defensive check
  if (!project) {
    return null;
  }

  const isArchived = project.is_archived;

  const handleArchiveToggle = async () => {
    if (!user) {
      toast({
        variant: "destructive",
        title: "Authentication Required",
        description: "You must be logged in to manage projects.",
      });
      return;
    }

    setIsProcessing(true);
    try {
      // If currently archived, we are unarchiving (false). If not, we are archiving (true).
      const newStatus = !isArchived;
      const { success, error } = await archiveProject(project.id, newStatus);

      if (success) {
        toast({
          title: newStatus ? "Project Archived" : "Project Restored",
          description: newStatus 
            ? "Project has been moved to the archived section." 
            : "Project has been restored to your active list.",
        });
        
        if (onRefresh) {
          onRefresh();
        } else {
          // If we are on detail page and archive it, go to dashboard
          if (newStatus) navigate('/dashboard');
        }
      } else {
        throw new Error(error);
      }
    } catch (err) {
      console.error("Archive toggle failed:", err);
      toast({
        variant: "destructive",
        title: isArchived ? "Restore Failed" : "Archive Failed",
        description: err.message || "Could not update project status. Please check your connection.",
      });
    } finally {
      setIsProcessing(false);
      setShowArchiveAlert(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 bg-black/20 hover:bg-black/40 text-white rounded-full backdrop-blur-sm border border-white/10 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="rounded-xl p-1 w-40">
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onView(); }} className="rounded-lg cursor-pointer">
            <Eye className="mr-2 h-4 w-4" /> View Details
          </DropdownMenuItem>
          
          {!isArchived && (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }} className="rounded-lg cursor-pointer">
              <Edit className="mr-2 h-4 w-4" /> Edit Project
            </DropdownMenuItem>
          )}
          
          <DropdownMenuSeparator />
          
          {isArchived ? (
            <DropdownMenuItem 
              onClick={(e) => { e.stopPropagation(); handleArchiveToggle(); }} 
              disabled={isProcessing}
              className="text-blue-600 focus:text-blue-600 focus:bg-blue-50 rounded-lg cursor-pointer"
            >
              {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
              Restore
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem 
              onClick={(e) => { e.stopPropagation(); setShowArchiveAlert(true); }} 
              className="text-orange-600 focus:text-orange-600 focus:bg-orange-50 rounded-lg cursor-pointer"
            >
              <Archive className="mr-2 h-4 w-4" /> Archive
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showArchiveAlert} onOpenChange={setShowArchiveAlert}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-orange-600">
              <AlertTriangle className="h-5 w-5" />
              Archive Project?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Are you sure you want to archive <span className="font-semibold text-gray-900 dark:text-gray-100">"{project?.name}"</span>?</p>
              <p className="text-sm">This project will be hidden from your main project list. You can restore it later from the Archived Projects section.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
            <Button 
              onClick={handleArchiveToggle}
              disabled={isProcessing}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Archiving...
                </>
              ) : (
                'Archive Project'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ProjectCardMenu;