import { Component, ViewChild } from '@angular/core';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { EditorCanvasComponent } from './editor-canvas/editor-canvas.component';
import { EditorCommand, EditorSettings, EditorTool } from './core/editor.types';
import { PropertiesPanelComponent } from './properties-panel/properties-panel.component';
import { ToolbarComponent } from './toolbar/toolbar.component';
import { creaitionTokens } from './core/creaition.theme';
import { AiPanelComponent } from './ai/ai-panel/ai-panel.component';
import { AiGeneratedImage } from './ai/core/ai-image.types';

@Component({
  selector: 'app-image-editor',
  standalone: true,
  imports: [AiPanelComponent, EditorCanvasComponent, MatSnackBarModule, PropertiesPanelComponent, ToolbarComponent],
  templateUrl: './image-editor.component.html',
  styleUrl: './image-editor.component.scss',
})
export class ImageEditorComponent {
  @ViewChild(EditorCanvasComponent) editor!: EditorCanvasComponent;

  activeTool: EditorTool = 'select';
  settings: EditorSettings = {
    color: creaitionTokens.black,
    strokeWidth: 8,
    shape: 'rect',
    fontSize: 48,
    text: 'New idea',
    filter: 'Grayscale',
  };
  panelOpen = window.innerWidth >= 1280;
  mobileToolbarOpen = false;
  busy = false;
  aiSourceImageDataUrl: string | null = null;

  constructor(private readonly snackBar: MatSnackBar) {}

  selectTool(tool: EditorTool): void {
    this.activeTool = tool;
    this.panelOpen = true;
    this.mobileToolbarOpen = false;
    this.editor?.refreshViewport();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.editor.loadFile(file);
    input.value = '';
  }

  run(command: EditorCommand['type']): void {
    this.editor.execute({ type: command });
  }

  async importAiImage(image: AiGeneratedImage): Promise<void> {
    const added = await this.editor.loadDataUrl(image.dataUrl, `AI / ${image.prompt}`);
    if (added) this.snackBar.open('AI image added next to the selected card.', 'Close', { duration: 2600 });
  }

  selectAiSource(dataUrl: string): void {
    this.aiSourceImageDataUrl = dataUrl;
  }

  toggleProperties(): void {
    this.panelOpen = !this.panelOpen;
    this.editor?.refreshViewport();
  }

  openProperties(): void {
    this.panelOpen = true;
    this.editor?.refreshViewport();
  }

  closeProperties(): void {
    this.panelOpen = false;
    this.editor?.refreshViewport();
  }

  showError(message: string): void {
    this.snackBar.open(message, 'Close', { duration: 4200 });
  }
}
