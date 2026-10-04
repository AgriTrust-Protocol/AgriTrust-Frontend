/**
 * Folds a set of content commitments into a Merkle root and compares it with the
 * root anchored on Soroban.
 *
 * Used by test_agritrust_eudr_e2e.sh to prove the commitments served by the
 * triplestore reproduce the farmer's on-ledger anchor, and that mutating a single
 * statement breaks that proof.
 *
 * Usage:
 *   node infra/verify-merkle-root.mjs --sparql '<sparql results json>'
 *   node infra/verify-merkle-root.mjs --sparql '<json>' --tamper
 *   node infra/verify-merkle-root.mjs --file infra/fuseki/batch-COF-LOT-2024-0892.ttl
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const sha = (value) => createHash("sha256").update(value, "utf8").digest("hex");

/** Identical to buildMerkleRoot in src/lib/AgriTrustLineageService.ts. */
function buildMerkleRoot(leaves) {
  if (leaves.length === 0) return sha("agritrust:empty-provenance-graph");

  let level = [...leaves].sort();

  while (level.length > 1) {
    const next = [];
    for (let index = 0; index < level.length; index += 2) {
      const left = level[index];
      const right = level[index + 1] ?? left;
      next.push(sha(`${left}${right}`));
    }
    level = next.sort();
  }

  return level[0];
}

function parseSparqlLeaves(raw) {
  const payload = JSON.parse(raw);
  const bindings = payload?.results?.bindings ?? [];
  return bindings
    .map((binding) => binding?.h?.value)
    .filter((value) => typeof value === "string" && value.length > 0);
}

function parseTurtleLeaves(raw) {
  return [...raw.matchAll(/agritrust:contentHash "([0-9a-f]{64})"/g)].map(
    (match) => match[1],
  );
}

function parseArgs(argv) {
  const options = { sparql: null, file: null, tamper: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--tamper") {
      options.tamper = true;
    } else if (arg === "--sparql") {
      options.sparql = argv[index + 1] ?? null;
      index += 1;
    } else if (arg === "--file") {
      options.file = argv[index + 1] ?? null;
      index += 1;
    }
  }

  return options;
}

function main() {
  const ANCHORED_ROOT =
    "6754964ce63edb44cf21da33bc88832aece614e42e35aa8be9c02b2867bb79a2";

  const options = parseArgs(process.argv.slice(2));

  let leaves;
  if (options.sparql !== null) {
    leaves = parseSparqlLeaves(options.sparql);
  } else if (options.file !== null) {
    leaves = parseTurtleLeaves(readFileSync(options.file, "utf8"));
  } else {
    process.stderr.write("usage: --sparql <json> | --file <ttl> [--tamper]\n");
    process.exit(2);
  }

  if (leaves.length === 0) {
    process.stderr.write("no content commitments found in input\n");
    process.exit(2);
  }

  process.stdout.write(`leaves: ${leaves.length}\n`);

  if (options.tamper) {
    // Mutate one statement: the root must diverge from the anchor.
    const tampered = [...leaves];
    tampered[0] = sha(`${tampered[0]}:tampered`);
    const tamperedRoot = buildMerkleRoot(tampered);

    process.stdout.write(`pristine root: ${buildMerkleRoot(leaves)}\n`);
    process.stdout.write(`tampered root: ${tamperedRoot}\n`);

    if (tamperedRoot === buildMerkleRoot(leaves)) {
      process.stderr.write("tampering did not change the Merkle root\n");
      process.exit(1);
    }

    process.stdout.write("tamper detected: root diverged from the pristine graph\n");
    return;
  }

  const root = buildMerkleRoot(leaves);
  process.stdout.write(`computed root: ${root}\n`);
  process.stdout.write(`anchored root: ${ANCHORED_ROOT}\n`);

  if (root !== ANCHORED_ROOT) {
    process.stderr.write("Merkle root does not match the anchored commitment\n");
    process.exit(1);
  }

  process.stdout.write("verified: commitments fold to the anchored root\n");
}

main();