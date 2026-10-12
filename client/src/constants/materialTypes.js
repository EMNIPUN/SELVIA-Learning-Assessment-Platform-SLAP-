// The learning material types the API accepts (MaterialType). A LINK material must point to an external URL.
export const MATERIAL_TYPE = Object.freeze({
  DOCUMENT: 'DOCUMENT',
  SLIDES: 'SLIDES',
  VIDEO: 'VIDEO',
  AUDIO: 'AUDIO',
  LINK: 'LINK',
  READING: 'READING',
  OTHER: 'OTHER',
})

export const MATERIAL_TYPES = Object.values(MATERIAL_TYPE)
