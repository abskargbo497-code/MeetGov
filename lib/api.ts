/**
 * API Client
 *
 * Centralized axios client with Clerk JWT injected on every authenticated request.
 * Guest sessions still use the guest_session_token from sessionStorage.
 */

import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  // Don't send cookies — we use Bearer tokens with Clerk
  withCredentials: false,
});

// Intercept requests to inject the Clerk JWT token
api.interceptors.request.use(async (config: any) => {
  if (typeof window === 'undefined') return config;

  // Guest flow: use guest session token from sessionStorage
  const guestToken = sessionStorage.getItem('guest_session_token');
  if (guestToken) {
    config.headers.Authorization = `Bearer ${guestToken}`;
    return config;
  }

  // Authenticated flow: get Clerk session token
  try {
    // window.__clerk__ is populated once ClerkProvider mounts
    const clerk = (window as any).__clerk__;
    if (clerk?.session) {
      const token = await clerk.session.getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
  } catch {
    // Silently skip if Clerk isn't ready yet
  }

  return config;
});

// Consistent error helper
export const handleApiResponse = async <T>(
  promise: Promise<T>
): Promise<{ data: T | null; error: Error | null }> => {
  try {
    const data = await promise;
    return { data, error: null };
  } catch (error: any) {
    console.error('API Error:', error);
    const message =
      error?.response?.data?.error ||
      error?.response?.data?.message ||
      error?.message ||
      'Unknown error';
    return { data: null, error: new Error(message) };
  }
};
