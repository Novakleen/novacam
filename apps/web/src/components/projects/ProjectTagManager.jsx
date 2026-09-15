import React, { useState, useEffect } from 'react';
import { X, Plus, Tag as TagIcon } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const ProjectTagManager = ({ project, open, onOpenChange, onSuccess }) => {
  const { toast } = useToast();
  const [allTags, setAllTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [newTagName, setNewTagName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      fetchTags();
      // If the project already has tags loaded via join, use them initially
      if (project.project_tags) {
        setSelectedTags(project.project_tags.map(pt => pt.tag_id));
      } else {
        fetchProjectTags();
      }
    }
  }, [open, project]);

  const fetchProjectTags = async () => {
    try {
      const { data, error } = await supabase
        .from('project_tags')
        .select('tag_id')
        .eq('project_id', project.id);
        
      if (!error && data) {
         setSelectedTags(data.map(pt => pt.tag_id));
      }
    } catch (e) { console.error(e); }
  };

  const fetchTags = async () => {
    try {
      const { data, error } = await supabase
        .from('tags')
        .select('*')
        .order('name');

      if (error) throw error;
      setAllTags(data || []);
    } catch (error) {
      toast({ variant: "destructive", title: "Failed to load tags" });
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
      toast({ title: "Tag created" });
    } catch (error) {
      toast({ variant: "destructive", title: "Failed to create tag" });
    }
  };

  const handleToggleTag = (tagId) => {
    setSelectedTags(prev =>
      prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
    );
  };

  const handleSave = async () => {
    setLoading(true);

    try {
      // Delete existing
      await supabase
        .from('project_tags')
        .delete()
        .eq('project_id', project.id);

      // Insert new
      if (selectedTags.length > 0) {
        const { error } = await supabase
          .from('project_tags')
          .insert(selectedTags.map(tagId => ({
            project_id: project.id,
            tag_id: tagId
          })));
        if (error) throw error;
      }

      toast({ title: "Tags updated successfully" });
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast({ variant: "destructive", title: "Error updating tags" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl">
        <DialogHeader>
          <DialogTitle>Manage Project Tags</DialogTitle>
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
              Select Tags
            </p>
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-1">
              {allTags.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => handleToggleTag(tag.id)}
                  className={`px-3 py-1 rounded-full text-sm transition-colors border ${
                    selectedTags.includes(tag.id)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-blue-400'
                  }`}
                >
                  <TagIcon className="inline h-3 w-3 mr-1" />
                  {tag.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={loading}>{loading ? 'Saving...' : 'Save Tags'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ProjectTagManager;