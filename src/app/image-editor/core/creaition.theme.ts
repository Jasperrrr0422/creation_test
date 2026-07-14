import type ImageEditor from 'tui-image-editor';

type Theme = NonNullable<
  NonNullable<ConstructorParameters<typeof ImageEditor>[1]['includeUI']>['theme']
>;

export const creaitionTokens = {
  fontFamily: 'strokeWeight, Eina03, Arial, sans-serif',
  black: '#000000',
  white: '#ffffff',
  gray1: '#efefee',
  gray2: '#bebebe',
  background: '#f0f0f0',
  radiusButton: '50px',
  radiusInput: '0',
  radiusCard: '1rem',
  weightRegular: 60,
  weightMedium: 80,
  weightSemibold: 120,
  slantRegular: 0,
  slantHover: 12,
} as const;

export const creaitionEditorTheme: Theme = {
  'common.backgroundColor': creaitionTokens.background,
  'common.border': '0px',
  'header.backgroundColor': creaitionTokens.white,
  'header.border': '0px',
  'loadButton.backgroundColor': creaitionTokens.black,
  'loadButton.border': `1px solid ${creaitionTokens.black}`,
  'loadButton.color': creaitionTokens.white,
  'loadButton.fontFamily': creaitionTokens.fontFamily,
  'loadButton.fontSize': '12px',
  'downloadButton.backgroundColor': creaitionTokens.white,
  'downloadButton.border': `1px solid ${creaitionTokens.black}`,
  'downloadButton.color': creaitionTokens.black,
  'downloadButton.fontFamily': creaitionTokens.fontFamily,
  'downloadButton.fontSize': '12px',
  'submenu.backgroundColor': creaitionTokens.white,
  'submenu.partition.color': creaitionTokens.gray2,
  'submenu.normalLabel.color': creaitionTokens.black,
  'submenu.normalLabel.fontWeight': String(creaitionTokens.weightRegular),
  'submenu.activeLabel.color': creaitionTokens.black,
  'submenu.activeLabel.fontWeight': String(creaitionTokens.weightSemibold),
  'checkbox.border': `1px solid ${creaitionTokens.black}`,
  'checkbox.backgroundColor': creaitionTokens.white,
  'range.pointer.color': creaitionTokens.black,
  'range.bar.color': creaitionTokens.gray2,
  'range.subbar.color': creaitionTokens.black,
  'range.value.color': creaitionTokens.black,
  'range.value.fontWeight': String(creaitionTokens.weightMedium),
  'range.value.fontSize': '12px',
  'range.value.backgroundColor': creaitionTokens.white,
  'range.value.border': `1px solid ${creaitionTokens.gray2}`,
  'range.title.color': creaitionTokens.black,
  'range.title.fontWeight': String(creaitionTokens.weightRegular),
  'colorpicker.button.border': `1px solid ${creaitionTokens.gray2}`,
  'colorpicker.title.color': creaitionTokens.black,
};

export function applyCreaitionEditorTheme(host: HTMLElement): void {
  host.dataset['tuiTheme'] = 'creaition';
  host.style.setProperty('--tui-theme-background', String(creaitionEditorTheme['common.backgroundColor']));
  host.style.setProperty('--tui-theme-surface', String(creaitionEditorTheme['submenu.backgroundColor']));
  host.style.setProperty('--tui-theme-text', String(creaitionEditorTheme['submenu.normalLabel.color']));
  host.style.setProperty('--tui-theme-border', creaitionTokens.gray2);
  host.style.setProperty('--tui-theme-font', creaitionTokens.fontFamily);
}
