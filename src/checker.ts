// Copyright 2017 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { EventEmitter } from 'events';
import * as fs from 'fs';
import npmPackageArg from 'npm-package-arg';
import packageJson from 'package-json';
import * as path from 'path';
import spdxCorrect from 'spdx-correct';
import spdxSatisfies from 'spdx-satisfies';
import { inspect, promisify } from 'util';

import * as config from './config';
import { GitHubRepository } from './github';
import {
  Dependencies,
  ensurePackageJson,
  PackageJson,
} from './package-json-file';

export { GitHubRepository } from './github';

const fsAccess = promisify(fs.access);
const fsReadDir = promisify(fs.readdir);
const fsReadFile = promisify(fs.readFile);

// Valid license IDs defined in https://spdx.org/licenses/ must be used whenever
// possible. When adding new licenses, please consult the relevant documents.
const DEFAULT_GREEN_LICENSES = [
  'AFL-2.1',
  'AFL-3.0',
  'APSL-2.0',
  'Apache-1.1',
  'Apache-2.0',
  'Artistic-1.0',
  'Artistic-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'BSL-1.0',
  'CC-BY-1.0',
  'CC-BY-2.0',
  'CC-BY-2.5',
  'CC-BY-3.0',
  'CC-BY-4.0',
  'CC0-1.0',
  'CDDL-1.0',
  'CDDL-1.1',
  'CPL-1.0',
  'EPL-1.0',
  'FTL',
  'IPL-1.0',
  'ISC',
  'LGPL-2.0',
  'LGPL-2.1',
  'LGPL-3.0',
  'LPL-1.02',
  'MIT',
  'MPL-1.0',
  'MPL-1.1',
  'MPL-2.0',
  'MS-PL',
  'NCSA',
  'OpenSSL',
  'PHP-3.0',
  'Ruby',
  'Unlicense',
  'W3C',
  'Xnet',
  'ZPL-2.0',
  'Zend-2.0',
  'Zlib',
  'libtiff',
];

// options for constructing LicenseChecker
export interface LicenseCheckerOptions {
  dev?: boolean; // also check devDependencies
  verbose?: boolean; // verbose error outputs
}

// argument for 'non-green-license' event from LicenseChecker
export interface NonGreenLicense {
  packageName: string;
  version: string;
  licenseName: string | null;
  parentPackages: string[];
}

// argument for 'error' event from LicenseChecker
export interface CheckError {
  err: Error;
  packageName: string;
  versionSpec: string;
  parentPackages: string[];
}

export interface DefaultHandlerOptions {
  setExitCode?: boolean;
}

type EventType = 'non-green-license' | 'package.json' | 'end' | 'error';

export class LicenseChecker extends EventEmitter {
  // Cache for packageName@version's that are already processed.
  private readonly processedPackages: Set<string> = new Set();
  // Cache for packageName@version's that failed for fetching.
  private readonly failedPackages: Set<string> = new Set();
  // Local packages, for monorepo
  private readonly localPackages: Set<string> = new Set<string>();
  private readonly opts: LicenseCheckerOptions;
  private config: config.Config = {};
  // Licenses in this expression must be valid license IDs defined in
  // https://spdx.org/licenses/.
  private greenLicenseExpr = '';
  // List of license names that are not SPDX-conforming IDs but are allowed.
  private whitelistedLicenses: string[] = [];

  constructor({ dev = false, verbose = false }: LicenseCheckerOptions = {}) {
    super();
    this.opts = { dev, verbose };
  }

  on(
    event: 'non-green-license',
    listener: (arg: NonGreenLicense) => void
  ): this;
  // 'package.json' events are not emitted for remote packages.
  on(event: 'package.json', listener: (filePath: string) => void): this;
  on(event: 'end', listener: () => void): this;
  on(event: 'error', listener: (checkError: CheckError) => void): this;
  // tslint:disable-next-line:no-any `EventEmitter` uses ...args: any[]
  on(event: EventType, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  emit(event: 'non-green-license', arg: NonGreenLicense): boolean;
  emit(event: 'package.json', filePath: string): boolean;
  emit(event: 'end'): boolean;
  emit(event: 'error', checkError: CheckError): boolean;
  // tslint:disable-next-line:no-any `EventEmitter` uses ...args: any[]
  emit(event: EventType, ...args: any[]): boolean {
    return super.emit(event, ...args);
  }

  private init(cfg: config.Config | null): void {
    this.config = cfg || {};

    const greenLicenses = this.config.greenLicenses || DEFAULT_GREEN_LICENSES;
    const validGreenLicenses: string[] = [];
    const invalidGreenLicenses: string[] = [];
    for (const license of greenLicenses) {
      const corrected = this.correctLicenseName(license);
      if (corrected) {
        validGreenLicenses.push(corrected);
      } else {
        invalidGreenLicenses.push(license);
      }
    }
    this.greenLicenseExpr = `(${validGreenLicenses.join(' OR ')})`;
    this.whitelistedLicenses = invalidGreenLicenses;

    this.processedPackages.clear();
    this.failedPackages.clear();
  }

  private getLicense(pkgJson: PackageJson): string | null {
    // Some package.json files have incorrect license fields, and old packages
    // may have legacy licence field format. See
    // https://docs.npmjs.com/files/package.json#license for details. The code
    // below is a little complicated to deal with those cases.
    const license = pkgJson.license || pkgJson.licenses;
    if (!license) {
      if (pkgJson.private) {
        return 'private';
      }
      return null;
    }
    if (typeof license === 'string') return license;
    if (Array.isArray(license)) {
      const types = license.map(x => x.type).filter(x => !!x);
      return types.length === 1 ? types[0] : `(${types.join(' OR ')})`;
    }
    return license.type || null;
  }

  private correctLicenseName(license: string): string | null {
    const corrected = spdxCorrect(license);
    if (this.opts.verbose && corrected && corrected !== license) {
      console.warn(`Correcting ${license} to ${corrected}`);
    }
    return corrected;
  }

  private isPackageWhitelisted(packageName: string): boolean {
    return (
      !!this.config.packageWhitelist &&
      this.config.packageWhitelist.some(p => p === packageName)
    );
  }

  private isGreenLicense(license: string | null): boolean {
    if (!license) return false;

    const correctedName = this.correctLicenseName(license);
    // `license` is not a valid or correctable SPDX id. Check the whitelist.
    if (!correctedName) {
      return this.whitelistedLicenses.some(l => l === license);
    }

    try {
      return spdxSatisfies(correctedName, this.greenLicenseExpr);
    } catch (err) {
      // Most likely because license is not recognized. Just return false.
      if (this.opts.verbose) {
        console.error(err.message || err);
      }
      return false;
    }
  }

  private async checkLicenses(
    packageName: string,
    versionSpec: string,
    ...parents: string[]
  ): Promise<void> {
    const spec = `${packageName}@${versionSpec}`;
    if (this.failedPackages.has(spec)) return;

    // remove tilde/caret to check for an exact version, ^0.5.0-rc.0 becomes 0.5.0-rc.0
    const version = versionSpec.replace(/^[^~]/, '');
    // if the dependency is a local package then skip verification at this step. will be checked independently
    if (this.localPackages.has(`${packageName}@${version}`)) return;

    try {
      const json = await packageJson(packageName, {
        version: versionSpec,
        fullMetadata: true,
      });
      await this.checkPackageJson(json, packageName, ...parents);
    } catch (err) {
      this.failedPackages.add(spec);
      this.emit('error', {
        err,
        packageName,
        versionSpec,
        parentPackages: parents,
      });
    }
  }

  private async checkLicensesForDeps(
    deps: Dependencies | undefined,
    ...parents: string[]
  ): Promise<void> {
    if (!deps) return;
    for (const pkg of Object.keys(deps)) {
      const depVersion = deps[pkg];
      await this.checkLicenses(pkg, depVersion, ...parents);
    }
  }

  private async checkPackageJson(
    json: {},
    packageName: string | null,
    ...parents: string[]
  ): Promise<void> {
    const pj: PackageJson = ensurePackageJson(json);
    if (!packageName) {
      packageName = pj.name;
    }
    if (pj.name !== packageName) {
      console.warn(
        `Package name mismatch. Expected ${packageName}, but got ${pj.name}`
      );
    }
    const pkgVersion = pj.version;
    const packageAndVersion = `${packageName}@${pkgVersion}`;
    if (this.processedPackages.has(packageAndVersion)) return;
    this.processedPackages.add(packageAndVersion);

    if (this.isPackageWhitelisted(packageName)) {
      console.log(`${packageName} is whitelisted.`);
    } else {
      const license = this.getLicense(pj);
      if (!this.isGreenLicense(license)) {
        this.emit('non-green-license', {
          packageName,
          version: pkgVersion,
          licenseName: license,
          parentPackages: parents,
        });
      }
    }

    await this.checkLicensesForDeps(
      pj.dependencies,
      ...parents,
      packageAndVersion
    );
    if (this.opts.dev) {
      await this.checkLicensesForDeps(
        pj.devDependencies,
        ...parents,
        packageAndVersion
      );
    }
  }

  private async checkPackageJsonContent(content: string): Promise<void> {
    // tslint:disable-next-line:no-any `JSON.parse()` returns any
    let json: any = null;
    try {
      json = JSON.parse(content);
      await this.checkPackageJson(json, json.name);
    } catch (err) {
      const packageName = (json && json.name) || '(unknown package)';
      const versionSpec = (json && json.version) || '(unknown version)';
      this.emit('error', {
        err,
        packageName,
        versionSpec,
        parentPackages: [],
      });
    }
  }

  private async getLocalPackageJsonFiles(directory: string): Promise<string[]> {
    const packageJsons: string[] = [];
    const addPackageJson = async (dir: string) => {
      try {
        const pj = path.join(dir, 'package.json');
        await fsAccess(pj);
        packageJsons.push(pj);
      } catch {
        // package.json doesn't exist. Ignore.
      }
    };

    // Find the top-level package.json first.
    await addPackageJson(directory);

    // Find `packages/<name>/package.json` files in case this is a monorepo.
    try {
      const packages = path.join(directory, 'packages');
      const subpackages = await fsReadDir(packages);
      // This is a monorepo. Find package.json from each directory under
      // `packages`.
      for (const dir of subpackages) {
        await addPackageJson(path.join(packages, dir));
      }
    } catch {
      // The `packages` directory doesn't exist. Not a monorepo. Return just the
      // top-level package.json.
    }

    return packageJsons;
  }

  async checkLocalDirectory(directory: string): Promise<void> {
    this.init(await config.getLocalConfig(directory));
    const packageJsons = await this.getLocalPackageJsonFiles(directory);
    if (packageJsons.length === 0) {
      console.log('No package.json files have been found.');
    }
    for (const pj of packageJsons) {
      const content = await fsReadFile(pj, 'utf8');
      const json = JSON.parse(content);
      if (json && json.name && json.version) {
        this.localPackages.add(`${json.name}@${json.version}`);
      }
    }
    for (const pj of packageJsons) {
      this.emit('package.json', pj);
      const content = await fsReadFile(pj, 'utf8');
      await this.checkPackageJsonContent(content);
    }
    this.emit('end');
  }

  async checkRemotePackage(pkg: string): Promise<void> {
    // For checking remote packages, use config file in the current directory.
    this.init(await config.getLocalConfig(process.cwd()));
    const pkgArgs = npmPackageArg(pkg);
    const pkgType = pkgArgs.type;
    if (!['tag', 'version', 'range'].some(type => type === pkgType)) {
      throw new Error(`Unsupported package spec: ${pkg}`);
    }
    if (!pkgArgs.name || !pkgArgs.fetchSpec) {
      throw new Error(`Invalid package spec: ${pkg}`);
    }
    await this.checkLicenses(pkgArgs.name, pkgArgs.fetchSpec);
    this.emit('end');
  }

  /** @param prPath Must be in a form of <owner>/<repo>/pull/<id>. */
  prPathToGitHubRepoAndId(
    prPath: string
  ): { repo: GitHubRepository; prId: number } {
    const regexp = /^([^/]+)\/([^/]+)\/pull\/(\d+)$/;
    const matched = regexp.exec(prPath);
    if (!matched) {
      throw new Error(
        `Invalid github pull request path: ${prPath}. ` +
          'Must be in the form <owner>/<repo>/pull/<id>.'
      );
    }
    const [, owner, repoName, prId] = matched;
    return { repo: new GitHubRepository(owner, repoName), prId: Number(prId) };
  }

  async checkGitHubPR(
    repo: GitHubRepository,
    mergeCommitSha: string
  ): Promise<void> {
    this.init(await config.getGitHubConfig(repo, mergeCommitSha));
    const packageJsons = await repo.getPackageJsonFiles(mergeCommitSha);
    if (packageJsons.length === 0) {
      console.log('No package.json files have been found.');
    }
    for (const pj of packageJsons) {
      this.emit('package.json', pj.filePath);
      await this.checkPackageJsonContent(pj.content);
    }
    this.emit('end');
  }

  /** set default event handlers for CLI output. */
  setDefaultHandlers(options: DefaultHandlerOptions = {}): void {
    let nonGreenCount = 0;
    let errorCount = 0;
    this.on(
      'non-green-license',
      ({ packageName, version, licenseName, parentPackages }) => {
        nonGreenCount++;
        const licenseDisplay = licenseName || '(no license)';
        const packageAndVersion = `${packageName}@${version}`;
        console.log(`${licenseDisplay}: ${packageAndVersion}`);
        console.log(`  ${[...parentPackages, packageAndVersion].join(' -> ')}`);
        console.log();
      }
    )
      .on('package.json', filePath => {
        console.log(`Checking ${filePath}...`);
        console.log();
      })
      .on('error', ({ err, packageName, versionSpec, parentPackages }) => {
        errorCount++;
        const packageAndVersion = `${packageName}@${versionSpec}`;
        console.log(`Error while checking ${packageAndVersion}:`);
        console.log(`  ${[...parentPackages, packageAndVersion].join(' -> ')}`);
        console.log();
        console.log(`${inspect(err)}`);
        console.log();
      })
      .on('end', () => {
        if (nonGreenCount > 0 || errorCount > 0) {
          if (options.setExitCode) {
            process.exitCode = 1;
          }
          if (nonGreenCount > 0) {
            console.log(`${nonGreenCount} non-green licenses found.`);
          }
          if (errorCount > 0) {
            console.log(`${errorCount} errors found.`);
          }
        } else {
          console.log('All green!');
        }
      });
  }
}
