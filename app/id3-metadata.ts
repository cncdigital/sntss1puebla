// Read only ID3v2.3/v2.4 metadata present in a locally selected MP3.
export type Id3Metadata = {
  title?: string;
  artist?: string;
  album?: string;
  lyrics?: string;
  cover?: { bytes: Uint8Array; type: "image/jpeg" | "image/png" | "image/webp" };
  hasId3: boolean;
};

const MAX_COVER_BYTES = 3 * 1024 * 1024;

function syncSafe(bytes: Uint8Array, offset: number) {
  if (bytes.slice(offset, offset + 4).some((value) => value > 127)) return -1;
  return bytes[offset] * 0x200000 + bytes[offset + 1] * 0x4000 + bytes[offset + 2] * 0x80 + bytes[offset + 3];
}

function plainSize(bytes: Uint8Array, offset: number) {
  return bytes[offset] * 0x1000000 + bytes[offset + 1] * 0x10000 + bytes[offset + 2] * 0x100 + bytes[offset + 3];
}

function findEnd(bytes: Uint8Array, start: number, encoding: number) {
  if (encoding === 1 || encoding === 2) {
    for (let index = start; index + 1 < bytes.length; index += 2)
      if (bytes[index] === 0 && bytes[index + 1] === 0) return index + 2;
  } else {
    for (let index = start; index < bytes.length; index += 1)
      if (bytes[index] === 0) return index + 1;
  }
  return bytes.length;
}

function decode(bytes: Uint8Array, encoding: number) {
  try {
    if (encoding === 0) return new TextDecoder("iso-8859-1").decode(bytes).replace(/\0+$/g, "").trim();
    if (encoding === 3) return new TextDecoder("utf-8").decode(bytes).replace(/\0+$/g, "").trim();
    if (encoding === 2) return new TextDecoder("utf-16be").decode(bytes).replace(/\0+$/g, "").trim();
    if (encoding === 1) {
      const bigEndian = bytes[0] === 0xfe && bytes[1] === 0xff;
      const hasBom = bigEndian || (bytes[0] === 0xff && bytes[1] === 0xfe);
      return new TextDecoder(bigEndian ? "utf-16be" : "utf-16le").decode(hasBom ? bytes.slice(2) : bytes).replace(/\0+$/g, "").trim();
    }
  } catch { /* Unsupported text encoding: leave the field blank. */ }
  return "";
}

function coverType(bytes: Uint8Array) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg" as const;
  if (bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index])) return "image/png" as const;
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP") return "image/webp" as const;
  return null;
}

function readSynchronizedLyrics(frame: Uint8Array) {
  // SYLT format 2 uses milliseconds. Format 1 uses MPEG frames and has no
  // reliable conversion to time without decoding the complete audio stream.
  if (frame.length < 11 || frame[4] !== 2 || frame[5] !== 1) return "";
  const encoding = frame[0];
  let position = findEnd(frame, 6, encoding);
  const lines: string[] = [];
  while (position + 5 <= frame.length && lines.length < 400) {
    const end = findEnd(frame, position, encoding);
    if (end + 4 > frame.length) break;
    const text = decode(frame.subarray(position, encoding === 1 || encoding === 2 ? end - 2 : end - 1), encoding);
    const milliseconds = plainSize(frame, end);
    if (text) {
      const minutes = Math.floor(milliseconds / 60000);
      const seconds = Math.floor(milliseconds % 60000 / 1000);
      const hundredths = Math.floor(milliseconds % 1000 / 10);
      lines.push(`[${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}]${text}`);
    }
    position = end + 4;
  }
  return lines.join("\n").slice(0, 12000);
}

export function parseId3(bytes: Uint8Array): Id3Metadata {
  const result: Id3Metadata = { hasId3: false };
  if (bytes.length < 10 || new TextDecoder().decode(bytes.slice(0, 3)) !== "ID3" || ![3, 4].includes(bytes[3])) return result;
  const size = syncSafe(bytes, 6);
  if (size < 0) return result;
  result.hasId3 = true;
  const end = Math.min(bytes.length, 10 + size);
  let offset = 10;
  if (bytes[5] & 0x40) {
    if (offset + 4 > end) return result;
    const extended = bytes[3] === 4 ? syncSafe(bytes, offset) : plainSize(bytes, offset);
    if (extended < 0 || extended > end - offset) return result;
    offset += bytes[3] === 4 ? extended : extended + 4;
  }
  let frontCover = false;
  let synchronized = false;
  for (; offset + 10 <= end;) {
    const id = new TextDecoder().decode(bytes.slice(offset, offset + 4));
    if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const length = bytes[3] === 4 ? syncSafe(bytes, offset + 4) : plainSize(bytes, offset + 4);
    const flags = bytes[offset + 9];
    if (length < 1 || offset + 10 + length > end) break;
    const frame = bytes.subarray(offset + 10, offset + 10 + length);
    offset += 10 + length;
    // Compression, encryption and unsynchronization require a different decoder.
    if ((bytes[3] === 4 && flags & 0x0e) || (bytes[3] === 3 && flags & 0xc0)) continue;
    if ((id === "TIT2" || id === "TPE1" || id === "TALB") && frame.length) {
      const value = decode(frame.subarray(1), frame[0]).slice(0, 180);
      if (id === "TIT2" && value) result.title = value;
      if (id === "TPE1" && value) result.artist = value;
      if (id === "TALB" && value) result.album = value;
    }
    if (id === "USLT" && frame.length > 4) {
      const textStart = findEnd(frame, 4, frame[0]);
      const value = decode(frame.subarray(textStart), frame[0]).slice(0, 12000);
      if (value && !result.lyrics) result.lyrics = value;
    }
    if (id === "SYLT" && !synchronized) {
      const value = readSynchronizedLyrics(frame);
      if (value) { result.lyrics = value; synchronized = true; }
    }
    if (id === "APIC" && frame.length > 8) {
      const mimeEnd = findEnd(frame, 1, 0);
      if (mimeEnd >= frame.length) continue;
      const pictureType = frame[mimeEnd];
      const imageStart = findEnd(frame, mimeEnd + 1, frame[0]);
      const data = frame.subarray(imageStart);
      const type = data.length <= MAX_COVER_BYTES && coverType(data);
      if (type && (!result.cover || (pictureType === 3 && !frontCover))) {
        result.cover = { bytes: data, type };
        frontCover = pictureType === 3;
      }
    }
  }
  return result;
}

export async function readId3FromFile(file: File): Promise<Id3Metadata> {
  const header = new Uint8Array(await file.slice(0, 10).arrayBuffer());
  if (header.length < 10 || new TextDecoder().decode(header.slice(0, 3)) !== "ID3") return { hasId3: false };
  const size = syncSafe(header, 6);
  if (size < 0) return { hasId3: false };
  // Embedded pictures can exceed the first 512 KB. Bound memory on large tags.
  return parseId3(new Uint8Array(await file.slice(0, Math.min(file.size, 10 + size, 8 * 1024 * 1024)).arrayBuffer()));
}
