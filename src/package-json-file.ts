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

import {inspect} from 'util';

export interface OldLicenseField {
  type: string;
  url?: string;
}
export type License = string | OldLicenseField | OldLicenseField[];
export interface Dependencies {
  [pkg: string]: string;
}
export interface PackageJson {
  name: string;
  version: string;
  private?: boolean;
  license?: License;
  licenses?: License;
  dependencies?: Dependencies;
  devDependencies?: Dependencies;
}

function isOldLicenseField(obj: {}): obj is OldLicenseField {
  const field: OldLicenseField = obj as OldLicenseField;
  return (
    typeof field.type === 'string' &&
    (field.url === undefined || typeof field.url === 'string')
  );
}

function isLicense(obj: {}): obj is License {
  return (
    typeof obj === 'string' ||
    isOldLicenseField(obj) ||
    (Array.isArray(obj) && obj.every(isOldLicenseField))
  );
}

function isDependencies(obj: {[index: string]: {}}): obj is Dependencies {
  for (const key in obj) {
    // eslint-disable-next-line no-prototype-builtins
    if (obj.hasOwnProperty(key) && typeof obj[key] !== 'string') {
      return false;
    }
  }
  return true;
}

function isPackageJson(obj: {}): obj is PackageJson {
  const json = obj as PackageJson;
  return (
    (typeof json.private === 'boolean' && json.private) ||
    (typeof json.name === 'string' &&
      typeof json.version === 'string' &&
      (json.license === undefined || isLicense(json.license)) &&
      (json.licenses === undefined || isLicense(json.licenses)) &&
      (json.dependencies === undefined || isDependencies(json.dependencies)) &&
      (json.devDependencies === undefined ||
        isDependencies(json.devDependencies)))
  );
}

export function ensurePackageJson(obj: {}): PackageJson {
  if (!isPackageJson(obj)) {
    throw new Error(`Invalid package.json: ${inspect(obj)}`);
  }
  return obj;
}
