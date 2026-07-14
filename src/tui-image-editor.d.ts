import ImageEditor from 'tui-image-editor';

declare global {
  interface Window {
    tui: {
      ImageEditor: typeof ImageEditor;
    };
  }
}

export {};
