import { platformRules } from "../../config";
import { SupportForm } from "../components/support-form";

export function SupportPage() {
  return (
    <main className="content-section narrow">
      <section className="section-copy">
        <p className="eyebrow">Support</p>
        <h1>Tell us what went wrong.</h1>
      </section>

      <section className="panel form-panel">
        <span className="meta-title">Safety & support center</span>
        <p className="status-message">
          Velora keeps a few rules fixed for everyone so the product stays closed,
          text-only, and easier to moderate.
        </p>
        <div className="tag-grid">
          {platformRules.map((rule) => (
            <span className="chip chip-muted" key={rule}>
              {rule}
            </span>
          ))}
        </div>
        <p className="status-message">
          Trust signals in profiles are lightweight product indicators, not full identity guarantees.
        </p>
        <p className="status-message">
          Most trust is earned automatically through profile quality, account history, and calm behavior.
          A smaller set of profiles may also receive a manual <strong>Verified human</strong> badge.
        </p>
      </section>

      <SupportForm />
    </main>
  );
}
