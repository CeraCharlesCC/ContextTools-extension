import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..');

const packageJsonPath = resolve(projectRoot, 'package.json');
const packageLockPath = resolve(projectRoot, 'package-lock.json');
const chromeManifestPath = resolve(projectRoot, 'src/manifests/chrome.json');
const firefoxManifestPath = resolve(projectRoot, 'src/manifests/firefox.json');

const CHECK_MODE = process.argv.includes('--check');

function ensureSemver(version) {
  // SemVer 2.0.0: MAJOR.MINOR.PATCH[-PRERELEASE][+BUILD]
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.test(version);
}

async function readJson(path) {
  const content = await readFile(path, 'utf8');
  return JSON.parse(content);
}

function stringifyJson(json) {
  return `${JSON.stringify(json, null, 2)}\n`;
}

async function main() {
  const packageJson = await readJson(packageJsonPath);
  const sourceVersion = packageJson.version;

  if (!sourceVersion || !ensureSemver(sourceVersion)) {
    throw new Error(`Invalid package.json version: "${sourceVersion}"`);
  }

  const files = [
    {
      name: 'chrome manifest',
      path: chromeManifestPath,
      updateFn: (json, version) => {
        const prev = json.version;
        json.version = version;
        return prev;
      },
    },
    {
      name: 'firefox manifest',
      path: firefoxManifestPath,
      updateFn: (json, version) => {
        const prev = json.version;
        json.version = version;
        return prev;
      },
    },
    {
      name: 'package-lock top-level',
      path: packageLockPath,
      updateFn: (json, version) => {
        const prev = json.version;
        json.version = version;
        return prev;
      },
    },
    {
      name: 'package-lock root package',
      path: packageLockPath,
      updateFn: (json, version) => {
        if (!json.packages || !json.packages['']) {
          throw new Error('package-lock.json is missing packages[""]');
        }
        const prev = json.packages[''].version;
        json.packages[''].version = version;
        return prev;
      },
    },
  ];

  const jsonCache = new Map();
  const results = [];

  for (const file of files) {
    let json = jsonCache.get(file.path);
    if (!json) {
      json = await readJson(file.path);
      jsonCache.set(file.path, json);
    }

    const currentVersion = file.updateFn(json, sourceVersion);
    const changed = currentVersion !== sourceVersion;
    results.push({ ...file, currentVersion, changed });
  }

  if (CHECK_MODE) {
    const mismatches = results.filter((result) => result.changed);
    if (mismatches.length > 0) {
      console.error('Version mismatch found. Run `npm run sync:versions` to fix:');
      for (const mismatch of mismatches) {
        console.error(`- ${mismatch.name}: ${mismatch.currentVersion} -> ${sourceVersion}`);
      }
      process.exit(1);
    }
    console.log(`Versions are in sync at ${sourceVersion}.`);
    return;
  }

  const touchedPaths = new Set();
  for (const result of results) {
    if (result.changed) {
      touchedPaths.add(result.path);
    }
  }

  for (const path of touchedPaths) {
    await writeFile(path, stringifyJson(jsonCache.get(path)), 'utf8');
  }

  if (touchedPaths.size === 0) {
    console.log(`No version updates needed. All files already at ${sourceVersion}.`);
    return;
  }

  console.log(`Synced versions to ${sourceVersion}:`);
  for (const result of results) {
    if (result.changed) {
      console.log(`- ${result.name}: ${result.currentVersion} -> ${sourceVersion}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
