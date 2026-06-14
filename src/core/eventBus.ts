type EventHandler = (...args: any[]) => void;

export class EventBus {
  private events: Map<string, Set<EventHandler>> = new Map();

  on(event: string, handler: EventHandler): () => void {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event)!.add(handler);

    return () => {
      this.off(event, handler);
    };
  }

  off(event: string, handler: EventHandler): void {
    const handlers = this.events.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  emit(event: string, ...args: any[]): void {
    const handlers = this.events.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(...args);
        } catch (error) {
          console.error(`Event handler error for event "${event}":`, error);
        }
      });
    }
  }

  once(event: string, handler: EventHandler): () => void {
    const wrappedHandler = (...args: any[]) => {
      handler(...args);
      this.off(event, wrappedHandler);
    };
    return this.on(event, wrappedHandler);
  }

  clear(event?: string): void {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
  }

  listenerCount(event: string): number {
    return this.events.get(event)?.size || 0;
  }

  hasListeners(event: string): boolean {
    return this.listenerCount(event) > 0;
  }
}

export const eventBus = new EventBus();

export const EventNames = {
  POST_PUBLISHED: 'post:publish',
  POST_LIKED: 'post:like',
  POST_COLLECTED: 'post:collect',
  COMMENT_PUBLISHED: 'comment:publish',
  USER_FOLLOWED: 'user:follow',
  USER_BLOCKED: 'user:block',
  TASK_CREATED: 'task:create',
  TASK_CLAIMED: 'task:claim',
  TASK_COMPLETED: 'task:complete',
  MESSAGE_SENT: 'message:sent',
  REPORT_SUBMITTED: 'report:submit',
  ACTIVITY_SIGNUP: 'activity:signup',
  USER_DYNAMIC: 'user:dynamic',
  CONTRIBUTION_CHANGED: 'contribution:change'
} as const;
