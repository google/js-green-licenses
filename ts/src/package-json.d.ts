// TODO(jinwoo): Open a PR against package-json or @types.
declare module 'package-json' {
  interface PackageJsonOptions {
    version?: string;
    fullMetadata?: boolean;
    allVersions?: boolean;
  }

  function packageJson(name: string, options?: PackageJsonOptions): Promise<{}>;

  export = packageJson;
}
