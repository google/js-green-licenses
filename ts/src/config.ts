import * as fs from 'fs';
import * as path from 'path';
import {promisify} from 'util';

import {GitHubRepository} from './github';

const fsReadFile = promisify(fs.readFile);

const CONFIG_FILE_NAME = 'js-green-licenses.json';

export interface Config {
  // Licenses specified in this list are considered green.
  greenLicenses?: string[];
  // Packages specified in this list are considered green.
  packageWhitelist?: string[];
}

function isConfig(obj: {}): obj is Config {
  const config: Config = obj;
  const isStringArray = (obj?: {}) => {
    return !obj ||
        (Array.isArray(obj) && obj.every((x) => typeof x === 'string'));
  };
  return isStringArray(config.greenLicenses) &&
      isStringArray(config.packageWhitelist);
}

function ensureConfig(obj: {}): Config {
  if (!isConfig(obj)) {
    throw new Error('Invalid config contents');
  }
  return obj;
}

export async function getLocalConfig(directory: string): Promise<Config|null> {
  try {
    const content =
        await fsReadFile(path.join(directory, CONFIG_FILE_NAME), 'utf8');
    return ensureConfig(JSON.parse(content));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(
          '[js-green-licenses] Error while reading config file:', err);
    }
    return null;
  }
}

export async function getGitHubConfig(
    repo: GitHubRepository, commitSha: string): Promise<Config|null> {
  const content = await repo.getFileContent(commitSha, CONFIG_FILE_NAME);
  if (!content) {
    return null;
  }
  try {
    return ensureConfig(JSON.parse(content));
  } catch {
    return null;
  }
}
