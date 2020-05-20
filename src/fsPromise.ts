import {
  readdir,
  readFile as fsReadFile,
  copyFile,
  mkdir,
  writeFile as fsWriteFile,
} from "fs";
import { isAbsolute, resolve as resolvePath, basename } from "path";
import { parse as json5 } from "json5";

export const readFile = (path: string): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    fsReadFile(path, (error, data) => (error ? reject(error) : resolve(data)));
  });
};

export const childDirectories = (path: string): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    const absolute = isAbsolute(path) ? path : resolvePath(__dirname, path);
    readdir(absolute, { withFileTypes: true }, (error, files) => {
      if (error) reject(error);
      resolve(
        files
          .filter((file) => file.isDirectory())
          .map((file) => resolvePath(absolute, file.name))
      );
    });
  });
};

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

export const copy = async (src: string, dest: string): Promise<void> => {
  return new Promise(async (resolve, reject) => {
    try {
      const finalDest = resolvePath(__dirname, "../data", dest);
      await mkdirp(finalDest);
      copyFile(src, resolvePath(finalDest, basename(src)), (error) => {
        error ? reject(error) : resolve();
      });
    } catch (e) {
      reject(e);
    }
  });
};

export const writeJson = async (
  path: string,
  content: object
): Promise<void> => {
  return new Promise((resolve, reject) => {
    fsWriteFile(path, JSON.stringify(content), (error) => {
      error ? reject(error) : resolve();
    });
  });
};
