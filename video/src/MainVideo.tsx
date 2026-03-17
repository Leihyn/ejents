import React from "react";
import { AbsoluteFill, Audio, Series, staticFile } from "remotion";
import { COLORS } from "./constants";
import { Hook } from "./scenes/Hook";
import { ArchFlash } from "./scenes/ArchFlash";
import { DemoRecording } from "./scenes/DemoRecording";
import { MoneyShot } from "./scenes/MoneyShot";
import { Close } from "./scenes/Close";

// Timeline (at 30fps):
//    0 -  420  ( 0:00 - 0:14)  Hook
//  420 -  720  ( 0:14 - 0:24)  Architecture Flash
//  720 - 2970  ( 0:24 - 1:39)  Dashboard Demo (75s screen recording + callouts)
// 2970 - 3420  ( 1:39 - 1:54)  Money Shot (IPFS JSON reveal)
// 3420 - 3960  ( 1:54 - 2:12)  Close
// Total: 3960 frames = 132 seconds = 2:12

export const MainVideo: React.FC = () => (
  <AbsoluteFill style={{ background: COLORS.bg }}>
    <Audio src={staticFile("voiceover.mp3")} volume={1} />
    <Series>
      <Series.Sequence durationInFrames={420}>
        <Hook />
      </Series.Sequence>
      <Series.Sequence durationInFrames={300}>
        <ArchFlash />
      </Series.Sequence>
      <Series.Sequence durationInFrames={2250}>
        <DemoRecording />
      </Series.Sequence>
      <Series.Sequence durationInFrames={450}>
        <MoneyShot />
      </Series.Sequence>
      <Series.Sequence durationInFrames={540}>
        <Close />
      </Series.Sequence>
    </Series>
  </AbsoluteFill>
);
