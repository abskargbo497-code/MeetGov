/**
 * User API
 * 
 * API functions for user-related operations
 */

import { api } from '../api';

export interface UserInfo {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  emailVerified: boolean;
  createdAt: string;
  userType: 'personal' | 'enterprise';
  enterprise: {
    id: string;
    name: string;
    domain: string | null;
    role: 'ADMIN' | 'ORGANIZER' | 'ASSIGNEE';
  } | null;
  needsOnboarding: boolean;
}

export interface OnboardingStatus {
  hasEnterprise: boolean;
  enterprise: {
    id: string;
    name: string;
    role: string;
  } | null;
  pendingInvite: {
    id: string;
    enterpriseName: string;
    role: string;
  } | null;
}

export const getCurrentUser = async (): Promise<UserInfo> => {
  const response = await api.get<UserInfo>('/api/v1/users/me');
  return response.data;
};

export const getOnboardingStatus = async (): Promise<OnboardingStatus> => {
  const response = await api.get<OnboardingStatus>('/api/v1/users/me');
  return response.data;
};
