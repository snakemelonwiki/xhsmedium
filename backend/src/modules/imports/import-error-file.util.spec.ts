import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeImportErrorFile } from './import-error-file.util';

describe('writeImportErrorFile', () => {
  it('writes failed rows as downloadable csv and returns errorFileUrl', () => {
    const root = mkdtempSync(join(tmpdir(), 'import-errors-'));
    try {
      const result = writeImportErrorFile(root, 'task-1', [
        { rowIndex: 2, raw: 'bad,row', message: '平台缺失' },
      ]);

      expect(result).toBe('/uploads/import-errors/task-1-errors.csv');
      const file = readFileSync(join(root, 'uploads/import-errors/task-1-errors.csv'), 'utf8');
      expect(file).toContain('row,message,raw');
      expect(file).toContain('2,平台缺失,"bad,row"');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
