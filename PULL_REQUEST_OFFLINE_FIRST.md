# Offline-First PWA for Field Data Collection

## Summary

Implements the offline-first foundation for field inspectors working with limited connectivity. Inspection drafts, queued submissions, and captured photos can be retained locally and synchronized when connectivity returns, with conflict review support for records changed both offline and online.

## What Changed

- Added IndexedDB-backed form draft storage in `src/offline/FormStore.ts`.
  - Supports draft CRUD operations.
  - Autosaves the active inspector form after 30 seconds of inactivity.
- Added `src/offline/SyncManager.ts`.
  - Reuses the existing FIFO audit queue.
  - Preserves the 500 queued-item limit.
  - Registers the `sync-audits` Background Sync tag.
  - Emits OpenTelemetry-compatible offline sync spans with duration, queue size, and success status.
- Added `src/offline/CameraCapture.ts`.
  - Captures images through `getUserMedia`.
  - Compresses images to JPEG at 80% quality.
  - Enforces a 5 MB maximum per photo and 20 photos per draft.
  - Stores photo blobs in IndexedDB.
- Added `src/offline/ConflictResolver.tsx`.
  - Displays local/server field differences after a conflict.
  - Allows the inspector to keep either the offline or server version.
- Added `src/hooks/useOfflineStatus.ts`.
  - Tracks online/offline state and connection quality.
  - Records the start of an offline period.
  - Requests persistent browser storage when supported.
- Wired persistent storage initialization into the application provider.
- Wired the existing inspector audit form to draft autosave.
- Updated storage quota fallback handling to target 200 MB.
- Extended the existing tracing adapter with reusable offline span recording.

## Existing Service Worker Support

The existing `public/sw.js` already provides the deployed service-worker behavior required by this feature:

- Cache-first handling for static assets.
- Network-first handling for API requests with cached fallback.
- Stale-while-revalidate handling for page navigation.
- Cached offline fallback page.
- `sync-audits` background queue replay.

## Validation

- Changed files pass VS Code diagnostics.
- TypeScript errors introduced by the offline implementation were resolved.
- Full test command result: 20 tests passed.
- The test command still reports 4 pre-existing suite/setup failures related to:
  - Vitest loading standalone Node scripts with shebangs.
  - Playwright tests being included in the Vitest run.
  - Missing global test declarations in an existing test file.
  - Existing worker startup timeouts.

## Files Added

- `src/offline/FormStore.ts`
- `src/offline/SyncManager.ts`
- `src/offline/CameraCapture.ts`
- `src/offline/ConflictResolver.tsx`
- `src/hooks/useOfflineStatus.ts`

## Files Updated

- `app/providers.tsx`
- `src/components/inspector/AuditForm.tsx`
- `src/services/indexedDbStore.ts`
- `src/services/observability/tracing.ts`

## Testing Commands

```bash
pnpm exec tsc --noEmit --pretty false
pnpm test -- --reporter=dot
```

## Review Notes

The implementation builds on the existing `agritrust-offline` IndexedDB schema and deployed service worker rather than introducing a parallel audit queue. Conflict records remain flagged for review, while successful submissions are removed from the queue and marked as synced.
