import { TestBed } from '@angular/core/testing';
import { AiStorageService } from './ai-storage.service';
import { AiPreferences } from './ai-image.types';

describe('AiStorageService', () => {
  const preferences: AiPreferences = {
    activeModelId: 'qwen-image-edit',
    mode: 'image-to-image',
    prompt: 'Edit this image',
    parametersByModel: {
      'qwen-image-edit': { width: 1024, height: 1024, steps: 50, guidanceScale: 4, strength: 0.7, batchSize: 1 },
      'qwen-image-edit-2509': { width: 1024, height: 1024, steps: 40, guidanceScale: 4.5, strength: 0.7, batchSize: 1 },
      'qwen-image-edit-2511': { width: 1024, height: 1024, steps: 45, guidanceScale: 4, strength: 0.7, batchSize: 1 },
    },
  };

  beforeEach(() => {
    localStorage.clear();
  });

  it('persists AI preferences without browser-side secrets', () => {
    const service = TestBed.inject(AiStorageService);
    expect(service.savePreferences(preferences)).toBeTrue();
    expect(localStorage.getItem('creaition.ai.preferences.v2')).toContain('Edit this image');
    expect(service.loadPreferences().prompt).toBe('Edit this image');
  });
});
