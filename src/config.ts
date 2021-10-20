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

import * as fs from 'fs';
import * as path from 'path';
import stripJsonComments from 'strip-json-comments';
import {promisify} from 'util';

import {GitHubRepository} from './github';

const fsReadFile = promisify(fs.readFile);

const CONFIG_FILE_NAME = 'js-green-licenses.json';

export interface Config {
  // Licenses specified in this list are considered green.
  greenLicenses?: string[];
  // Packages specified in this list are considered green.
  packageAllowlist?: string[];
}

function isConfig(obj: {}): obj is Config {
  const config: Config = obj;
  const isStringArray = (obj?: {}) => {
    return (
      !obj || (Array.isArray(obj) && obj.every(x => typeof x === 'string'))
    );
  };
  return (
    isStringArray(config.greenLicenses) &&
    isStringArray(config.packageAllowlist)
  );
}

function ensureConfig(obj: {}): Config {
  if (!isConfig(obj)) {
    throw new Error('Invalid config contents');
  }
  return obj;
}

function parseJson(input: string): {} {
  return JSON.parse(stripJsonComments(input));
}

export async function getLocalConfig(
  directory: string
): Promise<Config | null> {
  try {
    const content = await fsReadFile(
      path.join(directory, CONFIG_FILE_NAME),
      'utf8'
    );
    return ensureConfig(parseJson(content));
  } catch (e) {
    const err = e as Error & {code: string};
    if (err.code !== 'ENOENT') {
      console.error(
        '[js-green-licenses] Error while reading config file:',
        err
      );
    }
    return null;
  }
}

export async function getGitHubConfig(
  repo: GitHubRepository,
  commitSha: string
): Promise<Config | null> {
  const content = await repo.getFileContent(commitSha, CONFIG_FILE_NAME);
  if (!content) {
    return null;
  }
  try {
    return ensureConfig(parseJson(content));
  } catch (err) {
    console.error('[js-green-licenses] Error while reading config file:', err);
    return null;
  }
}
