import React from "react";
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig, spring, interpolate, staticFile } from "remotion";
import { COLORS } from "../constants";
import { INTER, MONO } from "../fonts";
import { Captions } from "../components/Caption";
import { LogoBadge } from "../components/LogoBadge";

const CLOSE_CAPTIONS = [
  { text: "Every decision, every CID, every loan. Verifiable on Filecoin.", start: 20, end: 250 },
  { text: "Agent-to-Agent Credit Markets on Filecoin.", start: 320, end: 520 },
];

export const Close: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Phase 1: Summary stats (0-300 frames)
  const phase1Op = interpolate(frame, [0, 15, 260, 300], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Phase 2: CTA (300-540 frames)
  const phase2Op = interpolate(frame, [300, 340], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const logoProg = spring({ frame: frame - 310, fps, config: { damping: 18, stiffness: 140 } });
  const logoOp = interpolate(logoProg, [0, 0.35], [0, 1]);
  const logoScale = interpolate(logoProg, [0, 1], [0.93, 1]);

  // Corner brackets
  const cornerOp = interpolate(frame, [320, 360], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const stats = [
    { label: "On-chain Tasks", value: "35+", color: COLORS.green },
    { label: "IPFS CIDs", value: "20+", color: COLORS.accent },
    { label: "LLM Decisions", value: "Real", color: COLORS.purple },
    { label: "Loans Issued", value: "Live", color: COLORS.amber },
  ];

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 50% 40%, #0a0f1a 0%, ${COLORS.bg} 65%)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Phase 1: Summary */}
      <div style={{ opacity: phase1Op, position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: INTER, fontSize: 36, fontWeight: 800, color: COLORS.white, textAlign: "center", marginBottom: 48 }}>
          Every decision, every CID, every loan.
          <br />
          <span style={{ color: COLORS.green }}>Verifiable on Filecoin.</span>
        </div>

        <div style={{ display: "flex", gap: 40 }}>
          {stats.map((s, i) => {
            const prog = spring({ frame: frame - (30 + i * 15), fps, config: { damping: 16, stiffness: 140 } });
            const op = interpolate(prog, [0, 0.35], [0, 1]);
            return (
              <div key={i} style={{ textAlign: "center", opacity: op }}>
                <div style={{ fontFamily: MONO, fontSize: 32, fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: COLORS.muted, letterSpacing: 2, marginTop: 4 }}>{s.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Phase 2: CTA */}
      <div style={{ opacity: phase2Op, position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        {/* Corner brackets */}
        <div style={{ position: "absolute", top: 60, left: 60, width: 50, height: 50, borderTop: `3px solid ${COLORS.accent}`, borderLeft: `3px solid ${COLORS.accent}`, opacity: cornerOp }} />
        <div style={{ position: "absolute", top: 60, right: 60, width: 50, height: 50, borderTop: `3px solid ${COLORS.accent}`, borderRight: `3px solid ${COLORS.accent}`, opacity: cornerOp }} />
        <div style={{ position: "absolute", bottom: 60, left: 60, width: 50, height: 50, borderBottom: `3px solid ${COLORS.accent}`, borderLeft: `3px solid ${COLORS.accent}`, opacity: cornerOp }} />
        <div style={{ position: "absolute", bottom: 60, right: 60, width: 50, height: 50, borderBottom: `3px solid ${COLORS.accent}`, borderRight: `3px solid ${COLORS.accent}`, opacity: cornerOp }} />

        <div style={{ display: "flex", alignItems: "center", gap: 20, opacity: logoOp, transform: `scale(${logoScale})`, marginBottom: 24 }}>
          <Img src={staticFile("logo.jpg")} style={{ width: 80, height: 80, borderRadius: 16 }} />
          <div
            style={{
              fontFamily: MONO,
              fontSize: 48,
              fontWeight: 700,
              color: COLORS.accent,
              letterSpacing: 6,
            }}
          >
            EJENTS
          </div>
        </div>

        <div style={{ fontFamily: INTER, fontSize: 22, fontWeight: 600, color: COLORS.white, marginBottom: 12, opacity: logoOp }}>
          Agent-to-Agent Credit Markets on Filecoin
        </div>

        <div
          style={{
            width: 300,
            height: 2,
            background: `linear-gradient(90deg, transparent, ${COLORS.accent}, transparent)`,
            margin: "16px 0",
            opacity: logoOp,
          }}
        />

        <div style={{ fontFamily: MONO, fontSize: 14, color: COLORS.muted, opacity: logoOp, letterSpacing: 1 }}>
          Calibration Testnet  |  7 Agents  |  7 Wallets  |  LLM Powered
        </div>
      </div>

      <LogoBadge />
      <Captions captions={CLOSE_CAPTIONS} />
    </AbsoluteFill>
  );
};
