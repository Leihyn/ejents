import React from "react";
import { Img, staticFile } from "remotion";
import { MONO } from "../fonts";
import { COLORS } from "../constants";

export const LogoBadge: React.FC<{ opacity?: number }> = ({ opacity = 1 }) => (
  <div
    style={{
      position: "absolute",
      top: 24,
      left: 40,
      display: "flex",
      alignItems: "center",
      gap: 10,
      opacity,
      zIndex: 30,
    }}
  >
    <Img src={staticFile("logo.jpg")} style={{ width: 36, height: 36, borderRadius: 8 }} />
    <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: COLORS.white, letterSpacing: 3, opacity: 0.8 }}>
      EJENTS
    </span>
  </div>
);
