import { useState, useEffect, useCallback } from 'react';
import * as ccApi from '@/lib/companycamService';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';

export const useCompanyCamProjects = () => {
  const [projects, setProjects] = useState([]);
  const [currentProject, setCurrentProject] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ search: '', status: 'all' });
  const { toast } = useToast();

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await ccApi.listProjects({ per_page: 50, status: 'active' });
      if (res.success) {
        let fetchedProjects = Array.isArray(res.data) ? res.data : (res.data?.projects || []);
        
        // Local filtering
        if (filters.search) {
          fetchedProjects = fetchedProjects.filter(p => 
            p.name.toLowerCase().includes(filters.search.toLowerCase()) || 
            (p.address?.street_address_1 || '').toLowerCase().includes(filters.search.toLowerCase())
          );
        }
        if (filters.status && filters.status !== 'all') {
          fetchedProjects = fetchedProjects.filter(p => p.status === filters.status);
        }

        // Map Supabase properties based on companycam_project_id
        try {
          const ccIds = fetchedProjects.map(p => String(p.id));
          if (ccIds.length > 0) {
            const { data: sbProjects, error: dbError } = await supabase
              .from('projects')
              .select('id, companycam_project_id, hubspot_contact_id')
              .in('companycam_project_id', ccIds);

            if (dbError) throw dbError;

            if (sbProjects && sbProjects.length > 0) {
              fetchedProjects = fetchedProjects.map(p => {
                const sbProj = sbProjects.find(sp => sp.companycam_project_id === String(p.id));
                if (sbProj) {
                  return {
                    ...p,
                    supabase_id: sbProj.id, // Store Supabase UUID separately
                    hubspot_contact_id: sbProj.hubspot_contact_id || p.hubspot_contact_id
                  };
                }
                return p;
              });
            }
          }
        } catch (dbErr) {
          console.error("[useCompanyCamProjects] Failed to map Supabase projects:", dbErr.message);
        }
        
        setProjects(fetchedProjects);
      } else {
        throw new Error(res.error || 'Failed to fetch projects');
      }
    } catch (err) {
      setError(err.message);
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setLoading(false);
    }
  }, [filters, toast]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const fetchProjectById = async (id) => {
    setLoading(true);
    setError(null);
    try {
      const res = await ccApi.getProject(id);
      if (res.success) {
        setCurrentProject(res.data);
        return res.data;
      } else {
        throw new Error(res.error || 'Failed to fetch project details');
      }
    } catch (err) {
      setError(err.message);
      toast({ variant: 'destructive', title: 'Error', description: err.message });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const createProject = async (data) => {
    setLoading(true);
    try {
      const res = await ccApi.createProject(data);
      if (res.success) {
        toast({ title: 'Success', description: 'Project created successfully' });
        await fetchProjects();
        return res.data;
      } else {
        throw new Error(res.error || 'Failed to create project');
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const updateProject = async (id, data) => {
    setLoading(true);
    try {
      const res = await ccApi.updateProject(id, data);
      if (res.success) {
        toast({ title: 'Success', description: 'Project updated successfully' });
        await fetchProjects();
        if (currentProject?.id === id) {
           setCurrentProject(res.data);
        }
        return res.data;
      } else {
        throw new Error(res.error || 'Failed to update project');
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const deleteProject = async (id) => {
    setLoading(true);
    try {
      const res = await ccApi.deleteProject(id);
      if (res.success) {
        toast({ title: 'Success', description: 'Project deleted successfully' });
        await fetchProjects();
        return true;
      } else {
        throw new Error(res.error || 'Failed to delete project');
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    projects,
    currentProject,
    loading,
    error,
    filters,
    setFilters,
    fetchProjects,
    fetchProjectById,
    createProject,
    updateProject,
    deleteProject
  };
};