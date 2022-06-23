import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

export class FsHelpers {
  public static createDirIfNotExists(path: string): void {
    if (!existsSync(path)) {
      mkdirSync(path)
    }
  }

  public static writeFileSyncInDir(path: string, fileName: string, content: string): void {
    FsHelpers.createDirIfNotExists(path)
    writeFileSync(join(path, fileName), content)
  }
}