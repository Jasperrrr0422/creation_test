import { ApplicationConfig, importProvidersFrom, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import {
  Check, Crop, Download, FlipHorizontal, ImagePlus, Menu, PanelRight, PenLine,
  Maximize2, Redo2, RotateCcw, RotateCw, SlidersHorizontal, Square, Trash2, Type, Undo2,
  Upload, X, ZoomIn, ZoomOut, LucideAngularModule,
} from 'lucide-angular';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(),
    provideAnimationsAsync(),
    importProvidersFrom(LucideAngularModule.pick({
      Check, Crop, Download, FlipHorizontal, ImagePlus, Menu, PanelRight, PenLine,
      Maximize2, Redo2, RotateCcw, RotateCw, SlidersHorizontal, Square, Trash2, Type, Undo2,
      Upload, X, ZoomIn, ZoomOut,
    })),
  ]
};
