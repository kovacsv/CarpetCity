// Builds a standalone site in dist, with optional development watching and serving.
// Usage: node tools/build.mjs           -> production build
//        node tools/build.mjs --serve   -> rebuild on change and serve dist at http://localhost:8000
import * as esbuild from 'esbuild';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serve = process.argv.includes('--serve');
const output = path.join(root, 'dist');
const html = path.join(root, 'src', 'index.html');
const css = path.join(root, 'src', 'css', 'style.css');

await Promise.all([
  mkdir(path.join(output, 'css'), { recursive: true }),
  mkdir(path.join(output, 'js'), { recursive: true }),
]);

const options = {
  absWorkingDir: root,
  entryPoints: ['src/ts/main.ts'],
  outfile: 'dist/js/main.js',
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: !serve,
  sourcemap: serve ? 'inline' : false,
  legalComments: 'none',
  logLevel: 'info',
  plugins: [{
    name: 'static-site',
    setup(build) {
      build.onLoad({ filter: /[\\/]src[\\/]ts[\\/]main\.ts$/ }, async (args) => ({
        contents: await readFile(args.path, 'utf8'),
        loader: 'ts',
        resolveDir: path.dirname(args.path),
        watchFiles: [html, css],
      }));
      build.onEnd(async (result) => {
        if (result.errors.length > 0) return;
        await Promise.all([
          copyFile(html, path.join(output, 'index.html')),
          copyFile(css, path.join(output, 'css', 'style.css')),
          writeFile(path.join(output, '.nojekyll'), ''),
        ]);
      });
    },
  }],
};

if (serve) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: output, port: 8000 });
  console.log(`Serving Carpet City at http://localhost:${port}/`);
} else {
  await esbuild.build(options);
}
