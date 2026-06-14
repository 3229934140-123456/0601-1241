import { BaseModule } from '../core/baseModule';
import { BaseStore } from '../core/baseStore';
import { SDKContext } from '../core/config';
import {
  Message,
  PrivateMessage,
  SystemMessage,
  InvitationMessage,
  SendMessageParams,
  MessageListParams,
  MessageListResult,
  Conversation,
  ConversationListParams,
  ConversationListResult,
  SystemNotificationParams,
  SystemNotificationResult,
  UnreadCount,
  MessageType,
  UserProfile
} from '../types';

export class MessageModule extends BaseModule {
  private messageStore: BaseStore<Message>;
  private conversationStore: BaseStore<Conversation>;
  private userModule: any;

  constructor(context: SDKContext, userModule?: any) {
    super(context);
    this.messageStore = new BaseStore<Message>();
    this.conversationStore = new BaseStore<Conversation>();
    this.userModule = userModule;
  }

  setDependencies(userModule: any): void {
    this.userModule = userModule;
  }

  private getUser(userId: string): UserProfile {
    if (this.userModule) {
      const user = this.userModule.getUser(userId);
      if (user) return user;
    }
    const now = Date.now();
    return {
      id: userId,
      nickname: '用户' + userId.slice(-4),
      avatar: '',
      contributionValue: 0,
      level: 1,
      createdAt: now,
      updatedAt: now
    };
  }

  private getConversationId(userId1: string, userId2: string): string {
    const ids = [userId1, userId2].sort();
    return `conv_${ids[0]}_${ids[1]}`;
  }

  sendPrivateMessage(params: SendMessageParams): PrivateMessage {
    this.requireLogin();
    const senderId = this.currentUserId!;

    if (senderId === params.receiverId) {
      throw new Error('不能给自己发消息');
    }

    this.checkContentSensitive(params.content);

    const conversationId = this.getConversationId(senderId, params.receiverId);
    const sender = this.getUser(senderId);
    const receiver = this.getUser(params.receiverId);

    const message = this.messageStore.create(
      {
        type: 'private',
        senderId,
        sender,
        receiverId: params.receiverId,
        receiver,
        content: this.filterContent(params.content),
        status: 'unread',
        metadata: params.metadata
      },
      'msg'
    ) as PrivateMessage;

    message.conversationId = conversationId;
    this.messageStore.update(message.id, { conversationId } as any);

    this.updateConversation(conversationId, senderId, params.receiverId, message);

    this.emit('message:sent', message);
    return message;
  }

  private updateConversation(
    conversationId: string,
    senderId: string,
    receiverId: string,
    lastMessage: Message
  ): void {
    let conversation = this.conversationStore.getById(conversationId);

    const participantUsers = [this.getUser(senderId), this.getUser(receiverId)];

    if (!conversation) {
      conversation = this.conversationStore.create(
        {
          id: conversationId,
          participants: [senderId, receiverId],
          participantUsers,
          lastMessage,
          unreadCount: 1,
          updatedAt: lastMessage.createdAt
        },
        'conv'
      );
    } else {
      this.conversationStore.update(conversationId, {
        lastMessage,
        participantUsers,
        updatedAt: lastMessage.createdAt
      });
    }
  }

  getConversationList(params: ConversationListParams): ConversationListResult {
    this.requireLogin();
    const userId = this.currentUserId!;

    let conversations = this.conversationStore.findMany(
      c => c.participants.includes(userId)
    );

    conversations.sort((a, b) => b.updatedAt - a.updatedAt);

    const result = this.conversationStore.paginate(conversations, params);

    result.list.forEach(conv => {
      const unreadCount = this.getUnreadCountInConversation(conv.id, userId);
      conv.unreadCount = unreadCount;
    });

    return result;
  }

  private getUnreadCountInConversation(conversationId: string, userId: string): number {
    const messages = this.messageStore.findMany(
      m => (m as any).conversationId === conversationId &&
        m.receiverId === userId &&
        m.status === 'unread'
    );
    return messages.length;
  }

  getMessageList(params: MessageListParams): MessageListResult {
    this.requireLogin();
    const userId = this.currentUserId!;

    let messages = this.messageStore.findMany(
      m => (m.senderId === userId || m.receiverId === userId) && m.status !== 'deleted'
    );

    if (params.type) {
      messages = messages.filter(m => m.type === params.type);
    }

    if (params.conversationId) {
      messages = messages.filter(m => (m as any).conversationId === params.conversationId);
    }

    if (params.status) {
      messages = messages.filter(m => m.status === params.status);
    }

    messages.sort((a, b) => a.createdAt - b.createdAt);

    return this.messageStore.paginate(messages, params);
  }

  getPrivateMessages(
    targetUserId: string,
    params: { page?: number; pageSize?: number }
  ): MessageListResult {
    this.requireLogin();
    const userId = this.currentUserId!;

    const conversationId = this.getConversationId(userId, targetUserId);

    let messages = this.messageStore.findMany(
      m => (m as any).conversationId === conversationId && m.status !== 'deleted'
    );

    messages.sort((a, b) => a.createdAt - b.createdAt);

    return this.messageStore.paginate(messages, params);
  }

  markAsRead(messageIds: string[]): number {
    this.requireLogin();
    const userId = this.currentUserId!;

    let count = 0;
    messageIds.forEach(id => {
      const msg = this.messageStore.getById(id);
      if (msg && msg.receiverId === userId && msg.status === 'unread') {
        this.messageStore.update(id, { status: 'read', readAt: Date.now() });
        count++;
      }
    });

    return count;
  }

  markConversationAsRead(targetUserId: string): number {
    this.requireLogin();
    const userId = this.currentUserId!;

    const conversationId = this.getConversationId(userId, targetUserId);

    const messages = this.messageStore.findMany(
      m => (m as any).conversationId === conversationId &&
        m.receiverId === userId &&
        m.status === 'unread'
    );

    messages.forEach(msg => {
      this.messageStore.update(msg.id, { status: 'read', readAt: Date.now() });
    });

    return messages.length;
  }

  markAllAsRead(type?: MessageType): number {
    this.requireLogin();
    const userId = this.currentUserId!;

    let messages = this.messageStore.findMany(
      m => m.receiverId === userId && m.status === 'unread'
    );

    if (type) {
      messages = messages.filter(m => m.type === type);
    }

    messages.forEach(msg => {
      this.messageStore.update(msg.id, { status: 'read', readAt: Date.now() });
    });

    return messages.length;
  }

  sendSystemNotification(
    receiverId: string,
    content: string,
    category: SystemMessage['category'] = 'system',
    relatedId?: string,
    relatedType?: string
  ): SystemMessage {
    const receiver = this.getUser(receiverId);

    const message = this.messageStore.create(
      {
        type: 'system',
        senderId: 'system',
        sender: {
          id: 'system',
          nickname: '系统通知',
          avatar: '',
          contributionValue: 0,
          level: 1
        },
        receiverId,
        receiver,
        content,
        status: 'unread',
        category,
        relatedId,
        relatedType
      } as SystemMessage,
      'sysmsg'
    ) as SystemMessage;

    this.emit('message:system', message);
    return message;
  }

  getSystemNotifications(params: SystemNotificationParams): SystemNotificationResult {
    this.requireLogin();
    const userId = this.currentUserId!;

    let messages = this.messageStore.findMany(
      m => m.type === 'system' && m.receiverId === userId && m.status !== 'deleted'
    ) as SystemMessage[];

    if (params.category) {
      messages = messages.filter(m => m.category === params.category);
    }

    if (params.isRead !== undefined) {
      messages = messages.filter(m =>
        params.isRead ? m.status === 'read' : m.status === 'unread'
      );
    }

    messages.sort((a, b) => b.createdAt - a.createdAt);

    return this.messageStore.paginate(messages, params) as SystemNotificationResult;
  }

  sendInvitation(
    receiverId: string,
    invitationType: InvitationMessage['invitationType'],
    relatedId: string,
    content: string
  ): InvitationMessage {
    this.requireLogin();
    const senderId = this.currentUserId!;

    if (senderId === receiverId) {
      throw new Error('不能邀请自己');
    }

    this.checkContentSensitive(content);

    const sender = this.getUser(senderId);
    const receiver = this.getUser(receiverId);

    const message = this.messageStore.create(
      {
        type: 'invitation',
        senderId,
        sender,
        receiverId,
        receiver,
        content: this.filterContent(content),
        status: 'unread',
        invitationType,
        relatedId,
        invitationStatus: 'pending'
      } as InvitationMessage,
      'invmsg'
    ) as InvitationMessage;

    this.emit('message:invitation', message);
    return message;
  }

  respondToInvitation(
    messageId: string,
    accepted: boolean
  ): InvitationMessage | undefined {
    this.requireLogin();
    const userId = this.currentUserId!;

    const message = this.messageStore.getById(messageId) as InvitationMessage;
    if (!message || message.type !== 'invitation') {
      return undefined;
    }

    if (message.receiverId !== userId) {
      throw new Error('无权限处理此邀请');
    }

    if (message.invitationStatus !== 'pending') {
      throw new Error('此邀请已处理');
    }

    const status: InvitationMessage['invitationStatus'] = accepted ? 'accepted' : 'declined';
    const updated = this.messageStore.update(messageId, {
      invitationStatus: status,
      status: 'read',
      readAt: Date.now()
    } as Partial<InvitationMessage>) as InvitationMessage;

    this.emit(`message:invitation_${status}`, { messageId, accepted });
    return updated;
  }

  getUnreadCount(): UnreadCount {
    this.requireLogin();
    const userId = this.currentUserId!;

    const messages = this.messageStore.findMany(
      m => m.receiverId === userId && m.status === 'unread'
    );

    const count: UnreadCount = {
      total: messages.length,
      private: 0,
      system: 0,
      invitation: 0
    };

    messages.forEach(m => {
      if (m.type === 'private') count.private++;
      else if (m.type === 'system') count.system++;
      else if (m.type === 'invitation') count.invitation++;
    });

    return count;
  }

  deleteMessage(messageId: string): boolean {
    this.requireLogin();
    const userId = this.currentUserId!;

    const message = this.messageStore.getById(messageId);
    if (!message) return false;

    if (message.senderId !== userId && message.receiverId !== userId) {
      throw new Error('无权限删除此消息');
    }

    this.messageStore.update(messageId, { status: 'deleted' });
    return true;
  }

  deleteConversation(targetUserId: string): boolean {
    this.requireLogin();
    const userId = this.currentUserId!;

    const conversationId = this.getConversationId(userId, targetUserId);
    return this.conversationStore.delete(conversationId);
  }

  sendTaskInvitation(receiverId: string, taskId: string, message: string): InvitationMessage {
    return this.sendInvitation(receiverId, 'task', taskId, message);
  }

  sendCircleInvitation(receiverId: string, circleId: string, message: string): InvitationMessage {
    return this.sendInvitation(receiverId, 'circle', circleId, message);
  }

  sendActivityInvitation(receiverId: string, activityId: string, message: string): InvitationMessage {
    return this.sendInvitation(receiverId, 'activity', activityId, message);
  }
}
