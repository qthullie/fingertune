/**
 * Just enough ZIP to open an .osz, in the browser, with no dependency.
 *
 * An osu! beatmap ships as a .osz: a zip holding one .osu chart per difficulty
 * plus the audio. Asking someone to unzip it first and then pick two files out
 * of it is asking them not to bother, so the game reads the archive itself.
 *
 * A zip library would be ~40 KB for what is, here, a directory walk and one
 * call to `DecompressionStream`. The browser already has the inflater; this
 * file is the envelope around it.
 *
 * What it supports, which is what .osz files actually use:
 *
 * - store (method 0) and deflate (method 8)
 * - the end-of-central-directory record, read backwards from the tail
 *
 * What it does not: zip64, encryption, multi-part archives, and data
 * descriptors. Each of those throws a named error rather than returning
 * something subtly wrong — a chart that silently loses half its notes is worse
 * than one that refuses to load.
 */

/** One file in the archive, decompressed on demand. */
export interface ZipEntry {
  name: string;
  /** Uncompressed size, in bytes, as declared by the central directory. */
  size: number;
  read: () => Promise<Uint8Array>;
}

export class ZipError extends Error {
  constructor(
    readonly code: 'NOT_A_ZIP' | 'UNSUPPORTED' | 'CORRUPT',
    message: string,
  ) {
    super(message);
    this.name = 'ZipError';
  }
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

/**
 * Finds the end-of-central-directory record.
 *
 * It sits at the very end of the file, except that the comment field after it
 * can be up to 64 KB, so the only way to find it is to scan backwards for its
 * signature. Scanning from the tail also means a zip with a comment containing
 * the signature by chance resolves to the real record, which is the last one.
 */
function findEndOfCentralDirectory(view: DataView): number {
  const maxComment = 0xffff;
  const start = Math.max(0, view.byteLength - maxComment - 22);
  for (let i = view.byteLength - 22; i >= start; i--) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) return i;
  }
  throw new ZipError('NOT_A_ZIP', 'No end-of-central-directory record: this is not a zip file.');
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== 'function') {
    throw new ZipError('UNSUPPORTED', 'This browser cannot decompress zip entries.');
  }
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(
    new DecompressionStream('deflate-raw'),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Reads an archive's directory. Entry contents are decompressed only when asked for. */
export async function openZip(buffer: ArrayBuffer): Promise<ZipEntry[]> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const eocd = findEndOfCentralDirectory(view);

  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);

  // A zip64 archive puts 0xffff / 0xffffffff here and the real numbers in a
  // separate record. No .osz is anywhere near 4 GB, so say so and stop.
  if (count === 0xffff || offset === 0xffffffff) {
    throw new ZipError('UNSUPPORTED', 'Zip64 archives are not supported.');
  }

  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      throw new ZipError('CORRUPT', `Central directory entry ${i} has a bad signature.`);
    }

    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);

    const rawName = bytes.subarray(offset + 46, offset + 46 + nameLength);
    // Bit 11 means the name is UTF-8. Older tools wrote CP437, but every osu!
    // export of the last decade sets it, and UTF-8 is the better guess anyway.
    const name = new TextDecoder('utf-8').decode(rawName);

    if ((flags & 0x1) !== 0) {
      throw new ZipError('UNSUPPORTED', `"${name}" is encrypted.`);
    }

    // Directories are entries too; they have no content worth reading.
    if (!name.endsWith('/')) {
      entries.push({
        name,
        size,
        read: async () => {
          // The local header repeats the name and extra fields, and its extra
          // field length can differ from the central one — so it has to be read
          // rather than assumed.
          if (view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) {
            throw new ZipError('CORRUPT', `"${name}" has a bad local header.`);
          }
          const localNameLength = view.getUint16(localOffset + 26, true);
          const localExtraLength = view.getUint16(localOffset + 28, true);
          const start = localOffset + 30 + localNameLength + localExtraLength;
          const raw = bytes.subarray(start, start + compressedSize);

          if (method === 0) return raw;
          if (method === 8) return inflateRaw(raw);
          throw new ZipError('UNSUPPORTED', `"${name}" uses compression method ${method}.`);
        },
      });
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}
