import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { Check, Eye, Search, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';

const PAGE_SIZE = 10;

const PortfolioPage = () => {
  const { toast } = useToast();
  // Manager Mode State
  const [managerProjects, setManagerProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [summaryStats, setSummaryStats] = useState({ projects: 0, photos: 0 });
  const listContainerRef = useRef(null);

  // Preview Mode State
  const [viewMode, setViewMode] = useState('edit'); // 'edit' or 'preview'
  const [previewProjects, setPreviewProjects] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  // --- Stats Fetching ---
  const fetchStats = async () => {
    try {
      const { count: projectCount } = await supabase
        .from('projects')
        .select('*', { count: 'exact', head: true })
        .eq('show_in_portfolio', true);

      const { count: mediaCount } = await supabase
        .from('media')
        .select('*', { count: 'exact', head: true })
        .eq('show_in_portfolio', true);
      
      setSummaryStats({
        projects: projectCount || 0,
        photos: mediaCount || 0
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  // --- Manager Data Fetching ---
  const fetchManagerProjects = async (pageIndex, search, shouldReset = false) => {
    try {
      if (shouldReset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      let queryBuilder = supabase
        .from('projects')
        .select(`
          *,
          media(id, file_url, file_type, show_in_portfolio)
        `)
        .order('updated_at', { ascending: false })
        .range(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE - 1);

      if (search) {
        queryBuilder = queryBuilder.ilike('name', `%${search}%`);
      }

      const { data, error } = await queryBuilder;

      if (error) throw error;
      
      const newProjects = data || [];
      const isMore = newProjects.length === PAGE_SIZE;
      setHasMore(isMore);
      
      setManagerProjects(prev => shouldReset ? newProjects : [...prev, ...newProjects]);
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load projects",
      });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // --- Preview Data Fetching ---
  const fetchPreviewProjects = async () => {
    setPreviewLoading(true);
    try {
      const { data, error } = await supabase
        .from('projects')
        .select(`
          *,
          media(id, file_url, file_type, show_in_portfolio)
        `)
        .eq('show_in_portfolio', true)
        .order('updated_at', { ascending: false }); // Fetch all or paginate if needed. Fetching all for preview for now.

      if (error) throw error;
      setPreviewProjects(data || []);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load preview",
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  // --- Effects ---

  // Initial Load & Stats
  useEffect(() => {
    fetchStats();
  }, []);

  // Handle Search Debounce & Manager List Updates
  useEffect(() => {
    if (viewMode === 'edit') {
      const timer = setTimeout(() => {
        setPage(0);
        fetchManagerProjects(0, searchTerm, true);
      }, 500); // 500ms debounce
      return () => clearTimeout(timer);
    }
  }, [searchTerm, viewMode]);

  // Handle Preview Mode Switch
  useEffect(() => {
    if (viewMode === 'preview') {
      fetchPreviewProjects();
    }
  }, [viewMode]);

  // Infinite Scroll Handler
  const handleScroll = useCallback(() => {
    if (listContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = listContainerRef.current;
      if (scrollTop + clientHeight >= scrollHeight - 50 && !loadingMore && hasMore && !loading) {
        const nextPage = page + 1;
        setPage(nextPage);
        fetchManagerProjects(nextPage, searchTerm, false);
      }
    }
  }, [loadingMore, hasMore, loading, page, searchTerm]);

  useEffect(() => {
    const el = listContainerRef.current;
    if (el) {
      el.addEventListener('scroll', handleScroll);
      return () => el.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);


  // --- Event Handlers ---

  const toggleProjectInPortfolio = async (project, checked) => {
    try {
      // Optimistic update
      setManagerProjects(prev => prev.map(p => 
        p.id === project.id ? { ...p, show_in_portfolio: checked } : p
      ));

      const { error } = await supabase
        .from('projects')
        .update({ show_in_portfolio: checked })
        .eq('id', project.id);

      if (error) throw error;
      
      // Update stats
      fetchStats();

    } catch (error) {
      toast({ variant: "destructive", title: "Update failed" });
      // Revert on error could be added here
    }
  };

  const toggleMediaInPortfolio = async (mediaId, projectId, checked) => {
    try {
      // Optimistic update
      setManagerProjects(prev => prev.map(p => {
         if (p.id !== projectId) return p;
         return {
            ...p,
            media: p.media.map(m => m.id === mediaId ? { ...m, show_in_portfolio: checked } : m)
         };
      }));

      const { error } = await supabase
        .from('media')
        .update({ show_in_portfolio: checked })
        .eq('id', mediaId);

      if (error) throw error;

      // Update stats
      fetchStats();
    } catch (error) {
       toast({ variant: "destructive", title: "Update failed" });
    }
  };

  return (
    <DashboardLayout>
      <Helmet>
        <title>Portfolio Manager - Novakleen</title>
      </Helmet>
      
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
           <div>
             <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Portfolio</h1>
             <p className="text-gray-500">Select projects and photos to showcase in your public portfolio.</p>
           </div>
           
           <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg shrink-0">
              <button 
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${viewMode === 'edit' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-900'}`}
                onClick={() => setViewMode('edit')}
              >
                Manager
              </button>
              <button 
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${viewMode === 'preview' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-900'}`}
                onClick={() => setViewMode('preview')}
              >
                Preview
              </button>
           </div>
        </div>

        {viewMode === 'edit' ? (
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Project Selection List */}
              <div className="space-y-4">
                 <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-lg flex items-center gap-2">
                       <Check className="h-4 w-4 text-blue-500" /> Select Projects
                    </h2>
                 </div>
                 
                 {/* Search Bar */}
                 <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <Input 
                       placeholder="Search projects..." 
                       value={searchTerm}
                       onChange={(e) => setSearchTerm(e.target.value)}
                       className="pl-9"
                    />
                 </div>

                 {/* Infinite Scroll List */}
                 <div 
                    ref={listContainerRef}
                    className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden h-[70vh] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700"
                 >
                    {loading && managerProjects.length === 0 ? (
                       <div className="flex flex-col items-center justify-center h-full text-gray-500">
                          <Loader2 className="h-8 w-8 animate-spin mb-2" />
                          <p>Loading projects...</p>
                       </div>
                    ) : managerProjects.length === 0 ? (
                       <div className="flex flex-col items-center justify-center h-full text-gray-500 p-8 text-center">
                          <p>No projects found matching "{searchTerm}".</p>
                       </div>
                    ) : (
                       <div className="divide-y divide-gray-100 dark:divide-gray-700">
                          {managerProjects.map(project => (
                             <div key={project.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                <div className="flex items-start gap-3">
                                   <Checkbox 
                                      checked={project.show_in_portfolio || false}
                                      onCheckedChange={(c) => toggleProjectInPortfolio(project, c)}
                                      className="mt-1"
                                   />
                                   <div className="flex-1">
                                      <h3 className="font-medium text-gray-900 dark:text-white">{project.name}</h3>
                                      <p className="text-sm text-gray-500">{project.address}</p>
                                      <div className="mt-2 text-xs text-gray-400">{project.media?.length} photos available</div>
                                   </div>
                                </div>
                                
                                {/* Show media selection if project is selected */}
                                {project.show_in_portfolio && (
                                   <div className="mt-4 pl-8 animate-in fade-in slide-in-from-top-2 duration-200">
                                      <p className="text-xs font-medium uppercase text-gray-400 mb-2">Select Photos to Display</p>
                                      <div className="grid grid-cols-4 gap-2">
                                         {project.media?.map(media => (
                                            <div key={media.id} className="relative group aspect-square">
                                               <img 
                                                  src={media.file_url} 
                                                  className={`w-full h-full object-cover rounded-md border-2 transition-all ${media.show_in_portfolio ? 'border-blue-500 opacity-100' : 'border-transparent opacity-50 grayscale'}`} 
                                                  alt=""
                                               />
                                               <div className="absolute top-1 right-1">
                                                  <Checkbox 
                                                     className="h-4 w-4 bg-white border-gray-300 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                                                     checked={media.show_in_portfolio || false}
                                                     onCheckedChange={(c) => toggleMediaInPortfolio(media.id, project.id, c)}
                                                  />
                                               </div>
                                            </div>
                                         ))}
                                         {(!project.media || project.media.length === 0) && (
                                            <div className="text-xs text-gray-400 italic col-span-4 bg-gray-50 dark:bg-gray-900 p-2 rounded">No photos uploaded yet</div>
                                         )}
                                      </div>
                                   </div>
                                )}
                             </div>
                          ))}
                          
                          {/* Loading indicator at bottom of list */}
                          {loadingMore && (
                             <div className="p-4 flex justify-center">
                                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                             </div>
                          )}
                          
                          {!hasMore && managerProjects.length > 0 && (
                             <div className="p-4 text-center text-xs text-gray-400">
                                End of list
                             </div>
                          )}
                       </div>
                    )}
                 </div>
              </div>
              
              {/* Summary / Stats */}
              <div className="space-y-4">
                 <h2 className="font-semibold text-lg">Portfolio Summary</h2>
                 <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-xl border border-blue-100 dark:border-blue-800">
                    <div className="grid grid-cols-2 gap-6 text-center">
                       <div>
                          <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{summaryStats.projects}</div>
                          <div className="text-sm text-blue-700 dark:text-blue-300">Projects Visible</div>
                       </div>
                       <div>
                          <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                             {summaryStats.photos}
                          </div>
                          <div className="text-sm text-blue-700 dark:text-blue-300">Photos Showcased</div>
                       </div>
                    </div>
                 </div>
                 
                 <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 text-center sticky top-6">
                    <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                       <Eye className="h-8 w-8 text-green-600 dark:text-green-400" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Your Portfolio is Ready</h3>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mt-2 mb-4">
                       Share your work with clients using your public portfolio link.
                    </p>
                    <Button className="w-full bg-blue-600 hover:bg-blue-700">Share Portfolio Link</Button>
                 </div>
              </div>
           </div>
        ) : (
           /* Preview Mode */
           <div className="bg-white dark:bg-gray-900 min-h-[500px] rounded-xl border border-gray-200 dark:border-gray-800 p-8">
              <div className="text-center mb-12">
                 <h2 className="text-3xl font-bold mb-2 text-gray-900 dark:text-white">Our Recent Work</h2>
                 <p className="text-gray-500">Selected highlights from our cleaning projects</p>
              </div>
              
              {previewLoading ? (
                 <div className="flex justify-center p-12">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                 </div>
              ) : (
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {previewProjects.length === 0 ? (
                       <div className="col-span-full text-center text-gray-400 py-12">No projects visible in portfolio yet.</div>
                    ) : previewProjects.map(project => {
                       const showcaseMedia = project.media?.filter(m => m.show_in_portfolio);
                       if (!showcaseMedia || showcaseMedia.length === 0) return null;
                       
                       return (
                          <div key={project.id} className="group cursor-pointer">
                             <div className="aspect-[4/3] rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 mb-4 relative shadow-sm">
                                <img src={showcaseMedia[0].file_url} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" alt="" />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                                <div className="absolute bottom-3 right-3 bg-black/60 text-white text-xs px-2 py-1 rounded-md">
                                   {showcaseMedia.length} Photos
                                </div>
                             </div>
                             <h3 className="font-bold text-lg mb-1 text-gray-900 dark:text-white">{project.name}</h3>
                             <p className="text-sm text-gray-500">{project.address}</p>
                          </div>
                       )
                    })}
                 </div>
              )}
           </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default PortfolioPage;