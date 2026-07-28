"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { ReactFlow, Background, Controls, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Person, Connection } from "@/types/database";

export function ConnectionGraph({
  people,
  connections,
}: {
  people: Person[];
  connections: Connection[];
}) {
  const router = useRouter();

  const { nodes, edges } = useMemo(() => {
    const radius = Math.max(220, people.length * 40);
    const nodes: Node[] = [
      {
        id: "you",
        position: { x: 0, y: 0 },
        data: { label: "You" },
        style: {
          background: "#fafafa",
          color: "#171717",
          borderRadius: 9999,
          fontWeight: 600,
          width: 72,
          height: 72,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        },
      },
      ...people.map((person, i) => {
        const angle = (2 * Math.PI * i) / Math.max(people.length, 1);
        return {
          id: person.id,
          position: { x: radius * Math.cos(angle), y: radius * Math.sin(angle) },
          data: { label: person.name },
          style: {
            background: "#262626",
            color: "#fafafa",
            border: "1px solid #404040",
            borderRadius: 12,
            padding: 8,
            fontSize: 13,
          },
        };
      }),
    ];

    const edges: Edge[] = connections.map((c) => ({
      id: c.id,
      source: c.from_person_id ?? "you",
      target: c.to_person_id,
      label: c.label ?? c.relationship_type.replace(/_/g, " "),
      style: { stroke: "#525252" },
      labelStyle: { fill: "#a3a3a3", fontSize: 11 },
    }));

    return { nodes, edges };
  }, [people, connections]);

  return (
    <div className="h-[70vh] w-full rounded-xl border border-neutral-800 bg-neutral-950">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        onNodeClick={(_, node) => {
          if (node.id !== "you") router.push(`/people/${node.id}`);
        }}
      >
        <Background color="#262626" gap={24} />
        <Controls />
      </ReactFlow>
    </div>
  );
}
