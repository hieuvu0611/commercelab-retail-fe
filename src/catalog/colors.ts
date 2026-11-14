/** Swatch colours of the colour axis; unknown colours get a neutral grey. */
export const COLOR_HEX: Readonly<Record<string, string>> = {
  Black: '#2b2b2b',
  Navy: '#1f3a5f',
  Grey: '#8a8d91',
  Green: '#3f6b4f',
  Red: '#b03a2e',
  Blue: '#2f6fa8',
  Sand: '#cdb48a',
}

export const swatchColor = (name: string): string => COLOR_HEX[name] ?? '#8a8d91'
