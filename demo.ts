import { JobSocialSDK, createSDK, UserProfile, ReportAction } from './src';

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
  bio: '3年工作经验，已拿大厂offer',
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
  console.log('=== 社交互动平台 SDK v3 演示 ===\n');

  sdk.user.createUser(user1);
  sdk.user.createUser(user2);
  sdk.user.createUser(adminUser);

  console.log('--- 1. 内容治理：完整处置动作（隐藏/删除/警告/禁言）---');
  sdk.setCurrentUser(user2);
  const post = sdk.post.publishPost({
    type: 'experience',
    title: '某厂面试经验分享',
    content: '这是一篇用来演示用的帖子内容...'
  });
  console.log(`✓ 发布帖子: ${post.title}`);

  sdk.setCurrentUser(user1);
  const report = sdk.report.submitReport({
    type: 'spam',
    contentType: 'post',
    contentId: post.id,
    reason: '虚假信息'
  });
  console.log(`✓ 提交举报: ${report.type}`);

  const myReport = sdk.report.getReport(report.id)!;
  console.log(`  举报人视角 - 状态: ${myReport.status}, 结论: ${myReport.handleResult || '待处理'}`);
  console.log(`  举报人视角 - 被举报人信息: ${myReport.reportedUser ? '有' : '无(已脱敏)'}`);
  console.log(`  举报人视角 - 内部备注: ${myReport.internalNote ? '有' : '无(已脱敏)'}`);

  sdk.setCurrentUser(adminUser);
  console.log(`  管理员处置选项: ${sdk.report.getActionList().map(a => `${a.action}(${a.label})`).join('、')}`);

  sdk.report.handleReport({
    reportId: report.id,
    status: 'resolved',
    handleResult: '内容确属虚假信息',
    action: 'hide' as ReportAction,
    internalNote: '初犯，给予警告，记录在案'
  });
  console.log(`✓ 管理员处理 - 隐藏内容+内部备注`);

  const adminView = sdk.report.getReport(report.id)!;
  console.log(`  管理员视角 - 处置动作: ${adminView.action}`);
  console.log(`  管理员视角 - 内部备注: ${adminView.internalNote}`);
  console.log(`  帖子当前状态: ${sdk.post.getPost(post.id)?.status}`);

  console.log('\n--- 2. 私信举报通过后，违规消息在会话里隐藏 ---');
  sdk.setCurrentUser(user2);
  const msg = sdk.message.sendPrivateMessage({
    receiverId: 'user_001',
    content: '你好，想和你聊聊简历的事'
  });
  console.log(`✓ 发送私信: ${msg.content.slice(0, 25)}...`);

  sdk.setCurrentUser(user1);
  const beforeMsgs = sdk.message.getPrivateMessages('user_002', {});
  console.log(`  举报前会话消息数: ${beforeMsgs.total}`);

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
    handleResult: '私信违规，已隐藏',
    action: 'hide' as ReportAction
  });
  console.log(`✓ 管理员处理私信举报 - 隐藏消息`);

  sdk.setCurrentUser(user1);
  const afterMsgs = sdk.message.getPrivateMessages('user_002', {});
  console.log(`  处理后会话消息数: ${afterMsgs.total} (应该少了1条)`);
  console.log(`  普通用户视角 - getMessage: ${sdk.message.getMessage(msg.id) ? '能看到' : '看不到(已隐藏)'}`);
  sdk.setCurrentUser(adminUser);
  console.log(`  管理员视角 - 消息状态: ${sdk.message.getMessage(msg.id)?.status}`);

  console.log('\n--- 3. 任务动态更细：接受/完成/评价 分别同步 ---');
  sdk.setCurrentUser(user2);
  const task = sdk.task.createResumeReviewTask({
    title: '求大佬帮忙看看简历',
    description: '应届生求简历点评',
    bountyAmount: 20,
    deadline: Date.now() + 7 * 24 * 60 * 60 * 1000,
    resumeUrl: 'https://example.com/resume.pdf',
    tags: ['简历修改']
  });

  let dynamicCount = 0;
  sdk.callback.onUserDynamicSync(() => { dynamicCount++; });

  sdk.setCurrentUser(user1);
  const application = sdk.task.applyForTask({
    taskId: task.id,
    message: '我可以帮你看看简历'
  });

  sdk.setCurrentUser(user2);
  const beforeCount = dynamicCount;
  sdk.task.acceptApplication(application.id);
  console.log(`✓ 接受申请 - 新增动态: ${dynamicCount - beforeCount}条 (task_accept)`);

  const beforeCount2 = dynamicCount;
  sdk.task.completeTask({ taskId: task.id });
  console.log(`✓ 完成任务 - 新增动态: ${dynamicCount - beforeCount2}条 (task_complete)`);

  const beforeCount3 = dynamicCount;
  sdk.task.rateTask({
    taskId: task.id,
    rating: 5,
    comment: '非常专业！',
    isHelpful: true
  });
  console.log(`✓ 评价任务 - 新增动态: ${dynamicCount - beforeCount3}条 (task_rate)`);
  console.log(`  总计动态同步次数: ${dynamicCount} (期望:3)`);

  console.log('\n--- 4. 数据回调多地址：分别推送，独立记录 ---');
  sdk.setCurrentUser(adminUser);
  sdk.callback.clearCallbacks();

  sdk.setCurrentUser(user1);
  sdk.callback.triggerActivitySignup({
    activityId: 'act_001',
    activityName: '春季招聘会',
    userId: 'user_001',
    userName: '求职小白',
    signupTime: Date.now()
  });

  await new Promise(resolve => setTimeout(resolve, 1500));

  sdk.setCurrentUser(adminUser);
  const allCallbacks = sdk.callback.getCallbackList({ pageSize: 20 });
  const activityCallbacks = sdk.callback.getCallbacksByEventType('activity_signup', { pageSize: 20 });
  console.log(`  活动报名回调 - 总记录: ${activityCallbacks.total}条 (配置了2个地址)`);

  const statsByUrl = sdk.callback.getCallbackStatsByUrl();
  console.log(`  按地址统计:`);
  statsByUrl.forEach(s => {
    console.log(`    ${s.url || '本地事件'}: 总${s.total}, 成功${s.success}, 失败${s.failed}`);
  });

  console.log('\n--- 5. 回调筛选：按事件类型/状态/业务地址 ---');
  const url1 = 'https://biz1.example.com/callback/activity';
  const url1Callbacks = sdk.callback.getCallbacksByUrl(url1, {});
  console.log(`  地址 biz1 的回调: ${url1Callbacks.total}条`);

  const failedCallbacks = sdk.callback.getCallbacksByStatus('failed', { pageSize: 20 });
  console.log(`  失败的回调: ${failedCallbacks.total}条 (地址不可达，应该都是失败)`);

  console.log(`  事件类型列表(去重): ${[...new Set(allCallbacks.list.map(c => c.eventType))].join(', ')}`);

  console.log('\n--- 6. 任务双方消息通知 ---');
  sdk.setCurrentUser(user1);
  const user1Unread = sdk.message.getUnreadCount();
  console.log(`  user1(认领方)系统未读: ${user1Unread.system}条`);
  const user1Notifs = sdk.message.getSystemNotifications({ pageSize: 10, isRead: false });
  console.log(`    - ${user1Notifs.list.slice(0, 3).map(n => n.content.slice(0, 30)).join('\n    - ')}`);

  sdk.setCurrentUser(user2);
  const user2Unread = sdk.message.getUnreadCount();
  console.log(`  user2(发布方)系统未读: ${user2Unread.system}条`);

  console.log('\n=== 演示完成 ===');
  console.log(`SDK 版本: ${sdk.getVersion()}`);

  sdk.setCurrentUser(adminUser);
  const finalStats = sdk.callback.getCallbackStats();
  console.log(`\n最终回调统计: ${JSON.stringify(finalStats)}`);
}

runDemo().catch(console.error);
