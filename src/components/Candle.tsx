interface CandleProps {
  lit?: boolean;
  small?: boolean;
  className?: string;
}

export function Candle({ lit = true, small = false, className = "" }: CandleProps) {
  return (
    <div
      className={`candle ${small ? "candle--small" : ""} ${lit ? "is-lit" : "is-out"} ${className}`.trim()}
      aria-hidden="true"
    >
      <span className="candle__glow" />
      <span className="candle__halo" />
      <span className="candle__flame">
        <span className="candle__flame-core" />
      </span>
      <span className="candle__wick" />
      <span className="candle__body">
        <span className="candle__wax" />
      </span>
      <span className="candle__pool" />
    </div>
  );
}
