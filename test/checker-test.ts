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

import test from 'ava';
import proxyquire from 'proxyquire';
import { withFixtures } from 'inline-fixtures';

import * as checker from '../src/checker';
import { PackageJson } from '../src/package-json-file';

const { LicenseChecker } = proxyquire<typeof checker>('../src/checker', {
  // fake packge-json
  'package-json': (
    pkg: string,
    opts?: { version?: string }
  ): Promise<PackageJson> => {
    if (!opts || !opts.version) {
      throw new Error('package options or version does not exist');
    }
    requestedPackages.push(`${pkg}@${opts.version}`);
    switch (pkg) {
      case 'foo':
        return Promise.resolve({
          name: 'foo',
          version: '1.2.3',
          license: 'ISC', // green license
          dependencies: {
            bar: '^4.5.0',
          },
        });
      case 'bar':
        return Promise.resolve({
          name: 'bar',
          version: '4.5.6',
          license: 'EVIL', // non-green license
        });
      case 'baz':
        return Promise.resolve({
          name: 'baz',
          version: '7.8.9',
          license: 'ALSO-EVIL', // non-green license
        });
      default:
        throw new Error(`Unexpected package: ${pkg}`);
    }
  },
});

let requestedPackages: string[] = [];

test.serial(
  'correct packages are requested and non-green-license is emitted',
  async t => {
    requestedPackages = [];
    const nonGreenPackages: string[] = [];
    const checker = new LicenseChecker();
    checker.on('non-green-license', arg => {
      nonGreenPackages.push(`${arg.packageName}@${arg.version}`);
    });
    await checker.checkRemotePackage('foo');
    t.deepEqual(requestedPackages, ['foo@latest', 'bar@^4.5.0']);
    t.deepEqual(nonGreenPackages, ['bar@4.5.6']);
  }
);

test.serial('local directory is checked correctly', t => {
  const packageJson = JSON.stringify({
    name: 'hello',
    version: '1.0.0',
    license: 'Apache-2.0',
    dependencies: {
      foo: '^1.2.3',
    },
  });
  return withFixtures(
    {
      'path/to/dir': {
        'package.json': packageJson,
        'another-file': 'hello, world',
      },
    },
    async () => {
      requestedPackages = [];
      const nonGreenPackages: string[] = [];
      const checker = new LicenseChecker();
      checker.on('non-green-license', arg => {
        nonGreenPackages.push(`${arg.packageName}@${arg.version}`);
      });
      await checker.checkLocalDirectory('path/to/dir');
      t.deepEqual(requestedPackages, ['foo@^1.2.3', 'bar@^4.5.0']);
      t.deepEqual(nonGreenPackages, ['bar@4.5.6']);
    }
  );
});

test.serial('local directory should have correct licenses too', t => {
  const packageJson = JSON.stringify({
    name: 'hello',
    version: '1.0.0',
    license: 'EVIL',
    dependencies: {
      foo: '^1.2.3',
    },
  });
  return withFixtures(
    {
      'path/to/dir': {
        'package.json': packageJson,
        'another-file': 'hello, world',
      },
    },
    async () => {
      requestedPackages = [];
      const nonGreenPackages: string[] = [];
      const checker = new LicenseChecker();
      checker.on('non-green-license', arg => {
        nonGreenPackages.push(`${arg.packageName}@${arg.version}`);
      });
      await checker.checkLocalDirectory('path/to/dir');
      t.deepEqual(requestedPackages, ['foo@^1.2.3', 'bar@^4.5.0']);
      t.deepEqual(nonGreenPackages, ['hello@1.0.0', 'bar@4.5.6']);
    }
  );
});

test.serial('local monorepo directory is checked correctly', t => {
  const topLevelPackageJson = JSON.stringify({
    name: 'hello',
    version: '1.0.0',
    license: 'Apache-2.0',
    dependencies: {
      foo: '^1.2.3',
    },
  });
  const subPackageJson = JSON.stringify({
    name: 'hello-sub',
    version: '1.0.0',
    license: 'Apache-2.0',
    dependencies: {
      baz: '^7.0.0',
    },
  });
  return withFixtures(
    {
      'path/to/dir': {
        'package.json': topLevelPackageJson,
        'another-file': 'hello, world',
        packages: {
          'sub-package': {
            'package.json': subPackageJson,
          },
        },
      },
    },
    async () => {
      requestedPackages = [];
      const nonGreenPackages: string[] = [];
      const packageJsonPaths: string[] = [];
      const checker = new LicenseChecker();
      checker
        .on('non-green-license', arg => {
          nonGreenPackages.push(`${arg.packageName}@${arg.version}`);
        })
        .on('package.json', filePath => {
          packageJsonPaths.push(filePath);
        });
      await checker.checkLocalDirectory('path/to/dir');
      t.deepEqual(requestedPackages, [
        'foo@^1.2.3',
        'bar@^4.5.0',
        'baz@^7.0.0',
      ]);
      t.deepEqual(nonGreenPackages, ['bar@4.5.6', 'baz@7.8.9']);
      t.deepEqual(packageJsonPaths, [
        'path/to/dir/package.json',
        'path/to/dir/packages/sub-package/package.json',
      ]);
    }
  );
});

test.serial('package whitelist should be respected (local repo)', t => {
  const packageJson = JSON.stringify({
    name: 'hello',
    version: '1.0.0',
    license: 'Apache-2.0',
    dependencies: {
      foo: '^1.2.3',
    },
  });
  const configJson = JSON.stringify({
    packageWhitelist: ['bar'],
  });
  return withFixtures(
    {
      'path/to/dir': {
        'package.json': packageJson,
        'js-green-licenses.json': configJson,
      },
    },
    async () => {
      requestedPackages = [];
      const nonGreenPackages: string[] = [];
      const checker = new LicenseChecker();
      checker.on('non-green-license', arg => {
        nonGreenPackages.push(`${arg.packageName}@${arg.version}`);
      });
      await checker.checkLocalDirectory('path/to/dir');
      t.is(nonGreenPackages.length, 0);
    }
  );
});

test.serial('custom green license list (local repo)', t => {
  const packageJson = JSON.stringify({
    name: 'hello',
    version: '1.0.0',
    license: 'Foo License',
    dependencies: {
      foo: '^1.2.3',
    },
  });
  const configJson = JSON.stringify({
    greenLicenses: ['Foo License', 'EVIL'],
  });
  return withFixtures(
    {
      'path/to/dir': {
        'package.json': packageJson,
        'js-green-licenses.json': configJson,
      },
    },
    async () => {
      requestedPackages = [];
      const nonGreenPackages: string[] = [];
      const checker = new LicenseChecker();
      checker.on('non-green-license', arg => {
        nonGreenPackages.push(`${arg.packageName}@${arg.version}`);
      });
      await checker.checkLocalDirectory('path/to/dir');
      t.deepEqual(requestedPackages, ['foo@^1.2.3', 'bar@^4.5.0']);
      t.deepEqual(nonGreenPackages, ['foo@1.2.3']); // ISC is not green now.
    }
  );
});

test.serial('errors properly output to console', async t => {
  // temporarily mock out global console.log so we can see what gets
  // written there.
  const realConsoleLog = console.log;
  let consoleOutput = '';
  console.log = output => {
    if (output !== undefined) {
      consoleOutput += output;
    }
    consoleOutput += '\n';
  };
  requestedPackages = [];
  const nonGreenPackages: string[] = [];
  const checker = new LicenseChecker();
  checker.setDefaultHandlers({ setExitCode: false });
  await checker.checkRemotePackage('foo');
  console.log = realConsoleLog;
  t.regex(consoleOutput, /EVIL: bar@4\.5\.6/);
  t.regex(consoleOutput, /1 non-green licenses found\./);
});

test.serial('accept private package (local repo)', t => {
  const packageJson = JSON.stringify({
    private: true,
    dependencies: {},
  });
  const configJson = JSON.stringify({
    greenLicenses: ['private'],
  });
  return withFixtures(
    {
      'path/to/dir': {
        'package.json': packageJson,
        'js-green-licenses.json': configJson,
      },
    },
    async () => {
      requestedPackages = [];
      const nonGreenPackages: string[] = [];
      const checker = new LicenseChecker();
      checker.on('non-green-license', arg => {
        nonGreenPackages.push(`${arg.packageName}@${arg.version}`);
      });
      await checker.checkLocalDirectory('path/to/dir');
      t.deepEqual(requestedPackages, []);
      t.deepEqual(nonGreenPackages, []);
    }
  );
});

test.serial('decline private package (local repo)', t => {
  const packageJson = JSON.stringify({
    private: true,
    dependencies: {},
  });
  const configJson = JSON.stringify({
    greenLicenses: ['ISC'],
  });
  return withFixtures(
    {
      'path/to/dir': {
        'package.json': packageJson,
        'js-green-licenses.json': configJson,
      },
    },
    async () => {
      requestedPackages = [];
      const nonGreenPackages: string[] = [];
      const checker = new LicenseChecker();
      checker.on('non-green-license', arg => {
        nonGreenPackages.push(`${arg.packageName}@${arg.version}`);
      });
      await checker.checkLocalDirectory('path/to/dir');
      t.deepEqual(requestedPackages, []);
      t.deepEqual(nonGreenPackages, ['undefined@undefined']);
    }
  );
});
