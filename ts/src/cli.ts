#!/usr/bin/env node

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
argParser.addArgument(['--dev'], {
  help: 'Also check devDependencies.',
  nargs: 0,
});
argParser.addArgument(['--verbose'], {
  help: 'Verbose error outputs.',
  nargs: 0,
});
const args = argParser.parseArgs();

function main() {
  const checker =
      new LicenseChecker({dev: !!args.dev, verbose: !!args.verbose});
  checker.on(
      'non-green-license',
      ({packageName, version, licenseName, parentPackages}) => {
        const licenseDisplay = licenseName || '(no license)';
        const packageAndVersion = `${packageName}@${version}`;
        process.stdout.write(`${licenseDisplay}: ${packageAndVersion}\n`);
        process.stdout.write(
            `  ${[...parentPackages, packageAndVersion].join(' -> ')}\n\n`);
      });
  if (args.file) {
    checker.checkLocalPackageJson(args.file[0]);
  } else if (args.package) {
    checker.checkRemotePackage(args.package);
  } else {
    throw new Error('Package name or --file must be given');
  }
}

main();
