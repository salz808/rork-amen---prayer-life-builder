const fs = require('fs');

const path = 'constants/fonts.ts';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
  "serifLightItalic: 'CormorantGaramond_300Light_Italic'",
  "serifLightItalic: 'CormorantGaramond_300Light'"
).replace(
  "italic: 'CormorantGaramond_400Regular_Italic'",
  "italic: 'CormorantGaramond_400Regular'"
).replace(
  "italicMedium: 'CormorantGaramond_500Medium_Italic'",
  "italicMedium: 'CormorantGaramond_500Medium'"
).replace(
  "italicSemiBold: 'CormorantGaramond_600SemiBold_Italic'",
  "italicSemiBold: 'CormorantGaramond_600SemiBold'"
);

fs.writeFileSync(path, code);
