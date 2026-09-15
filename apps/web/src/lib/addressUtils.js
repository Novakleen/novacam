/**
 * Utility functions for address handling, validation, and API interactions.
 */

/**
 * Validates if the given string resembles a valid address format.
 * Basic validation checking for non-empty string and minimum length.
 * @param {string} address - The address string to validate.
 * @returns {boolean} - True if valid, false otherwise.
 */
export const validateAddress = (address) => {
  if (!address || typeof address !== 'string') return false;
  return address.trim().length > 3;
};

/**
 * Extracts latitude and longitude from a Nominatim result object.
 * @param {Object} result - The result object from Nominatim API.
 * @returns {{lat: number, lng: number}|null} - Object containing lat/lng or null if invalid.
 */
export const extractCoordinates = (result) => {
  if (!result || !result.lat || !result.lon) return null;
  return {
    lat: parseFloat(result.lat),
    lng: parseFloat(result.lon),
  };
};

/**
 * Formats a Nominatim result into a clean display string.
 * Uses display_name preferably, or constructs one from address parts.
 * @param {Object} result - The result object from Nominatim API.
 * @returns {string} - Formatted address string.
 */
export const formatNominatimAddress = (result) => {
  if (!result) return '';
  return result.display_name || '';
};

/**
 * Handles API errors and returns a user-friendly error message.
 * @param {Error} error - The error object thrown by fetch or logic.
 * @returns {string} - A clean error message.
 */
export const handleAddressApiError = (error) => {
  console.error("Address API Error:", error);
  if (error.name === 'AbortError') return 'Request cancelled';
  if (error.message.includes('Network request failed')) return 'Network error. Please check your connection.';
  return 'Failed to fetch address suggestions. Please try again.';
};