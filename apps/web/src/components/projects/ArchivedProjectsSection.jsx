import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Archive, Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import ProjectCard from '@/components/projects/ProjectCard';

const ArchivedProjectsSection = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const { toast } = useToast();

  const fetchArchivedProjects = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from('projects')
        .select(`
          *,
          created_by_profile:profiles!created_by(full_name, initials),
          media(id, created_at, uploaded_by, file_url, file_type),
          project_members(user_id),
          project_tags(tag_id, tags(name))
        `)
        .eq('is_archived', true)
        .order('updated_at', { ascending: false });

      const { data, error } = await query;

      if (error) throw error;
      setProjects(data || []);
    } catch (error) {
      console.error('Error fetching archived projects:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load archived projects",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArchivedProjects();
  }, []);

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center bg-orange-50 dark:bg-orange-950/20 p-4 rounded-xl border border-orange-100 dark:border-orange-900/50">
        <div>
           <h2 className="text-lg font-semibold text-orange-900 dark:text-orange-200 flex items-center gap-2">
             <Archive className="h-5 w-5" />
             Archived Projects
           </h2>
           <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">
             These projects are hidden from the main dashboard. Restore them to continue working.
           </p>
        </div>
        
        <div className="relative w-full sm:w-64">
           <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-orange-400 h-4 w-4" />
           <Input
             placeholder="Search archives..."
             value={searchQuery}
             onChange={(e) => setSearchQuery(e.target.value)}
             className="pl-10 h-10 bg-white dark:bg-gray-900 border-orange-200 dark:border-orange-800 focus:ring-orange-500"
           />
        </div>
      </div>

      <div className="min-h-[200px]">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-2xl">
            <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-3">
               <Archive className="h-6 w-6 text-gray-400" />
            </div>
            <p className="text-gray-500 font-medium">No archived projects found</p>
            {searchQuery && <p className="text-sm text-gray-400 mt-1">Try a different search term</p>}
          </div>
        ) : (
          <motion.div
            layout
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
          >
            <AnimatePresence>
              {filteredProjects.map((project) => (
                <motion.div
                  key={project.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="opacity-75 hover:opacity-100 transition-opacity"
                >
                  <ProjectCard
                    project={project}
                    // Prevent navigation to details for archived projects if desired, 
                    // or let them view but read-only. 
                    // The instructions say "Prevent rendering the full project detail view", 
                    // so we might want to disable onClick or handle it in the detail page.
                    // We'll let them click, but DetailPage handles the lock.
                    onClick={() => {}} 
                    onRefresh={fetchArchivedProjects}
                    // Hide standard edit controls by not passing onEdit if we want strict read-only
                    onEdit={() => {}}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default ArchivedProjectsSection;