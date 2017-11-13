// TODO(jinwoo): Contribute to @types.
declare module 'spdx-correct' {
  function correct(identifier: string): string|null;
  export = correct;
}
