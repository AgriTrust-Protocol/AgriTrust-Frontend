import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTOS = 20;

interface PhotoRecord {
  id: string;
  draftId: string;
  blob: Blob;
  createdAt: number;
}

interface PhotoSchema extends DBSchema {
  photos: { key: string; value: PhotoRecord; indexes: { "by-draftId": string } };
}

let dbPromise: Promise<IDBPDatabase<PhotoSchema>> | undefined;
function getDb() {
  dbPromise ??= openDB<PhotoSchema>("agritrust-camera-cache", 1, {
    upgrade(db) {
      const store = db.createObjectStore("photos", { keyPath: "id" });
      store.createIndex("by-draftId", "draftId");
    },
  });
  return dbPromise;
}

async function compressPhoto(source: Blob): Promise<Blob> {
  if (typeof document === "undefined") return source;
  const bitmap = await createImageBitmap(source);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Unable to encode photo")), "image/jpeg", 0.8);
  });
}

export async function storePhoto(draftId: string, source: Blob): Promise<string> {
  const blob = await compressPhoto(source);
  if (blob.size > MAX_PHOTO_BYTES) throw new Error("Photo exceeds the 5MB offline limit");
  const db = await getDb();
  const count = await db.countFromIndex("photos", "by-draftId", draftId);
  if (count >= MAX_PHOTOS) throw new Error("A draft can contain at most 20 photos");
  const id = crypto.randomUUID();
  await db.put("photos", { id, draftId, blob, createdAt: Date.now() });
  return id;
}

export async function getPhotos(draftId: string): Promise<PhotoRecord[]> {
  return (await getDb()).getAllFromIndex("photos", "by-draftId", draftId);
}

export async function deletePhoto(id: string): Promise<void> {
  await (await getDb()).delete("photos", id);
}

export async function capturePhoto(video: HTMLVideoElement): Promise<Blob> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
  video.srcObject = stream;
  await video.play();
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d")?.drawImage(video, 0, 0);
  stream.getTracks().forEach((track) => track.stop());
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Unable to capture photo")), "image/jpeg", 0.8);
  });
}