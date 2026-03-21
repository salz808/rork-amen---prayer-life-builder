const fs = require('fs');

const path = 'hooks/useTypography.ts';
let code = fs.readFileSync(path, 'utf8');

// scale: (base: number): number => isLarge ? Math.round(base * LARGE_SCALE * 10) / 10 : base,
code = code.replace(
  'scale: (base: number): number => isLarge ? Math.round(base * LARGE_SCALE * 10) / 10 : base,',
  'scale: (base: number): number => isLarge ? Math.round(base * 1.15 * LARGE_SCALE * 10) / 10 : Math.round(base * 1.15 * 10) / 10,'
);

fs.writeFileSync(path, code);
