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

import * as assert from 'assert';
import nock from 'nock';
import {describe, it, beforeEach, afterEach} from 'mocha';
import {GitHubRepository} from '../src/github';

describe(__filename, () => {
  let repo: GitHubRepository;
  beforeEach(() => {
    repo = new GitHubRepository('luke', 'star-destroyer');
  });

  afterEach(() => nock.cleanAll());

  it('should correctly get PR commit SHAs', async () => {
    const scope = nock('https://api.github.com')
      .get('/repos/luke/star-destroyer/pulls/12345')
      .reply(200, {
        mergeable: true,
        merge_commit_sha: 'deadbeef',
        head: {sha: 'foobar'},
      });
    const {mergeCommitSha, headCommitSha} = await repo.getPRCommits(12345);
    scope.done();
    assert.strictEqual(mergeCommitSha, 'deadbeef');
    assert.strictEqual(headCommitSha, 'foobar');
  });

  it('should retry when unknown whether PR is mergeable', async () => {
    const firstScope = nock('https://api.github.com')
      .get('/repos/luke/star-destroyer/pulls/12345')
      .reply(200, {
        mergeable: null,
      });
    const retryScope = nock('https://api.github.com')
      .get('/repos/luke/star-destroyer/pulls/12345')
      .reply(200, {
        mergeable: true,
        merge_commit_sha: 'deadbeef',
        head: {sha: 'foobar'},
      });
    const {mergeCommitSha, headCommitSha} = await repo.getPRCommits(12345);
    firstScope.done();
    retryScope.done();
    assert.strictEqual(mergeCommitSha, 'deadbeef');
    assert.strictEqual(headCommitSha, 'foobar');
  });

  it('should throw on max retries', async () => {
    const scope = nock('https://api.github.com')
      .get('/repos/luke/star-destroyer/pulls/12345')
      .reply(200, {
        mergeable: null,
      });
    // Currently gives up after 10 retries (i.e. 11 tries total).
    await assert.rejects(
      repo.getPRCommits(12345, 11),
      /Tried 11 times but the mergeable field is not set. Giving up/
    );
    scope.done();
  });

  it('should throw when PR is not mergeable', async () => {
    const scope = nock('https://api.github.com')
      .get('/repos/luke/star-destroyer/pulls/12345')
      .reply(200, {
        mergeable: false,
        merge_commit_sha: 'deadbeef',
        head: {sha: 'foobar'},
      });
    await assert.rejects(repo.getPRCommits(12345), /PR is not mergeable/);
    scope.done();
  });

  it('should throw when PR merge commit sha is not found', async () => {
    const scope = nock('https://api.github.com')
      .get('/repos/luke/star-destroyer/pulls/12345')
      .reply(200, {
        mergeable: true,
        head: {sha: 'foobar'},
      });
    await assert.rejects(
      repo.getPRCommits(12345),
      /Merge commit SHA is not found/
    );
    scope.done();
  });

  it('should throw when PR HEAD commit sha is not found', async () => {
    const scope = nock('https://api.github.com')
      .get('/repos/luke/star-destroyer/pulls/12345')
      .reply(200, {
        mergeable: true,
        merge_commit_sha: 'deadbeef',
      });
    await assert.rejects(
      repo.getPRCommits(12345),
      /HEAD commit SHA is not found/
    );
    scope.done();
  });

  it('retrieve file content', async () => {
    const scope = nock('https://api.github.com')
      .get('/repos/luke/star-destroyer/contents/src/foo.js?ref=deadbeef')
      .reply(200, {
        content: Buffer.from('this is foo.js').toString('base64'),
      });
    const content = await repo.getFileContent('deadbeef', 'src/foo.js');
    scope.done();
    assert.strictEqual(content, 'this is foo.js');
  });

  it('should retrieve package.json from a single repo', async () => {
    const scope = nock('https://api.github.com')
      .get('/repos/luke/star-destroyer/contents/package.json?ref=deadbeef')
      .reply(200, {
        content: Buffer.from('this is package.json').toString('base64'),
      });
    const pj = await repo.getPackageJsonFiles('deadbeef');
    scope.done();
    assert.strictEqual(pj.length, 1);
    assert.strictEqual(pj[0].filePath, '/package.json');
    assert.strictEqual(pj[0].content, 'this is package.json');
  });

  it('should handle no package.json files', async () => {
    const scope = nock('https://api.github.com')
      .get('/repos/luke/star-destroyer/contents/package.json?ref=deadbeef')
      .reply(404);
    const pj = await repo.getPackageJsonFiles('deadbeef');
    scope.done();
    assert.strictEqual(pj.length, 0);
  });

  it('should throw when package.json does not have contents', async () => {
    const scope = nock('https://api.github.com')
      .get('/repos/luke/star-destroyer/contents/package.json' + '?ref=deadbeef')
      .reply(200);
    await assert.rejects(
      repo.getPackageJsonFiles('deadbeef'),
      /Content of package.json not found/
    );
    scope.done();
  });

  it('should get all package.json files from monorepo', async () => {
    const topScope = nock('https://api.github.com')
      .get('/repos/luke/star-destroyer/contents/package.json?ref=deadbeef')
      .reply(200, {
        content: Buffer.from('top-level package.json').toString('base64'),
      });
    const packagesScope = nock('https://api.github.com')
      .get('/repos/luke/star-destroyer/contents/packages?ref=deadbeef')
      .reply(200, [
        {
          type: 'dir',
          name: 'foo',
        },
        {
          type: 'file',
          name: 'bar',
        },
        {
          type: 'dir',
          name: 'baz',
        },
      ]);
    const fooScope = nock('https://api.github.com')
      .get(
        '/repos/luke/star-destroyer/contents/packages/foo/package.json' +
          '?ref=deadbeef'
      )
      .reply(200, {
        content: Buffer.from('foo package.json').toString('base64'),
      });
    const bazScope = nock('https://api.github.com')
      .get(
        '/repos/luke/star-destroyer/contents/packages/baz/package.json' +
          '?ref=deadbeef'
      )
      .reply(200, {
        content: Buffer.from('baz package.json').toString('base64'),
      });
    const pj = await repo.getPackageJsonFiles('deadbeef');
    topScope.done();
    packagesScope.done();
    fooScope.done();
    bazScope.done();
    assert.strictEqual(pj.length, 3);
    assert.strictEqual(pj[0].filePath, '/package.json');
    assert.strictEqual(pj[0].content, 'top-level package.json');
    assert.strictEqual(pj[1].filePath, '/packages/foo/package.json');
    assert.strictEqual(pj[1].content, 'foo package.json');
    assert.strictEqual(pj[2].filePath, '/packages/baz/package.json');
    assert.strictEqual(pj[2].content, 'baz package.json');
  });
});
