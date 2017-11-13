import {inspect} from 'util';

export interface OldLicenseField {
  type: string;
  url?: string;
}
export type License = string|OldLicenseField|OldLicenseField[];
export interface Dependencies { [pkg: string]: string; }
export interface PackageJson {
  name: string;
  version: string;
  license?: License;
  licenses?: License;
  dependencies?: Dependencies;
  devDependencies?: Dependencies;
}

function isOldLicenseField(obj: {}): obj is OldLicenseField {
  const field: OldLicenseField = obj as OldLicenseField;
  return typeof field.type === 'string' &&
      (field.url === undefined || typeof field.url === 'string');
}

function isLicense(obj: {}): obj is License {
  return typeof obj === 'string' || isOldLicenseField(obj) ||
      (Array.isArray(obj) && obj.every(isOldLicenseField));
}

function isDependencies(obj: {}): obj is Dependencies {
  return Object.values(obj).every(x => typeof x === 'string');
}

function isPackageJson(obj: {}): obj is PackageJson {
  const json = obj as PackageJson;
  return typeof json.name === 'string' && typeof json.version === 'string' &&
      (json.license === undefined || isLicense(json.license)) &&
      (json.licenses === undefined || isLicense(json.licenses)) &&
      (json.dependencies === undefined || isDependencies(json.dependencies)) &&
      (json.devDependencies === undefined ||
       isDependencies(json.devDependencies));
}

export function ensurePackageJson(obj: {}): PackageJson {
  if (!isPackageJson(obj)) {
    throw new Error(`Invalid package.json: ${inspect(obj)}`);
  }
  return obj;
}
