import * as fs from 'fs';
import * as path from 'path';
import {promisify} from 'util';

const fsReadFile = promisify(fs.readFile);

const CONFIG_FILE_NAME = 'js-green-licenses.json';

export interface Config {
  // Packages specified in this list are considered green.
  packageWhitelist?: string[];
}

function isConfig(obj: {}): obj is Config {
  const config: Config = obj;
  const packageWhitelist = config.packageWhitelist;
  return (packageWhitelist === undefined) || Array.isArray(packageWhitelist);
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
