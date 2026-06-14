import { BaseModule } from '../core/baseModule';
import { BaseStore } from '../core/baseStore';
import { SDKContext } from '../core/config';
import {
  Topic,
  CreateTopicParams,
  TopicParams,
  TopicListResult,
  JobCircle,
  CreateJobCircleParams,
  UpdateJobCircleRulesParams,
  CircleMember,
  ContentStatus
} from '../types';

export class TopicModule extends BaseModule {
  private topicStore: BaseStore<Topic>;
  private circleStore: BaseStore<JobCircle>;
  private circleMemberStore: BaseStore<CircleMember>;
  private followedTopics: Map<string, Set<string>> = new Map();

  constructor(context: SDKContext) {
    super(context);
    this.topicStore = new BaseStore<Topic>();
    this.circleStore = new BaseStore<JobCircle>();
    this.circleMemberStore = new BaseStore<CircleMember>();
    this.initDefaultTopics();
  }

  private initDefaultTopics(): void {
    const defaultTopics = [
      { name: '面经分享', description: '分享面试经验，助你拿到心仪offer', category: '求职经验' },
      { name: '简历修改', description: '简历修改建议和技巧', category: '求职技巧' },
      { name: '求职问答', description: '求职路上的问题，都可以在这里提问', category: '问答' },
      { name: '薪资爆料', description: '各公司薪资待遇分享', category: '职场资讯' },
      { name: '内推机会', description: '内推信息发布与求助', category: '求职机会' },
      { name: '职业规划', description: '职业发展规划讨论', category: '职业发展' },
      { name: '跳槽经验', description: '跳槽经验分享', category: '职场经验' },
      { name: '国企央企', description: '国企央企求职交流', category: '行业交流' },
      { name: '互联网', description: '互联网行业求职交流', category: '行业交流' },
      { name: '金融银行', description: '金融银行行业求职交流', category: '行业交流' }
    ];

    defaultTopics.forEach((t, index) => {
      const topic = this.topicStore.create(
        {
          name: t.name,
          description: t.description,
          category: t.category,
          postCount: Math.floor(Math.random() * 1000),
          followerCount: Math.floor(Math.random() * 5000),
          isHot: index < 5,
          sortOrder: index,
          status: 'published' as ContentStatus
        },
        'topic'
      );
    });
  }

  createTopic(params: CreateTopicParams): Topic {
    this.requireLogin();
    this.checkContentSensitive(params.name);
    if (params.description) {
      this.checkContentSensitive(params.description);
    }

    const existing = this.topicStore.findOne(t => t.name === params.name && t.status === 'published');
    if (existing) {
      throw new Error('话题已存在');
    }

    const topic = this.topicStore.create(
      {
        name: params.name,
        description: params.description || '',
        coverImage: params.coverImage,
        category: params.category,
        postCount: 0,
        followerCount: 0,
        isHot: false,
        sortOrder: 999,
        status: 'published'
      },
      'topic'
    );

    this.emit('topic:create', topic);
    return topic;
  }

  getTopic(topicId: string): Topic | undefined {
    return this.topicStore.getById(topicId);
  }

  getTopicByName(name: string): Topic | undefined {
    return this.topicStore.findOne(t => t.name === name && t.status === 'published');
  }

  getTopicList(params: TopicParams): TopicListResult {
    let topics = this.topicStore.findMany(t => t.status === 'published');

    if (params.keyword) {
      const keyword = params.keyword.toLowerCase();
      topics = topics.filter(
        t => t.name.toLowerCase().includes(keyword) ||
          (t.description && t.description.toLowerCase().includes(keyword))
      );
    }

    if (params.category) {
      topics = topics.filter(t => t.category === params.category);
    }

    switch (params.sortBy) {
      case 'hot':
        topics.sort((a, b) => (b.isHot ? 1 : 0) - (a.isHot ? 1 : 0) || b.postCount - a.postCount);
        break;
      case 'latest':
        topics.sort((a, b) => b.createdAt - a.createdAt);
        break;
      case 'mostFollowed':
        topics.sort((a, b) => b.followerCount - a.followerCount);
        break;
      default:
        topics.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    }

    return this.topicStore.paginate(topics, params);
  }

  getHotTopics(limit: number = 10): Topic[] {
    const topics = this.topicStore
      .findMany(t => t.status === 'published')
      .sort((a, b) => b.postCount - a.postCount)
      .slice(0, limit);

    return topics;
  }

  followTopic(topicId: string): boolean {
    this.requireLogin();
    const userId = this.currentUserId!;

    const topic = this.topicStore.getById(topicId);
    if (!topic || topic.status !== 'published') {
      throw new Error('话题不存在');
    }

    const userFollows = this.followedTopics.get(userId) || new Set();
    if (userFollows.has(topicId)) {
      return false;
    }

    userFollows.add(topicId);
    this.followedTopics.set(userId, userFollows);

    this.topicStore.update(topicId, {
      followerCount: topic.followerCount + 1
    });

    this.emit('topic:follow', { userId, topicId });
    return true;
  }

  unfollowTopic(topicId: string): boolean {
    this.requireLogin();
    const userId = this.currentUserId!;

    const topic = this.topicStore.getById(topicId);
    if (!topic) {
      return false;
    }

    const userFollows = this.followedTopics.get(userId);
    if (!userFollows || !userFollows.has(topicId)) {
      return false;
    }

    userFollows.delete(topicId);
    this.followedTopics.set(userId, userFollows);

    this.topicStore.update(topicId, {
      followerCount: Math.max(0, topic.followerCount - 1)
    });

    this.emit('topic:unfollow', { userId, topicId });
    return true;
  }

  isFollowingTopic(topicId: string): boolean {
    this.requireLogin();
    const userFollows = this.followedTopics.get(this.currentUserId!);
    return userFollows ? userFollows.has(topicId) : false;
  }

  getFollowedTopics(params: { page?: number; pageSize?: number }): TopicListResult {
    this.requireLogin();
    const userId = this.currentUserId!;

    const userFollows = this.followedTopics.get(userId) || new Set();
    const topics = Array.from(userFollows)
      .map(id => this.topicStore.getById(id))
      .filter((t): t is Topic => t !== undefined && t.status === 'published');

    topics.sort((a, b) => b.followerCount - a.followerCount);

    return this.topicStore.paginate(topics, params);
  }

  incrementPostCount(topicId: string, delta: number = 1): void {
    const topic = this.topicStore.getById(topicId);
    if (topic) {
      this.topicStore.update(topicId, {
        postCount: Math.max(0, topic.postCount + delta)
      });
    }
  }

  createJobCircle(params: CreateJobCircleParams): JobCircle {
    this.requireLogin();
    this.checkContentSensitive(params.name);
    this.checkContentSensitive(params.description);

    if (params.rules) {
      params.rules.forEach(rule => this.checkContentSensitive(rule));
    }

    const circle = this.circleStore.create(
      {
        name: params.name,
        description: params.description,
        rules: params.rules || ['遵守社区规范', '文明交流', '禁止广告'],
        coverImage: params.coverImage,
        memberCount: 1,
        postCount: 0,
        adminIds: [this.currentUserId!],
        isPublic: params.isPublic !== false,
        status: 'active'
      },
      'circle'
    );

    this.circleMemberStore.create(
      {
        circleId: circle.id,
        userId: this.currentUserId!,
        role: 'owner',
        joinedAt: Date.now()
      },
      'cmember'
    );

    this.emit('circle:create', circle);
    return circle;
  }

  getJobCircle(circleId: string): JobCircle | undefined {
    return this.circleStore.getById(circleId);
  }

  updateJobCircleRules(params: UpdateJobCircleRulesParams): JobCircle | undefined {
    this.requireLogin();

    const circle = this.circleStore.getById(params.circleId);
    if (!circle) {
      throw new Error('圈子不存在');
    }

    if (!circle.adminIds.includes(this.currentUserId!)) {
      throw new Error('只有管理员可以修改圈子规则');
    }

    params.rules.forEach(rule => this.checkContentSensitive(rule));

    const updated = this.circleStore.update(params.circleId, {
      rules: params.rules
    });

    this.emit('circle:updateRules', { circleId: params.circleId, rules: params.rules });
    return updated;
  }

  updateJobCircle(circleId: string, updates: Partial<JobCircle>): JobCircle | undefined {
    this.requireLogin();

    const circle = this.circleStore.getById(circleId);
    if (!circle) {
      throw new Error('圈子不存在');
    }

    if (!circle.adminIds.includes(this.currentUserId!)) {
      throw new Error('只有管理员可以修改圈子信息');
    }

    if (updates.name) {
      this.checkContentSensitive(updates.name);
    }
    if (updates.description) {
      this.checkContentSensitive(updates.description);
    }
    if (updates.rules) {
      updates.rules.forEach(rule => this.checkContentSensitive(rule));
    }

    return this.circleStore.update(circleId, updates);
  }

  joinJobCircle(circleId: string): boolean {
    this.requireLogin();
    const userId = this.currentUserId!;

    const circle = this.circleStore.getById(circleId);
    if (!circle || circle.status !== 'active') {
      throw new Error('圈子不存在或已关闭');
    }

    const existing = this.circleMemberStore.findOne(
      m => m.circleId === circleId && m.userId === userId
    );

    if (existing) {
      return false;
    }

    this.circleMemberStore.create(
      {
        circleId,
        userId,
        role: 'member',
        joinedAt: Date.now()
      },
      'cmember'
    );

    this.circleStore.update(circleId, {
      memberCount: circle.memberCount + 1
    });

    this.emit('circle:join', { userId, circleId });
    return true;
  }

  leaveJobCircle(circleId: string): boolean {
    this.requireLogin();
    const userId = this.currentUserId!;

    const circle = this.circleStore.getById(circleId);
    if (!circle) {
      return false;
    }

    const member = this.circleMemberStore.findOne(
      m => m.circleId === circleId && m.userId === userId
    );

    if (!member) {
      return false;
    }

    if (member.role === 'owner') {
      throw new Error('圈主不能退出圈子，请先转让圈主身份');
    }

    this.circleMemberStore.delete(member.id);

    this.circleStore.update(circleId, {
      memberCount: Math.max(0, circle.memberCount - 1)
    });

    if (member.role === 'admin') {
      const updatedAdminIds = circle.adminIds.filter(id => id !== userId);
      this.circleStore.update(circleId, { adminIds: updatedAdminIds });
    }

    this.emit('circle:leave', { userId, circleId });
    return true;
  }

  isCircleMember(circleId: string): boolean {
    if (!this.currentUserId) return false;
    const member = this.circleMemberStore.findOne(
      m => m.circleId === circleId && m.userId === this.currentUserId
    );
    return !!member;
  }

  getCircleMembers(circleId: string, params: { page?: number; pageSize?: number; role?: string }): {
    list: CircleMember[];
    total: number;
    page: number;
    pageSize: number;
  } {
    let members = this.circleMemberStore.findMany(m => m.circleId === circleId);

    if (params.role) {
      members = members.filter(m => m.role === params.role);
    }

    members.sort((a, b) => {
      const roleOrder: Record<string, number> = { owner: 0, admin: 1, member: 2 };
      return (roleOrder[a.role] || 99) - (roleOrder[b.role] || 99);
    });

    return this.circleMemberStore.paginate(members, params);
  }

  getJobCircleList(params: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    sortBy?: 'latest' | 'mostMembers' | 'mostPosts';
  }): { list: JobCircle[]; total: number; page: number; pageSize: number } {
    let circles = this.circleStore.findMany(c => c.status === 'active');

    if (params.keyword) {
      const keyword = params.keyword.toLowerCase();
      circles = circles.filter(
        c => c.name.toLowerCase().includes(keyword) ||
          c.description.toLowerCase().includes(keyword)
      );
    }

    switch (params.sortBy) {
      case 'mostMembers':
        circles.sort((a, b) => b.memberCount - a.memberCount);
        break;
      case 'mostPosts':
        circles.sort((a, b) => b.postCount - a.postCount);
        break;
      default:
        circles.sort((a, b) => b.createdAt - a.createdAt);
    }

    return this.circleStore.paginate(circles, params);
  }

  getMyCircles(params: { page?: number; pageSize?: number }): {
    list: JobCircle[];
    total: number;
    page: number;
    pageSize: number;
  } {
    this.requireLogin();
    const userId = this.currentUserId!;

    const memberships = this.circleMemberStore.findMany(m => m.userId === userId);
    const circleIds = memberships.map(m => m.circleId);

    const circles = circleIds
      .map(id => this.circleStore.getById(id))
      .filter((c): c is JobCircle => c !== undefined && c.status === 'active');

    circles.sort((a, b) => b.updatedAt - a.updatedAt);

    return this.circleStore.paginate(circles, params);
  }
}
