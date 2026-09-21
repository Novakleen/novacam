import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { MapContainer, TileLayer, Marker, Popup, useMap, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, List, Map as MapIcon, Navigation, Filter, Image as ImageIcon } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

// Fix Leaflet icons
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Custom Marker Creator
const createCustomIcon = (count, isSelected) => {
  const size = isSelected ? 48 : 40;
  return L.divIcon({
    className: 'custom-marker-pin',
    html: `
      <div class="relative w-full h-full group cursor-pointer">
        <div class="absolute inset-0 bg-blue-600 rounded-full shadow-lg opacity-20 ${isSelected ? 'animate-ping' : 'hidden'}"></div>
        <div class="relative w-full h-full bg-white dark:bg-gray-800 rounded-full border-[3px] ${isSelected ? 'border-blue-600 scale-110' : 'border-white dark:border-gray-700'} shadow-xl flex items-center justify-center overflow-hidden transition-all duration-300">
           ${count > 0 
             ? `<div class="bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-bold text-sm w-full h-full flex items-center justify-center">${count}</div>` 
             : `<div class="bg-gray-100 dark:bg-gray-700 w-full h-full flex items-center justify-center"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></div>`
           }
        </div>
        ${isSelected ? '<div class="absolute -bottom-2 left-1/2 -translate-x-1/2 w-3 h-3 bg-blue-600 rotate-45"></div>' : ''}
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size/2, size + 5], // Bottom center anchor
    popupAnchor: [0, -size - 10]
  });
};

const MapController = ({ selectedLocation, projects }) => {
  const map = useMap();
  
  // Fly to selected project
  useEffect(() => {
    if (selectedLocation) {
      map.flyTo([selectedLocation.lat, selectedLocation.lng], 15, {
        duration: 1.5,
        easeLinearity: 0.25
      });
    }
  }, [selectedLocation, map]);

  // Fit bounds on initial load
  useEffect(() => {
    if (projects.length > 0 && !selectedLocation) {
       const bounds = L.latLngBounds(projects.map(p => [p.lat, p.lng]));
       map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
    }
  }, [projects.length]);

  return null;
};

const ProjectCard = ({ project, onClick, compact = false }) => (
  <div 
    className={`
      bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 overflow-hidden cursor-pointer transition-all hover:shadow-lg
      ${compact ? 'rounded-xl flex h-24' : 'rounded-2xl flex flex-col'}
    `}
    onClick={onClick}
  >
     <div className={`relative bg-gray-200 dark:bg-gray-700 ${compact ? 'w-24 h-full shrink-0' : 'h-40 w-full'}`}>
        {project.media?.[0] ? (
          <img src={project.media[0].file_url} className="w-full h-full object-cover" alt={project.name} loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <ImageIcon className="h-8 w-8 opacity-50" />
          </div>
        )}
        <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-sm text-white text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
           <ImageIcon className="h-3 w-3" />
           {project.media?.length || 0}
        </div>
     </div>
     
     <div className="p-3 flex-1 flex flex-col justify-center min-w-0">
        <h3 className="font-bold text-gray-900 dark:text-white truncate text-base mb-0.5">{project.name}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-1 mb-2">{project.address}</p>
        
        {project.project_tags && project.project_tags.length > 0 && !compact && (
          <div className="flex flex-wrap gap-1 mt-auto">
             {project.project_tags.slice(0, 2).map((pt, i) => (
                <Badge key={i} variant="secondary" className="text-[10px] px-1.5 h-5 font-normal">
                   {pt.tags.name}
                </Badge>
             ))}
             {project.project_tags.length > 2 && (
                <Badge variant="outline" className="text-[10px] px-1.5 h-5 font-normal">+{project.project_tags.length - 2}</Badge>
             )}
          </div>
        )}
     </div>
  </div>
);

const MapPage = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [projects, setProjects] = useState([]);
  const [filteredProjects, setFilteredProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProject, setSelectedProject] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  
  // Mobile View State
  const [viewMode, setViewMode] = useState('map'); // 'map' | 'list'
  
  // Filters
  const [selectedTags, setSelectedTags] = useState([]);
  const [availableTags, setAvailableTags] = useState([]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    filterProjects();
  }, [projects, searchQuery, selectedTags]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const [projectsRes, tagsRes] = await Promise.all([
        supabase
          .from('projects')
          .select(`
            *,
            media(id, file_url, file_type),
            project_tags(tag_id, tags(name)),
            created_by_profile:profiles!created_by(full_name, initials)
          `)
          .order('updated_at', { ascending: false }),
        supabase.from('tags').select('*')
      ]);

      if (projectsRes.error) throw projectsRes.error;

      // Deterministic pseudo-random coords for demo
      const getPseudoRandomCoords = (id) => {
        const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        // Center around Brussels (50.8503, 4.3517)
        const lat = 50.8503 + (Math.sin(hash) * 0.15);
        const lng = 4.3517 + (Math.cos(hash) * 0.25);
        return { lat, lng };
      };
      
      const geocodedProjects = (projectsRes.data || []).map((project) => {
         const coords = getPseudoRandomCoords(project.id);
         return {
           ...project,
           lat: coords.lat,
           lng: coords.lng,
         };
      });

      setProjects(geocodedProjects);
      setAvailableTags(tagsRes.data || []);
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load map data",
      });
    } finally {
      setLoading(false);
    }
  };

  const filterProjects = () => {
    let filtered = [...projects];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(query) || 
        p.address.toLowerCase().includes(query)
      );
    }

    if (selectedTags.length > 0) {
      filtered = filtered.filter(p => 
        p.project_tags?.some(pt => selectedTags.includes(pt.tag_id))
      );
    }

    setFilteredProjects(filtered);
  };

  const handleProjectSelect = (project) => {
    setSelectedProject(project);
    if (window.innerWidth < 768) {
       setViewMode('map');
    }
  };

  return (
    <DashboardLayout fullWidth>
      <Helmet>
        <title>Map View - Novakleen</title>
      </Helmet>
      
      <div className="w-full h-[calc(100vh-64px)] flex flex-col md:flex-row bg-gray-50 dark:bg-gray-900">
        
        {/* Mobile Header: Search & Filters (Visible only on mobile) */}
        <div className="md:hidden flex flex-col gap-3 p-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 z-20 shadow-sm shrink-0">
           <div className="flex gap-2">
              <div className="relative flex-1">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                 <input 
                   type="text"
                   className="w-full pl-9 pr-4 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 border-none focus:ring-2 focus:ring-blue-500 text-sm"
                   placeholder="Search..."
                   value={searchQuery}
                   onChange={(e) => setSearchQuery(e.target.value)}
                 />
              </div>
              <Button 
                 size="icon" 
                 variant="outline"
                 className="h-10 w-10 shrink-0 bg-gray-100 dark:bg-gray-800 border-none"
                 onClick={() => setViewMode(viewMode === 'map' ? 'list' : 'map')}
              >
                 {viewMode === 'map' ? <List className="h-5 w-5" /> : <MapIcon className="h-5 w-5" />}
              </Button>
           </div>
           
           <div className="flex gap-2 overflow-x-auto no-scrollbar items-center">
              <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                     <Button 
                        variant="outline" 
                        size="sm" 
                        className={`h-8 rounded-full text-xs border-dashed ${selectedTags.length > 0 ? 'bg-blue-50 text-blue-700 border-blue-200 border-solid' : 'bg-transparent border-gray-300 dark:border-gray-700'}`}
                     >
                        <Filter className="h-3 w-3 mr-1.5" />
                        Filters {selectedTags.length > 0 && `(${selectedTags.length})`}
                     </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                     <DropdownMenuLabel>Filter by Tags</DropdownMenuLabel>
                     <DropdownMenuSeparator />
                     {availableTags.map(tag => (
                       <DropdownMenuCheckboxItem
                          key={tag.id}
                          checked={selectedTags.includes(tag.id)}
                          onCheckedChange={(checked) => {
                             setSelectedTags(prev => checked ? [...prev, tag.id] : prev.filter(id => id !== tag.id));
                          }}
                       >
                          {tag.name}
                       </DropdownMenuCheckboxItem>
                     ))}
                  </DropdownMenuContent>
              </DropdownMenu>
              
              {selectedTags.length > 0 && (
                 <Button
                   variant="ghost" 
                   size="sm"
                   onClick={() => setSelectedTags([])}
                   className="h-8 px-2 text-xs text-red-500 hover:text-red-600 hover:bg-red-50"
                 >
                   <X className="h-3 w-3 mr-1" /> Clear
                 </Button>
              )}
           </div>
        </div>

        {/* Desktop Sidebar (unchanged behavior) */}
        <div className="hidden md:flex w-[380px] xl:w-[420px] flex-col border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 z-10 shadow-xl">
           <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
              <h1 className="text-xl font-bold mb-4">Project Map</h1>
              <div className="space-y-3">
                 <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input 
                      className="w-full pl-9 h-11 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Search projects or locations..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                 </div>
                 
                 <div className="flex gap-2">
                    <DropdownMenu>
                       <DropdownMenuTrigger asChild>
                          <Button variant="outline" className={`flex-1 h-10 border-dashed ${selectedTags.length > 0 ? 'bg-blue-50 border-blue-200 text-blue-700 border-solid' : ''}`}>
                             <Filter className="h-3.5 w-3.5 mr-2" />
                             Tags {selectedTags.length > 0 && `(${selectedTags.length})`}
                          </Button>
                       </DropdownMenuTrigger>
                       <DropdownMenuContent align="start" className="w-56">
                          <DropdownMenuLabel>Filter by Tags</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {availableTags.map(tag => (
                             <DropdownMenuCheckboxItem
                                key={tag.id}
                                checked={selectedTags.includes(tag.id)}
                                onCheckedChange={(checked) => {
                                   setSelectedTags(prev => checked ? [...prev, tag.id] : prev.filter(id => id !== tag.id));
                                }}
                             >
                                {tag.name}
                             </DropdownMenuCheckboxItem>
                          ))}
                          {selectedTags.length > 0 && (
                             <>
                                <DropdownMenuSeparator />
                                <DropdownMenuCheckboxItem 
                                   checked={false} 
                                   onCheckedChange={() => setSelectedTags([])}
                                   className="text-red-500 focus:text-red-500"
                                >
                                   Reset Filters
                                </DropdownMenuCheckboxItem>
                             </>
                          )}
                       </DropdownMenuContent>
                    </DropdownMenu>
                    <div className="flex items-center px-3 text-xs text-gray-400 font-medium">
                       {filteredProjects.length} projects found
                    </div>
                 </div>
              </div>
           </div>
           
           <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
              {filteredProjects.map(project => (
                 <ProjectCard 
                    key={project.id} 
                    project={project} 
                    onClick={() => handleProjectSelect(project)}
                    compact 
                 />
              ))}
              {filteredProjects.length === 0 && (
                 <div className="text-center py-10 text-gray-400">
                    <MapIcon className="h-10 w-10 mx-auto mb-2 opacity-20" />
                    <p>No projects found</p>
                 </div>
              )}
           </div>
        </div>

        {/* Mobile List View (Conditional) */}
        <AnimatePresence>
           {viewMode === 'list' && (
              <motion.div 
                 initial={{ opacity: 0 }}
                 animate={{ opacity: 1 }}
                 exit={{ opacity: 0 }}
                 className="md:hidden flex-1 bg-gray-50 dark:bg-gray-900 z-10 overflow-y-auto p-4 pb-20"
              >
                 <div className="space-y-4">
                    <p className="text-sm text-gray-500 font-medium px-1">{filteredProjects.length} Projects</p>
                    {filteredProjects.map(project => (
                       <ProjectCard 
                          key={project.id} 
                          project={project} 
                          onClick={() => handleProjectSelect(project)} 
                       />
                    ))}
                 </div>
              </motion.div>
           )}
        </AnimatePresence>

        {/* Map Container */}
        <div className={`flex-1 relative z-0 h-full w-full ${viewMode === 'list' ? 'hidden md:block' : 'block'}`}>
           <MapContainer 
              center={[50.8503, 4.3517]} 
              zoom={12} 
              style={{ height: '100%', width: '100%' }}
              zoomControl={false}
              className="z-0"
           >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" 
              />
              <ZoomControl position="bottomright" />
              <MapController selectedLocation={selectedProject} projects={filteredProjects} />
              
              {filteredProjects.map((project) => (
                <Marker 
                  key={project.id} 
                  position={[project.lat, project.lng]}
                  icon={createCustomIcon(project.media?.length || 0, selectedProject?.id === project.id)}
                  eventHandlers={{
                    click: () => {
                       setSelectedProject(project);
                    },
                  }}
                >
                  {/* Only Render Popup on Desktop to avoid mobile duplication */}
                  {!isMobile && (
                      <Popup offset={[0, -20]} className="rounded-xl overflow-hidden border-0 shadow-2xl">
                          <div className="w-full max-w-[280px] p-0 m-0">
                             <div className="h-32 w-full bg-gray-200 relative">
                                {project.media?.[0] ? (
                                   <img src={project.media[0].file_url} className="w-full h-full object-cover" alt="" />
                                ) : (
                                   <div className="w-full h-full flex items-center justify-center text-gray-400">
                                      <ImageIcon className="h-8 w-8 opacity-40" />
                                   </div>
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                                <div className="absolute bottom-3 left-3 right-3 text-white">
                                   <h3 className="font-bold text-base truncate">{project.name}</h3>
                                </div>
                             </div>
                             <div className="p-4 bg-white dark:bg-gray-800">
                                <div className="flex items-start gap-2 mb-3">
                                   <Navigation className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                                   <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2">{project.address}</p>
                                </div>
                                <Button 
                                  className="w-full h-9 rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
                                  onClick={() => window.location.href = `/project/${project.id}`}
                                >
                                  View Details
                                </Button>
                             </div>
                          </div>
                      </Popup>
                  )}
                </Marker>
              ))}
           </MapContainer>
           
           {/* Mobile Bottom Sheet Card */}
           <AnimatePresence>
             {selectedProject && isMobile && viewMode === 'map' && (
                <motion.div 
                   initial={{ y: "100%" }}
                   animate={{ y: 0 }}
                   exit={{ y: "100%" }}
                   transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                   className="md:hidden absolute bottom-0 left-0 right-0 z-[1000] p-0 shadow-[0_-5px_20px_-5px_rgba(0,0,0,0.1)]"
                >
                   <div className="bg-white dark:bg-gray-800 rounded-t-2xl p-5 pb-8 relative border-t border-gray-100 dark:border-gray-700">
                      {/* Drag Handle Indicator */}
                      <div className="absolute top-2 left-1/2 -translate-x-1/2 w-12 h-1 bg-gray-200 dark:bg-gray-700 rounded-full" />
                      
                      <button 
                        onClick={() => setSelectedProject(null)}
                        className="absolute top-4 right-4 p-2 bg-gray-100 dark:bg-gray-700 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500"
                      >
                         <X className="h-4 w-4" />
                      </button>
                      
                      <div className="flex gap-4 mt-2">
                         <div className="h-20 w-20 rounded-xl bg-gray-200 shrink-0 overflow-hidden border border-gray-100 dark:border-gray-700">
                            {selectedProject.media?.[0] ? (
                               <img src={selectedProject.media[0].file_url} className="w-full h-full object-cover" alt="" />
                            ) : (
                               <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800">
                                  <ImageIcon className="h-6 w-6 text-gray-400" />
                               </div>
                            )}
                         </div>
                         <div className="flex-1 min-w-0 flex flex-col justify-center">
                            <h3 className="font-bold text-lg text-gray-900 dark:text-white truncate">{selectedProject.name}</h3>
                            <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 mb-3">
                                <Navigation className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{selectedProject.address}</span>
                            </div>
                            <Button 
                               size="sm"
                               className="w-full h-9 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
                               onClick={() => window.location.href = `/project/${selectedProject.id}`}
                            >
                               View Details
                            </Button>
                         </div>
                      </div>
                   </div>
                </motion.div>
             )}
           </AnimatePresence>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default MapPage;