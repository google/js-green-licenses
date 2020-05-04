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

// Abstractions over GitHub REST API v3 and related features. For GitHub API,
// see https://developer.github.com/v3/.

import {request} from 'gaxios';
import {posix as posixPath} from 'path';
import {URL} from 'url';

interface SingleResponseData {
  content?: string;
  mergeable?: boolean | null;
  merge_commit_sha?: string;
  name?: string;
  type?: string;
  head?: {sha?: string};
}
type ResponseData = SingleResponseData | SingleResponseData[];

export interface PRCommits {
  mergeCommitSha: string; // commit sha to be used for merge
  headCommitSha: string;
}

export type CommitStatus = 'error' | 'failure' | 'pending' | 'success';

function isSingleResponseData(
  respData: ResponseData
): respData is SingleResponseData {
  return !Array.isArray(respData);
}

function ensureSingleResponseData(respData: ResponseData): SingleResponseData {
  if (!isSingleResponseData(respData)) {
    throw new Error('Expected a single response, got multiple.');
  }
  return respData;
}

interface QueryParams {
  [key: string]: string;
}

export interface PackageJsonFile {
  filePath: string;
  content: string;
}

export class GitHubRepository {
  private readonly pathPrefix: string;
  // How many times to retry PR commit retrieval until giving up.
  private static MAX_PR_COMMIT_RETRIES = 10;

  constructor(owner: string, repo: string) {
    this.pathPrefix = posixPath.join('/repos', owner, repo);
  }

  private getAxiosConfig(authToken?: string) {
    return authToken ? {headers: {Authorization: `token ${authToken}`}} : {};
  }

  private async apiGet(
    path: string,
    params?: QueryParams
  ): Promise<ResponseData> {
    const url = new URL('https://api.github.com');
    url.pathname = posixPath.join(this.pathPrefix, path);
    if (params) {
      Object.keys(params).forEach(key => {
        url.searchParams.set(key, params[key]);
      });
    }
    const resp = await request<ResponseData>({
      method: 'GET',
      url: url.href,
      ...this.getAxiosConfig(),
    });
    return resp.data;
  }

  private async apiPost(path: string, body?: {}): Promise<ResponseData> {
    const url = new URL('https://api.github.com');
    url.pathname = posixPath.join(this.pathPrefix, path);
    const resp = await request<ResponseData>({
      method: 'POST',
      url: url.href,
      data: body,
      ...this.getAxiosConfig(),
    });
    return resp.data;
  }

  async getPRCommits(prId: number, attemptCount = 1): Promise<PRCommits> {
    let answer = await this.apiGet(posixPath.join('pulls', prId.toString()));
    answer = ensureSingleResponseData(answer);
    if (answer.mergeable === null) {
      if (attemptCount > GitHubRepository.MAX_PR_COMMIT_RETRIES) {
        throw new Error(
          `Tried ${attemptCount} times but the mergeable field is not set. Giving up`
        );
      }
      console.log('The `mergeable` field is not set yet. Will retry later.');
      return new Promise<PRCommits>(resolve => {
        setTimeout(async () => {
          resolve(await this.getPRCommits(prId, attemptCount + 1));
        }, 1000);
      });
    } else if (!answer.mergeable) {
      throw new Error('PR is not mergeable');
    }
    const mergeCommitSha = answer.merge_commit_sha;
    if (!mergeCommitSha) {
      throw new Error('Merge commit SHA is not found');
    }
    const headCommitSha = answer.head && answer.head.sha;
    if (!headCommitSha) {
      throw new Error('HEAD commit SHA is not found');
    }
    return {mergeCommitSha, headCommitSha};
  }

  async createPRReview(
    prId: number,
    commitSha: string,
    body: string
  ): Promise<void> {
    await this.apiPost(posixPath.join('pulls', prId.toString(), 'reviews'), {
      commit_id: commitSha,
      body,
      event: 'COMMENT',
    });
  }

  async setCommitStatus(
    commitSha: string,
    status: CommitStatus,
    description: string,
    context?: string
  ): Promise<void> {
    await this.apiPost(posixPath.join('statuses', commitSha), {
      state: status,
      description,
      context,
    });
  }

  async getFileContent(
    commitSha: string,
    path: string
  ): Promise<string | null> {
    let answer: ResponseData;
    try {
      answer = await this.apiGet(posixPath.join('contents', path), {
        ref: commitSha,
      });
    } catch {
      return null;
    }
    answer = ensureSingleResponseData(answer);
    if (answer.content === undefined) {
      throw new Error(`Content of ${path} not found`);
    }
    const content = Buffer.from(answer.content, 'base64').toString();
    return content;
  }

  private async getSinglePackageJson(
    dir: string,
    commitSha: string
  ): Promise<PackageJsonFile | null> {
    const content = await this.getFileContent(
      commitSha,
      posixPath.join(dir, 'package.json')
    );
    if (!content) {
      return null;
    }
    const filePath = posixPath.join('/', dir, 'package.json');
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
      answer = await this.apiGet('contents/packages', {ref: commitSha});
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
            posixPath.join('packages', entry.name),
            commitSha
          );
          if (pj !== null) {
            packageJsons.push(pj);
          }
        }
      }
    }

    return packageJsons;
  }
}
