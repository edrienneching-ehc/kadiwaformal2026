import { build } from 'esbuild';
import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist/assets', { recursive: true });
const config = JSON.parse(await readFile('site-config.json', 'utf8'));
if (config.backendUrl && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(config.backendUrl)) {
  throw new Error('backendUrl must be a deployed Apps Script /exec URL.');
}
const html = (await readFile('index.html', 'utf8'))
  .replace('./src/style.css', './assets/style.css')
  .replace('./src/app.js', './assets/app.js');
await writeFile('dist/index.html', html);
await cp('src/style.css', 'dist/assets/style.css');
await cp('assets', 'dist/assets', { recursive: true });
await build({ entryPoints: ['src/app.js'], bundle: true, minify: true, outfile: 'dist/assets/app.js', target: ['es2022'], format: 'esm', legalComments: 'eof' });
await writeFile('dist/.nojekyll', '');
console.log('Built public website in dist/. No attendee list or server secrets are included.');
