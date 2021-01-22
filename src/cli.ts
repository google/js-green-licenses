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

import meow from 'meow';
import {LicenseChecker} from './checker';

const cli = meow(
  `
	Usage
	  $ jsgl [-h] [-v] [--local <directory>] [--pr <github PR>] [--dev] [--verbose] [<package or package@version>]

  Positional arguments:
    <package or package@version>
                      Package name to check license for. Can include
                      version spec after @. E.g. foo@^1.2.3. Otherwise
                      latest.

	Options
    --help            Show this help message and exit.
    --local <directory>, -l <directory>
                      Check a local directory instead of public npm.
    --version, -v     Show program's version number and exit.
    --pr <pr_number>  Check a github pull request. Must be <owner>/<repo>/pull/<id>
    --dev             Also check devDependencies.
    --verbose         Verbose error outputs.
`,
  {
    flags: {
      local: {
        type: 'string',
        alias: 'l',
      },
      pr: {
        type: 'string',
      },
      dev: {
        type: 'boolean',
      },
      verbose: {
        type: 'boolean',
      },
    },
  }
);

async function main(): Promise<void> {
  const checker = new LicenseChecker({
    dev: !!cli.flags.dev,
    verbose: !!cli.flags.verbose,
  });
  checker.setDefaultHandlers({setExitCode: true});
  if (cli.flags.local) {
    await checker.checkLocalDirectory(cli.flags.local);
  } else if (cli.flags.pr) {
    console.log(cli.flags.pr);
    const {repo, prId} = checker.prPathToGitHubRepoAndId(cli.flags.pr);
    const {mergeCommitSha} = await repo.getPRCommits(prId);
    await checker.checkGitHubPR(repo, mergeCommitSha);
  } else if (cli.input?.length) {
    await checker.checkRemotePackage(cli.input![0]);
  } else {
    throw new Error('Package name, --local, or --pr must be given');
  }
}

main().catch(err => {
  console.error(err);
});
