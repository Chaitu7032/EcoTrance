import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Layers, Rotate3d, Search, X } from "lucide-react";
import type { EvidenceGraph } from "@ecotrace/shared";

const NODE_THEMES: Record<string, { border: string; bg: string; text: string; label: string }> = {
  company: { border: "border-stone-500", bg: "bg-stone-900/90", text: "text-stone-300", label: "Entity" },
  claim: { border: "border-emerald-600", bg: "bg-[#14231b]/95", text: "text-emerald-300", label: "Claim" },
  subclaim: { border: "border-amber-700", bg: "bg-[#251f15]/95", text: "text-amber-200", label: "Subclaim" },
  evidence: { border: "border-sky-800", bg: "bg-[#101c26]/95", text: "text-sky-300", label: "Evidence" },
  source: { border: "border-stone-600", bg: "bg-[#171a1d]/95", text: "text-stone-400", label: "Source" },
};

export function EvidenceGraphView({ graph }: { graph?: EvidenceGraph }) {
  const [kind, setKind] = useState("all");
  const [fullGraph, setFullGraph] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode3d, setMode3d] = useState(false);

  const nodes = graph?.nodes ?? [];
  const edges = graph?.edges ?? [];

  const firstClaim = useMemo(() => nodes.find((n) => n.type === "claim")?.id ?? null, [nodes]);

  // Default to selecting the first valid claim
  useEffect(() => {
    if (!selectedId || !nodes.some((n) => n.id === selectedId)) {
      if (firstClaim) setSelectedId(firstClaim);
    }
  }, [firstClaim, nodes, selectedId]);

  // Identify currently active claim context (either selected claim or claim related to selected node)
  const activeClaimId = useMemo(() => {
    if (!selectedId) return firstClaim;
    const node = nodes.find((n) => n.id === selectedId);
    if (!node) return firstClaim;
    if (node.type === "claim") return node.id;

    // If subclaim selected, find parent claim
    if (node.type === "subclaim") {
      const e = edges.find((edge) => edge.target === node.id);
      if (e) return e.source;
    }
    // If evidence selected, find connected subclaim then claim
    if (node.type === "evidence") {
      const e1 = edges.find((edge) => edge.target === node.id);
      if (e1) {
        const e2 = edges.find((edge) => edge.target === e1.source);
        if (e2) return e2.source;
      }
    }
    return firstClaim;
  }, [selectedId, firstClaim, nodes, edges]);

  // Compute strictly isolated connected subgraph for active claim:
  // Company -> Active Claim -> Its Subclaims -> Its Evidence -> Its Sources
  const focusedNodeIds = useMemo(() => {
    if (fullGraph) return new Set(nodes.map((n) => n.id));
    if (!activeClaimId) return new Set<string>();

    const subclaimIds = new Set(
      edges.filter((e) => e.source === activeClaimId).map((e) => e.target),
    );

    const evidenceIds = new Set(
      edges.filter((e) => subclaimIds.has(e.source)).map((e) => e.target),
    );

    const sourceIds = new Set(
      edges.filter((e) => evidenceIds.has(e.source)).map((e) => e.target),
    );

    // Company node that connects to the active claim
    const companyEdge = edges.find((e) => e.target === activeClaimId);
    const companyId = companyEdge ? companyEdge.source : null;

    const included = new Set<string>([activeClaimId]);
    if (companyId) included.add(companyId);
    subclaimIds.forEach((id) => included.add(id));
    evidenceIds.forEach((id) => included.add(id));
    sourceIds.forEach((id) => included.add(id));

    return included;
  }, [fullGraph, nodes, edges, activeClaimId]);

  const visibleNodes = useMemo(() => {
    return nodes.filter(
      (n) => focusedNodeIds.has(n.id) && (kind === "all" || n.type === kind),
    );
  }, [nodes, focusedNodeIds, kind]);

  const visibleIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);

  const visibleEdges = useMemo(() => {
    return edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target));
  }, [edges, visibleIds]);

  // Clean deterministic layout positions by semantic hierarchy column
  const positions = useMemo(() => {
    const colOrder = ["company", "claim", "subclaim", "evidence", "source"];
    const colX: Record<string, number> = {
      company: 8,
      claim: 26,
      subclaim: 46,
      evidence: 70,
      source: 90,
    };

    const out = new Map<string, { x: number; y: number }>();

    colOrder.forEach((type) => {
      const colNodes = visibleNodes.filter((n) => n.type === type);
      const count = colNodes.length;
      colNodes.forEach((n, idx) => {
        const step = count <= 1 ? 50 : 5 + (idx / (count - 1)) * 90;
        out.set(n.id, { x: colX[type], y: Math.min(95, Math.max(5, step)) });
      });
    });

    return out;
  }, [visibleNodes]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId],
  );

  const canvasHeight = useMemo(() => {
    const colOrder = ["company", "claim", "subclaim", "evidence", "source"];
    const maxCount = Math.max(...colOrder.map((type) => visibleNodes.filter((n) => n.type === type).length));
    return Math.max(470, maxCount * 75);
  }, [visibleNodes]);

  return (
    <div className="overflow-hidden rounded-md border border-[#26333c] bg-[#0c1216] text-[#e2ded4] shadow-md">
      {/* Graph Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#26333c] bg-[#10171c] px-4 py-2.5 text-xs">
        <div>
          <span className="font-mono text-[10px] tracking-widest text-[#3e7b5c]">
            {fullGraph ? "FULL RELATIONSHIP GRAPH" : "FOCUSED CLAIM EVIDENCE PATH"}
          </span>
          <p className="mt-0.5 text-[11px] text-[#8c887b]">
            {visibleNodes.length} visible entities · {visibleEdges.length} connections
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded border border-[#26333c] bg-[#141d23] px-2 py-1">
            <Layers size={13} className="text-[#8c887b]" />
            <select
              aria-label="Filter graph layer"
              className="bg-transparent text-[11px] text-[#e2ded4] focus:outline-none"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="all">All Layers</option>
              <option value="claim">Claims Only</option>
              <option value="subclaim">Subclaims</option>
              <option value="evidence">Evidence</option>
              <option value="source">Sources</option>
            </select>
          </div>

          <button
            type="button"
            className="flex items-center gap-1.5 rounded border border-[#26333c] bg-[#141d23] px-2.5 py-1 text-[11px] text-[#e2ded4] hover:border-[#3e7b5c] transition-colors"
            onClick={() => setFullGraph((v) => !v)}
          >
            <Search size={13} />
            {fullGraph ? "Focus Claim Subgraph" : "Explore Full Graph"}
          </button>

          <button
            type="button"
            className={`flex items-center gap-1.5 rounded border px-2.5 py-1 text-[11px] transition-colors ${
              mode3d
                ? "border-emerald-600 bg-emerald-950/40 text-emerald-300"
                : "border-[#26333c] bg-[#141d23] text-[#8c887b] hover:text-[#e2ded4]"
            }`}
            onClick={() => setMode3d((v) => !v)}
          >
            <Rotate3d size={13} />
            {mode3d ? "3D Active" : "2D View"}
          </button>

          {selectedId ? (
            <button
              type="button"
              className="flex items-center gap-1 rounded border border-[#26333c] bg-[#141d23] px-2 py-1 text-[11px] text-[#8c887b] hover:text-[#e2ded4]"
              onClick={() => setSelectedId(firstClaim)}
              title="Reset selection to default claim"
            >
              <X size={12} />
              Reset
            </button>
          ) : null}
        </div>
      </div>

      {/* Graph Visual Canvas */}
      <div className="relative h-[480px] overflow-auto [perspective:1200px]">
        <div
          className={`relative min-w-[920px] w-full transition-transform duration-500 ${
            mode3d ? "[transform:rotateX(12deg)_rotateY(-6deg)_scale(.95)]" : ""
          }`}
          style={{ minHeight: `${canvasHeight}px` }}
        >
          {/* SVG Connection Lines */}
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            {visibleEdges.map((edge) => {
              const a = positions.get(edge.source);
              const b = positions.get(edge.target);
              if (!a || !b) return null;
              const isSelected = selectedId === edge.source || selectedId === edge.target;
              const strokeColor =
                edge.relation === "CONTRADICTS"
                  ? "#e11d48"
                  : edge.relation === "SUPPORTS"
                  ? "#22c55e"
                  : "#64748b";

              return (
                <line
                  key={edge.id}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={strokeColor}
                  strokeWidth={isSelected ? 0.35 : 0.16}
                  strokeOpacity={isSelected ? 0.9 : 0.35}
                />
              );
            })}
          </svg>

          {/* Interactive Nodes */}
          {visibleNodes.map((node) => {
            const pos = positions.get(node.id);
            if (!pos) return null;
            const isSelected = selectedId === node.id;
            const theme = NODE_THEMES[node.type] ?? NODE_THEMES.source;

            return (
              <button
                key={node.id}
                type="button"
                onClick={() => setSelectedId(node.id)}
                className={`absolute max-w-[170px] -translate-x-1/2 -translate-y-1/2 rounded border px-2.5 py-1.5 text-left text-[11px] shadow-sm transition-all hover:z-20 hover:scale-105 ${
                  theme.border
                } ${theme.bg} ${
                  isSelected
                    ? "ring-2 ring-emerald-500/70 z-10 brightness-110 shadow-lg scale-105"
                    : "opacity-85 hover:opacity-100"
                }`}
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className={`font-mono text-[9px] uppercase tracking-wider ${theme.text}`}>
                    {theme.label}
                  </span>
                  {node.data?.status ? (
                    <span className="text-[8px] opacity-75 font-mono">
                      {String(node.data.status).replace("_", " ")}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 line-clamp-2 leading-tight text-[#f4f1ea] font-medium">
                  {node.label}
                </p>
              </button>
            );
          })}
        </div>

        {!nodes.length ? (
          <div className="absolute inset-0 grid place-items-center text-sm text-[#8c887b]">
            Evidence graph data is not yet generated.
          </div>
        ) : null}
      </div>

      {/* Selected Node Inspector Detail Card */}
      {selectedNode ? (
        <div className="border-t border-[#26333c] bg-[#10171c] p-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[#3e7b5c]">
                INSPECTOR / {selectedNode.type}
              </span>
              <span className="text-[#8c887b]">·</span>
              <span className="font-medium text-[#f4f1ea]">{selectedNode.label}</span>
            </div>
            {selectedNode.data?.url ? (
              <a
                href={String(selectedNode.data.url)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-[#3e7b5c] hover:underline"
              >
                Open Source <ExternalLink size={11} />
              </a>
            ) : null}
          </div>

          {selectedNode.data?.snippet ? (
            <p className="mt-1.5 text-[11px] leading-relaxed text-[#8c887b]">
              "{String(selectedNode.data.snippet)}"
            </p>
          ) : null}

          {selectedNode.data?.explanation ? (
            <p className="mt-1 text-[11px] text-[#e2ded4]/80">
              <span className="text-[#8c887b]">Assessment:</span> {String(selectedNode.data.explanation)}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Graph Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#26333c] px-4 py-2 text-[10px] text-[#8c887b]">
        <div className="flex flex-wrap gap-3">
          {Object.entries(NODE_THEMES).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1">
              <span className={`inline-block h-2 w-2 rounded-full border ${v.border} ${v.bg}`} />
              {v.label}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3 font-mono text-[9px]">
          <span className="text-emerald-400">Green: Supporting</span>
          <span className="text-rose-400">Red: Contradicting</span>
          <span className="text-stone-400">Gray: Relates</span>
        </div>
      </div>
    </div>
  );
}
