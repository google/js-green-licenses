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

import * as assert from 'assert';
import {describe, it} from 'mocha';
import {withFixtures} from 'inline-fixtures';
import * as config from '../src/config';
import {GitHubRepository} from '../src/github';

describe(__filename, () => {
  it('read correct contents from local config file', async () => {
    const configContent = JSON.stringify({
      greenLicenses: ['FOO', 'BAR'],
      packageAllowlist: ['a-package', 'another-package'],
    });

    return withFixtures(
      {'repo/directory': {'js-green-licenses.json': configContent}},
      async () => {
        const cfg = await config.getLocalConfig('repo/directory');
        assert.ok(cfg);
        assert.deepStrictEqual(cfg!.greenLicenses, ['FOO', 'BAR']);
        assert.deepStrictEqual(cfg!.packageAllowlist, [
          'a-package',
          'another-package',
        ]);
      }
    );
  });

  it('read config file from github repo', async () => {
    class FakeGitHubRepository extends GitHubRepository {
      constructor() {
        super('janedoe', 'repo');
      }

      async getFileContent(): Promise<string | null> {
        return JSON.stringify({
          greenLicenses: ['BAR', 'BAZ'],
          packageAllowlist: ['package-1', 'package-2'],
        });
      }
    }
    const cfg = await config.getGitHubConfig(
      new FakeGitHubRepository(),
      '1234'
    );
    assert.ok(cfg);
    assert.deepStrictEqual(cfg!.greenLicenses, ['BAR', 'BAZ']);
    assert.deepStrictEqual(cfg!.packageAllowlist, ['package-1', 'package-2']);
  });

  it('no config file is ok (local)', async () => {
    return withFixtures({'repo/directory': {}}, async () => {
      const cfg = await config.getLocalConfig('repo/directory');
      assert.strictEqual(cfg, null);
    });
  });

  it('no config file is ok (github)', async () => {
    class FakeGitHubRepository extends GitHubRepository {
      constructor() {
        super('janedoe', 'repo');
      }

      async getFileContent(): Promise<string | null> {
        return null;
      }
    }
    const cfg = await config.getGitHubConfig(
      new FakeGitHubRepository(),
      '1234'
    );
    assert.strictEqual(cfg, null);
  });

  it('error for invalid config file (local)', async () => {
    const configContent = JSON.stringify({
      // must be an array of strings.
      packageAllowlist: [42, 43],
    });
    return withFixtures(
      {
        'repo/directory': {
          'js-green-licenses.json': configContent,
        },
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
          assert.strictEqual(cfg, null);
          assert.ok(errorContents.indexOf('Invalid config contents') >= 0);
        } finally {
          console.error = consoleError;
        }
      }
    );
  });

  it('error for invalid config file (github)', async () => {
    class FakeGitHubRepository extends GitHubRepository {
      constructor() {
        super('janedoe', 'repo');
      }

      async getFileContent(): Promise<string | null> {
        return JSON.stringify({
          // must be an array.
          greenLicenses: {
            FOO: '^1.2.3',
            BAR: '^2.3.4',
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
      const cfg = await config.getGitHubConfig(
        new FakeGitHubRepository(),
        '1234'
      );
      assert.strictEqual(cfg, null);
      assert.ok(errorContents.indexOf('Invalid config contents') >= 0);
    } finally {
      console.error = consoleError;
    }
  });

  it('comments are allowed in config file', async () => {
    const configContent = `{
      // comments are fine
      "greenLicenses": [
        "FOO",
        "BAR"
      ],
      /* another form of comment */
      "packageAllowlist": [
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
        assert.ok(cfg);
        assert.deepStrictEqual(cfg!.greenLicenses, ['FOO', 'BAR']);
        assert.deepStrictEqual(cfg!.packageAllowlist, ['foo', 'bar']);
      }
    );
  });
});
