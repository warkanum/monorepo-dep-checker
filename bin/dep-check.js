#!/usr/bin/env node

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// Convert the file path to a proper file:// URL
const modulePath = pathToFileURL(join(__dirname, '../dist/index.js')).href;
const { default: run } = await import(modulePath);
run().catch(console.error);