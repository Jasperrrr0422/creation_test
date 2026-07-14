export type EditorTool =
  | 'select'
  | 'crop'
  | 'rotate'
  | 'flip'
  | 'draw'
  | 'shape'
  | 'text'
  | 'filter';

export type ShapeType = 'rect' | 'circle' | 'triangle';

export type FilterType =
  | 'Grayscale'
  | 'Sepia'
  | 'Blur'
  | 'Sharpen'
  | 'Emboss';

export interface EditorSettings {
  color: string;
  strokeWidth: number;
  shape: ShapeType;
  fontSize: number;
  text: string;
  filter: FilterType;
}

export interface EditorCommand {
  type:
    | 'undo'
    | 'redo'
    | 'delete'
    | 'rotate-left'
    | 'rotate-right'
    | 'flip-x'
    | 'flip-y'
    | 'apply-crop'
    | 'add-shape'
    | 'add-text'
    | 'apply-filter'
    | 'remove-filter';
}
