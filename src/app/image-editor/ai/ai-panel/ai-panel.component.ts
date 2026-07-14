import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AiGeneratedImage, AiGenerationMode, AiImageState, AiModelId, AiModelParameters } from '../core/ai-image.types';
import { AiImageStateService } from '../core/ai-image-state.service';

interface PromptCompletion {
  label: string;
  description: string;
  value: string;
  modes: AiGenerationMode[];
  keywords: string[];
}

const promptCompletions: PromptCompletion[] = [
  {
    label: 'Preserve subject',
    description: '保持主体、版式和构图不变',
    value: 'keep the subject identity, layout, and composition unchanged',
    modes: ['image-to-image', 'style-transfer', 'upscale'],
    keywords: ['keep', 'preserve', 'subject', 'composition', 'layout', '保持', '主体', '构图', '版式', '不变'],
  },
  {
    label: 'White studio background',
    description: '替换为干净的纯白摄影棚背景',
    value: 'replace the background with a clean pure white studio background',
    modes: ['image-to-image', 'inpaint'],
    keywords: ['background', 'white', 'studio', 'clean', '背景', '白色', '纯白', '摄影棚', '干净'],
  },
  {
    label: 'Monochrome editorial style',
    description: '转换为黑白极简编辑海报风格',
    value: 'apply a black and white minimal editorial poster style',
    modes: ['image-to-image', 'style-transfer'],
    keywords: ['black', 'white', 'mono', 'editorial', 'poster', 'style', '黑白', '单色', '极简', '海报', '风格', '杂志'],
  },
  {
    label: 'Product detail enhancement',
    description: '增强产品细节、边缘和自然阴影',
    value: 'enhance product details, edges, and natural shadows without changing the design',
    modes: ['image-to-image', 'upscale'],
    keywords: ['enhance', 'detail', 'sharp', 'shadow', 'product', '增强', '细节', '清晰', '锐化', '阴影', '产品'],
  },
  {
    label: 'Local repair only',
    description: '只修复指定区域，其他区域保持不变',
    value: 'only edit the described area and keep every other area unchanged',
    modes: ['inpaint'],
    keywords: ['only', 'area', 'repair', 'local', 'unchanged', '只', '区域', '局部', '修复', '不变'],
  },
  {
    label: 'Remove distractions',
    description: '移除杂物并自然补全背景',
    value: 'remove distracting background objects and naturally reconstruct the missing area',
    modes: ['inpaint', 'image-to-image'],
    keywords: ['remove', 'object', 'background', 'clean', '移除', '删除', '杂物', '物体', '背景', '补全'],
  },
  {
    label: 'Typography lock',
    description: '锁定文字、排版位置和字形',
    value: 'preserve all typography, text placement, and letter shapes',
    modes: ['image-to-image', 'inpaint', 'style-transfer', 'upscale'],
    keywords: ['text', 'type', 'typography', 'letter', 'logo', '文字', '字体', '排版', '字形', 'logo', '标志'],
  },
  {
    label: 'High quality restoration',
    description: '提升清晰度、降噪并保持原内容',
    value: 'increase clarity, reduce compression noise, and keep the original content unchanged',
    modes: ['upscale', 'image-to-image'],
    keywords: ['quality', 'noise', 'clarity', 'restore', 'upscale', '画质', '质量', '噪点', '清晰度', '修复', '放大'],
  },
  {
    label: 'Color and light correction',
    description: '修正曝光、对比度和色彩平衡',
    value: 'correct exposure, contrast, and color balance while preserving the original scene',
    modes: ['image-to-image', 'upscale'],
    keywords: ['color', 'light', 'exposure', 'contrast', 'balance', '颜色', '色彩', '光线', '曝光', '对比度'],
  },
  {
    label: 'Clean product cutout',
    description: '清理产品边缘并保持白卡干净',
    value: 'clean up product edges and keep the white card background neat and minimal',
    modes: ['image-to-image', 'inpaint', 'upscale'],
    keywords: ['cutout', 'edge', 'card', 'minimal', 'clean', '边缘', '白卡', '抠图', '干净', '产品'],
  },
];

@Component({
  selector: 'app-ai-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-panel.component.html',
  styleUrl: './ai-panel.component.scss',
})
export class AiPanelComponent implements OnChanges, OnDestroy {
  @Input() sourceImageDataUrl: string | null = null;
  @Output() importImage = new EventEmitter<AiGeneratedImage>();

  readonly ai = inject(AiImageStateService);
  readonly state$ = this.ai.state$;
  mobileCollapsed = true;
  autocompleteOpen = false;
  highlightedCompletionIndex = 0;
  private generation?: Subscription;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['sourceImageDataUrl']) this.ai.setSourceImage(this.sourceImageDataUrl);
  }

  ngOnDestroy(): void {
    this.generation?.unsubscribe();
  }

  modelModes(state: AiImageState): AiGenerationMode[] {
    return state.models.find((model) => model.id === state.preferences.activeModelId)?.modes ?? [];
  }

  parameters(state: AiImageState): AiModelParameters {
    return state.preferences.parametersByModel[state.preferences.activeModelId];
  }

  useSuggestion(state: AiImageState, suggestion: string): void {
    this.applyPromptText(state, suggestion);
  }

  updatePrompt(prompt: string): void {
    this.autocompleteOpen = true;
    this.highlightedCompletionIndex = 0;
    this.ai.updatePrompt(prompt);
  }

  promptAutocomplete(state: AiImageState): PromptCompletion[] {
    const mode = state.preferences.mode;
    const query = this.normalizeSearchText(this.currentPromptFragment(state.prompt));
    const prompt = this.normalizeSearchText(state.prompt);
    return promptCompletions
      .filter((item) => item.modes.includes(mode))
      .filter((item) => !prompt.includes(this.normalizeSearchText(item.value)))
      .filter((item) => !query || this.completionMatches(item, query))
      .slice(0, 5);
  }

  showAutocomplete(state: AiImageState): boolean {
    return this.autocompleteOpen && this.promptAutocomplete(state).length > 0;
  }

  selectAutocomplete(state: AiImageState, completion: PromptCompletion): void {
    this.applyPromptText(state, completion.value, true);
  }

  onPromptKeydown(event: KeyboardEvent, state: AiImageState): void {
    const completions = this.promptAutocomplete(state);
    if (!this.autocompleteOpen || completions.length === 0) {
      if (event.key === 'ArrowDown') this.autocompleteOpen = true;
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.highlightedCompletionIndex = (this.highlightedCompletionIndex + 1) % completions.length;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.highlightedCompletionIndex = (this.highlightedCompletionIndex - 1 + completions.length) % completions.length;
    }

    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      this.selectAutocomplete(state, completions[this.highlightedCompletionIndex] ?? completions[0]);
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.autocompleteOpen = false;
    }
  }

  onModelChange(modelId: string): void {
    this.ai.selectModel(modelId as AiModelId);
  }

  onModeChange(mode: string): void {
    this.highlightedCompletionIndex = 0;
    this.autocompleteOpen = false;
    this.ai.selectMode(mode as AiGenerationMode);
  }

  modeLabel(mode: AiGenerationMode): string {
    const labels: Record<AiGenerationMode, string> = {
      'text-to-image': 'Text to image',
      'image-to-image': 'Image edit',
      inpaint: 'Local repair',
      'style-transfer': 'Style transfer',
      upscale: 'Enhance',
    };
    return labels[mode];
  }

  generate(): void {
    this.autocompleteOpen = false;
    this.generation?.unsubscribe();
    this.generation = this.ai.generate().subscribe((images) => {
      images.forEach((image) => this.importImage.emit(image));
    });
  }

  private applyPromptText(state: AiImageState, text: string, replaceFragment = false): void {
    const prompt = replaceFragment ? this.replacePromptFragment(state.prompt, text) : this.appendPromptText(state.prompt, text);
    this.ai.updatePrompt(prompt);
    this.autocompleteOpen = false;
  }

  private appendPromptText(prompt: string, text: string): string {
    return prompt.trim() ? `${prompt.trim()}, ${text}` : text;
  }

  private replacePromptFragment(prompt: string, text: string): string {
    const parts = prompt.split(',');
    parts[parts.length - 1] = ` ${text}`;
    return parts.join(',').trim().replace(/^,\s*/, '');
  }

  private currentPromptFragment(prompt: string): string {
    return prompt.split(',').pop()?.trim() ?? '';
  }

  private completionMatches(completion: PromptCompletion, query: string): boolean {
    const searchable = [
      completion.label,
      completion.description,
      completion.value,
      ...completion.keywords,
    ].map((value) => this.normalizeSearchText(value));
    return searchable.some((value) => value.includes(query));
  }

  private normalizeSearchText(value: string): string {
    return value.toLowerCase().replace(/\s+/g, '');
  }
}
