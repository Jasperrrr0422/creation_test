import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AiGeneratedImage, AiGenerationMode, AiImageState, AiModelId, AiModelParameters } from '../core/ai-image.types';
import { AiImageStateService } from '../core/ai-image-state.service';

interface PromptCompletion {
  label: string;
  value: string;
  modes: AiGenerationMode[];
  keywords: string[];
}

const promptCompletions: PromptCompletion[] = [
  {
    label: 'Preserve subject',
    value: 'keep the subject identity, layout, and composition unchanged',
    modes: ['image-to-image', 'style-transfer', 'upscale'],
    keywords: ['keep', 'preserve', 'subject', 'composition', 'layout'],
  },
  {
    label: 'White studio background',
    value: 'replace the background with a clean pure white studio background',
    modes: ['image-to-image', 'inpaint'],
    keywords: ['background', 'white', 'studio', 'clean'],
  },
  {
    label: 'Monochrome editorial style',
    value: 'apply a black and white minimal editorial poster style',
    modes: ['image-to-image', 'style-transfer'],
    keywords: ['black', 'white', 'mono', 'editorial', 'poster', 'style'],
  },
  {
    label: 'Product detail enhancement',
    value: 'enhance product details, edges, and natural shadows without changing the design',
    modes: ['image-to-image', 'upscale'],
    keywords: ['enhance', 'detail', 'sharp', 'shadow', 'product'],
  },
  {
    label: 'Local repair only',
    value: 'only edit the described area and keep every other area unchanged',
    modes: ['inpaint'],
    keywords: ['only', 'area', 'repair', 'local', 'unchanged'],
  },
  {
    label: 'Remove distractions',
    value: 'remove distracting background objects and naturally reconstruct the missing area',
    modes: ['inpaint', 'image-to-image'],
    keywords: ['remove', 'object', 'background', 'clean'],
  },
  {
    label: 'Typography lock',
    value: 'preserve all typography, text placement, and letter shapes',
    modes: ['image-to-image', 'inpaint', 'style-transfer', 'upscale'],
    keywords: ['text', 'type', 'typography', 'letter', 'logo'],
  },
  {
    label: 'High quality restoration',
    value: 'increase clarity, reduce compression noise, and keep the original content unchanged',
    modes: ['upscale', 'image-to-image'],
    keywords: ['quality', 'noise', 'clarity', 'restore', 'upscale'],
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
    const query = this.currentPromptFragment(state.prompt).toLowerCase();
    return promptCompletions
      .filter((item) => item.modes.includes(mode))
      .filter((item) => !state.prompt.toLowerCase().includes(item.value.toLowerCase()))
      .filter((item) => !query || item.label.toLowerCase().includes(query) || item.value.toLowerCase().includes(query) || item.keywords.some((keyword) => keyword.includes(query)))
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
}
