// Copyright 2018 Google LLC
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

import test from 'ava';

import * as config from '../src/config';
import {GitHubRepository} from '../src/github';
import {withFixtures} from './fixtures';

test.serial('read correct contents from local config file', t => {
  const configContent = JSON.stringify({
    greenLicenses: [
      'FOO',
      'BAR',
    ],
    packageWhitelist: [
      'a-package',
      'another-package',
    ],
  });

  return withFixtures(
      {'repo/directory': {'js-green-licenses.json': configContent}},
      async () => {
        const cfg = await config.getLocalConfig('repo/directory');
        t.truthy(cfg);
        t.deepEqual(cfg!.greenLicenses, ['FOO', 'BAR']);
        t.deepEqual(cfg!.packageWhitelist, ['a-package', 'another-package']);
      });
});


test.serial('read config file from github repo', async (t) => {
  class FakeGitHubRepository extends GitHubRepository {
    constructor() {
      super('janedoe', 'repo');
    }

    async getFileContent(commitSha: string, path: string):
        Promise<string|null> {
      return JSON.stringify({
        greenLicenses: [
          'BAR',
          'BAZ',
        ],
        packageWhitelist: [
          'package-1',
          'package-2',
        ],
      });
    }
  }
  const cfg = await config.getGitHubConfig(new FakeGitHubRepository(), '1234');
  t.truthy(cfg);
  t.deepEqual(cfg!.greenLicenses, ['BAR', 'BAZ']);
  t.deepEqual(cfg!.packageWhitelist, ['package-1', 'package-2']);
});

test.serial('no config file is ok (local)', t => {
  return withFixtures({'repo/directory': {}}, async () => {
    const cfg = await config.getLocalConfig('repo/directory');
    t.is(cfg, null);
  });
});

test.serial('no config file is ok (github)', async (t) => {
  class FakeGitHubRepository extends GitHubRepository {
    constructor() {
      super('janedoe', 'repo');
    }

    async getFileContent(commitSha: string, path: string):
        Promise<string|null> {
      return null;
    }
  }
  const cfg = await config.getGitHubConfig(new FakeGitHubRepository(), '1234');
  t.is(cfg, null);
});

test.serial('error for invalid config file (local)', t => {
  const configContent = JSON.stringify({
    // must be an array of strings.
    packageWhitelist: [
      42,
      43,
    ],
  });
  return withFixtures(
      {
        'repo/directory': {
          'js-green-licenses.json': configContent,
        }
      },
      async () => {
        const consoleError = console.error;
        try {
          let errorContents = '';
          console.error = (message, ...params) => {
            errorContents = `${message} ${params.join(' ')}`;
            consoleError(message, ...params);
          };
          const cfg = await config.getLocalConfig('repo/directory');
          t.is(cfg, null);
          t.true(errorContents.indexOf('Invalid config contents') >= 0);
        } finally {
          console.error = consoleError;
        }
      });
});

test.serial('error for invalid config file (github)', async (t) => {
  class FakeGitHubRepository extends GitHubRepository {
    constructor() {
      super('janedoe', 'repo');
    }

    async getFileContent(commitSha: string, path: string):
        Promise<string|null> {
      return JSON.stringify({
        // must be an array.
        greenLicenses: {
          'FOO': '^1.2.3',
          'BAR': '^2.3.4',
        },
      });
    }
  }

  const consoleError = console.error;
  try {
    let errorContents = '';
    console.error = (message, ...params) => {
      errorContents = `${message} ${params.join(' ')}`;
      consoleError(message, ...params);
    };
    const cfg =
        await config.getGitHubConfig(new FakeGitHubRepository(), '1234');
    t.is(cfg, null);
    t.true(errorContents.indexOf('Invalid config contents') >= 0);
  } finally {
    console.error = consoleError;
  }
});

test.serial('comments are allowed in config file', t => {
  const configContent = `{
    // comments are fine
    "greenLicenses": [
      "FOO",
      "BAR"
    ],
    /* another form of comment */
    "packageWhitelist": [
      "foo",  // inline comment
      "bar"
    ]
  }`;
  return withFixtures(
      {
        'repo/directory': {
          'js-green-licenses.json': configContent,
        },
      },
      async () => {
        const cfg = await config.getLocalConfig('repo/directory');
        t.truthy(cfg);
        t.deepEqual(cfg!.greenLicenses, ['FOO', 'BAR']);
        t.deepEqual(cfg!.packageWhitelist, ['foo', 'bar']);
      });
});
