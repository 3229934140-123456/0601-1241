import { BaseModule } from '../core/baseModule';
import { BaseStore } from '../core/baseStore';
import { SDKContext } from '../core/config';
import {
  CallbackRecord,
  CallbackConfig,
  CallbackParams,
  CallbackListResult,
  CallbackEvent,
  CallbackHandler,
  CallbackType,
  ActivitySignupData,
  UserDynamicData
} from '../types';
import { generateId } from '../utils/helpers';

export class CallbackModule extends BaseModule {
  private callbackStore: BaseStore<CallbackRecord>;
  private handlers: Map<CallbackType, Set<CallbackHandler>> = new Map();
  private config: CallbackConfig;

  constructor(context: SDKContext) {
    super(context);
    this.callbackStore = new BaseStore<CallbackRecord>();
    this.config = context.config.callback || {};
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.eventBus.on('post:publish', (post: any) => {
      this.triggerCallback('post_publish', 'post_publish', {
        postId: post.id,
        userId: post.userId,
        title: post.title,
        content: post.content,
        type: post.type,
        timestamp: post.createdAt
      });

      this.triggerUserDynamic({
        userId: post.userId,
        dynamicType: 'post_publish',
        dynamicId: post.id,
        content: post.title,
        timestamp: post.createdAt,
        relatedId: post.id,
        relatedType: 'post'
      });
    });

    this.eventBus.on('comment:publish', (comment: any) => {
      this.triggerUserDynamic({
        userId: comment.userId,
        dynamicType: 'comment_publish',
        dynamicId: comment.id,
        content: comment.content.slice(0, 100),
        timestamp: comment.createdAt,
        relatedId: comment.postId,
        relatedType: 'post'
      });
    });

    this.eventBus.on('task:claim', (data: any) => {
      this.triggerUserDynamic({
        userId: data.claimerId,
        dynamicType: 'task_claim',
        dynamicId: data.taskId,
        timestamp: Date.now(),
        relatedId: data.taskId,
        relatedType: 'task'
      });
    });

    this.eventBus.on('task:complete', (data: any) => {
      this.triggerCallback('task_complete', 'task_complete', {
        taskId: data.taskId,
        task: data.task,
        timestamp: Date.now()
      });

      if (data.task?.claimerId) {
        this.triggerUserDynamic({
          userId: data.task.claimerId,
          dynamicType: 'task_complete',
          dynamicId: data.taskId,
          timestamp: Date.now(),
          relatedId: data.taskId,
          relatedType: 'task'
        });
      }
    });

    this.eventBus.on('user:follow', (data: any) => {
      this.triggerUserDynamic({
        userId: data.userId,
        dynamicType: 'follow',
        dynamicId: data.targetUserId,
        timestamp: Date.now(),
        relatedId: data.targetUserId,
        relatedType: 'user'
      });
    });

    this.eventBus.on('report:submit', (report: any) => {
      this.triggerCallback('report_submit', 'report_submit', {
        reportId: report.id,
        reporterId: report.reporterId,
        type: report.type,
        contentType: report.contentType,
        contentId: report.contentId,
        reason: report.reason,
        timestamp: report.createdAt
      });
    });
  }

  on(type: CallbackType | string, handler: CallbackHandler): () => void {
    const key = type as CallbackType;
    if (!this.handlers.has(key)) {
      this.handlers.set(key, new Set());
    }
    this.handlers.get(key)!.add(handler);

    return () => {
      this.off(key, handler);
    };
  }

  off(type: CallbackType | string, handler: CallbackHandler): void {
    const key = type as CallbackType;
    const handlers = this.handlers.get(key);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  triggerCallback(
    type: CallbackType,
    eventType: string,
    payload: Record<string, any>
  ): void {
    const event: CallbackEvent = {
      type,
      eventType,
      data: payload,
      timestamp: Date.now(),
      eventId: generateId('evt')
    };

    const handlers = this.handlers.get(type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          const result = handler(event);
          if (result && typeof (result as Promise<void>).then === 'function') {
            (result as Promise<void>).catch(err => {
              console.error(`Callback handler error for ${type}:`, err);
            });
          }
        } catch (error) {
          console.error(`Callback handler error for ${type}:`, error);
        }
      });
    }

    this.callbackStore.create(
      {
        type,
        eventType,
        callbackUrl: this.getCallbackUrl(type) || '',
        payload,
        status: 'pending',
        retryCount: 0
      },
      'cb'
    );
  }

  private getCallbackUrl(type: CallbackType): string | undefined {
    const urlMap: Record<CallbackType, string | undefined> = {
      'activity_signup': this.config.activitySignupUrl,
      'user_dynamic_sync': this.config.userDynamicSyncUrl,
      'post_publish': this.config.postPublishUrl,
      'task_complete': this.config.taskCompleteUrl,
      'report_submit': this.config.reportSubmitUrl
    };
    return urlMap[type];
  }

  triggerActivitySignup(data: ActivitySignupData): void {
    this.triggerCallback('activity_signup', 'activity_signup', data);
  }

  triggerUserDynamic(data: UserDynamicData): void {
    this.triggerCallback('user_dynamic_sync', 'user_dynamic_sync', data);
  }

  onActivitySignup(handler: CallbackHandler): () => void {
    return this.on('activity_signup', handler);
  }

  onUserDynamicSync(handler: CallbackHandler): () => void {
    return this.on('user_dynamic_sync', handler);
  }

  onPostPublish(handler: CallbackHandler): () => void {
    return this.on('post_publish', handler);
  }

  onTaskComplete(handler: CallbackHandler): () => void {
    return this.on('task_complete', handler);
  }

  onReportSubmit(handler: CallbackHandler): () => void {
    return this.on('report_submit', handler);
  }

  getCallbackList(params: CallbackParams): CallbackListResult {
    if (!this.isAdmin) {
      throw new Error('只有管理员可以查看回调记录');
    }

    let records = this.callbackStore.getAll();

    if (params.type) {
      records = records.filter(r => r.type === params.type);
    }

    if (params.status) {
      records = records.filter(r => r.status === params.status);
    }

    records.sort((a, b) => b.createdAt - a.createdAt);

    return this.callbackStore.paginate(records, params);
  }

  getCallbackRecord(recordId: string): CallbackRecord | undefined {
    if (!this.isAdmin) {
      throw new Error('只有管理员可以查看回调记录');
    }
    return this.callbackStore.getById(recordId);
  }

  retryCallback(recordId: string): boolean {
    if (!this.isAdmin) {
      throw new Error('只有管理员可以重试回调');
    }

    const record = this.callbackStore.getById(recordId);
    if (!record) return false;

    const maxRetries = this.config.maxRetries || 3;
    if (record.retryCount >= maxRetries) {
      throw new Error('已达到最大重试次数');
    }

    this.callbackStore.update(recordId, {
      status: 'retrying',
      retryCount: record.retryCount + 1,
      lastRetryAt: Date.now()
    });

    const event: CallbackEvent = {
      type: record.type,
      eventType: record.eventType,
      data: record.payload,
      timestamp: Date.now(),
      eventId: generateId('evt')
    };

    const handlers = this.handlers.get(record.type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          console.error('Retry callback error:', error);
        }
      });
    }

    this.callbackStore.update(recordId, { status: 'success' });

    return true;
  }

  setCallbackConfig(config: Partial<CallbackConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }

  getCallbackConfig(): CallbackConfig {
    return { ...this.config };
  }

  getCallbackStats(): {
    total: number;
    success: number;
    failed: number;
    pending: number;
    retrying: number;
  } {
    if (!this.isAdmin) {
      throw new Error('只有管理员可以查看回调统计');
    }

    const records = this.callbackStore.getAll();
    const stats = {
      total: records.length,
      success: 0,
      failed: 0,
      pending: 0,
      retrying: 0
    };

    records.forEach(r => {
      stats[r.status]++;
    });

    return stats;
  }

  clearCallbacks(): void {
    if (!this.isAdmin) {
      throw new Error('只有管理员可以清除回调记录');
    }
    this.callbackStore.clear();
  }
}
