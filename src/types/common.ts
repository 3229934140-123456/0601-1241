export interface BaseEntity {
  id: string;
  createdAt: number;
  updatedAt: number;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export interface PaginationResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MuteInfo {
  isMuted: boolean;
  mutedAt?: number;
  muteDuration?: number;
  muteExpiresAt?: number;
  muteReason?: string;
}

export interface UserProfile extends BaseEntity {
  id: string;
  nickname: string;
  avatar: string;
  bio?: string;
  contributionValue: number;
  level: number;
  isVerified?: boolean;
  tags?: string[];
  muteInfo?: MuteInfo;
}

export type ContentStatus = 'draft' | 'published' | 'reviewing' | 'hidden' | 'deleted';

export type ReportStatus = 'pending' | 'processing' | 'resolved' | 'rejected';

export type ReportType = 'spam' | 'harassment' | 'violence' | 'pornography' | 'other';

export type ReportAction = 'hide' | 'delete' | 'warn' | 'mute' | 'no_action';
