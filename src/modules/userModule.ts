import { BaseModule } from '../core/baseModule';
import { BaseStore } from '../core/baseStore';
import { SDKContext } from '../core/config';
import {
  UserProfile,
  UserRelation,
  UserStats,
  FollowParams,
  FollowListResult,
  BlacklistItem,
  ContributionRecord,
  ContributionRankingParams,
  PaginationResult
} from '../types';
import { calculateLevel, getContributionConfig, paginate } from '../utils/helpers';

export class UserModule extends BaseModule {
  private userStore: BaseStore<UserProfile>;
  private relationStore: BaseStore<UserRelation>;
  private blacklistStore: BaseStore<BlacklistItem>;
  private contributionStore: BaseStore<ContributionRecord>;

  constructor(context: SDKContext) {
    super(context);
    this.userStore = new BaseStore<UserProfile>();
    this.relationStore = new BaseStore<UserRelation>();
    this.blacklistStore = new BaseStore<BlacklistItem>();
    this.contributionStore = new BaseStore<ContributionRecord>();
  }

  setCurrentUser(user: UserProfile): void {
    this.context.setCurrentUser(user);
    if (!this.userStore.exists(user.id)) {
      this.userStore.create(user, 'user');
    }
  }

  getCurrentUser(): UserProfile | undefined {
    return this.currentUser;
  }

  getUser(userId: string): UserProfile | undefined {
    return this.userStore.getById(userId);
  }

  createUser(user: Omit<UserProfile, 'contributionValue' | 'level'> & Partial<UserProfile>): UserProfile {
    const contributionValue = user.contributionValue || 0;
    const newUser: UserProfile = {
      ...user,
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      bio: user.bio || '',
      contributionValue,
      level: calculateLevel(contributionValue),
      isVerified: user.isVerified || false,
      tags: user.tags || []
    };
    return this.userStore.create(newUser, 'user');
  }

  updateUser(userId: string, updates: Partial<UserProfile>): UserProfile | undefined {
    if (updates.contributionValue !== undefined) {
      updates.level = calculateLevel(updates.contributionValue);
    }
    return this.userStore.update(userId, updates);
  }

  follow(targetUserId: string): boolean {
    this.requireLogin();
    const userId = this.currentUserId!;

    if (userId === targetUserId) {
      throw new Error('不能关注自己');
    }

    const existingRelation = this.relationStore.findOne(
      r => r.userId === userId && r.targetUserId === targetUserId && r.type === 'follow'
    );

    if (existingRelation) {
      return false;
    }

    const isBlocked = this.isUserBlocked(targetUserId, userId);
    if (isBlocked) {
      throw new Error('对方已将您拉黑，无法关注');
    }

    this.relationStore.create(
      {
        userId,
        targetUserId,
        type: 'follow'
      },
      'rel'
    );

    this.addContribution(targetUserId, 'follow_new', `user_${userId}`);

    this.emit('user:follow', { userId, targetUserId });

    return true;
  }

  unfollow(targetUserId: string): boolean {
    this.requireLogin();
    const userId = this.currentUserId!;

    const relation = this.relationStore.findOne(
      r => r.userId === userId && r.targetUserId === targetUserId && r.type === 'follow'
    );

    if (!relation) {
      return false;
    }

    this.relationStore.delete(relation.id);
    this.emit('user:unfollow', { userId, targetUserId });

    return true;
  }

  isFollowing(targetUserId: string): boolean {
    this.requireLogin();
    const userId = this.currentUserId!;
    return this.relationStore.findMany(
      r => r.userId === userId && r.targetUserId === targetUserId && r.type === 'follow'
    ).length > 0;
  }

  getFollowing(params: FollowParams): FollowListResult {
    const relations = this.relationStore.findMany(
      r => r.userId === params.userId && r.type === 'follow'
    );

    const userIds = relations.map(r => r.targetUserId);
    const users = userIds
      .map(id => this.userStore.getById(id))
      .filter((u): u is UserProfile => u !== undefined);

    return this.userStore.paginate(users, params);
  }

  getFollowers(params: FollowParams): FollowListResult {
    const relations = this.relationStore.findMany(
      r => r.targetUserId === params.userId && r.type === 'follow'
    );

    const userIds = relations.map(r => r.userId);
    const users = userIds
      .map(id => this.userStore.getById(id))
      .filter((u): u is UserProfile => u !== undefined);

    return this.userStore.paginate(users, params);
  }

  getFollowingCount(userId: string): number {
    return this.relationStore.findMany(
      r => r.userId === userId && r.type === 'follow'
    ).length;
  }

  getFollowerCount(userId: string): number {
    return this.relationStore.findMany(
      r => r.targetUserId === userId && r.type === 'follow'
    ).length;
  }

  blockUser(targetUserId: string, reason?: string): boolean {
    this.requireLogin();
    const userId = this.currentUserId!;

    if (userId === targetUserId) {
      throw new Error('不能拉黑自己');
    }

    const existing = this.blacklistStore.findOne(
      b => b.userId === userId && b.blockedUserId === targetUserId
    );

    if (existing) {
      return false;
    }

    this.blacklistStore.create(
      {
        userId,
        blockedUserId: targetUserId,
        reason
      },
      'blk'
    );

    const followRelation = this.relationStore.findOne(
      r => r.userId === userId && r.targetUserId === targetUserId && r.type === 'follow'
    );
    if (followRelation) {
      this.relationStore.delete(followRelation.id);
    }

    const followerRelation = this.relationStore.findOne(
      r => r.userId === targetUserId && r.targetUserId === userId && r.type === 'follow'
    );
    if (followerRelation) {
      this.relationStore.delete(followerRelation.id);
    }

    this.emit('user:block', { userId, targetUserId, reason });

    return true;
  }

  unblockUser(targetUserId: string): boolean {
    this.requireLogin();
    const userId = this.currentUserId!;

    const item = this.blacklistStore.findOne(
      b => b.userId === userId && b.blockedUserId === targetUserId
    );

    if (!item) {
      return false;
    }

    this.blacklistStore.delete(item.id);
    this.emit('user:unblock', { userId, targetUserId });

    return true;
  }

  isBlocked(targetUserId: string): boolean {
    this.requireLogin();
    return this.isUserBlocked(this.currentUserId!, targetUserId);
  }

  private isUserBlocked(userId: string, targetUserId: string): boolean {
    return this.blacklistStore.findMany(
      b => b.userId === targetUserId && b.blockedUserId === userId
    ).length > 0;
  }

  getBlacklist(params: { page?: number; pageSize?: number }): PaginationResult<UserProfile> {
    this.requireLogin();
    const userId = this.currentUserId!;

    const items = this.blacklistStore.findMany(b => b.userId === userId);
    const userIds = items.map(i => i.blockedUserId);
    const users = userIds
      .map(id => this.userStore.getById(id))
      .filter((u): u is UserProfile => u !== undefined);

    return paginate(users, params.page || 1, params.pageSize || 20);
  }

  addContribution(
    userId: string,
    type: string,
    relatedId?: string
  ): number {
    const config = getContributionConfig(type);
    if (config.value === 0) return 0;

    const user = this.userStore.getById(userId);
    if (!user) return 0;

    const newValue = user.contributionValue + config.value;
    this.userStore.update(userId, {
      contributionValue: newValue,
      level: calculateLevel(newValue)
    });

    this.contributionStore.create(
      {
        userId,
        value: config.value,
        reason: config.reason,
        type: type as ContributionRecord['type'],
        relatedId
      },
      'contrib'
    );

    this.emit('contribution:change', { userId, value: config.value, total: newValue, type });

    return config.value;
  }

  getContributionValue(userId: string): number {
    const user = this.userStore.getById(userId);
    return user?.contributionValue || 0;
  }

  getUserStats(userId: string): UserStats {
    const user = this.userStore.getById(userId);
    return {
      followingCount: this.getFollowingCount(userId),
      followerCount: this.getFollowerCount(userId),
      postCount: 0,
      likeCount: 0,
      contributionValue: user?.contributionValue || 0
    };
  }

  getContributionRanking(
    params: ContributionRankingParams
  ): PaginationResult<UserProfile> {
    const users = this.userStore.getAll();
    const sorted = users.sort((a, b) => b.contributionValue - a.contributionValue);
    return this.userStore.paginate(sorted, params);
  }

  getContributionRecords(
    userId: string,
    params: { page?: number; pageSize?: number; type?: string }
  ): PaginationResult<ContributionRecord> {
    let records = this.contributionStore.findMany(r => r.userId === userId);
    if (params.type) {
      records = records.filter(r => r.type === params.type);
    }
    records.sort((a, b) => b.createdAt - a.createdAt);
    return this.contributionStore.paginate(records, params);
  }
}
