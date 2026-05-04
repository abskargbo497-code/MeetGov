/**
 * Participant API
 * 
 * API functions for authenticated participants to interact with meetings
 */

import { api } from '../api';

export type MeetingJoinInfo = {
  meetingId: string;
  meetingStatus: string;
  meetingTitle: string;
  organizerName: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  canCheckIn: boolean;
};

export type ParticipantStatus = {
  isParticipant: boolean;
  isOwner: boolean;
  isCheckedIn: boolean;
  joinedAt: string | null;
  checkedInAt: string | null;
  role: string;
};

export type Attendee = {
  id: string;
  name: string;
  email: string | null;
  checkedInAt: string | null;
};

export type AttendanceResponse = {
  totalCount: number;
  attendees: Attendee[];
};

export type TaskFile = {
  id: string;
  fileName: string;
  fileUrl?: string;
  mimeType: string;
};

export type TaskSubmission = {
  id: string;
  notes: string | null;
  createdAt: string;
  files: TaskFile[];
};

export type ParticipantTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  requiresUpload: boolean;
  hasSubmission: boolean;
  submission: TaskSubmission | null;
  createdAt: string;
};

export type UploadUrlResponse = {
  uploadUrl: string;
  objectName: string;
  expiresAt: string;
};

/**
 * Get meeting info for join page
 */
export async function getMeetingJoinInfo(
  meetingId: string
): Promise<{ data: MeetingJoinInfo | null; error: Error | null }> {
  try {
    const response = await api.get<MeetingJoinInfo>(
      `/api/participant/meetings/${meetingId}/join`
    );
    return { data: response.data, error: null };
  } catch (error: any) {
    console.error('Error getting meeting join info:', error);
    return {
      data: null,
      error: new Error(error.response?.data?.error || 'Failed to get meeting info'),
    };
  }
}

/**
 * Join a meeting as authenticated participant
 */
export async function joinMeeting(
  meetingId: string
): Promise<{ data: any | null; error: Error | null }> {
  try {
    const response = await api.post(`/api/participant/meetings/${meetingId}/join`);
    return { data: response.data, error: null };
  } catch (error: any) {
    console.error('Error joining meeting:', error);
    return {
      data: null,
      error: new Error(error.response?.data?.error || 'Failed to join meeting'),
    };
  }
}

/**
 * Check in to a meeting (attendance)
 */
export async function checkIn(
  meetingId: string
): Promise<{ data: any | null; error: Error | null }> {
  try {
    const response = await api.post(`/api/participant/meetings/${meetingId}/attendance`);
    return { data: response.data, error: null };
  } catch (error: any) {
    console.error('Error checking in:', error);
    return {
      data: null,
      error: new Error(error.response?.data?.error || 'Failed to check in'),
    };
  }
}

/**
 * Get attendance list for a meeting
 */
export async function getAttendance(
  meetingId: string
): Promise<{ data: AttendanceResponse | null; error: Error | null }> {
  try {
    const response = await api.get<AttendanceResponse>(
      `/api/v1/meetings/${meetingId}/attendance`
    );
    return { data: response.data, error: null };
  } catch (error: any) {
    console.error('Error getting attendance:', error);
    return {
      data: null,
      error: new Error(error.response?.data?.error || 'Failed to get attendance'),
    };
  }
}

/**
 * Get current user's status in a meeting
 */
export async function getMyStatus(
  meetingId: string
): Promise<{ data: ParticipantStatus | null; error: Error | null }> {
  try {
    const response = await api.get<ParticipantStatus>(
      `/api/participant/meetings/${meetingId}/my-status`
    );
    return { data: response.data, error: null };
  } catch (error: any) {
    console.error('Error getting status:', error);
    return {
      data: null,
      error: new Error(error.response?.data?.error || 'Failed to get status'),
    };
  }
}

/**
 * Get tasks assigned to the current participant
 */
export async function getMyTasks(
  meetingId: string
): Promise<{ data: { tasks: ParticipantTask[]; totalCount: number } | null; error: Error | null }> {
  try {
    const response = await api.get<{ tasks: ParticipantTask[]; totalCount: number }>(
      `/api/participant/meetings/${meetingId}/tasks/me`
    );
    return { data: response.data, error: null };
  } catch (error: any) {
    console.error('Error getting tasks:', error);
    return {
      data: null,
      error: new Error(error.response?.data?.error || 'Failed to get tasks'),
    };
  }
}

/**
 * Submit a task (without file)
 */
export async function submitTask(
  taskId: string,
  notes?: string
): Promise<{ data: { success: boolean; submissionId: string } | null; error: Error | null }> {
  try {
    const response = await api.post<{ success: boolean; submissionId: string }>(
      `/api/participant/tasks/${taskId}/submit`,
      { notes }
    );
    return { data: response.data, error: null };
  } catch (error: any) {
    console.error('Error submitting task:', error);
    return {
      data: null,
      error: new Error(error.response?.data?.error || 'Failed to submit task'),
    };
  }
}

/**
 * Get presigned URL for file upload
 */
export async function getUploadUrl(
  taskId: string,
  fileName: string,
  contentType: string,
  fileSize: number
): Promise<{ data: UploadUrlResponse | null; error: Error | null }> {
  try {
    const response = await api.post<UploadUrlResponse>(
      `/api/participant/tasks/${taskId}/upload-url`,
      { fileName, contentType, fileSize }
    );
    return { data: response.data, error: null };
  } catch (error: any) {
    console.error('Error getting upload URL:', error);
    return {
      data: null,
      error: new Error(error.response?.data?.error || 'Failed to get upload URL'),
    };
  }
}

/**
 * Complete file upload and attach to task submission
 */
export async function completeUpload(
  taskId: string,
  objectName: string,
  fileName: string,
  fileSize: number,
  contentType: string,
  notes?: string
): Promise<{ data: any | null; error: Error | null }> {
  try {
    const response = await api.post(
      `/api/participant/tasks/${taskId}/upload-complete`,
      { objectName, fileName, fileSize, contentType, notes }
    );
    return { data: response.data, error: null };
  } catch (error: any) {
    console.error('Error completing upload:', error);
    return {
      data: null,
      error: new Error(error.response?.data?.error || 'Failed to complete upload'),
    };
  }
}

/**
 * Upload a file to a task
 * Handles the full flow: get URL, upload, complete
 */
export async function uploadTaskFile(
  taskId: string,
  file: File,
  notes?: string,
  onProgress?: (progress: number) => void
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Get presigned URL
    const { data: urlData, error: urlError } = await getUploadUrl(
      taskId,
      file.name,
      file.type,
      file.size
    );

    if (urlError || !urlData) {
      return { success: false, error: urlError?.message || 'Failed to get upload URL' };
    }

    // 2. Upload file to R2
    const uploadResponse = await fetch(urlData.uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type,
      },
    });

    if (!uploadResponse.ok) {
      return { success: false, error: 'Failed to upload file' };
    }

    if (onProgress) {
      onProgress(100);
    }

    // 3. Complete upload
    const { data: completeData, error: completeError } = await completeUpload(
      taskId,
      urlData.objectName,
      file.name,
      file.size,
      file.type,
      notes
    );

    if (completeError || !completeData) {
      return { success: false, error: completeError?.message || 'Failed to complete upload' };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error uploading file:', error);
    return { success: false, error: error.message || 'Upload failed' };
  }
}

export default {
  getMeetingJoinInfo,
  joinMeeting,
  checkIn,
  getAttendance,
  getMyStatus,
  getMyTasks,
  submitTask,
  getUploadUrl,
  completeUpload,
  uploadTaskFile,
};
