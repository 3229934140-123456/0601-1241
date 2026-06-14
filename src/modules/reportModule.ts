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
  ReportAction,
  UserProfile,
  UserReportView,
  UserReportListResult
} from '../types';
import { paginate } from '../utils/helpers';

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

  submitReport(params: CreateReportParams): UserReportView {
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

    const report = this.reportStore.create(
      {
        reporterId,
        reportedUserId,
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
    return this.toUserView(report);
  }

  getReport(reportId: string): Report | UserReportView | undefined {
    this.requireLogin();

    const report = this.reportStore.getById(reportId);
    if (!report) return undefined;

    if (report.reporterId !== this.currentUserId && report.reportedUserId !== this.currentUserId && !this.isAdmin) {
      throw new Error('无权限查看此举报');
    }

    return this.isAdmin ? report : this.toUserView(report);
  }

  getReportList(params: ReportListParams): ReportListResult | UserReportListResult {
    this.requireLogin();

    let reports = this.reportStore.getAll();

    if (!this.isAdmin) {
      reports = reports.filter(r => r.reporterId === this.currentUserId || r.reportedUserId === this.currentUserId);
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

    if (this.isAdmin) {
      return this.reportStore.paginate(reports, params);
    }

    const userViews = reports.map(r => this.toUserView(r));
    return paginate(userViews, params.page || 1, params.pageSize || 20);
  }

  handleReport(params: HandleReportParams): Report | undefined {
    if (!this.isAdmin) {
      throw new Error('只有管理员可以处理举报');
    }

    const report = this.reportStore.getById(params.reportId);
    if (!report) return undefined;

    if (report.status !== 'pending' && report.status !== 'processing' && report.status !== 'appealed') {
      throw new Error('此举报已处理完毕');
    }

    const handler = this.getUser(this.currentUserId!);
    const action = params.action || (params.status === 'resolved' ? 'hide' : 'no_action');
    const muteDuration = params.muteDuration;

    const updated = this.reportStore.update(params.reportId, {
      status: params.status,
      handlerId: this.currentUserId!,
      handler,
      handledAt: Date.now(),
      handleResult: params.handleResult,
      action,
      internalNote: params.internalNote,
      muteDuration
    });

    if (params.status === 'resolved') {
      this.executeReportedContentAction(report, action, muteDuration);

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

        const reportedMsg = this.getReportedUserNotification(action, params.handleResult, muteDuration);
        if (reportedMsg) {
          this.messageModule.sendSystemNotification(
            report.reportedUserId,
            reportedMsg,
            'system',
            report.id,
            'report'
          );
        }
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

    this.emit('report:handle', { reportId: params.reportId, status: params.status, action });
    return updated;
  }

  submitAppeal(reportId: string, reason: string, images?: string[]): UserReportView {
    this.requireLogin();
    const userId = this.currentUserId!;

    const report = this.reportStore.getById(reportId);
    if (!report) {
      throw new Error('举报记录不存在');
    }

    if (report.reportedUserId !== userId) {
      throw new Error('只有被举报人才能提交申诉');
    }

    if (report.status !== 'resolved' && report.status !== 'rejected') {
      throw new Error('当前举报状态不允许申诉');
    }

    if (report.appealInfo) {
      throw new Error('已提交过申诉，请勿重复提交');
    }

    this.checkContentSensitive(reason);

    const appealInfo = {
      appellantId: userId,
      appealReason: this.filterContent(reason),
      appealedAt: Date.now(),
      appealImages: images
    };

    const updated = this.reportStore.update(reportId, {
      status: 'appealed',
      appealInfo
    });

    if (this.messageModule) {
      this.messageModule.sendSystemNotification(
        report.reporterId,
        `您提交的举报已被对方申诉，请等待管理员复核`,
        'system',
        report.id,
        'report'
      );
    }

    this.emit('report:appeal', { reportId, appealInfo });
    return this.toUserView(updated!);
  }

  reviewAppeal(params: { reportId: string; result: 'upheld' | 'overturned'; reason: string }): Report {
    if (!this.isAdmin) {
      throw new Error('只有管理员可以复核申诉');
    }

    const report = this.reportStore.getById(params.reportId);
    if (!report) {
      throw new Error('举报记录不存在');
    }

    if (report.status !== 'appealed') {
      throw new Error('当前举报状态不允许复核');
    }

    if (!report.appealInfo) {
      throw new Error('未找到申诉信息');
    }

    const reviewInfo = {
      reviewerId: this.currentUserId!,
      reviewResult: params.result,
      reviewReason: params.reason,
      reviewedAt: Date.now()
    };

    const updated = this.reportStore.update(params.reportId, {
      status: 'reviewed',
      reviewInfo
    });

    if (params.result === 'overturned') {
      this.rollbackReportedContentAction(report);
    }

    if (this.messageModule) {
      this.messageModule.sendSystemNotification(
        report.reporterId,
        params.result === 'upheld'
          ? `您的举报申诉复核结果：维持原判，原因：${params.reason}`
          : `您的举报申诉复核结果：已推翻原判，原因：${params.reason}`,
        'system',
        report.id,
        'report'
      );

      this.messageModule.sendSystemNotification(
        report.reportedUserId,
        params.result === 'upheld'
          ? `您的申诉复核结果：维持原判，原因：${params.reason}`
          : `您的申诉复核结果：已推翻原判，原因：${params.reason}`,
        'system',
        report.id,
        'report'
      );
    }

    this.emit('report:review', { reportId: params.reportId, result: params.result, reviewInfo });
    return updated!;
  }

  private rollbackReportedContentAction(report: Report): void {
    const action = report.action;
    if (!action || action === 'no_action') return;

    switch (report.contentType) {
      case 'post':
        if (this.postModule) {
          if (action === 'hide' || action === 'warn' || action === 'mute') {
            this.postModule.updatePost(report.contentId, { status: 'published' });
          } else if (action === 'delete') {
            this.postModule.updatePost(report.contentId, { status: 'published' });
          }
        }
        break;
      case 'comment':
        if (this.postModule) {
          if (action === 'hide' || action === 'warn' || action === 'mute') {
            this.postModule.updatePost(report.contentId, { status: 'published' });
          }
        }
        break;
      case 'message':
        if (this.messageModule) {
          this.messageModule.restoreMessage(report.contentId);
        }
        break;
      case 'task':
        break;
      case 'user':
        break;
    }

    if ((action === 'mute') && this.userModule && report.muteDuration) {
      this.userModule.unmuteUser(report.reportedUserId);
    }
  }

  private getReportedUserNotification(action: ReportAction, handleResult: string, muteDuration?: number): string | null {
    switch (action) {
      case 'hide':
        return `您发布的内容因违反社区规范已被隐藏，原因：${handleResult}`;
      case 'delete':
        return `您发布的内容因违反社区规范已被删除，原因：${handleResult}`;
      case 'warn':
        return `系统警告：您发布的内容被举报违反社区规范，原因：${handleResult}。请注意遵守社区规则。`;
      case 'mute':
        const days = muteDuration ? `${muteDuration}天` : '';
        return `您因违反社区规范已被禁言${days}，原因：${handleResult}`;
      case 'no_action':
      default:
        return null;
    }
  }

  private executeReportedContentAction(report: Report, action: ReportAction, muteDuration?: number): void {
    if (action === 'no_action') return;

    const shouldHide = action === 'hide' || action === 'warn' || action === 'mute';
    const shouldDelete = action === 'delete';

    switch (report.contentType) {
      case 'post':
        if (this.postModule) {
          if (shouldDelete) {
            this.postModule.deletePost(report.contentId);
          } else if (shouldHide) {
            this.postModule.hidePost(report.contentId);
          }
        }
        break;
      case 'comment':
        if (this.postModule) {
          if (shouldDelete) {
            this.postModule.deleteComment(report.contentId);
          } else if (shouldHide) {
            this.postModule.hideComment(report.contentId);
          }
        }
        break;
      case 'message':
        if (this.messageModule) {
          if (shouldDelete) {
            this.messageModule.adminDeleteMessage(report.contentId);
          } else if (shouldHide) {
            this.messageModule.hideMessage(report.contentId);
          }
        }
        break;
      case 'task':
        if (this.taskModule) {
          if (shouldDelete || shouldHide) {
            this.taskModule.cancelTask(report.contentId);
          }
        }
        break;
      case 'user':
        break;
    }

    if (action === 'mute' && this.userModule && muteDuration) {
      this.userModule.muteUser(report.reportedUserId, muteDuration, report.reason || '违反社区规范');
    }
  }

  private toUserView(report: Report): UserReportView {
    let appealStatus: 'none' | 'pending' | 'upheld' | 'overturned' = 'none';
    if (report.appealInfo && !report.reviewInfo) {
      appealStatus = 'pending';
    } else if (report.reviewInfo) {
      appealStatus = report.reviewInfo.reviewResult;
    }

    return {
      id: report.id,
      type: report.type,
      contentType: report.contentType,
      reason: report.reason,
      images: report.images,
      status: report.status,
      handleResult: report.handleResult,
      action: report.action,
      createdAt: report.createdAt,
      handledAt: report.handledAt,
      appealStatus,
      reviewResult: report.reviewInfo?.reviewResult
    };
  }

  getMyReports(params: { page?: number; pageSize?: number; status?: ReportStatus }): UserReportListResult {
    this.requireLogin();

    let reports = this.reportStore.findMany(r => r.reporterId === this.currentUserId);

    if (params.status) {
      reports = reports.filter(r => r.status === params.status);
    }

    reports.sort((a, b) => b.createdAt - a.createdAt);

    const userViews = reports.map(r => this.toUserView(r));
    return paginate(userViews, params.page || 1, params.pageSize || 20);
  }

  getMyAppeals(params: { page?: number; pageSize?: number }): UserReportListResult {
    this.requireLogin();

    let reports = this.reportStore.findMany(r => r.reportedUserId === this.currentUserId && !!r.appealInfo);

    reports.sort((a, b) => b.appealInfo!.appealedAt - a.appealInfo!.appealedAt);

    const userViews = reports.map(r => this.toUserView(r));
    return paginate(userViews, params.page || 1, params.pageSize || 20);
  }

  getReportStats(): {
    total: number;
    pending: number;
    processing: number;
    resolved: number;
    rejected: number;
    appealed: number;
    reviewed: number;
  } {
    if (!this.isAdmin) {
      throw new Error('只有管理员可以查看举报统计');
    }

    const reports = this.reportStore.getAll();
    const stats = { total: reports.length, pending: 0, processing: 0, resolved: 0, rejected: 0, appealed: 0, reviewed: 0 };
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

  getActionList(): { action: ReportAction; label: string }[] {
    return [
      { action: 'hide', label: '隐藏内容' },
      { action: 'delete', label: '删除内容' },
      { action: 'warn', label: '发送警告' },
      { action: 'mute', label: '禁言处罚' },
      { action: 'no_action', label: '不处理' }
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

    this.reportStore.update(reportId, { status: 'rejected', handleResult: '用户撤销', action: 'no_action' });
    return true;
  }
}
