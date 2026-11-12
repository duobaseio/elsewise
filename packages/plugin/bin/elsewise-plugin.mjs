#!/usr/bin/env node

import fs from 'node:fs';
import * as z from 'zod';

// TODO: Import the built module once the package is published.
import { Manifest } from '../src/manifest.ts';

// The fields the marketplace lists a plugin with.
const LISTING = ['description', 'homepage', 'repository', 'issues', 'license', 'topics'];

const [command] = process.argv.slice(2);
if (command !== 'manifest') {
  console.error('usage: elsewise-plugin manifest');
  process.exit(1);
}

// A field manifest.json has priority over the package.json.
const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

for (const field of LISTING) {
  if (manifest[field] === undefined && pkg[field] !== undefined) {
    manifest[field] = pkg[field];
  }
}

const parsed = Manifest.safeParse(manifest);
if (!parsed.success) {
  console.error(`[plugin] the manifest is malformed:\n${z.prettifyError(parsed.error)}`);
  process.exit(1);
}

fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
