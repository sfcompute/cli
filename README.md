# cli

This is the San Francisco Compute command line tool.

### Install (MacOS/Linux)

Install the command line tool by running:

```bash
curl -fsSL https://sfcompute.com/cli/install | bash
```

Then, you can run the cli:

```bash
sf --version  # 0.1.0
```

## Local Development / Contributing

### Setup

- Install [Node.js](https://nodejs.org/) (v20 or later) - used as the runtime
- Install [Bun](https://bun.sh/) - used as the package manager
- Install dependencies: `bun install`
- Auth your CLI with `bun run prod login`

### Development Loop

- Make code changes
- Test changes with
  - `bun run dev` to test against local API
  - `bun run prod` to test against production API
  - These are aliases to the user facing `sf` command. So if you wanted to run
    `sf login` locally against the local API, run `bun run dev login`

## New Release

Releases are managed through GitHub Actions. To create a new release:

1. Ensure your changes are merged into the `main` branch
2. Go to the
   [Actions tab](https://github.com/sfcompute/cli/actions/workflows/release.yml)
   in the repository
3. Click on the "Release" workflow
4. Click "Run workflow"
5. Select the version bump type:
   - `patch`: for backwards-compatible bug fixes (0.0.x)
   - `minor`: for backwards-compatible new features (0.x.0)
   - `major`: for breaking changes (x.0.0)
   - `prerelease`: for pre-release versions (0.0.0-pre.timestamp)
6. Click "Run workflow" to start the release process

### Version Types and Behavior

#### Regular Releases (patch/minor/major)

- Creates a new GitHub release with compiled binaries
- Updates package.json with the new version
- Users on older versions will be notified to update
- Patch updates trigger automatic updates for users

#### Pre-releases

- Tagged as pre-release in GitHub
- Include timestamp in version (e.g., `0.6.4-pre.1709347826543`)
- **Important**: Users on stable versions:
  - Will not see update notifications for pre-releases
  - Cannot upgrade to pre-releases
  - Will only see and receive stable version updates
- Pre-release users:
  - Can update to newer pre-releases
  - Can update to stable releases
  - Will see update notifications normally

The workflow will:

- Run quality checks:
  - Linting with `biome ci`
  - Type checking with `tsc --noEmit`
  - Run all tests with `vitest`
- Bump the version in package.json
- Create a new GitHub release with compiled binaries
- Push the version bump commit back to main

Note: The release workflow will only run on the `main` branch and will fail if
any of the quality checks fail.
