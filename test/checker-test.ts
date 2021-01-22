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

import proxyquire from 'proxyquire';
import {describe, it} from 'mocha';
import {withFixtures} from 'inline-fixtures';
import * as assert from 'assert';
import * as path from 'path';
import * as checker from '../src/checker';
import {PackageJson} from '../src/package-json-file';

const {LicenseChecker} = proxyquire<typeof checker>('../src/checker', {
  // fake packge-json
  'package-json': (
    pkg: string,
    opts?: {version?: string}
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

describe(__filename, () => {
  it('correct packages are requested and non-green-license is emitted', async () => {
    requestedPackages = [];
    const nonGreenPackages: string[] = [];
    const checker = new LicenseChecker();
    checker.on('non-green-license', arg => {
      nonGreenPackages.push(`${arg.packageName}@${arg.version}`);
    });
    await checker.checkRemotePackage('foo');
    assert.deepStrictEqual(requestedPackages, ['foo@latest', 'bar@^4.5.0']);
    assert.deepStrictEqual(nonGreenPackages, ['bar@4.5.6']);
  });

  it('local directory is checked correctly', () => {
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
        assert.deepStrictEqual(requestedPackages, ['foo@^1.2.3', 'bar@^4.5.0']);
        assert.deepStrictEqual(nonGreenPackages, ['bar@4.5.6']);
      }
    );
  });

  it('local directory should have correct licenses too', () => {
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
        assert.deepStrictEqual(requestedPackages, ['foo@^1.2.3', 'bar@^4.5.0']);
        assert.deepStrictEqual(nonGreenPackages, ['hello@1.0.0', 'bar@4.5.6']);
      }
    );
  });

  it('local monorepo directory is checked correctly', () => {
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
    const pathToDir = path.join('path', 'to', 'dir');
    return withFixtures(
      {
        [pathToDir]: {
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
        await checker.checkLocalDirectory(pathToDir);
        assert.deepStrictEqual(requestedPackages, [
          'foo@^1.2.3',
          'bar@^4.5.0',
          'baz@^7.0.0',
        ]);
        assert.deepStrictEqual(nonGreenPackages, ['bar@4.5.6', 'baz@7.8.9']);
        assert.deepStrictEqual(packageJsonPaths, [
          path.join(pathToDir, 'package.json'),
          path.join(pathToDir, 'packages', 'sub-package', 'package.json'),
        ]);
      }
    );
  });

  it('local monorepo with local dependency is checked correctly', () => {
    const topLevelPackageJson = JSON.stringify({
      name: 'hello',
      version: '1.0.0',
      license: 'Apache-2.0',
      dependencies: {
        'hello-sub': '^1.0.0',
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
    const pathToDir = path.join('path', 'to', 'dir');
    return withFixtures(
      {
        [pathToDir]: {
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
        await checker.checkLocalDirectory(pathToDir);
        console.log(JSON.stringify(requestedPackages, null, 2));
        assert.deepStrictEqual(requestedPackages, ['baz@^7.0.0']);
        assert.deepStrictEqual(nonGreenPackages, ['baz@7.8.9']);
        assert.deepStrictEqual(packageJsonPaths, [
          path.join(pathToDir, 'package.json'),
          path.join(pathToDir, 'packages', 'sub-package', 'package.json'),
        ]);
      }
    );
  });

  it('package allowlist should be respected (local repo)', () => {
    const packageJson = JSON.stringify({
      name: 'hello',
      version: '1.0.0',
      license: 'Apache-2.0',
      dependencies: {
        foo: '^1.2.3',
      },
    });
    const configJson = JSON.stringify({
      packageAllowlist: ['bar'],
    });
    const pathToDir = path.join('path', 'to', 'dir');
    return withFixtures(
      {
        [pathToDir]: {
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
        await checker.checkLocalDirectory(pathToDir);
        assert.strictEqual(nonGreenPackages.length, 0);
      }
    );
  });

  it('custom green license list (local repo)', () => {
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
        assert.deepStrictEqual(requestedPackages, ['foo@^1.2.3', 'bar@^4.5.0']);
        assert.deepStrictEqual(nonGreenPackages, ['foo@1.2.3']); // ISC is not green now.
      }
    );
  });

  it('errors properly output to console', async () => {
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
    const checker = new LicenseChecker();
    checker.setDefaultHandlers({setExitCode: false});
    await checker.checkRemotePackage('foo');
    console.log = realConsoleLog;
    assert.ok(/EVIL: bar@4\.5\.6/.test(consoleOutput));
    assert.ok(/1 non-green licenses found\./.test(consoleOutput));
  });

  it('accept private package (local repo)', () => {
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
        assert.deepStrictEqual(requestedPackages, []);
        assert.deepStrictEqual(nonGreenPackages, []);
      }
    );
  });

  it('decline private package (local repo)', () => {
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
        assert.deepStrictEqual(requestedPackages, []);
        assert.deepStrictEqual(nonGreenPackages, ['undefined@undefined']);
      }
    );
  });

  it('support local paths', () => {
    const primaryPackageJson = JSON.stringify({
      name: 'hello',
      version: '1.0.0',
      license: 'Apache-2.0',
      dependencies: {
        foo: '^1.2.3',
        linked: 'file:../linked',
      },
    });
    const linkedPackageJson = JSON.stringify({
      name: 'linked',
      version: '1.0.0',
      license: 'Apache-2.0',
      dependencies: {
        baz: '^7.0.0',
      },
    });
    const pathToPrimary = path.join('path', 'to', 'primary');
    const pathToLinked = path.join('path', 'to', 'linked');
    return withFixtures(
      {
        [pathToPrimary]: {
          'package.json': primaryPackageJson,
          'another-file': 'meh, world.',
        },
        [pathToLinked]: {
          'package.json': linkedPackageJson,
          'another-file': 'i depend on a package with an evil license',
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
        await checker.checkLocalDirectory(pathToPrimary);
        console.log('requested packages: ', requestedPackages);
        assert.deepStrictEqual(requestedPackages, [
          'foo@^1.2.3',
          'bar@^4.5.0',
          'baz@^7.0.0',
        ]);
        assert.deepStrictEqual(nonGreenPackages, ['bar@4.5.6', 'baz@7.8.9']);
        assert.deepStrictEqual(packageJsonPaths, [
          path.join(pathToPrimary, 'package.json'),
          path.join(pathToLinked, 'package.json'),
        ]);
      }
    );
  });

  it('treats UNLICENSED as non-green', () => {
    const primaryPackageJson = JSON.stringify({
      name: 'hello',
      version: '1.0.0',
      license: 'UNLICENSED',
    });

    const pathToPrimary = path.join('path', 'to', 'primary');
    return withFixtures(
      {
        [pathToPrimary]: {
          'package.json': primaryPackageJson,
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
        await checker.checkLocalDirectory(pathToPrimary);
        console.log('requested packages: ', requestedPackages);
        assert.deepStrictEqual(requestedPackages, []);
        assert.deepStrictEqual(nonGreenPackages, ['hello@1.0.0']);
        assert.deepStrictEqual(packageJsonPaths, [
          path.join(pathToPrimary, 'package.json'),
        ]);
      }
    );
  });

  it('skips package.json checks if package is allow listed', () => {
    const primaryPackageJson = JSON.stringify({
      name: 'hello',
      version: '1.0.0',
      licenses: ['invalid', 'values'],
    });

    const configJson = JSON.stringify({
      packageAllowlist: ['hello'],
    });
    const pathToPrimary = path.join('path', 'to', 'primary');
    return withFixtures(
      {
        [pathToPrimary]: {
          'package.json': primaryPackageJson,
          'js-green-licenses.json': configJson,
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
        await checker.checkLocalDirectory(pathToPrimary);
        console.log('requested packages: ', requestedPackages);
        assert.deepStrictEqual(requestedPackages, []);
        assert.deepStrictEqual(nonGreenPackages, []);
        assert.deepStrictEqual(packageJsonPaths, [
          path.join(pathToPrimary, 'package.json'),
        ]);
      }
    );
  });
});
