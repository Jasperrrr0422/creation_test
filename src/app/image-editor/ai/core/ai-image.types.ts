export type AiGenerationMode =
  | 'text-to-image'
  | 'image-to-image'
  | 'inpaint'
  | 'style-transfer'
  | 'upscale';

export type AiModelId =
  | 'qwen-image-edit'
  | 'qwen-image-edit-2509'
  | 'qwen-image-edit-2511';

export type AiProgressStage =
  | 'idle'
  | 'preparing'
  | 'uploading'
  | 'processing'
  | 'finalizing'
  | 'complete';

export interface AiModelConfig {
  id: AiModelId;
  label: string;
  provider: 'hugging-face';
  endpoint: string;
  modes: AiGenerationMode[];
  defaults: AiModelParameters;
}

export interface AiModelParameters {
  width: number;
  height: number;
  steps: number;
  guidanceScale: number;
  strength: number;
  batchSize: number;
}

export interface AiGenerationRequest extends AiModelParameters {
  prompt: string;
  modelId: AiModelId;
  mode: AiGenerationMode;
  sourceImageDataUrl?: string;
}

export interface AiGeneratedImage {
  id: string;
  prompt: string;
  modelId: AiModelId;
  mode: AiGenerationMode;
  dataUrl: string;
  createdAt: string;
  favorite: boolean;
  parameters: AiModelParameters;
}

export interface AiQuotaState {
  used: number;
  monthlyLimit: number;
  resetMonth: string;
  exhausted: boolean;
}

export interface AiPreferences {
  apiToken: string;
  activeModelId: AiModelId;
  mode: AiGenerationMode;
  prompt: string;
  parametersByModel: Record<AiModelId, AiModelParameters>;
}

export interface AiImageState {
  prompt: string;
  suggestions: string[];
  images: AiGeneratedImage[];
  history: AiGeneratedImage[];
  favorites: AiGeneratedImage[];
  loading: boolean;
  progress: number;
  progressStage: AiProgressStage;
  progressLabel: string;
  error: string | null;
  quota: AiQuotaState;
  models: AiModelConfig[];
  preferences: AiPreferences;
  sourceImageDataUrl: string | null;
}
