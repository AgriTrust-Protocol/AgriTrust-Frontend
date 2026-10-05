#!/usr/bin/env bash
#
# Seeds the Fuseki triplestore with the AgriTrust ontology and the :Process
# provenance graph for batch COF-LOT-2024-0892.
#
# After seeding, the portal's lineage viewer resolves the graph from the
# triplestore instead of the cached snapshot, and the seeded content commitments
# fold to the same Merkle root anchored on Soroban.
#
# Usage:
#   ./seed_fuseki.sh                 # seed ontology + provenance graph
#   ./seed_fuseki.sh --reset         # drop the dataset graph first
#
# Environment:
#   FUSEKI_UPDATE   SPARQL update endpoint (default http://localhost:3031/agritrust/update)
#   FUSEKI_QUERY    SPARQL query endpoint  (default http://localhost:3030/agritrust/sparql)
#   FUSEKI_GRAPH    Named graph to load into (default agritrust)

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
TTL_DIR="${SCRIPT_DIR}/infra/fuseki"

FUSEKI_UPDATE="${FUSEKI_UPDATE:-http://localhost:3031/agritrust/update}"
FUSEKI_QUERY="${FUSEKI_QUERY:-http://localhost:3030/agritrust/sparql}"
FUSEKI_GRAPH="${FUSEKI_GRAPH:-agritrust}"

RESET=0
for arg in "$@"; do
  case "${arg}" in
    --reset) RESET=1 ;;
    -h|--help)
      sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown argument: ${arg}" >&2
      exit 2
      ;;
  esac
done

log()  { printf '\033[0;36m[fuseki]\033[0m %s\n' "$*"; }
warn() { printf '\033[0;33m[fuseki]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[0;31m[fuseki]\033[0m %s\n' "$*" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || die "curl is required"

wait_for_endpoint() {
  local url="$1" label="$2" attempts=30

  log "waiting for ${label} at ${url}"
  while (( attempts > 0 )); do
    if curl -fsS -o /dev/null --max-time 2 "${url}"; then
      log "${label} is up"
      return 0
    fi
    attempts=$(( attempts - 1 ))
    sleep 1
  done

  die "${label} did not become available at ${url}. Is the triplestore running? (docker compose up -d triplestore)"
}

# POST a SPARQL Update payload.
sparql_update() {
  local payload="$1"

  curl -fsS --max-time 20 \
    -X POST "${FUSEKI_UPDATE}" \
    -H 'Content-Type: application/sparql-update' \
    -H 'Accept: application/sparql-results+json' \
    --data-binary "${payload}"
}

# Run a SELECT and print the raw bindings count.
sparql_count() {
  local query="$1"
  curl -fsS --max-time 20 \
    -X POST "${FUSEKI_QUERY}" \
    -H 'Content-Type: application/sparql-query' \
    -H 'Accept: application/sparql-results+json' \
    --data-binary "${query}"
}

wait_for_endpoint "${FUSEKI_UPDATE%/update}" "SPARQL update endpoint"

if (( RESET )); then
  log "clearing graph <${FUSEKI_GRAPH}>"
  sparql_update "DROP SILENT GRAPH <${FUSEKI_GRAPH}>" >/dev/null
fi

# ---------------------------------------------------------------------------
# Load the ontology
# ---------------------------------------------------------------------------

[[ -f "${TTL_DIR}/agritrust.ttl" ]] || die "missing ${TTL_DIR}/agritrust.ttl"

log "loading ontology (agritrust.ttl)"
sparql_update "LOAD <file://${TTL_DIR}/agritrust.ttl> INTO GRAPH <${FUSEKI_GRAPH}>" >/dev/null

# ---------------------------------------------------------------------------
# Load the provenance graph
# ---------------------------------------------------------------------------

PROVENANCE_TTL="${TTL_DIR}/batch-COF-LOT-2024-0892.ttl"
[[ -f "${PROVENANCE_TTL}" ]] || die "missing ${PROVENANCE_TTL}"

log "loading provenance graph (batch-COF-LOT-2024-0892.ttl)"
sparql_update "LOAD <file://${PROVENANCE_TTL}> INTO GRAPH <${FUSEKI_GRAPH}>" >/dev/null

# ---------------------------------------------------------------------------
# Verify the seeded graph
# ---------------------------------------------------------------------------

ASSET_ID="4f2a9c17e5b3d8064af29c1e7d5b03948a6e2c17f0b9d4e83a6c507f1e2b3d49"
NS="https://agritrust.org/id/batch/COF-LOT-2024-0892"

NODE_COUNT=$(sparql_count "SELECT (COUNT(*) AS ?c) WHERE {
  GRAPH <${FUSEKI_GRAPH}> {
    ?n agritrust:contentHash ?h ;
       agritrust:recordedAt ?t .
  }
}" | grep -o '"value":"[0-9]*"' | head -1 | grep -o '[0-9]*' || echo 0)

log "seeded statements carrying a content commitment: ${NODE_COUNT}"

# The batch anchor must resolve, otherwise the portal's lineage query returns
# nothing and silently falls back to the snapshot.
BATCH=$(sparql_count "SELECT ?root WHERE {
  GRAPH <${FUSEKI_GRAPH}> {
    <${NS}> agritrust:assetCommitment \"${ASSET_ID}\" ;
           agritrust:rootNode ?root .
  }
}")

if grep -q '"value"' <<<"${BATCH}"; then
  log "batch anchor resolved"
else
  die "batch anchor <${NS}> did not resolve; lineage queries would return no results"
fi

# Article 10 evidence drives the compliance service's verdict.
DEFOREST_FREE=$(sparql_count "SELECT ?d WHERE {
  GRAPH <${FUSEKI_GRAPH}> {
    <${NS}/harvest> agritrust:deforestationFree ?d .
  }
}")
if grep -q '"value"' <<<"${DEFOREST_FREE}"; then
  log "EUDR Article 10 evidence present"
else
  warn "no agritrust:deforestationFree triple on the harvest node; the compliance API will fall back"
fi

log "seed complete — graph <${FUSEKI_GRAPH}> ready at ${FUSEKI_QUERY}"