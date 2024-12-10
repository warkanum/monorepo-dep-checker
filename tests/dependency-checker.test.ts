import { describe, test, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { DependencyChecker } from '../src/lib';

// Mock console.log to prevent output during tests
const _log = console.log
console.log = vi.fn();
console.error = vi.fn();

describe('DependencyChecker', () => {
  const appPackageJsonPath = path.resolve(__dirname, './app/package.json');
  const packagesPath = path.resolve(__dirname, './packages');
  let checker: DependencyChecker;

  beforeEach(() => {
    checker = new DependencyChecker(appPackageJsonPath, packagesPath);
    // Clear console mocks before each test
    console.log = vi.fn();
    console.error = vi.fn();
  });

  test('should correctly identify version differences', async () => {
    await checker.run({ checkVersions: true });
    
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Version Differences Summary')
    );

    // Verify major version difference detection
    const calls = (console.log as jest.Mock).mock.calls.map(call => call[0]).join('\n');
    expect(calls).toContain('Major version difference');
  });

  test('should detect missing dependencies', async () => {
    await checker.run({ checkMissing: true });
    
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Checking for missing dependencies')
    );
  });

  test('should handle update with dry run', async () => {
    const originalContent = fs.readFileSync(
      path.join(packagesPath, 'pkg1/package.json'),
      'utf8'
    );
    
    await checker.run({ update: true, dryRun: true });
    
    const newContent = fs.readFileSync(
      path.join(packagesPath, 'pkg1/package.json'),
      'utf8'
    );
    
    expect(originalContent).toBe(newContent);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('[DRY RUN]')
    );
  });

  test('should output JSON format correctly', async () => {
    const consoleSpy = vi.spyOn(console, 'log');
    
    await checker.run({ format: 'json' });
    
    const lastCall = consoleSpy.mock.calls[consoleSpy.mock.calls.length - 1][0];
    
    expect(() => JSON.parse(lastCall)).not.toThrow();
    const output = JSON.parse(lastCall);
    expect(output).toHaveProperty('summary');
    expect(output).toHaveProperty('fullAnalysis');
  });

  test('should handle multiple package paths', async () => {
    const multiPathChecker = new DependencyChecker(
      appPackageJsonPath,
      `${packagesPath},${path.join(packagesPath, 'pkg1/package.json')}`
    );
    
    await multiPathChecker.run({ checkVersions: true });
    
    // Verify that dependencies from both paths are processed
    const calls = (console.log as jest.Mock).mock.calls.map(call => call[0]).join('\n');
    expect(calls).toContain('Version Differences Summary');
    expect(calls).toContain('pkg1');
  });

  test('should identify workspace dependencies', async () => {
    // First create test files with workspace deps
    const pkg3Path = path.join(packagesPath, 'pkg3/package.json');
    const pkg3Content = {
      name: "pkg3",
      version: "1.0.0",
      dependencies: {
        "workspace-pkg": "workspace:*",
        "react": "^18.2.0"
      }
    };

     // Ensure directory exists
     fs.mkdirSync(path.dirname(pkg3Path), { recursive: true });
     fs.writeFileSync(pkg3Path, JSON.stringify(pkg3Content, null, 2));

    // Run with default options to get full analysis
    await checker.run({ format: 'json' });
    
    // Get the last console.log call
    const calls = (console.log as jest.Mock).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    
    const lastCall = calls[calls.length - 1][0];
    expect(() => JSON.parse(lastCall)).not.toThrow();
    
    const output = JSON.parse(lastCall);
    expect(output.fullAnalysis).toHaveProperty('workspace-pkg');
    
    // Clean up
    fs.unlinkSync(pkg3Path);
  });


  test('should handle errors gracefully', async () => {
    const invalidChecker = new DependencyChecker(
      'invalid/path/package.json',
      packagesPath
    );
    
    await expect(invalidChecker.run()).rejects.toThrow();
  });

  test('should handle empty package directories', async () => {
    // Create a temporary empty directory
    const emptyDir = path.join(__dirname, 'empty');
    fs.mkdirSync(emptyDir, { recursive: true });
    
    const emptyChecker = new DependencyChecker(appPackageJsonPath, emptyDir);
    await emptyChecker.run({ checkVersions: true });
    
    // Clean up
    fs.rmdirSync(emptyDir);
    
    // Verify appropriate handling of empty directory
    const calls = (console.log as jest.Mock).mock.calls.map(call => call[0]).join('\n');
    expect(calls).toContain('No version differences found');
  });

  test('should detect version conflicts correctly', async () => {
    await checker.run({ checkVersions: true });
    
    const calls = (console.log as jest.Mock).mock.calls.map(call => call[0]).join('\n');
    expect(calls).toMatch(/Difference \((?:major|minor|patch)\)/);
  });


});