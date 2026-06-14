import { BaseEntity, PaginationParams, PaginationResult } from '../types';
import { generateId, getCurrentTime, paginate } from '../utils/helpers';

export class BaseStore<T extends BaseEntity> {
  protected items: Map<string, T> = new Map();

  create(data: Omit<T, 'id' | 'createdAt' | 'updatedAt'> & Partial<T>, prefix: string = 'item'): T {
    const now = getCurrentTime();
    const item = {
      ...data,
      id: data.id || generateId(prefix),
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now
    } as T;
    this.items.set(item.id, item);
    return item;
  }

  getById(id: string): T | undefined {
    return this.items.get(id);
  }

  update(id: string, updates: Partial<T>): T | undefined {
    const item = this.items.get(id);
    if (!item) return undefined;

    const updated = {
      ...item,
      ...updates,
      id,
      updatedAt: getCurrentTime()
    } as T;
    this.items.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    return this.items.delete(id);
  }

  exists(id: string): boolean {
    return this.items.has(id);
  }

  count(): number {
    return this.items.size;
  }

  getAll(): T[] {
    return Array.from(this.items.values());
  }

  findMany(predicate: (item: T) => boolean): T[] {
    return Array.from(this.items.values()).filter(predicate);
  }

  findOne(predicate: (item: T) => boolean): T | undefined {
    for (const item of this.items.values()) {
      if (predicate(item)) return item;
    }
    return undefined;
  }

  paginate(
    items: T[],
    params: PaginationParams
  ): PaginationResult<T> {
    return paginate(items, params.page || 1, params.pageSize || 20);
  }

  clear(): void {
    this.items.clear();
  }
}
