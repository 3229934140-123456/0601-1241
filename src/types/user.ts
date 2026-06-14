import { BaseEntity, UserProfile, PaginationParams, PaginationResult } from './common';

export interface UserRelation extends BaseEntity {
  userId: string;
  targetUserId: string;
  type: 'follow' | 'block';
}

export interface UserStats {
  followingCount: number;
  followerCount: number;
  postCount: number;
  likeCount: number;
  contributionValue: number;
}

export interface FollowParams extends PaginationParams {
  userId: string;
}

export type FollowListResult = PaginationResult<UserProfile>;

export interface BlacklistItem extends BaseEntity {
  userId: string;
  blockedUserId: string;
  reason?: string;
}

export interface ContributionRecord extends BaseEntity {
  userId: string;
  value: number;
  reason: string;
  type: 'post' | 'comment' | 'help' | 'like' | 'other';
  relatedId?: string;
}

export interface ContributionRankingParams extends PaginationParams {
  period?: 'day' | 'week' | 'month' | 'all';
}
