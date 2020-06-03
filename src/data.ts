import {
  readFile as fsReadFile,
  copyFile,
  mkdir,
  writeFile as fsWriteFile,
} from "fs";
import { resolve as resolvePath, basename, relative } from "path";
import { parse as json5 } from "json5";

export const STATIC = resolvePath(__dirname, "../data");
export const RUNTIME = resolvePath(__dirname, "../.data");

export const manifest = (dataPath: string, name: string): string =>
  resolvePath(dataPath, `${name}.json`);

export const dataBlock = (dataPath: string, blockName: string): string =>
  resolvePath(dataPath, blockName);

export const portable = (path: string): string => relative(__dirname, path);

export const readJson = async <R, T = R>(
  path: string,
  transform: (json: R) => T = (json: R): T => (json as unknown) as T
): Promise<T> => {
  const text = (await new Promise((resolve, reject) => {
    fsReadFile(path, "utf-8", (error, data) =>
      error ? reject(error) : resolve(data.toString())
    );
  })) as string;
  return transform(json5(text));
};

export const mkdirp = async (dir: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    mkdir(dir, { recursive: true }, (error) => {
      error ? reject(error) : resolve();
    });
  });
};

export const copyEntry = async (
  src: string,
  dataBlock: string
): Promise<string> => {
  return new Promise(async (resolve, reject) => {
    try {
      await mkdirp(dataBlock);
      const path = resolvePath(dataBlock, basename(src));
      copyFile(src, path, (error) => {
        error ? reject(error) : resolve(path);
      });
    } catch (e) {
      reject(e);
    }
  });
};

export const writeManifest = async (
  dataPath: string,
  name: string,
  content: object
): Promise<void> => {
  return new Promise((resolve, reject) => {
    fsWriteFile(manifest(dataPath, name), JSON.stringify(content), (error) => {
      error ? reject(error) : resolve();
    });
  });
};

export const readManifest = async <R>(
  dataPath: string,
  name: string
): Promise<R> => readJson<R>(manifest(dataPath, name));
