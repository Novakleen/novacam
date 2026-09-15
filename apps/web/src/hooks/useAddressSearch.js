import { useState, useEffect, useCallback, useRef } from 'react';
import { extractCoordinates, formatNominatimAddress, handleAddressApiError } from '@/lib/addressUtils';

/**
 * Custom hook for searching addresses using OpenStreetMap's Nominatim API.
 * Includes debouncing, loading states, and error handling.
 * 
 * @returns {Object} Hook values and functions
 */
const useAddressSearch = () => {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedAddress, setSelectedAddress] = useState(null);
  
  // Ref to hold the timeout ID for debouncing
  const debounceTimeoutRef = useRef(null);
  // Ref to handle aborting stale requests
  const abortControllerRef = useRef(null);

  /**
   * Search for an address string against the Nominatim API.
   * This function is debounced internally by the useEffect that watches 'query'.
   * @param {string} searchQuery - The text to search for
   */
  const searchAddress = useCallback((searchQuery) => {
    setQuery(searchQuery);
  }, []);

  /**
   * Clears the current suggestions and query.
   */
  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
    setQuery('');
    setError(null);
  }, []);

  /**
   * Selects an address from the suggestions.
   * @param {Object} result - The raw result object from Nominatim
   */
  const selectAddress = useCallback((result) => {
    if (!result) {
      setSelectedAddress(null);
      return;
    }

    const coords = extractCoordinates(result);
    const formatted = formatNominatimAddress(result);

    setSelectedAddress({
      ...result,
      formattedAddress: formatted,
      latitude: coords?.lat,
      longitude: coords?.lng
    });
    
    // Clear search state after selection
    setSuggestions([]);
    setQuery(formatted);
  }, []);

  // Effect to handle the API call with debouncing
  useEffect(() => {
    // Clear any pending timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Don't search if query is empty or too short
    if (!query || query.length < 3) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    // If we just selected an address and the query matches it, don't re-search
    if (selectedAddress && query === selectedAddress.formattedAddress) {
      return;
    }

    setLoading(true);
    setError(null);

    // Set new debounce timeout (300ms)
    debounceTimeoutRef.current = setTimeout(async () => {
      // Cancel previous pending request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller for this request
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`,
          { 
            signal,
            headers: {
              'Accept-Language': 'fr-BE,fr;q=0.9,en;q=0.8',
              // It's polite to identify the app to OSM
              'User-Agent': 'NovaKleen-Project-App/1.0'
            }
          }
        );

        if (!response.ok) {
          throw new Error(`Nominatim API Error: ${response.statusText}`);
        }

        const data = await response.json();
        setSuggestions(data);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(handleAddressApiError(err));
          setSuggestions([]);
        }
      } finally {
        // Only turn off loading if this wasn't aborted
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    }, 300);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [query, selectedAddress]);

  return {
    query,
    suggestions,
    loading,
    error,
    searchAddress,
    clearSuggestions,
    selectedAddress,
    selectAddress,
    setQuery // Exposed in case we need to manually set the input value without triggering search logic immediately logic relies on useEffect
  };
};

export default useAddressSearch;