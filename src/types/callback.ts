import { BaseEntity, PaginationParams, PaginationResult } from './common';

export type CallbackType = 'activity_signup' | 'user_dynamic_sync' | 'post_publish' | 'task_complete' | 'report_submit';

export type CallbackStatus = 'pending' | 'success' | 'failed' | 'retrying';

export type CallbackEventGroup = 'business' | 'dynamic' | 'governance';

export interface CallbackRecord extends BaseEntity {
  type: CallbackType;
  eventType: string;
  callbackUrl: string;
  payload: Record<string, any>;
  status: CallbackStatus;
  retryCount: number;
  lastRetryAt?: number;
  response?: string;
  errorMessage?: string;
  retryHistory?: Array<{ attemptedAt: number; success: boolean; response?: string; error?: string }>;
}

export interface ActivitySignupData {
  activityId: string;
  activityName: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  signupTime: number;
  extraInfo?: Record<string, any>;
}

export interface UserDynamicData {
  userId: string;
  dynamicType: 'post_publish' | 'comment_publish' | 'task_claim' | 'task_accept' | 'task_complete' | 'task_rate' | 'follow' | 'like';
  dynamicId: string;
  content?: string;
  timestamp: number;
  relatedId?: string;
  relatedType?: string;
}

export interface CallbackConfig {
  activitySignupUrl?: string | string[];
  userDynamicSyncUrl?: string | string[];
  postPublishUrl?: string | string[];
  taskCompleteUrl?: string | string[];
  reportSubmitUrl?: string | string[];
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
}

export interface CallbackParams extends PaginationParams {
  type?: CallbackType;
  status?: CallbackStatus;
  eventType?: string;
  callbackUrl?: string;
  group?: CallbackEventGroup;
}

export type CallbackListResult = PaginationResult<CallbackRecord>;

export interface CallbackEvent {
  type: CallbackType;
  eventType: string;
  data: any;
  timestamp: number;
  eventId: string;
}

export type CallbackHandler = (event: CallbackEvent) => Promise<void> | void;
