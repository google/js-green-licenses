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

import * as ava from 'ava';
import * as nock from 'nock';
import {GitHubRepository} from '../src/github';

function contextualize<T>(getContext: () => T): ava.RegisterContextual<T> {
  ava.test.beforeEach(t => {
    Object.assign(t.context, getContext());
  });
  return ava.test;
}
const test = contextualize(
    () => ({repo: new GitHubRepository('luke', 'star-destroyer')}));

test.afterEach.always('cleanup', (t) => {
  nock.cleanAll();
});

// NOTE: Tests must be run serially so that nock interceptions in each test
// don't interfere with other tests.

test.serial('should correctly get PR commit SHAs', async (t) => {
  const scope = nock('https://api.github.com')
                    .get('/repos/luke/star-destroyer/pulls/12345')
                    .reply(200, {
                      mergeable: true,
                      merge_commit_sha: 'deadbeef',
                      head: {sha: 'foobar'},
                    });
  const {mergeCommitSha, headCommitSha} =
      await t.context.repo.getPRCommits(12345);
  scope.done();
  t.is(mergeCommitSha, 'deadbeef');
  t.is(headCommitSha, 'foobar');
});

test.serial('should retry when unknown whether PR is mergeable', async (t) => {
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
  const {mergeCommitSha, headCommitSha} =
      await t.context.repo.getPRCommits(12345);
  firstScope.done();
  retryScope.done();
  t.is(mergeCommitSha, 'deadbeef');
  t.is(headCommitSha, 'foobar');
});

test.serial('should throw on max retries', async (t) => {
  const scope = nock('https://api.github.com')
                    .get('/repos/luke/star-destroyer/pulls/12345')
                    .reply(200, {
                      mergeable: null,
                    });
  // Currently gives up after 10 retries (i.e. 11 tries total).
  const err: Error = await t.throws(t.context.repo.getPRCommits(12345, 11));
  scope.done();
  t.is(
      err.message,
      'Tried 11 times but the mergeable field is not set. Giving up');
});

test.serial('should throw when PR is not mergeable', async (t) => {
  const scope = nock('https://api.github.com')
                    .get('/repos/luke/star-destroyer/pulls/12345')
                    .reply(200, {
                      mergeable: false,
                      merge_commit_sha: 'deadbeef',
                      head: {sha: 'foobar'},
                    });
  const err: Error = await t.throws(t.context.repo.getPRCommits(12345), Error);
  scope.done();
  t.is(err.message, 'PR is not mergeable');
});

test.serial('should throw when PR merge commit sha is not found', async (t) => {
  const scope = nock('https://api.github.com')
                    .get('/repos/luke/star-destroyer/pulls/12345')
                    .reply(200, {
                      mergeable: true,
                      head: {sha: 'foobar'},
                    });
  const err: Error = await t.throws(t.context.repo.getPRCommits(12345), Error);
  scope.done();
  t.is(err.message, 'Merge commit SHA is not found');
});

test.serial('should throw when PR HEAD commit sha is not found', async (t) => {
  const scope = nock('https://api.github.com')
                    .get('/repos/luke/star-destroyer/pulls/12345')
                    .reply(200, {
                      mergeable: true,
                      merge_commit_sha: 'deadbeef',
                    });
  const err: Error = await t.throws(t.context.repo.getPRCommits(12345), Error);
  scope.done();
  t.is(err.message, 'HEAD commit SHA is not found');
});

test.serial('retrieve file content', async (t) => {
  const scope =
      nock('https://api.github.com')
          .get('/repos/luke/star-destroyer/contents/src/foo.js?ref=deadbeef')
          .reply(200, {
            content: Buffer.from('this is foo.js').toString('base64'),
          });
  const content = await t.context.repo.getFileContent('deadbeef', 'src/foo.js');
  scope.done();
  t.is(content, 'this is foo.js');
});

test.serial('should retrieve package.json from a single repo', async (t) => {
  const scope =
      nock('https://api.github.com')
          .get('/repos/luke/star-destroyer/contents/package.json?ref=deadbeef')
          .reply(200, {
            content: Buffer.from('this is package.json').toString('base64'),
          });
  const pj = await t.context.repo.getPackageJsonFiles('deadbeef');
  scope.done();
  t.is(pj.length, 1);
  t.is(pj[0].filePath, '/package.json');
  t.is(pj[0].content, 'this is package.json');
});

test.serial('should handle no package.json files', async (t) => {
  const scope =
      nock('https://api.github.com')
          .get('/repos/luke/star-destroyer/contents/package.json?ref=deadbeef')
          .reply(404);
  const pj = await t.context.repo.getPackageJsonFiles('deadbeef');
  scope.done();
  t.is(pj.length, 0);
});

test.serial(
    'should throw when package.json does not have contents', async (t) => {
      const scope = nock('https://api.github.com')
                        .get(
                            '/repos/luke/star-destroyer/contents/package.json' +
                            '?ref=deadbeef')
                        .reply(200);
      const err: Error =
          await t.throws(t.context.repo.getPackageJsonFiles('deadbeef'), Error);
      scope.done();
      t.is(err.message, 'Content of package.json not found');
    });

test.serial('should get all package.json files from monorepo', async (t) => {
  const topScope =
      nock('https://api.github.com')
          .get('/repos/luke/star-destroyer/contents/package.json?ref=deadbeef')
          .reply(200, {
            content: Buffer.from('top-level package.json').toString('base64'),
          });
  const packagesScope =
      nock('https://api.github.com')
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
  const fooScope =
      nock('https://api.github.com')
          .get(
              '/repos/luke/star-destroyer/contents/packages/foo/package.json' +
              '?ref=deadbeef')
          .reply(200, {
            content: Buffer.from('foo package.json').toString('base64'),
          });
  const bazScope =
      nock('https://api.github.com')
          .get(
              '/repos/luke/star-destroyer/contents/packages/baz/package.json' +
              '?ref=deadbeef')
          .reply(200, {
            content: Buffer.from('baz package.json').toString('base64'),
          });
  const pj = await t.context.repo.getPackageJsonFiles('deadbeef');
  topScope.done();
  packagesScope.done();
  fooScope.done();
  bazScope.done();
  t.is(pj.length, 3);
  t.is(pj[0].filePath, '/package.json');
  t.is(pj[0].content, 'top-level package.json');
  t.is(pj[1].filePath, '/packages/foo/package.json');
  t.is(pj[1].content, 'foo package.json');
  t.is(pj[2].filePath, '/packages/baz/package.json');
  t.is(pj[2].content, 'baz package.json');
});
