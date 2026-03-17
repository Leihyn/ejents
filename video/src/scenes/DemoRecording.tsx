import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  OffthreadVideo,
  staticFile,
} from "remotion";
import { COLORS } from "../constants";
import { INTER, MONO } from "../fonts";
import { Captions } from "../components/Caption";
import { LogoBadge } from "../components/LogoBadge";

const DEMO_CAPTIONS = [
  { text: "Seven agents funded with real FIL. Storage fees drain their balances every round.", start: 30, end: 300 },
  { text: "Spenders go distressed. The arbitrageur pays to query their state.", start: 370, end: 670 },
  { text: "Llama 3.3 evaluates the risk and issues a rescue loan on-chain.", start: 740, end: 970 },
  { text: "The loan buys time, but fees keep coming. Eventually, bankruptcy.", start: 1040, end: 1340 },
  { text: "Liquidation auction. Arbitrageurs bid on the remains.", start: 1410, end: 1710 },
  { text: "Every step, every decision, stored as a Filecoin CID.", start: 1780, end: 2100 },
];

interface CalloutProps {
  text: string;
  subtext?: string;
  opacity: number;
  scale: number;
  color?: string;
  style?: React.CSSProperties;
}

const FloatingCallout: React.FC<CalloutProps> = ({ text, subtext, opacity, scale, color, style }) => (
  <div
    style={{
      position: "absolute",
      opacity,
      transform: `scale(${scale})`,
      background: "rgba(0,0,0,0.88)",
      border: `2px solid ${color ?? COLORS.accent}`,
      borderRadius: 12,
      padding: "12px 20px",
      maxWidth: 420,
      backdropFilter: "blur(8px)",
      zIndex: 10,
      ...style,
    }}
  >
    <div style={{ fontFamily: INTER, fontSize: 18, fontWeight: 700, color: color ?? COLORS.accent }}>
      {text}
    </div>
    {subtext && (
      <div style={{ fontFamily: INTER, fontSize: 13, color: COLORS.offWhite, marginTop: 4 }}>
        {subtext}
      </div>
    )}
  </div>
);

function useCallout(frame: number, fps: number, enterFrame: number, exitFrame: number) {
  const prog = spring({ frame: frame - enterFrame, fps, config: { damping: 18, stiffness: 150 } });
  const fadeOut = interpolate(frame, [exitFrame - 20, exitFrame], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return {
    opacity: interpolate(prog, [0, 0.3], [0, 1]) * fadeOut,
    scale: interpolate(prog, [0, 1], [0.92, 1]),
  };
}

export const DemoRecording: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Video fades in
  const videoOp = interpolate(frame, [0, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const videoScale = interpolate(frame, [0, 60], [1.02, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Callouts at key moments (timed to recording content)
  // Adjust these frame numbers after reviewing the recording in Studio
  const callout1 = useCallout(frame, fps, 30, 330);    // Constellation graph
  const callout2 = useCallout(frame, fps, 370, 700);    // Agent inspector
  const callout3 = useCallout(frame, fps, 740, 1000);   // Leaderboard
  const callout4 = useCallout(frame, fps, 1040, 1370);  // Post-mortem story
  const callout5 = useCallout(frame, fps, 1410, 1740);  // Filecoin data tab
  const callout6 = useCallout(frame, fps, 1780, 2150);  // CID links

  // Top gradient for title area
  const topGradOp = interpolate(frame, [0, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // "LIVE DASHBOARD" label
  const labelProg = spring({ frame: frame - 10, fps, config: { damping: 20, stiffness: 160 } });
  const labelOp = interpolate(labelProg, [0, 0.35], [0, 1]);

  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      {/* Screen recording */}
      <div
        style={{
          width: "100%",
          height: "100%",
          opacity: videoOp,
          transform: `scale(${videoScale})`,
          transformOrigin: "center center",
        }}
      >
        <OffthreadVideo
          src={staticFile("recording.mp4")}
          style={{ width: "100%", height: "100%" }}
        />
      </div>

      {/* Top gradient overlay */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 120,
          background: `linear-gradient(to bottom, rgba(9,9,11,0.85) 0%, transparent 100%)`,
          opacity: topGradOp,
        }}
      />

      {/* Bottom gradient overlay */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 80,
          background: `linear-gradient(to top, rgba(9,9,11,0.7) 0%, transparent 100%)`,
          opacity: topGradOp,
        }}
      />

      {/* Logo badge */}
      <LogoBadge opacity={labelOp} />

      {/* LIVE DASHBOARD label */}
      <div
        style={{
          position: "absolute",
          top: 32,
          left: 180,
          display: "flex",
          alignItems: "center",
          gap: 8,
          opacity: labelOp,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: COLORS.green,
            boxShadow: `0 0 8px ${COLORS.green}`,
          }}
        />
        <span style={{ fontFamily: MONO, fontSize: 12, color: COLORS.green, letterSpacing: 3, fontWeight: 600 }}>
          LIVE DASHBOARD
        </span>
      </div>

      {/* Calibnet badge */}
      <div
        style={{
          position: "absolute",
          top: 24,
          right: 40,
          opacity: labelOp,
          fontFamily: MONO,
          fontSize: 11,
          color: COLORS.muted,
          background: COLORS.bgCard,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 6,
          padding: "4px 12px",
          letterSpacing: 2,
        }}
      >
        CALIBRATION TESTNET
      </div>

      {/* Callouts — narrate the economic story, not UI elements */}
      <FloatingCallout
        text="7 Agents, 7 Wallets"
        subtext="Each agent signs its own transactions with an independent private key"
        {...callout1}
        style={{ bottom: 120, left: 60 }}
      />
      <FloatingCallout
        text="Storage Fees Drain Balances"
        subtext="0.01 FIL per interval. Agents that don't earn go distressed, then bankrupt."
        {...callout2}
        color={COLORS.amber}
        style={{ top: 120, right: 60 }}
      />
      <FloatingCallout
        text="LLM Underwrites the Loan"
        subtext="Llama 3.3 70B evaluates risk, issues rescue loans at 5% fee rate"
        {...callout3}
        color={COLORS.green}
        style={{ bottom: 120, left: 60 }}
      />
      <FloatingCallout
        text="Bankruptcy Triggers Liquidation"
        subtext="On-chain auction for bankrupt agents' assets"
        {...callout4}
        color={COLORS.red}
        style={{ bottom: 120, right: 60 }}
      />
      <FloatingCallout
        text="Pinned via Filecoin Pin"
        subtext="Every state snapshot, task result, and LLM decision stored as a CID"
        {...callout5}
        color={COLORS.accent}
        style={{ top: 120, left: 60 }}
      />
      <FloatingCallout
        text="Verifiable on IPFS"
        subtext="Click any bafkrei... CID to read the raw JSON. Not mock data."
        {...callout6}
        color={COLORS.green}
        style={{ top: 120, right: 60 }}
      />

      <Captions captions={DEMO_CAPTIONS} />
    </AbsoluteFill>
  );
};
