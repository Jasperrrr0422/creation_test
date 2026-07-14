import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { throwError } from 'rxjs';
import { AiApiError, AiImageApiService } from './ai-image-api.service';
import { AiImageStateService } from './ai-image-state.service';
import { AiStorageService } from './ai-storage.service';

describe('AiImageStateService', () => {
  let service: AiImageStateService;
  let api: jasmine.SpyObj<AiImageApiService>;
  let storage: jasmine.SpyObj<AiStorageService>;

  beforeEach(() => {
    api = jasmine.createSpyObj<AiImageApiService>('AiImageApiService', ['generate']);
    storage = jasmine.createSpyObj<AiStorageService>('AiStorageService', [
      'loadPreferences',
      'savePreferences',
      'loadHistory',
      'saveHistory',
      'loadQuota',
      'saveQuota',
    ]);
    storage.loadPreferences.and.returnValue({});
    storage.loadHistory.and.returnValue([]);
    storage.loadQuota.and.returnValue({});
    storage.savePreferences.and.returnValue(true);
    storage.saveHistory.and.returnValue(true);
    storage.saveQuota.and.returnValue(true);

    TestBed.configureTestingModule({
      providers: [
        AiImageStateService,
        { provide: AiImageApiService, useValue: api },
        { provide: AiStorageService, useValue: storage },
      ],
    });
    service = TestBed.inject(AiImageStateService);
  });

  it('allows the gateway to use a server-managed token when the browser token is empty', fakeAsync(() => {
    api.generate.and.returnValue(throwError(() => new AiApiError('Server token is missing.', 401)));
    service.setSourceImage('data:image/png;base64,AA==');

    let generatedCount = -1;
    service.generate().subscribe((images) => generatedCount = images.length);

    expect(api.generate).toHaveBeenCalledTimes(1);
    expect(api.generate.calls.mostRecent().args[2]).toBe('');
    expect(generatedCount).toBe(0);
    tick(700);
  }));

  it('keeps generation parameters isolated for each model', () => {
    service.updateParameters({ steps: 33 });
    service.selectModel('qwen-image-edit-2509');
    service.updateParameters({ steps: 17 });

    let originalSteps = 0;
    let alternateSteps = 0;
    service.state$.subscribe((state) => {
      originalSteps = state.preferences.parametersByModel['qwen-image-edit'].steps;
      alternateSteps = state.preferences.parametersByModel['qwen-image-edit-2509'].steps;
    }).unsubscribe();

    expect(originalSteps).toBe(33);
    expect(alternateSteps).toBe(17);
  });
});
