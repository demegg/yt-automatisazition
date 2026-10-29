import { Captions, Scissors, Sparkles } from "lucide-react";
import FilmFrame from "./FilmFrame";

export default function HeroStage() {
  return (
    <div className="hero-stage" id="hero-stage">
      <div className="hero-glow" />
      <div className="hero-still" aria-hidden="true">
        <div className="hero-ring" />
        <div className="hero-plate hero-plate-a">
          <FilmFrame time="00:18" caption="The drive" detail="0:18 · clip" crop="drive" />
        </div>
        <div className="hero-plate hero-plate-source">
          <FilmFrame time="12:04" caption="Full episode" detail="48:12 · original" crop="wide" />
        </div>
        <div className="hero-plate hero-plate-b">
          <FilmFrame time="01:04" caption="City lights" detail="1:04 · clip" crop="city" />
        </div>
        <span className="hero-chip hero-chip-a">
          <Scissors className="h-3.5 w-3.5 text-brand" />
          12 parts cut
        </span>
        <span className="hero-chip hero-chip-b">
          <Captions className="h-3.5 w-3.5 text-accent" />
          Captions burned in
        </span>
        <span className="hero-chip hero-chip-c">
          <Sparkles className="h-3.5 w-3.5 text-ok" />
          1080×1920 ready
        </span>
      </div>
    </div>
  );
}
