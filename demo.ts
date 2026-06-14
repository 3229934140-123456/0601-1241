import { JobSocialSDK, createSDK, UserProfile, ReportAction, UserReportView, CallbackEventGroup } from './src';

const sdk = createSDK({
  appId: 'test-app-id',
  adminIds: ['admin_001'],
  enableSensitiveWordCheck: true,
  sensitiveWords: ['测试敏感词', '违规内容'],
  callback: {
    activitySignupUrl: ['https://biz1.example.com/callback/activity', 'https://biz2.example.com/webhook/activity'],
    userDynamicSyncUrl: 'https://biz1.example.com/callback/dynamic',
    postPublishUrl: 'https://biz1.example.com/callback/post',
    taskCompleteUrl: '',
    reportSubmitUrl: 'https://biz1.example.com/callback/report',
    timeout: 3000,
    maxRetries: 3
  }
});

const user1: UserProfile = {
  id: 'user_001', nickname: '求职小白', avatar: 'https://example.com/a1.jpg',
  bio: '应届生', contributionValue: 0, level: 1, isVerified: false,
  tags: ['前端'], createdAt: Date.now(), updatedAt: Date.now()
};
const user2: UserProfile = {
  id: 'user_002', nickname: '面试达人', avatar: 'https://example.com/a2.jpg',
  bio: '3年经验', contributionValue: 500, level: 4, isVerified: true,
  tags: ['后端'], createdAt: Date.now(), updatedAt: Date.now()
};
const adminUser: UserProfile = {
  id: 'admin_001', nickname: '管理员', avatar: 'https://example.com/admin.jpg',
  bio: '管理员', contributionValue: 9999, level: 10, isVerified: true,
  tags: ['管理员'], createdAt: Date.now(), updatedAt: Date.now()
};

async function runDemo() {
  console.log('=== 社交互动平台 SDK v5 演示 ===\n');

  sdk.user.createUser(user1);
  sdk.user.createUser(user2);
  sdk.user.createUser(adminUser);

  console.log('--- 1. 消息治理：会话清理+治理视图 ---');
  sdk.setCurrentUser(user2);
  const msg1 = sdk.message.sendPrivateMessage({ receiverId: 'user_001', content: '你好，聊聊简历的事' });
  const msg2 = sdk.message.sendPrivateMessage({ receiverId: 'user_001', content: '第二条消息' });
  console.log(`✓ 发送2条私信`);

  sdk.setCurrentUser(user1);
  const convBefore = sdk.message.getConversationList({ pageSize: 10 });
  console.log(`  处置前会话数: ${convBefore.total}, 最后消息: ${(convBefore.list[0]?.lastMessage as any)?.content?.slice(0, 20)}`);

  sdk.report.submitReport({ type: 'spam', contentType: 'message', contentId: msg1.id, reason: '骚扰' });

  sdk.setCurrentUser(adminUser);
  sdk.report.handleReport({
    reportId: (sdk.report as any).reportStore.getAll().find((r: any) => r.contentId === msg1.id)?.id,
    status: 'resolved', handleResult: '违规消息已删除', action: 'delete' as ReportAction
  });
  console.log(`✓ 管理员删除第1条私信`);

  sdk.setCurrentUser(user1);
  const convAfter = sdk.message.getConversationList({ pageSize: 10 });
  console.log(`  处置后会话数: ${convAfter.total}, 最后消息: ${(convAfter.list[0]?.lastMessage as any)?.content?.slice(0, 20)} (应为第2条)`);

  const unread = sdk.message.getUnreadCount();
  console.log(`  user_001 未读: 总${unread.total}, 私信${unread.private}`);

  sdk.setCurrentUser(adminUser);
  const hiddenRecords = sdk.message.getModerationRecords({ moderationStatus: 'deleted', type: 'private', pageSize: 10 });
  console.log(`  管理员-已删除私信记录: ${hiddenRecords.total}条`);

  console.log('\n--- 2. 申诉复核：被处理人申诉+复核回滚 ---');
  sdk.setCurrentUser(user2);
  const post = sdk.post.publishPost({ type: 'discussion', title: '求职讨论帖', content: '想和大家聊聊面试技巧' });
  console.log(`✓ user_002 发帖: ${post.title}`);

  sdk.setCurrentUser(user1);
  const postReport = sdk.report.submitReport({ type: 'spam', contentType: 'post', contentId: post.id, reason: '不实信息' });

  sdk.setCurrentUser(adminUser);
  sdk.report.handleReport({
    reportId: (sdk.report as any).reportStore.getAll().find((r: any) => r.contentId === post.id)?.id,
    status: 'resolved', handleResult: '内容违规，已隐藏', action: 'hide' as ReportAction
  });
  console.log(`✓ 管理员隐藏帖子，帖子状态: ${sdk.post.getPost(post.id)?.status}`);

  sdk.setCurrentUser(user2);
  const appealReports = (sdk.report as any).reportStore.getAll().filter((r: any) => r.contentId === post.id);
  if (appealReports.length > 0) {
    const appealResult = sdk.report.submitAppeal(appealReports[0].id, '内容真实，并非不实信息');
    console.log(`✓ user_002 提交申诉`);
    console.log(`  申诉状态: ${(appealResult as UserReportView).appealStatus}`);

    sdk.setCurrentUser(adminUser);
    sdk.report.reviewAppeal({
      reportId: appealReports[0].id,
      result: 'overturned',
      reason: '经核实，内容属实，恢复帖子'
    });
    console.log(`✓ 管理员复核: 推翻原判`);

    const restoredPost = sdk.post.getPost(post.id);
    console.log(`  帖子状态: ${restoredPost?.status} (应为published)`);

    sdk.setCurrentUser(user2);
    const myAppeals = sdk.report.getMyAppeals({ pageSize: 10 });
    console.log(`  user_002 申诉记录: ${myAppeals.total}条`);
  }

  console.log('\n--- 3. 任务评价细节：完成时间+评价+筛选 ---');
  sdk.setCurrentUser(user2);
  const task = sdk.task.createResumeReviewTask({
    title: '求帮忙看简历', description: '应届生求简历点评',
    bountyAmount: 20, deadline: Date.now() + 7 * 24 * 60 * 60 * 1000,
    resumeUrl: 'https://example.com/resume.pdf', tags: ['简历修改']
  });

  sdk.setCurrentUser(user1);
  const app = sdk.task.applyForTask({ taskId: task.id, message: '我可以帮你' });

  sdk.setCurrentUser(user2);
  sdk.task.acceptApplication(app.id);
  sdk.task.completeTask({ taskId: task.id });
  console.log(`✓ 任务完成`);

  const taskDetail = sdk.task.getTaskWithReview(task.id);
  console.log(`  完成时间: ${taskDetail?.task?.completedAt ? new Date(taskDetail.task.completedAt).toLocaleString() : '无'}`);
  console.log(`  评价: ${taskDetail?.review ? '无(未评价)' : '无(未评价)'}`);

  sdk.task.rateTask({ taskId: task.id, rating: 5, comment: '非常专业，改完拿到了面试！', isHelpful: true });
  console.log(`✓ 评价任务: 5星`);

  const taskWithReview = sdk.task.getTaskWithReview(task.id);
  console.log(`  评分: ${taskWithReview?.review?.rating}星`);
  console.log(`  评价内容: ${taskWithReview?.review?.comment}`);
  console.log(`  reviewId: ${taskWithReview?.task?.reviewId}`);

  sdk.setCurrentUser(user1);
  const unreviewed = sdk.task.getMyClaimedTasks({ status: 'completed' });
  const unreviewedTasks = unreviewed.list.filter(t => !t.reviewId);
  console.log(`  认领方-已完成未评价: ${unreviewedTasks.length}条`);

  sdk.setCurrentUser(user2);
  const reviewed = sdk.task.getMyPublishedTasks({ status: 'completed' });
  const reviewedTasks = reviewed.list.filter(t => t.reviewId);
  console.log(`  发布方-已完成已评价: ${reviewedTasks.length}条`);

  console.log('\n--- 4. 回调分组统计+重试历史 ---');
  sdk.setCurrentUser(adminUser);
  sdk.callback.clearCallbacks();

  sdk.callback.triggerCallback('activity_signup', 'activity_signup_spring', {
    activityId: 'act_001', activityName: '春季招聘会',
    userId: 'user_001', userName: '求职小白', signupTime: Date.now()
  });

  sdk.callback.triggerCallback('report_submit', 'report_submit', {
    reportId: 'rpt_001', reporterId: 'user_001', type: 'spam',
    contentType: 'post', contentId: 'post_001', reason: '测试', timestamp: Date.now()
  });

  await new Promise(resolve => setTimeout(resolve, 500));

  const statsByGroup = sdk.callback.getCallbackStatsByGroup();
  console.log(`  按分组统计:`);
  statsByGroup.forEach(s => {
    console.log(`    ${s.group}: 总${s.total}, 成功${s.success}, 失败${s.failed}`);
  });

  const businessCallbacks = sdk.callback.getCallbackList({ group: 'business' as CallbackEventGroup, pageSize: 20 });
  console.log(`  业务活动类回调: ${businessCallbacks.total}条`);
  const governanceCallbacks = sdk.callback.getCallbackList({ group: 'governance' as CallbackEventGroup, pageSize: 20 });
  console.log(`  治理事件类回调: ${governanceCallbacks.total}条`);

  const failedCallbacks = sdk.callback.getCallbacksByStatus('failed', { pageSize: 5 });
  if (failedCallbacks.list.length > 0) {
    console.log(`  尝试重试第1条失败回调...`);
    await sdk.callback.retryCallback(failedCallbacks.list[0].id);
    const record = sdk.callback.getCallbackRecord(failedCallbacks.list[0].id);
    console.log(`  重试历史: ${record?.retryHistory?.length || 0}次尝试`);
    if (record?.retryHistory && record.retryHistory.length > 0) {
      record.retryHistory.forEach((h, i) => {
        console.log(`    第${i + 1}次: ${h.success ? '成功' : '失败'} - ${h.error || h.response || ''}`);
      });
    }
  }

  console.log('\n=== 演示完成 ===');
  console.log(`SDK 版本: ${sdk.getVersion()}`);
}

runDemo().catch(console.error);
