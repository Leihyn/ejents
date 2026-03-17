import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS } from "../constants";
import { INTER } from "../fonts";

interface CaptionEntry {
  text: string;
  start: number; // frame
  end: number;   // frame
}

export const Captions: React.FC<{ captions: CaptionEntry[] }> = ({ captions }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const active = captions.find((c) => frame >= c.start && frame <= c.end);
  if (!active) return null;

  const fadeIn = interpolate(frame, [active.start, active.start + 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [active.end - 10, active.end], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ySlide = interpolate(frame, [active.start, active.start + 15], [8, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        bottom: 60,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        zIndex: 20,
        opacity: fadeIn * fadeOut,
        transform: `translateY(${ySlide}px)`,
      }}
    >
      <div
        style={{
          background: "rgba(0,0,0,0.85)",
          backdropFilter: "blur(12px)",
          borderRadius: 10,
          padding: "14px 32px",
          maxWidth: 900,
        }}
      >
        <div
          style={{
            fontFamily: INTER,
            fontSize: 22,
            fontWeight: 600,
            color: COLORS.white,
            textAlign: "center",
            lineHeight: 1.4,
          }}
        >
          {active.text}
        </div>
      </div>
    </div>
  );
};
