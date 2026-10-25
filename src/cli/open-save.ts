import { SaveTooNewError, SqliteStore } from '../store/sqlite-store.ts';

/**
 * Opens a town's save for a command: an older save is upgraded in place (after
 * a backup beside it), and a save from newer code stops the command with a
 * plain message instead of being overwritten.
 */
export function openSave(path: string): SqliteStore {
  try {
    return new SqliteStore(path, { log: (line) => console.log(line) });
  } catch (err) {
    if (err instanceof SaveTooNewError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}
