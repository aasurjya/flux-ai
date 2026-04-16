"use client";

import * as React from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
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
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [selectedBlockId, setSelectedBlockId] = React.useState<string | null>(null);
  const dragging = React.useRef(false);
  const lastPointer = React.useRef({ x: 0, y: 0 });

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

  // Legend: only show kinds actually present in this graph.
  const presentKinds = Array.from(
    new Set(blocks.map((b) => b.kind))
  ) as CircuitBlockKind[];

  const selectedBlock = selectedBlockId ? blocks.find((b) => b.id === selectedBlockId) : null;
  const selectedPlaced = selectedBlockId ? byId.get(selectedBlockId) : null;

  // ViewBox computed from zoom + pan (use || 0 to avoid -0 in SSR)
  const vbW = width / zoom;
  const vbH = height / zoom;
  const vbX = (-pan.x / zoom) || 0;
  const vbY = (-pan.y / zoom) || 0;

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((z) => Math.min(3, Math.max(0.3, z + delta)));
  }

  function handlePointerDown(e: React.PointerEvent) {
    // Only pan on middle-click or when not clicking a block
    if (e.button !== 0 && e.button !== 1) return;
    dragging.current = true;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    const dx = e.clientX - lastPointer.current.x;
    const dy = e.clientY - lastPointer.current.y;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
  }

  function handlePointerUp() {
    dragging.current = false;
  }

  function handleBlockClick(blockId: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedBlockId((prev) => (prev === blockId ? null : blockId));
  }

  function zoomIn() {
    setZoom((z) => Math.min(3, z + 0.2));
  }

  function zoomOut() {
    setZoom((z) => Math.max(0.3, z - 0.2));
  }

  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <div className="relative overflow-hidden rounded-xl border border-border/60 bg-background/40 p-2">
        {/* Zoom controls */}
        <div className="absolute right-3 top-3 z-10 flex gap-1">
          <button
            type="button"
            onClick={zoomIn}
            aria-label="Zoom in"
            className="rounded-md border border-border/60 bg-background/80 p-1.5 text-muted-foreground hover:text-foreground backdrop-blur-sm"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={zoomOut}
            aria-label="Zoom out"
            className="rounded-md border border-border/60 bg-background/80 p-1.5 text-muted-foreground hover:text-foreground backdrop-blur-sm"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
        </div>

        <svg
          viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
          width={width}
          height={height}
          role="img"
          aria-label={`Circuit block diagram with ${blocks.length} blocks and ${edges.length} connections`}
          className="max-w-full cursor-grab active:cursor-grabbing"
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
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

          {/* Blocks on top — clickable */}
          <g data-testid="circuit-nodes">
            {placed.map(({ block, x, y }) => (
              <g
                key={block.id}
                transform={`translate(${x}, ${y})`}
                data-block-id={block.id}
                className="cursor-pointer"
                onClick={(e) => handleBlockClick(block.id, e)}
                role="button"
                tabIndex={0}
                aria-label={`${block.label} (${block.kind})`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedBlockId((prev) => (prev === block.id ? null : block.id));
                  }
                }}
              >
                <rect
                  width={BLOCK_W}
                  height={BLOCK_H}
                  rx={10}
                  fill={KIND_FILL[block.kind]}
                  stroke={selectedBlockId === block.id ? "#f4f4f5" : KIND_STROKE[block.kind]}
                  strokeWidth={selectedBlockId === block.id ? 2.5 : 1.5}
                />
                <text
                  x={BLOCK_W / 2}
                  y={BLOCK_H / 2 - 4}
                  textAnchor="middle"
                  fontSize="13"
                  fontWeight="600"
                  fill="#f4f4f5"
                  style={{ pointerEvents: "none" }}
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
                  style={{ pointerEvents: "none" }}
                >
                  {block.kind}
                </text>
              </g>
            ))}
          </g>
        </svg>

        {/* Block detail popover */}
        {selectedBlock && selectedPlaced && (
          <div
            data-testid="block-popover"
            className="absolute z-20 rounded-lg border border-border/70 bg-card/95 p-3 shadow-lg backdrop-blur-sm text-sm"
            style={{
              left: Math.min(selectedPlaced.x + BLOCK_W + 12, width - 180),
              top: selectedPlaced.y
            }}
          >
            <p className="font-medium text-foreground">{selectedBlock.label}</p>
            <p className="text-xs text-muted-foreground">
              {selectedBlock.kind} &middot; {selectedBlock.id}
            </p>
            {selectedBlock.connections.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium text-muted-foreground">Connects to:</p>
                <ul className="mt-1 space-y-0.5">
                  {selectedBlock.connections.map((cid) => {
                    const target = blocks.find((b) => b.id === cid);
                    return (
                      <li key={cid} className="text-xs text-muted-foreground">
                        {target ? `${target.label} (${target.kind})` : cid}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
      {/* Legend — only the kinds actually used in this graph */}
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground"
        aria-label="Legend — block kind to color mapping"
      >
        {presentKinds.map((kind) => (
          <span key={kind} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: KIND_FILL[kind], borderColor: KIND_STROKE[kind], borderWidth: 1, borderStyle: "solid" }}
            />
            <span>{kind}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
