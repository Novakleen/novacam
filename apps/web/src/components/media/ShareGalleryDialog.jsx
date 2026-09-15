import React, { useState, useEffect } from 'react';
import { Copy, Check, Globe, Link as LinkIcon, ExternalLink, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';

const slugify = (text) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')     // Replace spaces with -
    .replace(/[^\w\-]+/g, '') // Remove all non-word chars
    .replace(/\-\-+/g, '-')   // Replace multiple - with single -
    .replace(/^-+/, '')       // Trim - from start of text
    .replace(/-+$/, '');      // Trim - from end of text
};

const ShareGalleryDialog = ({ open, onOpenChange, selectedMediaIds, onResetSelection, defaultTitle }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [copied, setCopied] = useState(false);
  
  // Form State
  const [title, setTitle] = useState('');
  const [customSlug, setCustomSlug] = useState('');
  const [isCustomizing, setIsCustomizing] = useState(true);

  useEffect(() => {
    if (open) {
      // Reset state on open
      const initialTitle = defaultTitle || `Shared Gallery - ${new Date().toLocaleDateString()}`;
      setTitle(initialTitle);
      setCustomSlug(`${slugify(initialTitle)}-${Math.random().toString(36).substring(2, 7)}`);
      setShareUrl('');
      setIsCustomizing(true);
    }
  }, [open, defaultTitle]);

  const generateLink = async () => {
    if (!customSlug.trim()) {
      toast({
        variant: "destructive",
        title: "Link name required",
        description: "Please enter a custom link name.",
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('shared_galleries')
        .insert({
          created_by: user.id,
          media_ids: selectedMediaIds,
          title: title,
          slug: customSlug,
          expires_at: null // Explicitly ensure it doesn't expire
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') { // Unique violation
          throw new Error('This link name is already taken. Please choose another.');
        }
        throw error;
      }

      const url = `${window.location.origin}/share/${data.slug || data.id}`;
      setShareUrl(url);
      setIsCustomizing(false);
      
      toast({
        title: "Link Created",
        description: "Your custom share link is ready.",
      });
    } catch (error) {
      console.error('Error creating share link:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to generate share link.",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: "Copied!",
      description: "Link copied to clipboard",
    });
  };

  const handleClose = () => {
    if (shareUrl) {
      onResetSelection(); // Clear selection if we successfully shared
    }
    onOpenChange(false);
  };

  const handleSlugChange = (e) => {
    // Only allow safe characters
    const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setCustomSlug(val);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-blue-500" />
            Share Gallery
          </DialogTitle>
          <DialogDescription>
            Create a public link for {selectedMediaIds.length} selected photos.
          </DialogDescription>
        </DialogHeader>

        {isCustomizing ? (
          <div className="flex flex-col gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Gallery Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Living Room Renovation"
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="slug">Custom Link URL</Label>
              <div className="flex items-center gap-1">
                <div className="text-sm text-gray-500 bg-gray-100 dark:bg-gray-800 px-3 py-2.5 rounded-l-lg border border-r-0 border-gray-300 dark:border-gray-600 select-none">
                  {window.location.host}/share/
                </div>
                <Input
                  id="slug"
                  value={customSlug}
                  onChange={handleSlugChange}
                  className="rounded-l-none font-medium text-blue-600"
                  placeholder="project-name"
                />
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="icon" 
                  className="absolute right-8 text-gray-400 hover:text-blue-500"
                  onClick={() => setCustomSlug(`${slugify(title)}-${Math.random().toString(36).substring(2, 7)}`)}
                  title="Generate Random"
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                Choose a memorable name. Only letters, numbers, and hyphens.
              </p>
            </div>

            <Button onClick={generateLink} disabled={loading} className="w-full mt-2">
              {loading ? "Creating Link..." : "Create Public Link"}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 py-4">
            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg flex items-start gap-3 border border-green-100 dark:border-green-800">
              <Check className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-green-900 dark:text-green-300">Link Ready</p>
                <p className="text-green-700 dark:text-green-400 mt-1">
                  This gallery is now public and will remain active indefinitely.
                </p>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Share Link</Label>
              <div className="flex items-center space-x-2">
                <Input
                  value={shareUrl}
                  readOnly
                  className="bg-gray-50 dark:bg-gray-900 font-medium text-blue-600"
                />
                <Button size="icon" onClick={copyToClipboard} className="shrink-0">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            
            <div className="flex gap-2 mt-2">
              <Button 
                variant="outline" 
                className="flex-1 gap-2"
                onClick={() => window.open(shareUrl, '_blank')}
              >
                <ExternalLink className="h-4 w-4" />
                Preview
              </Button>
              <Button 
                variant="default" 
                className="flex-1"
                onClick={handleClose}
              >
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ShareGalleryDialog;