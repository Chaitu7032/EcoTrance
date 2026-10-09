import { describe, expect, it } from "vitest";
import type { EvidenceGraph } from "@ecotrace/shared";

function computeFocusedSubgraph(graph: EvidenceGraph, activeClaimId: string | null): Set<string> {
  if (!activeClaimId) return new Set();

  const subclaimIds = new Set(
    graph.edges.filter((e) => e.source === activeClaimId).map((e) => e.target),
  );

  const evidenceIds = new Set(
    graph.edges.filter((e) => subclaimIds.has(e.source)).map((e) => e.target),
  );

  const sourceIds = new Set(
    graph.edges.filter((e) => evidenceIds.has(e.source)).map((e) => e.target),
  );

  const companyEdge = graph.edges.find((e) => e.target === activeClaimId);
  const companyId = companyEdge ? companyEdge.source : null;

  const included = new Set<string>([activeClaimId]);
  if (companyId) included.add(companyId);
  subclaimIds.forEach((id) => included.add(id));
  evidenceIds.forEach((id) => included.add(id));
  sourceIds.forEach((id) => included.add(id));

  return included;
}

describe("graph subgraph isolation", () => {
  const sampleGraph: EvidenceGraph = {
    nodes: [
      { id: "comp:1", type: "company", label: "IKEA", data: {} },
      { id: "claim:1", type: "claim", label: "Claim 1", data: {} },
      { id: "claim:2", type: "claim", label: "Claim 2", data: {} },
      { id: "sub:1", type: "subclaim", label: "Subclaim 1", data: {} },
      { id: "sub:2", type: "subclaim", label: "Subclaim 2", data: {} },
      { id: "ev:1", type: "evidence", label: "Evidence 1", data: {} },
      { id: "ev:2", type: "evidence", label: "Evidence 2", data: {} },
      { id: "src:1", type: "source", label: "Source 1", data: {} },
      { id: "src:2", type: "source", label: "Source 2", data: {} },
    ],
    edges: [
      { id: "e1", source: "comp:1", target: "claim:1", relation: "RELATES_TO", label: "", data: {} },
      { id: "e2", source: "comp:1", target: "claim:2", relation: "RELATES_TO", label: "", data: {} },
      { id: "e3", source: "claim:1", target: "sub:1", relation: "RELATES_TO", label: "", data: {} },
      { id: "e4", source: "claim:2", target: "sub:2", relation: "RELATES_TO", label: "", data: {} },
      { id: "e5", source: "sub:1", target: "ev:1", relation: "SUPPORTS", label: "", data: {} },
      { id: "e6", source: "sub:2", target: "ev:2", relation: "SUPPORTS", label: "", data: {} },
      { id: "e7", source: "ev:1", target: "src:1", relation: "RELATES_TO", label: "", data: {} },
      { id: "e8", source: "ev:2", target: "src:2", relation: "RELATES_TO", label: "", data: {} },
    ],
  };

  it("isolates selected claim and excludes sibling claims and their descendants", () => {
    const focused = computeFocusedSubgraph(sampleGraph, "claim:1");

    expect(focused.has("comp:1")).toBe(true);
    expect(focused.has("claim:1")).toBe(true);
    expect(focused.has("sub:1")).toBe(true);
    expect(focused.has("ev:1")).toBe(true);
    expect(focused.has("src:1")).toBe(true);

    // Critical assertion: claim:2 and its branch MUST NOT be included
    expect(focused.has("claim:2")).toBe(false);
    expect(focused.has("sub:2")).toBe(false);
    expect(focused.has("ev:2")).toBe(false);
    expect(focused.has("src:2")).toBe(false);
  });
});
