import { openDB, type DBSchema } from "idb";
import { recordOfflineSpan } from "./otel";

declare const ImageCapture: { new (track: MediaStreamTrack): { takePhoto(): Promise<Blob> } };

export interface CachedPhoto {
  id: string;
  draftId: string;
  blob: Blob;
  mimeType: "image/jpeg";
  size: number;
  createdAt: number;
}

interface PhotoDB extends DBSchema { photos: { key: string; value: CachedPhoto; indexes: { "by-draftId": string } } }
const DB_NAME = "agritrust-field-photos";
const DB_VERSION = 1;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTOS_PER_DRAFT = 20;

async function db() { return openDB<PhotoDB>(DB_NAME, DB_VERSION, { upgrade(database) { if (!database.objectStoreNames.contains("photos")) database.createObjectStore("photos", { keyPath: "id" }).createIndex("by-draftId", "draftId"); } }); }

export async function compressImageToJpeg(file: Blob, quality = 0.8): Promise<Blob> {
  if (typeof createImageBitmap === "undefined" || typeof OffscreenCanvas === "undefined") return file;
  const bitmap = await createImageBitmap(file);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  return canvas.convertToBlob({ type: "image/jpeg", quality });
}

export async function storePhoto(draftId: string, image: Blob): Promise<CachedPhoto> {
  const database = await db();
  const existing = await database.getAllFromIndex("photos", "by-draftId", draftId);
  if (existing.length >= MAX_PHOTOS_PER_DRAFT) throw new Error("Maximum of 20 offline photos reached for this draft.");
  const blob = await compressImageToJpeg(image, 0.8);
  if (blob.size > MAX_PHOTO_BYTES) throw new Error("Photo exceeds the 5MB offline cache limit.");
  const photo: CachedPhoto = { id: crypto.randomUUID(), draftId, blob, mimeType: "image/jpeg", size: blob.size, createdAt: Date.now() };
  await database.put("photos", photo);
  recordOfflineSpan("offline.photo.store", { "draft.id": draftId, "photo.size": photo.size, "photos.count": existing.length + 1 });
  return photo;
}

export async function capturePhoto(draftId: string): Promise<CachedPhoto> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
  try {
    const track = stream.getVideoTracks()[0];
    const capture = new ImageCapture(track);
    return storePhoto(draftId, await capture.takePhoto());
  } finally { stream.getTracks().forEach((track) => track.stop()); }
}

export async function listPhotos(draftId: string): Promise<CachedPhoto[]> { return (await db()).getAllFromIndex("photos", "by-draftId", draftId); }
export async function deletePhoto(id: string): Promise<void> { await (await db()).delete("photos", id); }
