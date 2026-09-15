import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Filter, ChevronDown, Layers, CheckSquare, Search, Share2, X
} from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import DashboardLayout from '@/components/layout/DashboardLayout';
import MediaGrid from '@/components/media/MediaGrid';
import ShareGalleryDialog from '@/components/media/ShareGalleryDialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

const PhotosPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [media, setMedia] = useState([]);
  const [filteredMedia, setFilteredMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Selection State
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [showShareDialog, setShowShareDialog] = useState(false);
  
  // Filter Data
  const [allProjects, setAllProjects] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [allTags, setAllTags] = useState([]);
  
  // Filter States
  const [filterProject, setFilterProject] = useState([]);
  const [filterUser, setFilterUser] = useState([]);
  const [filterTags, setFilterTags] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchData();
  }, [user]);

  useEffect(() => {
    applyFilters();
  }, [media, filterProject, filterUser, filterTags, searchQuery]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const [mediaRes, projectsRes, tagsRes] = await Promise.all([
        supabase
          .from('media')
          .select(`
            *,
            uploaded_by_profile:profiles!uploaded_by(full_name, initials, id),
            project:projects(id, name),
            media_tags(tag_id, tags(name))
          `)
          .order('created_at', { ascending: false }),
        supabase.from('projects').select('id, name'),
        supabase.from('tags').select('*')
      ]);

      if (mediaRes.error) throw mediaRes.error;
      
      const mediaData = mediaRes.data || [];
      setMedia(mediaData);
      setAllProjects(projectsRes.data || []);
      setAllTags(tagsRes.data || []);
      
      const uniqueUsers = [];
      const userIds = new Set();
      mediaData.forEach(m => {
         if (m.uploaded_by_profile && !userIds.has(m.uploaded_by_profile.id)) {
            userIds.add(m.uploaded_by_profile.id);
            uniqueUsers.push(m.uploaded_by_profile);
         }
      });
      setAllUsers(uniqueUsers);

    } catch (error) {
      console.error('Error fetching photos:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load photos",
      });
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let result = [...media];

    if (searchQuery) {
       const q = searchQuery.toLowerCase();
       result = result.filter(m => m.project?.name?.toLowerCase().includes(q));
    }

    if (filterProject.length > 0) {
       result = result.filter(m => filterProject.includes(m.project?.id));
    }

    if (filterUser.length > 0) {
       result = result.filter(m => filterUser.includes(m.uploaded_by));
    }

    if (filterTags.length > 0) {
       result = result.filter(m => 
          m.media_tags?.some(mt => filterTags.includes(mt.tag_id))
       );
    }

    setFilteredMedia(result);
  };

  const handleToggleSelect = (id) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(item => item !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const toggleSelectionMode = () => {
    if (isSelectionMode) {
      // Exiting mode
      setIsSelectionMode(false);
      setSelectedIds([]);
    } else {
      // Entering mode
      setIsSelectionMode(true);
    }
  };

  const selectAll = () => {
    if (selectedIds.length === filteredMedia.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredMedia.map(m => m.id));
    }
  };

  return (
    <DashboardLayout>
      <Helmet>
        <title>Photos - Novakleen</title>
        <meta name="description" content="View all project photos" />
      </Helmet>

      <div className="space-y-6 relative pb-20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
           <h1 className="text-3xl font-bold text-[#1a2634] dark:text-white">Photos</h1>
           <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input 
                  placeholder="Search by project name..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button 
                variant={isSelectionMode ? "secondary" : "outline"}
                onClick={toggleSelectionMode}
                className="shrink-0"
              >
                {isSelectionMode ? <X className="h-4 w-4 mr-2" /> : <CheckSquare className="h-4 w-4 mr-2" />}
                {isSelectionMode ? "Cancel" : "Select"}
              </Button>
           </div>
        </div>

        {/* Filters Bar */}
        <div className="flex flex-wrap gap-2 items-center bg-white dark:bg-gray-800 p-2 rounded-lg border border-gray-200 dark:border-gray-700">
          <span className="text-sm font-medium text-gray-500 ml-2 mr-2">Filters:</span>
          
          <DropdownMenu>
             <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className={`h-8 border-dashed ${filterProject.length > 0 ? 'bg-blue-50 border-blue-200 text-blue-700' : ''}`}>
                   Projects {filterProject.length > 0 && `(${filterProject.length})`} <ChevronDown className="ml-2 h-3 w-3" />
                </Button>
             </DropdownMenuTrigger>
             <DropdownMenuContent className="w-56 max-h-64 overflow-y-auto">
                <DropdownMenuLabel>Filter by Project</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {allProjects.map(p => (
                   <DropdownMenuCheckboxItem 
                      key={p.id} 
                      checked={filterProject.includes(p.id)}
                      onCheckedChange={(checked) => 
                         setFilterProject(prev => checked ? [...prev, p.id] : prev.filter(id => id !== p.id))
                      }
                   >
                      {p.name}
                   </DropdownMenuCheckboxItem>
                ))}
             </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
             <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className={`h-8 border-dashed ${filterUser.length > 0 ? 'bg-blue-50 border-blue-200 text-blue-700' : ''}`}>
                   Users {filterUser.length > 0 && `(${filterUser.length})`} <ChevronDown className="ml-2 h-3 w-3" />
                </Button>
             </DropdownMenuTrigger>
             <DropdownMenuContent className="w-56">
                <DropdownMenuLabel>Filter by User</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {allUsers.map(u => (
                   <DropdownMenuCheckboxItem 
                      key={u.id} 
                      checked={filterUser.includes(u.id)}
                      onCheckedChange={(checked) => 
                         setFilterUser(prev => checked ? [...prev, u.id] : prev.filter(id => id !== u.id))
                      }
                   >
                      {u.full_name}
                   </DropdownMenuCheckboxItem>
                ))}
             </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
             <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className={`h-8 border-dashed ${filterTags.length > 0 ? 'bg-blue-50 border-blue-200 text-blue-700' : ''}`}>
                   Tags {filterTags.length > 0 && `(${filterTags.length})`} <ChevronDown className="ml-2 h-3 w-3" />
                </Button>
             </DropdownMenuTrigger>
             <DropdownMenuContent className="w-56">
                <DropdownMenuLabel>Filter by Tag</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {allTags.map(t => (
                   <DropdownMenuCheckboxItem 
                      key={t.id} 
                      checked={filterTags.includes(t.id)}
                      onCheckedChange={(checked) => 
                         setFilterTags(prev => checked ? [...prev, t.id] : prev.filter(id => id !== t.id))
                      }
                   >
                      {t.name}
                   </DropdownMenuCheckboxItem>
                ))}
             </DropdownMenuContent>
          </DropdownMenu>

          {(filterProject.length > 0 || filterUser.length > 0 || filterTags.length > 0) && (
             <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 px-2 text-red-500 hover:text-red-600 hover:bg-red-50"
                onClick={() => {
                   setFilterProject([]);
                   setFilterUser([]);
                   setFilterTags([]);
                }}
             >
                Reset
             </Button>
          )}
        </div>

        {/* Media Grid */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
             {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="aspect-square bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
             ))}
          </div>
        ) : Object.entries(filteredMedia).length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 border-dashed">
            <div className="mx-auto w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center mb-4">
              <Layers className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">No photos found</h3>
            <p className="text-gray-500 dark:text-gray-400 mt-1">Try adjusting your filters.</p>
          </div>
        ) : (
          <MediaGrid 
            media={filteredMedia} 
            selectable={isSelectionMode}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
          />
        )}

        {/* Floating Selection Bar */}
        <AnimatePresence>
          {isSelectionMode && (
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[#1a2634] text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-6"
            >
              <div className="flex items-center gap-4 border-r border-gray-600 pr-4">
                <Button variant="ghost" className="text-white hover:bg-white/10" onClick={() => setIsSelectionMode(false)}>
                  <X className="h-5 w-5" />
                </Button>
                <span className="font-semibold">{selectedIds.length} Selected</span>
              </div>
              
              <div className="flex items-center gap-2">
                <Button 
                   variant="ghost" 
                   className="text-white hover:bg-white/10"
                   onClick={selectAll}
                >
                  Select All
                </Button>
                <Button 
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={selectedIds.length === 0}
                  onClick={() => setShowShareDialog(true)}
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  Share Gallery
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      <ShareGalleryDialog 
        open={showShareDialog} 
        onOpenChange={setShowShareDialog}
        selectedMediaIds={selectedIds}
        onResetSelection={() => {
           setSelectedIds([]);
           setIsSelectionMode(false);
        }}
        defaultTitle="Selected Photos"
      />
    </DashboardLayout>
  );
};

export default PhotosPage;