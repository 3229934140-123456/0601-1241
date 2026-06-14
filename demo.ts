import { JobSocialSDK, createSDK, UserProfile } from './src';

const sdk = createSDK({
  appId: 'test-app-id',
  adminIds: ['admin_001'],
  enableSensitiveWordCheck: true,
  sensitiveWords: ['测试敏感词', '违规内容'],
  callback: {
    activitySignupUrl: '',
    userDynamicSyncUrl: '',
    postPublishUrl: '',
    taskCompleteUrl: '',
    reportSubmitUrl: '',
    timeout: 10000,
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
  ...user1,
  id: 'admin_001',
  nickname: '管理员',
  createdAt: Date.now(),
  updatedAt: Date.now()
};

async function runDemo() {
  console.log('=== 社交互动平台 SDK v2 演示 ===\n');

  sdk.user.createUser(user1);
  sdk.user.createUser(user2);
  sdk.user.createUser(adminUser);

  console.log('--- 1. 圈子规则支持「禁止广告」等管理用语 ---');
  sdk.setCurrentUser(user1);
  const circle = sdk.topic.createJobCircle({
    name: '前端求职互助圈',
    description: '前端求职者互助交流',
    rules: ['遵守社区规范', '文明交流', '禁止广告', '禁止留联系方式'],
    isPublic: true
  });
  console.log(`✓ 圈子创建成功，规则: ${circle.rules.join('、')}`);

  console.log('\n--- 2. 发布帖子（发帖内容含敏感词会被拦住）---');
  sdk.callback.onPostPublish((event) => {
    console.log(`  [回调] 帖子发布事件: postId=${event.data.postId}`);
  });
  sdk.callback.onUserDynamicSync((event) => {
    console.log(`  [动态同步] ${event.data.userId} - ${event.data.dynamicType}`);
  });

  const post = sdk.post.publishPost({
    type: 'experience',
    title: '字节跳动前端面试经验分享',
    content: '三轮技术面加一轮HR面，面试官很专业...'
  });
  console.log(`✓ 发布帖子: ${post.title}`);
  sdk.setCurrentUser(adminUser);
  console.log(`  回调统计: ${JSON.stringify(sdk.callback.getCallbackStats())}`);
  sdk.setCurrentUser(user1);

  const comment = sdk.post.publishComment({
    postId: post.id,
    content: '写得很好！补充一下三面的系统设计题...'
  });
  console.log(`✓ 发布评论: ${comment.content.slice(0, 25)}...`);

  console.log('\n--- 3. 互助任务完整流程（接受→完成→评价+动态+通知）---');
  sdk.setCurrentUser(user2);
  const task = sdk.task.createResumeReviewTask({
    title: '求大佬帮忙看看简历',
    description: '应届生求简历点评',
    bountyAmount: 20,
    deadline: Date.now() + 7 * 24 * 60 * 60 * 1000,
    resumeUrl: 'https://example.com/resume.pdf',
    tags: ['简历修改']
  });
  console.log(`✓ 发布任务: ${task.title}`);

  sdk.setCurrentUser(user1);
  const application = sdk.task.applyForTask({
    taskId: task.id,
    message: '我可以帮你看看简历'
  });
  console.log(`✓ 申请任务成功`);

  sdk.setCurrentUser(user2);
  sdk.task.acceptApplication(application.id);
  console.log(`✓ 接受申请 - 认领人应已收到系统通知`);

  sdk.task.completeTask({ taskId: task.id });
  console.log(`✓ 完成任务 - 双方应已收到系统通知`);

  sdk.task.rateTask({
    taskId: task.id,
    rating: 5,
    comment: '非常专业，改完简历拿到了面试！',
    isHelpful: true
  });
  console.log(`✓ 评价任务 - 认领人应已收到评价通知`);

  console.log('\n--- 4. 任务列表分类查看 ---');
  sdk.setCurrentUser(user2);
  const published = sdk.task.getMyPublishedTasks({ pageSize: 5 });
  console.log(`  我发布的任务: ${published.total}条`);
  sdk.setCurrentUser(user1);
  const claimed = sdk.task.getMyClaimedTasks({ pageSize: 5 });
  console.log(`  我认领的任务: ${claimed.total}条`);
  const completed = sdk.task.getMyCompletedTasks({});
  console.log(`  已完成的任务: ${completed.total}条`);

  console.log('\n--- 5. 内容举报（自动关联内容和被举报人）---');
  sdk.setCurrentUser(user1);
  const report = sdk.report.submitReport({
    type: 'spam',
    contentType: 'post',
    contentId: post.id,
    reason: '这个帖子涉嫌虚假信息'
  });
  console.log(`✓ 举报提交成功`);
  console.log(`  举报内容快照: ${(report.contentSnapshot || '').slice(0, 40)}...`);
  console.log(`  被举报人: ${report.reportedUser?.nickname}`);

  console.log('\n--- 6. 管理员处理举报（自动隐藏+通知双方）---');
  sdk.setCurrentUser(adminUser);
  const handled = sdk.report.handleReport({
    reportId: report.id,
    status: 'resolved',
    handleResult: '内容确属虚假信息，已隐藏'
  });
  console.log(`✓ 举报已处理: ${handled?.status}`);
  console.log(`  帖子当前状态: ${sdk.post.getPost(post.id)?.status}`);

  sdk.setCurrentUser(user1);
  const user1Unread = sdk.message.getUnreadCount();
  console.log(`  举报人未读消息: ${user1Unread.system}条`);
  sdk.setCurrentUser(user2);
  const user2Unread = sdk.message.getUnreadCount();
  console.log(`  被举报人未读消息: ${user2Unread.system}条`);

  console.log('\n--- 7. 普通用户只能看自己的举报 ---');
  sdk.setCurrentUser(user1);
  const myReports = sdk.report.getMyReports({});
  console.log(`  user_001 举报记录: ${myReports.total}条`);
  sdk.setCurrentUser(user2);
  const otherReports = sdk.report.getMyReports({});
  console.log(`  user_002 举报记录: ${otherReports.total}条`);

  console.log('\n--- 8. 数据回调状态查询 ---');
  sdk.setCurrentUser(adminUser);
  const stats = sdk.callback.getCallbackStats();
  console.log(`  回调统计: 总${stats.total}条, 成功${stats.success}, 失败${stats.failed}, 待处理${stats.pending}`);

  const failedCallbacks = sdk.callback.getCallbacksByStatus('failed', { pageSize: 5 });
  console.log(`  失败回调: ${failedCallbacks.total}条`);
  if (failedCallbacks.list.length > 0) {
    const retryResult = await sdk.callback.retryCallback(failedCallbacks.list[0].id);
    console.log(`  重试结果: ${retryResult ? '成功' : '失败'}`);
  }

  console.log('\n--- 9. 活动报名回调 ---');
  sdk.callback.onActivitySignup((event) => {
    console.log(`  [回调] 活动报名: ${event.data.activityName} - ${event.data.userName}`);
  });
  sdk.callback.triggerActivitySignup({
    activityId: 'act_001',
    activityName: '春季招聘会',
    userId: 'user_001',
    userName: '求职小白',
    signupTime: Date.now()
  });

  console.log('\n--- 10. 发帖回调只触发一次验证 ---');
  let postPublishCount = 0;
  sdk.callback.onPostPublish(() => { postPublishCount++; });
  sdk.setCurrentUser(user1);
  sdk.post.publishPost({
    type: 'discussion',
    title: '验证回调只触发一次',
    content: '这条帖子只应触发一次回调事件'
  });
  console.log(`  发布1篇帖子后收到事件次数: ${postPublishCount} (期望:1)`);

  console.log('\n=== 演示完成 ===');
  console.log(`SDK 版本: ${sdk.getVersion()}`);

  sdk.setCurrentUser(adminUser);
  const finalStats = sdk.callback.getCallbackStats();
  console.log(`\n最终回调统计: ${JSON.stringify(finalStats)}`);
}

runDemo().catch(console.error);
