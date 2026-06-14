import { SDKConfig, SDKContext, createDefaultConfig } from './core/config';
import { EventBus } from './core/eventBus';
import { SensitiveWordFilter, createDefaultFilter, defaultSensitiveWords } from './core/sensitiveWordFilter';
import { UserModule } from './modules/userModule';
import { TopicModule } from './modules/topicModule';
import { PostModule } from './modules/postModule';
import { TaskModule } from './modules/taskModule';
import { MessageModule } from './modules/messageModule';
import { ReportModule } from './modules/reportModule';
import { CallbackModule } from './modules/callbackModule';
import { UserProfile } from './types';

export class JobSocialSDK {
  private config: SDKConfig;
  private context: SDKContext;
  public eventBus: EventBus;
  public sensitiveWordFilter: SensitiveWordFilter;

  public user: UserModule;
  public topic: TopicModule;
  public post: PostModule;
  public task: TaskModule;
  public message: MessageModule;
  public report: ReportModule;
  public callback: CallbackModule;

  private static instance: JobSocialSDK | null = null;

  constructor(config: SDKConfig = {}) {
    this.config = { ...createDefaultConfig(), ...config };
    this.eventBus = new EventBus();
    this.sensitiveWordFilter = createDefaultFilter();

    if (config.sensitiveWords) {
      this.sensitiveWordFilter.addWords(config.sensitiveWords);
    }

    this.context = {
      config: this.config,
      eventBus: this.eventBus,
      sensitiveWordFilter: this.sensitiveWordFilter,
      setCurrentUser: (user: UserProfile) => {
        this.context.currentUser = user;
        this.config.currentUserId = user.id;
      }
    };

    this.user = new UserModule(this.context);
    this.topic = new TopicModule(this.context);
    this.post = new PostModule(this.context);
    this.task = new TaskModule(this.context);
    this.message = new MessageModule(this.context);
    this.report = new ReportModule(this.context);
    this.callback = new CallbackModule(this.context);

    this.post.setDependencies(this.user, this.topic);
    this.task.setDependencies(this.user, this.post);
    this.message.setDependencies(this.user);
    this.report.setDependencies(this.user, this.post, this.message, this.task);
    this.callback.setMessageModule(this.message);

    this.post.setUserModule(this.user);
    this.message.setUserModule(this.user);
    this.task.setUserModule(this.user);
    this.topic.setUserModule(this.user);
    this.report.setUserModule(this.user);
  }

  static getInstance(config?: SDKConfig): JobSocialSDK {
    if (!JobSocialSDK.instance) {
      JobSocialSDK.instance = new JobSocialSDK(config);
    } else if (config) {
      JobSocialSDK.instance.updateConfig(config);
    }
    return JobSocialSDK.instance;
  }

  setCurrentUser(user: UserProfile): void {
    this.user.setCurrentUser(user);
  }

  getCurrentUser(): UserProfile | undefined {
    return this.user.getCurrentUser();
  }

  updateConfig(config: Partial<SDKConfig>): void {
    Object.assign(this.config, config);

    if (config.sensitiveWords) {
      this.sensitiveWordFilter.clear();
      this.sensitiveWordFilter.addWords(defaultSensitiveWords);
      this.sensitiveWordFilter.addWords(config.sensitiveWords);
    }

    if (config.callback) {
      this.callback.setCallbackConfig(config.callback);
    }
  }

  getConfig(): SDKConfig {
    return { ...this.config };
  }

  on(event: string, handler: (...args: any[]) => void): () => void {
    return this.eventBus.on(event, handler);
  }

  off(event: string, handler: (...args: any[]) => void): void {
    this.eventBus.off(event, handler);
  }

  addSensitiveWords(words: string[]): void {
    this.sensitiveWordFilter.addWords(words);
  }

  removeSensitiveWord(word: string): boolean {
    return this.sensitiveWordFilter.removeWord(word);
  }

  checkSensitiveContent(content: string): boolean {
    return this.sensitiveWordFilter.hasSensitiveWord(content);
  }

  filterSensitiveContent(content: string): string {
    return this.sensitiveWordFilter.filter(content);
  }

  destroy(): void {
    this.eventBus.clear();
    JobSocialSDK.instance = null;
  }

  getVersion(): string {
    return '1.0.0';
  }
}

export function createSDK(config?: SDKConfig): JobSocialSDK {
  return new JobSocialSDK(config);
}

export default JobSocialSDK;
