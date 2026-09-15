import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import MediaGrid from '@/components/media/MediaGrid';
import { ArrowLeft, Calendar, User, AlertCircle, Layers } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

const SharedGalleryPage = () => {
  const { shareId } = useParams();
  const [gallery, setGallery] = useState(null);
  const [creator, setCreator] = useState(null);
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchGalleryData = async () => {
      try {
        setLoading(true);
        setError(null);

        let galleryData = null;
        
        // 1. Try finding by SLUG first (this is the new custom link system)
        const { data: slugData, error: slugError } = await supabase
          .from('shared_galleries')
          .select('*')
          .eq('slug', shareId)
          .maybeSingle();

        if (slugData) {
          galleryData = slugData;
        }

        // 2. If not found by slug, and it looks like a UUID, try finding by ID (legacy support)
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(shareId);
        if (!galleryData && isUuid) {
           const { data: idData, error: idError } = await supabase
             .from('shared_galleries')
             .select('*')
             .eq('id', shareId)
             .maybeSingle();
             
           if (idData) galleryData = idData;
        }

        if (!galleryData) {
           throw new Error('Gallery not found or link is invalid');
        }

        // Check expiration (only if expires_at is set)
        if (galleryData.expires_at && new Date(galleryData.expires_at) < new Date()) {
          throw new Error('This gallery link has expired');
        }

        setGallery(galleryData);

        // 3. Fetch Creator Profile Separately
        if (galleryData.created_by) {
           const { data: profileData } = await supabase
             .from('profiles')
             .select('full_name, initials')
             .eq('id', galleryData.created_by)
             .single();
           setCreator(profileData);
        }

        // 4. Fetch Media Items
        if (galleryData.media_ids && galleryData.media_ids.length > 0) {
          const { data: mediaData, error: mediaError } = await supabase
            .from('media')
            .select(`
              *,
              uploaded_by_profile:profiles!uploaded_by(full_name, initials),
              media_tags(tag_id, tags(name))
            `)
            .in('id', galleryData.media_ids)
            .order('created_at', { ascending: false });
            
          if (mediaError) throw mediaError;
          setMedia(mediaData || []);
        } else {
          setMedia([]);
        }

      } catch (err) {
        console.error('Error fetching gallery:', err);
        setError(err.message || 'Failed to load gallery');
      } finally {
        setLoading(false);
      }
    };

    if (shareId) {
      fetchGalleryData();
    }
  }, [shareId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-gray-100 dark:border-gray-700">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Access Denied</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-8">{error}</p>
          <Link to="/">
            <Button className="w-full">
              Return to Home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Helmet>
        <title>{gallery?.title || 'Shared Gallery'} - Novakleen</title>
      </Helmet>

      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
             {/* Logo or Brand */}
             <div className="flex items-center gap-2">
                <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <Layers className="h-5 w-5 text-white" />
                </div>
                <span className="font-bold text-xl text-gray-900 dark:text-white hidden sm:block">Novakleen</span>
             </div>
             <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-2 hidden sm:block"></div>
             <h1 className="text-lg font-medium text-gray-900 dark:text-white truncate max-w-[200px] sm:max-w-md">
               {gallery?.title || 'Shared Gallery'}
             </h1>
          </div>
          
          <div className="flex items-center gap-4">
             {creator && (
               <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                 <span className="hidden sm:inline">Shared by</span>
                 <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 pl-1 pr-3 py-1 rounded-full">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-[10px]">
                        {creator.initials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {creator.full_name}
                    </span>
                 </div>
               </div>
             )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-gray-500 dark:text-gray-400 text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Shared on {new Date(gallery?.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
             {media.length} items
          </div>
        </div>

        <MediaGrid 
          media={media} 
          readOnly={true} 
          selectable={false}
        />

        <div className="mt-12 text-center">
          <p className="text-sm text-gray-400">
            Powered by Novakleen Project Management
          </p>
        </div>
      </main>
    </div>
  );
};

export default SharedGalleryPage;