type VeloraLogoProps = {
  markOnly?: boolean;
};

export function VeloraLogo({ markOnly = false }: VeloraLogoProps) {
  return (
    <span className={markOnly ? "velora-logo velora-logo-mark-only" : "velora-logo"}>
      <svg
        aria-hidden="true"
        className="velora-logo-mark"
        viewBox="0 0 64 64"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x="6" y="6" width="52" height="52" rx="18" fill="#fbf2ef" />
        <circle cx="32" cy="32" r="22" fill="#f6e3e6" />
        <path
          d="M17 34c0-11.1 8.9-20 20-20 6.2 0 11.8 2.8 15.4 7.3"
          fill="none"
          stroke="#e6bdc6"
          strokeLinecap="round"
          strokeWidth="3"
        />
        <path
          d="M23 19.5c2.4-1.8 5.6-3 8.9-3.2"
          fill="none"
          stroke="#f0d1d8"
          strokeLinecap="round"
          strokeWidth="3"
        />
        <path
          d="M22 20.5 31 42.8c.4 1 1.8 1 2.2 0l9-22.3"
          fill="none"
          stroke="#4e2233"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="6"
        />
        <path
          d="M28.5 24.5c1.3-2 3.2-3.2 5.4-3.2 2.1 0 4 1.2 5.3 3.2"
          fill="none"
          stroke="#b45469"
          strokeLinecap="round"
          strokeWidth="3.5"
        />
        <circle cx="44.5" cy="18.5" r="3.2" fill="#b45469" />
        <circle cx="44.5" cy="18.5" r="1.3" fill="#fff7f5" />
      </svg>
      {markOnly ? null : (
        <span className="velora-wordmark" aria-label="Velora">
          Velora
        </span>
      )}
    </span>
  );
}
