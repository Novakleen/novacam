import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';

// Utility to escape regex characters
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Relevance Scoring Logic
const calculateRelevance = (contact, query) => {
    if (!query) return { score: 1, matchedField: null }; // No query = all equal
    
    const q = query.toLowerCase().trim();
    if (q.length < 1) return { score: 0, matchedField: null }; 

    const fields = {
        'First Name': contact.first_name || contact.firstname || '',
        'Last Name': contact.last_name || contact.lastname || '',
        'Email': contact.email || '',
        'Company': contact.company || ''
    };

    let totalScore = 0;
    let matchedFieldsCount = 0;
    let bestField = null;
    let highestFieldScore = 0;

    for (const [key, value] of Object.entries(fields)) {
        if (!value) continue;
        const val = String(value).toLowerCase();
        
        let fieldScore = 0;
        
        // Exact Match - Score 150
        if (val === q) {
            fieldScore = 150;
        }
        // Exact Prefix Match (Starts with string) - Score 100
        else if (val.startsWith(q)) {
            fieldScore = 100;
        } 
        else {
            // Word Prefix Match (Starts with word boundary) - Score 75
            // Split by common delimiters: space, dot, @, hyphen
            const words = val.split(/[\s@.-]+/);
            const isWordStart = words.some(w => w.startsWith(q));
            
            if (isWordStart) {
                fieldScore = 75;
            } 
            // Substring Match (Contains anywhere) - Score 50
            else if (val.includes(q)) {
                fieldScore = 50;
            }
        }

        if (fieldScore > 0) {
            totalScore += fieldScore;
            matchedFieldsCount++;
            
            // Track the "Best" match for display purposes
            if (fieldScore > highestFieldScore) {
                highestFieldScore = fieldScore;
                bestField = key;
            }
        }
    }

    if (matchedFieldsCount === 0) return { score: 0, matchedField: null };

    // Final Score: Sum of scores / Number of fields matched
    // This gives an average relevance quality score
    const finalScore = totalScore / matchedFieldsCount;
    
    return { score: finalScore, matchedField: bestField };
};

export const useHubSpotContacts = () => {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    after: null,
    total: 0,
    hasMore: false
  });
  const [rateLimitInfo, setRateLimitInfo] = useState({
    isRateLimited: false,
    retryAfter: 0,
    remaining: null
  });
  
  const { toast } = useToast();
  const searchAbortController = useRef(null);

  const resetRateLimit = useCallback(() => {
    setRateLimitInfo({
      isRateLimited: false,
      retryAfter: 0,
      remaining: null
    });
    setError(null);
  }, []);

  const fetchHubSpotContacts = useCallback(async ({ query = '', isNextPage = false } = {}) => {
    console.log('[HubSpot Search Debug] Starting search with query:', query);

    if (rateLimitInfo.isRateLimited) {
       console.warn('[HubSpot Search Debug] Search blocked by rate limit');
       const msg = `API rate limit reached. Please try again in ${rateLimitInfo.retryAfter} seconds.`;
       setError(msg);
       return [];
    }

    if (searchAbortController.current) {
      searchAbortController.current.abort();
    }
    searchAbortController.current = new AbortController();

    setLoading(true);
    setError(null);

    const cursor = isNextPage ? pagination.after : undefined;
    const cleanQuery = query.trim();

    try {
      console.log('[HubSpot Search Debug] Sending API request:', { 
        query: cleanQuery, 
        cursor,
        timestamp: new Date().toISOString()
      });

      // 1. Fetch data from Edge Function
      const { data, error } = await supabase.functions.invoke('hubspot-search-contacts', {
        body: { 
          query: cleanQuery,
          limit: 50, // Fetch slightly more to sort effectively on client
          after: cursor,
          properties: ["firstname", "lastname", "email", "phone", "company", "lifecyclestage", "jobtitle"]
        },
        signal: searchAbortController.current.signal
      });

      if (error) {
          console.error('[HubSpot Search Debug] Supabase Function Error:', error);
          throw error;
      }

      console.log('[HubSpot Search Debug] API Response received:', data);
      
      if (!data.success) {
        if (data.isRateLimited || data.error?.includes("Rate limit")) {
           const retryAfterSeconds = data.retryAfter ? parseInt(data.retryAfter) : 60;
           setRateLimitInfo({
             isRateLimited: true,
             retryAfter: retryAfterSeconds,
             remaining: 0
           });
           throw new Error(`API Rate limit exceeded. Please retry after ${retryAfterSeconds} seconds.`);
        }
        throw new Error(data.error || 'Failed to fetch contacts');
      }

      let newContacts = data.contacts || [];
      const paging = data.paging;
      
      console.log(`[HubSpot Search Debug] Raw contacts count: ${newContacts.length}`);

      // 2. Client-side Relevance Scoring & Sorting
      // We apply this even for short queries to ensure best matches float to top
      if (cleanQuery.length > 0) {
        newContacts = newContacts.map(contact => {
          const { score, matchedField } = calculateRelevance(contact, cleanQuery);
          return { ...contact, _score: score, _matchedField: matchedField };
        });

        // Debug logging for scores
        newContacts.forEach(c => {
             if (c._score > 0) {
                 console.log(`[HubSpot Search Debug] Match found: ${c.firstname} ${c.lastname} (Score: ${c._score}, Field: ${c._matchedField})`);
             }
        });

        // Sort: Highest score first
        newContacts.sort((a, b) => b._score - a._score);
      }

      if (data.rateLimit) {
        setRateLimitInfo(prev => ({
          ...prev,
          remaining: data.rateLimit.remaining,
          isRateLimited: false
        }));
      }

      setContacts(prev => isNextPage ? [...prev, ...newContacts] : newContacts);
      
      setPagination({
        total: data.total || 0,
        after: paging?.next?.after || null,
        hasMore: !!paging?.next?.after
      });

      console.log('[HubSpot Search Debug] Final contacts set:', newContacts.length);
      return newContacts;

    } catch (err) {
      if (err.name === 'AbortError') {
          console.log('[HubSpot Search Debug] Request aborted');
          return; 
      }
      
      console.error('[HubSpot Search Debug] Error fetching contacts:', err);
      setError(err.message);
      
      if (!err.message.includes("Rate limit")) {
         toast({
          variant: "destructive",
          title: "HubSpot API Error",
          description: err.message,
        });
      }
      return [];
    } finally {
      setLoading(false);
    }
  }, [pagination.after, rateLimitInfo.isRateLimited, toast]);

  const loadMore = useCallback((currentQuery) => {
    if (pagination.hasMore && !loading) {
      return fetchHubSpotContacts({ query: currentQuery, isNextPage: true });
    }
    return Promise.resolve([]);
  }, [pagination.hasMore, loading, fetchHubSpotContacts]);

  return {
    contacts,
    loading,
    error,
    pagination,
    rateLimitInfo,
    fetchHubSpotContacts,
    loadMore,
    resetRateLimit
  };
};

export default useHubSpotContacts;