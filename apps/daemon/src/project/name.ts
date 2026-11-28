/**
 * Returns the folder name from a git clone URL.
 *
 * Examples:
 * - https://github.com/foo/bar.git/ → bar
 * - git@github.com:foo/bar.git → bar
 * - C:\repos\bar → bar
 */
export function repositoryName(url: string): string {
  const segment =
    url
      .replace(/[/\\]+$/, '')
      .split(/[/\\:]/)
      .at(-1) ?? '';
  const name = segment.replace(/\.git$/, '');
  return name === '.' || name === '..' ? '' : name;
}

/**
 * Returns a random animal name.
 */
export function randomAnimal(): string {
  return ANIMALS[Math.floor(Math.random() * ANIMALS.length)] ?? 'fox';
}

/**
 * Common land animal names.
 */
export const ANIMALS: readonly string[] = [
  'armadillo',
  'badger',
  'bear',
  'beaver',
  'bison',
  'camel',
  'capybara',
  'cheetah',
  'chimpanzee',
  'cougar',
  'deer',
  'donkey',
  'elephant',
  'fox',
  'gazelle',
  'gibbon',
  'giraffe',
  'goat',
  'gorilla',
  'hamster',
  'hedgehog',
  'hippo',
  'horse',
  'hyena',
  'kangaroo',
  'koala',
  'lemur',
  'leopard',
  'lion',
  'llama',
  'lynx',
  'meerkat',
  'mole',
  'monkey',
  'moose',
  'okapi',
  'orangutan',
  'otter',
  'panda',
  'pangolin',
  'porcupine',
  'possum',
  'rabbit',
  'raccoon',
  'rhino',
  'sheep',
  'skunk',
  'sloth',
  'squirrel',
  'tapir',
  'tiger',
  'warthog',
  'weasel',
  'wolf',
  'wolverine',
  'wombat',
  'yak',
  'zebra',
];
