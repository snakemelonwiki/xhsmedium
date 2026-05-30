import { Logger as TypeOrmLogger, QueryRunner } from 'typeorm';
import { highlight } from 'sql-highlight';
import { format } from 'sql-formatter';

export class FormattedSqlLogger implements TypeOrmLogger {
  private fmt(query: string): string {
    try { return highlight(format(query, { language: 'mysql' })); }
    catch { return highlight(query); }
  }

  logQuery(query: string, parameters?: any[]) {
    console.log(this.fmt(query));
    if (parameters?.length) console.log('\x1b[33m[PARAMS]\x1b[0m', JSON.stringify(parameters));
  }

  logQueryError(error: string, query: string, parameters?: any[]) {
    console.error('\x1b[31m[SQL ERROR]\x1b[0m', error);
    this.logQuery(query, parameters);
  }

  logQuerySlow(time: number, query: string, parameters?: any[]) {
    console.warn(`\x1b[33m[SLOW - ${time}ms]\x1b[0m`);
    this.logQuery(query, parameters);
  }

  logSchemaBuild(message: string) { console.log(`\x1b[36m[SCHEMA]\x1b[0m ${message}`); }
  logMigration(message: string) { console.log(`\x1b[36m[MIGRATION]\x1b[0m ${message}`); }
  log(level: 'log' | 'info' | 'warn', message: any) {
    console[level === 'warn' ? 'warn' : 'log'](`\x1b[36m[${level.toUpperCase()}]\x1b[0m ${message}`);
  }
}
