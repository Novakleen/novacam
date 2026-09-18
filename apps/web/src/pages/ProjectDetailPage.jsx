import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Upload,
  Edit,
  Archive,
  Star,
  Tag,
  CheckSquare,
  X,
  Share2,
  MoreHorizontal,
  MapPin,
  Camera,
  ArrowLeftRight,
  Loader2,
  Lock,
  Phone,
  Mail,
  UploadCloud as CloudUpload,
  ClipboardList,
  PieChart,
  Image as ImageIcon,
  Plus,
  Pencil,
} from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import DashboardLayout from '@/components/layout/DashboardLayout';
import MediaGrid from '@/components/media/MediaGrid';
import MediaUpload from '@/components/media/MediaUpload';
import EditProjectDialog from '@/components/projects/EditProjectDialog';
import BeforeAfterEditor from '@/components/media/BeforeAfterEditor';
import BeforeAfterComparison from '@/components/media/BeforeAfterComparison';
import ProjectTagManager from '@/components/projects/ProjectTagManager';
import ShareGalleryDialog from '@/components/media/ShareGalleryDialog';
import UploadWatcher from '@/components/uploads/UploadWatcher';
import ContactAssignmentDialog from '@/components/projects/ContactAssignmentDialog';
import ProjectHubSpotAdminPanel from '@/components/hubspot/ProjectHubSpotAdminPanel';
import CommentsSection from '@/components/comments/CommentsSection';
import AdvancedPhotoUploadDialog from '@/components/capture/AdvancedPhotoUploadDialog';
import ProjectTimeSection from '@/components/time/ProjectTimeSection';
import ProjectSpraySection from '@/components/spray/ProjectSpraySection';
import ProjectExpenseSection from '@/components/expenses/ProjectExpenseSection';
import SuiviSidebarLinks from '@/components/suivi/SuiviSidebarLinks';
import ProjectMarginTab from '@/components/margins/ProjectMarginTab';
import { archiveProject } from '@/lib/projectUtils';
import { useAssignCustomer } from '@/hooks/useAssignCustomer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

const TAG_COLORS = [
  'bg-yellow-100 text-yellow-800 border-yellow-200',
  'bg-amber-100 text-amber-800 border-amber-200',
  'bg-orange-100 text-orange-800 border-orange-200',
  'bg-emerald-100 text-emerald-800 border-emerald-200',
  'bg-sky-100 text-sky-800 border-sky-200',
  'bg-blue-100 text-blue-800 border-blue-200',
  'bg-violet-100 text-violet-800 border-violet-200',
  'bg-rose-100 text-rose-800 border-rose-200',
  'bg-slate-100 text-slate-700 border-slate-200',
];

const tagColor = (name = '') => {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h + name.charCodeAt(i) * (i + 1)) % TAG_COLORS.length;
  return TAG_COLORS[h];
};

const SidebarCard = ({ title, action, children, className }) => (
  <div
    className={cn(
      'bg-white dark:bg-gray-900 rounded-xl border border-gray-200/80 dark:border-gray-800 p-4',
      className
    )}
  >
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
      {action}
    </div>
    {children}
  </div>
);

const ProjectDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadRole = async () => {
      if (!user?.id) {
        if (!cancelled) setIsAdmin(false);
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      if (!cancelled) setIsAdmin(data?.role === 'Admin');
    };
    loadRole();
    return () => { cancelled = true; };
  }, [user?.id]);

  const [project, setProject] = useState(null);
  const [media, setMedia] = useState([]);
  const [comparisons, setComparisons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [showAdvancedCapture, setShowAdvancedCapture] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showBeforeAfterEditor, setShowBeforeAfterEditor] = useState(false);
  const [showTagManager, setShowTagManager] = useState(false);
  const [activeTab, setActiveTab] = useState('photos');

  const [hubspotContact, setHubspotContact] = useState(null);
  const [showChangeContactDialog, setShowChangeContactDialog] = useState(false);
  const [showAssignConfirmDialog, setShowAssignConfirmDialog] = useState(false);

  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [showShareDialog, setShowShareDialog] = useState(false);

  const [showArchiveAlert, setShowArchiveAlert] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  const { assignAsCustomer, loading: assigningCustomer } = useAssignCustomer(
    project?.companycam_project_id || project?.id,
    hubspotContact?.id || hubspotContact?.hubspot_contact_id
  );

  useEffect(() => {
    if (id) {
      fetchProject();
      fetchMedia();
      fetchComparisons();
    }
  }, [id]);

  const fetchProject = async () => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select(
          `
          *,
          created_by_profile:profiles!created_by(full_name, initials),
          project_tags(tag_id, tags(name)),
          project_contacts(
             hubspot_contact_id, 
             contacts(
               id, 
               first_name, 
               last_name, 
               email, 
               phone, 
               hubspot_contact_id
             )
          )
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;

      // HubSpot→CC assignment upserts a shadow Novacam row; redirect to the real CC project.
      if (data.companycam_project_id) {
        navigate(`/project-cc/${data.companycam_project_id}`, { replace: true });
        return;
      }

      setProject(data);

      let resolvedContact = null;

      if (data.hubspot_contact_id && data.project_contacts?.length > 0) {
        const matchedLink = data.project_contacts.find(
          (pc) => pc.hubspot_contact_id === data.hubspot_contact_id
        );
        if (matchedLink && matchedLink.contacts) {
          resolvedContact = {
            ...matchedLink.contacts,
            firstname: matchedLink.contacts.first_name,
            lastname: matchedLink.contacts.last_name,
            id: matchedLink.contacts.hubspot_contact_id,
          };
        }
      }

      if (!resolvedContact && data.hubspot_contact_id) {
        const { data: directContact } = await supabase
          .from('contacts')
          .select('*')
          .eq('hubspot_contact_id', data.hubspot_contact_id)
          .maybeSingle();

        if (directContact) {
          resolvedContact = {
            ...directContact,
            firstname: directContact.first_name,
            lastname: directContact.last_name,
            id: directContact.hubspot_contact_id,
          };
        }
      }

      // Fallback: fields denormalized on the projects row (contacts table miss).
      if (!resolvedContact && (data.hubspot_contact_id || data.hubspot_contact_name)) {
        const nameParts = String(data.hubspot_contact_name || '')
          .trim()
          .split(/\s+/)
          .filter(Boolean);
        const firstname = nameParts[0] || '';
        const lastname = nameParts.slice(1).join(' ');
        resolvedContact = {
          id: data.hubspot_contact_id,
          hubspot_contact_id: data.hubspot_contact_id,
          first_name: firstname,
          last_name: lastname,
          firstname,
          lastname,
          email: data.hubspot_contact_email || null,
          name: data.hubspot_contact_name || null,
        };
      }

      setHubspotContact(resolvedContact);
    } catch (error) {
      console.error('Error fetching project:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load project details',
      });
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const fetchMedia = async () => {
    try {
      const { data, error } = await supabase
        .from('media')
        .select(
          `
          *,
          uploaded_by_profile:profiles!uploaded_by(full_name, initials),
          media_tags(tag_id, tags(name))
        `
        )
        .eq('project_id', id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMedia(data || []);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load media',
      });
    }
  };

  const fetchComparisons = async () => {
    try {
      const { data, error } = await supabase
        .from('before_after_comparisons')
        .select(
          `
                *,
                before_photo:media!before_photo_id(file_url),
                after_photo:media!after_photo_id(file_url)
            `
        )
        .eq('project_id', id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setComparisons(data || []);
    } catch (error) {
      console.error('Failed to load comparisons:', error);
    }
  };

  const handleDeleteComparison = async (comparisonId) => {
    if (!window.confirm('Are you sure you want to delete this comparison?')) return;

    try {
      const { error } = await supabase
        .from('before_after_comparisons')
        .delete()
        .eq('id', comparisonId);

      if (error) throw error;

      setComparisons((prev) => prev.filter((c) => c.id !== comparisonId));
      toast({
        title: 'Deleted',
        description: 'Comparison deleted successfully',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to delete comparison',
      });
    }
  };

  const handleToggleStar = async () => {
    try {
      const { error } = await supabase
        .from('projects')
        .update({ is_starred: !project.is_starred })
        .eq('id', id);

      if (error) throw error;

      setProject({ ...project, is_starred: !project.is_starred });
      toast({
        title: 'Success',
        description: project.is_starred ? 'Project unstarred' : 'Project starred',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update project',
      });
    }
  };

  const handleArchive = async () => {
    if (!user) return;

    setIsArchiving(true);
    try {
      const { success, error } = await archiveProject(id, true);

      if (success) {
        toast({
          title: 'Project Archived',
          description: 'Project has been moved to archived section.',
        });
        navigate('/dashboard');
      } else {
        throw new Error(error);
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Archive Failed',
        description: err.message || 'Could not archive project.',
      });
    } finally {
      setIsArchiving(false);
      setShowArchiveAlert(false);
    }
  };

  const handleToggleSelect = (mediaId) => {
    setSelectedIds((prev) => {
      if (prev.includes(mediaId)) {
        return prev.filter((item) => item !== mediaId);
      }
      return [...prev, mediaId];
    });
  };

  const toggleSelectionMode = () => {
    if (isSelectionMode) {
      setIsSelectionMode(false);
      setSelectedIds([]);
    } else {
      setIsSelectionMode(true);
    }
  };

  const selectAll = () => {
    if (selectedIds.length === media.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(media.map((m) => m.id));
    }
  };

  const openInGoogleMaps = () => {
    if (!project) return;

    let url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      project.full_address || project.address
    )}`;
    if (project.latitude && project.longitude) {
      url = `https://www.google.com/maps/search/?api=1&query=${project.latitude},${project.longitude}`;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleAssignAsCustomer = async () => {
    if (!hubspotContact) return;

    const contactName = `${hubspotContact.firstname || hubspotContact.first_name || ''} ${
      hubspotContact.lastname || hubspotContact.last_name || ''
    }`.trim();

    const result = await assignAsCustomer({
      contactName,
      email: hubspotContact.email,
      phone: hubspotContact.phone,
    });

    if (result.success) {
      toast({
        title: 'Customer Assigned',
        description: 'Customer successfully created in CompanyCam and assigned to the project.',
      });
      setShowAssignConfirmDialog(false);
    } else {
      toast({
        variant: 'destructive',
        title: 'Assignment Failed',
        description: result.error || 'Failed to assign customer to CompanyCam.',
      });
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        </div>
      </DashboardLayout>
    );
  }

  if (!project) return null;

  if (project.is_archived) {
    return (
      <DashboardLayout>
        <Helmet>
          <title>Archived Project - Novakleen</title>
        </Helmet>
        <div className="min-h-[50vh] flex flex-col items-center justify-center text-center p-6 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-200 dark:border-gray-700 mt-8">
          <div className="w-16 h-16 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mb-4">
            <Lock className="h-8 w-8 text-orange-600 dark:text-orange-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            This project has been archived
          </h1>
          <p className="text-gray-600 dark:text-gray-400 max-w-md mb-8">
            The project &quot;{project.name}&quot; is archived and cannot be edited. You can restore
            it from the Dashboard.
          </p>
          <Button onClick={() => navigate('/dashboard')} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const thumb =
    media.find((m) => m.file_type === 'image')?.thumbnail_url ||
    media.find((m) => m.file_type === 'image')?.file_url ||
    null;
  const tags = (project.project_tags || []).map((pt) => pt.tags?.name).filter(Boolean);
  const creator = project.created_by_profile;
  const creatorInitials =
    creator?.initials ||
    (creator?.full_name
      ? creator.full_name
          .split(' ')
          .map((w) => w[0])
          .join('')
          .slice(0, 2)
          .toUpperCase()
      : 'NK');
  const contactName = hubspotContact
    ? `${hubspotContact.firstname || hubspotContact.first_name || ''} ${
        hubspotContact.lastname || hubspotContact.last_name || ''
      }`.trim()
    : null;

  return (
    <DashboardLayout>
      <Helmet>
        <title>{project.name} - Novakleen</title>
        <meta name="description" content={`Project details for ${project.name}`} />
      </Helmet>

      <UploadWatcher projectId={id} onUploadComplete={fetchMedia} />

      <div className="max-w-[1400px] mx-auto pb-28 md:pb-10">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3 mb-6">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Projets
          </button>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleToggleStar}
              className="h-9 w-9 rounded-full"
              title="Favori"
            >
              <Star
                className={cn(
                  'h-4 w-4',
                  project.is_starred ? 'fill-yellow-400 text-yellow-400' : 'text-gray-500'
                )}
              />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex h-9 rounded-full text-gray-600 gap-1.5"
              onClick={toggleSelectionMode}
            >
              <Share2 className="h-4 w-4" />
              Partager
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="hidden md:inline-flex h-9 rounded-full text-gray-600 gap-1.5"
              onClick={() => setShowEdit(true)}
            >
              <Edit className="h-4 w-4" />
              Modifier
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={openInGoogleMaps}>
                  <MapPin className="mr-2 h-4 w-4" /> Voir sur la carte
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowTagManager(true)}>
                  <Tag className="mr-2 h-4 w-4" /> Gérer les tags
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowEdit(true)} className="md:hidden">
                  <Edit className="mr-2 h-4 w-4" /> Modifier
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setShowArchiveAlert(true)}
                  className="text-orange-600"
                >
                  <Archive className="mr-2 h-4 w-4" /> Archiver
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Project header */}
        <div className="flex gap-4 sm:gap-5 mb-6">
          <div className="h-20 w-20 sm:h-28 sm:w-28 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 shrink-0 ring-1 ring-black/5">
            {thumb ? (
              <img src={thumb} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-gray-300">
                <ImageIcon className="h-8 w-8" />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 pt-0.5">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white tracking-tight leading-tight">
              {project.name}
            </h1>
            <button
              type="button"
              onClick={openInGoogleMaps}
              className="mt-1 text-sm text-blue-600 hover:underline text-left line-clamp-2"
            >
              {project.full_address || project.address || '—'}
            </button>

            <div className="flex flex-wrap items-center gap-2 mt-3">
              <Badge className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800 text-[11px] font-semibold uppercase tracking-wide border px-2 py-0.5">
                Novacam
              </Badge>
              {tags.map((tag) => (
                <span
                  key={tag}
                  className={cn(
                    'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium',
                    tagColor(tag)
                  )}
                >
                  {tag}
                </span>
              ))}
              <button
                type="button"
                onClick={() => setShowTagManager(true)}
                className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                <Pencil className="h-3.5 w-3.5" />
                Tags
              </button>
            </div>
          </div>
        </div>

        {/* Body: main + sidebar */}
        <div className="flex flex-col xl:flex-row gap-6 xl:gap-8 items-start">
          {/* Main column */}
          <div className="flex-1 min-w-0 w-full">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <div className="border-b border-gray-200 dark:border-gray-800 mb-5">
                <TabsList className="bg-transparent h-auto p-0 gap-0 rounded-none w-full justify-start overflow-x-auto">
                  <TabsTrigger
                    value="photos"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-gray-900 dark:data-[state=active]:border-white data-[state=active]:bg-transparent data-[state=active]:shadow-none bg-transparent px-3 sm:px-4 py-2.5 text-sm font-medium text-gray-500 data-[state=active]:text-gray-900 dark:data-[state=active]:text-white gap-1.5"
                  >
                    Photos
                    <span className="text-gray-400 font-normal">({media.length})</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="suivi"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-gray-900 dark:data-[state=active]:border-white data-[state=active]:bg-transparent data-[state=active]:shadow-none bg-transparent px-3 sm:px-4 py-2.5 text-sm font-medium text-gray-500 data-[state=active]:text-gray-900 dark:data-[state=active]:text-white gap-1.5"
                  >
                    <ClipboardList className="h-3.5 w-3.5" />
                    {t('suivi.title')}
                  </TabsTrigger>
                  <TabsTrigger
                    value="marge"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-gray-900 dark:data-[state=active]:border-white data-[state=active]:bg-transparent data-[state=active]:shadow-none bg-transparent px-3 sm:px-4 py-2.5 text-sm font-medium text-gray-500 data-[state=active]:text-gray-900 dark:data-[state=active]:text-white gap-1.5"
                  >
                    <PieChart className="h-3.5 w-3.5" />
                    Marge
                  </TabsTrigger>
                  <TabsTrigger
                    value="beforeafter"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-gray-900 dark:data-[state=active]:border-white data-[state=active]:bg-transparent data-[state=active]:shadow-none bg-transparent px-3 sm:px-4 py-2.5 text-sm font-medium text-gray-500 data-[state=active]:text-gray-900 dark:data-[state=active]:text-white gap-1.5"
                  >
                    Avant / Après
                    {comparisons.length > 0 && (
                      <span className="text-gray-400 font-normal">({comparisons.length})</span>
                    )}
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="photos" className="mt-0 space-y-5 focus-visible:outline-none">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    onClick={() => setShowUpload(true)}
                    size="sm"
                    className="rounded-lg h-9 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Upload className="mr-1.5 h-4 w-4" />
                    Upload
                  </Button>
                  <Button
                    onClick={() => setShowAdvancedCapture(true)}
                    size="sm"
                    variant="outline"
                    className="rounded-lg h-9 bg-white dark:bg-gray-900"
                  >
                    <Camera className="mr-1.5 h-4 w-4" />
                    Capture
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowBeforeAfterEditor(true)}
                    className="rounded-lg h-9 bg-white dark:bg-gray-900"
                  >
                    <ArrowLeftRight className="mr-1.5 h-4 w-4" />
                    Avant/Après
                  </Button>
                  <Button
                    variant={isSelectionMode ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={toggleSelectionMode}
                    className="rounded-lg h-9 bg-white dark:bg-gray-900"
                  >
                    {isSelectionMode ? (
                      <X className="h-4 w-4 mr-1.5" />
                    ) : (
                      <CheckSquare className="h-4 w-4 mr-1.5" />
                    )}
                    {isSelectionMode ? 'Annuler' : 'Sélectionner'}
                  </Button>
                </div>

                <MediaGrid
                  media={media}
                  onRefresh={fetchMedia}
                  projectId={id}
                  selectable={isSelectionMode}
                  selectedIds={selectedIds}
                  onToggleSelect={handleToggleSelect}
                />
              </TabsContent>

              <TabsContent value="suivi" className="mt-0 space-y-6 focus-visible:outline-none">
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200/80 dark:border-gray-800 p-4 sm:p-5">
                  <ProjectTimeSection
                    projectId={id}
                    projectName={project?.name}
                    companycamProjectId={project?.companycam_project_id || null}
                  />
                </div>
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200/80 dark:border-gray-800 p-4 sm:p-5">
                  <ProjectSpraySection
                    projectId={id}
                    projectName={project?.name}
                    companycamProjectId={project?.companycam_project_id || null}
                  />
                </div>
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200/80 dark:border-gray-800 p-4 sm:p-5">
                  <ProjectExpenseSection
                    projectId={id}
                    projectName={project?.name}
                    companycamProjectId={project?.companycam_project_id || null}
                  />
                </div>
              </TabsContent>

              <TabsContent value="marge" className="mt-0 space-y-5 focus-visible:outline-none">
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200/80 dark:border-gray-800 p-4 sm:p-5">
                  <ProjectMarginTab
                    projectId={id}
                    companycamProjectId={project?.companycam_project_id || null}
                    projectName={project?.name || ''}
                    projectAddress={project?.full_address || project?.address || ''}
                    isAdmin={isAdmin}
                  />
                </div>
              </TabsContent>

              <TabsContent value="beforeafter" className="mt-0 space-y-5 focus-visible:outline-none">
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={() => setShowBeforeAfterEditor(true)}
                    className="rounded-lg h-9 bg-blue-600 hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
                    Créer
                  </Button>
                </div>
                {comparisons.length === 0 ? (
                  <div className="text-center py-16 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                    <ArrowLeftRight className="h-8 w-8 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-500">Aucune comparaison avant/après.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {comparisons.map((comp) => (
                      <BeforeAfterComparison
                        key={comp.id}
                        comparison={comp}
                        onDelete={handleDeleteComparison}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* Right sidebar */}
          <aside className="w-full xl:w-[300px] shrink-0 space-y-3 xl:sticky xl:top-20">
            {isAdmin && (
            <SidebarCard
              title="Client"
              action={
                <button
                  type="button"
                  onClick={() => setShowChangeContactDialog(true)}
                  className="h-7 w-7 rounded-full flex items-center justify-center text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                  title={hubspotContact ? 'Changer' : 'Assigner'}
                >
                  {hubspotContact ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-4 w-4" />}
                </button>
              }
            >
              {hubspotContact ? (
                <div className="space-y-2">
                  <p className="font-medium text-gray-900 dark:text-white text-[15px]">
                    {contactName || 'Client'}
                  </p>
                  {hubspotContact.email && (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{hubspotContact.email}</span>
                    </div>
                  )}
                  {hubspotContact.phone && (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      <span>{hubspotContact.phone}</span>
                    </div>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full mt-2 h-8 rounded-lg text-xs"
                    onClick={() => setShowAssignConfirmDialog(true)}
                    disabled={assigningCustomer}
                  >
                    {assigningCustomer ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <CloudUpload className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Assigner à CompanyCam
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-gray-400">Aucun client assigné.</p>
              )}
              <ProjectHubSpotAdminPanel
                key={`hs-inv-${project?.hubspot_contact_id || 'none'}-${project?.hubspot_invoice_id || 'none'}`}
                compact
                showContact={false}
                isAdmin={isAdmin}
                projectId={project?.id}
                companycamProjectId={project?.companycam_project_id || null}
                projectName={project?.name}
                projectAddress={project?.full_address || project?.address}
              />
            </SidebarCard>
            )}

            <SidebarCard title="Utilisateur">
              <div className="flex items-center gap-2.5">
                <span className="h-8 w-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                  {creatorInitials}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {creator?.full_name || '—'}
                  </p>
                  <p className="text-xs text-gray-400">Créateur</p>
                </div>
              </div>
            </SidebarCard>

            {(project.description || project.instructions) && (
              <SidebarCard title="Description">
                {project.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                    {project.description}
                  </p>
                )}
                {project.instructions && (
                  <div className={cn(project.description && 'mt-3 pt-3 border-t border-gray-100 dark:border-gray-800')}>
                    <p className="text-xs font-medium text-gray-400 mb-1">Instructions</p>
                    <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                      {project.instructions}
                    </p>
                  </div>
                )}
              </SidebarCard>
            )}

            {!project.description && !project.instructions && (
              <SidebarCard
                title="Description"
                action={
                  <button
                    type="button"
                    onClick={() => setShowEdit(true)}
                    className="h-7 w-7 rounded-full flex items-center justify-center text-blue-600 hover:bg-blue-50"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                }
              >
                <p className="text-sm text-gray-400">Aucune description.</p>
              </SidebarCard>
            )}

            <SidebarCard title={t('suivi.title')}>
              <SuiviSidebarLinks
                projectId={id}
                companycamProjectId={project?.companycam_project_id || null}
                onOpenSuivi={() => setActiveTab('suivi')}
              />
            </SidebarCard>

            <SidebarCard title="Conversation">
              <div className="-mx-1 max-h-[420px] overflow-hidden">
                <CommentsSection projectId={id} />
              </div>
            </SidebarCard>
          </aside>
        </div>

        <AnimatePresence>
          {isSelectionMode && activeTab === 'photos' && (
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="fixed bottom-4 left-4 right-4 md:left-1/2 md:right-auto md:-translate-x-1/2 z-40 bg-[#1a2634] text-white px-4 py-3 rounded-2xl shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-3 md:min-w-[400px]"
            >
              <div className="flex items-center justify-between w-full sm:w-auto gap-4">
                <div className="flex items-center gap-2">
                  <span className="bg-white/10 px-2 py-0.5 rounded text-sm font-bold">
                    {selectedIds.length}
                  </span>
                  <span className="text-sm font-medium">sélectionné(s)</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white/70 hover:text-white hover:bg-white/10 h-8"
                  onClick={selectAll}
                >
                  Tout
                </Button>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button
                  className="bg-blue-600 hover:bg-blue-500 text-white flex-1 sm:flex-none"
                  disabled={selectedIds.length === 0}
                  onClick={() => setShowShareDialog(true)}
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  Partager
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/10"
                  onClick={() => setIsSelectionMode(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {showUpload && (
        <MediaUpload
          projectId={id}
          onClose={() => setShowUpload(false)}
          onSuccess={() => {
            fetchMedia();
            setShowUpload(false);
          }}
        />
      )}

      {showAdvancedCapture && (
        <AdvancedPhotoUploadDialog
          open={showAdvancedCapture}
          onClose={() => setShowAdvancedCapture(false)}
          projectId={id}
          onSuccess={() => {
            fetchMedia();
          }}
        />
      )}

      {showEdit && (
        <EditProjectDialog
          project={project}
          open={showEdit}
          onOpenChange={setShowEdit}
          onSuccess={() => {
            fetchProject();
            setShowEdit(false);
          }}
        />
      )}

      {showTagManager && (
        <ProjectTagManager
          project={project}
          open={showTagManager}
          onOpenChange={setShowTagManager}
          onSuccess={() => fetchProject()}
        />
      )}

      {showBeforeAfterEditor && (
        <BeforeAfterEditor
          open={showBeforeAfterEditor}
          onClose={() => setShowBeforeAfterEditor(false)}
          projectId={id}
          projectMedia={media.filter((m) => m.file_type === 'image')}
          onSuccess={() => {
            fetchComparisons();
            fetchMedia();
          }}
        />
      )}

      <ShareGalleryDialog
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
        selectedMediaIds={selectedIds}
        onResetSelection={() => {
          setSelectedIds([]);
          setIsSelectionMode(false);
        }}
        defaultTitle={project.name}
      />

      <ContactAssignmentDialog
        project={project}
        open={showChangeContactDialog}
        onOpenChange={setShowChangeContactDialog}
        onSuccess={fetchProject}
      />

      <Dialog open={showAssignConfirmDialog} onOpenChange={setShowAssignConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assigner comme client CompanyCam</DialogTitle>
            <DialogDescription>
              Créer ce contact comme client dans CompanyCam et l&apos;assigner au projet courant ?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setShowAssignConfirmDialog(false)}
              disabled={assigningCustomer}
            >
              Annuler
            </Button>
            <Button
              onClick={handleAssignAsCustomer}
              disabled={assigningCustomer}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {assigningCustomer ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Assignation…
                </>
              ) : (
                'Confirmer'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showArchiveAlert} onOpenChange={setShowArchiveAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-orange-600">
              <Archive className="h-5 w-5" />
              Archiver le projet ?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Archiver{' '}
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  &quot;{project.name}&quot;
                </span>{' '}
                ?
              </p>
              <p className="text-sm">
                Le projet sera masqué de la liste principale. Vous pourrez le restaurer plus tard.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isArchiving}>Annuler</AlertDialogCancel>
            <Button
              onClick={handleArchive}
              disabled={isArchiving}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              {isArchiving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Archivage…
                </>
              ) : (
                'Archiver'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default ProjectDetailPage;
