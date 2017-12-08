#!/usr/bin/env node

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

import {ArgumentParser} from 'argparse';
import {inspect} from 'util';

import {LicenseChecker, NonGreenLicense} from './checker';

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
argParser.addArgument(['--pr'], {
  help: 'Check a github pull request. Must be <owner>/<repo>/pull/<id>',
  metavar: '<github PR>',
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

async function main(): Promise<void> {
  const checker =
      new LicenseChecker({dev: !!args.dev, verbose: !!args.verbose});
  let nonGreenCount = 0;
  let errorCount = 0;
  checker
      .on('non-green-license',
          ({packageName, version, licenseName, parentPackages}) => {
            nonGreenCount++;
            const licenseDisplay = licenseName || '(no license)';
            const packageAndVersion = `${packageName}@${version}`;
            console.log(`${licenseDisplay}: ${packageAndVersion}`);
            console.log(
                `  ${[...parentPackages, packageAndVersion].join(' -> ')}`);
            console.log();
          })
      .on('package.json',
          (filePath) => {
            console.log(`Checking ${filePath}...`);
            console.log();
          })
      .on('error',
          ({err, packageName, versionSpec, parentPackages}) => {
            errorCount++;
            const packageAndVersion = `${packageName}@${versionSpec}`;
            console.log(`Error while checking ${packageAndVersion}:`);
            console.log(
                `  ${[...parentPackages, packageAndVersion].join(' -> ')}`);
            console.log();
            console.log(`${inspect(err)}`);
            console.log();
          })
      .on('end', () => {
        if (nonGreenCount > 0 || errorCount > 0) {
          process.exitCode = 1;
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
  if (args.file) {
    await checker.checkLocalPackageJson(args.file[0]);
  } else if (args.pr) {
    const {repo, prId} = checker.prPathToGitHubRepoAndId(args.pr[0]);
    const {mergeCommitSha} = await repo.getPRCommits(prId);
    await checker.checkGithubPR(repo, mergeCommitSha);
  } else if (args.package) {
    await checker.checkRemotePackage(args.package);
  } else {
    throw new Error('Package name, --file, or --pr must be given');
  }
}

main().catch((err) => {
  console.error(err);
});
