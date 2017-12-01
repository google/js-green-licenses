// Abstractions over GitHub REST API v3 and related features. For GitHub API,
// see https://developer.github.com/v3/.

import axios from 'axios';
import {posix as posixPath} from 'path';
import {URL, URLSearchParams} from 'url';

interface SingleResponseData {
  content?: string;
  merge_commit_sha?: string;
  name?: string;
  type?: string;
}
type ResponseData = SingleResponseData|SingleResponseData[];

function isSingleResponseData(respData: ResponseData):
    respData is SingleResponseData {
  return !Array.isArray(respData);
}

function ensureSingleResponseData(respData: ResponseData): SingleResponseData {
  if (!isSingleResponseData(respData)) {
    throw new Error('Expected a single response, got multiple.');
  }
  return respData;
}

interface QueryParams {
  [key: string]: string|string[];
}

export interface PackageJsonFile {
  filePath: string;
  content: string;
}

export class GitHubRepository {
  private readonly pathPrefix: string;

  constructor(owner: string, repo: string) {
    this.pathPrefix = posixPath.join('/repos', owner, repo);
  }

  private async api(path: string, params?: QueryParams): Promise<ResponseData> {
    const url = new URL('https://api.github.com');
    url.pathname = posixPath.join(this.pathPrefix, path);
    if (params) {
      const searchParams = new URLSearchParams(params);
      url.search = searchParams.toString();
    }
    const resp = await axios.get(url.toString());
    return resp.data;
  }

  async getPRMergeCommit(prId: number): Promise<string> {
    let answer = await this.api(posixPath.join('pulls', prId.toString()));
    answer = ensureSingleResponseData(answer);
    const mergeCommit = answer.merge_commit_sha;
    if (!mergeCommit) {
      throw new Error('Merge commit SHA is not found');
    }
    return mergeCommit;
  }

  private async getSinglePackageJson(dir: string, commitSha: string):
      Promise<PackageJsonFile|null> {
    let answer: ResponseData;
    try {
      answer = await this.api(
          posixPath.join('contents', dir, 'package.json'), {ref: commitSha});
    } catch {
      return null;
    }
    answer = ensureSingleResponseData(answer);
    if (answer.content === undefined) {
      throw new Error('Content of package.json not found');
    }
    const filePath = posixPath.join('/', dir, 'package.json');
    const content = Buffer.from(answer.content, 'base64').toString();
    return {filePath, content};
  }

  async getPackageJsonFiles(commitSha: string): Promise<PackageJsonFile[]> {
    const packageJsons: PackageJsonFile[] = [];

    // Find the top-level package.json first.
    const pj = await this.getSinglePackageJson('', commitSha);
    if (pj !== null) {
      packageJsons.push(pj);
    }

    // Find `packages/<name>/package.json` files in case this is a monorepo.
    let answer: ResponseData;
    try {
      answer = await this.api('contents/packages', {ref: commitSha});
    } catch {
      // Not a monorepo. Return just the top-level package.json.
      return packageJsons;
    }
    if (!isSingleResponseData(answer)) {
      // Response is an array, which means there's the `packages` directory and
      // this is a monorepo. Find package.json from each directory under
      // `packages`.
      for (const entry of answer) {
        if (entry.type === 'dir' && entry.name) {
          const pj = await this.getSinglePackageJson(
              posixPath.join('packages', entry.name), commitSha);
          if (pj !== null) {
            packageJsons.push(pj);
          }
        }
      }
    }

    return packageJsons;
  }
}
