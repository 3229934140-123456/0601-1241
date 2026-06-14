export function generateId(prefix: string = 'id'): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${prefix}_${timestamp}_${random}`;
}

export function getCurrentTime(): number {
  return Date.now();
}

export function paginate<T>(
  list: T[],
  page: number = 1,
  pageSize: number = 20
): { list: T[]; total: number; page: number; pageSize: number } {
  const total = list.length;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  return {
    list: list.slice(start, end),
    total,
    page,
    pageSize
  };
}

export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item)) as unknown as T;
  }
  const cloned = {} as T;
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      (cloned as any)[key] = deepClone((obj as any)[key]);
    }
  }
  return cloned;
}

export function formatDate(timestamp: number, format: string = 'YYYY-MM-DD HH:mm:ss'): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return format
    .replace('YYYY', String(year))
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds);
}

export function calculateLevel(contributionValue: number): number {
  if (contributionValue < 100) return 1;
  if (contributionValue < 300) return 2;
  if (contributionValue < 600) return 3;
  if (contributionValue < 1000) return 4;
  if (contributionValue < 1500) return 5;
  if (contributionValue < 2500) return 6;
  if (contributionValue < 4000) return 7;
  if (contributionValue < 6000) return 8;
  if (contributionValue < 9000) return 9;
  return 10;
}

export function getContributionConfig(type: string): { value: number; reason: string } {
  const config: Record<string, { value: number; reason: string }> = {
    post_publish: { value: 10, reason: '发布帖子' },
    comment_publish: { value: 2, reason: '发表评论' },
    like_receive: { value: 1, reason: '获得点赞' },
    task_complete: { value: 50, reason: '完成互助任务' },
    task_claim: { value: 5, reason: '认领互助任务' },
    follow_new: { value: 1, reason: '获得新粉丝' },
    report_valid: { value: 5, reason: '有效举报' }
  };
  return config[type] || { value: 0, reason: '其他' };
}
