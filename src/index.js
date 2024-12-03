import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import semver from 'semver';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

class DependencyChecker {
  constructor(appPackageJsonPath, packagesDir) {
    this.appPackageJsonPath = appPackageJsonPath;
    this.packagesDir = packagesDir;
    this.packageJsonFiles = [];
    this.dependencyMap = new Map();
    this.workspacePackages = new Set();
  }

  findWorkspacePackages() {
    const entries = fs.readdirSync(this.packagesDir, { withFileTypes: true });

    entries.forEach((entry) => {
      if (entry.isDirectory()) {
        const packageJsonPath = path.join(this.packagesDir, entry.name, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
          this.workspacePackages.add(packageJson.name);
        }
      }
    });
  }

  isWorkspaceDep(version) {
    return version?.startsWith('workspace:') || version === '*';
  }

  isWorkspacePackage(packageName) {
    return this.workspacePackages.has(packageName);
  }

  shouldIncludeDependency(depName, version, packageJson) {
    // Skip if it's a workspace dependency
    if (this.isWorkspaceDep(version)) return false;

    // Skip if the dependency is a workspace package
    if (this.isWorkspacePackage(depName)) return false;

    // Skip if the package itself is referenced as a workspace dependency
    const allWorkspaceDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
      ...packageJson.peerDependencies,
    };

    return !Object.entries(allWorkspaceDeps).some(
      ([name, ver]) => name === depName && this.isWorkspaceDep(ver)
    );
  }

  getSemverVersion(version) {
    // Handle workspace protocol
    if (version.startsWith('workspace:')) {
      // Extract actual version from the workspace package
      const workspaceVersion = version.replace('workspace:', '');
      if (workspaceVersion === '*') return null;
      // If it's a specific version after workspace:, use that
      if (semver.valid(workspaceVersion)) return workspaceVersion;
      return null;
    }

    // Handle other special cases
    if (version === '*' || version === 'latest') return null;

    // Remove any leading special characters (^, ~, etc)
    const cleanVersion = version.replace(/^[~^]/, '');

    // Try to parse as semver
    try {
      if (semver.valid(cleanVersion)) return cleanVersion;
      return null;
    } catch {
      return null;
    }
  }

  checkMissingDependencies() {
    console.log(chalk.bold('\nChecking for missing dependencies...\n'));

    this.findWorkspacePackages();

    const appPackageJson = JSON.parse(fs.readFileSync(this.appPackageJsonPath, 'utf8'));
    const appDeps = {
      ...appPackageJson.dependencies,
      ...appPackageJson.peerDependencies,
    };

    const missingDeps = new Map();
    const uniqueMissingDeps = new Set();
    const uniqueExtraDeps = new Set();

    this.packageJsonFiles
      .filter((file) => file !== this.appPackageJsonPath)
      .forEach((filePath) => {
        const packageJson = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const packageName = packageJson.name;
        const packageDeps = {
          ...packageJson.dependencies,
          ...packageJson.peerDependencies,
        };

        const missing = [];
        const extraDeps = [];

        Object.entries(packageDeps).forEach(([dep, version]) => {
          if (!appDeps[dep] && this.shouldIncludeDependency(dep, version, packageJson)) {
            missing.push({
              name: dep,
              version,
            });
            uniqueMissingDeps.add(dep);
          }
        });

        Object.entries(appDeps).forEach(([dep, version]) => {
          if (!packageDeps[dep] && this.shouldIncludeDependency(dep, version, appPackageJson)) {
            extraDeps.push({
              name: dep,
              version,
            });
            uniqueExtraDeps.add(dep);
          }
        });

        if (missing.length > 0 || extraDeps.length > 0) {
          missingDeps.set(packageName, {
            // eslint-disable-next-line no-undef
            path: path.relative(process.cwd(), filePath),
            missing,
            extraDeps,
          });
        }
      });

    if (missingDeps.size === 0) {
      console.log(chalk.green('✓ All dependencies are properly synchronized\n'));
      return;
    }

    missingDeps.forEach(({ path: pkgPath, missing, extraDeps }, packageName) => {
      if (missing.length > 0 || extraDeps.length > 0) {
        console.log(chalk.yellow(`\n${packageName} (${chalk.gray(pkgPath)}):`));

        if (missing.length > 0) {
          console.log(chalk.red('  Missing from main app:'));
          missing.forEach(({ name, version }) => {
            console.log(`    - ${name}@${version}`);
          });
        }

        if (extraDeps.length > 0) {
          console.log(chalk.blue('  Not used by package but in main app:'));
          extraDeps.forEach(({ name, version }) => {
            console.log(`    - ${name}@${version}`);
          });
        }
      }
    });

    if (uniqueMissingDeps.size > 0 || uniqueExtraDeps.size > 0) {
      console.log(chalk.bold('\nSummary:'));
      console.log(`Packages with dependency mismatches: ${missingDeps.size}`);
      if (uniqueMissingDeps.size > 0) {
        console.log(
          chalk.red(`Unique dependencies missing from main app: ${uniqueMissingDeps.size}`)
        );
        console.log(chalk.gray('  ' + Array.from(uniqueMissingDeps).join(', ')));
      }
      if (uniqueExtraDeps.size > 0) {
        console.log(
          chalk.blue(`Unique unused dependencies from main app: ${uniqueExtraDeps.size}`)
        );
        console.log(chalk.gray('  ' + Array.from(uniqueExtraDeps).join(', ')));
      }
    }
  }

  compareDependencyVersions(version1, version2) {
    const v1 = this.getSemverVersion(version1);
    const v2 = this.getSemverVersion(version2);

    // If either version can't be parsed, return 'unknown'
    if (!v1 || !v2) return 'unknown';

    try {
      return semver.diff(v1, v2);
    } catch {
      return 'unknown';
    }
  }

  getVersionLabel(version) {
    if (version.startsWith('workspace:')) {
      return `${chalk.cyan('workspace:')}${version.slice(10)}`;
    }
    return version;
  }

  findPackageJsonFiles() {
    this.packageJsonFiles.push(this.appPackageJsonPath);

    const entries = fs.readdirSync(this.packagesDir, { withFileTypes: true });

    entries.forEach((entry) => {
      if (entry.isDirectory()) {
        const packageJsonPath = path.join(this.packagesDir, entry.name, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
          this.packageJsonFiles.push(packageJsonPath);
        }
      }
    });
  }

  analyzeDependencies() {
    this.packageJsonFiles.forEach((filePath) => {
      const packageJson = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const normalDeps = packageJson.dependencies || {};
      const peerDeps = packageJson.peerDependencies || {};
      const packageName = packageJson.name;
      const isMainApp = filePath === this.appPackageJsonPath;

      [
        { deps: normalDeps, type: 'normal' },
        { deps: peerDeps, type: 'peer' },
      ].forEach(({ deps, type }) => {
        Object.entries(deps).forEach(([dep, version]) => {
          if (!this.dependencyMap.has(dep)) {
            this.dependencyMap.set(dep, {
              versions: new Map(),
              usedAsNormal: false,
              usedAsPeer: false,
            });
          }

          const depInfo = this.dependencyMap.get(dep);
          if (!depInfo.versions.has(version)) {
            depInfo.versions.set(version, {
              packages: new Set(),
              usages: new Set(),
            });
          }

          const versionInfo = depInfo.versions.get(version);
          versionInfo.packages.add(packageName);
          versionInfo.usages.add(`${type}${isMainApp ? ' (main app)' : ''}`);

          if (type === 'normal') depInfo.usedAsNormal = true;
          if (type === 'peer') depInfo.usedAsPeer = true;
        });
      });
    });
  }

  displayVersionDifferences() {
    console.log(chalk.bold('\nVersion Differences Summary:\n'));

    let hasDifferences = false;
    const conflictingDeps = [];

    this.dependencyMap.forEach((depInfo, dep) => {
      if (depInfo.versions.size > 1) {
        hasDifferences = true;
        const versions = Array.from(depInfo.versions.entries()).map(([version, info]) => ({
          version,
          packages: Array.from(info.packages),
          paths: Array.from(info.packages).map((pkg) => {
            const filePath = this.packageJsonFiles.find((file) => {
              const json = JSON.parse(fs.readFileSync(file, 'utf8'));
              return json.name === pkg;
            });
            return {
              package: pkg,
              // eslint-disable-next-line no-undef
              path: path.relative(process.cwd(), filePath),
            };
          }),
          usages: Array.from(info.usages),
        }));

        // Create comparison matrix
        const comparisons = [];
        for (let i = 0; i < versions.length; i++) {
          for (let j = i + 1; j < versions.length; j++) {
            const v1 = versions[i];
            const v2 = versions[j];
            const comparison = {
              version1: v1.version,
              version2: v2.version,
              packages1: v1.paths,
              packages2: v2.paths,
              semverDiff: this.compareDependencyVersions(v1.version, v2.version),
            };
            comparisons.push(comparison);
          }
        }

        conflictingDeps.push({
          name: dep,
          versions,
          comparisons,
        });
      }
    });

    if (!hasDifferences) {
      console.log(chalk.green('✓ No version differences found across packages\n'));
      return;
    }

    conflictingDeps.forEach(({ name, comparisons }) => {
      console.log(chalk.yellow(`\n${name}:`));

      comparisons.forEach(({ version1, version2, packages1, packages2, semverDiff }) => {
        console.log(chalk.cyan(`\n  Difference (${semverDiff || 'unknown'}):`));
        console.log(`    ${this.getVersionLabel(version1)} vs ${this.getVersionLabel(version2)}`);

        console.log('\n    Packages using', chalk.green(this.getVersionLabel(version1)), ':');
        packages1.forEach(({ package: pkg, path: filePath }) => {
          console.log(`      - ${chalk.blue(pkg)} (${chalk.gray(filePath)})`);
        });

        console.log('\n    Packages using', chalk.green(this.getVersionLabel(version2)), ':');
        packages2.forEach(({ package: pkg, path: filePath }) => {
          console.log(`      - ${chalk.blue(pkg)} (${chalk.gray(filePath)})`);
        });

        // Suggest recommended action based on version types
        console.log('\n    Recommended action:');
        if (version1.startsWith('workspace:') || version2.startsWith('workspace:')) {
          console.log(chalk.blue('    ℹ️  Workspace dependency - No action needed'));
        } else {
          switch (semverDiff) {
            case 'major':
              console.log(
                chalk.red('    ⚠️  Major version difference - Manual review recommended')
              );
              break;
            case 'minor':
              console.log(
                chalk.yellow('    ℹ️  Minor version difference - Consider updating to latest')
              );
              break;
            case 'patch':
              console.log(chalk.green('    ✓ Patch version difference - Safe to update to latest'));
              break;
            default:
              console.log(chalk.gray('    ℹ️  Version difference analysis not available'));
          }
        }
      });
    });

    // Print total counts
    console.log(chalk.bold('\nSummary Statistics:'));
    const totalComparisons = conflictingDeps.reduce((acc, dep) => acc + dep.comparisons.length, 0);
    console.log(`Dependencies with conflicts: ${conflictingDeps.length}`);
    console.log(`Total version comparisons: ${totalComparisons}`);

    // Show severity breakdown
    const severityCount = conflictingDeps.reduce((acc, dep) => {
      dep.comparisons.forEach(({ version1, version2, semverDiff }) => {
        if (version1.startsWith('workspace:') || version2.startsWith('workspace:')) {
          acc.workspace = (acc.workspace || 0) + 1;
        } else {
          acc[semverDiff || 'unknown'] = (acc[semverDiff || 'unknown'] || 0) + 1;
        }
      });
      return acc;
    }, {});

    console.log('\nSeverity breakdown:');
    if (severityCount.workspace)
      console.log(chalk.blue(`  Workspace dependencies: ${severityCount.workspace}`));
    if (severityCount.major) console.log(chalk.red(`  Major differences: ${severityCount.major}`));
    if (severityCount.minor)
      console.log(chalk.yellow(`  Minor differences: ${severityCount.minor}`));
    if (severityCount.patch)
      console.log(chalk.green(`  Patch differences: ${severityCount.patch}`));
    if (severityCount.unknown)
      console.log(chalk.gray(`  Unknown differences: ${severityCount.unknown}`));
  }

  displayResults(format = 'text') {
    // First show the version differences summary
    if (format === 'text') {
      this.displayVersionDifferences();
    }

    // Then show the full analysis
    if (format === 'json') {
      const output = {
        summary: {
          conflicts: Array.from(this.dependencyMap.entries())
            .filter(([, depInfo]) => depInfo.versions.size > 1)
            .map(([dep, depInfo]) => ({
              name: dep,
              versions: Array.from(depInfo.versions.entries()).map(([version, info]) => ({
                version,
                packages: Array.from(info.packages),
                paths: Array.from(info.packages).map((pkg) => {
                  const filePath = this.packageJsonFiles.find((file) => {
                    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
                    return json.name === pkg;
                  });
                  return {
                    package: pkg,
                    // eslint-disable-next-line no-undef
                    path: path.relative(process.cwd(), filePath),
                  };
                }),
                usages: Array.from(info.usages),
              })),
            })),
        },
        fullAnalysis: {},
      };

      this.dependencyMap.forEach((depInfo, dep) => {
        output.fullAnalysis[dep] = {
          versions: Object.fromEntries(
            Array.from(depInfo.versions.entries()).map(([version, info]) => [
              version,
              {
                packages: Array.from(info.packages),
                usages: Array.from(info.usages),
              },
            ])
          ),
          usedAsNormal: depInfo.usedAsNormal,
          usedAsPeer: depInfo.usedAsPeer,
        };
      });

      console.log(JSON.stringify(output, null, 2));
      return;
    }

    // Original detailed display
    console.log(chalk.bold('\nDetailed Dependencies Analysis:\n'));

    this.dependencyMap.forEach((depInfo, dep) => {
      console.log(chalk.blue(`\n${dep}:`));

      if (depInfo.versions.size > 1) {
        console.log(chalk.yellow('⚠️  Multiple versions detected:'));
      }

      const usageTypes = [];
      if (depInfo.usedAsNormal) usageTypes.push('normal dependency');
      if (depInfo.usedAsPeer) usageTypes.push('peer dependency');
      console.log(chalk.cyan(`Used as: ${usageTypes.join(' and ')}`));

      depInfo.versions.forEach((versionInfo, version) => {
        console.log(`  ${chalk.green(version)}`);
        console.log(`    Usage types:`);
        versionInfo.usages.forEach((usage) => {
          console.log(`      - ${usage}`);
        });
        console.log(`    Packages:`);
        versionInfo.packages.forEach((pkg) => {
          console.log(`      - ${pkg}`);
        });
      });
    });
  }

  async updateDependencies(dryRun = false) {
    console.log(chalk.bold('\nUpdating dependencies...\n'));

    // Read the main app's package.json
    const appPackageJson = JSON.parse(fs.readFileSync(this.appPackageJsonPath, 'utf8'));
    const appDependencies = {
      ...appPackageJson.dependencies,
      ...appPackageJson.devDependencies,
      ...appPackageJson.peerDependencies
    };

    const updates = [];

    // Process each package.json except the main app
    this.packageJsonFiles
      .filter(filePath => filePath !== this.appPackageJsonPath)
      .forEach(filePath => {
        const packageJson = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        let hasUpdates = false;

        // Helper function to update dependencies of a specific type
        const updateDependencySection = (section) => {
          if (!packageJson[section]) return;

          Object.entries(packageJson[section]).forEach(([dep, version]) => {
            // Skip workspace dependencies
            if (version.startsWith('workspace:')) return;
            
            // If the dependency exists in the main app, sync the version
            if (appDependencies[dep]) {
              const appVersion = appDependencies[dep];
              if (version !== appVersion) {
                if (!dryRun) {
                  packageJson[section][dep] = appVersion;
                }
                updates.push({
                  package: packageJson.name,
                  dependency: dep,
                  from: version,
                  to: appVersion,
                  type: section
                });
                hasUpdates = true;
              }
            }
          });
        };

        // Update all dependency sections
        updateDependencySection('dependencies');
        updateDependencySection('devDependencies');
        updateDependencySection('peerDependencies');

        // Write updated package.json if there were changes
        if (hasUpdates && !dryRun) {
          fs.writeFileSync(filePath, JSON.stringify(packageJson, null, 2) + '\n');
        }
      });

    // Display updates
    if (updates.length === 0) {
      console.log(chalk.green('No updates needed - all versions match the main app'));
    } else {
      updates.forEach(({ package: pkgName, dependency, from, to, type }) => {
        console.log(
          chalk.green(
            `${dryRun ? '[DRY RUN] Would update' : 'Updated'} ${dependency} in ${pkgName} (${type})\n` +
            `  ${chalk.red(from)} → ${chalk.green(to)}`
          )
        );
      });
    }

    return updates;
  }

  async run({
    update = false,
    dryRun = false,
    format = 'text',
    checkVersions = false,
    checkMissing = false,
  } = {}) {
    if (checkMissing) {
      this.findPackageJsonFiles();
      this.checkMissingDependencies();
      return;
    }

    if (checkVersions) {
      this.findPackageJsonFiles();
      this.analyzeDependencies();
      this.displayVersionDifferences();
      return;
    }

    if (update) {
      this.findPackageJsonFiles();
      this.analyzeDependencies();
      await this.updateDependencies(dryRun);
      return;
    }

    // Default behavior - show full analysis
    this.findPackageJsonFiles();
    this.analyzeDependencies();
    this.displayResults(format);
  }
}

// CLI implementation
const run = async () => {
  // eslint-disable-next-line no-undef
  const argv = yargs(hideBin(process.argv))
    .usage('Usage: $0 [options]')
    .option('app', {
      alias: 'a',
      describe: 'Path to main app package.json',
      type: 'string',
      default: './package.json',
    })
    .option('packages', {
      alias: 'p',
      describe: 'Path to packages directory',
      type: 'string',
      default: './packages',
    })
    .option('update', {
      alias: 'u',
      describe: 'Update dependencies to highest compatible version',
      type: 'boolean',
      default: false,
    })
    .option('dry-run', {
      alias: 'd',
      describe: 'Show what would be updated without making changes',
      type: 'boolean',
      default: false,
    })
    .option('check-versions', {
      alias: 'v',
      describe: 'Check for version differences between packages',
      type: 'boolean',
      default: false,
    })
    .option('check-missing', {
      alias: 'm',
      describe: 'Check for dependencies missing between app and packages',
      type: 'boolean',
      default: false,
    })
    .option('format', {
      alias: 'f',
      describe: 'Output format (text or json)',
      choices: ['text', 'json'],
      default: 'text',
    })
    .help()
    .alias('help', 'h')
    .example('$0 --check-versions', 'Show only version differences')
    .example('$0 --check-missing', 'Show missing dependencies')
    .example('$0 --update --dry-run', 'Show what would be updated').argv;

  // eslint-disable-next-line no-undef
  const appPackageJson = path.resolve(process.cwd(), argv.app);
  // eslint-disable-next-line no-undef
  const packagesDir = path.resolve(process.cwd(), argv.packages);

  // Validate paths
  if (!fs.existsSync(appPackageJson)) {
    console.error(chalk.red(`Error: Main package.json not found at ${appPackageJson}`));
    // eslint-disable-next-line no-undef
    process.exit(1);
  }

  if (!fs.existsSync(packagesDir)) {
    console.error(chalk.red(`Error: Packages directory not found at ${packagesDir}`));
    // eslint-disable-next-line no-undef
    process.exit(1);
  }

  const checker = new DependencyChecker(appPackageJson, packagesDir);
  await checker.run({
    update: argv.update,
    dryRun: argv.dryRun,
    format: argv.format,
    checkVersions: argv.checkVersions,
    checkMissing: argv.checkMissing,
  });
};

// Export both the class and run function
export { DependencyChecker, run as default };

// eslint-disable-next-line no-undef
if (process.argv[1] === import.meta.url.slice(7)) {
  run();
}
