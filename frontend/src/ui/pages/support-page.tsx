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

      <SupportForm />
    </main>
  );
}
