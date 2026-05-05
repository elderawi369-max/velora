import { useEffect, useMemo, useState } from "react";

type BoostStatusProps = {
  activeLabel: string | null;
  activeExpiresAt: number | null;
  totalPurchased: number;
};

function formatRemaining(ms: number) {
  if (ms <= 0) {
    return "ending soon";
  }

  const totalMinutes = Math.floor(ms / (1000 * 60));
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

export function BoostStatus({
  activeLabel,
  activeExpiresAt,
  totalPurchased,
}: BoostStatusProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!activeExpiresAt) {
      return;
    }

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 60_000);

    return () => window.clearInterval(timer);
  }, [activeExpiresAt]);

  const content = useMemo(() => {
    if (!activeLabel || !activeExpiresAt) {
      return totalPurchased > 0 ? "No active boost right now." : "No boosts used yet.";
    }

    return `${activeLabel} active · ${formatRemaining(activeExpiresAt - now)}`;
  }, [activeExpiresAt, activeLabel, now, totalPurchased]);

  return <p className="boost-status">{content}</p>;
}
