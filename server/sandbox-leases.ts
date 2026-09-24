import {deleteSandbox} from '@blaxel/core';
import type {Store} from './store';
import type {BuildInput} from './game-builder';

export async function deleteBuilderSandbox(name: string) {
  const {response} = await deleteSandbox({path: {sandboxName: name},
    throwOnError: false, signal: AbortSignal.timeout(30_000)});
  if (!response.ok && response.status !== 404) throw Error(`Sandbox deletion failed (${response.status})`);
}

/** The database, rather than a workspace-wide name scan, establishes ownership. */
export class SandboxLeases {
  constructor(private store: Store, private remove: (name: string) => Promise<unknown> = deleteBuilderSandbox) {}

  async reserve(name: string, input: BuildInput) {
    if (!input.projectId) return; // Standalone probes use the same mandatory VM expiration.
    await this.store.transaction(async query => {
      const [turn] = await query(`SELECT id FROM project_turns WHERE id=$1 AND project_id=$2
        AND status='working' AND lease_until>now() AND worker_id||':'||generation::text=$3 FOR UPDATE`,
      [input.jobId, input.projectId, input.leaseTag]);
      if (!turn) throw Error('Sandbox allocation no longer owns its worker lease');
      await query('INSERT INTO builder_sandboxes(name,turn_id,lease_tag) VALUES($1,$2,$3)',
        [name, input.jobId, input.leaseTag]);
    });
  }

  async release(name: string) {
    await this.store.query('DELETE FROM builder_sandboxes WHERE name=$1', [name]);
  }

  async reap() {
    const abandoned = await this.store.query(`SELECT b.name,b.expires_at<now() AS expired
      FROM builder_sandboxes b JOIN project_turns t ON t.id=b.turn_id
      WHERE b.check_after<=now() AND NOT (
        t.status='working' AND COALESCE(t.lease_until>now(),false)
        AND COALESCE(t.worker_id||':'||t.generation::text=b.lease_tag,false))
      ORDER BY b.check_after LIMIT 32`);
    for (const box of abandoned) {
      if (!/^microfinity-[a-f0-9]{16}-(agent|validator)$/.test(box.name)) throw Error('Invalid sandbox lease name');
      await this.remove(box.name);
      // Retain intent through the VM TTL: creation may still be in flight when a
      // worker dies. Repeated deletion catches that late allocation as well.
      if (box.expired) await this.release(box.name);
      else await this.store.query("UPDATE builder_sandboxes SET check_after=now()+interval '30 seconds' WHERE name=$1", [box.name]);
    }
  }
}
