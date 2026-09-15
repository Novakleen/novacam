import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { FolderPlus, Search, Building2, Calendar, Edit, Trash2, UserPlus, User, Users } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useCompanyCamProjects } from '@/hooks/useCompanyCamProjects';
import CompanyCamErrorBoundary from '@/components/CompanyCamErrorBoundary';
import CompanyCamLoadingOverlay from '@/components/CompanyCamLoadingOverlay';
import ProjectFormModal from '@/components/projects/ProjectFormModal';
import ContactAssignmentDialog from '@/components/projects/ContactAssignmentDialog';
import CompanyCamCustomerSyncTab from '@/components/companycam/CompanyCamCustomerSyncTab';

const CompanyCamManagerContent = () => {
  const navigate = useNavigate();
  const { 
    projects, loading, filters, setFilters, fetchProjects,
    createProject, updateProject, deleteProject 
  } = useCompanyCamProjects();

  const [formModalOpen, setFormModalOpen] = useState(false);
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);

  const handleOpenCreate = () => {
    setEditingProject(null);
    setFormModalOpen(true);
  };

  const handleOpenEdit = (e, project) => {
    e.stopPropagation();
    setEditingProject(project);
    setFormModalOpen(true);
  };

  const handleOpenDetails = (project) => {
    if (project?.supabase_id) {
      navigate(`/project/${project.supabase_id}`);
      return;
    }
    navigate(`/project-cc/${project.id}`);
  };

  const handleOpenAssignment = (e, project) => {
    e.stopPropagation();
    setSelectedProject(project);
    setAssignmentModalOpen(true);
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this project?')) {
      await deleteProject(id);
    }
  };

  const handleFormSubmit = async (data) => {
    if (editingProject) {
      await updateProject(editingProject.id, data);
    } else {
      await createProject(data);
    }
    setFormModalOpen(false);
  };

  return (
    <div className="flex flex-col gap-6 relative min-h-[500px]">
      <CompanyCamLoadingOverlay visible={loading} />

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">CompanyCam Integration</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Manage your CompanyCam projects, photos, and customers securely.</p>
        </div>
      </div>

      <Tabs defaultValue="projects" className="w-full">
        <TabsList className="mb-6 bg-gray-100 dark:bg-gray-800 p-1">
           <TabsTrigger value="projects" className="gap-2"><Building2 className="h-4 w-4" /> Projects</TabsTrigger>
           <TabsTrigger value="customers" className="gap-2"><Users className="h-4 w-4" /> Customers Sync</TabsTrigger>
        </TabsList>

        <TabsContent value="projects" className="space-y-6">
          <div className="flex justify-end">
            <Button onClick={handleOpenCreate} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
              <FolderPlus className="h-4 w-4" /> New Project
            </Button>
          </div>
          
          <Card className="bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm border-dashed">
            <CardContent className="p-4 flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input 
                  placeholder="Search projects by name or address..." 
                  className="pl-9 bg-white dark:bg-gray-800"
                  value={filters.search}
                  onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
                />
              </div>
              <Select value={filters.status} onValueChange={(v) => setFilters(f => ({ ...f, status: v }))}>
                <SelectTrigger className="w-[180px] bg-white dark:bg-gray-800">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {!loading && projects.length === 0 ? (
            <div className="text-center py-20 bg-white dark:bg-gray-900 rounded-3xl border border-dashed border-gray-200 dark:border-gray-800 shadow-sm">
              <Building2 className="h-16 w-16 mx-auto text-gray-300 mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No projects found</h3>
              <p className="text-gray-500 mb-6">Create your first CompanyCam project to get started.</p>
              <Button onClick={handleOpenCreate}>Create Project</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {projects.map((project) => {
                const projectName = project.name || '';
                const nameMatch = projectName.match(/\[(.*?)\]/);
                const extractedId = nameMatch ? nameMatch[1] : null;
                const displayName = projectName.replace(/\s*\[.*?\]$/, '').trim() || 'Untitled Project';

                return (
                  <Card 
                    key={project.id} 
                    className="group cursor-pointer hover:shadow-lg transition-all hover:border-primary/30 flex flex-col h-full bg-white dark:bg-gray-900"
                    onClick={() => handleOpenDetails(project)}
                  >
                    <CardContent className="p-6 flex flex-col flex-1">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex-1 pr-4">
                          <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate" title={displayName}>
                            {displayName}
                          </h3>
                          <p className="text-sm text-gray-500 mt-1 truncate">
                            {project.address?.street_address_1 || 'No address provided'}
                          </p>
                        </div>
                        <Badge variant={project.status === 'active' ? 'default' : 'secondary'} className="capitalize">
                          {project.status}
                        </Badge>
                      </div>

                      <div className="mb-4 flex items-center justify-between">
                        {extractedId ? (
                          <Badge variant="secondary" className="bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 flex items-center gap-1.5 py-1 px-2.5 hover:bg-blue-100">
                            <User className="h-3.5 w-3.5" />
                            <span className="max-w-[120px] truncate" title={extractedId}>
                              ID: {extractedId}
                            </span>
                          </Badge>
                        ) : (
                          <div className="text-xs text-gray-400 italic">No contact assigned</div>
                        )}
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 px-2 text-xs gap-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          onClick={(e) => handleOpenAssignment(e, project)}
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                          {extractedId ? 'Change' : 'Assign'}
                        </Button>
                      </div>

                      <div className="flex items-center text-xs text-gray-500 mb-6 mt-auto">
                        <Calendar className="h-3 w-3 mr-1" />
                        {project.created_at ? new Date(project.created_at * 1000).toLocaleDateString() : 'Unknown date'}
                      </div>

                      <div className="flex justify-between items-center pt-4 border-t border-gray-100 dark:border-gray-800">
                        <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">CompanyCam API</span>
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-500 hover:text-blue-600 hover:bg-blue-50" onClick={(e) => handleOpenEdit(e, project)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-500 hover:text-red-600 hover:bg-red-50" onClick={(e) => handleDelete(e, project.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="customers">
           <CompanyCamCustomerSyncTab />
        </TabsContent>
      </Tabs>

      <ProjectFormModal 
        isOpen={formModalOpen} 
        onClose={() => setFormModalOpen(false)} 
        initialData={editingProject}
        onSubmit={handleFormSubmit}
        loading={loading}
      />

      {selectedProject && (
        <ContactAssignmentDialog
          project={selectedProject}
          open={assignmentModalOpen}
          onOpenChange={setAssignmentModalOpen}
          onSuccess={() => {
             setAssignmentModalOpen(false);
             fetchProjects();
          }}
        />
      )}
    </div>
  );
};

const CompanyCamManagerPage = () => {
  return (
    <DashboardLayout>
      <Helmet>
        <title>CompanyCam Integration | Novakleen</title>
      </Helmet>
      <CompanyCamErrorBoundary>
        <CompanyCamManagerContent />
      </CompanyCamErrorBoundary>
    </DashboardLayout>
  );
};

export default CompanyCamManagerPage;