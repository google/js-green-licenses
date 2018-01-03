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

const version = require('../../package.json').version;

const argParser = new ArgumentParser({
  version,
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
argParser.addArgument(['--local', '-l'], {
  help: 'Check a local directory instead of public npm.',
  metavar: '<directory>',
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
  checker.setDefaultHandlers();
  if (args.local) {
    await checker.checkLocalDirectory(args.local[0]);
  } else if (args.pr) {
    const {repo, prId} = checker.prPathToGitHubRepoAndId(args.pr[0]);
    const {mergeCommitSha} = await repo.getPRCommits(prId);
    await checker.checkGitHubPR(repo, mergeCommitSha);
  } else if (args.package) {
    await checker.checkRemotePackage(args.package);
  } else {
    throw new Error('Package name, --local, or --pr must be given');
  }
}

main().catch((err) => {
  console.error(err);
});
