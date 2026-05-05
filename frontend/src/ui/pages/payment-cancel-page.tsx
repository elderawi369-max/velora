import { Link } from "react-router-dom";

export function PaymentCancelPage() {
  return (
    <main className="content-section narrow">
      <section className="section-copy">
        <p className="eyebrow">Payment</p>
        <h1>Checkout was canceled.</h1>
        <p className="intro">
          No charge was completed. You can return to Velora and try again whenever you want.
        </p>
      </section>

      <section className="panel form-panel">
        <div className="action-row">
          <Link className="primary-button" to="/browse">
            Back to browse
          </Link>
          <Link className="secondary-button" to="/my-profile">
            Back to my profile
          </Link>
        </div>
      </section>
    </main>
  );
}
