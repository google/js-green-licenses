import {EventEmitter} from 'events';
import * as fs from 'fs';
import * as npmPackageArg from 'npm-package-arg';
import {promisify} from 'util';

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

// TODO(jinwoo): write tests for this class
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
  on(event: 'end', listener: () => void): this;
  // tslint:disable:no-any The parent `EventEmitter` uses ...args: any[]
  on(event: 'non-green-license'|'end',
     listener: ((...args: any[]) => void)): this {
    return super.on(event, listener);
  }
  // tsline:enable

  emit(event: 'non-green-license', arg: NonGreenLicense): boolean;
  emit(event: 'end'): boolean;
  emit(event: 'non-green-license'|'end', arg?: NonGreenLicense): boolean {
    return arg ? super.emit(event, arg) : super.emit(event);
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
      console.error(`got error for ${spec}:`, err);
      this.failedPackages.add(spec);
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

  async checkLocalPackageJson(packageJsonFile: string): Promise<void> {
    this.reset();
    const content = await fsReadFile(packageJsonFile, 'utf8');
    const json: PackageJson = ensurePackageJson(JSON.parse(content));
    const packageAndVersion = `${json.name}@${json.version}`;
    await this.checkLicensesForDeps(json.dependencies, packageAndVersion);
    if (this.opts.dev) {
      await this.checkLicensesForDeps(json.devDependencies, packageAndVersion);
    }
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
}
