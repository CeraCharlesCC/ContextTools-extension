import { defineConfig, UserConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, renameSync, rmSync } from 'fs';

const targetBrowser = process.env.TARGET_BROWSER || 'chrome';
const isFirefox = targetBrowser === 'firefox';
const outDir = isFirefox ? 'dist-firefox' : 'dist-chrome';

const commonConfig = {
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@ext': resolve(__dirname, 'src/ext'),
    },
  },
  define: {
    __BROWSER__: JSON.stringify(targetBrowser),
    __IS_FIREFOX__: isFirefox,
    __IS_CHROME__: !isFirefox,
  },
};

// Content script config - must be IIFE format (no ES modules)
const contentScriptConfig: UserConfig = {
  ...commonConfig,
  build: {
    outDir,
    emptyOutDir: false,
    sourcemap: process.env.NODE_ENV === 'development' ? 'inline' : false,
    minify: process.env.NODE_ENV === 'production',
    lib: {
      entry: resolve(__dirname, 'src/ext/content/index.ts'),
      name: 'ContextToolsContent',
      formats: ['iife'],
      fileName: () => 'content/index.js',
    },
    rollupOptions: {
      output: {
        extend: true,
      },
    },
  },
};

// Main config for background, popup, options (ES modules supported)
const mainConfig: UserConfig = {
  ...commonConfig,
  build: {
    outDir,
    emptyOutDir: true,
    sourcemap: process.env.NODE_ENV === 'development' ? 'inline' : false,
    minify: process.env.NODE_ENV === 'production',
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/ext/background/index.ts'),
        popup: resolve(__dirname, 'src/ext/ui/popup/index.html'),
        options: resolve(__dirname, 'src/ext/ui/options/index.html'),
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

        // Relocate HTML files from nested paths to expected locations
        const htmlRelocations = [
          { from: 'src/ext/ui/popup/index.html', to: 'popup/index.html' },
          { from: 'src/ext/ui/options/index.html', to: 'options/index.html' },
        ];

        for (const { from, to } of htmlRelocations) {
          const srcPath = resolve(__dirname, outDir, from);
          const destDir = resolve(__dirname, outDir, to.replace('/index.html', ''));
          const destPath = resolve(__dirname, outDir, to);

          if (existsSync(srcPath)) {
            if (!existsSync(destDir)) {
              mkdirSync(destDir, { recursive: true });
            }
            renameSync(srcPath, destPath);
          }
        }

        // Clean up empty nested directories
        const nestedSrcDir = resolve(__dirname, outDir, 'src');
        if (existsSync(nestedSrcDir)) {
          rmSync(nestedSrcDir, { recursive: true, force: true });
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
};

// Export based on build mode - use VITE_BUILD_TARGET env var to select
const buildTarget = process.env.VITE_BUILD_TARGET;

export default defineConfig(() => {
  if (buildTarget === 'content') {
    return contentScriptConfig;
  }
  if (buildTarget === 'main') {
    return mainConfig;
  }
  // Default: return main config (for single build compatibility)
  return mainConfig;
});
