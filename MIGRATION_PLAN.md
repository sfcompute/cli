# Deno to Node.js Migration Plan

## Overview

This document outlines the migration strategy for the SF CLI from Deno to Node.js. The CLI is currently a Deno-native application that uses npm packages via Deno's compatibility layer.

---

## 1. CI Updates

### Current Setup (`.github/workflows/ci.yml`)
```yaml
- uses: denoland/setup-deno@v2
- run: deno install
- run: deno fmt --check
- run: deno lint
- run: deno check --config deno.json .
- run: deno test --allow-all
```

### Migration Steps

1. **Replace Deno setup with Node.js setup:**
   ```yaml
   - uses: actions/setup-node@v4
     with:
       node-version-file: '.tool-versions'  # or .nvmrc
       cache: 'npm'
   - run: npm ci
   ```

2. **Replace linting/formatting tools:**
   | Deno Command | Node.js Replacement |
   |--------------|---------------------|
   | `deno fmt --check` | `biome format --check .` |
   | `deno lint` | `biome lint .` |
   | `deno check` | `tsc --noEmit` |
   | `deno test` | `vitest` |

   **Note:** This project used Biome before migrating to Deno. Run `git log --all --oneline -- biome.json` to find the commit where Biome was removed, then extract the old `biome.json` config from that commit.

3. **New CI workflow:**
   ```yaml
   name: CLI (Check)
   on:
     push:
       branches: [main]
     pull_request:
       branches: [main]

   jobs:
     test:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version: '20'
             cache: 'npm'
         - run: npm ci
         - run: npm run lint
         - run: npm run check
         - run: npm test
   ```

4. **New package.json scripts:**
   ```json
   {
     "scripts": {
       "dev": "IS_DEVELOPMENT_CLI_ENV=true tsx src/index.ts",
       "prod": "tsx src/index.ts",
       "lint": "biome check .",
       "lint:fix": "biome check --write .",
       "check": "tsc --noEmit",
       "test": "vitest run",
       "test:watch": "vitest"
     }
   }
   ```

   **Note:** Retain both `dev` and `prod` scripts from the original Deno setup. The `dev` script sets `IS_DEVELOPMENT_CLI_ENV=true` which configures the CLI to use localhost API endpoints.

---

## 2. Release Process Updates

### Current Setup (`release.yml` + `src/scripts/release.ts`)
- Uses `deno compile` for cross-platform binaries
- Targets: Linux x64/arm64, macOS x64/arm64
- Creates zip files and uploads to GitHub releases

### Compilation Tool: `@yao-pkg/pkg`

Use `@yao-pkg/pkg` (community fork of Vercel's pkg) for cross-platform binary compilation.

```bash
npm install -D @yao-pkg/pkg
```

Compile command:
```bash
pkg . --targets node20-linux-x64,node20-linux-arm64,node20-macos-x64,node20-macos-arm64
```

**Note:** pkg binaries are larger than Deno compiled binaries, but pkg is mature and well-tested.

Update `src/scripts/release.ts`:
```typescript
const targets = [
  'node20-linux-x64',
  'node20-linux-arm64',
  'node20-macos-x64',
  'node20-macos-arm64',
];

async function compileDistribution() {
  // Replace Deno.Command with child_process
  const { execSync } = await import('child_process');

  for (const target of targets) {
    const outputName = target.replace('node20-', 'sf-').replace('-', '-');
    execSync(`npx pkg . --target ${target} --output dist/${outputName}`, {
      stdio: 'inherit'
    });
    // Create zip...
  }
}
```

---

## 3. Auto-Upgrade Compatibility

### Critical Files
- `src/checkVersion.ts` - Version checking and auto-upgrade logic
- `src/lib/upgrade.ts` - Manual upgrade command
- `install.sh` - Installation script

### What Stays the Same
1. **Version check URL** - `https://raw.githubusercontent.com/sfcompute/cli/refs/heads/main/package.json`
2. **Binary download URLs** - `https://github.com/sfcompute/cli/releases/download/{version}/sf-{target}.zip`
3. **Install script URL** - `https://www.sfcompute.com/cli/install`
4. **Binary naming convention** - `sf-{target}.zip`

### What Needs to Change

1. **Binary target names** (in `install.sh`):
   ```bash
   # Old (Deno targets)
   x86_64-unknown-linux-gnu
   aarch64-unknown-linux-gnu
   x86_64-apple-darwin
   aarch64-apple-darwin

   # New (pkg targets) - KEEP THE SAME OUTPUT NAMES
   # Map pkg output to same names for backwards compatibility
   ```

2. **Maintain backwards compatibility** by keeping the same zip file names:
   - `sf-x86_64-unknown-linux-gnu.zip`
   - `sf-aarch64-unknown-linux-gnu.zip`
   - `sf-x86_64-apple-darwin.zip`
   - `sf-aarch64-apple-darwin.zip`

3. **Update `src/lib/upgrade.ts`**:
   ```typescript
   // Replace Deno.Command with child_process
   import { spawn } from 'child_process';

   const upgradeProcess = spawn('bash', ['-c', `curl -fsSL ${installScriptUrl} | bash`], {
     env: { ...process.env, SF_CLI_VERSION: version },
     stdio: 'inherit'
   });
   ```

4. **Update `src/scripts/release.ts`**:
   - Replace all `Deno.Command` with `child_process.execSync`
   - Replace `Deno.readTextFile` with `fs.readFileSync`
   - Replace `Deno.writeTextFile` with `fs.writeFileSync`

### Migration Safety

To ensure existing users can upgrade:
1. **Keep the same binary names** in GitHub releases
2. **Keep the same install.sh script** (it's platform-detection only)
3. **First Node.js release** should be a minor version bump to signal the change
4. **Test auto-upgrade** from last Deno version to first Node.js version

---

## 4. Deno-Specific Packages to Replace

### JSR Packages

| Deno Import | Node.js Replacement | Install |
|-------------|---------------------|---------|
| `jsr:@std/fmt/colors` | `chalk` | `npm i chalk` |
| `jsr:@std/assert` | `vitest` | `npm i -D vitest` |

**Files affected:** 24+ files use `jsr:@std/fmt/colors`

**Migration example:**
```typescript
// Before (Deno)
import { cyan, gray, yellow } from "jsr:@std/fmt/colors";
console.log(cyan('text'));

// After (Node.js with chalk)
import chalk from 'chalk';
console.log(chalk.cyan('text'));
```

### NPM: Namespace Imports

These imports use `npm:` prefix which is Deno-specific:

| Current Import | Change To |
|----------------|-----------|
| `import boxen from "npm:boxen@8.0.1"` | `import boxen from "boxen"` |
| `import * as nacl from "npm:tweetnacl"` | `import * as nacl from "tweetnacl"` |
| `import util from "npm:tweetnacl-util"` | `import util from "tweetnacl-util"` |
| `import cliSpinners from "npm:cli-spinners"` | `import cliSpinners from "cli-spinners"` |
| `import yn from "npm:yn"` | `import yn from "yn"` |

**Files affected:** 6 files

### Deno.* APIs

| Deno API | Node.js Replacement | Notes |
|----------|---------------------|-------|
| `Deno.readTextFile()` | `fs.promises.readFile(path, 'utf-8')` | 11 usages |
| `Deno.writeTextFile()` | `fs.promises.writeFile(path, content)` | 10 usages |
| `Deno.mkdir()` | `fs.promises.mkdir(path, { recursive: true })` | 5 usages |
| `Deno.remove()` | `fs.promises.rm(path, { recursive: true })` | 1 usage |
| `Deno.stat()` | `fs.promises.stat(path)` | 2 usages |
| `Deno.chmod()` | `fs.promises.chmod(path, mode)` | 1 usage |
| `Deno.open()` | `fs.promises.open(path)` | 2 usages |
| `Deno.readDirSync()` | `fs.readdirSync(path)` | 1 usage |
| `Deno.Command` | `child_process.spawn()` | 4 usages |
| `Deno.exit()` | `process.exit()` | 1 usage |
| `Deno.errors.NotFound` | Check `err.code === 'ENOENT'` | 2 usages |
| `Deno.errors.AlreadyExists` | Check `err.code === 'EEXIST'` | 1 usage |
| `Deno.SeekMode.Start` | Use `fileHandle.read()` with position | 1 usage |
| `Deno.test()` | `test()` from vitest/jest | 21 tests |

**Files requiring Deno API migration:**
1. `src/scripts/release.ts`
2. `src/lib/nodes/image/upload.ts`
3. `src/lib/clusters/kubeconfig.ts`
4. `src/lib/clusters/keys.tsx`
5. `src/helpers/config.ts`
6. `src/helpers/feature-flags.ts`
7. `src/lib/upgrade.ts`

### Test Files

| Current | Migration |
|---------|-----------|
| `Deno.test('name', fn)` | `test('name', fn)` (vitest) |
| `import { assertEquals } from "jsr:@std/assert"` | `import { expect } from 'vitest'` |

**Test files to migrate:**
- `src/helpers/test/units.test.ts`
- `src/helpers/test/duration.test.ts`
- `src/lib/orders/__tests__/OrderDisplay.test.ts`
- `src/lib/clusters/kubeconfig.test.ts`
- `src/lib/clusters/utils.test.ts`

---

## 5. Configuration Changes

### Remove
- `deno.json`
- `deno.lock`

### Add/Update

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Note:** After adding path aliases, you'll need to configure `tsx` and `pkg` to resolve them. For `pkg`, you may need to bundle first with a tool like `tsup` or `esbuild` that resolves the paths, or use `tsc-alias` to rewrite imports after compilation.

**biome.json:**

Retrieve the old Biome config from git history:
```bash
# Find the commit where biome.json was removed
git log --all --oneline --diff-filter=D -- biome.json

# Show the file contents from that commit's parent
git show <commit>^:biome.json > biome.json
```

Or create a new config:
```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2
  },
  "files": {
    "ignore": ["dist/", "src/schema.ts", "node_modules/"]
  }
}
```

**vitest.config.ts:**
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
```

**.tool-versions update:**
```
nodejs 20.19.0
# Remove deno line
```

---

## 6. New Dependencies to Add

```bash
npm install -D \
  typescript \
  tsx \
  vitest \
  @biomejs/biome \
  @yao-pkg/pkg \
  @types/node

npm install \
  chalk \
  cli-spinners
```

---

## 7. Migration Order

1. **Phase 1: Setup**
   - Add tsconfig.json with `baseUrl` and `paths` for absolute imports
   - Restore biome.json from git history (run `git log --all --oneline --diff-filter=D -- biome.json`)
   - Add vitest config
   - Update package.json scripts

2. **Phase 2: Convert to Absolute Imports**
   - Configure tsconfig.json paths (e.g., `"@/*": ["./src/*"]`)
   - Update all relative imports to use absolute imports
   - Example: `import { getConfig } from "../../helpers/config"` → `import { getConfig } from "@/helpers/config"`
   - This makes the codebase easier to navigate and refactor

3. **Phase 3: Replace Deno APIs** (7 files)
   - Start with helpers (config.ts, feature-flags.ts)
   - Then lib files (upgrade.ts, clusters/*, nodes/image/upload.ts)
   - Finally release.ts

4. **Phase 4: Replace imports** (30+ files)
   - Replace `jsr:@std/fmt/colors` with `chalk`
   - Remove `npm:` prefixes from imports

5. **Phase 5: Migrate tests** (5 files)
   - Replace Deno.test with vitest
   - Replace @std/assert with vitest expects

6. **Phase 6: Update build/release**
   - Update release.ts for pkg
   - Update CI workflows
   - Test cross-compilation

7. **Phase 7: Cleanup**
   - Remove deno.json
   - Remove deno.lock
   - Update .tool-versions
   - Update README

8. **Phase 8: Test auto-upgrade path**
   - Install old Deno version
   - Release new Node.js version
   - Verify auto-upgrade works

---

## 9. Risk Mitigation

1. **Binary size increase**: pkg binaries are larger than Deno compiled binaries. This is an acceptable tradeoff for pkg's maturity and reliability.

2. **Platform compatibility**: Test all 4 targets before release.

3. **Auto-upgrade breakage**: Keep exact same zip file names and install.sh logic.

4. **ESM/CJS issues**: The codebase uses ESM. Ensure all dependencies support ESM or use dynamic imports.

5. **React/Ink compatibility**: Ink works fine with Node.js, but test thoroughly.
