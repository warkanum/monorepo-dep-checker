import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { DependencyChecker } from './lib';
export {DependencyChecker}

const cli = async () => {
  const yargsInstance = yargs(hideBin(process.argv))
    .usage('Usage: $0 [options]')
    .option('app', {
      alias: 'a',
      describe: 'Path to main app package.json',
      type: 'string',
      default: './package.json',
    })
    .option('packages', {
      alias: 'p',
      describe: 'Comma-separated list of paths to package.json files or directories containing packages',
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
      type:'string'
    })
    .example('$0 --check-versions', 'Show only version differences')
    .example('$0 --check-missing', 'Show missing dependencies')
    .example('$0 --update --dry-run', 'Show what would be updated')
    .example('$0 --packages ./packages,./other-packages', 'Check multiple package directories')
    .example('$0 --packages ./pkg1/package.json,./pkg2/package.json', 'Check specific package.json files')
    .example('$0 --packages ./packages,./other/package.json', 'Mix of directories and files')
    .epilogue('For more information, visit: https://github.com/warkanum/monorepo-dep-checker')
    .wrap(Math.min(120, process.stdout.columns))
    .version()
    .help()
    .alias('help', 'h')
    .alias('version', 'V');

  // Parse arguments
  const argv = await yargsInstance.parse();

  // If help or version was requested, exit early
  // yargs.argv internally tracks if help or version was requested
  if (argv.help || argv.version) {
    return;
  }

  // Resolve paths
  const appPackageJson = path.resolve(process.cwd(), argv.app);
  const packagesInput = argv.packages;

  // Validate main app package.json
  if (!fs.existsSync(appPackageJson)) {
    console.error(chalk.red(`Error: Main package.json not found at ${appPackageJson}`));
    process.exit(1);
  }

  // Validate all package paths
  const paths = packagesInput.split(',').map(p => path.resolve(process.cwd(), p.trim()));
  let hasErrors = false;

  // biome-ignore lint/complexity/noForEach: Ease of reading and preference
  paths.forEach(inputPath => {
    try {
      if (!fs.existsSync(inputPath)) {
        console.error(chalk.red(`Error: Path not found: ${inputPath}`));
        hasErrors = true;
      } else {
        const stats = fs.statSync(inputPath);
        if (!stats.isDirectory() && !(stats.isFile() && inputPath.endsWith('package.json'))) {
          console.error(chalk.red(`Error: Path must be a directory or package.json file: ${inputPath}`));
          hasErrors = true;
        }
      }
    } catch (error:any) {
      console.error(chalk.red(`Error accessing path ${inputPath}: ${error?.message}`));
      hasErrors = true;
    }
  });

  if (hasErrors) {
    process.exit(1);
  }

  // Validate mutually exclusive options
  const exclusiveOptions = ['update', 'check-versions', 'check-missing']
    .filter(opt => argv[opt])
    .length;

  if (exclusiveOptions > 1) {
    console.error(chalk.red('Error: --update, --check-versions, and --check-missing are mutually exclusive'));
    process.exit(1);
  }

  // Validate dry-run is only used with update
  if (argv.dryRun && !argv.update) {
    console.error(chalk.yellow('Warning: --dry-run has no effect without --update'));
  }

  const checker = new DependencyChecker(appPackageJson, packagesInput);
  
  try {
    await checker.run({
      update: argv.update,
      dryRun: argv.dryRun,
      format: argv.format as any,
      checkVersions: argv.checkVersions,
      checkMissing: argv.checkMissing,
    });
  } catch (error:any) {
    console.error(chalk.red('Error during execution:'));
    console.error(error?.message);
    if (argv.format === 'json') {
      console.log(JSON.stringify({ error: error?.message }));
    }
    process.exit(1);
  }
};

// Export both the CLI function and run it if this is the main module
export { cli as default };

if (process.argv[1] === import.meta.url.slice(7)) {
  cli().catch(error => {
    console.error(chalk.red('Unexpected error:'));
    console.error(error);
    process.exit(1);
  });
}

