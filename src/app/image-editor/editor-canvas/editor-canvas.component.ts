import {
  AfterViewInit, Component, ElementRef, EventEmitter, Input, NgZone,
  OnChanges, OnDestroy, Output, SimpleChanges, ViewChild,
} from '@angular/core';
import type ImageEditorType from 'tui-image-editor';
import { EditorCommand, EditorSettings, EditorTool } from '../core/editor.types';
import { creaitionTokens } from '../core/creaition.theme';

@Component({
  selector: 'app-editor-canvas',
  standalone: true,
  template: '<div #editorHost class="editor-host" aria-label="Image editing canvas"></div>',
  styleUrl: './editor-canvas.component.scss',
})
export class EditorCanvasComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('editorHost', { static: true }) editorHost!: ElementRef<HTMLDivElement>;
  @Input({ required: true }) activeTool!: EditorTool;
  @Input({ required: true }) settings!: EditorSettings;
  @Output() busyChange = new EventEmitter<boolean>();
  @Output() errorMessage = new EventEmitter<string>();

  private editor?: ImageEditorType;
  private resizeObserver?: ResizeObserver;
  private readonly brandFont = creaitionTokens.fontFamily;

  constructor(private readonly zone: NgZone) {}

  ngAfterViewInit(): void {
    const ImageEditor = window.tui.ImageEditor;
    this.editor = new ImageEditor(this.editorHost.nativeElement, {
      cssMaxWidth: 1100,
      cssMaxHeight: 760,
      usageStatistics: false,
      selectionStyle: {
        cornerStyle: 'circle',
        cornerSize: 14,
        cornerColor: creaitionTokens.black,
        cornerStrokeColor: creaitionTokens.white,
        borderColor: creaitionTokens.black,
        transparentCorners: false,
        rotatingPointOffset: 24,
      },
    });

    this.loadStarterArtwork();
    this.configureTool();
    this.resizeObserver = new ResizeObserver(() => this.fitCanvas());
    this.resizeObserver.observe(this.editorHost.nativeElement);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.editor) return;
    if (changes['activeTool'] || changes['settings']) this.configureTool();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.editor?.destroy();
  }

  async loadFile(file: File): Promise<void> {
    if (!this.editor) return;
    await this.run(async () => {
      await this.editor!.loadImageFromFile(file, file.name);
      this.editor!.clearUndoStack();
      this.fitCanvas();
    }, 'That image could not be opened. Try a PNG or JPG file.');
  }

  async loadDataUrl(dataUrl: string, imageName = 'AI generated image'): Promise<void> {
    if (!this.editor) return;
    await this.run(async () => {
      await this.editor!.loadImageFromURL(dataUrl, imageName);
      this.editor!.clearUndoStack();
      this.fitCanvas();
    }, 'That generated image could not be imported.');
  }

  getDataUrl(): string | null {
    if (!this.editor) return null;
    return this.editor.toDataURL({ format: 'png', quality: 1 });
  }

  exportImage(): void {
    if (!this.editor) return;
    const link = document.createElement('a');
    link.download = `creaition-${Date.now()}.png`;
    link.href = this.editor.toDataURL({ format: 'png', quality: 1 });
    link.click();
  }

  execute(command: EditorCommand): void {
    if (!this.editor) return;
    const actions: Record<EditorCommand['type'], () => void | Promise<unknown>> = {
      undo: () => this.editor!.undo(),
      redo: () => this.editor!.redo(),
      delete: () => this.editor!.removeActiveObject(),
      'rotate-left': () => this.editor!.rotate(-90),
      'rotate-right': () => this.editor!.rotate(90),
      'flip-x': () => this.editor!.flipX(),
      'flip-y': () => this.editor!.flipY(),
      'apply-crop': () => this.applyCrop(),
      'add-shape': () => this.addShape(),
      'add-text': () => this.addText(),
      'apply-filter': () => this.applyFilter(),
      'remove-filter': () => this.removeFilter(),
    };
    this.run(actions[command.type], 'The edit could not be applied.');
  }

  private configureTool(): void {
    if (!this.editor) return;
    this.editor.stopDrawingMode();
    if (this.activeTool === 'crop') {
      this.editor.startDrawingMode('CROPPER');
    } else if (this.activeTool === 'draw') {
      this.editor.startDrawingMode('FREE_DRAWING', {
        width: this.settings.strokeWidth,
        color: this.settings.color,
      });
    }
  }

  private async applyCrop(): Promise<void> {
    const rect = this.editor!.getCropzoneRect();
    if (!rect || rect.width < 2 || rect.height < 2) throw new Error('Select a crop area first.');
    await this.editor!.crop(rect);
    this.editor!.stopDrawingMode();
    this.fitCanvas();
  }

  private addShape(): Promise<unknown> {
    return this.editor!.addShape(this.settings.shape, {
      fill: this.settings.color,
      stroke: this.settings.color === creaitionTokens.black ? creaitionTokens.white : creaitionTokens.black,
      strokeWidth: 1,
      width: 180,
      height: 180,
      left: 260,
      top: 190,
    });
  }

  private addText(): Promise<unknown> {
    return this.editor!.addText(this.settings.text.trim() || 'Type something', {
      position: { x: 220, y: 180 },
      styles: {
        fill: this.settings.color,
        fontFamily: this.brandFont,
        fontSize: this.settings.fontSize,
        fontStyle: 'normal',
        fontWeight: String(creaitionTokens.weightSemibold),
      },
    });
  }

  private async applyFilter(): Promise<void> {
    const filter = this.settings.filter;
    if (this.editor!.hasFilter(filter)) await this.editor!.removeFilter(filter);
    await this.editor!.applyFilter(filter);
  }

  private removeFilter(): Promise<unknown> {
    return this.editor!.removeFilter(this.settings.filter);
  }

  private loadStarterArtwork(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 800;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.fillStyle = creaitionTokens.white;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = creaitionTokens.gray1;
    context.fillRect(0, 0, 470, canvas.height);
    context.fillStyle = creaitionTokens.black;
    context.beginPath();
    context.arc(895, 235, 145, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = creaitionTokens.black;
    context.lineWidth = 3;
    context.strokeRect(620, 480, 380, 180);
    context.fillStyle = creaitionTokens.black;
    context.font = `${creaitionTokens.weightSemibold} 74px ${this.brandFont}`;
    context.fillText('CREATE', 72, 330);
    context.font = `${creaitionTokens.weightRegular} 28px ${this.brandFont}`;
    context.fillText('A space for visual ideas.', 76, 390);
    context.font = `${creaitionTokens.weightMedium} 18px ${this.brandFont}`;
    context.fillText('CREAI TION / 01', 650, 585);

    this.editor!.loadImageFromURL(canvas.toDataURL('image/png'), 'Starter artwork').then(() => {
      this.editor!.clearUndoStack();
      this.fitCanvas();
    });
  }

  private fitCanvas(): void {
    if (!this.editor) return;
    const host = this.editorHost.nativeElement;
    const width = Math.max(280, host.clientWidth - 48);
    const height = Math.max(260, host.clientHeight - 48);
    const canvasSize = this.editor.getCanvasSize();
    if (!canvasSize.width || !canvasSize.height) return;
    const scale = Math.min(width / canvasSize.width, height / canvasSize.height, 1);
    const graphics = host.querySelector('.tui-image-editor-canvas-container') as HTMLElement | null;
    if (graphics) {
      graphics.style.setProperty('width', `${canvasSize.width}px`, 'important');
      graphics.style.setProperty('height', `${canvasSize.height}px`, 'important');
      graphics.style.setProperty('max-width', 'none', 'important');
      graphics.style.setProperty('max-height', 'none', 'important');
      graphics.style.transform = `scale(${scale})`;
      graphics.style.transformOrigin = 'center center';
    }
  }

  private async run(action: () => void | Promise<unknown>, fallback: string): Promise<void> {
    this.busyChange.emit(true);
    try {
      await action();
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : fallback;
      this.zone.run(() => this.errorMessage.emit(message));
    } finally {
      this.busyChange.emit(false);
    }
  }
}
