# monorepo-dep-checker

A powerful CLI tool for managing and checking dependencies across packages in a monorepo. Helps you identify version mismatches, missing dependencies, and maintain consistency across your workspace packages.

## Features

- 🔍 Check for version differences across packages
- ⚠️ Identify missing dependencies between your main app and packages
- 🔄 Update dependencies to the highest compatible version
- 🏗️ Full workspace package support
- 📊 Clear, actionable summaries
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

## Command Line Options

```bash
Options:
  --app, -a          Path to main app package.json [default: "./package.json"]
  --packages, -p     Path to packages directory [default: "./packages"]
  --update, -u       Update dependencies to highest compatible version
  --dry-run, -d      Show what would be updated without making changes
  --check-versions   Check for version differences between packages
  --check-missing    Check for dependencies missing between app and packages
  --format           Output format (text or json) [default: "text"]
  --help            Show help
  --version         Show version number
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

## Contributing

Contributions are welcome! Please read our contributing guidelines for details.

## License

MIT License - see LICENSE file for details