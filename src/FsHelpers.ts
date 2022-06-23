import { existsSync, mkdirSync } from 'fs';

export class FsHelpers {
  public static createDirIfNotExists(path: string): void {
    if (!existsSync(path)) {
      mkdirSync(path)
    }
  }
}