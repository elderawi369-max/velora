export function DeleteAccountPage() {
  return (
    <main className="content-section legal-page">
      <section className="section-copy">
        <p className="eyebrow">Account deletion</p>
        <h1>How to delete your Velora account</h1>
      </section>

      <section className="panel legal-copy">
        <h2>Delete your account in the app</h2>
        <p>
          If you can log in, open <strong>My Profile</strong>, go to account settings, enter
          your current password, type <strong>DELETE</strong>, and confirm account deletion.
        </p>

        <h2>If you cannot log in</h2>
        <p>
          Use the <a href="/forgot-password">forgot password</a> flow first. If you still cannot
          access your account, contact Velora through the{" "}
          <a href="/my-profile#support">support form in My Profile</a> and request account deletion using the email
          address tied to your account.
        </p>

        <h2>What is deleted</h2>
        <p>
          When your account is deleted, Velora removes your profile, conversation access,
          favorites, boosts, gifts, and login access from the active product experience.
        </p>

        <h2>What may be retained for a limited time</h2>
        <p>
          Velora may retain certain records such as purchase history, support requests,
          moderation reports, and safety-related logs when needed for fraud prevention, legal
          compliance, dispute handling, or platform protection.
        </p>

        <h2>Adults only</h2>
        <p>
          Velora is for adults aged 18 and older. Accounts identified as underage may be removed
          to protect the community and comply with platform rules.
        </p>
      </section>
    </main>
  );
}
