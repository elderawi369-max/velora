import { platformRules } from "../../config";
import { SupportForm } from "../components/support-form";

export function SupportPage() {
  return (
    <main className="content-section narrow">
      <section className="section-copy">
        <p className="eyebrow">Support</p>
        <h1>Tell us what went wrong and we’ll have a place to review it.</h1>
        <p className="intro">
          This is the first support flow for Velora. It is simple on purpose, but
          it gives users a real way to ask for help.
        </p>
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
      </section>

      <SupportForm />
    </main>
  );
}
