import React from "react";
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig, spring, interpolate, staticFile } from "remotion";
import { COLORS } from "../constants";
import { INTER, MONO } from "../fonts";
import { Captions } from "../components/Caption";
import { LogoBadge } from "../components/LogoBadge";

const HOOK_CAPTIONS = [
  { text: "AI agents are about to manage real money. When they need credit, go broke, or make bad decisions, what happens?", start: 30, end: 180 },
  { text: "Borrow, earn, go bankrupt, get liquidated. Every decision pinned to Filecoin.", start: 210, end: 410 },
];

export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Title entrance
  const titleProg = spring({ frame: frame - 10, fps, config: { damping: 18, stiffness: 140 } });
  const titleOp = interpolate(titleProg, [0, 0.35], [0, 1]);
  const titleScale = interpolate(titleProg, [0, 1], [0.93, 1]);

  // Subtitle entrance
  const subProg = spring({ frame: frame - 50, fps, config: { damping: 18, stiffness: 140 } });
  const subOp = interpolate(subProg, [0, 0.35], [0, 1]);

  // Stats line entrance
  const statsProg = spring({ frame: frame - 80, fps, config: { damping: 18, stiffness: 140 } });
  const statsOp = interpolate(statsProg, [0, 0.35], [0, 1]);

  // Tagline entrance
  const tagProg = spring({ frame: frame - 120, fps, config: { damping: 18, stiffness: 140 } });
  const tagOp = interpolate(tagProg, [0, 0.35], [0, 1]);

  // Separator line
  const lineWidth = interpolate(frame, [50, 90], [0, 500], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 50% 40%, #0a0f1a 0%, ${COLORS.bg} 65%)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 80,
      }}
    >
      {/* Logo + EJENTS */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, opacity: titleOp, marginBottom: 12 }}>
        <Img src={staticFile("logo.jpg")} style={{ width: 64, height: 64, borderRadius: 12 }} />
        <div
          style={{
            fontFamily: MONO,
            fontSize: 28,
            fontWeight: 700,
            color: COLORS.accent,
            letterSpacing: 8,
          }}
        >
          EJENTS
        </div>
      </div>

      {/* Subtitle: positioning line */}
      <div
        style={{
          fontFamily: INTER,
          fontSize: 18,
          fontWeight: 500,
          color: COLORS.muted,
          opacity: titleOp,
          marginBottom: 40,
          letterSpacing: 1,
        }}
      >
        Agent-to-Agent Credit Markets on Filecoin
      </div>

      {/* Main headline */}
      <div
        style={{
          fontFamily: INTER,
          fontSize: 48,
          fontWeight: 800,
          color: COLORS.white,
          textAlign: "center",
          lineHeight: 1.2,
          opacity: titleOp,
          transform: `scale(${titleScale})`,
          maxWidth: 1100,
        }}
      >
        The infrastructure for AI agents to borrow, earn, go bankrupt, and get liquidated on-chain.
      </div>

      {/* Separator */}
      <div
        style={{
          width: lineWidth,
          height: 2,
          background: `linear-gradient(90deg, transparent, ${COLORS.accent}, transparent)`,
          marginTop: 32,
          marginBottom: 32,
        }}
      />

      {/* Stats */}
      <div
        style={{
          display: "flex",
          gap: 60,
          marginTop: 16,
          opacity: statsOp,
        }}
      >
        {[
          { label: "AGENTS", value: "7" },
          { label: "WALLETS", value: "7" },
          { label: "LLM UNDERWRITER", value: "1" },
          { label: "CONTRACTS", value: "4" },
        ].map((s, i) => (
          <div key={i} style={{ textAlign: "center" }}>
            <div style={{ fontFamily: MONO, fontSize: 36, fontWeight: 700, color: COLORS.accent }}>
              {s.value}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: COLORS.muted, letterSpacing: 2, marginTop: 4 }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Tagline */}
      <div
        style={{
          fontFamily: INTER,
          fontSize: 15,
          fontWeight: 500,
          color: COLORS.muted,
          marginTop: 40,
          opacity: tagOp,
          letterSpacing: 1,
        }}
      >
        Filecoin Calibration Testnet
      </div>

      <LogoBadge opacity={titleOp} />
      <Captions captions={HOOK_CAPTIONS} />
    </AbsoluteFill>
  );
};
