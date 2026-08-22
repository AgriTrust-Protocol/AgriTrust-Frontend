"use client";

import { useRef, useState } from "react";
import type { ClaimDocument, EvidenceType } from "@/src/hooks/useClaim";

const ACCEPTED = ["application/pdf", "image/jpeg", "image/png", "video/mp4"];
const MAX_SIZE = 20 * 1024 * 1024;
const MAX_FILES = 10;

interface DocumentUploaderProps {
  documents: ClaimDocument[];
  onChange: (documents: ClaimDocument[]) => void;
}

export function DocumentUploader({ documents, onChange }: DocumentUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  function addFiles(files: FileList | File[]) {
    setError("");
    const next: ClaimDocument[] = [];
    for (const file of Array.from(files)) {
      if (documents.length + next.length >= MAX_FILES) { setError("A claim can include up to 10 files."); break; }
      if (!ACCEPTED.includes(file.type)) { setError(`${file.name} is not a supported file type.`); continue; }
      if (file.size > MAX_SIZE) { setError(`${file.name} is larger than 20 MB.`); continue; }
      next.push({ id: `${file.name}-${file.lastModified}`, name: file.name, size: file.size, type: file.type, evidenceType: file.type.startsWith("image/") ? "Damage photos" : "Weather report", progress: 100 });
    }
    onChange([...documents, ...next]);
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}
        className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${dragging ? "border-emerald-600 bg-emerald-50" : "border-zinc-300 bg-zinc-50"}`}
      >
        <p className="font-semibold text-zinc-900">Drop evidence here</p>
        <p className="mt-1 text-sm text-zinc-500">PDF, JPEG, PNG, or MP4 · max 20 MB each</p>
        <button type="button" onClick={() => inputRef.current?.click()} className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700">Browse files</button>
        <input ref={inputRef} hidden type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.mp4" onChange={(event) => event.target.files && addFiles(event.target.files)} />
      </div>
      {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
      {documents.map((document) => (
        <div key={document.id} className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm">
          <div><p className="font-medium text-zinc-900">{document.name}</p><p className="text-zinc-500">{(document.size / 1024 / 1024).toFixed(1)} MB · {document.progress}% uploaded</p></div>
          <select aria-label={`Evidence type for ${document.name}`} value={document.evidenceType} onChange={(event) => onChange(documents.map((item) => item.id === document.id ? { ...item, evidenceType: event.target.value as EvidenceType } : item))} className="rounded-md border border-zinc-300 px-2 py-1 text-xs">
            <option>Damage photos</option><option>Weather report</option><option>Police report</option><option>Lab analysis</option>
          </select>
        </div>
      ))}
    </div>
  );
}