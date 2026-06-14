import { BaseModule } from '../core/baseModule';
import { BaseStore } from '../core/baseStore';
import { SDKContext } from '../core/config';
import {
  Report,
  CreateReportParams,
  ReportListParams,
  ReportListResult,
  HandleReportParams,
  ReportStatus,
  ReportType,
  UserProfile
} from '../types';

export class ReportModule extends BaseModule {
  private reportStore: BaseStore<Report>;
  private userModule: any;
  private postModule: any;
  private messageModule: any;
  private taskModule: any;

  constructor(
    context: SDKContext,
    userModule?: any,
    postModule?: any,
    messageModule?: any,
    taskModule?: any
  ) {
    super(context);
    this.reportStore = new BaseStore<Report>();
    this.userModule = userModule;
    this.postModule = postModule;
    this.messageModule = messageModule;
    this.taskModule = taskModule;
  }

  setDependencies(userModule: any, postModule: any, messageModule: any, taskModule?: any): void {
    this.userModule = userModule;
    this.postModule = postModule;
    this.messageModule = messageModule;
    this.taskModule = taskModule || this.taskModule;
  }

  setTaskModule(taskModule: any): void {
    this.taskModule = taskModule;
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

  private resolveReportedContent(contentType: string, contentId: string): {
    reportedUserId: string;
    contentSnapshot: string;
  } {
    let reportedUserId = '';
    let contentSnapshot = '';

    switch (contentType) {
      case 'post':
        if (this.postModule) {
          const post = this.postModule.getPost(contentId);
          if (post) {
            reportedUserId = post.userId;
            contentSnapshot = `【帖子】${post.title}\n${post.content.slice(0, 300)}`;
          }
        }
        break;
      case 'comment':
        if (this.postModule) {
          const comment = this.postModule.getComment(contentId);
          if (comment) {
            reportedUserId = comment.userId;
            contentSnapshot = `【评论】${comment.content.slice(0, 300)}`;
          }
        }
        break;
      case 'user':
        if (this.userModule) {
          const user = this.userModule.getUser(contentId);
          if (user) {
            reportedUserId = contentId;
            contentSnapshot = `【用户】${user.nickname}`;
          }
        }
        break;
      case 'task':
        if (this.taskModule) {
          const task = this.taskModule.getTask(contentId);
          if (task) {
            reportedUserId = task.publisherId;
            contentSnapshot = `【任务】${task.title}\n${task.description.slice(0, 200)}`;
          }
        }
        break;
      case 'message':
        if (this.messageModule) {
          const msg = this.messageModule.getMessage(contentId);
          if (msg) {
            reportedUserId = msg.senderId;
            contentSnapshot = `【消息】${msg.content.slice(0, 300)}`;
          }
        }
        break;
    }

    return { reportedUserId, contentSnapshot };
  }

  submitReport(params: CreateReportParams): Report {
    this.requireLogin();
    const reporterId = this.currentUserId!;

    this.checkContentSensitive(params.reason);

    const { reportedUserId, contentSnapshot: autoSnapshot } = this.resolveReportedContent(
      params.contentType,
      params.contentId
    );

    if (!reportedUserId) {
      throw new Error('未找到被举报对象，内容可能已不存在');
    }

    const contentSnapshot = params.contentSnapshot || autoSnapshot;
    const reporter = this.getUser(reporterId);
    const reportedUser = reportedUserId ? this.getUser(reportedUserId) : undefined;

    const report = this.reportStore.create(
      {
        reporterId,
        reporter,
        reportedUserId,
        reportedUser,
        type: params.type,
        contentType: params.contentType,
        contentId: params.contentId,
        contentSnapshot,
        reason: this.filterContent(params.reason),
        images: params.images,
        status: 'pending'
      },
      'report'
    );

    this.emit('report:submit', report);
    return report;
  }

  getReport(reportId: string): Report | undefined {
    this.requireLogin();

    const report = this.reportStore.getById(reportId);
    if (!report) return undefined;

    if (report.reporterId !== this.currentUserId && !this.isAdmin) {
      throw new Error('无权限查看此举报');
    }

    return report;
  }

  getReportList(params: ReportListParams): ReportListResult {
    this.requireLogin();

    let reports = this.reportStore.getAll();

    if (!this.isAdmin) {
      reports = reports.filter(r => r.reporterId === this.currentUserId);
    }

    if (params.status) {
      reports = reports.filter(r => r.status === params.status);
    }
    if (params.type) {
      reports = reports.filter(r => r.type === params.type);
    }
    if (params.contentType) {
      reports = reports.filter(r => r.contentType === params.contentType);
    }
    if (params.reporterId && this.isAdmin) {
      reports = reports.filter(r => r.reporterId === params.reporterId);
    }

    reports.sort((a, b) => b.createdAt - a.createdAt);
    return this.reportStore.paginate(reports, params);
  }

  handleReport(params: HandleReportParams): Report | undefined {
    if (!this.isAdmin) {
      throw new Error('只有管理员可以处理举报');
    }

    const report = this.reportStore.getById(params.reportId);
    if (!report) return undefined;

    if (report.status !== 'pending' && report.status !== 'processing') {
      throw new Error('此举报已处理完毕');
    }

    const handler = this.getUser(this.currentUserId!);

    const updated = this.reportStore.update(params.reportId, {
      status: params.status,
      handlerId: this.currentUserId!,
      handler,
      handledAt: Date.now(),
      handleResult: params.handleResult
    });

    if (params.status === 'resolved') {
      this.hideReportedContent(report);

      if (this.userModule) {
        this.userModule.addContribution(report.reporterId, 'report_valid', report.id);
      }

      if (this.messageModule) {
        this.messageModule.sendSystemNotification(
          report.reporterId,
          `您的举报已处理：${params.handleResult}`,
          'system',
          report.id,
          'report'
        );

        this.messageModule.sendSystemNotification(
          report.reportedUserId,
          `您发布的内容因违反社区规范已被隐藏，原因：${params.handleResult}`,
          'system',
          report.id,
          'report'
        );
      }
    }

    if (params.status === 'rejected' && this.messageModule) {
      this.messageModule.sendSystemNotification(
        report.reporterId,
        `您的举报未被受理：${params.handleResult}`,
        'system',
        report.id,
        'report'
      );
    }

    this.emit('report:handle', { reportId: params.reportId, status: params.status });
    return updated;
  }

  private hideReportedContent(report: Report): void {
    switch (report.contentType) {
      case 'post':
        if (this.postModule) {
          this.postModule.hidePost(report.contentId);
        }
        break;
      case 'comment':
        if (this.postModule) {
          this.postModule.hideComment(report.contentId);
        }
        break;
      case 'message':
        if (this.messageModule) {
          const msg = this.messageModule.getMessage(report.contentId);
          if (msg) {
            this.messageModule.deleteMessage(report.contentId);
          }
        }
        break;
      case 'task':
        if (this.taskModule) {
          this.taskModule.cancelTask(report.contentId);
        }
        break;
    }
  }

  getMyReports(params: { page?: number; pageSize?: number; status?: ReportStatus }): ReportListResult {
    this.requireLogin();

    let reports = this.reportStore.findMany(r => r.reporterId === this.currentUserId);

    if (params.status) {
      reports = reports.filter(r => r.status === params.status);
    }

    reports.sort((a, b) => b.createdAt - a.createdAt);
    return this.reportStore.paginate(reports, params);
  }

  getReportStats(): {
    total: number;
    pending: number;
    processing: number;
    resolved: number;
    rejected: number;
  } {
    if (!this.isAdmin) {
      throw new Error('只有管理员可以查看举报统计');
    }

    const reports = this.reportStore.getAll();
    const stats = { total: reports.length, pending: 0, processing: 0, resolved: 0, rejected: 0 };
    reports.forEach(r => { stats[r.status]++; });
    return stats;
  }

  getReportTypeList(): { type: ReportType; label: string }[] {
    return [
      { type: 'spam', label: '垃圾广告' },
      { type: 'harassment', label: '骚扰辱骂' },
      { type: 'violence', label: '暴力血腥' },
      { type: 'pornography', label: '色情低俗' },
      { type: 'other', label: '其他问题' }
    ];
  }

  cancelReport(reportId: string): boolean {
    this.requireLogin();
    const userId = this.currentUserId!;

    const report = this.reportStore.getById(reportId);
    if (!report) return false;

    if (report.reporterId !== userId) {
      throw new Error('无权限取消此举报');
    }

    if (report.status !== 'pending') {
      throw new Error('只能取消待处理的举报');
    }

    this.reportStore.update(reportId, { status: 'rejected', handleResult: '用户撤销' });
    return true;
  }
}
