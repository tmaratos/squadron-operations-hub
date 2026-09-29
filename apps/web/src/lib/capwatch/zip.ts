// Reading a ZIP where there is no unzip.
//
// CAPWATCH answers with a ZIP of text files and the Hub runs on Cloudflare Workers, which has no filesystem
// and no archive library. What it does have is DecompressionStream, which is the only part of this that is
// hard; the rest of a ZIP is a handful of fixed-size records and a table at the end.
//
// This reads the central directory rather than scanning for local headers, because the central directory is
// the archive's own index: it says what is in the file and where, and trusting it means never guessing at a
// boundary. Everything is bounds-checked against the buffer - a truncated download is the expected failure
// here, not an exotic one, and it must read as "this archive is broken" rather than as a crash or, worse,
// as an empty-but-valid extract that then wipes the member directory.

const END_OF_DIRECTORY = 0x06054b50;
const DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_HEADER = 0x04034b50;

/** Compression methods CAP actually uses. Anything else is refused rather than mis-read. */
const STORED = 0;
const DEFLATED = 8;

export interface ZipEntry {
  name: string;
  /** Uncompressed size as the archive claims it, used to check what we produced. */
  declaredSize: number;
  bytes(): Promise<Uint8Array>;
}

export class BrokenArchive extends Error {}

export function readZip(buffer: ArrayBuffer): ZipEntry[] {
  const view = new DataView(buffer);
  const all = new Uint8Array(buffer);

  const end = findEndOfDirectory(view);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);

  if (at >= buffer.byteLength) {
    throw new BrokenArchive("The archive's index points outside the file.");
  }

  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n += 1) {
    if (at + 46 > buffer.byteLength || view.getUint32(at, true) !== DIRECTORY_ENTRY) {
      throw new BrokenArchive("The archive's index is damaged at entry " + (n + 1) + ".");
    }

    const method = view.getUint16(at + 10, true);
    const compressedSize = view.getUint32(at + 20, true);
    const declaredSize = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const localAt = view.getUint32(at + 42, true);

    const name = new TextDecoder().decode(all.subarray(at + 46, at + 46 + nameLength));

    entries.push({
      name,
      declaredSize,
      bytes: () => extract({ all, view, localAt, method, compressedSize, declaredSize, name })
    });

    at += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

async function extract(input: {
  all: Uint8Array;
  view: DataView;
  localAt: number;
  method: number;
  compressedSize: number;
  declaredSize: number;
  name: string;
}): Promise<Uint8Array> {
  const { all, view, localAt, method, compressedSize, declaredSize, name } = input;

  if (localAt + 30 > all.byteLength || view.getUint32(localAt, true) !== LOCAL_HEADER) {
    throw new BrokenArchive("The archive does not contain " + name + " where its index says it does.");
  }

  // The local header repeats the name and extra fields, and its extra length can differ from the one in the
  // central directory. Read it here rather than assuming they match, which is a real and easy way to end up
  // a few bytes into the data.
  const nameLength = view.getUint16(localAt + 26, true);
  const extraLength = view.getUint16(localAt + 28, true);
  const from = localAt + 30 + nameLength + extraLength;
  const to = from + compressedSize;

  if (to > all.byteLength) {
    throw new BrokenArchive(name + " runs past the end of the archive; the download is incomplete.");
  }

  const raw = all.subarray(from, to);

  if (method === STORED) return raw;
  if (method !== DEFLATED) {
    throw new BrokenArchive(name + " uses a compression method this reader does not support.");
  }

  // "deflate-raw" rather than "deflate": a ZIP member carries the deflate stream with no zlib wrapper.
  // Copied out of the archive buffer so the body is a standalone ArrayBuffer rather than a view into
  // one, which is what Response accepts.
  const body = raw.slice().buffer as ArrayBuffer;
  const stream = new Response(body).body?.pipeThrough(new DecompressionStream("deflate-raw"));
  if (!stream) throw new BrokenArchive(name + " could not be read.");

  // A corrupted body makes the decompressor throw its own error, which tells the caller nothing about what
  // went wrong and reads like a fault in the Hub rather than a bad download. Everything from here is a
  // damaged archive, and it should say so.
  let out: Uint8Array;
  try {
    out = new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    throw new BrokenArchive(name + " is corrupted and could not be unpacked; the download is unusable.");
  }

  // The archive said how big this should be. Believing a short read would mean importing half a roster and
  // treating it as the whole unit, which is exactly how a sync quietly deletes people.
  if (out.byteLength !== declaredSize) {
    throw new BrokenArchive(
      name + " unpacked to " + out.byteLength + " bytes where the archive says " + declaredSize + "."
    );
  }
  return out;
}

function findEndOfDirectory(view: DataView): number {
  // The end record is last, but a trailing comment may follow it, so it is searched for backwards. The
  // comment is at most 65535 bytes, which bounds how far back is worth looking.
  const from = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let at = view.byteLength - 22; at >= from; at -= 1) {
    if (view.getUint32(at, true) === END_OF_DIRECTORY) return at;
  }
  throw new BrokenArchive("This is not a ZIP archive, or it is truncated.");
}

/**
 * CAPWATCH's text files as text.
 *
 * CAP warns that UTF-8 characters may appear in the download, and the files carry a byte-order mark, so the
 * mark is stripped and the rest decoded as UTF-8. Decoding is not fatal on bad bytes: one member with an
 * unexpected character in their name should not cost the squadron the whole import.
 */
export function asText(bytes: Uint8Array): string {
  const text = new TextDecoder("utf-8").decode(bytes);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
