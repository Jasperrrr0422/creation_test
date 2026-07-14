import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LucideAngularModule } from 'lucide-angular';
import { EditorTool } from '../core/editor.types';

interface ToolItem {
  id: EditorTool;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-toolbar',
  standalone: true,
  imports: [MatTooltipModule, LucideAngularModule],
  templateUrl: './toolbar.component.html',
  styleUrl: './toolbar.component.scss',
})
export class ToolbarComponent {
  @Input({ required: true }) activeTool!: EditorTool;
  @Input() mobileExpanded = false;
  @Input() panelOpen = true;

  @Output() toolChange = new EventEmitter<EditorTool>();
  @Output() upload = new EventEmitter<void>();
  @Output() exportImage = new EventEmitter<void>();
  @Output() undo = new EventEmitter<void>();
  @Output() redo = new EventEmitter<void>();
  @Output() toggleMobile = new EventEmitter<void>();
  @Output() togglePanel = new EventEmitter<void>();

  readonly tools: ToolItem[] = [
    { id: 'crop', label: 'Crop', icon: 'crop' },
    { id: 'rotate', label: 'Rotate', icon: 'rotate-cw' },
    { id: 'flip', label: 'Flip', icon: 'flip-horizontal' },
    { id: 'draw', label: 'Draw', icon: 'pen-line' },
    { id: 'shape', label: 'Shape', icon: 'square' },
    { id: 'text', label: 'Text', icon: 'type' },
    { id: 'filter', label: 'Filter', icon: 'sliders-horizontal' },
  ];
}
