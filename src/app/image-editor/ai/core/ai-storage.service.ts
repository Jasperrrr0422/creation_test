import { Injectable } from '@angular/core';
import { AiGeneratedImage, AiImageState, AiPreferences } from './ai-image.types';

const PREFERENCES_KEY = 'creaition.ai.preferences.v2';
const HISTORY_KEY = 'creaition.ai.history.v2';
const QUOTA_KEY = 'creaition.ai.quota.v2';

@Injectable({ providedIn: 'root' })
export class AiStorageService {
  loadPreferences(): Partial<AiPreferences> {
    return this.readJson<Partial<AiPreferences>>(localStorage, PREFERENCES_KEY, {});
  }

  savePreferences(preferences: AiPreferences): boolean {
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
      return true;
    } catch {
      return false;
    }
  }

  loadHistory(): AiGeneratedImage[] {
    return this.readJson<AiGeneratedImage[]>(localStorage, HISTORY_KEY, []);
  }

  saveHistory(history: AiGeneratedImage[]): boolean {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 12)));
      return true;
    } catch {
      return false;
    }
  }

  loadQuota(): Partial<AiImageState['quota']> {
    return this.readJson<Partial<AiImageState['quota']>>(localStorage, QUOTA_KEY, {});
  }

  saveQuota(quota: AiImageState['quota']): boolean {
    try {
      localStorage.setItem(QUOTA_KEY, JSON.stringify(quota));
      return true;
    } catch {
      return false;
    }
  }

  private readJson<T>(storage: Storage, key: string, fallback: T): T {
    try {
      const value = storage.getItem(key);
      return value ? JSON.parse(value) as T : fallback;
    } catch {
      return fallback;
    }
  }
}
