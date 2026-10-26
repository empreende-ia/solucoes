// API URL - empty string means relative paths (works in Next.js)
// API routes are at /api/* which is handled by Next.js

export const API_BASE_URL = '';

export const api = {
  get: async <T>(path: string): Promise<T> => {
    const response = await fetch(`${API_BASE_URL}${path}`);
    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }
    return response.json();
  },

  post: async <T>(path: string, body?: unknown): Promise<T> => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }
    return response.json();
  },
};
