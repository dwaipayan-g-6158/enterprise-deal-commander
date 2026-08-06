// Stratus object storage — the overflow tier for text that will not fit a Data
// Store column.
//
// Data Store `text` caps at 10,000 chars (see
// docs/catalyst-datastore-constraints.md). Everything in this app fits today;
// `v2_deal_snapshots.payload` is the one field with a credible path to
// outgrowing it, so it has a `payload_key` column reserved for an object stored
// here. See `createDealSnapshotsRepo` in ./repositories/intel-core.ts for the
// hybrid write, and docs/CATALYST_SCHEMA.md for why the offload is
// threshold-triggered rather than unconditional.
//
// SCOPE — this cost real debugging time, so read it before changing anything.
//
// These helpers deliberately IGNORE the caller's `catalystApp` and build their
// own ADMIN-scoped one. The SDK annotates the object operations
// `@access admin, user`, which reads as "a user-scoped app is fine". It is not,
// for this app's users: an **Authenticated** bucket grants access to *project
// users*, and the Stratus docs are explicit that this "applies to project users
// only — not Collaborators or Admins". Every human who signs into EDC is a
// Catalyst App Administrator, so a user-scoped write is refused.
//
// Measured, not assumed. The offload initially worked from the cron
// (`POST /api/v1/jobs/snapshots`) and silently failed from the event-driven
// path, which is the confusing half: both call the same repository. The
// difference is identity — a cron request carries no user session, so its app
// acts as the application itself, while an event carries a signed-in
// administrator's app. An earlier probe missed this entirely because it ran
// BOTH of its arms inside the job route, so its "user-scoped" arm was really
// the app's own identity too.
//
// Upgrading the caller's app via `adminAppFor` (sdk.ts) rather than threading a
// second app down from the request layer is what keeps this contained: the
// event bus has no `req` to derive one from, and adding a second app to
// `DealEventBase` would mean a second SDK initialization on all 14
// `emitDealEvent` call sites for a path that is almost never taken.

import type { Readable } from "node:stream";
import { adminAppFor, type CatalystApp } from "./sdk";

/**
 * Created once, by hand, in the Console (Cloud Scale → Stratus → Create
 * Bucket) with the **Authenticated** permission template — there is no
 * `Create_Bucket` API or MCP tool, so this cannot be provisioned from code.
 */
export const SNAPSHOT_BUCKET = "edc-deal-snapshots";

interface StratusBucket {
  putObject(key: string, body: string | Buffer): Promise<unknown>;
  getObject(key: string, options?: { range?: string; versionId?: string }): Promise<Readable>;
  deleteObject(key: string): Promise<unknown>;
}

function bucket(catalystApp: CatalystApp, name: string): StratusBucket {
  return (adminAppFor(catalystApp) as { stratus(): { bucket(n: string): StratusBucket } })
    .stratus()
    .bucket(name);
}

/**
 * `getObject` resolves to a **`Readable`, not a Buffer** — a detail worth
 * stating plainly because getting it wrong fails in a thoroughly misleading
 * way: `Buffer.from(stream)` throws "The first argument must be of type string
 * or an instance of Buffer… Received an instance of IncomingMessage", which
 * reads like a bad argument to the CALLER rather than a stream that needed
 * consuming. (That exact error is what the scope probe returned, and it briefly
 * looked like a permissions failure.)
 */
async function streamToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer));
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Store an already-serialized JSON document. */
export async function putJsonObject(
  catalystApp: CatalystApp,
  bucketName: string,
  key: string,
  serialized: string,
): Promise<void> {
  await bucket(catalystApp, bucketName).putObject(key, serialized);
}

/**
 * Read a JSON document back. Returns null when the object is missing or
 * unparseable rather than throwing: an offloaded payload is supporting detail
 * (a trajectory point, a baseline alert count), and a single unreadable blob
 * must not take down a dashboard that is otherwise fine. The caller sees the
 * same `payload: null` it would see for a snapshot written before payloads
 * existed.
 */
export async function getJsonObject<T>(
  catalystApp: CatalystApp,
  bucketName: string,
  key: string,
): Promise<T | null> {
  try {
    const stream = await bucket(catalystApp, bucketName).getObject(key);
    const text = await streamToString(stream);
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}
