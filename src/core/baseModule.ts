import { SDKContext } from './config';
import { EventBus } from './eventBus';
import { SensitiveWordFilter } from './sensitiveWordFilter';

export abstract class BaseModule {
  protected context: SDKContext;
  protected eventBus: EventBus;
  protected sensitiveWordFilter: SensitiveWordFilter;

  constructor(context: SDKContext) {
    this.context = context;
    this.eventBus = context.eventBus;
    this.sensitiveWordFilter = context.sensitiveWordFilter;
  }

  protected get currentUserId(): string | undefined {
    return this.context.config.currentUserId;
  }

  protected get currentUser() {
    return this.context.currentUser;
  }

  protected get isAdmin(): boolean {
    const adminIds = this.context.config.adminIds || [];
    return this.currentUserId ? adminIds.includes(this.currentUserId) : false;
  }

  protected requireLogin(): void {
    if (!this.currentUserId) {
      throw new Error('用户未登录，请先设置当前用户');
    }
  }

  protected checkContentSensitive(content: string): void {
    if (!this.context.config.enableSensitiveWordCheck) return;
    const result = this.sensitiveWordFilter.check(content);
    if (!result.passed) {
      throw new Error(`内容包含敏感词：${result.hits.map(h => h.word).join('、')}`);
    }
  }

  protected filterContent(content: string): string {
    if (!this.context.config.enableSensitiveWordCheck) return content;
    return this.sensitiveWordFilter.filter(content);
  }

  protected emit(event: string, ...args: any[]): void {
    this.eventBus.emit(event, ...args);
  }

  protected on(event: string, handler: (...args: any[]) => void): () => void {
    return this.eventBus.on(event, handler);
  }
}
