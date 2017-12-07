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

import {PackageJson} from '../src/package-json-file';

import proxyquire = require('proxyquire');

proxyquire('../src/checker', {
  // fake packge-json
  'package-json': (pkg: string, opts?: {version?: string}):
      Promise<PackageJson> => {
        if (!opts || !opts.version) {
          throw new Error('package options or version does not exist');
        }
        requestedPackages.push(`${pkg}@${opts.version}`);
        switch (pkg) {
          case 'foo':
            return Promise.resolve({
              name: 'foo',
              version: '1.2.3',
              license: 'ISC',  // green license
              dependencies: {
                'bar': '^4.5.0',
              },
            });
          case 'bar':
            return Promise.resolve({
              name: 'bar',
              version: '4.5.6',
              license: 'EVIL',  // non-green license
            });
          default:
            throw new Error(`Unexpected package: ${pkg}`);
        }
      },
});

const requestedPackages: string[] = [];

import {LicenseChecker} from '../src/checker';

test(
    'correct packages are requested and non-green-license is emitted',
    async t => {
      const nonGreenPackages: string[] = [];
      const checker = new LicenseChecker({});
      checker.on('non-green-license', arg => {
        nonGreenPackages.push(`${arg.packageName}@${arg.version}`);
      });
      await checker.checkRemotePackage('foo');
      t.deepEqual(requestedPackages, ['foo@latest', 'bar@^4.5.0']);
      t.deepEqual(nonGreenPackages, ['bar@4.5.6']);
    });
