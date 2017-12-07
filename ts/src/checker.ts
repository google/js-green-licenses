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

import {EventEmitter} from 'events';
import * as fs from 'fs';
import * as npmPackageArg from 'npm-package-arg';
import {promisify} from 'util';

import {GitHubRepository} from './github';
import {GREEN_LICENSE_EXPR, WHITELISTED_LICENSES} from './licenses';
import {Dependencies, ensurePackageJson, PackageJson} from './package-json-file';

import packageJson = require('package-json');
import spdxCorrect = require('spdx-correct');
import spdxSatisfies = require('spdx-satisfies');

const fsReadFile = promisify(fs.readFile);

// options for constructing LicenseChecker
export interface LicenseCheckerOptions {
  dev?: boolean;      // also check devDependencies
  verbose?: boolean;  // verbose error outputs
}

// argument for 'non-green-license' event from LicenseChecker
export interface NonGreenLicense {
  packageName: string;
  version: string;
  licenseName: string|null;
  parentPackages: string[];
}

// argument for 'error' event from LicenseChecker
export interface CheckError {
  err: Error;
  packageName: string;
  versionSpec: string;
  parentPackages: string[];
}

type EventType = 'non-green-license'|'package.json'|'end'|'error';

export class LicenseChecker extends EventEmitter {
  // Cache for packageName@version's that are already processed.
  private readonly processedPackages: Set<string> = new Set();
  // Cache for packageName@version's that failed for fetching.
  private readonly failedPackages: Set<string> = new Set();
  private readonly opts: LicenseCheckerOptions;

  constructor({dev = false, verbose = false}: LicenseCheckerOptions) {
    super();
    this.opts = {dev, verbose};
  }

  on(event: 'non-green-license',
     listener: (arg: NonGreenLicense) => void): this;
  // 'package.json' events are emitted only for github PR checkings.
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

  private reset(): void {
    this.processedPackages.clear();
    this.failedPackages.clear();
  }

  private getLicense(pkgJson: PackageJson): string|null {
    // Some package.json files have incorrect license fields, and old packages
    // may have legacy licence field format. See
    // https://docs.npmjs.com/files/package.json#license for details. The code
    // below is a little complicated to deal with those cases.
    const license = pkgJson.license || pkgJson.licenses;
    if (!license) return null;
    if (typeof license === 'string') return license;
    if (Array.isArray(license)) {
      const types = license.map(x => x.type).filter(x => !!x);
      return types.length === 1 ? types[0] : `(${types.join(' OR ')})`;
    }
    return license.type || null;
  }

  private correctLicenseName(license: string): string|null {
    const corrected = spdxCorrect(license);
    if (this.opts.verbose && corrected && corrected !== license) {
      console.warn(`Correcting ${license} to ${corrected}`);
    }
    return corrected;
  }

  private isGreenLicense(license: string|null): boolean {
    if (!license) return false;

    const correctedName = this.correctLicenseName(license);
    // `license` is not a valid or correctable SPDX id. Check the whitelist.
    if (!correctedName) return WHITELISTED_LICENSES.includes(license);

    try {
      return spdxSatisfies(correctedName, GREEN_LICENSE_EXPR);
    } catch (err) {
      // Most likely because license is not recognized. Just return false.
      if (this.opts.verbose) {
        console.error(err.message || err);
      }
      return false;
    }
  }

  private async checkLicenses(
      packageName: string, versionSpec: string,
      ...parents: string[]): Promise<void> {
    const spec = `${packageName}@${versionSpec}`;
    if (this.failedPackages.has(spec)) return;

    let json: PackageJson;
    try {
      json = ensurePackageJson(await packageJson(
          packageName, {version: versionSpec, fullMetadata: true}));
    } catch (err) {
      this.failedPackages.add(spec);
      this.emit('error', {
        err,
        packageName,
        versionSpec,
        parentPackages: parents,
      });
      return;
    }
    const pkgVersion = json.version;
    const packageAndVersion = `${packageName}@${pkgVersion}`;
    if (this.processedPackages.has(packageAndVersion)) return;
    this.processedPackages.add(packageAndVersion);

    const license = this.getLicense(json);
    if (!this.isGreenLicense(license)) {
      this.emit('non-green-license', {
        packageName,
        version: pkgVersion,
        licenseName: license,
        parentPackages: parents,
      });
    }

    await this.checkLicensesForDeps(
        json.dependencies, ...parents, packageAndVersion);
    if (this.opts.dev) {
      await this.checkLicensesForDeps(
          json.devDependencies, ...parents, packageAndVersion);
    }
  }

  private async checkLicensesForDeps(
      deps: Dependencies|undefined, ...parents: string[]): Promise<void> {
    if (!deps) return;
    for (const pkg of Object.keys(deps)) {
      const depVersion = deps[pkg];
      await this.checkLicenses(pkg, depVersion, ...parents);
    }
  }

  private async checkPackageJsonContent(content: string): Promise<void> {
    const json: PackageJson = ensurePackageJson(JSON.parse(content));
    const packageAndVersion = `${json.name}@${json.version}`;
    await this.checkLicensesForDeps(json.dependencies, packageAndVersion);
    if (this.opts.dev) {
      await this.checkLicensesForDeps(json.devDependencies, packageAndVersion);
    }
  }

  async checkLocalPackageJson(packageJsonFile: string): Promise<void> {
    this.reset();
    const content = await fsReadFile(packageJsonFile, 'utf8');
    await this.checkPackageJsonContent(content);
    this.emit('end');
  }

  async checkRemotePackage(pkg: string): Promise<void> {
    this.reset();
    const pkgArgs = npmPackageArg(pkg);
    const pkgType = pkgArgs.type;
    if (!['tag', 'version', 'range'].includes(pkgType)) {
      throw new Error(`Unsupported package spec: ${pkg}`);
    }
    if (!pkgArgs.name || !pkgArgs.fetchSpec) {
      throw new Error(`Invalid package spec: ${pkg}`);
    }
    await this.checkLicenses(pkgArgs.name, pkgArgs.fetchSpec);
    this.emit('end');
  }

  /** @param prPath Must be in a form of <owner>/<repo>/pull/<id>. */
  prPathToGitHubRepoAndId(prPath: string):
      {repo: GitHubRepository; prId: number;} {
    const regexp = /^([^/]+)\/([^/]+)\/pull\/(\d+)$/;
    const matched = regexp.exec(prPath);
    if (!matched) {
      throw new Error(
          `Invalid github pull request path: ${prPath}. ` +
          'Must be in the form <owner>/<repo>/pull/<id>.');
    }
    const [, owner, repoName, prId] = matched;
    return {repo: new GitHubRepository(owner, repoName), prId: Number(prId)};
  }

  async checkGithubPR(repo: GitHubRepository, mergeCommitSha: string):
      Promise<void> {
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
}
