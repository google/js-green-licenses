# Changelog

[npm history][1]

[1]: https://www.npmjs.com/package/js-green-licenses?activeTab=versions

### [3.0.1](https://www.github.com/google/js-green-licenses/compare/v3.0.0...v3.0.1) (2021-04-05)


### Bug Fixes

* handle incorrect licenses fields ([#146](https://www.github.com/google/js-green-licenses/issues/146)) ([209847f](https://www.github.com/google/js-green-licenses/commit/209847fa96d3f8676cfb292ef879a7e58e4cdecd))

## [3.0.0](https://www.github.com/google/js-green-licenses/compare/v2.0.1...v3.0.0) (2021-01-22)


### ⚠ BREAKING CHANGES

* The `packageWhitelist` field has been renamed to `packageAllowlist`.

### Features

* added skipping of package.json check if package is whitelisted (resolves [#118](https://www.github.com/google/js-green-licenses/issues/118)) ([#136](https://www.github.com/google/js-green-licenses/issues/136)) ([0d95d18](https://www.github.com/google/js-green-licenses/commit/0d95d18eb146bb8a003e741789729cf88d7e759c))
* use allowlist for allowed licenses ([#153](https://www.github.com/google/js-green-licenses/issues/153)) ([d24827f](https://www.github.com/google/js-green-licenses/commit/d24827fa25d66020f876412f706a9dfbd8b56a98))


### Bug Fixes

* **deps:** update dependency gaxios to v4 ([#148](https://www.github.com/google/js-green-licenses/issues/148)) ([9b66f9c](https://www.github.com/google/js-green-licenses/commit/9b66f9cd1768c4a7f5dde454192a9dc0f0d10c8f))
* **deps:** use meow for argument parsing ([#156](https://www.github.com/google/js-green-licenses/issues/156)) ([ae07bc8](https://www.github.com/google/js-green-licenses/commit/ae07bc81f21a7be753424c4dfc3fed4c6ee69060))

### [2.0.1](https://www.github.com/google/js-green-licenses/compare/v2.0.0...v2.0.1) (2020-05-18)


### Bug Fixes

* Added support for the UNLICENSED NPM magic value (fixes [#113](https://www.github.com/google/js-green-licenses/issues/113)) ([#134](https://www.github.com/google/js-green-licenses/issues/134)) ([c7966eb](https://www.github.com/google/js-green-licenses/commit/c7966eb39a95c3376f3845f7797bb3d72f2c5904))

## [2.0.0](https://www.github.com/google/js-green-licenses/compare/v1.1.0...v2.0.0) (2020-05-07)


### ⚠ BREAKING CHANGES

* drop support for node.js 8 (#124)

### Bug Fixes

* **deps:** update dependency gaxios to v3 ([#121](https://www.github.com/google/js-green-licenses/issues/121)) ([1fdd3e4](https://www.github.com/google/js-green-licenses/commit/1fdd3e4e7ad642da55ad94b72d71049f4789310c))
* **deps:** update dependency npm-package-arg to v7 ([#110](https://www.github.com/google/js-green-licenses/issues/110)) ([25d0235](https://www.github.com/google/js-green-licenses/commit/25d0235d0ff996b644fe84482241bda5a4b14b2a))
* **deps:** update dependency npm-package-arg to v8 ([#111](https://www.github.com/google/js-green-licenses/issues/111)) ([4763858](https://www.github.com/google/js-green-licenses/commit/4763858fe10d35e2f1e944d0f4e91a309503c812))
* add 0BSD as a valid license ([#132](https://www.github.com/google/js-green-licenses/issues/132)) ([e4db3eb](https://www.github.com/google/js-green-licenses/commit/e4db3ebe01bf49a922f0d3a0d71d9ee4af83cdf0))


### Build System

* drop support for node.js 8 ([#124](https://www.github.com/google/js-green-licenses/issues/124)) ([06283e1](https://www.github.com/google/js-green-licenses/commit/06283e10c44306f88cdb382ac9d593f4a48c0b7d))

## [1.1.0](https://www.github.com/google/js-green-licenses/compare/v1.0.0...v1.1.0) (2019-06-05)


### Features

* support local paths ([#101](https://www.github.com/google/js-green-licenses/issues/101)) ([6d08407](https://www.github.com/google/js-green-licenses/commit/6d08407))

## [1.0.0](https://www.github.com/google/js-green-licenses/compare/v0.5.0...v1.0.0) (2019-05-29)


### ⚠ BREAKING CHANGES

* Drop support for Node.js 6.x which reaching EOL in a
couple of weeks.

### Bug Fixes

* fails to check monorepo with non-published packages ([#89](https://www.github.com/google/js-green-licenses/issues/89)) ([96a7279](https://www.github.com/google/js-green-licenses/commit/96a7279))
* **deps:** update dependency strip-json-comments to v3 ([#88](https://www.github.com/google/js-green-licenses/issues/88)) ([494a457](https://www.github.com/google/js-green-licenses/commit/494a457))
* set exit code on error ([#84](https://www.github.com/google/js-green-licenses/issues/84)) ([2da6cc5](https://www.github.com/google/js-green-licenses/commit/2da6cc5)), closes [#65](https://www.github.com/google/js-green-licenses/issues/65)
* **deps:** update dependency package-json to v6 ([#79](https://www.github.com/google/js-green-licenses/issues/79)) ([26632ea](https://www.github.com/google/js-green-licenses/commit/26632ea))
* let make-dir use its own types ([#72](https://www.github.com/google/js-green-licenses/issues/72)) ([cb5abb9](https://www.github.com/google/js-green-licenses/commit/cb5abb9))
* **deps:** update dependency pify to v4 ([#53](https://www.github.com/google/js-green-licenses/issues/53)) ([beb2800](https://www.github.com/google/js-green-licenses/commit/beb2800))
* **deps:** update dependency spdx-satisfies to v5 ([#71](https://www.github.com/google/js-green-licenses/issues/71)) ([95f0ead](https://www.github.com/google/js-green-licenses/commit/95f0ead))
* **package:** update package-json to version 5.0.0 ([#41](https://www.github.com/google/js-green-licenses/issues/41)) ([17ded94](https://www.github.com/google/js-green-licenses/commit/17ded94))
* **test:** get the tests passing again ([#65](https://www.github.com/google/js-green-licenses/issues/65)) ([6d009b8](https://www.github.com/google/js-green-licenses/commit/6d009b8))


### Build System

* drop support for Node 6 ([#78](https://www.github.com/google/js-green-licenses/issues/78)) ([598dfea](https://www.github.com/google/js-green-licenses/commit/598dfea))


### Features

* support private packages ([#83](https://www.github.com/google/js-green-licenses/issues/83)) ([9b9a80e](https://www.github.com/google/js-green-licenses/commit/9b9a80e))
