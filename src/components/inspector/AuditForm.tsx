"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { saveAuditOffline } from "@/src/services/indexedDbStore";
import { createDraftAutoSaver } from "@/src/offline/FormStore";
import { useOfflineSync } from "@/src/hooks/useOfflineSync";
import { useLocale } from "@/src/hooks/useLocale";
import { InternationalizedText } from "@/src/components/common/InternationalizedText";

interface AuditFormData {
  inspectorId: string;
  farmId: string;
  notes: string;
  gpsLat: string;
  gpsLng: string;
  signature: string;
  photos: string[];
}

const EMPTY_FORM: AuditFormData = {
  inspectorId: "",
  farmId: "",
  notes: "",
  gpsLat: "",
  gpsLng: "",
  signature: "",
  photos: [],
};

export default function AuditForm() {
  const { t } = useLocale();
  const [form, setForm] = useState<AuditFormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const draftSaverRef = useRef<ReturnType<typeof createDraftAutoSaver<AuditFormData>> | null>(null);

  const { isOnline, storageUsage, refreshStats } = useOfflineSync();

  const isStorageFull = storageUsage.percent > 95;

  useEffect(() => {
    const saver = createDraftAutoSaver<AuditFormData>("inspector-audit", undefined);
    draftSaverRef.current = saver;
    return () => {
      void saver.flush();
      saver.dispose();
    };
  }, []);

  useEffect(() => {
    draftSaverRef.current?.schedule(form);
  }, [form]);

  const handlePhotoChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      const readers = files.map(
        (file) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          })
      );
      Promise.all(readers).then((base64Photos) => {
        setForm((prev) => ({ ...prev, photos: [...prev.photos, ...base64Photos] }));
      });
    },
    []
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isStorageFull) return;

    setSubmitting(true);
    setError(null);
    try {
      const localId = await saveAuditOffline({
        inspectorId: form.inspectorId,
        farmId: form.farmId,
        notes: form.notes,
        gpsCoordinates: {
          lat: parseFloat(form.gpsLat),
          lng: parseFloat(form.gpsLng),
        },
        signature: form.signature,
        photos: form.photos,
        timestamp: Date.now(),
      });
      setLastSavedId(localId);
      setForm(EMPTY_FORM);
      await refreshStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("audit.saveFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      {/* Header with online/offline badge */}
      <div className="mb-5 flex items-center justify-between">
        <InternationalizedText
          as="h2"
          id="audit.title"
          className="text-lg font-semibold text-gray-900 dark:text-white"
        />
        <span
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
            isOnline
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
              : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300"
          }`}
          aria-live="polite"
        >
          <span
            className={`h-2 w-2 rounded-full ${
              isOnline ? "bg-green-500" : "bg-yellow-400"
            }`}
          />
          {isOnline ? t("audit.online") : t("audit.offline")}
        </span>
      </div>

      {isStorageFull && (
        <div
          role="alert"
          className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300"
        >
          {t("audit.storageFull")}
        </div>
      )}

      {lastSavedId && (
        <div
          role="status"
          className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-300"
        >
          {t("audit.savedLocally", { id: lastSavedId })}{" "}
          {isOnline ? t("audit.uploadingNow") : t("audit.willUpload")}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="inspectorId"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {t("audit.inspectorId")}
            </label>
            <input
              id="inspectorId"
              type="text"
              required
              value={form.inspectorId}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, inspectorId: e.target.value }))
              }
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div>
            <label
              htmlFor="farmId"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {t("audit.farmId")}
            </label>
            <input
              id="farmId"
              type="text"
              required
              value={form.farmId}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, farmId: e.target.value }))
              }
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="gpsLat"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {t("audit.gpsLat")}
            </label>
            <input
              id="gpsLat"
              type="number"
              step="any"
              required
              value={form.gpsLat}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, gpsLat: e.target.value }))
              }
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div>
            <label
              htmlFor="gpsLng"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {t("audit.gpsLng")}
            </label>
            <input
              id="gpsLng"
              type="number"
              step="any"
              required
              value={form.gpsLng}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, gpsLng: e.target.value }))
              }
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="notes"
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {t("audit.notes")}
          </label>
          <textarea
            id="notes"
            rows={4}
            required
            value={form.notes}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, notes: e.target.value }))
            }
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </div>

        <div>
          <label
            htmlFor="signature"
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {t("audit.signature")}
          </label>
          <input
            id="signature"
            type="text"
            required
            value={form.signature}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, signature: e.target.value }))
            }
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </div>

        <div>
          <label
            htmlFor="photos"
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {t("audit.photos")}{" "}
            <span className="font-normal text-gray-500">{t("audit.photosHint")}</span>
          </label>
          <input
            id="photos"
            type="file"
            accept="image/*"
            multiple
            onChange={handlePhotoChange}
            className="block w-full text-sm text-gray-500 file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900/30 dark:file:text-blue-300"
          />
          {form.photos.length > 0 && (
            <p className="mt-1 text-xs text-gray-500">
              {t("audit.photosAttached", { count: form.photos.length })}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting || isStorageFull}
          className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? t("audit.saving") : t("audit.save")}
        </button>
      </form>
    </div>
  );
}
