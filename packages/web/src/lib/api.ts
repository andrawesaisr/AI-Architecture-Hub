import { supabase } from './supabase';

export const API_BASE_URL = 'http://localhost:5002';

export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error) {
    console.error('Error getting Supabase session:', error);
    // Potentially handle session error, e.g., by redirecting to login
    window.location.href = '/login';
    throw new Error('Could not retrieve authentication session');
  }

  if (!session) {
    // No active session, redirect to login
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  const token = session.access_token;

  const headers = {
    ...options.headers,
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers,
  });

  if (response.status === 401 || response.status === 403) {
    // The backend API rejected the token. The session might be stale.
    // Redirecting to login will force a refresh.
    window.location.href = '/login';
    throw new Error('Unauthorized: Backend rejected token.');
  }

  return response;
}
