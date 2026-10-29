type FilmFrameProps = {
  time: string;
  caption: string;
  detail: string;
  crop?: "wide" | "drive" | "city" | "arrival";
  className?: string;
};

export default function FilmFrame({
  time,
  caption,
  detail,
  crop = "wide",
  className = "",
}: FilmFrameProps) {
  return (
    <div className={`film-frame film-crop-${crop} ${className}`}>
      <div className="film-scene" aria-hidden="true">
        <span className="road-block road-block-a" />
        <span className="road-block road-block-b" />
        <span className="road-asphalt" />
        <span className="road-lane" />
        <span className="road-dash" />
      </div>
      {crop === "wide" && <span className="film-play" aria-hidden="true" />}
      {crop !== "wide" && (
        <span className="film-rail" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      )}
      <span className="film-time">{time}</span>
      <div className="film-chrome">
        <span className="film-caption">{caption}</span>
        <span className="film-detail">{detail}</span>
        <span className="film-track">
          <span />
        </span>
      </div>
    </div>
  );
}
