import { env } from "cloudflare:workers";
import { orderMp3Tracks } from "./mp3-order";

export type NewsMp3Track = {
  id: number;
  title: string;
  artist: string;
  album: string;
  lyrics: string;
  coverUrl: string | null;
  displayId: number;
  fileName: string;
  sizeBytes: number;
  uploadedAt: string;
  url: string;
  qualityUrls: { 96: string; 192: string; 320: string };
  availableQualities: number[];
  kind: "song" | "commercial";
};

export async function listNewsMp3Tracks(kind: "song" | "commercial" = "song"): Promise<NewsMp3Track[]> {
  const result = await env.DB.prepare(
    `SELECT id,title,artist,album,lyrics,kind,cover_key AS coverKey,file_name AS fileName,size_bytes AS sizeBytes,
      uploaded_at AS uploadedAt,storage_key AS storageKey
     FROM news_mp3_library
     WHERE active=1 AND kind=?
     ORDER BY id ASC`,
  ).bind(kind).all<Omit<NewsMp3Track, "displayId" | "url" | "qualityUrls" | "availableQualities" | "coverUrl"> & { storageKey: string; coverKey: string | null }>();
  const ordered = orderMp3Tracks(result.results);
  return Promise.all(ordered.map(async (track) => {
    const url = `/api/news/mp3/${track.id}`;
    const variantKey = (bitrate: number) => track.storageKey.replace(/\.mp3$/i, `.${bitrate}.mp3`);
    const [has96, has192] = await Promise.all([
      env.BUCKET.head(variantKey(96)),
      env.BUCKET.head(variantKey(192)),
    ]);
    return {
      id: track.id,
      kind: track.kind,
      displayId: track.displayId,
      title: track.title,
      artist: track.artist,
      album: track.album,
      lyrics: track.lyrics,
      coverUrl: track.coverKey ? `/api/news/mp3/${track.id}/cover` : null,
      fileName: track.fileName,
      sizeBytes: track.sizeBytes,
      uploadedAt: track.uploadedAt,
      url,
      qualityUrls: { 96: `${url}?quality=96`, 192: `${url}?quality=192`, 320: url },
      availableQualities: [320, ...(has192 ? [192] : []), ...(has96 ? [96] : [])],
    };
  }));
}
