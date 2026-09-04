import type { AiCompanion, AiCompanionSubscriptionPlan } from "../../lib/api";

type Props = {
  companion: AiCompanion;
  plans: AiCompanionSubscriptionPlan[];
  prices: Partial<Record<"pro" | "ultra", string>>;
  isAndroid: boolean;
  pendingPlan: "pro" | "ultra" | null;
  currentPlan: "free" | "pro" | "ultra";
  error: string | null;
  onSubscribe: (plan: "pro" | "ultra") => void;
};

export function AiCompanionPaywall({ companion, plans, prices, isAndroid, pendingPlan, currentPlan, error, onSubscribe }: Props) {
  return <section className="ai-upgrade-screen" aria-labelledby="ai-upgrade-title">
    <div className="ai-upgrade-shell">
      <header className="ai-upgrade-hero">
        <span className="ai-upgrade-avatar">{companion.name.slice(0, 1).toUpperCase()}</span>
        <div>
          <p className="eyebrow">YOUR CONVERSATION CAN CONTINUE</p>
          <h1 id="ai-upgrade-title">Keep talking with {companion.name} <span aria-hidden="true">❤️</span></h1>
          <p>Choose the space that feels right for your connection.</p>
        </div>
      </header>

      <div className="ai-upgrade-plans">
        {plans.map((plan) => {
          const ultra = plan.key === "ultra";
          const includedInUltra = currentPlan === "ultra" && plan.key === "pro";
          const price = prices[plan.key] ?? (isAndroid ? plan.googlePlayFallbackPrice : `$${(plan.webPriceCents / 100).toFixed(2)}`);
          return <article className={ultra ? "ai-upgrade-plan ai-upgrade-plan-ultra" : "ai-upgrade-plan"} key={plan.key}>
            {ultra ? <span className="ai-upgrade-badge">BEST VALUE</span> : null}
            <div className="ai-upgrade-plan-heading">
              <div><p className="eyebrow">{plan.name.toUpperCase()}</p><h2>{plan.positioning}</h2></div>
              <p className="ai-upgrade-price"><strong>{price}</strong><span>/ month</span></p>
            </div>
            <div className="ai-upgrade-highlights">
              <div><strong>{plan.companionLimit}</strong><span>{plan.companionLimit === 1 ? "active companion" : "active companions"}</span></div>
              <div><strong>{plan.photoLimit}</strong><span>photos / month</span></div>
              <div><strong>{ultra ? "Much larger allowance" : "Generous monthly allowance"}</strong><span>Voice messages + calls</span></div>
            </div>
            <ul>
              <li>Full text conversations</li>
              <li>Relationship memory and progression</li>
              <li>{ultra ? "Deeper memory and personalized check-ins" : "Proactive companion check-ins"}</li>
              <li>{ultra ? "Priority photo generation" : "Standard photo generation"}</li>
            </ul>
            <button className={ultra ? "primary-button" : "secondary-button"} type="button" disabled={pendingPlan !== null || currentPlan === plan.key || includedInUltra} onClick={() => onSubscribe(plan.key)}>
              {currentPlan === plan.key ? "Current plan" : includedInUltra ? "Included in Ultra" : pendingPlan === plan.key ? "Opening checkout..." : ultra ? "Go Ultra" : "Continue with Pro"}
            </button>
          </article>;
        })}
      </div>
      {error ? <p className="form-error ai-upgrade-error">{error}</p> : null}
      <p className="ai-upgrade-privacy">{isAndroid ? <>Auto-renews monthly unless canceled. <a href="https://play.google.com/store/account/subscriptions?package=com.velorachat.app" target="_blank" rel="noreferrer">Manage or cancel in Google Play</a>. <span aria-hidden="true">•</span> </> : <>Cancel anytime <span aria-hidden="true">•</span> </>}Your conversations stay private</p>
    </div>
  </section>;
}
