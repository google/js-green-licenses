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

function main(): Promise<void> {
  const checker =
      new LicenseChecker({dev: !!args.dev, verbose: !!args.verbose});
  let nonGreenCount = 0;
  checker
      .on('non-green-license',
          ({packageName, version, licenseName, parentPackages}) => {
            nonGreenCount++;
            const licenseDisplay = licenseName || '(no license)';
            const packageAndVersion = `${packageName}@${version}`;
            process.stdout.write(`${licenseDisplay}: ${packageAndVersion}\n`);
            process.stdout.write(
                `  ${[...parentPackages, packageAndVersion].join(' -> ')}\n\n`);
          })
      .on('package.json',
          (filePath) => {
            process.stdout.write(`Checking ${filePath}...\n`);
          })
      .on('error', err => console.error(err))
      .on('end', () => {
        if (nonGreenCount > 0) {
          process.stdout.write(`${nonGreenCount} non-green licenses found.\n`);
        } else {
          process.stdout.write('All green!\n');
        }
      });
  if (args.file) {
    return checker.checkLocalPackageJson(args.file[0]);
  } else if (args.pr) {
    return checker.checkGithubPR(args.pr[0]);
  } else if (args.package) {
    return checker.checkRemotePackage(args.package);
  } else {
    throw new Error('Package name, --file, or --pr must be given');
  }
}

main().catch((err) => {
  console.error(err);
});
