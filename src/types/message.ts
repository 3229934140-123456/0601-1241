import { BaseEntity, UserProfile, PaginationParams, PaginationResult } from './common';

export type MessageType = 'private' | 'system' | 'invitation' | 'notification';

export type MessageStatus = 'unread' | 'read' | 'deleted' | 'hidden';

export interface Message extends BaseEntity {
  type: MessageType;
  senderId: string;
  sender?: UserProfile;
  receiverId: string;
  receiver?: UserProfile;
  content: string;
  status: MessageStatus;
  readAt?: number;
  metadata?: Record<string, any>;
}

export interface PrivateMessage extends Message {
  type: 'private';
  conversationId: string;
}

export interface SystemMessage extends Message {
  type: 'system';
  category: 'task' | 'post' | 'comment' | 'like' | 'follow' | 'system' | 'activity';
  relatedId?: string;
  relatedType?: string;
}

export interface InvitationMessage extends Message {
  type: 'invitation';
  invitationType: 'task' | 'circle' | 'activity';
  relatedId: string;
  invitationStatus: 'pending' | 'accepted' | 'declined' | 'expired';
}

export interface SendMessageParams {
  receiverId: string;
  content: string;
  type?: MessageType;
  metadata?: Record<string, any>;
}

export interface MessageListParams extends PaginationParams {
  type?: MessageType;
  conversationId?: string;
  status?: MessageStatus;
}

export type MessageListResult = PaginationResult<Message>;

export interface Conversation extends BaseEntity {
  id: string;
  participants: string[];
  participantUsers: UserProfile[];
  lastMessage?: Message;
  unreadCount: number;
  updatedAt: number;
}

export interface ConversationListParams extends PaginationParams {}

export type ConversationListResult = PaginationResult<Conversation>;

export interface SystemNotificationParams extends PaginationParams {
  category?: string;
  isRead?: boolean;
}

export type SystemNotificationResult = PaginationResult<SystemMessage>;

export interface UnreadCount {
  total: number;
  private: number;
  system: number;
  invitation: number;
}
