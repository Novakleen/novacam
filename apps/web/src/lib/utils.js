import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export function formatPhoneNumber(str) {
  if (!str) return '';
  // Filter only numbers
  const cleaned = ('' + str).replace(/\D/g, '');
  
  // Check if it is a valid 10 digit number
  const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
  
  if (match) {
    return '(' + match[1] + ') ' + match[2] + '-' + match[3];
  }
  
  // If 11 digits and starts with 1, format as +1 (XXX) XXX-XXXX
  const match11 = cleaned.match(/^1(\d{3})(\d{3})(\d{4})$/);
  if (match11) {
    return '+1 (' + match11[1] + ') ' + match11[2] + '-' + match11[3];
  }

  return str;
}

export function formatBytes(bytes, decimals = 2) {
  if (!bytes) return '0 Bytes';
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}