import type { CircuitBlock, CircuitBlockKind } from "@/types/project";

/**
 * SVG block-diagram rendering of a CircuitBlock graph.
 *
 * Layout strategy (simple, deterministic, no external deps):
 *   - Each block kind gets its own column, ordered from left (power
 *     inputs) to right (consumers) in a way that matches how hardware
 *     engineers draw block diagrams.
 *   - Within a column, blocks stack vertically by insertion order.
 *   - Connections are drawn as cubic Bézier paths from right-edge of
 *     source to left-edge of target.
 *
 * Why SVG and not react-flow: react-flow pulls ~90 kB and requires
 * client hydration + state. A static SVG is zero JS, zero deps, and
 * matches how engineers actually consume a block diagram (glance, not
 * interact). Pan/zoom can be added later if a real user reports needing it.
 */

interface CircuitGraphProps {
  blocks: CircuitBlock[];
  className?: string;
}

// Column order matches how engineers draw signal flow:
// external I/O → protection → power → processing → peripherals → I/O back out
const KIND_COLUMN: Record<CircuitBlockKind, number> = {
  interface: 0,   // input connectors first
  protection: 1,
  power: 2,
  processing: 3,
  storage: 3,     // share a column with processing
  sensor: 4,
  analog: 4
};

const KIND_FILL: Record<CircuitBlockKind, string> = {
  interface: "#0f172a",
  protection: "#27272a",
  power: "#422006",
  processing: "#1e293b",
  storage: "#1e3a5f",
  sensor: "#1a2e05",
  analog: "#2e1065"
};

const KIND_STROKE: Record<CircuitBlockKind, string> = {
  interface: "#38bdf8",
  protection: "#a1a1aa",
  power: "#fb923c",
  processing: "#60a5fa",
  storage: "#7dd3fc",
  sensor: "#84cc16",
  analog: "#a78bfa"
};

const BLOCK_W = 160;
const BLOCK_H = 64;
const COL_GAP = 80;
const ROW_GAP = 24;
const PAD_X = 24;
const PAD_Y = 24;

interface Placed {
  block: CircuitBlock;
  x: number;
  y: number;
  col: number;
}

function layout(blocks: CircuitBlock[]): { placed: Placed[]; width: number; height: number } {
  // Group by column
  const byCol = new Map<number, CircuitBlock[]>();
  for (const b of blocks) {
    const col = KIND_COLUMN[b.kind] ?? 3;
    if (!byCol.has(col)) byCol.set(col, []);
    byCol.get(col)!.push(b);
  }

  // Shift columns down so the smallest populated col starts at 0
  const columns = Array.from(byCol.keys()).sort((a, b) => a - b);
  const colIndexMap = new Map(columns.map((c, i) => [c, i]));

  const placed: Placed[] = [];
  let maxRows = 0;
  for (const [col, items] of byCol.entries()) {
    const i = colIndexMap.get(col) ?? 0;
    items.forEach((block, row) => {
      placed.push({
        block,
        col: i,
        x: PAD_X + i * (BLOCK_W + COL_GAP),
        y: PAD_Y + row * (BLOCK_H + ROW_GAP)
      });
    });
    maxRows = Math.max(maxRows, items.length);
  }

  const width = PAD_X * 2 + columns.length * BLOCK_W + (columns.length - 1) * COL_GAP;
  const height = PAD_Y * 2 + maxRows * BLOCK_H + (maxRows - 1) * ROW_GAP;
  return { placed, width, height };
}

function connectionPath(from: Placed, to: Placed): string {
  const sx = from.x + BLOCK_W;
  const sy = from.y + BLOCK_H / 2;
  const tx = to.x;
  const ty = to.y + BLOCK_H / 2;
  // Straight horizontal line if same row, Bézier otherwise
  if (Math.abs(sy - ty) < 4 && tx > sx) {
    return `M${sx},${sy} L${tx},${ty}`;
  }
  const midX = (sx + tx) / 2;
  return `M${sx},${sy} C${midX},${sy} ${midX},${ty} ${tx},${ty}`;
}

export function CircuitGraph({ blocks, className }: CircuitGraphProps) {
  if (!blocks || blocks.length === 0) {
    return (
      <div className={`rounded-xl border border-dashed border-border/70 bg-background/20 p-8 text-center text-sm text-muted-foreground ${className ?? ""}`}>
        Run the AI generation pipeline to see the circuit graph.
      </div>
    );
  }

  const { placed, width, height } = layout(blocks);
  const byId = new Map(placed.map((p) => [p.block.id, p]));

  // Unique edges (don't draw A→B and B→A twice)
  const drawnEdges = new Set<string>();
  const edges: { from: Placed; to: Placed }[] = [];
  for (const p of placed) {
    for (const targetId of p.block.connections) {
      const target = byId.get(targetId);
      if (!target) continue;
      const key = [p.block.id, targetId].sort().join("→");
      if (drawnEdges.has(key)) continue;
      drawnEdges.add(key);
      edges.push({ from: p, to: target });
    }
  }

  return (
    <div className={`overflow-x-auto rounded-xl border border-border/60 bg-background/40 p-2 ${className ?? ""}`}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label={`Circuit block diagram with ${blocks.length} blocks and ${edges.length} connections`}
        className="max-w-full"
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="#71717a" />
          </marker>
        </defs>

        {/* Connections first so they sit behind blocks */}
        <g data-testid="circuit-edges">
          {edges.map(({ from, to }, i) => (
            <path
              key={i}
              d={connectionPath(from, to)}
              fill="none"
              stroke="#71717a"
              strokeWidth="1.5"
              strokeDasharray="0"
              markerEnd="url(#arrow)"
            />
          ))}
        </g>

        {/* Blocks on top */}
        <g data-testid="circuit-nodes">
          {placed.map(({ block, x, y }) => (
            <g key={block.id} transform={`translate(${x}, ${y})`}>
              <rect
                width={BLOCK_W}
                height={BLOCK_H}
                rx={10}
                fill={KIND_FILL[block.kind]}
                stroke={KIND_STROKE[block.kind]}
                strokeWidth="1.5"
              />
              <text
                x={BLOCK_W / 2}
                y={BLOCK_H / 2 - 4}
                textAnchor="middle"
                fontSize="13"
                fontWeight="600"
                fill="#f4f4f5"
              >
                {block.label}
              </text>
              <text
                x={BLOCK_W / 2}
                y={BLOCK_H / 2 + 14}
                textAnchor="middle"
                fontSize="10"
                fill={KIND_STROKE[block.kind]}
                opacity="0.85"
              >
                {block.kind}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
