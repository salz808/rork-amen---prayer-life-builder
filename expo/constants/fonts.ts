export const Fonts = {
  // Montserrat carries structural text (titles, prayer body, scripture,
  // labels, buttons). Cormorant is reserved for short devotional
  // quotations (Regular/Medium) and short emphasized phrases (Italic).
  // Only the faces below load at startup (8, down from 16): the
  // removed weights were unused (200 ExtraLight, Cormorant 700 Bold,
  // 300 Light Italic) or remapped to a kept face during the 2026-11-16
  // typography rebalance (100 Thin -> 300 Light; Cormorant 300 Light /
  // 600 SemiBold -> Montserrat; 500/600 Italic -> 400 Italic).
  titleLight: 'Montserrat_300Light',
  titleRegular: 'Montserrat_400Regular',
  titleMedium: 'Montserrat_500Medium',
  titleSemiBold: 'Montserrat_600SemiBold',
  titleBold: 'Montserrat_700Bold',
  serifRegular: 'CormorantGaramond_400Regular',
  serifMedium: 'CormorantGaramond_500Medium',
  italic: 'CormorantGaramond_400Regular_Italic',
};
