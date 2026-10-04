#!/usr/bin/env bash
#
# AgriTrust EUDR end-to-end integration test.
#
# Verifies the four contracts the auditor view depends on:
#
#   1. Portal       the Next.js build compiles and serves the dashboard
#   2. Lineage      the SPARQL endpoint resolves the batch and every provenance
#                   statement's content commitment folds to the Merkle root
#                   anchored on Soroban (tamper evidence)
#   3. EUDR         the compliance API reports deforestation-free status and
#                   returns a structurally valid verifiable credential
#   4. Ledger       the governance chain enforces the promotion lineage
#                   (staging <- dev <- main)
#
# Services 2-4 are skipped with a warning when their endpoints are not running,
# so the script is usable as a pre-commit check without the full dev stack.
#
# Usage:
#   ./test_agritrust_eudr_e2e.sh              # run all checks
#   ./test_agritrust_eudr_e2e.sh --no-build   # skip the Next.js build
#
# Environment:
#   FUSEKI_QUERY   (default http://localhost:3030/agritrust/sparql)
#   COMPLIANCE_API (default http://localhost:8081)
#   GITHUB_REPO    (default AgriTrust-Protocol/AgriTrust-Frontend)

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

FUSEKI_QUERY="${FUSEKI_QUERY:-http://localhost:3030/agritrust/sparql}"
COMPLIANCE_API="${COMPLIANCE_API:-http://localhost:8081}"
GITHUB_REPO="${GITHUB_REPO:-AgriTrust-Protocol/AgriTrust-Frontend}"

ASSET_ID="4f2a9c17e5b3d8064af29c1e7d5b03948a6e2c17f0b9d4e83a6c507f1e2b3d49"
ANCHORED_ROOT="6754964ce63edb44cf21da33bc88832aece614e42e35aa8be9c02b2867bb79a2"
NS="https://agritrust.org/id/batch/COF-LOT-2024-0892"

SKIP_BUILD=0
for arg in "$@"; do
  case "${arg}" in
    --no-build) SKIP_BUILD=1 ;;
    -h|--help) sed -n '2,25p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown argument: ${arg}" >&2; exit 2 ;;
  esac
done

PASS=0
FAIL=0
SKIP=0

if [[ -t 1 ]]; then
  G=$'\033[0;32m'; R=$'\033[0;31m'; Y=$'\033[0;33m'; C=$'\033[0;36m'; B=$'\033[1m'; N=$'\033[0m'
else
  G=""; R=""; Y=""; C=""; B=""; N=""
fi

section() { printf '\n%s== %s ==%s\n' "${B}${C}" "$*" "${N}"; }
pass()    { PASS=$((PASS+1)); printf '  %sPASS%s %s\n' "${G}" "${N}" "$*"; }
fail()    { FAIL=$((FAIL+1)); printf '  %sFAIL%s %s\n' "${R}" "${N}" "$*"; }
skip()    { SKIP=$((SKIP+1)); printf '  %sSKIP%s %s\n' "${Y}" "${N}" "$*"; }
info()    { printf '       %s\n' "$*"; }

json_get() { grep -o "\"$2\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\"" <<<"$1" | head -1 | sed 's/.*:[[:space:]]*"\(.*\)"$/\1/'; }

endpoint_up() { curl -fsS -o /dev/null --max-time 3 "$1" 2>/dev/null; }

# ---------------------------------------------------------------------------
section "1. Portal build"
# ---------------------------------------------------------------------------

if (( SKIP_BUILD )); then
  skip "Next.js build (--no-build)"
else
  if command -v npm >/dev/null 2>&1; then
    [[ -d node_modules ]] || { info "installing dependencies"; npm ci --no-audit --no-fund >/dev/null; }
    if npm run build >/tmp/agritrust-e2e-build.log 2>&1; then
      pass "next build compiles without type errors"
    else
      fail "next build failed (see /tmp/agritrust-e2e-build.log)"
      tail -20 /tmp/agritrust-e2e-build.log | sed 's/^/       /'
    fi
  else
    skip "Next.js build (npm unavailable)"
  fi
fi

# Static integrity checks that need no services.
if grep -q "${ANCHORED_ROOT}" src/lib/snapshot.ts && \
   grep -q "${ANCHORED_ROOT}" src/lib/protocolState.ts; then
  pass "anchored Merkle root is consistent across snapshot and asset twin"
else
  fail "anchored Merkle root mismatch between src/lib/snapshot.ts and src/lib/protocolState.ts"
fi

# ---------------------------------------------------------------------------
section "2. Provenance lineage (SPARQL)"
# ---------------------------------------------------------------------------

if endpoint_up "${FUSEKI_QUERY}"; then
  RESULT=$(curl -fsS --max-time 15 -X POST "${FUSEKI_QUERY}" \
    -H 'Content-Type: application/sparql-query' \
    -H 'Accept: application/sparql-results+json' \
    --data-binary "PREFIX agritrust: <https://agritrust.org/ontology#>
SELECT ?h WHERE {
  GRAPH ?g {
    ?n agritrust:contentHash ?h ;
       agritrust:recordedAt ?t .
  }
}" || true)

  LEAF_COUNT=$(grep -o '"h"' <<<"${RESULT}" | wc -l | tr -d ' ')

  if [[ "${LEAF_COUNT}" -eq 18 ]]; then
    pass "triplestore serves 18 content commitments (9 nodes + 9 edges)"
  else
    fail "expected 18 content commitments, found ${LEAF_COUNT}"
  fi

  # Fold the served commitments with the algorithm in AgriTrustLineageService
  # and compare against the root anchored on Soroban.
  if node infra/verify-merkle-root.mjs --sparql "${RESULT}" >/tmp/agritrust-e2e-merkle.log 2>&1; then
    pass "served commitments fold to the anchored Merkle root"
  else
    fail "served commitments do NOT fold to ${ANCHORED_ROOT}"
    sed 's/^/       /' /tmp/agritrust-e2e-merkle.log
  fi

  # Tamper evidence: mutating one statement must break verification.
  if node infra/verify-merkle-root.mjs --sparql "${RESULT}" --tamper >/tmp/agritrust-e2e-tamper.log 2>&1; then
    pass "mutating a statement is detected as an integrity failure"
  else
    fail "tampering with a statement was NOT detected"
    sed 's/^/       /' /tmp/agritrust-e2e-tamper.log
  fi
else
  skip "SPARQL endpoint not reachable at ${FUSEKI_QUERY}"
  info "start it with: docker compose up -d triplestore && ./seed_fuseki.sh"
fi

# ---------------------------------------------------------------------------
section "3. EUDR compliance (Regulation (EU) 2023/1115 Art. 10)"
# ---------------------------------------------------------------------------

if endpoint_up "${COMPLIANCE_API}/health"; then
  ASSESSMENT=$(curl -fsS --max-time 15 "${COMPLIANCE_API}/eudr/assess?asset=${ASSET_ID}")

  if [[ "$(json_get "${ASSESSMENT}" deforestationFree)" == "true" ]]; then
    pass "assessment reports the plot as deforestation free"
  else
    fail "assessment did not report deforestationFree=true"
  fi

  [[ "$(json_get "${ASSESSMENT}" plotId)" == "KE-NY-007B" ]] \
    && pass "plot geolocation resolved (KE-NY-007B)" \
    || fail "unexpected plot identifier"

  ISSUER=$(json_get "${ASSESSMENT}" issuer)
  if [[ "${ISSUER}" == did:* ]]; then
    pass "credential issued by a DID issuer (${ISSUER})"
  else
    fail "credential issuer is not a DID: ${ISSUER:-<missing>}"
  fi

  CREDENTIAL=$(curl -fsS --max-time 15 "${COMPLIANCE_API}/eudr/credential")

  if grep -q 'EudrDeforestationFreeAttestation' <<<"${CREDENTIAL}"; then
    pass "credential carries the EUDR attestation type"
  else
    fail "credential is missing the EUDR attestation type"
  fi

  PROOF=$(grep -o '"proofValue"[[:space:]]*:[[:space:]]*"[^"]*"' <<<"${CREDENTIAL}" | head -1)
  if [[ -n "${PROOF}" ]]; then
    pass "credential carries proof material"
  else
    fail "credential has no proof material"
  fi

  # A credential whose expiry precedes its issuance is malformed.
  if node -e '
    const fs = require("fs");
    const raw = fs.readFileSync(0, "utf8");
    const c = JSON.parse(raw);
    const issued = Date.parse(c.issuanceDate);
    const expires = Date.parse(c.expirationDate);
    process.exit(issued < expires ? 0 : 1);
  ' <<<"${CREDENTIAL}"; then
    pass "credential issuance and expiry dates are coherent"
  else
    fail "credential expiry does not follow its issuance date"
  fi
else
  skip "compliance API not reachable at ${COMPLIANCE_API}"
  info "start it with: docker compose up -d"
fi

# ---------------------------------------------------------------------------
section "4. Governance lineage"
# ---------------------------------------------------------------------------

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  BRANCHES=$(gh api "repos/${GITHUB_REPO}/branches" --jq '.[].name' 2>/dev/null || true)

  if grep -qx "dev" <<<"${BRANCHES}"; then
    pass "dev branch present"
  else
    fail "dev branch missing in ${GITHUB_REPO}"
  fi

  if grep -qx "staging" <<<"${BRANCHES}" && grep -qx "main" <<<"${BRANCHES}"; then
    pass "promotion chain present (main <- staging <- dev)"
  else
    fail "staging/main branches missing in ${GITHUB_REPO}"
  fi
else
  skip "GitHub lineage check (gh CLI unavailable or unauthenticated)"
fi

# ---------------------------------------------------------------------------
printf '\n%s-- summary --%s\n' "${B}" "${N}"
printf '  passed:  %s%d%s\n' "${G}" "${PASS}" "${N}"
printf '  failed:  %s%d%s\n' "${R}" "${FAIL}" "${N}"
printf '  skipped: %s%d%s\n' "${Y}" "${SKIP}" "${N}"

(( FAIL == 0 )) || exit 1
printf '\n%sAll executed checks passed.%s\n' "${G}" "${N}"