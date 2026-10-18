#!/usr/bin/env node

/**
 * build-package.js
 *
 * Automated build and artifact packaging script for MyTerminal.
 * Builds the Tauri desktop application, collects the resulting installer
 * bundles (.dmg, .app, .exe, .msi, .deb, .AppImage), copies them into the
 * `builds/<platform>/` folder, and generates a SHA256 checksums file.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const buildsDir = path.join(projectRoot, 'builds');

function getPlatformKey() {
  switch (process.platform) {
    case 'darwin':
      return 'macos';
    case 'win32':
      return 'windows';
    case 'linux':
      return 'linux';
    default:
      return process.platform;
  }
}

function calculateSha256(filePath) {
  const hash = crypto.createHash('sha256');
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest('hex');
}

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();

  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

function main() {
  const platform = getPlatformKey();
  const targetBuildDir = path.join(buildsDir, platform);

  console.log(`\n======================================================`);
  console.log(`🚀 MyTerminal Build & Packaging System`);
  console.log(`Target Platform: ${platform} (${process.platform})`);
  console.log(`Output Directory: ${targetBuildDir}`);
  console.log(`======================================================\n`);

  if (!fs.existsSync(targetBuildDir)) {
    fs.mkdirSync(targetBuildDir, { recursive: true });
  }

  const args = process.argv.slice(2);
  const skipBuild = args.includes('--skip-build');

  if (!skipBuild) {
    console.log(`[1/3] Compiling Tauri release binary...`);
    try {
      execSync('npx tauri build', {
        cwd: projectRoot,
        stdio: 'inherit',
        env: {
          ...process.env,
          MACOSX_DEPLOYMENT_TARGET: process.env.MACOSX_DEPLOYMENT_TARGET || '11.0',
          CMAKE_OSX_DEPLOYMENT_TARGET: process.env.CMAKE_OSX_DEPLOYMENT_TARGET || '11.0',
        },
      });
    } catch (err) {
      console.error(`\n❌ Build failed during "tauri build".`);
      process.exit(1);
    }
  } else {
    console.log(`[1/3] Skipping build step (--skip-build specified)...`);
  }

  console.log(`\n[2/3] Collecting generated installer bundles...`);
  const bundleBaseDir = path.join(projectRoot, 'src-tauri', 'target', 'release', 'bundle');

  if (!fs.existsSync(bundleBaseDir)) {
    console.warn(`⚠️ Warning: Bundle directory not found at: ${bundleBaseDir}`);
    console.log(`Please ensure a release build was executed first.`);
    return;
  }

  const copiedFiles = [];
  const checksums = [];

  function scanAndCollect(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Handle .app bundles on macOS
        if (entry.name.endsWith('.app')) {
          const destApp = path.join(targetBuildDir, entry.name);
          console.log(`  -> Copying application bundle: ${entry.name}`);
          copyRecursiveSync(fullPath, destApp);
          copiedFiles.push(entry.name);
        } else {
          scanAndCollect(fullPath);
        }
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        const validExtensions = ['.dmg', '.msi', '.exe', '.deb', '.appimage', '.rpm', '.zip', '.tar.gz'];

        if (validExtensions.includes(ext) && !entry.name.startsWith('rw.')) {
          const destFile = path.join(targetBuildDir, entry.name);
          console.log(`  -> Copying installer: ${entry.name}`);
          fs.copyFileSync(fullPath, destFile);
          copiedFiles.push(entry.name);

          const hash = calculateSha256(destFile);
          checksums.push(`${hash}  ${entry.name}`);
        }
      }
    }
  }

  scanAndCollect(bundleBaseDir);

  if (copiedFiles.length === 0) {
    console.log(`No distributable bundles found in ${bundleBaseDir}.`);
  } else {
    console.log(`\n[3/3] Generating SHA256SUMS.txt...`);
    if (checksums.length > 0) {
      const checksumFilePath = path.join(targetBuildDir, 'SHA256SUMS.txt');
      fs.writeFileSync(checksumFilePath, checksums.join('\n') + '\n', 'utf8');
      console.log(`  -> Saved checksums to ${checksumFilePath}`);
    }

    console.log(`\n✅ Build Packaging Completed Successfully!`);
    console.log(`------------------------------------------------------`);
    console.log(`Files in ${targetBuildDir}:`);
    copiedFiles.forEach((file) => console.log(` • ${file}`));
    console.log(`------------------------------------------------------\n`);
  }
}

main();
