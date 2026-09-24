# monorepo-dep-checker

A powerful CLI tool for managing and checking dependencies across packages in a monorepo. Helps you identify version mismatches, missing dependencies, and maintain consistency across your workspace packages.

## Features

- 🔍 Check for version differences across packages
- ⚠️ Identify missing dependencies between your main app and packages
- 🔄 Update dependencies to the highest compatible version
- 🏗️ Full workspace package support
- 📊 Clear, actionable summaries
- 🚦 CI gating via exit codes (`--fail-on-diff`, `--fail-on-missing`)
- 🚀 Fast, zero-config setup

## Installation

```bash
# Global installation
npm install -g @warkypublic/monorepo-dep-checker

# Or locally in your project
npm install --save-dev @warkypublic/monorepo-dep-checker
```

## Quick Start

Basic usage with default paths (assumes `./package.json` for main app and `./packages` for workspace packages):

```bash
dep-check
```

## Usage Examples

### 1. Check Version Differences

Find packages using different versions of the same dependency:

```bash
dep-check --check-versions

# Output example:
react:
  Difference (major):
    ^17.0.2 vs ^18.0.0

    Packages using ^17.0.2:
      - my-app (package.json)
      - components (packages/components/package.json)

    Packages using ^18.0.0:
      - new-feature (packages/new-feature/package.json)

    Recommended action:
    ⚠️  Major version difference - Manual review recommended
```

### 2. Check Missing Dependencies

Find dependencies that exist in packages but are missing from the main app:

```bash
dep-check --check-missing

# Output example:
Summary:
Packages with dependency mismatches: 2
Unique dependencies missing from main app: 1
  lodash
Unique unused dependencies from main app: 1
  axios
```

### 3. Update Dependencies

Update all dependencies to their highest compatible version:

```bash
# Dry run - show what would be updated
dep-check --update --dry-run

# Actually perform the updates
dep-check --update
```

### 4. Custom Paths

Specify custom paths for your main app and packages:

```bash
dep-check --app ../my-app/package.json --packages ../my-app/packages
```

### 5. JSON Output

Get results in JSON format for further processing:

```bash
dep-check --check-versions --format json
```

### 6. CI Gating

Exit with code 1 when the check finds a problem, so a pipeline fails:

```bash
# Fail if any dependency resolves to more than one version
dep-check --check-versions --fail-on-diff

# Fail if any package depends on something the main app does not declare
dep-check --check-missing --fail-on-missing

# Both gates in one run
dep-check --fail-on-diff --fail-on-missing
```

| Exit code | Meaning |
| --- | --- |
| `0` | No gate was tripped |
| `1` | A gate was tripped, or the run errored |

Notes:

- A gate runs whatever analysis it needs, even outside its own mode — `--check-missing --fail-on-diff` still detects version conflicts.
- Failure messages go to **stderr**, so `--format json` keeps stdout parseable.
- Gates cannot be combined with `--update`: `--update` rewrites the tree mid-run, which would leave the exit code describing a state that no longer exists.

## Command Line Options

```bash
Options:
  --app, -a          Path to main app package.json [default: "./package.json"]
  --packages, -p     Path to packages directory [default: "./packages"]
  --update, -u       Update dependencies to highest compatible version
  --dry-run, -d      Show what would be updated without making changes
  --check-versions   Check for version differences between packages
  --check-missing    Check for dependencies missing between app and packages
  --format, -f       Output format (text or json) [default: "text"]
  --strict, -s       Only update range deps (~, ^, >=) when they are incompatible
  --fail-on-diff     Exit 1 if any dependency resolves to more than one version
  --fail-on-missing  Exit 1 if a package depends on something the main app does not
  --help, -h         Show help
  --version, -V      Show version number
```

## Features

### Workspace Support

- Automatically detects and handles workspace dependencies
- Ignores `workspace:*` protocol dependencies
- Properly manages workspace package references
- Supports npm, yarn, and pnpm workspaces

### Version Analysis

- Identifies major, minor, and patch version differences
- Provides clear upgrade recommendations
- Shows detailed package locations
- Helps prevent dependency conflicts

### Missing Dependency Detection

- Finds dependencies used in packages but missing from main app
- Identifies unused main app dependencies
- Shows unique missing dependencies to avoid duplication
- Excludes workspace packages from analysis

## Best Practices

1. Run `--check-versions` before updates to identify potential breaking changes
2. Use `--dry-run` before applying updates
3. Review major version differences manually
4. Keep workspace dependencies consistent across packages
5. Gate CI with `--check-versions --fail-on-diff` so drift cannot merge

## Development

```bash
pnpm install
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint ./src
pnpm test        # vitest
pnpm build       # vite build -> dist/
```

## Contributing

Contributions are welcome! Please read our contributing guidelines for details.

## License

MIT License - see LICENSE file for details