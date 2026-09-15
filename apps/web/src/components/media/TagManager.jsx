import React, { useState, useEffect } from 'react';
import { X, Plus, Tag as TagIcon } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const TagManager = ({ media, projectId, onClose, onSuccess }) => {
  const { toast } = useToast();
  const [allTags, setAllTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [newTagName, setNewTagName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchTags();
    if (media.media_tags) {
      setSelectedTags(media.media_tags.map(mt => mt.tag_id));
    }
  }, [media]);

  const fetchTags = async () => {
    try {
      const { data, error } = await supabase
        .from('tags')
        .select('*')
        .order('name');

      if (error) throw error;
      setAllTags(data || []);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load tags",
      });
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;

    try {
      const { data, error } = await supabase
        .from('tags')
        .insert([{ name: newTagName.trim() }])
        .select()
        .single();

      if (error) throw error;

      setAllTags([...allTags, data]);
      setNewTagName('');

      toast({
        title: "Success",
        description: "Tag created successfully",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to create tag",
      });
    }
  };

  const handleToggleTag = (tagId) => {
    setSelectedTags(prev =>
      prev.includes(tagId)
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    );
  };

  const handleSave = async () => {
    setLoading(true);

    try {
      // Remove existing tags
      await supabase
        .from('media_tags')
        .delete()
        .eq('media_id', media.id);

      // Add new tags
      if (selectedTags.length > 0) {
        const { error } = await supabase
          .from('media_tags')
          .insert(
            selectedTags.map(tagId => ({
              media_id: media.id,
              tag_id: tagId,
            }))
          );

        if (error) throw error;
      }

      toast({
        title: "Success",
        description: "Tags updated successfully",
      });

      onSuccess();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update tags",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="rounded-xl">
        <DialogHeader>
          <DialogTitle>Manage Tags</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="flex gap-2">
            <Input
              placeholder="Create new tag..."
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCreateTag()}
              className="rounded-lg"
            />
            <Button onClick={handleCreateTag} size="icon" className="rounded-lg">
              <Plus className="h-5 w-5" />
            </Button>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Available Tags
            </p>
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
              {allTags.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => handleToggleTag(tag.id)}
                  className={`px-3 py-1 rounded-full text-sm transition-colors ${
                    selectedTags.includes(tag.id)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                  } rounded-full`}
                >
                  <TagIcon className="inline h-3 w-3 mr-1" />
                  {tag.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} className="rounded-lg">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={loading} className="rounded-lg">
              {loading ? 'Saving...' : 'Save Tags'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TagManager;