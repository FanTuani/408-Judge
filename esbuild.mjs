import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const extensionContext = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  logLevel: 'info'
});
const confettiContext = await esbuild.context({
  entryPoints: ['src/confetti.ts'],
  bundle: true,
  outfile: 'dist/confetti.js',
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
  sourcemap: true,
  minify: true,
  logLevel: 'info'
});

if (watch) {
  await Promise.all([extensionContext.watch(), confettiContext.watch()]);
} else {
  await Promise.all([extensionContext.rebuild(), confettiContext.rebuild()]);
  await Promise.all([extensionContext.dispose(), confettiContext.dispose()]);
}
