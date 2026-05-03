import { useEffect, useMemo, useState } from "react";

function formatRemainingTime(remainingMs: number) {
  const totalMinutes = Math.max(Math.floor(remainingMs / (1000 * 60)), 0);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h left`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m left`;
  }

  return `${minutes}m left`;
}

type GiftEffectStatusProps = {
  activeLabel: string | null;
  activeExpiresAt: number | null;
  totalReceived: number;
};

export function GiftEffectStatus({
  activeLabel,
  activeExpiresAt,
  totalReceived,
}: GiftEffectStatusProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!activeLabel || !activeExpiresAt) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 60_000);

    return () => window.clearInterval(timer);
  }, [activeExpiresAt, activeLabel]);

  const remainingMs = useMemo(() => {
    if (!activeExpiresAt) {
      return 0;
    }

    return Math.max(activeExpiresAt - now, 0);
  }, [activeExpiresAt, now]);

  if (activeLabel && activeExpiresAt && remainingMs > 0) {
    return (
      <p className="gift-status">
        {activeLabel} active · {formatRemainingTime(remainingMs)}
      </p>
    );
  }

  if (totalReceived > 0) {
    return <p className="gift-status">No active effect right now.</p>;
  }

  return null;
}
