// What agents did, kept so developers can debug a run and customers can see which agents act for them.
//
// The request log is in memory: one process, gone on restart. In production, write these records to your log pipeline
// or a table. They hold identifiers only, never a Session JWT, an access token or a request body.

import { MemoryConnectionStore } from './storage/memory.js';
import type { AgentConnection, ConnectionStore } from './storage/index.js';

export type { AgentConnection } from './storage/index.js';

/** `unverified`: the request carried a Poppy-Session header or a token that failed verification. */
export type CallerKind = 'agent_guest' | 'agent_signed_in' | 'person' | 'guest' | 'unverified';

export interface ActivityEntry {
  id: number;
  at: string;
  method: string;
  path: string;
  status: number;
  /** `ok`, or the `error` code the API answered with (`sign_in_required`, `session_ended`, `policy_denied`, ...). */
  outcome: string;
  /** A one-line human explanation of the outcome. */
  detail?: string;
  caller: CallerKind;
  /** The agent's client metadata URL, when a `Poppy-Session` header was verified. */
  agent?: string;
  /** `poppy.key`: one Session of one agent with one User. */
  sessionKey?: string;
  /** The account the request ran as, if any. */
  account?: string;
  durationMs: number;
}

const MAX_ENTRIES = 500;

/**
 * The request log stays in this process (it is for debugging a run). Agent connections go to a `ConnectionStore`,
 * shared across instances when Redis is configured, so the agents page and a disconnect see every instance's Sessions.
 */
export class ActivityLog {
  readonly #entries: ActivityEntry[] = [];
  readonly #connections: ConnectionStore;
  #nextId = 1;

  constructor(connections: ConnectionStore = new MemoryConnectionStore()) {
    this.#connections = connections;
  }

  record(entry: Omit<ActivityEntry, 'id'>): void {
    this.#entries.push({ id: this.#nextId++, ...entry });
    if (this.#entries.length > MAX_ENTRIES) {
      this.#entries.splice(0, this.#entries.length - MAX_ENTRIES);
    }
    if (entry.agent && entry.sessionKey) {
      // Recorded after the response is sent, so a store failure is logged rather than failing the request.
      this.#connections
        .touch({
          sessionKey: entry.sessionKey,
          agent: entry.agent,
          account: entry.account,
          at: entry.at,
          placedOrder: entry.method === 'POST' && entry.path === '/orders' && entry.status === 201,
        })
        .catch((error: unknown) => console.error(`carts-api: could not record an agent connection: ${(error as Error)?.message ?? error}`));
    }
  }

  /** Newest first. With `account`, only that account's requests and the agent Sessions joined to it. */
  async list(filter: { account?: string; agentOnly?: boolean; limit?: number } = {}): Promise<ActivityEntry[]> {
    const sessionKeys = filter.account
      ? new Set((await this.connections(filter.account)).map((connection) => connection.sessionKey))
      : undefined;
    return this.#entries
      .filter((entry) => !filter.agentOnly || entry.agent)
      .filter(
        (entry) =>
          !filter.account ||
          entry.account === filter.account ||
          (entry.sessionKey !== undefined && sessionKeys?.has(entry.sessionKey))
      )
      .slice(-(filter.limit ?? 100))
      .reverse();
  }

  connections(account?: string): Promise<AgentConnection[]> {
    return this.#connections.list(account);
  }

  connection(sessionKey: string): Promise<AgentConnection | undefined> {
    return this.#connections.get(sessionKey);
  }

  markEnded(sessionKey: string): Promise<void> {
    return this.#connections.markEnded(sessionKey, new Date().toISOString());
  }
}
