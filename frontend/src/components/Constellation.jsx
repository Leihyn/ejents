import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { AGENT_NAMES } from "../lib/contracts";

const TYPE_COLORS = {
  0: "#3b82f6", // WORKER - blue
  1: "#d97706", // SPENDER - amber
  2: "#8b5cf6", // ARBITRAGEUR - violet
};

const STATUS_COLORS = {
  0: null,
  1: "#d97706",
  2: "#dc2626",
  3: "#55555e",
};

const TYPE_LABELS = ["Worker", "Spender", "Arbitrageur"];

export default function Constellation({ agents, loans, onSelect, selectedId }) {
  const svgRef = useRef(null);
  const simRef = useRef(null);

  useEffect(() => {
    if (!agents.length || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    svg.selectAll("*").remove();

    const nodes = agents.map((a) => ({
      ...a,
      radius: Math.max(14, Math.sqrt(parseFloat(a.balance) * 1000) + 10),
      color: STATUS_COLORS[a.status] || TYPE_COLORS[a.agentType],
      opacity: a.status === 2 ? 0.2 : a.status === 3 ? 0.15 : 1,
    }));

    const activeLoans = loans.filter((l) => !l.repaid && !l.defaulted);
    const links = activeLoans.map((l) => ({
      source: l.lenderId,
      target: l.borrowerId,
    }));

    const simulation = d3.forceSimulation(nodes)
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius((d) => d.radius + 12))
      .force("link", d3.forceLink(links).id((d) => d.id).distance(130).strength(0.3))
      .force("x", d3.forceX(width / 2).strength(0.05))
      .force("y", d3.forceY(height / 2).strength(0.05));

    simRef.current = simulation;

    // Links
    const link = svg.append("g")
      .selectAll("line")
      .data(links)
      .enter()
      .append("line")
      .attr("stroke", "#55555e")
      .attr("stroke-width", 1)
      .attr("stroke-opacity", 0.3)
      .attr("stroke-dasharray", "4 4");

    // Node groups
    const nodeGroup = svg.append("g")
      .selectAll("g")
      .data(nodes)
      .enter()
      .append("g")
      .attr("cursor", "pointer")
      .attr("role", "button")
      .attr("tabindex", "0")
      .attr("aria-label", (d) => `${AGENT_NAMES[d.id] || `Agent ${d.id}`}`)
      .on("click", (_, d) => onSelect(d.id))
      .on("keydown", (event, d) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(d.id);
        }
      });

    // Soft background circle
    nodeGroup.append("circle")
      .attr("r", (d) => d.radius)
      .attr("fill", (d) => d.color)
      .attr("fill-opacity", (d) => d.opacity * 0.1)
      .attr("stroke", (d) => d.color)
      .attr("stroke-width", (d) => d.id === selectedId ? 2 : 1)
      .attr("stroke-opacity", (d) => d.id === selectedId ? d.opacity * 0.8 : d.opacity * 0.3);

    // Core dot
    nodeGroup.filter((d) => d.status === 0)
      .append("circle")
      .attr("r", (d) => Math.max(3, d.radius * 0.2))
      .attr("fill", (d) => d.color)
      .attr("fill-opacity", 0.7);

    // Distress dash ring
    nodeGroup.filter((d) => d.status === 1)
      .append("circle")
      .attr("r", (d) => d.radius + 4)
      .attr("fill", "none")
      .attr("stroke", "#d97706")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3 3")
      .attr("opacity", 0.5);

    // Bankrupt X
    nodeGroup.filter((d) => d.status === 2)
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("fill", "#dc2626")
      .attr("font-size", (d) => d.radius * 0.7)
      .attr("font-weight", "500")
      .attr("font-family", "'DM Sans', sans-serif")
      .text("\u00D7");

    // Name
    nodeGroup.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", (d) => d.radius + 14)
      .attr("fill", "#8b8b9e")
      .attr("font-size", "10px")
      .attr("font-weight", "500")
      .attr("font-family", "'DM Sans', sans-serif")
      .text((d) => AGENT_NAMES[d.id] || `#${d.id}`);

    // Balance
    nodeGroup.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", (d) => d.radius + 26)
      .attr("fill", "#55555e")
      .attr("font-size", "9px")
      .attr("font-family", "'DM Mono', monospace")
      .text((d) => `${parseFloat(d.balance).toFixed(2)} FIL`);

    simulation.on("tick", () => {
      nodes.forEach((d) => {
        d.x = Math.max(d.radius + 20, Math.min(width - d.radius - 20, d.x));
        d.y = Math.max(d.radius + 20, Math.min(height - d.radius - 36, d.y));
      });

      link
        .attr("x1", (d) => d.source.x)
        .attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x)
        .attr("y2", (d) => d.target.y);

      nodeGroup.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    return () => simulation.stop();
  }, [agents, loans, selectedId, onSelect]);

  return (
    <div className="card overflow-hidden relative">
      <div className="flex items-center justify-between px-4 pt-3 pb-0">
        <h2 className="card-header">Constellation</h2>
        <div className="flex gap-4 text-[10px] font-medium text-text-muted">
          {Object.entries(TYPE_COLORS).map(([type, color]) => (
            <span key={type} className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
              {TYPE_LABELS[type]}
            </span>
          ))}
        </div>
      </div>
      <svg ref={svgRef} className="w-full" style={{ height: "380px" }} />
    </div>
  );
}
