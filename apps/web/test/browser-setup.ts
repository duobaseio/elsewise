import { beforeAll } from 'vitest';

import '../src/styles.css';

const FACES = ['400 14px "Work Sans Variable"', '500 14px "Work Sans Variable"', '400 12px "JetBrains Mono Variable"'];

beforeAll(async () => {
  await Promise.all(FACES.map((face) => document.fonts.load(face)));
  await document.fonts.ready;
});
