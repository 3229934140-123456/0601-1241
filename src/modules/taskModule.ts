import { BaseModule } from '../core/baseModule';
import { BaseStore } from '../core/baseStore';
import { SDKContext } from '../core/config';
import {
  HelpTask,
  CreateTaskParams,
  TaskListParams,
  TaskListResult,
  TaskApplication,
  ApplyTaskParams,
  TaskReview,
  CompleteTaskParams,
  RateTaskParams,
  TaskStatus,
  TaskType,
  UserProfile
} from '../types';

export class TaskModule extends BaseModule {
  private taskStore: BaseStore<HelpTask>;
  private applicationStore: BaseStore<TaskApplication>;
  private reviewStore: BaseStore<TaskReview>;
  private userModule: any;
  private postModule: any;

  constructor(context: SDKContext, userModule?: any, postModule?: any) {
    super(context);
    this.taskStore = new BaseStore<HelpTask>();
    this.applicationStore = new BaseStore<TaskApplication>();
    this.reviewStore = new BaseStore<TaskReview>();
    this.userModule = userModule;
    this.postModule = postModule;
  }

  setDependencies(userModule: any, postModule: any): void {
    this.userModule = userModule;
    this.postModule = postModule;
  }

  private getPublisher(userId: string): UserProfile {
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

  createTask(params: CreateTaskParams): HelpTask {
    this.requireLogin();
    const userId = this.currentUserId!;

    this.checkContentSensitive(params.title);
    this.checkContentSensitive(params.description);

    if (params.bountyAmount <= 0) {
      throw new Error('悬赏金额必须大于0');
    }

    const publisher = this.getPublisher(userId);

    const task = this.taskStore.create(
      {
        publisherId: userId,
        publisher,
        type: params.type,
        title: this.filterContent(params.title),
        description: this.filterContent(params.description),
        bountyAmount: params.bountyAmount,
        priority: params.priority || 'medium',
        status: 'open',
        deadline: params.deadline,
        tags: params.tags,
        attachments: params.attachments,
        viewCount: 0,
        applicationCount: 0,
        isAnonymous: params.isAnonymous || false,
        anonymousName: params.anonymousName,
        relatedPostId: params.relatedPostId
      },
      'task'
    );

    this.emit('task:create', task);
    return task;
  }

  createResumeReviewTask(
    params: Omit<CreateTaskParams, 'type'> & { resumeUrl: string }
  ): HelpTask {
    return this.createTask({
      ...params,
      type: 'resume_review',
      attachments: [...(params.attachments || []), params.resumeUrl]
    });
  }

  getTask(taskId: string): HelpTask | undefined {
    const task = this.taskStore.getById(taskId);
    if (!task) return undefined;

    if (this.currentUserId && task.publisherId !== this.currentUserId) {
      this.taskStore.update(taskId, { viewCount: task.viewCount + 1 });
    }

    return task;
  }

  getTaskList(params: TaskListParams): TaskListResult {
    let tasks = this.taskStore.getAll();

    tasks = tasks.filter(t => t.status !== 'cancelled');

    if (params.type) {
      tasks = tasks.filter(t => t.type === params.type);
    }

    if (params.status) {
      tasks = tasks.filter(t => t.status === params.status);
    }

    if (params.publisherId) {
      tasks = tasks.filter(t => t.publisherId === params.publisherId);
    }

    if (params.claimerId) {
      tasks = tasks.filter(t => t.claimerId === params.claimerId);
    }

    if (params.keyword) {
      const keyword = params.keyword.toLowerCase();
      tasks = tasks.filter(
        t => t.title.toLowerCase().includes(keyword) ||
          t.description.toLowerCase().includes(keyword)
      );
    }

    if (params.minBounty !== undefined) {
      tasks = tasks.filter(t => t.bountyAmount >= params.minBounty!);
    }

    if (params.maxBounty !== undefined) {
      tasks = tasks.filter(t => t.bountyAmount <= params.maxBounty!);
    }

    if (params.reviewed === true) {
      tasks = tasks.filter(t => t.status === 'completed' && t.reviewId !== undefined);
    } else if (params.reviewed === false) {
      tasks = tasks.filter(t => t.status === 'completed' && t.reviewId === undefined);
    }

    switch (params.sortBy) {
      case 'bounty_high':
        tasks.sort((a, b) => b.bountyAmount - a.bountyAmount);
        break;
      case 'deadline':
        tasks = tasks.filter(t => t.deadline !== undefined);
        tasks.sort((a, b) => (a.deadline || 0) - (b.deadline || 0));
        break;
      case 'most_applied':
        tasks.sort((a, b) => b.applicationCount - a.applicationCount);
        break;
      default:
        tasks.sort((a, b) => b.createdAt - a.createdAt);
    }

    return this.taskStore.paginate(tasks, params);
  }

  applyForTask(params: ApplyTaskParams): TaskApplication {
    this.requireLogin();
    const userId = this.currentUserId!;

    const task = this.taskStore.getById(params.taskId);
    if (!task) {
      throw new Error('任务不存在');
    }

    if (task.status !== 'open') {
      throw new Error('任务不可申请');
    }

    if (task.publisherId === userId) {
      throw new Error('不能申请自己发布的任务');
    }

    const existingApplication = this.applicationStore.findOne(
      a => a.taskId === params.taskId && a.userId === userId
    );

    if (existingApplication) {
      throw new Error('您已申请过此任务');
    }

    this.checkContentSensitive(params.message);

    const user = this.getPublisher(userId);

    const application = this.applicationStore.create(
      {
        taskId: params.taskId,
        userId,
        user,
        message: this.filterContent(params.message),
        status: 'pending'
      },
      'app'
    );

    this.taskStore.update(params.taskId, {
      applicationCount: task.applicationCount + 1
    });

    if (this.userModule) {
      this.userModule.addContribution(userId, 'task_claim', params.taskId);
    }

    this.emit('task:apply', { taskId: params.taskId, application });
    return application;
  }

  getTaskApplications(
    taskId: string,
    params: { page?: number; pageSize?: number; status?: string }
  ): { list: TaskApplication[]; total: number; page: number; pageSize: number } {
    this.requireLogin();

    const task = this.taskStore.getById(taskId);
    if (!task) {
      throw new Error('任务不存在');
    }

    if (task.publisherId !== this.currentUserId) {
      throw new Error('只有任务发布者可以查看申请列表');
    }

    let applications = this.applicationStore.findMany(a => a.taskId === taskId);

    if (params.status) {
      applications = applications.filter(a => a.status === params.status);
    }

    applications.sort((a, b) => a.createdAt - b.createdAt);

    return this.applicationStore.paginate(applications, params);
  }

  acceptApplication(applicationId: string): TaskApplication | undefined {
    this.requireLogin();
    const userId = this.currentUserId!;

    const application = this.applicationStore.getById(applicationId);
    if (!application) return undefined;

    const task = this.taskStore.getById(application.taskId);
    if (!task) return undefined;

    if (task.publisherId !== userId) {
      throw new Error('只有任务发布者可以接受申请');
    }

    if (task.status !== 'open') {
      throw new Error('任务状态不允许接受申请');
    }

    const claimer = this.getPublisher(application.userId);

    const updatedApp = this.applicationStore.update(applicationId, {
      status: 'accepted',
      reviewedAt: Date.now(),
      reviewedBy: userId
    });

    this.taskStore.update(application.taskId, {
      status: 'claimed',
      claimerId: application.userId,
      claimer,
      claimedAt: Date.now()
    });

    this.applicationStore
      .findMany(a => a.taskId === application.taskId && a.id !== applicationId)
      .forEach(a => {
        this.applicationStore.update(a.id, {
          status: 'rejected',
          reviewedAt: Date.now(),
          reviewedBy: userId
        });
      });

    this.emit('task:accept', { taskId: task.id, applicationId, claimerId: application.userId, task: this.taskStore.getById(task.id) });
    return updatedApp;
  }

  rejectApplication(applicationId: string, reason?: string): TaskApplication | undefined {
    this.requireLogin();
    const userId = this.currentUserId!;

    const application = this.applicationStore.getById(applicationId);
    if (!application) return undefined;

    const task = this.taskStore.getById(application.taskId);
    if (!task) return undefined;

    if (task.publisherId !== userId) {
      throw new Error('只有任务发布者可以拒绝申请');
    }

    return this.applicationStore.update(applicationId, {
      status: 'rejected',
      reviewedAt: Date.now(),
      reviewedBy: userId
    });
  }

  claimTask(taskId: string): HelpTask | undefined {
    this.requireLogin();
    const userId = this.currentUserId!;

    const task = this.taskStore.getById(taskId);
    if (!task) return undefined;

    if (task.status !== 'open') {
      throw new Error('任务不可认领');
    }

    if (task.publisherId === userId) {
      throw new Error('不能认领自己发布的任务');
    }

    const claimer = this.getPublisher(userId);
    const updated = this.taskStore.update(taskId, {
      status: 'claimed',
      claimerId: userId,
      claimer,
      claimedAt: Date.now()
    });

    if (this.userModule) {
      this.userModule.addContribution(userId, 'task_claim', taskId);
    }

    this.emit('task:claim', { taskId, claimerId: userId });
    return updated;
  }

  completeTask(params: CompleteTaskParams): HelpTask | undefined {
    this.requireLogin();
    const userId = this.currentUserId!;

    const task = this.taskStore.getById(params.taskId);
    if (!task) return undefined;

    if (task.claimerId !== userId && task.publisherId !== userId) {
      throw new Error('无权限完成此任务');
    }

    if (task.status !== 'claimed' && task.status !== 'in_progress') {
      throw new Error('任务状态不允许完成');
    }

    const updated = this.taskStore.update(params.taskId, {
      status: 'completed',
      completedAt: Date.now()
    });

    if (task.claimerId && this.userModule) {
      this.userModule.addContribution(task.claimerId, 'task_complete', params.taskId);
    }

    this.emit('task:complete', { taskId: params.taskId, task: updated });
    return updated;
  }

  cancelTask(taskId: string): HelpTask | undefined {
    this.requireLogin();
    const userId = this.currentUserId!;

    const task = this.taskStore.getById(taskId);
    if (!task) return undefined;

    if (task.publisherId !== userId && !this.isAdmin) {
      throw new Error('只有任务发布者或管理员可以取消任务');
    }

    if (task.status === 'completed') {
      throw new Error('已完成的任务不能取消');
    }

    const updated = this.taskStore.update(taskId, { status: 'cancelled' });
    this.emit('task:cancel', { taskId, userId });
    return updated;
  }

  rateTask(params: RateTaskParams): TaskReview {
    this.requireLogin();
    const userId = this.currentUserId!;

    const task = this.taskStore.getById(params.taskId);
    if (!task) {
      throw new Error('任务不存在');
    }

    if (task.status !== 'completed') {
      throw new Error('只能评价已完成的任务');
    }

    if (task.publisherId !== userId) {
      throw new Error('只有任务发布者可以评价');
    }

    const existingReview = this.reviewStore.findOne(
      r => r.taskId === params.taskId && r.reviewerId === userId
    );

    if (existingReview) {
      throw new Error('您已评价过此任务');
    }

    if (params.rating < 1 || params.rating > 5) {
      throw new Error('评分必须在1-5之间');
    }

    this.checkContentSensitive(params.comment);

    const reviewer = this.getPublisher(userId);

    const review = this.reviewStore.create(
      {
        taskId: params.taskId,
        reviewerId: userId,
        reviewer,
        rating: params.rating,
        comment: this.filterContent(params.comment),
        isHelpful: params.isHelpful !== false
      },
      'review'
    );

    this.taskStore.update(params.taskId, {
      reviewId: review.id
    });

    this.emit('task:rate', { taskId: params.taskId, review, task: this.taskStore.getById(params.taskId) });
    return review;
  }

  getTaskReview(taskId: string): TaskReview | undefined {
    return this.reviewStore.findOne(r => r.taskId === taskId);
  }

  getMyPublishedTasks(params: { page?: number; pageSize?: number; status?: TaskStatus }): TaskListResult {
    this.requireLogin();
    const userId = this.currentUserId!;

    let tasks = this.taskStore.findMany(t => t.publisherId === userId && t.status !== 'cancelled');

    if (params.status) {
      tasks = tasks.filter(t => t.status === params.status);
    }

    tasks.sort((a, b) => b.createdAt - a.createdAt);

    return this.taskStore.paginate(tasks, params);
  }

  getMyClaimedTasks(params: { page?: number; pageSize?: number; status?: TaskStatus }): TaskListResult {
    this.requireLogin();
    const userId = this.currentUserId!;

    let tasks = this.taskStore.findMany(t => t.claimerId === userId && t.status !== 'cancelled');

    if (params.status) {
      tasks = tasks.filter(t => t.status === params.status);
    }

    tasks.sort((a, b) => b.createdAt - a.createdAt);

    return this.taskStore.paginate(tasks, params);
  }

  getMyCompletedTasks(params: { page?: number; pageSize?: number; asPublisher?: boolean; asClaimer?: boolean }): TaskListResult {
    this.requireLogin();
    const userId = this.currentUserId!;

    let tasks = this.taskStore.findMany(t => t.status === 'completed');

    tasks = tasks.filter(t => {
      const asPublisher = t.publisherId === userId;
      const asClaimer = t.claimerId === userId;
      if (params.asPublisher && params.asClaimer) return asPublisher || asClaimer;
      if (params.asPublisher) return asPublisher;
      if (params.asClaimer) return asClaimer;
      return asPublisher || asClaimer;
    });

    tasks.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));

    return this.taskStore.paginate(tasks, params);
  }

  updateTask(taskId: string, updates: Partial<HelpTask>): HelpTask | undefined {
    this.requireLogin();
    const userId = this.currentUserId!;

    const task = this.taskStore.getById(taskId);
    if (!task) return undefined;

    if (task.publisherId !== userId) {
      throw new Error('只有任务发布者可以修改任务');
    }

    if (task.status !== 'open') {
      throw new Error('只能修改待认领的任务');
    }

    if (updates.title) {
      this.checkContentSensitive(updates.title);
      updates.title = this.filterContent(updates.title);
    }
    if (updates.description) {
      this.checkContentSensitive(updates.description);
      updates.description = this.filterContent(updates.description);
    }

    return this.taskStore.update(taskId, updates);
  }

  getTaskCountByType(type: TaskType, status?: TaskStatus): number {
    let tasks = this.taskStore.findMany(t => t.type === type);
    if (status) {
      tasks = tasks.filter(t => t.status === status);
    }
    return tasks.length;
  }

  getTaskWithReview(taskId: string): { task: HelpTask; review?: TaskReview } | undefined {
    const task = this.taskStore.getById(taskId);
    if (!task) return undefined;

    let review: TaskReview | undefined;
    if (task.reviewId) {
      review = this.reviewStore.getById(task.reviewId);
    }

    return { task, review };
  }
}
