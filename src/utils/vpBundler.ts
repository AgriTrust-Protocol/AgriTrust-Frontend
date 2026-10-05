import { Node, Edge } from '@xyflow/react';

export interface VerifiablePresentationPayload {
  '@context': string[];
  id: string;
  type: string[];
  holder: string;
  issuanceDate: string;
  verifiableCredential: any[];
  provenanceGraph: {
    targetNodeId: string;
    subgraphDigest: string;
    nodes: Array<{
      id: string;
      type: string;
      label: string;
      uri: string;
      attributes: Record<string, any>;
    }>;
    lineageEdges: Array<{
      id: string;
      source: string;
      target: string;
      relationship: string;
    }>;
  };
  proof: {
    type: string;
    created: string;
    verificationMethod: string;
    proofPurpose: string;
    challenge: string;
    proofValue: string;
  };
}

async function computeSha256Hex(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function createLineageVerifiablePresentation(
  targetNode: Node,
  highlightedNodeIds: Set<string>,
  highlightedEdgeIds: Set<string>,
  allNodes: Node[],
  allEdges: Edge[],
  holderDid: string = 'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH'
): Promise<VerifiablePresentationPayload> {
  const lineageNodes = allNodes
    .filter((n) => highlightedNodeIds.has(n.id))
    .map((n) => ({
      id: n.id,
      type: (n.type as string) || 'unknown',
      label: (n.data?.label as string) || n.id,
      uri: (n.data?.uri as string) || `https://schema.agritrust.io/core#${n.id}`,
      attributes: (n.data?.details as Record<string, any>) || {},
    }));

  const lineageEdges = allEdges
    .filter((e) => highlightedEdgeIds.has(e.id))
    .map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      relationship: (e.label as string) || ':connectedProcess',
    }));

  const verifiableCredentials = allNodes
    .filter((n) => highlightedNodeIds.has(n.id) && n.type === 'certificate')
    .map((certNode) => {
      const data = certNode.data || {};
      return {
        '@context': [
          'https://www.w3.org/ns/credentials/v2',
          'https://schema.agritrust.io/v1',
        ],
        id: data.uri || `urn:uuid:${certNode.id}`,
        type: ['VerifiableCredential', 'EUDRDeforestationFreeCertificate'],
        issuer: data.issuerDid || 'did:web:compliance.agritrust.io',
        validFrom: '2026-09-15T09:00:00Z',
        credentialSubject: {
          id: holderDid,
          standard: data.standard || 'EUDR Reg 2023/1115',
          merkleRoot: data.merkleRoot,
          isCompliant: data.isCompliant ?? true,
          details: data.details || {},
        },
        proof: {
          type: 'Ed25519Signature2020',
          created: '2026-09-15T09:00:05Z',
          verificationMethod: `${data.issuerDid || 'did:web:compliance.agritrust.io'}#key-1`,
          proofPurpose: 'assertionMethod',
          proofValue: 'z3mKq8Wn...verified_upstream_credential...98xZv',
        },
      };
    });

  const canonicalGraphRepresentation = JSON.stringify({
    target: targetNode.id,
    nodes: lineageNodes.map((n) => ({ id: n.id, uri: n.uri })),
    edges: lineageEdges.map((e) => ({ s: e.source, t: e.target, r: e.relationship })),
  });
  const subgraphDigest = await computeSha256Hex(canonicalGraphRepresentation);

  const vpId = `urn:uuid:${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const challenge = await computeSha256Hex(`${vpId}:${now}:${subgraphDigest}`);

  const presentationPayload: VerifiablePresentationPayload = {
    '@context': [
      'https://www.w3.org/ns/credentials/v2',
      'https://schema.agritrust.io/v1',
    ],
    id: vpId,
    type: ['VerifiablePresentation', 'AgriTrustLineagePresentation'],
    holder: holderDid,
    issuanceDate: now,
    verifiableCredential: verifiableCredentials,
    provenanceGraph: {
      targetNodeId: targetNode.id,
      subgraphDigest: `0x${subgraphDigest}`,
      nodes: lineageNodes,
      lineageEdges,
    },
    proof: {
      type: 'Ed25519Signature2020',
      created: now,
      verificationMethod: `${holderDid}#key-1`,
      proofPurpose: 'authentication',
      challenge,
      proofValue: `z${subgraphDigest.slice(0, 32)}...signed_presentation_envelope...${vpId.slice(-8)}`,
    },
  };

  return presentationPayload;
}

export function downloadJsonFile(filename: string, data: Record<string, any>): void {
  const jsonBlob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const downloadUrl = URL.createObjectURL(jsonBlob);
  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(downloadUrl);
}
