"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  forceCenter,
  forceLink,
  forceManyBody,
  forceSimulation,
  type ForceCenter,
  type ForceLink,
  type ForceManyBody,
  type Simulation,
  type SimulationNodeDatum,
} from "d3-force";
import { select } from "d3-selection";
import {
  zoom as d3Zoom,
  zoomIdentity,
  type D3ZoomEvent,
  type ZoomBehavior,
  type ZoomTransform,
} from "d3-zoom";
import { ContactChips } from "@/components/ContactChips";
import type { Person, Connection, Group } from "@/types/database";

// Force-directed network view. d3-force simulation (forceLink / forceManyBody /
// forceCenter) rendered as plain SVG. Drag repositions transiently (pin while
// down, release on up); pinch/wheel zooms and background-drag pans via d3-zoom.
// Nothing is persisted — layout re-settles from the forces on every mount.
// Tap a person node to open their detail page.

type SimNode = SimulationNodeDatum & {
  id: string;
  kind: "you" | "person" | "org";
  label: string;
  sub: string | null;
  // Group color; null renders the neutral white node.
  color: string | null;
  groupId: string | null;
};

// A derived org hub: synthesized at render time when ≥2 people share a
// company or school (case-insensitive). Never stored.
type OrgHub = {
  id: string;
  kind: "company" | "school";
  label: string;
  members: Person[];
};

type SimLink = {
  source: string | SimNode;
  target: string | SimNode;
  label: string | null;
};

// Generous radii — these are the tap targets on mobile.
const NODE_RADIUS: Record<SimNode["kind"], number> = { you: 26, person: 20, org: 16 };

// Force defaults (charge applied as a negative, repulsive strength).
const LINK_DIST_DEFAULT = 110;
const CHARGE_DEFAULT = 220;
const CENTER_DEFAULT = 1;

type ForceParams = { linkDist: number; charge: number; center: number };
const ZOOM_EXTENT: [number, number] = [0.25, 6];
// Pointer-up within this many screen px of pointer-down is a tap, not a drag.
const CLICK_SLOP = 8;

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max).trimEnd() + "…" : s;
}

export function ConnectionGraph({
  people,
  connections,
  groups = [],
}: {
  people: Person[];
  connections: Connection[];
  groups?: Group[];
}) {
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const groupOf = (p: Person | undefined | null): Group | null =>
    (p?.group_id && groupById.get(p.group_id)) || null;
  // Pinned nodes (people or org hubs) — tap toggles a node in/out of the pin
  // set; each pin gets a detail card in the swipeable stack at the bottom.
  const [pinnedIds, setPinnedIds] = useState<readonly string[]>([]);
  const togglePin = (id: string) =>
    setPinnedIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  // Force sliders (session-only). The ref lets the sim-build effect read
  // current values without depending on them — slider changes mutate the live
  // forces instead of rebuilding the simulation.
  const [showForces, setShowForces] = useState(false);
  const [forceParams, setForceParams] = useState<ForceParams>({
    linkDist: LINK_DIST_DEFAULT,
    charge: CHARGE_DEFAULT,
    center: CENTER_DEFAULT,
  });
  const forceParamsRef = useRef(forceParams);
  const applyForceParams = (next: ForceParams) => {
    setForceParams(next);
    forceParamsRef.current = next;
    const sim = simRef.current;
    if (!sim) return;
    (sim.force("link") as ForceLink<SimNode, SimLink> | null)?.distance(next.linkDist);
    (sim.force("charge") as ForceManyBody<SimNode> | null)?.strength(-next.charge);
    (sim.force("center") as ForceCenter<SimNode> | null)?.strength(next.center);
    sim.alpha(0.3).restart();
  };

  // Legend focus: tapping a group chip dims everything outside that group.
  // Multiple chips can be focused at once; empty set = no filter.
  const [legendFocus, setLegendFocus] = useState<ReadonlySet<string>>(() => new Set());
  const toggleLegendFocus = (groupId: string) =>
    setLegendFocus((cur) => {
      const next = new Set(cur);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  // Name search — dims non-matching nodes exactly like the legend focus.
  const [searchQuery, setSearchQuery] = useState("");

  const FOCUS_DIM = 0.15;
  const legendLit = (n: SimNode): boolean => {
    if (legendFocus.size === 0) return true;
    if (n.kind === "you") return true;
    if (n.kind === "person") return !!n.groupId && legendFocus.has(n.groupId);
    // Org hub stays lit while any member's group is focused.
    const org = graph.orgs.get(n.id);
    return !!org?.members.some((m) => m.group_id && legendFocus.has(m.group_id));
  };
  const searchLit = (n: SimNode): boolean => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    if (n.kind === "you") return true;
    if (n.kind === "person") {
      const person = people.find((p) => p.id === n.id);
      return (
        n.label.toLowerCase().includes(q) ||
        !!person?.company?.toLowerCase().includes(q) ||
        !!person?.school?.toLowerCase().includes(q)
      );
    }
    // Org hubs match by their own name, or by a matching member.
    const org = graph.orgs.get(n.id);
    if (!org) return false;
    return (
      org.label.toLowerCase().includes(q) ||
      org.members.some((m) => m.name.toLowerCase().includes(q))
    );
  };
  const isLit = (n: SimNode): boolean => legendLit(n) && searchLit(n);

  // viewBox space — pointer math maps screen px into this, then through the
  // zoom transform into simulation space.
  const viewW = 480;
  const viewH = 600;

  const graph = useMemo(() => {
    const nodes: SimNode[] = [
      { id: "you", kind: "you", label: "You", sub: null, color: null, groupId: null },
      ...people.map((p) => ({
        id: p.id,
        kind: "person" as const,
        label: p.name,
        sub: [p.role, p.company].filter(Boolean).join(" · ") || null,
        color: groupOf(p)?.color ?? null,
        groupId: p.group_id,
      })),
    ];
    const links: SimLink[] = connections.map((c) => ({
      source: c.from_person_id ?? "you",
      target: c.to_person_id,
      // No fallback to relationship_type — an unstated relationship stays blank.
      label: c.label,
    }));

    // Derive org hubs: bucket people by company and by school, keep buckets
    // with ≥2 members, hang the members off a synthesized hub node.
    const buckets = new Map<string, OrgHub>();
    for (const p of people) {
      const sources = [
        { kind: "company" as const, value: p.company },
        { kind: "school" as const, value: p.school },
      ];
      for (const { kind, value } of sources) {
        const label = value?.trim();
        if (!label) continue;
        const id = `org:${kind}:${label.toLowerCase()}`;
        const bucket = buckets.get(id) ?? { id, kind, label, members: [] };
        bucket.members.push(p);
        buckets.set(id, bucket);
      }
    }
    const orgs = new Map<string, OrgHub>();
    for (const [id, bucket] of buckets) {
      if (bucket.members.length < 2) continue;
      orgs.set(id, bucket);
      nodes.push({
        id,
        kind: "org",
        label: bucket.label,
        sub: bucket.kind === "school" ? "School" : "Company",
        color: null,
        groupId: null,
      });
      for (const member of bucket.members) {
        links.push({ source: member.id, target: id, label: null });
      }
    }

    return { nodes, links, orgs };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, connections, groups]);

  // Resolve pins into cards — a pin is either a person or a derived org hub.
  const pinnedEntries = useMemo(
    () =>
      pinnedIds
        .map((id) => {
          const person = people.find((p) => p.id === id);
          if (person) return { type: "person" as const, person };
          const org = graph.orgs.get(id);
          return org ? { type: "org" as const, org } : null;
        })
        .filter((e) => e !== null),
    [people, pinnedIds, graph]
  );

  // Node array re-set on every tick so React re-renders positions; the
  // simulation object lives in a ref for the drag handlers.
  const [simNodes, setSimNodes] = useState<SimNode[]>([]);
  const [simLinks, setSimLinks] = useState<SimLink[]>([]);
  const simRef = useRef<Simulation<SimNode, undefined> | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const downPosRef = useRef<{ x: number; y: number } | null>(null);

  const [zoomTransform, setZoomTransform] = useState<ZoomTransform>(zoomIdentity);
  const zoomTransformRef = useRef<ZoomTransform>(zoomIdentity);
  const zoomBehaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  // (Re)build the simulation whenever the graph data changes.
  useEffect(() => {
    const nodes: SimNode[] = graph.nodes.map((n) => ({ ...n }));
    const links: SimLink[] = graph.links.map((l) => ({ ...l }));
    const sim = forceSimulation<SimNode>(nodes)
      .force(
        "link",
        forceLink<SimNode, SimLink & { index?: number }>(
          links as (SimLink & { index?: number })[]
        )
          .id((d) => d.id)
          .distance(forceParamsRef.current.linkDist)
      )
      .force("charge", forceManyBody<SimNode>().strength(-forceParamsRef.current.charge))
      .force(
        "center",
        forceCenter<SimNode>(viewW / 2, viewH / 2).strength(forceParamsRef.current.center)
      )
      .on("tick", () => {
        setSimNodes([...nodes]);
        setSimLinks([...links]);
      });
    simRef.current = sim;
    return () => {
      sim.stop();
      simRef.current = null;
    };
  }, [graph]);

  // Bind d3-zoom to the SVG: wheel/pinch zooms anywhere, drag pans only when
  // the gesture starts on empty background — pointer-downs on a node circle
  // are filtered out so node-drag pinning keeps working.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const behavior = d3Zoom<SVGSVGElement, unknown>()
      .scaleExtent(ZOOM_EXTENT)
      .filter((event: MouseEvent | WheelEvent | TouchEvent) => {
        if ("button" in event && event.button) return false;
        if (event.type === "wheel") return true;
        return !(event.target as Element | null)?.closest("[data-graph-node]");
      })
      .on("zoom", (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        zoomTransformRef.current = event.transform;
        setZoomTransform(event.transform);
      });
    const sel = select(svg);
    sel.call(behavior);
    zoomBehaviorRef.current = behavior;
    return () => {
      sel.on(".zoom", null);
      zoomBehaviorRef.current = null;
    };
  }, []);

  const resetView = () => {
    const svg = svgRef.current;
    const behavior = zoomBehaviorRef.current;
    if (svg && behavior) select(svg).call(behavior.transform, zoomIdentity);
  };

  // Screen → viewBox mapping. preserveAspectRatio (xMidYMid meet) letterboxes
  // when the element's aspect differs from the viewBox's, so the mapping is a
  // uniform scale plus centering offsets.
  const svgPoint = (e: React.PointerEvent): { x: number; y: number } => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    const scale = Math.min(rect.width / viewW, rect.height / viewH);
    const ox = (rect.width - viewW * scale) / 2;
    const oy = (rect.height - viewH * scale) / 2;
    const vx = (e.clientX - rect.left - ox) / scale;
    const vy = (e.clientY - rect.top - oy) / scale;
    const [x, y] = zoomTransformRef.current.invert([vx, vy]);
    return { x, y };
  };

  // Transient drag: pin the node to the pointer (fx/fy) while down, release on
  // up. A stationary press-and-release on a person node is a tap → navigate.
  const onNodeDown = (id: string) => (e: React.PointerEvent) => {
    dragIdRef.current = id;
    downPosRef.current = { x: e.clientX, y: e.clientY };
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = svgPoint(e);
    const node = simRef.current?.nodes().find((n) => n.id === id);
    if (node) {
      node.fx = p.x;
      node.fy = p.y;
    }
    simRef.current?.alphaTarget(0.3).restart();
  };
  const onNodeMove = (e: React.PointerEvent) => {
    const id = dragIdRef.current;
    if (!id) return;
    const p = svgPoint(e);
    const node = simRef.current?.nodes().find((n) => n.id === id);
    if (node) {
      node.fx = p.x;
      node.fy = p.y;
    }
  };
  const onNodeUp = (e: React.PointerEvent) => {
    const id = dragIdRef.current;
    const down = downPosRef.current;
    dragIdRef.current = null;
    downPosRef.current = null;
    const node = simRef.current?.nodes().find((n) => n.id === id);
    if (node) {
      node.fx = null;
      node.fy = null;
    }
    simRef.current?.alphaTarget(0);
    if (
      node &&
      down &&
      Math.hypot(e.clientX - down.x, e.clientY - down.y) < CLICK_SLOP
    ) {
      if (node.kind === "person" || node.kind === "org") togglePin(node.id);
    }
  };

  // Tap on empty background dismisses the popup. d3-zoom owns background
  // gestures, so detect it ourselves: pointer-down off any node, pointer-up
  // within the tap threshold.
  const bgDownRef = useRef<{ x: number; y: number } | null>(null);
  const onSvgDown = (e: React.PointerEvent) => {
    if (!(e.target as Element).closest("[data-graph-node]")) {
      bgDownRef.current = { x: e.clientX, y: e.clientY };
    }
  };
  const onSvgUp = (e: React.PointerEvent) => {
    const down = bgDownRef.current;
    bgDownRef.current = null;
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < CLICK_SLOP) {
      setPinnedIds([]);
    }
  };

  return (
    <div className="relative h-full w-full overflow-hidden rounded-3xl bg-neutral-100 dark:bg-neutral-900">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${viewW} ${viewH}`}
        // touch-none: without it the browser claims touch gestures for page
        // scroll and node drag / pinch zoom never fire.
        className="h-full w-full touch-none select-none"
        onPointerDown={onSvgDown}
        onPointerMove={onNodeMove}
        onPointerUp={(e) => {
          onNodeUp(e);
          onSvgUp(e);
        }}
      >
        <g transform={zoomTransform.toString()}>
          {simLinks.map((l, i) => {
            const s = l.source as SimNode;
            const t = l.target as SimNode;
            if (typeof s === "string" || typeof t === "string") return null;
            const mx = ((s.x ?? 0) + (t.x ?? 0)) / 2;
            const my = ((s.y ?? 0) + (t.y ?? 0)) / 2;
            return (
              <g
                key={`${s.id}→${t.id}:${i}`}
                style={{
                  opacity: isLit(s) && isLit(t) ? undefined : FOCUS_DIM,
                  transition: "opacity 200ms ease",
                }}
              >
                <line
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  stroke="var(--g-edge)"
                  strokeWidth={1}
                  // Spokes to derived org hubs render dashed — they're a
                  // view, not a logged connection.
                  strokeDasharray={t.kind === "org" || s.kind === "org" ? "4 3" : undefined}
                />
                {/* Relationship labels stay hidden until an endpoint is
                    pinned — the default view shows just the wiring. */}
                {l.label && (pinnedIds.includes(s.id) || pinnedIds.includes(t.id)) && (
                  <text
                    x={mx}
                    y={my - 4}
                    textAnchor="middle"
                    fill="var(--g-edge-label)"
                    fontSize={9}
                    className="pointer-events-none"
                  >
                    {truncate(l.label, 24)}
                  </text>
                )}
              </g>
            );
          })}
          {simNodes.map((n) => (
            <g
              key={n.id}
              style={{ opacity: isLit(n) ? undefined : FOCUS_DIM, transition: "opacity 200ms ease" }}
            >
              {n.kind === "org" ? (
                // Org hubs are rounded squares so they read as "not a person".
                <rect
                  x={(n.x ?? 0) - NODE_RADIUS.org}
                  y={(n.y ?? 0) - NODE_RADIUS.org}
                  width={NODE_RADIUS.org * 2}
                  height={NODE_RADIUS.org * 2}
                  rx={8}
                  fill="var(--g-org-fill)"
                  stroke={pinnedIds.includes(n.id) ? "#737373" : "var(--g-org-fill)"}
                  strokeWidth={pinnedIds.includes(n.id) ? 3 : 1}
                  data-graph-node
                  className="cursor-pointer"
                  onPointerDown={onNodeDown(n.id)}
                />
              ) : (
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={NODE_RADIUS[n.kind]}
                  fill={n.kind === "you" ? "var(--g-you-fill)" : (n.color ?? "var(--g-person-fill)")}
                  stroke={n.kind === "you" ? "var(--g-you-fill)" : pinnedIds.includes(n.id) ? "var(--g-selected)" : "var(--g-person-stroke)"}
                  strokeWidth={pinnedIds.includes(n.id) ? 2 : 1}
                  data-graph-node
                  className={n.kind === "person" ? "cursor-pointer" : "cursor-grab"}
                  onPointerDown={onNodeDown(n.id)}
                />
              )}
              <text
                x={n.x}
                y={n.kind === "you" ? (n.y ?? 0) + 4 : (n.y ?? 0) + NODE_RADIUS[n.kind] + 14}
                textAnchor="middle"
                fill={n.kind === "you" ? "var(--g-you-text)" : "var(--g-label)"}
                fontSize={12}
                fontWeight={600}
                className="pointer-events-none"
              >
                {n.kind === "you" ? "You" : truncate(n.label, 18)}
              </text>
              {n.kind !== "you" && n.sub && (
                <text
                  x={n.x}
                  y={(n.y ?? 0) + NODE_RADIUS[n.kind] + 26}
                  textAnchor="middle"
                  fill="var(--g-sub)"
                  fontSize={9}
                  className="pointer-events-none"
                >
                  {truncate(n.sub, 28)}
                </text>
              )}
              {n.kind === "person" && (
                <text
                  x={n.x}
                  y={(n.y ?? 0) + 4}
                  textAnchor="middle"
                  fill={n.color ? "#171717" : "var(--g-initials)"}
                  fontSize={11}
                  fontWeight={600}
                  className="pointer-events-none"
                >
                  {n.label
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((w) => w[0]?.toUpperCase() ?? "")
                    .join("")}
                </text>
              )}
              {n.kind === "org" && (
                <text
                  x={n.x}
                  y={(n.y ?? 0) + 4}
                  textAnchor="middle"
                  fill="var(--g-org-text)"
                  fontSize={12}
                  fontWeight={700}
                  className="pointer-events-none"
                >
                  {n.label[0]?.toUpperCase() ?? "?"}
                </text>
              )}
            </g>
          ))}
        </g>
      </svg>
      <div className="absolute right-3 top-3 flex flex-col items-end gap-1.5">
        <button
          type="button"
          onClick={resetView}
          className="rounded-full bg-white/80 dark:bg-neutral-800/80 px-3 py-1.5 text-xs text-neutral-600 dark:text-neutral-300 backdrop-blur"
        >
          Reset view
        </button>
        <button
          type="button"
          onClick={() => setShowForces((v) => !v)}
          className={
            "rounded-full bg-white/80 dark:bg-neutral-800/80 px-3 py-1.5 text-xs text-neutral-600 dark:text-neutral-300 backdrop-blur" +
            (showForces ? " ring-1 ring-neutral-500" : "")
          }
        >
          Forces
        </button>
        {showForces && (
          <div className="w-52 rounded-xl bg-white/90 dark:bg-neutral-800/90 p-3 backdrop-blur">
            {(
              [
                ["Link distance", "linkDist", 40, 220, 1],
                ["Repulsion", "charge", 50, 500, 5],
                ["Center pull", "center", 0, 1, 0.05],
              ] as const
            ).map(([label, key, min, max, step]) => (
              <label
                key={key}
                className="mb-2 flex flex-col gap-0.5 text-[11px] text-neutral-600 dark:text-neutral-300 last:mb-0"
              >
                {label}
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={forceParams[key]}
                  onChange={(e) =>
                    applyForceParams({ ...forceParams, [key]: Number(e.target.value) })
                  }
                />
              </label>
            ))}
          </div>
        )}
      </div>
      {groups.length > 0 && (
        <div className="absolute left-3 top-3 flex max-w-[60%] flex-wrap gap-1.5">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search…"
            className="w-32 rounded-full border-0 bg-white/80 dark:bg-neutral-800/80 px-3 py-1 text-[11px] text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 backdrop-blur focus:outline-none focus:ring-1 focus:ring-neutral-500"
          />
          {groups.map((g) => {
            const active = legendFocus.has(g.id);
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => toggleLegendFocus(g.id)}
                className={
                  "flex items-center gap-1.5 rounded-full bg-white/80 dark:bg-neutral-800/80 px-2.5 py-1 text-[11px] text-neutral-600 dark:text-neutral-300 backdrop-blur" +
                  (active ? " ring-1 ring-neutral-500" : "")
                }
              >
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: g.color }}
                />
                {g.name}
              </button>
            );
          })}
        </div>
      )}
      {pinnedEntries.length > 0 && (
        // Swipeable card stack: one card per pinned node, horizontal snap
        // scroll. Cards are slightly narrower than the track so the next
        // pinned card peeks in from the edge.
        <div
          className={
            "absolute inset-x-0 bottom-0 flex snap-x snap-mandatory gap-2 overflow-x-auto px-3 scroll-px-3 [scrollbar-width:none] " +
            // A lone card centers; a stack keeps start-alignment so the
            // horizontal scroll works.
            (pinnedEntries.length === 1 ? "justify-center" : "")
          }
        >
          {pinnedEntries.map((entry) =>
            entry.type === "org" ? (
              <div
                key={entry.org.id}
                className="w-full shrink-0 snap-center rounded-t-2xl bg-white dark:bg-neutral-800 p-4 shadow-lg"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-bold text-neutral-900 dark:text-neutral-50">{entry.org.label}</p>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                      {entry.org.kind === "school" ? "School" : "Company"} ·{" "}
                      {entry.org.members.length} people
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => togglePin(entry.org.id)}
                    aria-label={`Unpin ${entry.org.label}`}
                    className="shrink-0 rounded-full bg-neutral-100 dark:bg-neutral-700 px-2.5 py-1 text-xs text-neutral-500 dark:text-neutral-400"
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-2 flex flex-col gap-1">
                  {entry.org.members.map((m) => (
                    <Link
                      key={m.id}
                      href={`/people/${m.id}`}
                      className="flex items-baseline gap-2 rounded-lg px-1 py-0.5 text-sm text-neutral-900 dark:text-neutral-50 hover:bg-neutral-100"
                    >
                      <span className="font-medium">{m.name}</span>
                      {m.role && <span className="truncate text-xs text-neutral-500 dark:text-neutral-400">{m.role}</span>}
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              (() => {
                const p = entry.person;
                return (
            <div
              key={p.id}
              className="w-full shrink-0 snap-center rounded-t-2xl bg-white dark:bg-neutral-800 p-4 shadow-lg"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-base font-bold text-neutral-900 dark:text-neutral-50">
                    {p.name}
                    {groupOf(p) && (
                      <span
                        aria-label={groupOf(p)!.name}
                        title={groupOf(p)!.name}
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: groupOf(p)!.color }}
                      />
                    )}
                  </p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    {[p.role, p.company].filter(Boolean).join(" · ") || "No role noted"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => togglePin(p.id)}
                  aria-label={`Unpin ${p.name}`}
                  className="shrink-0 rounded-full bg-neutral-100 dark:bg-neutral-700 px-2.5 py-1 text-xs text-neutral-500 dark:text-neutral-400"
                >
                  ✕
                </button>
              </div>
              {p.met_at && <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">Met at {p.met_at}</p>}
              <ContactChips person={p} className="mt-1.5" />
              {p.notes && <p className="mt-2 line-clamp-3 text-sm text-neutral-700 dark:text-neutral-200">{p.notes}</p>}
              <Link
                href={`/people/${p.id}`}
                className="mt-3 inline-block text-xs font-medium text-neutral-900 dark:text-neutral-50 underline underline-offset-2"
              >
                Full details →
              </Link>
            </div>
                );
              })()
            )
          )}
        </div>
      )}
    </div>
  );
}
