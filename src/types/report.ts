import { BaseEntity, UserProfile, PaginationParams, PaginationResult, ReportStatus, ReportType } from './common';

export interface Report extends BaseEntity {
  reporterId: string;
  reporter?: UserProfile;
  reportedUserId: string;
  reportedUser?: UserProfile;
  type: ReportType;
  contentType: 'post' | 'comment' | 'user' | 'task' | 'message';
  contentId: string;
  contentSnapshot?: string;
  reason: string;
  images?: string[];
  status: ReportStatus;
  handlerId?: string;
  handler?: UserProfile;
  handledAt?: number;
  handleResult?: string;
}

export interface CreateReportParams {
  type: ReportType;
  contentType: 'post' | 'comment' | 'user' | 'task' | 'message';
  contentId: string;
  reason: string;
  images?: string[];
  contentSnapshot?: string;
}

export interface ReportListParams extends PaginationParams {
  status?: ReportStatus;
  type?: ReportType;
  contentType?: string;
  reporterId?: string;
}

export type ReportListResult = PaginationResult<Report>;

export interface HandleReportParams {
  reportId: string;
  status: ReportStatus;
  handleResult: string;
}

export interface SensitiveWordHit {
  word: string;
  position: number;
  length: number;
}

export interface ContentCheckResult {
  passed: boolean;
  hits: SensitiveWordHit[];
  filteredContent: string;
}
