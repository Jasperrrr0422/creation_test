import {
  AfterViewInit, Component, ElementRef, EventEmitter, Input, NgZone,
  HostListener, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild,
} from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import type ImageEditorType from 'tui-image-editor';
import { ArtworkStorageService, StoredCanvasCard } from '../core/artwork-storage.service';
import { EditorCommand, EditorSettings, EditorTool } from '../core/editor.types';
import { applyCreaitionEditorTheme, creaitionTokens, creaitionEditorTheme } from '../core/creaition.theme';

@Component({
  selector: 'app-editor-canvas',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div
      #viewport
      class="editor-viewport"
      [class.pan-ready]="spacePressed"
      [class.panning]="panning"
      tabindex="0"
      aria-label="Image editing canvas"
      (pointerdown)="startPan($event)"
      (pointermove)="movePan($event)"
      (pointerup)="endPan($event)"
      (pointercancel)="endPan($event)"
      (wheel)="handleWheel($event)"
    >
      <div #editorHost class="editor-host"></div>
      <div class="zoom-controls" aria-label="Canvas zoom controls">
        <button type="button" aria-label="Zoom out" title="Zoom out" (click)="zoomOut()">
          <lucide-icon name="zoom-out" [size]="17" />
        </button>
        <button class="zoom-value" type="button" aria-label="Fit canvas" title="Fit canvas" (click)="fitView()">
          {{ zoomPercent }}%
        </button>
        <button type="button" aria-label="Zoom in" title="Zoom in" (click)="zoomIn()">
          <lucide-icon name="zoom-in" [size]="17" />
        </button>
        <button type="button" aria-label="Fit canvas" title="Fit canvas" (click)="fitView()">
          <lucide-icon name="maximize-2" [size]="17" />
        </button>
      </div>
    </div>
  `,
  styleUrl: './editor-canvas.component.scss',
})
export class EditorCanvasComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('viewport', { static: true }) viewport!: ElementRef<HTMLDivElement>;
  @ViewChild('editorHost', { static: true }) editorHost!: ElementRef<HTMLDivElement>;
  @Input({ required: true }) activeTool!: EditorTool;
  @Input({ required: true }) settings!: EditorSettings;
  @Output() busyChange = new EventEmitter<boolean>();
  @Output() errorMessage = new EventEmitter<string>();
  @Output() sourceImageChange = new EventEmitter<string | null>();

  private editor?: ImageEditorType;
  private resizeObserver?: ResizeObserver;
  private readonly brandFont = creaitionTokens.fontFamily;
  private readonly imageSources = new Map<number, string>();
  private readonly storedCards = new Map<number, Pick<StoredCanvasCard, 'key' | 'dataUrl' | 'label' | 'createdAt'>>();
  private readonly persistenceTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private storageErrorShown = false;
  private activeSourceImageDataUrl: string | null = null;
  private activeSourceObjectId: number | null = null;
  private activeObjectId: number | null = null;
  private cardImportQueue: Promise<void> = Promise.resolve();
  private cardCount = 0;
  private viewZoom = 1;
  private panX = 0;
  private panY = 0;
  private autoFit = true;
  private panPointerId: number | null = null;
  private panStartX = 0;
  private panStartY = 0;
  private panOriginX = 0;
  private panOriginY = 0;
  private readonly touchPoints = new Map<number, { x: number; y: number }>();
  private pinchStartDistance = 0;
  private pinchStartZoom = 1;
  private pinchWorldX = 0;
  private pinchWorldY = 0;
  private workspaceWidth = 0;
  private workspaceHeight = 0;
  private readonly workspaceDensity = 2.4;
  spacePressed = false;
  panning = false;

  get zoomPercent(): number {
    return Math.round(this.viewZoom * 100);
  }

  constructor(
    private readonly zone: NgZone,
    private readonly artworkStorage: ArtworkStorageService,
  ) {}

  ngAfterViewInit(): void {
    const ImageEditor = window.tui.ImageEditor;
    const host = this.editorHost.nativeElement;
    applyCreaitionEditorTheme(host);
    this.editor = new ImageEditor(this.editorHost.nativeElement, {
      cssMaxWidth: Math.max(280, host.clientWidth),
      cssMaxHeight: Math.max(260, host.clientHeight),
      usageStatistics: false,
      selectionStyle: {
        cornerStyle: 'circle',
        cornerSize: 14,
        cornerColor: String(creaitionEditorTheme['range.pointer.color']),
        cornerStrokeColor: creaitionTokens.white,
        borderColor: String(creaitionEditorTheme['submenu.activeLabel.color']),
        transparentCorners: false,
        rotatingPointOffset: 24,
      },
    });
    this.editor.on('objectActivated', (object: { id?: number }) => {
      const id = Number(object.id);
      this.activeObjectId = Number.isFinite(id) ? id : null;
      const source = this.imageSources.get(id);
      if (source) this.selectSourceImage(source, id);
    });
    ['objectMoved', 'objectScaled', 'objectRotated'].forEach((eventName) => {
      this.editor?.on(eventName, (object: { id?: number }) => this.scheduleCardPersistence(Number(object.id)));
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
    this.persistenceTimers.forEach((timer) => clearTimeout(timer));
    this.editor?.destroy();
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (event.code !== 'Space' || this.isFormField(event.target)) return;
    event.preventDefault();
    this.spacePressed = true;
  }

  @HostListener('window:keyup', ['$event'])
  onKeyUp(event: KeyboardEvent): void {
    if (event.code !== 'Space') return;
    this.spacePressed = false;
    if (this.panning && this.panPointerId !== null) this.finishPanning();
  }

  zoomIn(): void {
    this.setViewZoom(this.viewZoom + 0.1);
  }

  zoomOut(): void {
    this.setViewZoom(this.viewZoom - 0.1);
  }

  refreshViewport(): void {
    requestAnimationFrame(() => this.fitCanvas());
  }

  fitView(): void {
    this.viewZoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.autoFit = true;
    this.applyViewTransform();
  }

  startPan(event: PointerEvent): void {
    if (event.pointerType === 'touch') {
      this.startTouchGesture(event);
      return;
    }
    if (!(this.spacePressed || event.button === 1)) return;
    event.preventDefault();
    this.panPointerId = event.pointerId;
    this.panStartX = event.clientX;
    this.panStartY = event.clientY;
    this.panOriginX = this.panX;
    this.panOriginY = this.panY;
    this.panning = true;
    this.autoFit = false;
    this.viewport.nativeElement.setPointerCapture(event.pointerId);
  }

  movePan(event: PointerEvent): void {
    if (event.pointerType === 'touch') {
      this.moveTouchGesture(event);
      return;
    }
    if (!this.panning || event.pointerId !== this.panPointerId) return;
    const displayScale = this.logicalPixelsPerScreenPixel();
    this.panX = this.panOriginX + (event.clientX - this.panStartX) * displayScale;
    this.panY = this.panOriginY + (event.clientY - this.panStartY) * displayScale;
    this.applyViewTransform();
  }

  endPan(event: PointerEvent): void {
    if (event.pointerType === 'touch') {
      this.endTouchGesture(event);
      return;
    }
    if (event.pointerId !== this.panPointerId) return;
    this.finishPanning();
  }

  handleWheel(event: WheelEvent): void {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      this.setViewZoom(this.viewZoom + (event.deltaY < 0 ? 0.1 : -0.1), event.clientX, event.clientY);
      return;
    }
    this.autoFit = false;
    const displayScale = this.logicalPixelsPerScreenPixel();
    this.panX -= event.deltaX * displayScale;
    this.panY -= event.deltaY * displayScale;
    this.applyViewTransform();
  }

  async loadFile(file: File): Promise<void> {
    if (!this.editor) return;
    await this.enqueueCardImport(async () => {
      const dataUrl = await this.readFile(file);
      await this.addImageCard(dataUrl, `ORIGINAL / ${file.name}`);
    }, 'That image could not be opened. Try a PNG or JPG file.');
  }

  async loadDataUrl(dataUrl: string, imageName = 'AI generated image'): Promise<boolean> {
    if (!this.editor) return false;
    return this.enqueueCardImport(async () => {
      await this.addImageCard(dataUrl, imageName, true);
    }, 'That generated image could not be imported.');
  }

  getAiSourceDataUrl(): string | null {
    return this.activeSourceImageDataUrl;
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
      delete: () => this.deleteActiveObject(),
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

  private async loadStarterArtwork(): Promise<void> {
    if (!this.editor) return;
    const host = this.editorHost.nativeElement;
    const hostRatio = host.clientWidth > 0 && host.clientHeight > 0
      ? host.clientWidth / host.clientHeight
      : 1.5;
    const minimumWidth = 1800;
    const minimumHeight = 1200;
    const workspace = document.createElement('canvas');
    if (hostRatio >= minimumWidth / minimumHeight) {
      workspace.height = minimumHeight;
      workspace.width = Math.round(minimumHeight * hostRatio);
    } else {
      workspace.width = minimumWidth;
      workspace.height = Math.round(minimumWidth / hostRatio);
    }
    const workspaceContext = workspace.getContext('2d');
    if (!workspaceContext) return;
    workspaceContext.fillStyle = creaitionTokens.gray1;
    workspaceContext.fillRect(0, 0, workspace.width, workspace.height);

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

    try {
      await this.editor.loadImageFromURL(workspace.toDataURL('image/png'), 'Creaition workspace');
      this.fitCanvas();
      await this.addImageCard(canvas.toDataURL('image/png'), 'ORIGINAL / STARTER', false, false);
      let storedCards: StoredCanvasCard[] = [];
      try {
        storedCards = await this.artworkStorage.loadCards();
      } catch {
        this.storageErrorShown = true;
        this.zone.run(() => this.errorMessage.emit('Saved artwork could not be restored in this browser.'));
      }
      for (const card of storedCards) {
        await this.addImageCard(card.dataUrl, card.label, false, false, card);
      }
      this.editor.clearUndoStack();
      this.fitView();
    } catch {
      this.zone.run(() => this.errorMessage.emit('The starter workspace could not be created.'));
    }
  }

  private async addImageCard(
    dataUrl: string,
    label: string,
    placeNearSelection = false,
    persist = true,
    restoredCard?: StoredCanvasCard,
  ): Promise<void> {
    if (!this.editor) return;
    const cardDataUrl = await this.createCardDataUrl(dataUrl, label);
    const object = await this.editor.addImageObject(cardDataUrl) as unknown as {
      id: number;
      width?: number;
      height?: number;
    };
    const id = Number(object.id);
    if (!Number.isFinite(id)) throw new Error('The image card was created without a valid canvas object.');
    if (restoredCard) {
      await this.editor.setObjectProperties(id, {
        left: restoredCard.xRatio * this.workspaceWidth,
        top: restoredCard.yRatio * this.workspaceHeight,
        scaleX: restoredCard.scaleX,
        scaleY: restoredCard.scaleY,
        angle: restoredCard.angle,
      });
    } else {
      const position = this.nextCardPosition(object, placeNearSelection);
      await this.editor.setObjectPosition(id, {
        x: position.x,
        y: position.y,
        originX: 'left',
        originY: 'top',
      });
    }
    this.imageSources.set(id, dataUrl);
    if (persist || restoredCard) {
      this.storedCards.set(id, {
        key: restoredCard?.key ?? crypto.randomUUID(),
        dataUrl,
        label,
        createdAt: restoredCard?.createdAt ?? new Date().toISOString(),
      });
    }
    this.selectSourceImage(dataUrl, id);
    this.cardCount += 1;
    const graphics = this.getGraphics();
    const fabricObject = graphics?.getObject(id);
    if (fabricObject) graphics?._canvas.setActiveObject(fabricObject);
    graphics?._canvas.requestRenderAll();
    if (persist) await this.persistCard(id);
  }

  private selectSourceImage(dataUrl: string, objectId: number): void {
    this.activeSourceImageDataUrl = dataUrl;
    this.activeSourceObjectId = objectId;
    this.zone.run(() => this.sourceImageChange.emit(dataUrl));
  }

  private scheduleCardPersistence(objectId: number): void {
    if (!Number.isFinite(objectId) || !this.storedCards.has(objectId)) return;
    const existingTimer = this.persistenceTimers.get(objectId);
    if (existingTimer) clearTimeout(existingTimer);
    this.persistenceTimers.set(objectId, setTimeout(() => {
      this.persistenceTimers.delete(objectId);
      void this.persistCard(objectId);
    }, 250));
  }

  private async persistCard(objectId: number): Promise<void> {
    const metadata = this.storedCards.get(objectId);
    const object = this.getGraphics()?.getObject(objectId);
    if (!metadata || !object || !this.workspaceWidth || !this.workspaceHeight) return;
    try {
      await this.artworkStorage.saveCard({
        ...metadata,
        xRatio: Number(object.left || 0) / this.workspaceWidth,
        yRatio: Number(object.top || 0) / this.workspaceHeight,
        scaleX: Number(object.scaleX || 1),
        scaleY: Number(object.scaleY || 1),
        angle: Number(object.angle || 0),
      });
    } catch {
      if (this.storageErrorShown) return;
      this.storageErrorShown = true;
      this.zone.run(() => this.errorMessage.emit('This browser could not save the artwork locally.'));
    }
  }

  private async deleteActiveObject(): Promise<void> {
    if (!this.editor) return;
    const objectId = this.activeObjectId;
    const storedCard = objectId === null ? undefined : this.storedCards.get(objectId);
    this.editor.removeActiveObject();
    if (objectId === null) return;
    this.imageSources.delete(objectId);
    this.storedCards.delete(objectId);
    const timer = this.persistenceTimers.get(objectId);
    if (timer) clearTimeout(timer);
    this.persistenceTimers.delete(objectId);
    this.activeObjectId = null;
    if (this.activeSourceObjectId === objectId) {
      this.activeSourceObjectId = null;
      this.activeSourceImageDataUrl = null;
      this.zone.run(() => this.sourceImageChange.emit(null));
    }
    if (storedCard) await this.artworkStorage.deleteCard(storedCard.key);
  }

  private nextCardPosition(
    card: { width?: number; height?: number },
    placeNearSelection: boolean,
  ): { x: number; y: number } {
    const margin = 70;
    const gap = 48;
    const cardWidth = Number(card.width || 560);
    const cardHeight = Number(card.height || 520);
    const graphics = this.getGraphics();
    const source = placeNearSelection && this.activeSourceObjectId !== null
      ? graphics?.getObject(this.activeSourceObjectId)
      : null;

    if (this.cardCount === 0) {
      return {
        x: Math.max(margin, (this.workspaceWidth - cardWidth) / 2),
        y: Math.max(margin, (this.workspaceHeight - cardHeight) / 2),
      };
    }

    if (source) {
      const rightTop = source.getPointByOrigin('right', 'top');
      const leftBottom = source.getPointByOrigin('left', 'bottom');
      const leftTop = source.getPointByOrigin('left', 'top');
      if (rightTop.x + gap + cardWidth <= this.workspaceWidth - margin) {
        return { x: rightTop.x + gap, y: Math.max(margin, rightTop.y) };
      }
      if (leftBottom.y + gap + cardHeight <= this.workspaceHeight - margin) {
        return { x: Math.max(margin, leftTop.x), y: leftBottom.y + gap };
      }
    }

    const columns = Math.max(1, Math.floor((this.workspaceWidth - margin * 2 + gap) / (575 + gap)));
    const column = this.cardCount % columns;
    const row = Math.floor(this.cardCount / columns);
    return { x: margin + column * (575 + gap), y: margin + row * (550 + gap) };
  }

  private async createCardDataUrl(dataUrl: string, label: string): Promise<string> {
    const image = await this.loadImage(dataUrl);
    const outerMargin = 16;
    const padding = 24;
    const labelHeight = 48;
    const maxImageWidth = 480;
    const maxImageHeight = 400;
    const scale = Math.min(maxImageWidth / image.naturalWidth, maxImageHeight / image.naturalHeight, 1);
    const imageWidth = Math.max(1, Math.round(image.naturalWidth * scale));
    const imageHeight = Math.max(1, Math.round(image.naturalHeight * scale));
    const cardWidth = imageWidth + padding * 2;
    const cardHeight = imageHeight + padding * 2 + labelHeight;
    const card = document.createElement('canvas');
    card.width = cardWidth + outerMargin * 2;
    card.height = cardHeight + outerMargin * 2;
    const context = card.getContext('2d');
    if (!context) throw new Error('The image card could not be created.');

    context.save();
    context.shadowColor = 'rgba(0, 0, 0, 0.16)';
    context.shadowBlur = 20;
    context.shadowOffsetY = 8;
    this.roundedRect(context, outerMargin, outerMargin, cardWidth, cardHeight, 16);
    context.fillStyle = creaitionTokens.white;
    context.fill();
    context.restore();

    context.drawImage(image, outerMargin + padding, outerMargin + padding, imageWidth, imageHeight);
    context.fillStyle = creaitionTokens.black;
    context.font = `${creaitionTokens.weightMedium} 14px ${this.brandFont}`;
    context.textBaseline = 'middle';
    context.fillText(this.truncateLabel(label), outerMargin + padding, outerMargin + padding + imageHeight + labelHeight / 2);
    return card.toDataURL('image/png');
  }

  private roundedRect(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ): void {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.lineTo(x + width - radius, y);
    context.quadraticCurveTo(x + width, y, x + width, y + radius);
    context.lineTo(x + width, y + height - radius);
    context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    context.lineTo(x + radius, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - radius);
    context.lineTo(x, y + radius);
    context.quadraticCurveTo(x, y, x + radius, y);
    context.closePath();
  }

  private truncateLabel(label: string): string {
    const normalized = label.trim().toUpperCase();
    return normalized.length > 46 ? `${normalized.slice(0, 43)}...` : normalized;
  }

  private loadImage(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('The image could not be decoded.'));
      image.src = dataUrl;
    });
  }

  private readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('The file could not be read.'));
      reader.readAsDataURL(file);
    });
  }

  private fitCanvas(): void {
    if (!this.editor) return;
    const canvasSize = this.editor.getCanvasSize();
    if (!canvasSize.width || !canvasSize.height) return;
    const host = this.editorHost.nativeElement;
    const width = Math.max(280, host.clientWidth);
    const height = Math.max(260, host.clientHeight);
    const graphics = this.getGraphics();
    const fabricCanvas = graphics?._canvas;
    const canvasImage = graphics?.canvasImage;
    if (!graphics || !fabricCanvas || !canvasImage) return;

    const nextWidth = Math.round(width * this.workspaceDensity);
    const nextHeight = Math.round(height * this.workspaceDensity);
    const currentWidth = this.workspaceWidth || canvasSize.width;
    const currentHeight = this.workspaceHeight || canvasSize.height;
    const deltaX = nextWidth - currentWidth;
    const deltaY = nextHeight - currentHeight;

    if (this.workspaceWidth > 0 && this.workspaceHeight > 0 && (deltaX || deltaY)) {
      fabricCanvas.getObjects().forEach((object) => {
        if (object === canvasImage) return;
        object.set({ left: Number(object.left || 0) + deltaX / 2, top: Number(object.top || 0) + deltaY / 2 });
        object.setCoords();
      });
    }

    canvasImage.set({
      left: nextWidth / 2,
      top: nextHeight / 2,
      scaleX: nextWidth / Number(canvasImage.width || nextWidth),
      scaleY: nextHeight / Number(canvasImage.height || nextHeight),
      selectable: false,
      evented: false,
    });
    canvasImage.setCoords();
    graphics.setCanvasBackstoreDimension({ width: nextWidth, height: nextHeight });
    graphics.setCanvasCssDimension({ width: `${width}px`, height: `${height}px` });
    fabricCanvas.backgroundColor = creaitionTokens.gray1;
    this.workspaceWidth = nextWidth;
    this.workspaceHeight = nextHeight;

    const container = this.getCanvasContainer();
    if (container) {
      container.style.width = `${width}px`;
      container.style.height = `${height}px`;
      container.style.transform = 'none';
    }
    requestAnimationFrame(() => this.applyViewTransform());
  }

  private setViewZoom(nextZoom: number, clientX?: number, clientY?: number): void {
    const clampedZoom = Math.min(3, Math.max(0.1, Math.round(nextZoom * 10) / 10));
    if (clampedZoom === this.viewZoom) return;
    const viewportRect = this.viewport.nativeElement.getBoundingClientRect();
    const displayScale = this.logicalPixelsPerScreenPixel();
    const focusX = ((clientX ?? viewportRect.left + viewportRect.width / 2) - viewportRect.left) * displayScale;
    const focusY = ((clientY ?? viewportRect.top + viewportRect.height / 2) - viewportRect.top) * displayScale;
    const ratio = clampedZoom / this.viewZoom;
    this.panX = focusX - (focusX - this.panX) * ratio;
    this.panY = focusY - (focusY - this.panY) * ratio;
    this.viewZoom = clampedZoom;
    this.autoFit = false;
    this.applyViewTransform();
  }

  private applyViewTransform(): void {
    const fabricCanvas = this.getGraphics()?._canvas;
    if (!fabricCanvas) return;
    fabricCanvas.setViewportTransform([this.viewZoom, 0, 0, this.viewZoom, this.panX, this.panY]);
    fabricCanvas.requestRenderAll();
  }

  private getCanvasContainer(): HTMLElement | null {
    return this.editorHost.nativeElement.querySelector('.tui-image-editor-canvas-container');
  }

  private getGraphics(): {
    _canvas: {
      backgroundColor: string;
      discardActiveObject(): void;
      getObjects(): Array<{ left?: number; top?: number; set(values: Record<string, unknown>): void; setCoords(): void }>;
      requestRenderAll(): void;
      setActiveObject(object: unknown): void;
      setViewportTransform(transform: number[]): void;
    };
    canvasImage: {
      width?: number;
      height?: number;
      set(values: Record<string, unknown>): void;
      setCoords(): void;
    };
    setCanvasBackstoreDimension(dimension: { width: number; height: number }): void;
    setCanvasCssDimension(dimension: { width: string; height: string }): void;
    getObject(id: number): {
      angle?: number;
      left?: number;
      scaleX?: number;
      scaleY?: number;
      top?: number;
      getPointByOrigin(originX: string, originY: string): { x: number; y: number };
    } | null;
  } | null {
    return (this.editor as unknown as { _graphics?: ReturnType<EditorCanvasComponent['getGraphics']> })?._graphics ?? null;
  }

  private logicalPixelsPerScreenPixel(): number {
    const width = this.viewport.nativeElement.clientWidth;
    return width > 0 && this.workspaceWidth > 0 ? this.workspaceWidth / width : this.workspaceDensity;
  }

  private startTouchGesture(event: PointerEvent): void {
    this.touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.touchPoints.size !== 2) return;

    event.preventDefault();
    const [first, second] = [...this.touchPoints.values()];
    const midpoint = this.touchMidpoint(first, second);
    const viewportRect = this.viewport.nativeElement.getBoundingClientRect();
    const displayScale = this.logicalPixelsPerScreenPixel();
    const logicalX = (midpoint.x - viewportRect.left) * displayScale;
    const logicalY = (midpoint.y - viewportRect.top) * displayScale;
    this.pinchStartDistance = Math.max(1, this.touchDistance(first, second));
    this.pinchStartZoom = this.viewZoom;
    this.pinchWorldX = (logicalX - this.panX) / this.viewZoom;
    this.pinchWorldY = (logicalY - this.panY) / this.viewZoom;
    this.autoFit = false;
    this.panning = true;
    this.getGraphics()?._canvas.discardActiveObject();
  }

  private moveTouchGesture(event: PointerEvent): void {
    if (!this.touchPoints.has(event.pointerId)) return;
    this.touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.touchPoints.size !== 2 || !this.pinchStartDistance) return;

    event.preventDefault();
    const [first, second] = [...this.touchPoints.values()];
    const midpoint = this.touchMidpoint(first, second);
    const viewportRect = this.viewport.nativeElement.getBoundingClientRect();
    const displayScale = this.logicalPixelsPerScreenPixel();
    const logicalX = (midpoint.x - viewportRect.left) * displayScale;
    const logicalY = (midpoint.y - viewportRect.top) * displayScale;
    const ratio = this.touchDistance(first, second) / this.pinchStartDistance;
    this.viewZoom = Math.min(3, Math.max(0.1, this.pinchStartZoom * ratio));
    this.panX = logicalX - this.pinchWorldX * this.viewZoom;
    this.panY = logicalY - this.pinchWorldY * this.viewZoom;
    this.applyViewTransform();
  }

  private endTouchGesture(event: PointerEvent): void {
    this.touchPoints.delete(event.pointerId);
    if (this.touchPoints.size >= 2) return;
    this.pinchStartDistance = 0;
    this.panning = false;
  }

  private touchDistance(first: { x: number; y: number }, second: { x: number; y: number }): number {
    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  private touchMidpoint(
    first: { x: number; y: number },
    second: { x: number; y: number },
  ): { x: number; y: number } {
    return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
  }

  private finishPanning(): void {
    if (this.panPointerId !== null && this.viewport.nativeElement.hasPointerCapture(this.panPointerId)) {
      this.viewport.nativeElement.releasePointerCapture(this.panPointerId);
    }
    this.panPointerId = null;
    this.panning = false;
  }

  private isFormField(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    return !!element?.closest('input, textarea, select, [contenteditable="true"]');
  }

  private enqueueCardImport(action: () => void | Promise<unknown>, fallback: string): Promise<boolean> {
    const result = this.cardImportQueue.then(() => this.run(action, fallback));
    this.cardImportQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async run(action: () => void | Promise<unknown>, fallback: string): Promise<boolean> {
    this.busyChange.emit(true);
    try {
      await action();
      return true;
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : fallback;
      this.zone.run(() => this.errorMessage.emit(message));
      return false;
    } finally {
      this.busyChange.emit(false);
    }
  }
}
