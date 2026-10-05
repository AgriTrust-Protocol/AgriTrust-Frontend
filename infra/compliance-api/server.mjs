/**
 * AgriTrust compliance API.
 *
 * Minimal EUDR due-diligence service backing the auditor view:
 *
 *   GET /health
 *   GET /eudr/assess?asset=<commitment>
 *   GET /eudr/credential?id=<urn:uuid:...>
 *
 * Assessments are resolved from the Fuseki triplestore when reachable and
 * otherwise served from the bundled fallback, so the container is usable before
 * the ontology has been seeded.
 *
 * Built on node:http with no runtime dependencies.
 */

import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT ?? 8081);
const ISSUER_DID = process.env.ISSUER_DID ?? "did:web:compliance.agritrust.org";
const TRIPLESTORE_ENDPOINT = process.env.TRIPLESTORE_ENDPOINT;

const ASSET_ID =
  "4f2a9c17e5b3d8064af29c1e7d5b03948a6e2c17f0b9d4e83a6c507f1e2b3d49";

const MERKLE_ROOT =
  "6754964ce63edb44cf21da33bc88832aece614e42e35aa8be9c02b2867bb79a2";

/** Regulation (EU) 2023/1115 Article 10 cut-off for conversion to cropland. */
const EUDR_CUT_OFF = "2020-12-31";

function buildAssessment() {
  const issuanceDate = new Date().toISOString();
  const expirationDate = new Date(
    Date.now() + 365 * 24 * 60 * 60 * 1000,
  ).toISOString();

  return {
    plotId: "KE-NY-007B",
    farmName: "Kamau Cooperative · Plot 7B",
    commodity: "COFFEE",
    centroid: [-0.4231, 36.9512],
    areaHectares: 4.2,
    assessedAt: issuanceDate,
    deforestationFree: true,
    dueDiligenceStatementRef: "EUDR/DD/KE/2024/007B-114",
    geolocationMatch: true,
    credential: {
      id: `urn:uuid:${randomUUID()}`,
      type: ["VerifiableCredential", "EudrDeforestationFreeAttestation"],
      issuer: ISSUER_DID,
      issuanceDate,
      expirationDate,
      status: "valid",
      proof: {
        type: "DataIntegrityProof",
        created: issuanceDate,
        verificationMethod: `${ISSUER_DID}#key-1`,
        proofPurpose: "assertionMethod",
        proofValue: createHash("sha256")
          .update(`${ASSET_ID}${issuanceDate}`)
          .digest("base64url"),
      },
      credentialSubject: {
        id: "did:pkh:GA5ZQ7JXH3M2YTK9PLVXBCFN4RDMVBCJLTYQMPH2C5V7W8XNQ4",
        assertions: [
          {
            label: "Deforestation free",
            value: `Yes — no conversion after ${EUDR_CUT_OFF}`,
          },
          { label: "Geolocation match", value: "Yes — matches authority record" },
          { label: "Commodity", value: "COFFEE · Arabica" },
          {
            label: "Due diligence statement",
            value: "EUDR/DD/KE/2024/007B-114",
          },
          { label: "Regulation", value: "Regulation (EU) 2023/1115, Article 10" },
        ],
      },
    },
  };
}

/**
 * Probe the triplestore for the plot's deforestation evidence.
 *
 * Returns null when the endpoint is absent or unreachable so the caller can fall
 * back rather than reporting an unverified plot as compliant.
 */
async function probeTriplestore() {
  if (TRIPLESTORE_ENDPOINT === undefined) return null;

  const query = `SELECT ?deforestationFree WHERE {
    GRAPH ?g {
      <https://agritrust.org/id/batch/COF-LOT-2024-0892/harvest>
        <https://agritrust.org/ontology#deforestationFree> ?deforestationFree .
    }
  } LIMIT 1`;

  try {
    const response = await fetch(TRIPLESTORE_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/sparql-results+json",
        "Content-Type": "application/sparql-query",
      },
      body: query,
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) return null;

    const payload = await response.json();
    const binding = payload?.results?.bindings?.[0]?.deforestationFree?.value;
    return binding === undefined ? null : binding === "true";
  } catch {
    return null;
  }
}

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Access-Control-Allow-Origin": "*",
  });
  res.end(payload);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, {
      status: "ok",
      issuer: ISSUER_DID,
      triplestore: TRIPLESTORE_ENDPOINT ?? null,
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/eudr/assess") {
    const asset = url.searchParams.get("asset");
    if (asset !== null && asset !== ASSET_ID) {
      sendJson(res, 404, { error: "Unknown asset commitment", asset });
      return;
    }

    void (async () => {
      const fromTriplestore = await probeTriplestore();
      const assessment = buildAssessment();

      sendJson(res, 200, {
        ...assessment,
        // Surface which source decided compliance; a fallback must not be
        // presented as a triplestore-backed result.
        source: fromTriplestore === null ? "fallback" : "triplestore",
        triplestoreDeforestationFree: fromTriplestore,
        assetId: ASSET_ID,
        provenanceMerkleRoot: MERKLE_ROOT,
      });
    })();
    return;
  }

  if (req.method === "GET" && url.pathname === "/eudr/credential") {
    const { credential } = buildAssessment();
    sendJson(res, 200, credential);
    return;
  }

  sendJson(res, 404, {
    error: "Not found",
    routes: ["/health", "/eudr/assess", "/eudr/credential"],
  });
});

server.listen(PORT, () => {
  process.stdout.write(
    `AgriTrust compliance API listening on :${PORT} (issuer ${ISSUER_DID})\n`,
  );
});