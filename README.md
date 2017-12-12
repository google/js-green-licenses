# JavaScript package.json License Checker

**This is not an official Google product.**

This is a tool for checking the license of JavaScript projects. It scans the
`package.json` file to check its license and recursively checks all of its
dependencies.

## How to use

```shell
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

This tool checks licenses for 1) an already published NPM package, 2) a local
directory, or 3) a GitHub pull request. For checking an NPM package, you can
just pass the package name (optionally together with the version) as the
argument. To check a local directory, you should pass the `--local
path/to/repo` argument. To check for a GitHub PR, you should pass the `--pr
<owner>/<repo>/pull/<id>` argument.

If the tool finds any non-green licenses in the given package or in its
dependencies, they will be printed out together with the detailed
information.

If you pass `--dev`, the `devDependencies` will be checked as well as the
`dependencies`.
