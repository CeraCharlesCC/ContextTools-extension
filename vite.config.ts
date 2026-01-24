import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';

const targetBrowser = process.env.TARGET_BROWSER || 'chrome';
const isFirefox = targetBrowser === 'firefox';
const outDir = isFirefox ? 'dist-firefox' : 'dist-chrome';

export default defineConfig({
  resolve: {
    alias: {
      '@domain': resolve(__dirname, 'src/domain'),
      '@application': resolve(__dirname, 'src/application'),
      '@infrastructure': resolve(__dirname, 'src/infrastructure'),
      '@presentation': resolve(__dirname, 'src/presentation'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  define: {
    __BROWSER__: JSON.stringify(targetBrowser),
    __IS_FIREFOX__: isFirefox,
    __IS_CHROME__: !isFirefox,
  },
  build: {
    outDir,
    emptyOutDir: true,
    sourcemap: process.env.NODE_ENV === 'development' ? 'inline' : false,
    minify: process.env.NODE_ENV === 'production',
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/presentation/background/index.ts'),
        content: resolve(__dirname, 'src/presentation/content/index.ts'),
        popup: resolve(__dirname, 'src/presentation/popup/index.html'),
        options: resolve(__dirname, 'src/presentation/options/index.html'),
      },
      output: {
        entryFileNames: '[name]/index.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  plugins: [
    {
      name: 'copy-manifest',
      closeBundle() {
        const manifestSrc = isFirefox
          ? resolve(__dirname, 'src/manifests/firefox.json')
          : resolve(__dirname, 'src/manifests/chrome.json');
        const manifestDest = resolve(__dirname, outDir, 'manifest.json');

        if (!existsSync(resolve(__dirname, outDir))) {
          mkdirSync(resolve(__dirname, outDir), { recursive: true });
        }

        if (existsSync(manifestSrc)) {
          copyFileSync(manifestSrc, manifestDest);
        }

        // Copy static assets
        const assetsDir = resolve(__dirname, 'src/assets');
        const destAssetsDir = resolve(__dirname, outDir, 'assets');
        if (existsSync(assetsDir)) {
          if (!existsSync(destAssetsDir)) {
            mkdirSync(destAssetsDir, { recursive: true });
          }
        }
      },
    },
    {
      name: 'html-transform',
      transformIndexHtml(html) {
        return html.replace(
          /<script type="module" crossorigin src="(.+?)"><\/script>/g,
          '<script type="module" src="$1"></script>'
        );
      },
    },
  ],
});
