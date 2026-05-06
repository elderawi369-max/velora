import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { completeCheckoutSession } from "../../lib/api";

export function PaymentSuccessPage() {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Confirming your purchase...");

  useEffect(() => {
    const currentSessionId =
      searchParams.get("session_id") ??
      searchParams.get("token") ??
      searchParams.get("orderId");
    if (!currentSessionId) {
      setStatus("error");
      setMessage("Missing payment session.");
      return;
    }

    async function complete(sessionId: string) {
      try {
        const result = await completeCheckoutSession(sessionId);
        await queryClient.invalidateQueries({ queryKey: ["ownProfile"] });
        await queryClient.invalidateQueries({ queryKey: ["profiles"] });
        await queryClient.invalidateQueries({ queryKey: ["notifications"] });
        setStatus("success");
        setMessage(
          result.purchase.productKind === "gift"
            ? "Gift purchase confirmed and delivered."
            : "Boost purchase confirmed and activated.",
        );
      } catch (error) {
        setStatus("error");
        setMessage(
          error instanceof Error ? error.message : "Unable to confirm purchase.",
        );
      }
    }

    void complete(currentSessionId);
  }, [queryClient, searchParams]);

  return (
    <main className="content-section narrow">
      <section className="section-copy">
        <p className="eyebrow">Payment</p>
        <h1>{status === "success" ? "Payment confirmed." : "Finishing your purchase."}</h1>
        <p className="intro">{message}</p>
      </section>

      <section className="panel form-panel">
        {status === "loading" ? <p className="status-message">Please wait...</p> : null}
        {status === "error" ? <p className="error-message">{message}</p> : null}
        {status === "success" ? <p className="success-message">{message}</p> : null}
        <div className="action-row">
          <Link className="primary-button" to={status === "success" ? "/my-profile" : "/browse"}>
            {status === "success" ? "Back to my profile" : "Back to browse"}
          </Link>
        </div>
      </section>
    </main>
  );
}
