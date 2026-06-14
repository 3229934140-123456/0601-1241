import { EventBus } from './eventBus';
import { SensitiveWordFilter } from './sensitiveWordFilter';
import { UserProfile, CallbackConfig } from '../types';

export interface SDKConfig {
  appId?: string;
  appSecret?: string;
  baseUrl?: string;
  currentUserId?: string;
  sensitiveWords?: string[];
  enableSensitiveWordCheck?: boolean;
  callback?: CallbackConfig;
  adminIds?: string[];
  storage?: 'memory' | 'localStorage' | 'custom';
}

export interface SDKContext {
  config: SDKConfig;
  eventBus: EventBus;
  sensitiveWordFilter: SensitiveWordFilter;
  currentUser?: UserProfile;
  setCurrentUser: (user: UserProfile) => void;
}

export function createDefaultConfig(): SDKConfig {
  return {
    enableSensitiveWordCheck: true,
    adminIds: [],
    storage: 'memory',
    callback: {
      timeout: 10000,
      maxRetries: 3,
      retryDelay: 5000
    }
  };
}
