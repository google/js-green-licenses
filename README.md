# JavaScript package.json License Checker

[![npm Version][npm-image]][npm-url]
[![CI][actions-image]][actions-url]
[![Dependency Status][david-image]][david-url]
[![Known Vulnerabilities][snyk-image]][snyk-url]
[![codecov][codecov-image]][codecov-url]
[![Code Style: Google][gts-image]][gts-url]

**This is not an official Google product.**

This is a tool for checking the license of JavaScript projects. It scans the
`package.json` file to check its license and recursively checks all of its
dependencies.

**DISCLAIMER: This tool is NOT a replacement for legal advice or due
diligence for your project's license validity. We recommend you consult a
lawyer if you want legal advice.**

## Installation

```shell
npm install [--save-dev] js-green-licenses
```

If you want to install globally,

```shell
npm install -g js-green-licenses
```

## CLI

```
usage: jsgl [-h] [-v] [--local <directory>] [--pr <github PR>]
            [--dev] [--verbose] [<package or package@version>]

License checker for npm modules

Positional arguments:
  <package or package@version>
                        Package name to check license for. Can include
                        version spec after @. E.g. foo@^1.2.3. Otherwise
                        latest.

Optional arguments:
  -h, --help            Show this help message and exit.
  -v, --version         Show program's version number and exit.
  --local <directory>, -l <directory>
                        Check a local directory instead of public npm.
  --pr <github PR>      Check a github pull request. Must be
                        <owner>/<repo>/pull/<id>
  --dev                 Also check devDependencies.
  --verbose             Verbose error outputs.
```

This tool checks licenses for 1) an already published npm package, 2) a local
directory, or 3) a GitHub pull request. For checking an npm package, you can
just pass the package name (optionally together with the version) as the
argument. To check a local directory, you should pass the `--local
path/to/repo` argument. To check for a GitHub PR, you should pass the `--pr
<owner>/<repo>/pull/<id>` argument.

If the tool finds any non-green licenses in the given package or in its
dependencies, they will be printed out together with the detailed
information.

If you pass `--dev`, the `devDependencies` will be checked as well as the
`dependencies`.

`jsgl` also checks sub-packages for `--local` and `--pr` flags when it
detects that the repository is a monorepo. It assumes a certain directory
structure for detecting whether a repository is a monorepo: the top-level
directory should have the `packages` directory in it and sub-packages must
exist under that directory. In that case, all the `package.json` files are
found from sub-packages and `jsgl` checks all of them.

For example, when a directory `foo` is like this:
```
foo
 |
 +-- packages
 |    |
 |    +-- bar
 |    |    |
 |    |    +-- package.json
 |    |    |
 |    |    +-- ...
 |    |
 |    +-- baz
 |         |
 |         +-- package.json
 |         |
 |         +-- ...
 |
 +-- package.json
 |
 +-- ...
```
, `jsgl` checks all of `foo/package.json`, `foo/packages/bar/package.json`,
and `foo/packages/baz/package.json`.

## Configurations

You can customize how `jsgl` works with the configuration file, named
`js-green-licenses.json`. For example, you can specify the license list that
you would like to consider green. The license IDs must be listed in the
`greenLicenses` section of the configuration file. In that case, `jsgl` will
use that custom list instead of its default list.

The default green license list is:
```javascript
const DEFAULT_GREEN_LICENSES = [
  '0BSD',         'AFL-2.1',      'AFL-3.0',      'APSL-2.0',     'Apache-1.1',
  'Apache-2.0',   'Artistic-1.0', 'Artistic-2.0', 'BSD-2-Clause', 'BSD-3-Clause',
  'BSL-1.0',      'CC-BY-1.0',    'CC-BY-2.0',    'CC-BY-2.5',    'CC-BY-3.0',
  'CC-BY-4.0',    'CC0-1.0',      'CDDL-1.0',     'CDDL-1.1',     'CPL-1.0',
  'EPL-1.0',      'FTL',          'IPL-1.0',      'ISC',          'LGPL-2.0',
  'LGPL-2.1',     'LGPL-3.0',     'LPL-1.02',     'MIT',          'MPL-1.0',
  'MPL-1.1',      'MPL-2.0',      'MS-PL',        'NCSA',         'OpenSSL',
  'PHP-3.0',      'Ruby',         'Unlicense',    'W3C',          'Xnet',
  'ZPL-2.0',      'Zend-2.0',     'Zlib',         'libtiff',
];
```

You can also allowlist some npm packages and they will be considered "green"
even when they have non-green licenses or no licenses. It's useful when
`jsgl` is unable to verify the validness of a certain package's license for
some reason. For example, when a package doesn't specify its license in its
`package.json` but has a separate `LICENSE` file, `jsgl` can't verify that.
You can allowlist that package to make `jsgl` not complain about that
package.

A typical configuration file looks like this:
```javascript
{
  "greenLicenses": [
    // Custom green licenses.
    "Apache-2.0",
    "MIT",
    "BSD-3-Clause",
    ...
  ],
  "packageAllowlist": [
    /* packages considered ok */
    "foo",
    "bar",  // inline comment
    "package-with-no-license",
    "package-with-okish-license",
    ...
  ]
}
```

The `greenLicenses` section is for the custom license list and the
`packageAllowlist` section is for the package allowlist.

Note that comments are allowed in `js-green-licenses.json`.

The configuration file must be located in the top-level directory of a
repository for `--local` and `--pr`. When checking remote npm packages,
`jsgl` tries to locate the configuration file in the current local directory
from which `jsgl` is invoked.

It is desirable that the license names in the `greenLicenses` section be
valid license IDs defined in https://spdx.org/licenses/ whenever possible.

## Interface as a Library

You can also use `js-green-licenses` as a library as well as a command-line
utility. Usually the `LicenseChecker` class is the only one you would have to
use.

### Instantiation

```javascript
const opts = {
  dev: false,
  verbose: true,
};
const checker = new LicenseChecker(opts);
```

Both the `dev` and the `verbose` fields are optional and default to false.
When `dev` is true, the `devDependencies` section is checked as well as the
`dependencies` section of `package.json`. When `verbose` is true, `jsgl`
generates more verbose output.

### Use in Gulp

```javascript
const jsgl = require('js-green-licenses');

gulp.task('check_licenses', function() {
  const checker = new jsgl.LicenseChecker({
    dev: true,
    verbose: false,
  });
  checker.setDefaultHandlers();
  return checker.checkLocalDirectory('.');
});
```

### Methods

*   `LicenseChecker#setDefaultHandler()`

    ```typescript
    setDefaultHandlers(): void;
    ```

    Sets the default event handlers that are used by the CLI. For events
    emitted by `LicenseChecker`, see the [*Events*](#hd-events) subsection.

*   `LicenseChecker#checkLocalDirectory()`

    ```typescript
    checkLocalDirectory(directory: string): Promise<void>;
    ```

    This provides the functionality of the CLI when the `--local` flag is
    passed. It finds and checks the `package.json` file in the `directory` and
    recursively checks its dependencies. This method also detects monorepos
    and checks sub-packages as well, as explained in the [CLI section](#cli)
    above.

    This method reads in the configuration from the `js-green-licenses.json`
    file in the `directory`, if it exists.

*   `LicenseChecker#checkRemotePackage()`

    ```typescript
    checkRemotePackage(pkg: string): Promise<void>;
    ```

    This provides the functionality of the CLI when neither `--local` or
    `--pr` is passed. It retrieves and checks the `package.json` for the
    remote npm package and recursively checks its dependencies.

    This method reads in the configuration from the `js-green-licenses.json`
    file in the current directory of the Node.js process.

*   `LicenseChecker#checkGitHubPR()`

    ```typescript
    checkGitHubPR(repo: GitHubRepository, mergeCommitSha): Promise<void>;
    ```

    This provides the functionality of the CLI when the `--pr` flag is
    passed. It retrieves the `package.json` file from the GitHub repository
    at the given commit SHA and checks its license and recursively checks its
    dependencies. This method also detects monorepos and checks sub-packages
    as well, as explained in the [CLI section](#cli) above.

    This method reads in the configuration from the `js-green-licenses.json`
    file in the repository, if it exists.

    `GitHubRepository` is a helper class for interacting with the GitHub API.
    You can create its instance by calling
    `LicenseChecker#prPathToGitHubRepoAndId()`.

*   `LicenseChecker#prPathToGitHubRepoAndId()`

    ```typescript
    prPathToGitHubRepoAndId(prPath: string): {
        repo: GitHubRepository;
        prId: string;
    };
    ```

    `prPath` must be in the form, `<owner>/<repo>/pull/<id>`. This method
    will return the `GitHubRepository` instance and the PR id for the
    `prPath`.

### <a name="hd-events"></a>Events

A `LicenseChecker` object emits following events during its processing.

*   `non-green-license`
    Emitted when a package with a non-green license is detected. The argument is
    ```typescript
    interface NonGreenLicense {
      packageName: string;
      version: string;
      licenseName: string|null;
      parentPackages: string[];
    }
    ```

*   `package.json`
    Emitted for each `package.json` file being checked. This is emitted only
    when checking local repositories or GitHub repositories, but not when
    checking remote packages.

    The argument is a file path string of the corresponding `package.json` file.

*   `end`
    Emitted when the processing is done. No argument is given.

*   `error`
    Emitted when an error occurrs while processing. The argument is
    ```typescript
    interface CheckError {
      err: Error;
      packageName: string;
      versionSpec: string;
      parentPackages: string[];
    }
    ```

[actions-image]: https://github.com/google/js-green-licenses/workflows/ci/badge.svg
[actions-url]: https://github.com/google/js-green-licenses/actions
[codecov-image]: https://codecov.io/gh/google/js-green-licenses/branch/main/graph/badge.svg
[codecov-url]: https://codecov.io/gh/google/js-green-licenses
[david-image]: https://david-dm.org/google/js-green-licenses.svg
[david-url]: https://david-dm.org/google/js-green-licenses
[gts-image]: https://img.shields.io/badge/code%20style-google-blueviolet.svg
[gts-url]: https://github.com/google/gts
[npm-image]: https://img.shields.io/npm/v/js-green-licenses.svg
[npm-url]: https://npmjs.org/package/js-green-licenses
[snyk-image]: https://snyk.io/test/github/google/js-green-licenses/badge.svg
[snyk-url]: https://snyk.io/test/github/google/js-green-licenses
