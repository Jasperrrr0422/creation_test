import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, forkJoin, of } from 'rxjs';
import { catchError, finalize, map, mergeMap, tap } from 'rxjs/operators';
import { AiApiError, AiImageApiService } from './ai-image-api.service';
import { AiStorageService } from './ai-storage.service';
import {
  AiGeneratedImage,
  AiGenerationMode,
  AiGenerationRequest,
  AiImageState,
  AiModelConfig,
  AiModelId,
  AiModelParameters,
  AiPreferences,
  AiProgressStage,
} from './ai-image.types';

const LOCAL_MONTHLY_LIMIT = 1000;
const LOCAL_REQUESTS_PER_MINUTE = 4;

const baseParameters: AiModelParameters = {
  width: 1024,
  height: 1024,
  steps: 50,
  guidanceScale: 4,
  strength: 0.7,
  batchSize: 1,
};

const models: AiModelConfig[] = [
  {
    id: 'qwen-image-edit',
    label: 'Qwen Image Edit',
    provider: 'hugging-face',
    endpoint: 'Qwen/Qwen-Image-Edit',
    modes: ['image-to-image', 'inpaint', 'style-transfer', 'upscale'],
    defaults: baseParameters,
  },
  {
    id: 'qwen-image-edit-2509',
    label: 'Qwen Edit 2509',
    provider: 'hugging-face',
    endpoint: 'Qwen/Qwen-Image-Edit-2509',
    modes: ['image-to-image', 'inpaint', 'style-transfer', 'upscale'],
    defaults: { ...baseParameters, steps: 40, guidanceScale: 4.5 },
  },
  {
    id: 'qwen-image-edit-2511',
    label: 'Qwen Edit 2511',
    provider: 'hugging-face',
    endpoint: 'Qwen/Qwen-Image-Edit-2511',
    modes: ['image-to-image', 'inpaint', 'style-transfer', 'upscale'],
    defaults: { ...baseParameters, steps: 45, guidanceScale: 4 },
  },
];

const suggestionsByMode: Record<AiGenerationMode, string[]> = {
  'text-to-image': ['黑白极简品牌海报', '高对比度产品摄影', '干净的编辑设计风格'],
  'image-to-image': ['保持主体和构图不变，只调整整体视觉风格', '将背景替换为纯白摄影棚', '增强产品细节与自然阴影'],
  inpaint: ['只修改指定对象，其他区域保持完全不变', '删除背景中的杂物并自然补全', '替换画面中的文字并保持原字体风格'],
  'style-transfer': ['转换为黑白编辑风格并保留主体特征', '转换为极简品牌海报风格', '应用高对比度时尚杂志风格'],
  upscale: ['提升清晰度并修复压缩噪点', '增强边缘细节但不要改变内容', '修复模糊区域并保持自然纹理'],
};

interface BatchResult {
  image: AiGeneratedImage | null;
  error: AiApiError | null;
}

@Injectable({ providedIn: 'root' })
export class AiImageStateService {
  private readonly stateSubject: BehaviorSubject<AiImageState>;
  readonly state$: Observable<AiImageState>;
  private progressTimer?: ReturnType<typeof setInterval>;
  private requestTimestamps: number[] = [];

  constructor(
    private readonly api: AiImageApiService,
    private readonly storage: AiStorageService
  ) {
    this.stateSubject = new BehaviorSubject<AiImageState>(this.createInitialState());
    this.state$ = this.stateSubject.asObservable();
  }

  updatePrompt(prompt: string): void {
    this.patch({
      prompt,
      suggestions: this.getSuggestions(prompt, this.snapshot.preferences.mode),
      preferences: { ...this.snapshot.preferences, prompt },
    });
    this.persistPreferences();
  }

  updateNegativePrompt(negativePrompt: string): void {
    this.patch({
      negativePrompt,
      preferences: { ...this.snapshot.preferences, negativePrompt },
    });
    this.persistPreferences();
  }

  updateToken(apiToken: string): void {
    this.patch({ preferences: { ...this.snapshot.preferences, apiToken: apiToken.trim() } });
    this.persistPreferences();
  }

  selectModel(modelId: AiModelId): void {
    const model = this.getModel(modelId);
    const mode = model.modes.includes(this.snapshot.preferences.mode)
      ? this.snapshot.preferences.mode
      : model.modes[0];
    this.patch({
      suggestions: this.getSuggestions(this.snapshot.prompt, mode),
      preferences: { ...this.snapshot.preferences, activeModelId: model.id, mode },
    });
    this.persistPreferences();
  }

  selectMode(mode: AiGenerationMode): void {
    const model = this.getModel(this.snapshot.preferences.activeModelId);
    if (!model.modes.includes(mode)) return;
    this.patch({
      suggestions: this.getSuggestions(this.snapshot.prompt, mode),
      preferences: { ...this.snapshot.preferences, mode },
    });
    this.persistPreferences();
  }

  updateParameters(parameterPatch: Partial<AiModelParameters>): void {
    const preferences = this.snapshot.preferences;
    const current = preferences.parametersByModel[preferences.activeModelId];
    this.patch({
      preferences: {
        ...preferences,
        parametersByModel: {
          ...preferences.parametersByModel,
          [preferences.activeModelId]: { ...current, ...parameterPatch },
        },
      },
    });
    this.persistPreferences();
  }

  setSourceImage(dataUrl: string | null): void {
    this.patch({ sourceImageDataUrl: dataUrl });
  }

  toggleFavorite(imageId: string): void {
    const history = this.snapshot.history.map((image) =>
      image.id === imageId ? { ...image, favorite: !image.favorite } : image
    );
    const images = this.snapshot.images.map((image) =>
      image.id === imageId ? { ...image, favorite: !image.favorite } : image
    );
    this.patch({ history, images, favorites: history.filter((image) => image.favorite) });
    if (!this.storage.saveHistory(history)) this.patch({ error: 'Image history is too large for browser storage.' });
  }

  clearError(): void {
    this.patch({ error: null });
  }

  generate(): Observable<AiGeneratedImage[]> {
    const request = this.buildRequest();
    const validationError = this.validateRequest(request);
    if (validationError) {
      this.patch({ error: validationError });
      return of([]);
    }

    const model = this.getModel(request.modelId);
    this.recordRequests(request.batchSize);
    this.consumeQuota(request.batchSize);
    this.startProgress();

    const calls = Array.from({ length: request.batchSize }, () =>
      this.api.generate(request, model, this.snapshot.preferences.apiToken).pipe(
        mergeMap((blob) => this.blobToDataUrl(blob)),
        map((dataUrl): BatchResult => ({ image: this.createGeneratedImage(request, dataUrl), error: null })),
        catchError((error: AiApiError) => of<BatchResult>({ image: null, error }))
      )
    );

    return forkJoin(calls).pipe(
      map((results) => this.applyBatchResults(results)),
      finalize(() => this.stopProgress())
    );
  }

  private applyBatchResults(results: BatchResult[]): AiGeneratedImage[] {
    const images = results.flatMap((result) => result.image ? [result.image] : []);
    const errors = results.flatMap((result) => result.error ? [result.error] : []);
    const history = [...images, ...this.snapshot.history].slice(0, 12);
    const creditError = errors.find((error) => error.status === 402);
    const quota = creditError ? { ...this.snapshot.quota, exhausted: true } : this.snapshot.quota;
    const error = errors.length
      ? images.length
        ? `${images.length} image(s) completed; ${errors.length} failed. ${errors[0].message}`
        : errors[0].message
      : null;

    this.patch({ images, history, favorites: history.filter((image) => image.favorite), quota, error });
    if (!this.storage.saveHistory(history)) this.patch({ error: 'Generated images could not be saved because browser storage is full.' });
    this.storage.saveQuota(quota);
    return images;
  }

  private createGeneratedImage(request: AiGenerationRequest, dataUrl: string): AiGeneratedImage {
    return {
      id: crypto.randomUUID(),
      prompt: request.prompt,
      negativePrompt: request.negativePrompt,
      modelId: request.modelId,
      mode: request.mode,
      dataUrl,
      createdAt: new Date().toISOString(),
      favorite: false,
      parameters: {
        width: request.width,
        height: request.height,
        steps: request.steps,
        guidanceScale: request.guidanceScale,
        strength: request.strength,
        batchSize: request.batchSize,
      },
    };
  }

  private validateRequest(request: AiGenerationRequest): string | null {
    if (!this.snapshot.preferences.apiToken) return 'Add a Hugging Face token before editing.';
    if (!request.prompt.trim()) return 'Describe how you want to edit the image.';
    if (!request.sourceImageDataUrl) return 'Use the current canvas as the source image first.';
    if (this.snapshot.quota.exhausted || this.snapshot.quota.used + request.batchSize > this.snapshot.quota.monthlyLimit) {
      return 'The monthly request limit is exhausted.';
    }
    const recentCount = this.getRecentRequestCount();
    if (recentCount + request.batchSize > LOCAL_REQUESTS_PER_MINUTE) {
      return `Local rate limit reached. Wait one minute before sending more than ${LOCAL_REQUESTS_PER_MINUTE} images.`;
    }
    return null;
  }

  private buildRequest(): AiGenerationRequest {
    const preferences = this.snapshot.preferences;
    const parameters = preferences.parametersByModel[preferences.activeModelId];
    return {
      ...parameters,
      prompt: this.snapshot.prompt,
      negativePrompt: this.snapshot.negativePrompt,
      modelId: preferences.activeModelId,
      mode: preferences.mode,
      sourceImageDataUrl: this.snapshot.sourceImageDataUrl ?? undefined,
      batchSize: Math.min(Math.max(parameters.batchSize, 1), 4),
    };
  }

  private recordRequests(count: number): void {
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter((timestamp) => now - timestamp < 60_000);
    this.requestTimestamps.push(...Array.from({ length: count }, () => now));
  }

  private getRecentRequestCount(): number {
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter((timestamp) => now - timestamp < 60_000);
    return this.requestTimestamps.length;
  }

  private consumeQuota(count: number): void {
    const used = this.snapshot.quota.used + count;
    const quota = { ...this.snapshot.quota, used, exhausted: used >= this.snapshot.quota.monthlyLimit };
    this.patch({ quota });
    this.storage.saveQuota(quota);
  }

  private startProgress(): void {
    if (this.progressTimer) clearInterval(this.progressTimer);
    this.patch({ loading: true, progress: 8, progressStage: 'preparing', progressLabel: 'Preparing request', error: null });
    this.progressTimer = setInterval(() => {
      const progress = Math.min(this.snapshot.progress + 5, 92);
      const [progressStage, progressLabel] = this.progressDescription(progress);
      this.patch({ progress, progressStage, progressLabel });
    }, 900);
  }

  private stopProgress(): void {
    if (this.progressTimer) clearInterval(this.progressTimer);
    this.progressTimer = undefined;
    this.patch({ loading: false, progress: 100, progressStage: 'complete', progressLabel: 'Request complete' });
    setTimeout(() => this.patch({ progress: 0, progressStage: 'idle', progressLabel: '' }), 700);
  }

  private progressDescription(progress: number): [AiProgressStage, string] {
    if (progress < 25) return ['uploading', 'Uploading source image'];
    if (progress < 75) return ['processing', 'Qwen is editing the image'];
    return ['finalizing', 'Waiting for the final image'];
  }

  private blobToDataUrl(blob: Blob): Observable<string> {
    return new Observable((subscriber) => {
      const reader = new FileReader();
      reader.onload = () => {
        subscriber.next(String(reader.result));
        subscriber.complete();
      };
      reader.onerror = () => subscriber.error(new AiApiError('The generated image could not be read.', 0));
      reader.readAsDataURL(blob);
    });
  }

  private getSuggestions(prompt: string, mode: AiGenerationMode): string[] {
    const normalizedPrompt = prompt.toLowerCase();
    return suggestionsByMode[mode]
      .filter((suggestion) => !normalizedPrompt.includes(suggestion.toLowerCase()))
      .slice(0, 4);
  }

  private getModel(modelId: AiModelId): AiModelConfig {
    return models.find((model) => model.id === modelId) ?? models[0];
  }

  private createInitialState(): AiImageState {
    const preferences = this.loadPreferences();
    const history = this.storage.loadHistory();
    const quota = this.loadQuota();
    return {
      prompt: preferences.prompt,
      negativePrompt: preferences.negativePrompt,
      suggestions: this.getSuggestions(preferences.prompt, preferences.mode),
      images: history.slice(0, 4),
      history,
      favorites: history.filter((image) => image.favorite),
      loading: false,
      progress: 0,
      progressStage: 'idle',
      progressLabel: '',
      error: null,
      quota,
      models,
      preferences,
      sourceImageDataUrl: null,
    };
  }

  private loadPreferences(): AiPreferences {
    const defaults = models.reduce((result, model) => ({
      ...result,
      [model.id]: { ...model.defaults },
    }), {} as Record<AiModelId, AiModelParameters>);
    const stored = this.storage.loadPreferences();
    const activeModelId = models.some((model) => model.id === stored.activeModelId)
      ? stored.activeModelId as AiModelId
      : 'qwen-image-edit';
    const model = this.getModel(activeModelId);
    const mode = stored.mode && model.modes.includes(stored.mode) ? stored.mode : model.modes[0];
    const parametersByModel = models.reduce((result, item) => ({
      ...result,
      [item.id]: { ...item.defaults, ...(stored.parametersByModel?.[item.id] ?? {}) },
    }), defaults);
    return {
      apiToken: stored.apiToken ?? '',
      activeModelId,
      mode,
      prompt: stored.prompt ?? '保持主体和构图不变，将画面改为黑白极简品牌海报',
      negativePrompt: stored.negativePrompt ?? '低质量，模糊，变形，多余文字',
      parametersByModel,
    };
  }

  private loadQuota(): AiImageState['quota'] {
    const resetMonth = new Date().toISOString().slice(0, 7);
    const stored = this.storage.loadQuota();
    const monthlyLimit = stored.monthlyLimit ?? LOCAL_MONTHLY_LIMIT;
    const used = stored.resetMonth === resetMonth ? stored.used ?? 0 : 0;
    return { used, monthlyLimit, resetMonth, exhausted: used >= monthlyLimit };
  }

  private persistPreferences(): void {
    if (!this.storage.savePreferences(this.snapshot.preferences)) {
      this.patch({ error: 'Local preferences could not be saved.' });
    }
  }

  private patch(statePatch: Partial<AiImageState>): void {
    this.stateSubject.next({ ...this.snapshot, ...statePatch });
  }

  private get snapshot(): AiImageState {
    return this.stateSubject.value;
  }
}
