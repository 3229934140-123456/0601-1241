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
  CallbackStatus,
  ActivitySignupData,
  UserDynamicData
} from '../types';
import { generateId, getCurrentTime } from '../utils/helpers';

export class CallbackModule extends BaseModule {
  private callbackStore: BaseStore<CallbackRecord>;
  private handlers: Map<CallbackType, Set<CallbackHandler>> = new Map();
  private config: CallbackConfig;
  private messageModule: any;

  constructor(context: SDKContext) {
    super(context);
    this.callbackStore = new BaseStore<CallbackRecord>();
    this.config = context.config.callback || {};
    this.setupEventListeners();
  }

  setMessageModule(messageModule: any): void {
    this.messageModule = messageModule;
  }

  private notifyUser(userId: string, content: string, category: string, relatedId?: string, relatedType?: string): void {
    if (this.messageModule) {
      this.messageModule.sendSystemNotification(userId, content, category, relatedId, relatedType);
    }
  }

  private setupEventListeners(): void {
    this.eventBus.on('post:publish', (post: any) => {
      this.pushCallback('post_publish', {
        postId: post.id,
        userId: post.userId,
        title: post.title,
        content: post.content,
        type: post.type,
        timestamp: post.createdAt
      }, 'post_publish');

      this.syncUserDynamic({
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
      this.syncUserDynamic({
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
      this.syncUserDynamic({
        userId: data.claimerId,
        dynamicType: 'task_claim',
        dynamicId: data.taskId,
        timestamp: getCurrentTime(),
        relatedId: data.taskId,
        relatedType: 'task'
      });
    });

    this.eventBus.on('task:accept', (data: any) => {
      this.syncUserDynamic({
        userId: data.claimerId,
        dynamicType: 'task_accept',
        dynamicId: data.taskId,
        content: '任务申请已被接受',
        timestamp: getCurrentTime(),
        relatedId: data.taskId,
        relatedType: 'task'
      });

      this.notifyUser(
        data.claimerId,
        '您申请的互助任务已被接受，快去完成吧！',
        'task',
        data.taskId,
        'task'
      );
    });

    this.eventBus.on('task:complete', (data: any) => {
      this.pushCallback('task_complete', {
        taskId: data.taskId,
        task: data.task,
        timestamp: getCurrentTime()
      }, 'task_complete');

      if (data.task?.claimerId) {
        this.syncUserDynamic({
          userId: data.task.claimerId,
          dynamicType: 'task_complete',
          dynamicId: data.taskId,
          content: '完成了互助任务',
          timestamp: getCurrentTime(),
          relatedId: data.taskId,
          relatedType: 'task'
        });

        this.notifyUser(
          data.task.publisherId,
          '您发布的互助任务已被完成，快去评价吧！',
          'task_complete',
          data.taskId,
          'task'
        );

        this.notifyUser(
          data.task.claimerId,
          '恭喜！您已成功完成互助任务。',
          'task_complete',
          data.taskId,
          'task'
        );
      }
    });

    this.eventBus.on('task:rate', (data: any) => {
      const review = data.review;
      const task = data.task || {};

      this.syncUserDynamic({
        userId: review.reviewerId,
        dynamicType: 'task_rate',
        dynamicId: review.taskId,
        content: `评价了互助任务，评分${review.rating}分`,
        timestamp: getCurrentTime(),
        relatedId: review.taskId,
        relatedType: 'task'
      });

      if (task.publisherId) {
        this.notifyUser(
          task.publisherId,
          `您发布的互助任务已被评价，评分${review.rating}分`,
          'task_rate',
          review.taskId,
          'task'
        );
      }

      if (task.claimerId) {
        this.notifyUser(
          task.claimerId,
          `您完成的任务获得了${review.rating}星评价：${review.comment}`,
          'task_rate',
          review.taskId,
          'task'
        );
      }
    });

    this.eventBus.on('user:follow', (data: any) => {
      this.syncUserDynamic({
        userId: data.userId,
        dynamicType: 'follow',
        dynamicId: data.targetUserId,
        timestamp: getCurrentTime(),
        relatedId: data.targetUserId,
        relatedType: 'user'
      });
    });

    this.eventBus.on('report:submit', (report: any) => {
      this.pushCallback('report_submit', {
        reportId: report.id,
        reporterId: report.reporterId,
        type: report.type,
        contentType: report.contentType,
        contentId: report.contentId,
        reason: report.reason,
        timestamp: report.createdAt
      }, 'report_submit');
    });

    this.eventBus.on('activity:signup', (data: any) => {
      this.pushCallback('activity_signup', data, 'activity_signup');
    });
  }

  private async simulateHttpPush(url: string, payload: Record<string, any>): Promise<{ success: boolean; response?: string; error?: string }> {
    if (!url) {
      return { success: false, error: '回调地址未配置' };
    }

    try {
      const controller = new AbortController();
      const timeout = this.config.timeout || 10000;
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: generateId('evt'),
          timestamp: getCurrentTime(),
          data: payload
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const text = await response.text();
        return { success: true, response: text };
      } else {
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  }

  private getCallbackUrls(type: CallbackType): string[] {
    const urlMap: Record<CallbackType, string | string[] | undefined> = {
      'activity_signup': this.config.activitySignupUrl,
      'user_dynamic_sync': this.config.userDynamicSyncUrl,
      'post_publish': this.config.postPublishUrl,
      'task_complete': this.config.taskCompleteUrl,
      'report_submit': this.config.reportSubmitUrl
    };
    const urls = urlMap[type];
    if (!urls) return [];
    return Array.isArray(urls) ? urls : [urls];
  }

  private async pushCallback(type: CallbackType, payload: Record<string, any>, customEventType?: string): Promise<void> {
    const urls = this.getCallbackUrls(type);
    const eventType = customEventType || type;

    this.invokeLocalHandlers(type, payload);

    if (urls.length === 0) {
      this.callbackStore.create(
        {
          type,
          eventType,
          callbackUrl: '',
          payload,
          status: 'success' as CallbackStatus,
          retryCount: 0
        },
        'cb'
      );
      return;
    }

    for (const url of urls) {
      const record = this.callbackStore.create(
        {
          type,
          eventType,
          callbackUrl: url,
          payload,
          status: 'pending' as CallbackStatus,
          retryCount: 0
        },
        'cb'
      );

      this.simulateHttpPush(url, payload).then(result => {
        this.callbackStore.update(record.id, {
          status: result.success ? 'success' : 'failed',
          response: result.response,
          errorMessage: result.error
        });
      });
    }
  }

  private invokeLocalHandlers(type: CallbackType, payload: Record<string, any>): void {
    const event: CallbackEvent = {
      type,
      eventType: type,
      data: payload,
      timestamp: getCurrentTime(),
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
  }

  private async syncUserDynamic(data: UserDynamicData): Promise<void> {
    const urls = this.getCallbackUrls('user_dynamic_sync');
    const eventType = `user_dynamic_${data.dynamicType}`;

    this.invokeLocalHandlers('user_dynamic_sync', data as unknown as Record<string, any>);

    if (urls.length === 0) {
      this.callbackStore.create(
        {
          type: 'user_dynamic_sync' as CallbackType,
          eventType,
          callbackUrl: '',
          payload: data as unknown as Record<string, any>,
          status: 'success' as CallbackStatus,
          retryCount: 0
        },
        'cb'
      );
      return;
    }

    for (const url of urls) {
      const record = this.callbackStore.create(
        {
          type: 'user_dynamic_sync' as CallbackType,
          eventType,
          callbackUrl: url,
          payload: data as unknown as Record<string, any>,
          status: 'pending' as CallbackStatus,
          retryCount: 0
        },
        'cb'
      );

      this.simulateHttpPush(url, data as unknown as Record<string, any>).then(result => {
        this.callbackStore.update(record.id, {
          status: result.success ? 'success' : 'failed',
          response: result.response,
          errorMessage: result.error
        });
      });
    }
  }

  on(type: CallbackType | string, handler: CallbackHandler): () => void {
    const key = type as CallbackType;
    if (!this.handlers.has(key)) {
      this.handlers.set(key, new Set());
    }
    this.handlers.get(key)!.add(handler);
    return () => { this.off(key, handler); };
  }

  off(type: CallbackType | string, handler: CallbackHandler): void {
    const key = type as CallbackType;
    const handlers = this.handlers.get(key);
    if (handlers) { handlers.delete(handler); }
  }

  triggerCallback(type: CallbackType, eventType: string, payload: Record<string, any>): void {
    this.pushCallback(type, payload, eventType);
  }

  triggerActivitySignup(data: ActivitySignupData): void {
    this.pushCallback('activity_signup', data as unknown as Record<string, any>);
  }

  triggerUserDynamic(data: UserDynamicData): void {
    this.syncUserDynamic(data);
  }

  onActivitySignup(handler: CallbackHandler): () => void { return this.on('activity_signup', handler); }
  onUserDynamicSync(handler: CallbackHandler): () => void { return this.on('user_dynamic_sync', handler); }
  onPostPublish(handler: CallbackHandler): () => void { return this.on('post_publish', handler); }
  onTaskComplete(handler: CallbackHandler): () => void { return this.on('task_complete', handler); }
  onReportSubmit(handler: CallbackHandler): () => void { return this.on('report_submit', handler); }

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
    if (params.eventType) {
      records = records.filter(r =>
        r.eventType === params.eventType ||
        r.eventType.startsWith(params.eventType + '_') ||
        r.type === params.eventType
      );
    }
    if (params.callbackUrl) {
      records = records.filter(r => r.callbackUrl === params.callbackUrl);
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

  getCallbacksByStatus(status: CallbackStatus, params: CallbackParams = {}): CallbackListResult {
    return this.getCallbackList({ ...params, status });
  }

  getCallbacksByEventType(eventType: string, params: CallbackParams = {}): CallbackListResult {
    return this.getCallbackList({ ...params, eventType });
  }

  getCallbacksByUrl(callbackUrl: string, params: CallbackParams = {}): CallbackListResult {
    return this.getCallbackList({ ...params, callbackUrl });
  }

  getCallbackUrlList(): string[] {
    if (!this.isAdmin) {
      throw new Error('只有管理员可以查看回调地址列表');
    }

    const urls = new Set<string>();
    const records = this.callbackStore.getAll();
    records.forEach(r => {
      if (r.callbackUrl) urls.add(r.callbackUrl);
    });
    return Array.from(urls);
  }

  async retryCallback(recordId: string): Promise<boolean> {
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
      lastRetryAt: getCurrentTime()
    });

    if (record.callbackUrl) {
      const result = await this.simulateHttpPush(record.callbackUrl, record.payload);
      this.callbackStore.update(recordId, {
        status: result.success ? 'success' : 'failed',
        response: result.response,
        errorMessage: result.error
      });
      return result.success;
    }

    this.invokeLocalHandlers(record.type, record.payload);
    this.callbackStore.update(recordId, { status: 'success' });
    return true;
  }

  setCallbackConfig(config: Partial<CallbackConfig>): void {
    this.config = { ...this.config, ...config };
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
    const stats = { total: records.length, success: 0, failed: 0, pending: 0, retrying: 0 };
    records.forEach(r => { stats[r.status]++; });
    return stats;
  }

  getCallbackStatsByUrl(): {
    url: string;
    total: number;
    success: number;
    failed: number;
    pending: number;
    retrying: number;
  }[] {
    if (!this.isAdmin) {
      throw new Error('只有管理员可以查看回调统计');
    }

    const records = this.callbackStore.getAll();
    const statsMap = new Map<string, { url: string; total: number; success: number; failed: number; pending: number; retrying: number }>();

    records.forEach(r => {
      const url = r.callbackUrl || '(本地事件)';
      if (!statsMap.has(url)) {
        statsMap.set(url, { url, total: 0, success: 0, failed: 0, pending: 0, retrying: 0 });
      }
      const stats = statsMap.get(url)!;
      stats.total++;
      stats[r.status]++;
    });

    return Array.from(statsMap.values());
  }

  clearCallbacks(): void {
    if (!this.isAdmin) {
      throw new Error('只有管理员可以清除回调记录');
    }
    this.callbackStore.clear();
  }
}
