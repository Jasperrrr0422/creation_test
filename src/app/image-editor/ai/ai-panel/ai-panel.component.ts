import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AiGeneratedImage, AiGenerationMode, AiImageState, AiModelId, AiModelParameters } from '../core/ai-image.types';
import { AiImageStateService } from '../core/ai-image-state.service';

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
    const prompt = state.prompt.trim() ? `${state.prompt}, ${suggestion}` : suggestion;
    this.ai.updatePrompt(prompt);
  }

  onModelChange(modelId: string): void {
    this.ai.selectModel(modelId as AiModelId);
  }

  onModeChange(mode: string): void {
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
    this.generation?.unsubscribe();
    this.generation = this.ai.generate().subscribe((images) => {
      images.forEach((image) => this.importImage.emit(image));
    });
  }
}
