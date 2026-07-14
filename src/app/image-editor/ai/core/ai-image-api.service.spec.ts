import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AiImageApiService } from './ai-image-api.service';
import { AiGenerationRequest, AiModelConfig } from './ai-image.types';

describe('AiImageApiService', () => {
  let service: AiImageApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AiImageApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends Qwen image edits through the same-origin gateway', () => {
    const request: AiGenerationRequest = {
      prompt: 'Keep the subject and replace the background',
      negativePrompt: 'blur',
      modelId: 'qwen-image-edit',
      mode: 'image-to-image',
      sourceImageDataUrl: 'data:image/png;base64,AA==',
      width: 1024,
      height: 1024,
      steps: 50,
      guidanceScale: 4,
      strength: 0.7,
      batchSize: 1,
    };
    const model: AiModelConfig = {
      id: 'qwen-image-edit',
      label: 'Qwen Image Edit',
      provider: 'hugging-face',
      endpoint: 'Qwen/Qwen-Image-Edit',
      modes: ['image-to-image'],
      defaults: request,
    };

    service.generate(request, model, 'hf_test').subscribe((image) => expect(image.type).toBe('image/png'));

    const call = http.expectOne('/api/ai/generate');
    expect(call.request.method).toBe('POST');
    expect(call.request.body.token).toBe('hf_test');
    expect(call.request.body.model).toBe('Qwen/Qwen-Image-Edit');
    call.flush(new Blob(['image'], { type: 'image/png' }));
  });
});
