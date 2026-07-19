import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createGiftCheckout, fetchGiftCatalog, savePendingCheckoutId } from "../../lib/api";
import {
  completeGooglePlayPurchase,
  isNativeAndroidApp,
  shouldUseGooglePlayBilling,
} from "../../lib/google-play-billing";

type GiftActionsProps = {
  profileId: string;
};

export function GiftActions({ profileId }: GiftActionsProps) {
  const queryClient = useQueryClient();
  const giftCatalogQuery = useQuery({
    queryKey: ["giftCatalog"],
    queryFn: fetchGiftCatalog,
  });

  const giftMutation = useMutation({
    mutationFn: async (giftType: string) => {
      if (await shouldUseGooglePlayBilling()) {
        return completeGooglePlayPurchase({
          productKind: "gift",
          itemKey: giftType,
          targetProfileId: profileId,
        });
      }

      if (isNativeAndroidApp()) {
        throw new Error("This Android build should use Google Play Billing, not web checkout.");
      }

      const checkout = await createGiftCheckout(profileId, giftType);
      return { mode: "checkout" as const, ...checkout };
    },
    onSuccess: async (result) => {
      if ("mode" in result) {
        savePendingCheckoutId(result.checkoutId);
        window.location.href = result.checkoutUrl;
        return;
      }

      if (!result.cancelled) {
        await queryClient.invalidateQueries({ queryKey: ["profiles"] });
        await queryClient.invalidateQueries({ queryKey: ["conversations"] });
        await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      }
    },
  });

  return (
    <div className="gift-actions">
      <p className="gift-explainer">
        Send a small signal that lingers. Gifts add a visible aura and make your attention feel harder to ignore.
      </p>

      <div className="gift-row">
        {(giftCatalogQuery.data?.gifts ?? []).map((gift) => (
          <button
            key={gift.key}
            className="gift-button"
            type="button"
            disabled={giftMutation.isPending}
            onClick={() => {
              giftMutation.mutate(gift.key);
            }}
          >
            {giftMutation.isPending
              ? "Opening checkout..."
              : `Buy ${gift.label} · $${(gift.priceCents / 100).toFixed(2)}`}
          </button>
        ))}
      </div>

      {giftMutation.error ? (
        <p className="form-error">
          {giftMutation.error instanceof Error
            ? giftMutation.error.message
            : "Unable to open gift checkout."}
        </p>
      ) : null}
    </div>
  );
}
