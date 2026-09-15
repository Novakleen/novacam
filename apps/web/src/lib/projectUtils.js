import { supabase } from '@/lib/customSupabaseClient';

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

// Helper to wait
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Generic retry wrapper for Supabase operations
const retryOperation = async (operation, retries = MAX_RETRIES) => {
  try {
    return await operation();
  } catch (error) {
    // Retry on network errors or 5xx server errors
    const isNetworkError = error.message === 'Failed to fetch' || error.status >= 500;
    
    if (retries > 0 && isNetworkError) {
      console.warn(`Operation failed, retrying... (${retries} attempts left). Error: ${error.message}`);
      await wait(RETRY_DELAY * (MAX_RETRIES - retries + 1)); // Exponential backoffish
      return retryOperation(operation, retries - 1);
    }
    throw error;
  }
};

/**
 * Archives or unarchives a project with retry logic.
 * 
 * @param {string} projectId - The UUID of the project
 * @param {boolean} shouldArchive - True to archive, false to unarchive (restore)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export const archiveProject = async (projectId, shouldArchive = true) => {
  if (!projectId) return { success: false, error: 'Project ID is required' };

  try {
    const result = await retryOperation(async () => {
      const { data, error } = await supabase
        .from('projects')
        .update({ is_archived: shouldArchive })
        .eq('id', projectId)
        .select()
        .single();

      if (error) throw error;
      return data;
    });

    return { success: true, data: result };
  } catch (error) {
    console.error('Archive Project Error:', error);
    return { 
      success: false, 
      error: error.message || 'An unexpected error occurred while updating the project. Please check your connection.' 
    };
  }
};