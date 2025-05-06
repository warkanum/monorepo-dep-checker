import fs, { type Dirent } from "fs";
import path from "path";
import chalk from "chalk";
import semver from "semver";

interface PackageJson {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface RunOptions {
  update?: boolean;
  dryRun?: boolean;
  format?: "text" | "json";
  checkVersions?: boolean;
  checkMissing?: boolean;
}

interface VersionInfo {
  packages: Set<string>;
  usages: Set<string>;
}

interface DependencyInfo {
  versions: Map<string, VersionInfo>;
  usedAsNormal: boolean;
  usedAsPeer: boolean;
}

interface PackagePathInfo {
  package: string;
  path: string;
}

interface DependencyComparison {
  version1: string;
  version2: string;
  packages1: PackagePathInfo[];
  packages2: PackagePathInfo[];
  semverDiff: string;
}

interface ConflictingDep {
  name: string;
  versions: {
    version: string;
    packages: string[];
    paths: PackagePathInfo[];
    usages: string[];
  }[];
  comparisons: DependencyComparison[];
}

interface DependencyUpdate {
  package: string;
  dependency: string;
  from: string;
  to: string;
  type: string;
}

interface MissingDepsInfo {
  path: string;
  missing: Array<{ name: string; version: string }>;
  extraDeps: Array<{ name: string; version: string }>;
}

type DependencyTypes = "dependencies" | "devDependencies" | "peerDependencies";

class DependencyChecker {
  private readonly appPackageJsonPath: string;
  private readonly packagesInput: string;
  private packageJsonFiles: string[];
  private dependencyMap: Map<string, DependencyInfo>;
  private workspacePackages: Set<string>;

  constructor(appPackageJsonPath: string, packagesInput: string) {
    this.appPackageJsonPath = appPackageJsonPath;
    this.packagesInput = packagesInput;
    this.packageJsonFiles = [];
    this.dependencyMap = new Map();
    this.workspacePackages = new Set();
  }

  private findWorkspacePackages(): void {
    const paths = this.packagesInput.split(",").map((p) => p.trim());

    paths.forEach((inputPath) => {
      if (fs.statSync(inputPath).isDirectory()) {
        const entries = fs.readdirSync(inputPath, { withFileTypes: true });
        entries.forEach((entry: Dirent) => {
          if (entry.isDirectory()) {
            const packageJsonPath = path.join(
              inputPath,
              entry.name,
              "package.json"
            );
            if (fs.existsSync(packageJsonPath)) {
              const packageJson = JSON.parse(
                fs.readFileSync(packageJsonPath, "utf8")
              ) as PackageJson;
              this.workspacePackages.add(packageJson.name);
            }
          }
        });
      } else if (inputPath.endsWith("package.json")) {
        const packageJson = JSON.parse(
          fs.readFileSync(inputPath, "utf8")
        ) as PackageJson;
        this.workspacePackages.add(packageJson.name);
      }
    });
  }

  private findPackageJsonFiles(): void {
    this.packageJsonFiles = [this.appPackageJsonPath];
    const paths = this.packagesInput.split(",").map((p) => p.trim());

    paths.forEach((inputPath) => {
      if (fs.statSync(inputPath).isDirectory()) {
        const entries = fs.readdirSync(inputPath, { withFileTypes: true });
        entries.forEach((entry: Dirent) => {
          if (entry.isDirectory()) {
            const packageJsonPath = path.join(
              inputPath,
              entry.name,
              "package.json"
            );
            if (fs.existsSync(packageJsonPath)) {
              this.packageJsonFiles.push(packageJsonPath);
            }
          }
        });
      } else if (inputPath.endsWith("package.json")) {
        this.packageJsonFiles.push(inputPath);
      }
    });
  }

  private isWorkspaceDep(version?: string): boolean {
    return !!version && (version.startsWith("workspace:") || version === "*");
  }

  private isWorkspacePackage(packageName: string): boolean {
    return this.workspacePackages.has(packageName);
  }

  private shouldIncludeDependency(
    depName: string,
    version: string,
    packageJson: PackageJson
  ): boolean {
    if (this.isWorkspaceDep(version)) return false;
    if (this.isWorkspacePackage(depName)) return false;

    const allWorkspaceDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
      ...packageJson.peerDependencies,
    };

    return !Object.entries(allWorkspaceDeps).some(
      ([name, ver]) => name === depName && this.isWorkspaceDep(ver)
    );
  }

  private getSemverVersion(version: string): string | null {
    if (version.startsWith("workspace:")) {
      const workspaceVersion = version.replace("workspace:", "");
      if (workspaceVersion === "*") return null;
      if (semver.valid(workspaceVersion)) return workspaceVersion;
      return null;
    }
  
    if (version === "*" || version === "latest") return null;
  
    // Strip ALL range operators (^, ~, >=, >, <=, <) and any spaces after them
    const cleanVersion = version.replace(/^[~^<>=]+\s*/g, "");
  
    try {
      if (semver.valid(cleanVersion)) return cleanVersion;
      return null;
    } catch {
      return null;
    }
  }

  private checkMissingDependencies(): void {
    console.log(chalk.bold("\nChecking for missing dependencies...\n"));

    this.findWorkspacePackages();

    const appPackageJson = JSON.parse(
      fs.readFileSync(this.appPackageJsonPath, "utf8")
    ) as PackageJson;
    const appDeps = {
      ...appPackageJson.dependencies,
      ...appPackageJson.devDependencies,
      ...appPackageJson.peerDependencies,
    };

    const missingDeps = new Map<string, MissingDepsInfo>();
    const uniqueMissingDeps = new Set<string>();
    const uniqueExtraDeps = new Set<string>();

    this.packageJsonFiles
      .filter((file) => file !== this.appPackageJsonPath)
      .forEach((filePath) => {
        const packageJson = JSON.parse(
          fs.readFileSync(filePath, "utf8")
        ) as PackageJson;
        const packageName = packageJson.name;

        const packageDeps = {
          ...packageJson.dependencies,
          ...packageJson.peerDependencies,
        };

        const missing: Array<{ name: string; version: string }> = [];
        const extraDeps: Array<{ name: string; version: string }> = [];

        Object.entries(packageDeps).forEach(([dep, version]) => {
          if (
            (!appDeps[dep] &&
              this.shouldIncludeDependency(dep, version, packageJson)) ||
            (packageJson.peerDependencies?.[dep] && !appDeps[dep])
          ) {
            missing.push({ name: dep, version });
            uniqueMissingDeps.add(dep);
          }
        });

        Object.entries(appDeps).forEach(([dep, version]) => {
          if (
            !packageDeps[dep] &&
            this.shouldIncludeDependency(dep, version, appPackageJson)
          ) {
            extraDeps.push({ name: dep, version });
            uniqueExtraDeps.add(dep);
          }
        });

        if (missing.length > 0 || extraDeps.length > 0) {
          missingDeps.set(packageName, {
            path: path.relative(process.cwd(), filePath),
            missing,
            extraDeps,
          });
        }
      });

    if (missingDeps.size === 0) {
      console.log(
        chalk.green("✓ All dependencies are properly synchronized\n")
      );
      return;
    }

    missingDeps.forEach(
      ({ path: pkgPath, missing, extraDeps }, packageName) => {
        if (missing.length > 0 || extraDeps.length > 0) {
          console.log(
            chalk.yellow(`\n${packageName} (${chalk.gray(pkgPath)}):`)
          );

          if (missing.length > 0) {
            console.log(chalk.red("  Missing from main app:"));
            missing.forEach(({ name, version }) => {
              console.log(`    - ${name}@${version}`);
            });
          }

          if (extraDeps.length > 0) {
            console.log(chalk.blue("  Not used by package but in main app:"));
            extraDeps.forEach(({ name, version }) => {
              console.log(`    - ${name}@${version}`);
            });
          }
        }
      }
    );

    if (uniqueMissingDeps.size > 0 || uniqueExtraDeps.size > 0) {
      console.log(chalk.bold("\nSummary:"));
      console.log(`Packages with dependency mismatches: ${missingDeps.size}`);
      if (uniqueMissingDeps.size > 0) {
        console.log(
          chalk.red(
            `Unique dependencies missing from main app: ${uniqueMissingDeps.size}`
          )
        );
        console.log(
          chalk.gray("  " + Array.from(uniqueMissingDeps).join(", "))
        );
      }
      if (uniqueExtraDeps.size > 0) {
        console.log(
          chalk.blue(
            `Unique unused dependencies from main app: ${uniqueExtraDeps.size}`
          )
        );
        console.log(chalk.gray("  " + Array.from(uniqueExtraDeps).join(", ")));
      }
    }
  }

  private compareDependencyVersions(
    version1: string,
    version2: string
  ): string {
    const v1 = this.getSemverVersion(version1);
    const v2 = this.getSemverVersion(version2);

    if (!v1 || !v2) return "unknown";

    try {
      const diff = semver.diff(v1, v2);
      return diff || "unknown";
    } catch {
      return "unknown";
    }
  }

  private getVersionLabel(version: string): string {
    if (version.startsWith("workspace:")) {
      return `${chalk.cyan("workspace:")}${version.slice(10)}`;
    }
    return version;
  }

  private analyzeDependencies(): void {
    this.findWorkspacePackages();

    this.packageJsonFiles.forEach((filePath) => {
      const packageJson = JSON.parse(
        fs.readFileSync(filePath, "utf8")
      ) as PackageJson;
      const normalDeps = packageJson.dependencies || {};
      const peerDeps = packageJson.peerDependencies || {};
      const devDeps = packageJson.devDependencies || {};
      const packageName = packageJson.name;
      const isMainApp = filePath === this.appPackageJsonPath;

      // Process all dependency types
      [
        { deps: normalDeps, type: "normal" },
        { deps: peerDeps, type: "peer" },
        { deps: devDeps, type: "dev" },
      ].forEach(({ deps, type }) => {
        Object.entries(deps).forEach(([dep, version]) => {
          if (!this.dependencyMap.has(dep)) {
            this.dependencyMap.set(dep, {
              versions: new Map(),
              usedAsNormal: false,
              usedAsPeer: false,
            });
          }

          const depInfo = this.dependencyMap.get(dep)!;
          if (!depInfo.versions.has(version)) {
            depInfo.versions.set(version, {
              packages: new Set(),
              usages: new Set(),
            });
          }

          const versionInfo = depInfo.versions.get(version)!;
          versionInfo.packages.add(packageName);
          versionInfo.usages.add(`${type}${isMainApp ? " (main app)" : ""}`);

          if (type === "normal") depInfo.usedAsNormal = true;
          if (type === "peer") depInfo.usedAsPeer = true;

          // Track workspace dependencies explicitly
          if (this.isWorkspaceDep(version)) {
            versionInfo.usages.add("workspace");
          }
        });
      });
    });
  }

  private displayVersionDifferences(): void {
    console.log(chalk.bold("\nVersion Differences Summary:\n"));

    let hasDifferences = false;
    const conflictingDeps: ConflictingDep[] = [];

    this.dependencyMap.forEach((depInfo, dep) => {
      if (depInfo.versions.size > 1) {
        hasDifferences = true;
        const versions = Array.from(depInfo.versions.entries()).map(
          ([version, info]) => ({
            version,
            packages: Array.from(info.packages),
            paths: Array.from(info.packages).map((pkg) => {
              const filePath = this.packageJsonFiles.find((file) => {
                const json = JSON.parse(
                  fs.readFileSync(file, "utf8")
                ) as PackageJson;
                return json.name === pkg;
              });
              return {
                package: pkg,
                path: path.relative(process.cwd(), filePath || ""),
              };
            }),
            usages: Array.from(info.usages),
          })
        );

        const comparisons: DependencyComparison[] = [];
        for (let i = 0; i < versions.length; i++) {
          for (let j = i + 1; j < versions.length; j++) {
            const v1 = versions[i];
            const v2 = versions[j];
            comparisons.push({
              version1: v1.version,
              version2: v2.version,
              packages1: v1.paths,
              packages2: v2.paths,
              semverDiff: this.compareDependencyVersions(
                v1.version,
                v2.version
              ),
            });
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
      console.log(
        chalk.green("✓ No version differences found across packages\n")
      );
      return;
    }

    conflictingDeps.forEach(({ name, comparisons }) => {
      console.log(chalk.yellow(`\n${name}:`));

      comparisons.forEach(
        ({ version1, version2, packages1, packages2, semverDiff }) => {
          console.log(
            chalk.cyan(`\n  Difference (${semverDiff || "unknown"}):`)
          );
          console.log(
            `    ${this.getVersionLabel(version1)} vs ${this.getVersionLabel(version2)}`
          );

          console.log(
            "\n    Packages using",
            chalk.green(this.getVersionLabel(version1)),
            ":"
          );
          packages1.forEach(({ package: pkg, path: filePath }) => {
            console.log(`      - ${chalk.blue(pkg)} (${chalk.gray(filePath)})`);
          });

          console.log(
            "\n    Packages using",
            chalk.green(this.getVersionLabel(version2)),
            ":"
          );
          packages2.forEach(({ package: pkg, path: filePath }) => {
            console.log(`      - ${chalk.blue(pkg)} (${chalk.gray(filePath)})`);
          });

          console.log("\n    Recommended action:");
          if (
            version1.startsWith("workspace:") ||
            version2.startsWith("workspace:")
          ) {
            console.log(
              chalk.blue("    ℹ️  Workspace dependency - No action needed")
            );
          } else {
            switch (semverDiff) {
              case "major":
                console.log(
                  chalk.red(
                    "    ⚠️  Major version difference - Manual review recommended"
                  )
                );
                break;
              case "minor":
                console.log(
                  chalk.yellow(
                    "    ℹ️  Minor version difference - Consider updating to latest"
                  )
                );
                break;
              case "patch":
                console.log(
                  chalk.green(
                    "    ✓ Patch version difference - Safe to update to latest"
                  )
                );
                break;
              default:
                console.log(
                  chalk.gray(
                    "    ℹ️  Version difference analysis not available"
                  )
                );
            }
          }
        }
      );
    });

    console.log(chalk.bold("\nSummary Statistics:"));
    const totalComparisons = conflictingDeps.reduce(
      (acc, dep) => acc + dep.comparisons.length,
      0
    );
    console.log(`Dependencies with conflicts: ${conflictingDeps.length}`);
    console.log(`Total version comparisons: ${totalComparisons}`);

    const severityCount: Record<string, number> = {};
    // biome-ignore lint/complexity/noForEach: <explanation>
    conflictingDeps.forEach((dep) => {
      dep.comparisons.forEach(({ version1, version2, semverDiff }) => {
        if (
          version1.startsWith("workspace:") ||
          version2.startsWith("workspace:")
        ) {
          severityCount.workspace = (severityCount.workspace || 0) + 1;
        } else {
          severityCount[semverDiff || "unknown"] =
            (severityCount[semverDiff || "unknown"] || 0) + 1;
        }
      });
    });

    console.log("\nSeverity breakdown:");
    if (severityCount.workspace)
      console.log(
        chalk.blue(`  Workspace dependencies: ${severityCount.workspace}`)
      );
    if (severityCount.major)
      console.log(chalk.red(`  Major differences: ${severityCount.major}`));
    if (severityCount.minor)
      console.log(chalk.yellow(`  Minor differences: ${severityCount.minor}`));
    if (severityCount.patch)
      console.log(chalk.green(`  Patch differences: ${severityCount.patch}`));
    if (severityCount.unknown)
      console.log(
        chalk.gray(`  Unknown differences: ${severityCount.unknown}`)
      );
  }

  private async updateDependencies(
    dryRun = false
  ): Promise<DependencyUpdate[]> {
    console.log(chalk.bold("\nUpdating dependencies...\n"));

    const appPackageJson = JSON.parse(
      fs.readFileSync(this.appPackageJsonPath, "utf8")
    ) as PackageJson;
    const appDependencies = {
      ...appPackageJson.dependencies,
      ...appPackageJson.devDependencies,
      ...appPackageJson.peerDependencies,
    };

    const updates: DependencyUpdate[] = [];

    this.packageJsonFiles
      .filter((filePath) => filePath !== this.appPackageJsonPath)
      .forEach((filePath) => {
        const packageJson = JSON.parse(
          fs.readFileSync(filePath, "utf8")
        ) as PackageJson;
        let hasUpdates = false;

        const updateDependencySection = (section: DependencyTypes): void => {
          if (!packageJson[section]) return;

          Object.entries(packageJson[section]!).forEach(([dep, version]) => {
            if (version.startsWith("workspace:")) return;

            if (appDependencies[dep]) {
              const appVersion = appDependencies[dep];
              // Extract just the version numbers for comparison
              const cleanCurrentVersion = version.replace(/^[~^<>=]+\s*/g, "");
              const cleanAppVersion = appVersion.replace(/^[~^<>=]+\s*/g, "");

              if (cleanCurrentVersion !== cleanAppVersion) {
                // Extract the version prefix (operators and spaces)
                const versionPrefix = version.match(/^[~^<>=]+\s*/)?.[0] || '';
                
                // Create new version string with original prefix but updated version number
                const newVersion = versionPrefix + cleanAppVersion;
                
                if (!dryRun) {
                  packageJson[section]![dep] = newVersion;
                }
                
                updates.push({
                  package: packageJson.name,
                  dependency: dep,
                  from: version,
                  to: newVersion,
                  type: section,
                });
                
                hasUpdates = true;
              }
            }
          });
        };

        updateDependencySection("dependencies");
        updateDependencySection("devDependencies");
        updateDependencySection("peerDependencies");

        if (hasUpdates && !dryRun) {
          fs.writeFileSync(
            filePath,
            JSON.stringify(packageJson, null, 2) + "\n"
          );
        }
      });

    if (updates.length === 0) {
      console.log(
        chalk.green("No updates needed - all versions match the main app")
      );
    } else {
      updates.forEach(({ package: pkgName, dependency, from, to, type }) => {
        console.log(
          chalk.green(
            `${dryRun ? "[DRY RUN] Would update" : "Updated"} ${dependency} in ${pkgName} (${type})\n` +
              `  ${chalk.red(from)} → ${chalk.green(to)}`
          )
        );
      });
    }

    return updates;
  }

  private displayResults(format: "text" | "json" = "text"): void {
    if (format === "json") {
      const output = {
        summary: {
          conflicts: Array.from(this.dependencyMap.entries())
            .filter(([, depInfo]) => depInfo.versions.size > 1)
            .map(([dep, depInfo]) => ({
              name: dep,
              versions: Array.from(depInfo.versions.entries()).map(
                ([version, info]) => ({
                  version,
                  packages: Array.from(info.packages),
                  paths: Array.from(info.packages).map((pkg) => {
                    const filePath = this.packageJsonFiles.find((file) => {
                      const json = JSON.parse(
                        fs.readFileSync(file, "utf8")
                      ) as PackageJson;
                      return json.name === pkg;
                    });
                    return {
                      package: pkg,
                      path: path.relative(process.cwd(), filePath || ""),
                    };
                  }),
                  usages: Array.from(info.usages),
                  isWorkspace: this.isWorkspaceDep(version),
                })
              ),
            })),
        },
        fullAnalysis: Object.fromEntries(
          Array.from(this.dependencyMap.entries()).map(([dep, depInfo]) => [
            dep,
            {
              versions: Object.fromEntries(
                Array.from(depInfo.versions.entries()).map(
                  ([version, info]) => [
                    version,
                    {
                      packages: Array.from(info.packages),
                      usages: Array.from(info.usages),
                      isWorkspace: this.isWorkspaceDep(version),
                    },
                  ]
                )
              ),
              usedAsNormal: depInfo.usedAsNormal,
              usedAsPeer: depInfo.usedAsPeer,
            },
          ])
        ),
      };

      console.log(JSON.stringify(output, null, 2));
      return;
    }

    if (format === "text") {
      this.displayVersionDifferences();
      return;
    }

    const output = {
      summary: {
        conflicts: Array.from(this.dependencyMap.entries())
          .filter(([, depInfo]) => depInfo.versions.size > 1)
          .map(([dep, depInfo]) => ({
            name: dep,
            versions: Array.from(depInfo.versions.entries()).map(
              ([version, info]) => ({
                version,
                packages: Array.from(info.packages),
                paths: Array.from(info.packages).map((pkg) => {
                  const filePath = this.packageJsonFiles.find((file) => {
                    const json = JSON.parse(
                      fs.readFileSync(file, "utf8")
                    ) as PackageJson;
                    return json.name === pkg;
                  });
                  return {
                    package: pkg,
                    path: path.relative(process.cwd(), filePath || ""),
                  };
                }),
                usages: Array.from(info.usages),
              })
            ),
          })),
      },
      fullAnalysis: Object.fromEntries(
        Array.from(this.dependencyMap.entries()).map(([dep, depInfo]) => [
          dep,
          {
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
          },
        ])
      ),
    };

    console.log(JSON.stringify(output, null, 2));
  }

  public async run(options: RunOptions = {}): Promise<void> {
    const {
      update = false,
      dryRun = false,
      format = "text",
      checkVersions = false,
      checkMissing = false,
    } = options;

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

    this.findPackageJsonFiles();
    this.analyzeDependencies();
    this.displayResults(format);
  }
}

export { DependencyChecker };
