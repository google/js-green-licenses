#!/usr/bin/env node

import {ArgumentParser} from 'argparse';
import * as fs from 'fs';
import * as npmPackageArg from 'npm-package-arg';
import {promisify} from 'util';

import {GREEN_LICENSE_EXPR, WHITELISTED_LICENSES} from './licenses';
import {Dependencies, ensurePackageJson, PackageJson} from './package-json-file';

import packageJson = require('package-json');
import spdxCorrect = require('spdx-correct');
import spdxSatisfies = require('spdx-satisfies');

const fsReadFile = promisify(fs.readFile);

const argParser = new ArgumentParser({
  version: '0.1.0',
  addHelp: true,
  description: 'License checker for npm modules',
});
argParser.addArgument(['package'], {
  help: 'Package name to check license for. ' +
      'Can include version spec after @. E.g. foo@^1.2.3. Otherwise latest.',
  metavar: '<package or package@version>',
  type: 'string',
  nargs: '?',
});
argParser.addArgument(['--file', '-f'], {
  help: 'Check local package.json file instead of public npm.',
  metavar: '<package.json>',
  type: 'string',
  nargs: 1,
});
argParser.addArgument(['--dev'], {
  help: 'Also check devDependencies.',
  nargs: 0,
});
argParser.addArgument(['--verbose'], {
  help: 'Verbose error outputs.',
  nargs: 0,
});
const args = argParser.parseArgs();

// Cache for packageName@version's that are already processed.
const processedPackages: Set<string> = new Set();
// Cache for packageName@version's that failed for fetching.
const failedPackages: Set<string> = new Set();

function getLicense(pkgJson: PackageJson): string|null {
  // Some package.json files have incorrect license fields, and old packages may
  // have legacy licence field format. See
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

function correctLicenseName(license: string): string|null {
  const corrected = spdxCorrect(license);
  if (args.verbose && corrected && corrected !== license) {
    console.warn(`Correcting ${license} to ${corrected}`);
  }
  return corrected;
}

function isGreenLicense(license: string|null): boolean {
  if (!license) return false;

  const correctedName = correctLicenseName(license);
  // `license` is not a valid or correctable SPDX id. Check the whitelist.
  if (!correctedName) return WHITELISTED_LICENSES.includes(license);

  try {
    return spdxSatisfies(correctedName, GREEN_LICENSE_EXPR);
  } catch (err) {
    // Most likely because license is not recognized. Just return false.
    if (args.verbose) {
      console.error(err.message || err);
    }
    return false;
  }
}

async function checkLicenses(
    packageName: string, versionSpec: string,
    ...parents: string[]): Promise<void> {
  const spec = `${packageName}@${versionSpec}`;
  if (failedPackages.has(spec)) return;

  let json: PackageJson;
  try {
    json = ensurePackageJson(await packageJson(
        packageName, {version: versionSpec, fullMetadata: true}));
  } catch (err) {
    console.error(`got error for ${spec}:`, err);
    failedPackages.add(spec);
    return;
  }
  const pkgVersion = json.version;
  const packageAndVersion = `${packageName}@${pkgVersion}`;
  if (processedPackages.has(packageAndVersion)) return;
  processedPackages.add(packageAndVersion);

  const license = getLicense(json);
  if (!isGreenLicense(license)) {
    const licenseDisplay = license || '(no license)';
    process.stdout.write(`${licenseDisplay}: ${packageAndVersion}\n`);
    process.stdout.write(
        `  ${[...parents, packageAndVersion].join(' -> ')}\n\n`);
  }

  await checkLicensesForDeps(json.dependencies, ...parents, packageAndVersion);
  if (args.dev) {
    await checkLicensesForDeps(
        json.devDependencies, ...parents, packageAndVersion);
  }
}

async function checkLicensesForDeps(
    deps: Dependencies|undefined, ...parents: string[]): Promise<void> {
  if (!deps) return;
  for (const pkg of Object.keys(deps)) {
    const depVersion = deps[pkg];
    await checkLicenses(pkg, depVersion, ...parents);
  }
}

async function checkLocalPackageJson(packageJsonFile: string): Promise<void> {
  const content = await fsReadFile(packageJsonFile, 'utf8');
  const json: PackageJson = ensurePackageJson(JSON.parse(content));
  const packageAndVersion = `${json.name}@${json.version}`;
  await checkLicensesForDeps(json.dependencies, packageAndVersion);
  if (args.dev) {
    await checkLicensesForDeps(json.devDependencies, packageAndVersion);
  }
}

function checkRemotePackage(pkg: string): Promise<void> {
  const pkgArgs = npmPackageArg(pkg);
  const pkgType = pkgArgs.type;
  if (!['tag', 'version', 'range'].includes(pkgType)) {
    throw new Error(`Unsupported package spec: ${pkg}`);
  }
  if (!pkgArgs.name || !pkgArgs.fetchSpec) {
    throw new Error(`Invalid package spec: ${pkg}`);
  }
  return checkLicenses(pkgArgs.name, pkgArgs.fetchSpec);
}

function main() {
  if (args.file) {
    checkLocalPackageJson(args.file[0]);
  } else if (args.package) {
    checkRemotePackage(args.package);
  } else {
    throw new Error('Package name or --file must be given');
  }
}

main();
