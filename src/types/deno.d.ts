declare namespace Deno {
  function writeTextFile(path: string, data: string): Promise<void>;
  function readTextFile(path: string): Promise<string>;
  function mkdir(
    path: string,
    options?: { recursive?: boolean }
  ): Promise<void>;
}
