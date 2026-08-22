# Insurance Claims Portal

## Summary

Adds the first frontend slice of the AgriTrust insurance claims portal. Farmers can file claims, attach evidence, track lifecycle status, and communicate with an adjuster from a dedicated `/claims` page.

## What Changed

- Added a three-step claim filing wizard:
  - Crop, field, location, and incident details
  - Damage description and evidence upload
  - Review and submit
- Added drag-and-drop evidence upload with:
  - Maximum 10 files per claim
  - Maximum 20 MB per file
  - PDF, JPEG, PNG, and MP4 validation
  - Evidence classification for damage photos, weather reports, police reports, and lab analyses
- Added visual claim status stepper for:
  - Filed
  - Evidence submission
  - Under review
  - Approved
  - Paid
  - Rejected
- Added claim list and selected claim detail view.
- Added adjuster chat UI with timestamps and optional WebSocket transport through `NEXT_PUBLIC_CLAIMS_WS_URL`.
- Added local persistence through `localStorage` so the frontend flow survives refreshes while backend APIs are being integrated.
- Added browser/server notification integration through `notifyClaim` and `NEXT_PUBLIC_CLAIMS_NOTIFICATION_URL`.
- Added parametric drought payout state and messaging.
- Added Claims navigation to the dashboard shell.
- Marked the dashboard page as a Client Component so its existing `next/dynamic` import with `ssr: false` is compatible with Next.js 16.

## Files Added

- `app/claims/page.tsx`
- `src/components/claims/ClaimForm.tsx`
- `src/components/claims/DocumentUploader.tsx`
- `src/components/claims/ClaimStatusStepper.tsx`
- `src/components/claims/ClaimChat.tsx`
- `src/hooks/useClaim.ts`
- `src/services/notificationService.ts`

## Files Modified

- `app/dashboard/layout.tsx`
- `app/dashboard/page.tsx`

## Validation

- Targeted ESLint passes for all changed claims and navigation files.
- Editor diagnostics report no errors in the new claims files.
- The previous production build blocker in `app/dashboard/page.tsx` was addressed by adding the Client Component boundary.
- `pnpm build` now compiles successfully, then stops on an unrelated existing missing dependency: `framer-motion` imported by `components/onboarding/DeviceProvisioner.tsx`.

## Known Follow-up Work

This PR establishes the frontend workflow and integration points. Production completion still requires:

- Backend claim persistence and API endpoints.
- Server-side chunked uploads for files larger than 5 MB.
- Geography/workload-based adjuster assignment with the 20-active-claim limit.
- Persistent WebSocket message storage and authorization.
- Oracle trigger verification and automatic payout execution.
- Push notification delivery and production email delivery for payouts.
- Integration tests covering claim submission, three document uploads, adjuster assignment, five messages, and persistence verification.

## Testing

```bash
pnpm exec eslint app/claims/page.tsx app/dashboard/layout.tsx src/components/claims/ClaimForm.tsx src/components/claims/ClaimStatusStepper.tsx src/components/claims/DocumentUploader.tsx src/components/claims/ClaimChat.tsx src/hooks/useClaim.ts src/services/notificationService.ts
pnpm exec tsc --noEmit
pnpm build
```

The targeted ESLint check passes. Editor diagnostics report no errors in the new claims files. Repository-wide TypeScript validation and the final build type phase remain blocked by unrelated existing errors outside the claims files, including the missing `framer-motion` dependency.
