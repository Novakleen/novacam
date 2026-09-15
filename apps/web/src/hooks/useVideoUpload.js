import { useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { generateVideoThumbnail, getVideoDuration } from '@/lib/mediaUtils';
import { useToast } from '@/components/ui/use-toast';

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const MAX_DURATION = 600; // 10 minutes in seconds

export const useVideoUpload = (projectId, userId) => {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  const validateVideo = async (file) => {
    if (!file.type.startsWith('video/')) {
      throw new Error('Invalid file type. Please upload a video file.');
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      throw new Error('File size exceeds 500MB limit.');
    }

    // Check duration
    try {
      const duration = await getVideoDuration(file);
      if (duration > MAX_DURATION) {
        throw new Error('Video duration exceeds 10 minute limit.');
      }
      return duration;
    } catch (err) {
      throw new Error(err.message || 'Failed to validate video duration.');
    }
  };

  const uploadVideo = async (file, onComplete) => {
    setUploading(true);
    setProgress(0);
    setError(null);

    try {
      // 1. Validate
      const duration = await validateVideo(file);

      // 2. Generate Thumbnail
      const thumbnailData = await generateVideoThumbnail(file);
      const thumbnailBlob = thumbnailData?.blob;

      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(7);
      const fileExt = file.name.split('.').pop();
      
      const videoPath = `${projectId}/${timestamp}-${randomStr}.${fileExt}`;
      const thumbnailPath = `${projectId}/${timestamp}-${randomStr}-thumb.jpg`;

      // 3. Upload Video
      // Note: Supabase JS client standard upload doesn't give granular progress for single file easily 
      // without TUS, but we'll simulate progress steps for UX
      setProgress(10);
      
      const { error: videoError } = await supabase.storage
        .from('project-media')
        .upload(videoPath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (videoError) throw videoError;
      setProgress(60);

      // 4. Upload Thumbnail
      let publicThumbnailUrl = null;
      if (thumbnailBlob) {
        const { error: thumbError } = await supabase.storage
          .from('project-media')
          .upload(thumbnailPath, thumbnailBlob, {
            contentType: 'image/jpeg',
            cacheControl: '3600'
          });
        
        if (!thumbError) {
          const { data: thumbUrlData } = supabase.storage
            .from('project-media')
            .getPublicUrl(thumbnailPath);
          publicThumbnailUrl = thumbUrlData.publicUrl;
        }
      }
      setProgress(80);

      // 5. Get Public Video URL
      const { data: videoUrlData } = supabase.storage
        .from('project-media')
        .getPublicUrl(videoPath);
      
      const publicVideoUrl = videoUrlData.publicUrl;

      // 6. Insert to DB
      const { data: mediaData, error: dbError } = await supabase
        .from('media')
        .insert({
          project_id: projectId,
          uploaded_by: userId,
          file_url: publicVideoUrl,
          thumbnail_url: publicThumbnailUrl || publicVideoUrl, // Fallback to video URL if thumb fails (not ideal but works for some players)
          file_type: 'video',
          description: file.name, // Initial description
          duration: Math.round(duration),
          size: file.size
        })
        .select()
        .single();

      if (dbError) throw dbError;

      setProgress(100);
      toast({
        title: "Success",
        description: "Video uploaded successfully."
      });

      if (onComplete) onComplete(mediaData);
      return mediaData;

    } catch (err) {
      console.error("Upload failed:", err);
      setError(err.message);
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: err.message
      });
      return null;
    } finally {
      setUploading(false);
    }
  };

  return {
    uploadVideo,
    uploading,
    progress,
    error,
    validateVideo
  };
};