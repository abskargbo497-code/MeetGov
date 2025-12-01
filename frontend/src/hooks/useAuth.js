import { useAuth as useAuthContext } from '../context/AuthContext';

/**
 * Custom hook for authentication
 * Re-exports useAuth from AuthContext for convenience
 */
export const useAuth = useAuthContext;


