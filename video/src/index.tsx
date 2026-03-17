import { registerRoot, Composition } from "remotion";
import React from "react";
import { MainVideo } from "./MainVideo";
import { Hook } from "./scenes/Hook";
import { ArchFlash } from "./scenes/ArchFlash";
import { DemoRecording } from "./scenes/DemoRecording";
import { MoneyShot } from "./scenes/MoneyShot";
import { Close } from "./scenes/Close";
import { FPS, W, H } from "./constants";

const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="MainVideo"
      component={MainVideo}
      durationInFrames={3960}
      fps={FPS}
      width={W}
      height={H}
    />
    {/* Individual scenes for preview */}
    <Composition id="Hook" component={Hook} durationInFrames={420} fps={FPS} width={W} height={H} />
    <Composition id="ArchFlash" component={ArchFlash} durationInFrames={300} fps={FPS} width={W} height={H} />
    <Composition id="DemoRecording" component={DemoRecording} durationInFrames={2250} fps={FPS} width={W} height={H} />
    <Composition id="MoneyShot" component={MoneyShot} durationInFrames={450} fps={FPS} width={W} height={H} />
    <Composition id="Close" component={Close} durationInFrames={540} fps={FPS} width={W} height={H} />
  </>
);

registerRoot(RemotionRoot);
