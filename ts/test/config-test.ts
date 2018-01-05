import test from 'ava';
import * as mockFs from 'mock-fs';

import * as config from '../src/config';
import {GitHubRepository} from '../src/github';

test.serial('read correct contents from local config file', async (t) => {
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
  mockFs({
    'repo/directory': {
      'js-green-licenses.json': configContent,
    },
  });
  try {
    const cfg = await config.getLocalConfig('repo/directory');
    t.truthy(cfg);
    t.deepEqual(cfg!.greenLicenses, ['FOO', 'BAR']);
    t.deepEqual(cfg!.packageWhitelist, ['a-package', 'another-package']);
  } finally {
    mockFs.restore();
  }
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

test.serial('no config file is ok (local)', async (t) => {
  mockFs({
    'repo/directory': {},
  });
  try {
    const cfg = await config.getLocalConfig('repo/directory');
    t.is(cfg, null);
  } finally {
    mockFs.restore();
  }
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

test.serial('error for invalid config file (local)', async (t) => {
  const configContent = JSON.stringify({
    // must be an array of strings.
    packageWhitelist: [
      42,
      43,
    ],
  });
  mockFs({
    'repo/directory': {
      'js-green-licenses.json': configContent,
    },
  });
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
    mockFs.restore();
  }
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

test.serial('comments are allowed in config file', async (t) => {
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
  mockFs({
    'repo/directory': {
      'js-green-licenses.json': configContent,
    },
  });
  try {
    const cfg = await config.getLocalConfig('repo/directory');
    t.truthy(cfg);
    t.deepEqual(cfg!.greenLicenses, ['FOO', 'BAR']);
    t.deepEqual(cfg!.packageWhitelist, ['foo', 'bar']);
  } finally {
    mockFs.restore();
  }
});
