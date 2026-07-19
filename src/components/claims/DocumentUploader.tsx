"use client";

import { useCallback, useState } from "react";
import { type ClaimDocument, type EvidenceType } from "./claimTypes";

const accepted = ["application/pdf", "image/jpeg", "image/png", "video/mp4"];
const maxFiles = 10;
const maxSize = 20 * 1024 * 1024;
const chunkSize = 5 * 1024 * 1024;

export function DocumentUploader({ files, evidenceType, onChange }: { files: ClaimDocument[]; evidenceType: EvidenceType; onChange: (files: ClaimDocument[]) => void }) {
  const [error, setError] = useState<string>();
  const addFiles = useCallback((incoming: FileList | File[]) => {
    setError(undefined);
    const selected = Array.from(incoming);
    if (files.length + selected.length > maxFiles) { setError("Maximum 10 files per claim."); return; }
    const invalid = selected.find((file) => !accepted.includes(file.type) || file.size > maxSize);
    if (invalid) { setError("Upload PDF, JPEG, PNG, or MP4 files up to 20MB each."); return; }
    onChange([...files, ...selected.map((file) => ({ id: crypto.randomUUID(), fileName: file.name, fileSize: file.size, fileType: file.type, evidenceType, uploadProgress: 100, chunks: Math.max(1, Math.ceil(file.size / chunkSize)) }))]);
  }, [evidenceType, files, onChange]);

  return <section className="rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/40 p-5">
    <label onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files); }} className="flex cursor-pointer flex-col items-center rounded-xl bg-white p-6 text-center shadow-sm">
      <span className="text-3xl">📎</span><span className="mt-2 font-semibold">Drag evidence here or browse</span><span className="text-sm text-zinc-500">PDF, JPEG, PNG, MP4 · 20MB max · chunked above 5MB</span>
      <input multiple type="file" accept=".pdf,.jpeg,.jpg,.png,.mp4" onChange={(event) => event.target.files && addFiles(event.target.files)} className="sr-only" />
    </label>
    {error && <p className="mt-3 text-sm font-medium text-rose-700">{error}</p>}
    <div className="mt-4 space-y-2">{files.map((file) => <div key={file.id} className="rounded-lg border bg-white p-3 text-sm"><div className="flex justify-between gap-3"><span className="font-medium">{file.fileName}</span><span>{file.chunks} chunk{file.chunks > 1 ? "s" : ""}</span></div><div className="mt-2 h-2 rounded-full bg-zinc-100"><div className="h-2 rounded-full bg-emerald-600" style={{ width: `${file.uploadProgress}%` }} /></div></div>)}</div>
  </section>;
}
