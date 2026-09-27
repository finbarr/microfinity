// Real bundled cartridges and the full app, backed by a disposable local database.
import {mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
process.env.DOTENV_CONFIG_PATH = '/dev/null';
process.env.DATA_DIR = await mkdtemp(join(tmpdir(), 'microfinity-cartridge-audit-'));
process.env.DATABASE_URL = '';
process.env.OPENAI_API_KEY = '';
process.env.TYPESAFE_API_KEY = '';
process.env.BUILDER_WORKER = 'external';
process.env.PORT = '4319';
console.log(`Disposable cartridge audit data: ${process.env.DATA_DIR}`);
await import('../server/index');
