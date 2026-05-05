import { useMutation, useQuery } from "@tanstack/react-query";
import { createGiftCheckout, fetchGiftCatalog } from "../../lib/api";

type GiftActionsProps = {
  profileId: string;
};

export function GiftActions({ profileId }: GiftActionsProps) {
  const giftCatalogQuery = useQuery({
    queryKey: ["giftCatalog"],
    queryFn: fetchGiftCatalog,
  });

  const giftMutation = useMutation({
    mutationFn: (giftType: string) => createGiftCheckout(profileId, giftType),
    onSuccess: (result) => {
      window.location.href = result.checkoutUrl;
    },
  });

  return (
    <div className="gift-actions">
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
