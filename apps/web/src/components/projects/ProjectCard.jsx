import React, { useState } from 'react';
import { Star, Image as ImageIcon, Play, MapPin, Calendar, Camera, User, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import ProjectCardMenu from './ProjectCardMenu';
import QuickPhotoUpload from './QuickPhotoUpload';
import ContactAssignmentDialog from './ContactAssignmentDialog';
import { motion } from 'framer-motion';

// Utility format function
const formatDateTime = (dateString) => {
  if (!dateString) return '';
  const d = new Date(dateString);
  return d.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric'
  });
};

const ProjectCard = ({ project, onClick, onToggleStar, onEdit, onDelete, onRefresh }) => {
  const [showQuickUpload, setShowQuickUpload] = useState(false);
  const [showContactDialog, setShowContactDialog] = useState(false);
  const [uploadMode, setUploadMode] = useState('simple');

  // Sort media by most recent first
  const recentMedia = project.media
    ? [...project.media].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    : [];
    
  const mainThumbnail = recentMedia.length > 0 ? recentMedia[0] : null;
  const thumbnailGrid = recentMedia.slice(0, 4);

  // Extract contact ID if it's formatted in the name as [ID]
  const nameMatch = project?.name?.match(/\[(.*?)\]/);
  const extractedId = nameMatch ? nameMatch[1] : null;
  const contactId = project.hubspot_contact_id || extractedId;
  const displayName = project.name.replace(/\s*\[.*?\]$/, '').trim();

  return (
    <>
      <motion.div
        whileHover={{ y: -6, scale: 1.01 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="group relative bg-white dark:bg-gray-900 rounded-2xl shadow-sm hover:shadow-2xl hover:shadow-gray-200/50 dark:hover:shadow-black/60 border border-gray-100 dark:border-gray-800 overflow-hidden cursor-pointer flex flex-col h-full"
        onClick={onClick}
      >
        {/* Thumbnail Area */}
        <div className="relative h-56 bg-gray-100 dark:bg-gray-800 overflow-hidden">
          {mainThumbnail ? (
            mainThumbnail.file_type === 'video' ? (
              <>
                 <video src={mainThumbnail.file_url} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" muted loop playsInline />
                 <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-12 w-12 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center border border-white/40 shadow-xl group-hover:scale-110 transition-transform">
                      <Play className="h-5 w-5 text-white fill-white ml-1" />
                    </div>
                 </div>
              </>
            ) : (
              <img 
                src={mainThumbnail.file_url} 
                alt="Project Thumbnail" 
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
                loading="lazy"
              />
            )
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 bg-gray-50 dark:bg-gray-800/50 pattern-grid-lg">
              <div className="h-14 w-14 rounded-full bg-white dark:bg-gray-700 shadow-sm flex items-center justify-center mb-3">
                <ImageIcon className="h-7 w-7 opacity-40 text-gray-500" />
              </div>
              <span className="text-sm font-medium opacity-60">No Media</span>
            </div>
          )}
          
          {/* Overlay Gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80" />
          
          {/* Top Right Actions */}
          <div className="absolute top-3 right-3 flex gap-2 z-20">
               <ProjectCardMenu 
                 project={project}
                 onView={onClick}
                 onEdit={onEdit}
                 onDelete={onDelete}
               />
          </div>

          {/* Floating Star */}
          {project.is_starred && (
            <div className="absolute top-3 left-3 z-20">
              <div className="bg-yellow-400 text-yellow-900 p-2 rounded-full shadow-lg backdrop-blur-md ring-2 ring-white/20">
                <Star className="h-4 w-4 fill-current" />
              </div>
            </div>
          )}
          
          {/* Camera Button */}
          <div className="absolute bottom-4 right-4 z-20 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0">
             <Button
               variant="secondary"
               size="icon"
               className="h-10 w-10 rounded-full bg-white/20 hover:bg-white/40 backdrop-blur-md border border-white/30 text-white shadow-lg"
               onClick={(e) => {
                 e.stopPropagation();
                 setUploadMode('advanced');
                 setShowQuickUpload(true);
               }}
               title="Quick Photo Capture"
             >
                <Camera className="h-5 w-5" />
             </Button>
          </div>
          
          {/* Bottom Info on Image */}
          <div className="absolute bottom-4 left-4 right-16 z-10 text-white">
             <h3 className="font-bold text-lg line-clamp-1 text-white mb-1 drop-shadow-sm leading-tight">
               {displayName}
             </h3>
             <div className="flex items-center gap-1.5 text-gray-200 text-xs font-medium">
                <MapPin className="h-3.5 w-3.5" />
                <span className="truncate">{project.address || project.address?.street_address_1 || 'No location set'}</span>
             </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-5 flex flex-col flex-1 relative bg-white dark:bg-gray-900">
           
           {/* HubSpot Contact Display / Assignment */}
           <div className="mb-4 flex items-center justify-between">
              {contactId ? (
                <Badge variant="secondary" className="bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 flex items-center gap-1.5 py-1 px-2.5 hover:bg-blue-100">
                  <User className="h-3.5 w-3.5" />
                  <span className="max-w-[120px] truncate" title={contactId}>
                    ID: {contactId}
                  </span>
                </Badge>
              ) : (
                <div className="text-xs text-gray-400 italic">No contact assigned</div>
              )}
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 px-2 text-xs gap-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                onClick={(e) => {
                   e.stopPropagation();
                   setShowContactDialog(true);
                }}
              >
                <UserPlus className="h-3.5 w-3.5" />
                {contactId ? 'Change' : 'Assign'}
              </Button>
           </div>

           {/* Tags */}
           <div className="flex flex-wrap gap-2 mb-4">
              {project.project_tags && project.project_tags.length > 0 ? (
                 project.project_tags.slice(0, 3).map((pt, idx) => (
                   <Badge key={idx} variant="secondary" className="font-normal text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200">
                     {pt.tags?.name || pt}
                   </Badge>
                 ))
              ) : (
                 <span className="text-xs text-gray-400 italic py-0.5">No tags added</span>
              )}
              {project.project_tags && project.project_tags.length > 3 && (
                 <Badge variant="outline" className="text-[10px] h-5 px-1.5">+{project.project_tags.length - 3}</Badge>
              )}
           </div>
           
           {/* Thumbnail Grid */}
           {thumbnailGrid.length > 0 && (
             <div className="grid grid-cols-4 gap-2 mt-auto mb-4">
               {thumbnailGrid.map((media, idx) => (
                 <div key={media.id || idx} className="aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 relative ring-1 ring-black/5 dark:ring-white/10">
                    {media.file_type === 'video' ? (
                       <video src={media.file_url} className="w-full h-full object-cover opacity-80" />
                    ) : (
                       <img src={media.file_url || media.uri} className="w-full h-full object-cover hover:scale-110 transition-transform duration-300" alt="" />
                    )}
                 </div>
               ))}
               {recentMedia.length > 4 && (
                 <div className="aspect-square rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-xs text-gray-500 font-bold border border-dashed border-gray-200 dark:border-gray-700">
                   +{recentMedia.length - 4}
                 </div>
               )}
             </div>
           )}

           <div className={`pt-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs text-gray-400 font-medium ${thumbnailGrid.length === 0 ? 'mt-auto' : ''}`}>
              <span className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-800/50 px-2 py-1 rounded-md">
                <Calendar className="h-3.5 w-3.5" />
                {formatDateTime(project.updated_at || project.created_at)}
              </span>
              <div className="flex items-center gap-1.5 text-gray-500">
                <ImageIcon className="h-3.5 w-3.5" />
                {project.media?.length || 0}
              </div>
           </div>
        </div>
      </motion.div>

      <QuickPhotoUpload
        projectId={project.supabase_id || project.id}
        open={showQuickUpload}
        onOpenChange={setShowQuickUpload}
        onSuccess={onRefresh}
        initialMode={uploadMode}
      />

      <ContactAssignmentDialog
        project={project}
        open={showContactDialog}
        onOpenChange={setShowContactDialog}
        onSuccess={onRefresh}
      />
    </>
  );
};

export default ProjectCard;