import { BaseEntity, PaginationParams, PaginationResult, ContentStatus } from './common';

export interface Topic extends BaseEntity {
  name: string;
  description?: string;
  coverImage?: string;
  postCount: number;
  followerCount: number;
  isHot?: boolean;
  category?: string;
  sortOrder?: number;
  status: ContentStatus;
}

export interface CreateTopicParams {
  name: string;
  description?: string;
  coverImage?: string;
  category?: string;
}

export interface TopicParams extends PaginationParams {
  keyword?: string;
  category?: string;
  sortBy?: 'hot' | 'latest' | 'mostFollowed';
}

export type TopicListResult = PaginationResult<Topic>;

export interface JobCircle extends BaseEntity {
  name: string;
  description: string;
  rules: string[];
  coverImage?: string;
  memberCount: number;
  postCount: number;
  adminIds: string[];
  isPublic: boolean;
  status: 'active' | 'closed' | 'reviewing';
}

export interface CreateJobCircleParams {
  name: string;
  description: string;
  rules?: string[];
  coverImage?: string;
  isPublic?: boolean;
}

export interface UpdateJobCircleRulesParams {
  circleId: string;
  rules: string[];
}

export interface CircleMember extends BaseEntity {
  circleId: string;
  userId: string;
  role: 'member' | 'admin' | 'owner';
  joinedAt: number;
}
