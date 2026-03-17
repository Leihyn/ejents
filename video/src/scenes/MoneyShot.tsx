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

const MONEY_CAPTIONS = [
  { text: "Click any CID. Read the actual LLM reasoning. This is not a mock.", start: 60, end: 200 },
  { text: "Risk scores, survival estimates, anomaly detection. All pinned to Filecoin.", start: 220, end: 380 },
  { text: "When regulators ask why an AI moved money, the answer is a Filecoin CID.", start: 390, end: 440 },
];

export const MoneyShot: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Title phase (0-90 frames)
  const titleProg = spring({ frame: frame - 5, fps, config: { damping: 18, stiffness: 155 } });
  const titleOp = interpolate(titleProg, [0, 0.35], [0, 1]);
  const titleFade = interpolate(frame, [60, 90], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Video crossfade (starts as title fades)
  const videoOp = interpolate(frame, [50, 80], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // "REAL JSON" callout
  const jsonProg = spring({ frame: frame - 100, fps, config: { damping: 16, stiffness: 140 } });
  const jsonOp = interpolate(jsonProg, [0, 0.3], [0, 1]);
  const jsonScale = interpolate(jsonProg, [0, 1], [0.92, 1]);

  // Highlight callout
  const highlightProg = spring({ frame: frame - 160, fps, config: { damping: 16, stiffness: 140 } });
  const highlightOp = interpolate(highlightProg, [0, 0.3], [0, 1]);
  const highlightScale = interpolate(highlightProg, [0, 1], [0.92, 1]);

  // Recording starts at ~80s in the original (where IPFS JSON is shown)
  // Adjust startFrom based on where the JSON appears in your recording
  const recordingStartFrame = 70 * 30; // 70 seconds into recording

  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      {/* Title: "The Proof" */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          opacity: titleOp * titleFade,
        }}
      >
        <div
          style={{
            fontFamily: MONO,
            fontSize: 14,
            color: COLORS.green,
            letterSpacing: 4,
            marginBottom: 16,
          }}
        >
          FILECOIN VERIFICATION
        </div>
        <div
          style={{
            fontFamily: INTER,
            fontSize: 48,
            fontWeight: 800,
            color: COLORS.white,
            textAlign: "center",
          }}
        >
          Click a CID. See the JSON.
        </div>
        <div
          style={{
            fontFamily: INTER,
            fontSize: 20,
            color: COLORS.muted,
            marginTop: 16,
          }}
        >
          Real data pinned to Filecoin, not mock responses.
        </div>
      </AbsoluteFill>

      {/* Screen recording of IPFS JSON */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: videoOp,
        }}
      >
        <OffthreadVideo
          src={staticFile("recording.mp4")}
          startFrom={recordingStartFrame}
          style={{ width: "100%", height: "100%" }}
        />
      </div>

      {/* Top gradient */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 100,
          background: `linear-gradient(to bottom, rgba(9,9,11,0.8) 0%, transparent 100%)`,
          opacity: videoOp,
        }}
      />

      {/* "REAL IPFS DATA" label */}
      <div
        style={{
          position: "absolute",
          top: 24,
          right: 40,
          opacity: jsonOp,
          transform: `scale(${jsonScale})`,
          display: "flex",
          alignItems: "center",
          gap: 8,
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
        <span style={{ fontFamily: MONO, fontSize: 13, color: COLORS.green, letterSpacing: 3, fontWeight: 600 }}>
          REAL IPFS DATA
        </span>
      </div>

      {/* Highlight callout */}
      <div
        style={{
          position: "absolute",
          bottom: 100,
          left: 60,
          opacity: highlightOp,
          transform: `scale(${highlightScale})`,
          background: "rgba(0,0,0,0.88)",
          border: `2px solid ${COLORS.green}`,
          borderRadius: 12,
          padding: "16px 24px",
          maxWidth: 480,
          backdropFilter: "blur(8px)",
        }}
      >
        <div style={{ fontFamily: INTER, fontSize: 20, fontWeight: 700, color: COLORS.green }}>
          LLM Reasoning on Filecoin
        </div>
        <div style={{ fontFamily: INTER, fontSize: 14, color: COLORS.offWhite, marginTop: 6 }}>
          Risk scores, survival estimates, anomaly detection. Computed by agents, pinned as CIDs, stored on-chain.
        </div>
      </div>

      <LogoBadge opacity={videoOp} />
      <Captions captions={MONEY_CAPTIONS} />
    </AbsoluteFill>
  );
};
