import { BaseEntity, UserProfile, PaginationParams, PaginationResult } from './common';

export type TaskType = 'resume_review' | 'interview_prep' | 'career_advice' | 'referral' | 'other';

export type TaskStatus = 'open' | 'claimed' | 'in_progress' | 'completed' | 'cancelled' | 'expired';

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface HelpTask extends BaseEntity {
  publisherId: string;
  publisher: UserProfile;
  type: TaskType;
  title: string;
  description: string;
  bountyAmount: number;
  priority: TaskPriority;
  status: TaskStatus;
  claimerId?: string;
  claimer?: UserProfile;
  claimedAt?: number;
  completedAt?: number;
  deadline?: number;
  tags?: string[];
  attachments?: string[];
  viewCount: number;
  applicationCount: number;
  isAnonymous: boolean;
  anonymousName?: string;
  relatedPostId?: string;
  reviewId?: string;
}

export interface CreateTaskParams {
  type: TaskType;
  title: string;
  description: string;
  bountyAmount: number;
  priority?: TaskPriority;
  deadline?: number;
  tags?: string[];
  attachments?: string[];
  isAnonymous?: boolean;
  anonymousName?: string;
  relatedPostId?: string;
}

export interface TaskListParams extends PaginationParams {
  type?: TaskType;
  status?: TaskStatus;
  publisherId?: string;
  claimerId?: string;
  keyword?: string;
  sortBy?: 'latest' | 'bounty_high' | 'deadline' | 'most_applied';
  minBounty?: number;
  maxBounty?: number;
  reviewed?: boolean;
}

export type TaskListResult = PaginationResult<HelpTask>;

export interface TaskApplication extends BaseEntity {
  taskId: string;
  userId: string;
  user: UserProfile;
  message: string;
  status: 'pending' | 'accepted' | 'rejected';
  reviewedAt?: number;
  reviewedBy?: string;
}

export interface ApplyTaskParams {
  taskId: string;
  message: string;
}

export interface TaskReview extends BaseEntity {
  taskId: string;
  reviewerId: string;
  reviewer: UserProfile;
  rating: number;
  comment: string;
  isHelpful: boolean;
}

export interface CompleteTaskParams {
  taskId: string;
  resultDescription?: string;
  attachments?: string[];
}

export interface RateTaskParams {
  taskId: string;
  rating: number;
  comment: string;
  isHelpful?: boolean;
}
