import { createHash, verify, KeyObject, createPublicKey } from 'node:crypto';

export interface ProvenanceNode {
  id: string;
  type: string;
  label: string;
  uri: string;
  attributes: Record<string, any>;
}

export interface ProvenanceEdge {
  id: string;
  source: string;
  target: string;
  relationship: string;
}

export interface ProvenanceGraph {
  targetNodeId: string;
  subgraphDigest: string;
  nodes: ProvenanceNode[];
  lineageEdges: ProvenanceEdge[];
}

export interface VerifiablePresentationPayload {
  '@context': string[];
  id: string;
  type: string[];
  holder: string;
  issuanceDate: string;
  verifiableCredential: Array<{
    id: string;
    type: string[];
    issuer: string | { id: string };
    credentialSubject: Record<string, any>;
    proof?: {
      type: string;
      proofValue?: string;
      [key: string]: any;
    };
  }>;
  provenanceGraph: ProvenanceGraph;
  proof: {
    type: string;
    created: string;
    verificationMethod: string;
    proofPurpose: string;
    challenge: string;
    proofValue: string;
  };
}

export interface VerificationResult {
  isValid: boolean;
  digestValid: boolean;
  challengeValid: boolean;
  signatureValid: boolean;
  credentialsValid: boolean;
  errors: string[];
  metadata: {
    targetNodeId: string;
    verifiedDigest: string;
    holderDid: string;
    credentialsVerified: number;
    timestamp: string;
  };
}

const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function decodeBase58(input: string): Uint8Array {
  const bytes = [0];
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const value = B58_ALPHABET.indexOf(char);
    if (value === -1) throw new Error(`Invalid Base58 character: ${char}`);

    for (let j = 0; j < bytes.length; j++) bytes[j] *= 58;
    bytes[0] += value;

    let carry = 0;
    for (let j = 0; j < bytes.length; j++) {
      bytes[j] += carry;
      carry = bytes[j] >> 8;
      bytes[j] &= 0xff;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  for (let i = 0; i < input.length && input[i] === '1'; i++) {
    bytes.push(0);
  }

  return new Uint8Array(bytes.reverse());
}

function extractEd25519PublicKeyFromDid(did: string): Buffer {
  if (!did.startsWith('did:key:z')) {
    throw new Error(`Unsupported DID scheme: ${did}`);
  }

  const multibasePart = did.slice('did:key:z'.length);
  const decoded = decodeBase58(multibasePart);

  if (decoded[0] === 0xed && decoded[1] === 0x01 && decoded.length === 34) {
    return Buffer.from(decoded.slice(2));
  }

  if (decoded.length === 32) {
    return Buffer.from(decoded);
  }

  throw new Error(`Unrecognized Ed25519 multicodec key header in DID: ${did}`);
}

function createEd25519KeyObject(rawKey: Buffer): KeyObject {
  const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
  const derPublicKey = Buffer.concat([spkiPrefix, rawKey]);

  return createPublicKey({
    key: derPublicKey,
    format: 'der',
    type: 'spki',
  });
}

function sha256Hex(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export async function verifyAgriTrustVerifiablePresentation(
  presentation: VerifiablePresentationPayload,
  options: {
    allowMockSignatures?: boolean;
    expectedTargetNodeId?: string;
  } = {}
): Promise<VerificationResult> {
  const errors: string[] = [];
  let digestValid = false;
  let challengeValid = false;
  let signatureValid = false;
  let credentialsValid = true;

  if (!presentation.id || !presentation.holder || !presentation.provenanceGraph || !presentation.proof) {
    return {
      isValid: false,
      digestValid: false,
      challengeValid: false,
      signatureValid: false,
      credentialsValid: false,
      errors: ['Malformed presentation payload: missing mandatory top-level properties.'],
      metadata: {
        targetNodeId: presentation.provenanceGraph?.targetNodeId || 'unknown',
        verifiedDigest: '',
        holderDid: presentation.holder || 'unknown',
        credentialsVerified: 0,
        timestamp: new Date().toISOString(),
      },
    };
  }

  const { provenanceGraph, proof } = presentation as Required<typeof presentation>;

  if (options.expectedTargetNodeId && provenanceGraph.targetNodeId !== options.expectedTargetNodeId) {
    errors.push(
      `Target node mismatch: Expected '${options.expectedTargetNodeId}' but found '${provenanceGraph.targetNodeId}'.`
    );
  }

  const canonicalGraphRepresentation = JSON.stringify({
    target: provenanceGraph.targetNodeId,
    nodes: provenanceGraph.nodes.map((n) => ({ id: n.id, uri: n.uri })),
    edges: provenanceGraph.lineageEdges.map((e) => ({
      s: e.source,
      t: e.target,
      r: e.relationship,
    })),
  });

  const recomputedDigest = sha256Hex(canonicalGraphRepresentation);
  const cleanDocumentDigest = (provenanceGraph.subgraphDigest ?? '').replace(/^0x/, '').toLowerCase();

  if (recomputedDigest.toLowerCase() === cleanDocumentDigest) {
    digestValid = true;
  } else {
    errors.push(
      `Merkle digest mismatch: Recomputed '0x${recomputedDigest}' != Declared '${provenanceGraph.subgraphDigest}'.`
    );
  }

  const expectedChallenge = sha256Hex(
    `${presentation.id}:${presentation.issuanceDate}:${cleanDocumentDigest}`
  );

  const cleanDocumentChallenge = (proof?.challenge ?? '').replace(/^0x/, '').toLowerCase();

  if (expectedChallenge.toLowerCase() === cleanDocumentChallenge) {
    challengeValid = true;
  } else {
    errors.push(
      `Challenge verification failure: Expected '${expectedChallenge}' != Proof challenge '${proof.challenge}'.`
    );
  }

  try {
    const rawPublicKey = extractEd25519PublicKeyFromDid(presentation.holder);
    const publicKeyObject = createEd25519KeyObject(rawPublicKey);

    if (proof.proofValue?.includes('...')) {
      if (options.allowMockSignatures) {
        signatureValid = true;
      } else {
        errors.push('Simulated signature pattern detected and strict verification is enforced.');
      }
    } else {
      let signatureBytes: Buffer;
      if (proof.proofValue.startsWith('z')) {
        signatureBytes = Buffer.from(decodeBase58(proof.proofValue.slice(1)));
      } else {
        signatureBytes = Buffer.from(proof.proofValue, 'base64');
      }

      const signedData = Buffer.from(cleanDocumentChallenge, 'utf8');
      signatureValid = verify(null, signedData, publicKeyObject, signatureBytes);

      if (!signatureValid) {
        errors.push('Ed25519 signature is invalid for the holder public key and challenge.');
      }
    }
  } catch (err: any) {
    errors.push(`Cryptographic key resolution failed: ${err.message}`);
  }

  const credentials = presentation.verifiableCredential || [];
  if (credentials.length === 0) {
    errors.push('Warning: No supporting Verifiable Credentials bound to this provenance presentation.');
  }

  for (let i = 0; i < credentials.length; i++) {
    const vc = credentials[i]!;
    if (!vc.id || !vc.type || !vc.credentialSubject) {
      credentialsValid = false;
      errors.push(`Credential index [${i}] is malformed (missing id, type, or subject).`);
    }
    if (!vc.proof || !vc.proof.proofValue) {
      credentialsValid = false;
      errors.push(`Credential '${vc.id}' lacks a cryptographic proof envelope.`);
    }
  }

  const isValid = digestValid && challengeValid && signatureValid && credentialsValid && errors.length === 0;

  return {
    isValid,
    digestValid,
    challengeValid,
    signatureValid,
    credentialsValid,
    errors,
    metadata: {
      targetNodeId: provenanceGraph.targetNodeId,
      verifiedDigest: `0x${recomputedDigest}`,
      holderDid: presentation.holder,
      credentialsVerified: credentials.length,
      timestamp: new Date().toISOString(),
    },
  };
}
