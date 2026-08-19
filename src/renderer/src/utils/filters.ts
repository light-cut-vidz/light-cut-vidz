export interface FilterDefinition {
  id: string
  nameEn: string
  nameFr: string
  css: string
  ffmpeg: string
}

export const VIDEO_FILTERS: FilterDefinition[] = [
  { id: 'none', nameEn: 'None', nameFr: 'Aucun', css: 'none', ffmpeg: '' },
  { id: 'grayscale', nameEn: 'Grayscale', nameFr: 'Gris', css: 'grayscale(100%)', ffmpeg: 'hue=s=0' },
  { id: 'sepia', nameEn: 'Sepia', nameFr: 'Sépia', css: 'sepia(100%)', ffmpeg: 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131' },
  { id: 'invert', nameEn: 'Invert', nameFr: 'Négatif', css: 'invert(100%)', ffmpeg: 'negate' },
  { id: 'blur', nameEn: 'Blur', nameFr: 'Flou', css: 'blur(5px)', ffmpeg: 'boxblur=5:1' },
  { id: 'bright', nameEn: 'Brighten', nameFr: 'Lumineux', css: 'brightness(150%)', ffmpeg: 'eq=brightness=0.3' },
  { id: 'dark', nameEn: 'Darken', nameFr: 'Sombre', css: 'brightness(50%)', ffmpeg: 'eq=brightness=-0.3' },
  { id: 'contrast', nameEn: 'High Contrast', nameFr: 'Contraste', css: 'contrast(200%)', ffmpeg: 'eq=contrast=2.0' },
  { id: 'saturate', nameEn: 'Vibrant', nameFr: 'Vif', css: 'saturate(200%)', ffmpeg: 'eq=saturation=2.0' },
  { id: 'hue', nameEn: 'Hue Rotate', nameFr: 'Teinte', css: 'hue-rotate(90deg)', ffmpeg: 'hue=h=90' },
  { id: 'vintage', nameEn: 'Vintage', nameFr: 'Ancien', css: 'sepia(50%) contrast(120%) brightness(90%)', ffmpeg: 'curves=vintage' },
  { id: 'noir', nameEn: 'Noir', nameFr: 'Noir', css: 'grayscale(100%) contrast(150%)', ffmpeg: 'format=gray,eq=contrast=1.5' },
  { id: 'dramatic', nameEn: 'Dramatic', nameFr: 'Dramatique', css: 'contrast(150%) brightness(80%) saturate(120%)', ffmpeg: 'eq=contrast=1.5:brightness=-0.1:saturation=1.2' },
  { id: 'cold', nameEn: 'Cold', nameFr: 'Froid', css: 'hue-rotate(180deg) saturate(80%)', ffmpeg: 'colortemperature=temperature=10000' },
  { id: 'warm', nameEn: 'Warm', nameFr: 'Chaud', css: 'sepia(30%) saturate(130%)', ffmpeg: 'colortemperature=temperature=4000' },
  { id: 'mirror', nameEn: 'Mirror', nameFr: 'Miroir', css: 'scaleX(-1)', ffmpeg: 'hflip' },
  { id: 'upside_down', nameEn: 'Upside Down', nameFr: 'Renversé', css: 'scaleY(-1)', ffmpeg: 'vflip' },
  { id: 'posterize', nameEn: 'Posterize', nameFr: 'Poster', css: 'contrast(200%) brightness(120%)', ffmpeg: 'unsharp,eq=contrast=2,hqdn3d' }, // Note: actual posterize in ffmpeg is complex, approximating
  { id: 'vignette', nameEn: 'Vignette', nameFr: 'Vignette', css: 'brightness(1.1)', ffmpeg: 'vignette' }, // CSS vignette is hard without overlay, using brightness as hint
  { id: 'edges', nameEn: 'Edges', nameFr: 'Contours', css: 'invert(100%) grayscale(100%) contrast(500%)', ffmpeg: 'edgedetect=low=0.1:high=0.4' },
]

export const getFilterById = (id: string) => VIDEO_FILTERS.find(f => f.id === id) || VIDEO_FILTERS[0]
