import { Component } from '@angular/core';
import { ImageEditorComponent } from './image-editor/image-editor.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ImageEditorComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
}
