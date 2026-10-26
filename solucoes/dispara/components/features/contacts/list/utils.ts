import Papa from 'papaparse';

/**
 * Calculate relative time string from a date
 * @param dateString - ISO date string
 * @returns Human-readable relative time in Portuguese
 */
export const calculateRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'agora';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m atrás`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h atrás`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d atrás`;
  return date.toLocaleDateString('pt-BR');
};

/**
 * Parse CSV content into headers and rows
 * @param content - Raw CSV string content
 * @returns Object with headers array and rows array
 */
export const parseCSV = (content: string): { headers: string[]; rows: string[][] } => {
  const parsed = Papa.parse(content, { header: false, skipEmptyLines: true });
  const data = parsed.data as string[][];
  return {
    headers: data[0] || [],
    rows: data.slice(1)
  };
};

/**
 * Format phone number for storage (adds + prefix)
 * @param phone - Raw phone number string
 * @returns Formatted phone number with + prefix
 */
export const formatPhoneNumber = (phone: string): string => {
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length > 0 ? '+' + cleaned : '';
};

/**
 * Get initials from a name or phone
 * @param name - Contact name or phone
 * @returns Two character initials in uppercase
 */
export const getContactInitials = (name: string): string => {
  return name.substring(0, 2).toUpperCase();
};
