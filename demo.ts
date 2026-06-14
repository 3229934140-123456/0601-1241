import { JobSocialSDK, createSDK, UserProfile } from './src';

const sdk = createSDK({
  appId: 'test-app-id',
  adminIds: ['admin_001'],
  enableSensitiveWordCheck: true,
  sensitiveWords: ['测试敏感词', '违规内容'],
  callback: {
    activitySignupUrl: 'https://example.com/callback/activity',
    userDynamicSyncUrl: 'https://example.com/callback/dynamic',
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

async function runDemo() {
  console.log('=== 社交互动平台 SDK 演示 ===\n');

  console.log('1. 设置当前用户');
  sdk.setCurrentUser(user1);
  console.log(`当前用户: ${sdk.getCurrentUser()?.nickname}`);

  sdk.user.createUser(user2);

  console.log('\n2. 用户关系 - 关注');
  const followResult = sdk.user.follow('user_002');
  console.log(`关注 ${user2.nickname}: ${followResult ? '成功' : '失败'}`);
  console.log(`粉丝数: ${sdk.user.getFollowerCount('user_002')}`);
  console.log(`关注数: ${sdk.user.getFollowingCount('user_001')}`);

  console.log('\n3. 话题 - 热门话题');
  const hotTopics = sdk.topic.getHotTopics(5);
  console.log('热门话题:');
  hotTopics.forEach((t, i) => console.log(`  ${i + 1}. ${t.name} (${t.postCount}帖子)`));

  console.log('\n4. 求职圈 - 创建圈子');
  const circle = sdk.topic.createJobCircle({
    name: '前端求职互助圈',
    description: '前端求职者互助交流，分享面经，修改简历',
    rules: ['文明交流', '禁止垃圾信息', '鼓励分享'],
    isPublic: true
  });
  console.log(`创建圈子: ${circle.name} (ID: ${circle.id})`);
  console.log(`圈主: ${circle.adminIds.join(', ')}`);

  console.log('\n5. 帖子 - 发布面经');
  const firstTopic = hotTopics[0];
  const post = sdk.post.publishPost({
    type: 'experience',
    title: '字节跳动前端面试经验分享',
    content: '今天分享一下我面字节跳动前端岗位的经历，总共三轮技术面+一轮HR面...',
    topicIds: firstTopic ? [firstTopic.id] : undefined,
    images: ['https://example.com/img1.jpg']
  });
  console.log(`发布帖子: ${post.title}`);
  console.log(`帖子ID: ${post.id}`);
  console.log(`作者贡献值: ${sdk.user.getContributionValue('user_001')}`);

  console.log('\n6. 帖子 - 匿名提问');
  const question = sdk.post.publishPost({
    type: 'question',
    title: '应届生没经验怎么找第一份工作？',
    content: '马上要毕业了，感觉自己什么都不会，很焦虑，想问问大家都是怎么找到第一份工作的...',
    isAnonymous: true,
    anonymousName: '迷茫的应届生'
  });
  console.log(`匿名提问: ${question.title}`);
  console.log(`匿名身份: ${question.anonymousName}`);

  console.log('\n7. 帖子 - 点赞收藏');
  const liked = sdk.post.likePost(post.id);
  const collected = sdk.post.collectPost(post.id);
  console.log(`点赞帖子: ${liked ? '成功' : '取消'}`);
  console.log(`收藏帖子: ${collected ? '成功' : '取消'}`);
  console.log(`帖子点赞数: ${sdk.post.getPost(post.id)?.likeCount}`);

  console.log('\n8. 帖子 - 回复评论');
  sdk.setCurrentUser(user2);
  const comment = sdk.post.publishComment({
    postId: post.id,
    content: '写得很好！补充一下，三面主要考察系统设计能力...'
  });
  console.log(`发表评论: ${comment.content.slice(0, 30)}...`);
  console.log(`评论数: ${sdk.post.getPost(post.id)?.commentCount}`);

  console.log('\n9. 帖子 - 引用回复');
  const replyWithQuote = sdk.post.publishComment({
    postId: post.id,
    content: '同意你的观点，我当时也是这么准备的',
    parentId: comment.id,
    replyToUserId: comment.userId,
    quotedCommentId: comment.id
  });
  console.log(`引用评论: ${replyWithQuote.content}`);

  console.log('\n10. 互助任务 - 悬赏简历点评');
  const task = sdk.task.createResumeReviewTask({
    title: '求大佬帮忙看看简历，20元红包感谢',
    description: '本人应届生，想找前端开发工作，简历写好了但心里没底，求有经验的大佬帮忙看看...',
    bountyAmount: 20,
    deadline: Date.now() + 7 * 24 * 60 * 60 * 1000,
    resumeUrl: 'https://example.com/resume.pdf',
    tags: ['简历修改', '前端']
  });
  console.log(`发布任务: ${task.title}`);
  console.log(`悬赏金额: ¥${task.bountyAmount}`);
  console.log(`任务状态: ${task.status}`);

  console.log('\n11. 互助任务 - 认领任务');
  sdk.setCurrentUser(user1);
  const applied = sdk.task.applyForTask({
    taskId: task.id,
    message: '我有3年前端经验，可以帮你看看简历，修改意见保证详细'
  });
  console.log(`申请任务: ${applied ? '成功' : '失败'}`);

  console.log('\n12. 互助任务 - 接受申请');
  sdk.setCurrentUser(user2);
  const applications = sdk.task.getTaskApplications(task.id, {});
  console.log(`申请人数: ${applications.total}`);
  if (applications.list.length > 0) {
    sdk.task.acceptApplication(applications.list[0].id);
    const updatedTask = sdk.task.getTask(task.id);
    console.log(`已接受申请，当前任务状态: ${updatedTask?.status}`);
    console.log(`认领人: ${updatedTask?.claimer?.nickname}`);
  }

  console.log('\n13. 消息 - 发送私信');
  const privateMsg = sdk.message.sendPrivateMessage({
    receiverId: 'user_001',
    content: '你好，我是面试达人，很高兴认识你！'
  });
  console.log(`发送私信: ${privateMsg.content}`);

  console.log('\n14. 消息 - 系统通知');
  const sysMsg = sdk.message.sendSystemNotification(
    'user_001',
    '恭喜您获得「活跃用户」徽章！',
    'system'
  );
  console.log(`系统通知: ${sysMsg.content}`);

  console.log('\n15. 消息 - 未读统计');
  sdk.setCurrentUser(user1);
  const unreadCount = sdk.message.getUnreadCount();
  console.log(`未读消息总数: ${unreadCount.total}`);
  console.log(`  私信: ${unreadCount.private}`);
  console.log(`  系统通知: ${unreadCount.system}`);

  console.log('\n16. 黑名单');
  const blocked = sdk.user.blockUser('user_002', '不想看到这个人');
  console.log(`拉黑用户: ${blocked ? '成功' : '失败'}`);
  const blacklist = sdk.user.getBlacklist({});
  console.log(`黑名单人数: ${blacklist.total}`);

  console.log('\n17. 内容举报');
  const report = sdk.report.submitReport({
    type: 'other',
    contentType: 'post',
    contentId: post.id,
    reason: '这个帖子内容有问题'
  });
  console.log(`举报提交: ${report.id}`);
  console.log(`举报状态: ${report.status}`);

  console.log('\n18. 管理员置顶');
  const adminUser: UserProfile = {
    ...user1,
    id: 'admin_001',
    nickname: '管理员'
  };
  sdk.setCurrentUser(adminUser);
  const pinnedPost = sdk.post.setTopPost(post.id, true);
  console.log(`置顶帖子: ${pinnedPost?.isTop ? '已置顶' : '未置顶'}`);

  console.log('\n19. 用户贡献值');
  console.log(`用户1贡献值: ${sdk.user.getContributionValue('user_001')}`);
  console.log(`用户2贡献值: ${sdk.user.getContributionValue('user_002')}`);

  console.log('\n20. 贡献值排行榜');
  const ranking = sdk.user.getContributionRanking({ pageSize: 10 });
  console.log('贡献值排行榜:');
  ranking.list.forEach((u, i) => {
    console.log(`  ${i + 1}. ${u.nickname} - ${u.contributionValue}分 (Lv.${u.level})`);
  });

  console.log('\n21. 数据回调 - 活动报名');
  sdk.callback.onActivitySignup((event) => {
    console.log(`[回调] 活动报名: ${event.data.activityName} - 用户: ${event.data.userName}`);
  });

  sdk.callback.triggerActivitySignup({
    activityId: 'act_001',
    activityName: '春季招聘会',
    userId: 'user_001',
    userName: '求职小白',
    signupTime: Date.now(),
    extraInfo: { school: '某某大学' }
  });

  console.log('\n22. 数据回调 - 个人动态同步');
  sdk.callback.onUserDynamicSync((event) => {
    console.log(`[回调] 用户动态: ${event.data.userId} - ${event.data.dynamicType}`);
  });

  console.log('  再发布一条帖子来触发动态同步...');
  sdk.setCurrentUser(user1);
  sdk.post.publishPost({
    type: 'discussion',
    title: '大家找工作进度怎么样了？',
    content: '三月了，想问问大家目前的求职进度如何，拿到offer了吗？'
  });

  console.log('\n=== 演示完成 ===');
  console.log(`SDK 版本: ${sdk.getVersion()}`);
}

runDemo().catch(console.error);
