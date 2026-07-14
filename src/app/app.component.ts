import { Component } from '@angular/core';
import { ImageEditorPageComponent } from './image-editor/image-editor-page.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ImageEditorPageComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
}
