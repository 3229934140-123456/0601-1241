import { BaseEntity, UserProfile, PaginationParams, PaginationResult, ContentStatus } from './common';

export type PostType = 'experience' | 'question' | 'discussion' | 'resume_review' | 'other';

export interface Post extends BaseEntity {
  userId: string;
  author: UserProfile;
  type: PostType;
  title: string;
  content: string;
  images?: string[];
  topicIds?: string[];
  topicNames?: string[];
  circleId?: string;
  isAnonymous: boolean;
  anonymousName?: string;
  isPinned: boolean;
  isTop: boolean;
  likeCount: number;
  commentCount: number;
  collectCount: number;
  viewCount: number;
  shareCount: number;
  status: ContentStatus;
  bountyAmount?: number;
  isBounty?: boolean;
  bountyStatus?: 'open' | 'claimed' | 'completed' | 'closed';
}

export interface CreatePostParams {
  type: PostType;
  title: string;
  content: string;
  images?: string[];
  topicIds?: string[];
  circleId?: string;
  isAnonymous?: boolean;
  anonymousName?: string;
  bountyAmount?: number;
}

export interface PostListParams extends PaginationParams {
  userId?: string;
  topicId?: string;
  circleId?: string;
  type?: PostType;
  keyword?: string;
  sortBy?: 'latest' | 'hot' | 'mostLiked' | 'mostCommented';
  isPinnedFirst?: boolean;
}

export type PostListResult = PaginationResult<Post>;

export interface Comment extends BaseEntity {
  postId: string;
  userId: string;
  author: UserProfile;
  content: string;
  images?: string[];
  likeCount: number;
  replyCount: number;
  isAnonymous: boolean;
  anonymousName?: string;
  parentId?: string;
  replyToUserId?: string;
  replyToUser?: UserProfile;
  status: ContentStatus;
  quotedCommentId?: string;
  quotedComment?: Comment;
}

export interface CreateCommentParams {
  postId: string;
  content: string;
  images?: string[];
  isAnonymous?: boolean;
  anonymousName?: string;
  parentId?: string;
  replyToUserId?: string;
  quotedCommentId?: string;
}

export interface CommentListParams extends PaginationParams {
  postId: string;
  parentId?: string;
  sortBy?: 'latest' | 'mostLiked';
}

export type CommentListResult = PaginationResult<Comment>;

export interface UserPostAction extends BaseEntity {
  userId: string;
  postId: string;
  actionType: 'like' | 'collect' | 'view' | 'share';
}

export interface PostDetail extends Post {
  isLiked: boolean;
  isCollected: boolean;
  comments?: CommentListResult;
}
