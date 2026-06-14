import { BaseModule } from '../core/baseModule';
import { BaseStore } from '../core/baseStore';
import { SDKContext } from '../core/config';
import {
  Post,
  CreatePostParams,
  PostListParams,
  PostListResult,
  Comment,
  CreateCommentParams,
  CommentListParams,
  CommentListResult,
  PostDetail,
  UserProfile,
  ContentStatus
} from '../types';

export class PostModule extends BaseModule {
  private postStore: BaseStore<Post>;
  private commentStore: BaseStore<Comment>;
  private likeStore: Map<string, Set<string>> = new Map();
  private collectStore: Map<string, Set<string>> = new Map();
  private viewStore: Map<string, Set<string>> = new Map();
  private userModule: any;
  private topicModule: any;

  constructor(context: SDKContext, userModule?: any, topicModule?: any) {
    super(context);
    this.postStore = new BaseStore<Post>();
    this.commentStore = new BaseStore<Comment>();
    this.userModule = userModule;
    this.topicModule = topicModule;
  }

  setDependencies(userModule: any, topicModule: any): void {
    this.userModule = userModule;
    this.topicModule = topicModule;
  }

  private getAuthor(userId: string): UserProfile {
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

  publishPost(params: CreatePostParams): Post {
    this.requireLogin();
    const userId = this.currentUserId!;

    this.checkContentSensitive(params.title);
    this.checkContentSensitive(params.content);

    const author = this.getAuthor(userId);
    const topicNames = params.topicIds?.map(id => {
      if (this.topicModule) {
        const topic = this.topicModule.getTopic(id);
        return topic?.name || '';
      }
      return '';
    }).filter(Boolean);

    const post = this.postStore.create(
      {
        userId,
        author,
        type: params.type,
        title: this.filterContent(params.title),
        content: this.filterContent(params.content),
        images: params.images,
        topicIds: params.topicIds,
        topicNames,
        circleId: params.circleId,
        isAnonymous: params.isAnonymous || false,
        anonymousName: params.anonymousName,
        isPinned: false,
        isTop: false,
        likeCount: 0,
        commentCount: 0,
        collectCount: 0,
        viewCount: 0,
        shareCount: 0,
        status: 'published',
        bountyAmount: params.bountyAmount,
        isBounty: !!params.bountyAmount && params.bountyAmount > 0,
        bountyStatus: params.bountyAmount ? 'open' : undefined
      },
      'post'
    );

    if (params.topicIds) {
      params.topicIds.forEach(topicId => {
        if (this.topicModule) {
          this.topicModule.incrementPostCount(topicId, 1);
        }
      });
    }

    if (this.userModule) {
      this.userModule.addContribution(userId, 'post_publish', post.id);
    }

    this.emit('post:publish', post);

    if (params.type === 'experience') {
      this.emit('post:experience_publish', post);
    } else if (params.type === 'question') {
      this.emit('post:question_publish', post);
    }

    return post;
  }

  getPost(postId: string, withComments: boolean = false): PostDetail | undefined {
    const post = this.postStore.getById(postId);
    if (!post) return undefined;

    if (this.currentUserId) {
      const postViews = this.viewStore.get(postId) || new Set();
      if (!postViews.has(this.currentUserId)) {
        postViews.add(this.currentUserId);
        this.viewStore.set(postId, postViews);
        this.postStore.update(postId, { viewCount: post.viewCount + 1 });
      }
    }

    const isLiked = this.isPostLiked(postId);
    const isCollected = this.isPostCollected(postId);

    const detail: PostDetail = {
      ...post,
      isLiked,
      isCollected
    };

    if (withComments) {
      detail.comments = this.getCommentList({ postId, page: 1, pageSize: 20 });
    }

    return detail;
  }

  getPostList(params: PostListParams): PostListResult {
    let posts = this.postStore.findMany(p => p.status === 'published');

    if (params.userId) {
      posts = posts.filter(p => p.userId === params.userId);
    }

    if (params.topicId) {
      const topicId = params.topicId;
      posts = posts.filter(p => p.topicIds?.includes(topicId));
    }

    if (params.circleId) {
      posts = posts.filter(p => p.circleId === params.circleId);
    }

    if (params.type) {
      posts = posts.filter(p => p.type === params.type);
    }

    if (params.keyword) {
      const keyword = params.keyword.toLowerCase();
      posts = posts.filter(
        p => p.title.toLowerCase().includes(keyword) ||
          p.content.toLowerCase().includes(keyword)
      );
    }

    if (params.isPinnedFirst) {
      posts.sort((a, b) => {
        if (a.isTop !== b.isTop) return b.isTop ? 1 : -1;
        return b.createdAt - a.createdAt;
      });
    } else {
      switch (params.sortBy) {
        case 'hot':
          posts.sort((a, b) => (b.likeCount + b.commentCount * 2) - (a.likeCount + a.commentCount * 2));
          break;
        case 'mostLiked':
          posts.sort((a, b) => b.likeCount - a.likeCount);
          break;
        case 'mostCommented':
          posts.sort((a, b) => b.commentCount - a.commentCount);
          break;
        default:
          posts.sort((a, b) => b.createdAt - a.createdAt);
      }
    }

    return this.postStore.paginate(posts, params);
  }

  updatePost(postId: string, updates: Partial<Post>): Post | undefined {
    this.requireLogin();
    const userId = this.currentUserId!;

    const post = this.postStore.getById(postId);
    if (!post) return undefined;

    if (post.userId !== userId && !this.isAdmin) {
      throw new Error('无权限修改此帖子');
    }

    if (updates.title) {
      this.checkContentSensitive(updates.title);
      updates.title = this.filterContent(updates.title);
    }
    if (updates.content) {
      this.checkContentSensitive(updates.content);
      updates.content = this.filterContent(updates.content);
    }

    return this.postStore.update(postId, updates);
  }

  deletePost(postId: string): boolean {
    this.requireLogin();
    const userId = this.currentUserId!;

    const post = this.postStore.getById(postId);
    if (!post) return false;

    if (post.userId !== userId && !this.isAdmin) {
      throw new Error('无权限删除此帖子');
    }

    this.postStore.update(postId, { status: 'deleted' });
    this.emit('post:delete', { postId, userId });
    return true;
  }

  likePost(postId: string): boolean {
    this.requireLogin();
    const userId = this.currentUserId!;

    const post = this.postStore.getById(postId);
    if (!post || post.status !== 'published') {
      throw new Error('帖子不存在');
    }

    const postLikes = this.likeStore.get(postId) || new Set();
    if (postLikes.has(userId)) {
      postLikes.delete(userId);
      this.likeStore.set(postId, postLikes);
      this.postStore.update(postId, { likeCount: Math.max(0, post.likeCount - 1) });
      this.emit('post:unlike', { postId, userId });
      return false;
    }

    postLikes.add(userId);
    this.likeStore.set(postId, postLikes);
    this.postStore.update(postId, { likeCount: post.likeCount + 1 });

    if (this.userModule && post.userId !== userId) {
      this.userModule.addContribution(post.userId, 'like_receive', postId);
    }

    this.emit('post:like', { postId, userId });
    return true;
  }

  isPostLiked(postId: string): boolean {
    if (!this.currentUserId) return false;
    const postLikes = this.likeStore.get(postId) || new Set();
    return postLikes.has(this.currentUserId);
  }

  collectPost(postId: string): boolean {
    this.requireLogin();
    const userId = this.currentUserId!;

    const post = this.postStore.getById(postId);
    if (!post || post.status !== 'published') {
      throw new Error('帖子不存在');
    }

    const postCollects = this.collectStore.get(postId) || new Set();
    if (postCollects.has(userId)) {
      postCollects.delete(userId);
      this.collectStore.set(postId, postCollects);
      this.postStore.update(postId, { collectCount: Math.max(0, post.collectCount - 1) });
      this.emit('post:uncollect', { postId, userId });
      return false;
    }

    postCollects.add(userId);
    this.collectStore.set(postId, postCollects);
    this.postStore.update(postId, { collectCount: post.collectCount + 1 });
    this.emit('post:collect', { postId, userId });
    return true;
  }

  isPostCollected(postId: string): boolean {
    if (!this.currentUserId) return false;
    const postCollects = this.collectStore.get(postId) || new Set();
    return postCollects.has(this.currentUserId);
  }

  getMyCollections(params: { page?: number; pageSize?: number }): PostListResult {
    this.requireLogin();
    const userId = this.currentUserId!;

    const collectedPostIds: string[] = [];
    this.collectStore.forEach((userSet, postId) => {
      if (userSet.has(userId)) {
        collectedPostIds.push(postId);
      }
    });

    const posts = collectedPostIds
      .map(id => this.postStore.getById(id))
      .filter((p): p is Post => p !== undefined && p.status === 'published');

    posts.sort((a, b) => b.updatedAt - a.updatedAt);

    return this.postStore.paginate(posts, params);
  }

  publishComment(params: CreateCommentParams): Comment {
    this.requireLogin();
    const userId = this.currentUserId!;

    this.checkContentSensitive(params.content);

    const post = this.postStore.getById(params.postId);
    if (!post || post.status !== 'published') {
      throw new Error('帖子不存在');
    }

    const author = this.getAuthor(userId);

    let replyToUser: UserProfile | undefined;
    if (params.replyToUserId) {
      replyToUser = this.getAuthor(params.replyToUserId);
    }

    let quotedComment: Comment | undefined;
    if (params.quotedCommentId) {
      quotedComment = this.commentStore.getById(params.quotedCommentId);
    }

    const comment = this.commentStore.create(
      {
        postId: params.postId,
        userId,
        author,
        content: this.filterContent(params.content),
        images: params.images,
        likeCount: 0,
        replyCount: 0,
        isAnonymous: params.isAnonymous || false,
        anonymousName: params.anonymousName,
        parentId: params.parentId,
        replyToUserId: params.replyToUserId,
        replyToUser,
        status: 'published',
        quotedCommentId: params.quotedCommentId,
        quotedComment
      },
      'comment'
    );

    this.postStore.update(params.postId, { commentCount: post.commentCount + 1 });

    if (params.parentId) {
      const parent = this.commentStore.getById(params.parentId);
      if (parent) {
        this.commentStore.update(params.parentId, { replyCount: parent.replyCount + 1 });
      }
    }

    if (this.userModule) {
      this.userModule.addContribution(userId, 'comment_publish', comment.id);
    }

    this.emit('comment:publish', comment);
    return comment;
  }

  getCommentList(params: CommentListParams): CommentListResult {
    let comments = this.commentStore.findMany(
      c => c.postId === params.postId && c.status === 'published'
    );

    if (params.parentId !== undefined) {
      if (params.parentId === null) {
        comments = comments.filter(c => !c.parentId);
      } else {
        comments = comments.filter(c => c.parentId === params.parentId);
      }
    } else {
      comments = comments.filter(c => !c.parentId);
    }

    switch (params.sortBy) {
      case 'mostLiked':
        comments.sort((a, b) => b.likeCount - a.likeCount);
        break;
      default:
        comments.sort((a, b) => a.createdAt - b.createdAt);
    }

    return this.commentStore.paginate(comments, params);
  }

  likeComment(commentId: string): boolean {
    this.requireLogin();
    const userId = this.currentUserId!;

    const comment = this.commentStore.getById(commentId);
    if (!comment || comment.status !== 'published') {
      throw new Error('评论不存在');
    }

    const likeKey = `comment_${commentId}`;
    let commentLikes = this.likeStore.get(likeKey) || new Set();

    if (commentLikes.has(userId)) {
      commentLikes.delete(userId);
      this.likeStore.set(likeKey, commentLikes);
      this.commentStore.update(commentId, { likeCount: Math.max(0, comment.likeCount - 1) });
      return false;
    }

    commentLikes.add(userId);
    this.likeStore.set(likeKey, commentLikes);
    this.commentStore.update(commentId, { likeCount: comment.likeCount + 1 });
    return true;
  }

  deleteComment(commentId: string): boolean {
    this.requireLogin();
    const userId = this.currentUserId!;

    const comment = this.commentStore.getById(commentId);
    if (!comment) return false;

    if (comment.userId !== userId && !this.isAdmin) {
      throw new Error('无权限删除此评论');
    }

    this.commentStore.update(commentId, { status: 'deleted' });

    const post = this.postStore.getById(comment.postId);
    if (post) {
      this.postStore.update(comment.postId, {
        commentCount: Math.max(0, post.commentCount - 1)
      });
    }

    return true;
  }

  setTopPost(postId: string, isTop: boolean = true): Post | undefined {
    if (!this.isAdmin) {
      throw new Error('只有管理员可以置顶帖子');
    }

    const post = this.postStore.getById(postId);
    if (!post) return undefined;

    return this.postStore.update(postId, { isTop, isPinned: isTop });
  }

  getMyPosts(params: { page?: number; pageSize?: number; type?: string }): PostListResult {
    this.requireLogin();
    const userId = this.currentUserId!;

    let posts = this.postStore.findMany(p => p.userId === userId && p.status !== 'deleted');

    if (params.type) {
      posts = posts.filter(p => p.type === params.type);
    }

    posts.sort((a, b) => b.createdAt - a.createdAt);

    return this.postStore.paginate(posts, params);
  }

  sharePost(postId: string): void {
    const post = this.postStore.getById(postId);
    if (post) {
      this.postStore.update(postId, { shareCount: post.shareCount + 1 });
      this.emit('post:share', { postId });
    }
  }

  getPostCountByUser(userId: string): number {
    return this.postStore.findMany(p => p.userId === userId && p.status === 'published').length;
  }

  getComment(commentId: string): Comment | undefined {
    return this.commentStore.getById(commentId);
  }

  hidePost(postId: string): boolean {
    const post = this.postStore.getById(postId);
    if (!post) return false;
    this.postStore.update(postId, { status: 'hidden' });
    this.emit('post:hide', { postId });
    return true;
  }

  hideComment(commentId: string): boolean {
    const comment = this.commentStore.getById(commentId);
    if (!comment) return false;
    this.commentStore.update(commentId, { status: 'hidden' });
    return true;
  }
}
