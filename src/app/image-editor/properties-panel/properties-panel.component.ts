import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatSliderModule } from '@angular/material/slider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LucideAngularModule } from 'lucide-angular';
import { EditorCommand, EditorSettings, EditorTool, FilterType, ShapeType } from '../core/editor.types';
import { creaitionTokens } from '../core/creaition.theme';

@Component({
  selector: 'app-properties-panel',
  standalone: true,
  imports: [
    FormsModule,
    MatSliderModule,
    MatTooltipModule,
    LucideAngularModule,
  ],
  templateUrl: './properties-panel.component.html',
  styleUrl: './properties-panel.component.scss',
})
export class PropertiesPanelComponent {
  @Input({ required: true }) activeTool!: EditorTool;
  @Input({ required: true }) settings!: EditorSettings;
  @Input() open = true;

  @Output() settingsChange = new EventEmitter<EditorSettings>();
  @Output() command = new EventEmitter<EditorCommand>();
  @Output() close = new EventEmitter<void>();

  readonly colors = [
    creaitionTokens.black,
    creaitionTokens.white,
    creaitionTokens.gray2,
    creaitionTokens.gray1,
  ];
  readonly shapes: ShapeType[] = ['rect', 'circle', 'triangle'];
  readonly filters: FilterType[] = ['Grayscale', 'Sepia', 'Blur', 'Sharpen', 'Emboss'];

  update<K extends keyof EditorSettings>(key: K, value: EditorSettings[K]): void {
    this.settingsChange.emit({ ...this.settings, [key]: value });
  }

  run(type: EditorCommand['type']): void {
    this.command.emit({ type });
  }
}
