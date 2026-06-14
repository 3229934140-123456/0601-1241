import { JobSocialSDK, createSDK, UserProfile, ReportAction, UserReportView } from './src';

const sdk = createSDK({
  appId: 'test-app-id',
  adminIds: ['admin_001'],
  enableSensitiveWordCheck: true,
  sensitiveWords: ['测试敏感词', '违规内容'],
  callback: {
    activitySignupUrl: ['https://biz1.example.com/callback/activity', 'https://biz2.example.com/webhook/activity'],
    userDynamicSyncUrl: 'https://biz1.example.com/callback/dynamic',
    postPublishUrl: ['https://biz1.example.com/callback/post'],
    taskCompleteUrl: '',
    reportSubmitUrl: 'https://biz1.example.com/callback/report',
    timeout: 3000,
    maxRetries: 3
  }
});

const user1: UserProfile = {
  id: 'user_001',
  nickname: '求职小白',
  avatar: 'https://example.com/avatar1.jpg',
  bio: '正在找工作的应届生',
  contributionValue: 0,
  level: 1,
  isVerified: false,
  tags: ['计算机', '前端'],
  createdAt: Date.now(),
  updatedAt: Date.now()
};

const user2: UserProfile = {
  id: 'user_002',
  nickname: '面试达人',
  avatar: 'https://example.com/avatar2.jpg',
  bio: '3年工作经验',
  contributionValue: 500,
  level: 4,
  isVerified: true,
  tags: ['Java', '后端'],
  createdAt: Date.now(),
  updatedAt: Date.now()
};

const adminUser: UserProfile = {
  id: 'admin_001',
  nickname: '管理员',
  avatar: 'https://example.com/admin.jpg',
  bio: '社区管理员',
  contributionValue: 9999,
  level: 10,
  isVerified: true,
  tags: ['管理员'],
  createdAt: Date.now(),
  updatedAt: Date.now()
};

async function runDemo() {
  console.log('=== 社交互动平台 SDK v4 演示 ===\n');

  sdk.user.createUser(user1);
  sdk.user.createUser(user2);
  sdk.user.createUser(adminUser);

  console.log('--- 1. 私信举报删除：消息从双方会话消失，举报状态一致 ---');
  sdk.setCurrentUser(user2);
  const msg = sdk.message.sendPrivateMessage({
    receiverId: 'user_001',
    content: '你好，想和你聊聊简历的事'
  });
  console.log(`✓ user_002 发送私信`);

  sdk.setCurrentUser(user1);
  const beforeMsgs = sdk.message.getPrivateMessages('user_002', {});
  console.log(`  举报前 user_001 会话消息数: ${beforeMsgs.total}`);

  const msgReport = sdk.report.submitReport({
    type: 'spam',
    contentType: 'message',
    contentId: msg.id,
    reason: '骚扰信息'
  });

  sdk.setCurrentUser(adminUser);
  sdk.report.handleReport({
    reportId: msgReport.id,
    status: 'resolved',
    handleResult: '私信违规，已删除',
    action: 'delete' as ReportAction
  });
  console.log(`✓ 管理员处理私信举报 - 删除消息`);

  sdk.setCurrentUser(user1);
  const afterMsgs1 = sdk.message.getPrivateMessages('user_002', {});
  console.log(`  user_001 会话消息数: ${afterMsgs1.total} (应少了1条)`);

  sdk.setCurrentUser(user2);
  const afterMsgs2 = sdk.message.getPrivateMessages('user_001', {});
  console.log(`  user_002 会话消息数: ${afterMsgs2.total} (也应少了1条)`);

  sdk.setCurrentUser(user1);
  const reportAfterHandle = sdk.report.getReport(msgReport.id) as UserReportView;
  console.log(`  举报状态: ${reportAfterHandle.status}, 结论: ${reportAfterHandle.handleResult}`);

  console.log('\n--- 2. 禁言处罚：被禁言后发帖/评论/私信全被拦住 ---');
  sdk.setCurrentUser(adminUser);
  sdk.user.muteUser('user_002', 7, '违反社区规范');
  const muteInfo = sdk.user.getUserMuteInfo('user_002');
  console.log(`✓ 禁言 user_002: ${muteInfo?.muteDuration}天, 原因: ${muteInfo?.muteReason}`);

  sdk.setCurrentUser(user2);
  try {
    sdk.post.publishPost({ type: 'discussion', title: '测试发帖', content: '应该被拦住' });
    console.log(`  ✗ 发帖居然成功了！`);
  } catch (e: any) {
    console.log(`  ✓ 发帖被拦截: ${e.message}`);
  }

  try {
    sdk.post.publishComment({ postId: 'any', content: '测试评论' });
    console.log(`  ✗ 评论居然成功了！`);
  } catch (e: any) {
    console.log(`  ✓ 评论被拦截: ${e.message}`);
  }

  try {
    sdk.message.sendPrivateMessage({ receiverId: 'user_001', content: '测试私信' });
    console.log(`  ✗ 私信居然成功了！`);
  } catch (e: any) {
    console.log(`  ✓ 私信被拦截: ${e.message}`);
  }

  sdk.user.unmuteUser('user_002');
  console.log(`✓ 解除禁言后: isMuted=${sdk.user.isUserMuted('user_002')}`);

  console.log('\n--- 3. 举报进度脱敏：普通用户只看状态+结论 ---');
  sdk.setCurrentUser(user1);
  const myReports = sdk.report.getMyReports({});
  console.log(`  user_001 的举报记录: ${myReports.total}条`);
  if (myReports.list.length > 0) {
    const r = myReports.list[0] as UserReportView;
    const keys = Object.keys(r);
    console.log(`  返回字段: ${keys.join(', ')}`);
    const hasReportedUserId = 'reportedUserId' in (r as any);
    const hasContentSnapshot = 'contentSnapshot' in (r as any);
    const hasInternalNote = 'internalNote' in (r as any);
    console.log(`  含被举报人ID: ${hasReportedUserId}, 含内容快照: ${hasContentSnapshot}, 含内部备注: ${hasInternalNote} (都应为false)`);
  }

  sdk.setCurrentUser(adminUser);
  const adminReports = sdk.report.getReportList({ pageSize: 5 });
  if (adminReports.list.length > 0) {
    const r = adminReports.list[0] as any;
    console.log(`  管理员视角字段: ${Object.keys(r).join(', ')}`);
    console.log(`  含被举报人ID: ${'reportedUserId' in r}, 含内部备注: ${'internalNote' in r} (都应为true)`);
  }

  console.log('\n--- 4. 评价通知区分双方 ---');
  sdk.setCurrentUser(user2);
  const task = sdk.task.createResumeReviewTask({
    title: '求大佬帮忙看看简历',
    description: '应届生求简历点评',
    bountyAmount: 20,
    deadline: Date.now() + 7 * 24 * 60 * 60 * 1000,
    resumeUrl: 'https://example.com/resume.pdf',
    tags: ['简历修改']
  });

  sdk.setCurrentUser(user1);
  const app = sdk.task.applyForTask({ taskId: task.id, message: '我可以帮你' });

  sdk.setCurrentUser(user2);
  sdk.task.acceptApplication(app.id);
  sdk.task.completeTask({ taskId: task.id });
  sdk.task.rateTask({ taskId: task.id, rating: 5, comment: '非常专业！', isHelpful: true });
  console.log(`✓ 完成任务流程: 接受→完成→评价`);

  sdk.setCurrentUser(user2);
  const publisherNotifs = sdk.message.getSystemNotifications({ pageSize: 20, isRead: false });
  const rateNotifs = publisherNotifs.list.filter(n => n.category === 'task_rate');
  const completeNotifs = publisherNotifs.list.filter(n => n.category === 'task_complete');
  console.log(`  发布方 - 完成类通知: ${completeNotifs.length}条, 评价类通知: ${rateNotifs.length}条`);
  if (rateNotifs.length > 0) {
    console.log(`    评价通知内容: ${rateNotifs[0].content}`);
  }

  sdk.setCurrentUser(user1);
  const claimerNotifs = sdk.message.getSystemNotifications({ pageSize: 20, isRead: false });
  const claimerRateNotifs = claimerNotifs.list.filter(n => n.category === 'task_rate');
  const claimerCompleteNotifs = claimerNotifs.list.filter(n => n.category === 'task_complete');
  console.log(`  认领方 - 完成类通知: ${claimerCompleteNotifs.length}条, 评价类通知: ${claimerRateNotifs.length}条`);
  if (claimerRateNotifs.length > 0) {
    console.log(`    评价通知内容: ${claimerRateNotifs[0].content}`);
  }

  console.log('\n--- 5. 回调事件类型筛选 ---');
  sdk.setCurrentUser(adminUser);
  sdk.callback.clearCallbacks();

  sdk.callback.triggerCallback('activity_signup', 'activity_signup_spring_2026', {
    activityId: 'act_001',
    activityName: '春季招聘会',
    userId: 'user_001',
    userName: '求职小白',
    signupTime: Date.now()
  });

  sdk.callback.triggerCallback('activity_signup', 'activity_signup_autumn_2026', {
    activityId: 'act_002',
    activityName: '秋季招聘会',
    userId: 'user_002',
    userName: '面试达人',
    signupTime: Date.now()
  });

  await new Promise(resolve => setTimeout(resolve, 500));

  const allSignup = sdk.callback.getCallbacksByEventType('activity_signup', { pageSize: 20 });
  const springOnly = sdk.callback.getCallbacksByEventType('activity_signup_spring_2026', { pageSize: 20 });
  const autumnOnly = sdk.callback.getCallbacksByEventType('activity_signup_autumn_2026', { pageSize: 20 });

  console.log(`  activity_signup 基础类型: ${allSignup.total}条`);
  console.log(`  activity_signup_spring_2026 精确事件: ${springOnly.total}条`);
  console.log(`  activity_signup_autumn_2026 精确事件: ${autumnOnly.total}条`);

  const eventTypes = [...new Set(sdk.callback.getCallbackList({ pageSize: 100 }).list.map(c => c.eventType))];
  console.log(`  所有事件类型(去重): ${eventTypes.join(', ')}`);

  console.log('\n=== 演示完成 ===');
  console.log(`SDK 版本: ${sdk.getVersion()}`);
}

runDemo().catch(console.error);
