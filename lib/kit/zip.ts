/**
 * Dependency-free ZIP writer (store method, no compression).
 *
 * The project forbids adding dependencies without sign-off (see CLAUDE.md), so
 * the kit download is packaged with a tiny, self-contained ZIP encoder rather
 * than JSZip/archiver. It produces a standard, uncompressed ZIP that unpacks
 * on every OS. UTF-8 filenames are flagged (general-purpose bit 11) so paths
 * with non-ASCII characters survive.
 *
 * Runs in the browser: takes text files and returns a Blob for download.
 */

export type KitFile = {
  /** Forward-slash path inside the archive, e.g. ".claude/agents/validator.md". */
  path: string;
  contents: string;
};

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date): { time: number; date: number } {
  const time =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    (Math.floor(date.getSeconds() / 2) & 0x1f);
  const day =
    (((date.getFullYear() - 1980) & 0x7f) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();
  return { time, date: day };
}

/** Build a ZIP archive Blob from a set of text files. */
export function createZip(files: KitFile[]): Blob {
  const encoder = new TextEncoder();
  const now = new Date();
  const { time, date } = dosDateTime(now);

  type Local = {
    nameBytes: Uint8Array;
    data: Uint8Array;
    crc: number;
    offset: number;
  };

  const chunks: Uint8Array[] = [];
  const records: Local[] = [];
  let offset = 0;

  const pushChunk = (chunk: Uint8Array) => {
    chunks.push(chunk);
    offset += chunk.length;
  };

  for (const file of files) {
    const nameBytes = encoder.encode(file.path);
    const data = encoder.encode(file.contents);
    const crc = crc32(data);

    const header = new ArrayBuffer(30);
    const view = new DataView(header);
    view.setUint32(0, 0x04034b50, true); // local file header signature
    view.setUint16(4, 20, true); // version needed
    view.setUint16(6, 0x0800, true); // flags: UTF-8 filename (bit 11)
    view.setUint16(8, 0, true); // compression: store
    view.setUint16(10, time, true);
    view.setUint16(12, date, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, data.length, true); // compressed size
    view.setUint32(22, data.length, true); // uncompressed size
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true); // extra field length

    const localOffset = offset;
    pushChunk(new Uint8Array(header));
    pushChunk(nameBytes);
    pushChunk(data);

    records.push({ nameBytes, data, crc, offset: localOffset });
  }

  const centralStart = offset;
  for (const rec of records) {
    const header = new ArrayBuffer(46);
    const view = new DataView(header);
    view.setUint32(0, 0x02014b50, true); // central directory signature
    view.setUint16(4, 20, true); // version made by
    view.setUint16(6, 20, true); // version needed
    view.setUint16(8, 0x0800, true); // flags: UTF-8
    view.setUint16(10, 0, true); // compression: store
    view.setUint16(12, time, true);
    view.setUint16(14, date, true);
    view.setUint32(16, rec.crc, true);
    view.setUint32(20, rec.data.length, true);
    view.setUint32(24, rec.data.length, true);
    view.setUint16(28, rec.nameBytes.length, true);
    view.setUint16(30, 0, true); // extra field length
    view.setUint16(32, 0, true); // comment length
    view.setUint16(34, 0, true); // disk number start
    view.setUint16(36, 0, true); // internal attrs
    view.setUint32(38, 0, true); // external attrs
    view.setUint32(42, rec.offset, true); // local header offset

    pushChunk(new Uint8Array(header));
    pushChunk(rec.nameBytes);
  }

  const centralSize = offset - centralStart;

  const end = new ArrayBuffer(22);
  const endView = new DataView(end);
  endView.setUint32(0, 0x06054b50, true); // end of central directory signature
  endView.setUint16(4, 0, true); // disk number
  endView.setUint16(6, 0, true); // disk with central dir
  endView.setUint16(8, records.length, true); // entries on this disk
  endView.setUint16(10, records.length, true); // total entries
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralStart, true);
  endView.setUint16(20, 0, true); // comment length
  pushChunk(new Uint8Array(end));

  return new Blob(chunks as BlobPart[], { type: "application/zip" });
}
