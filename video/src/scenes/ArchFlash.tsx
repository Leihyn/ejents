import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS } from "../constants";
import { INTER, MONO } from "../fonts";
import { Captions } from "../components/Caption";
import { LogoBadge } from "../components/LogoBadge";

const ARCH_CAPTIONS = [
  { text: "Workers earn FIL by completing tasks. Spenders burn it.", start: 20, end: 120 },
  { text: "LLM arbitrageurs underwrite loans. They pay for intelligence, evaluate risk, and decide who lives.", start: 130, end: 270 },
];

export const ArchFlash: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Title
  const titleProg = spring({ frame: frame - 5, fps, config: { damping: 18, stiffness: 155 } });
  const titleOp = interpolate(titleProg, [0, 0.35], [0, 1]);

  // Left column (agents)
  const agents = [
    { name: "Workers (3)", desc: "Claim tasks, compute metrics, pin results", color: COLORS.accent },
    { name: "Spenders (2)", desc: "Burn capital fast, go distressed", color: COLORS.amber },
    { name: "Arbitrageurs (2)", desc: "LLM-powered lend/liquidate decisions", color: COLORS.purple },
    { name: "Keeper", desc: "Fees, task posting, liquidation", color: COLORS.muted },
  ];

  // Right column (infra)
  const infra = [
    { name: "AgentRegistry", desc: "Balances, wallets, intel market" },
    { name: "TaskMarket", desc: "CID-based tasks, rewards" },
    { name: "LendingPool", desc: "Micro-loans, 5% fee" },
    { name: "LiquidationQueue", desc: "Bankruptcy auctions" },
  ];

  // Arrow
  const arrowOp = interpolate(frame, [110, 130], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Bottom: Filecoin layer
  const filProg = spring({ frame: frame - 150, fps, config: { damping: 18, stiffness: 140 } });
  const filOp = interpolate(filProg, [0, 0.35], [0, 1]);

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 50% 50%, #0a0f1a 0%, ${COLORS.bg} 65%)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 80,
      }}
    >
      {/* Title */}
      <div
        style={{
          fontFamily: MONO,
          fontSize: 14,
          color: COLORS.accent,
          letterSpacing: 4,
          opacity: titleOp,
          marginBottom: 40,
        }}
      >
        ARCHITECTURE
      </div>

      {/* Two-column layout */}
      <div style={{ display: "flex", alignItems: "center", gap: 60 }}>
        {/* Left: Agents */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {agents.map((a, i) => {
            const prog = spring({ frame: frame - (25 + i * 20), fps, config: { damping: 16, stiffness: 140 } });
            const op = interpolate(prog, [0, 0.35], [0, 1]);
            const scale = interpolate(prog, [0, 1], [0.93, 1]);
            return (
              <div
                key={i}
                style={{
                  opacity: op,
                  transform: `scale(${scale})`,
                  background: COLORS.bgCard,
                  border: `1px solid ${COLORS.border}`,
                  borderLeft: `3px solid ${a.color}`,
                  borderRadius: 8,
                  padding: "12px 20px",
                  width: 340,
                }}
              >
                <div style={{ fontFamily: INTER, fontSize: 16, fontWeight: 700, color: COLORS.white }}>
                  {a.name}
                </div>
                <div style={{ fontFamily: INTER, fontSize: 12, color: COLORS.muted, marginTop: 2 }}>
                  {a.desc}
                </div>
              </div>
            );
          })}
        </div>

        {/* Arrow */}
        <div style={{ fontSize: 48, color: COLORS.accent, opacity: arrowOp, fontFamily: MONO }}>
          {"\u2192"}
        </div>

        {/* Right: Contracts */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {infra.map((c, i) => {
            const prog = spring({ frame: frame - (60 + i * 20), fps, config: { damping: 16, stiffness: 140 } });
            const op = interpolate(prog, [0, 0.35], [0, 1]);
            const scale = interpolate(prog, [0, 1], [0.93, 1]);
            return (
              <div
                key={i}
                style={{
                  opacity: op,
                  transform: `scale(${scale})`,
                  background: COLORS.bgCard,
                  border: `1px solid ${COLORS.border}`,
                  borderLeft: `3px solid ${COLORS.green}`,
                  borderRadius: 8,
                  padding: "12px 20px",
                  width: 340,
                }}
              >
                <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: COLORS.green }}>
                  {c.name}
                </div>
                <div style={{ fontFamily: INTER, fontSize: 12, color: COLORS.muted, marginTop: 2 }}>
                  {c.desc}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom: Filecoin layer */}
      <div
        style={{
          marginTop: 48,
          opacity: filOp,
          display: "flex",
          alignItems: "center",
          gap: 16,
          background: COLORS.bgCard,
          border: `1px solid ${COLORS.accent}`,
          borderRadius: 10,
          padding: "14px 32px",
        }}
      >
        <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: COLORS.accent }}>
          FILECOIN PIN
        </div>
        <div style={{ color: COLORS.border, fontSize: 20 }}>|</div>
        <div style={{ fontFamily: INTER, fontSize: 13, color: COLORS.offWhite }}>
          PIN snapshot {"\u2192"} CID on-chain {"\u2192"} GET from IPFS {"\u2192"} compute {"\u2192"} PIN result {"\u2192"} CID
        </div>
      </div>

      <LogoBadge />
      <Captions captions={ARCH_CAPTIONS} />
    </AbsoluteFill>
  );
};
