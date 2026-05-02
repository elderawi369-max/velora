import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { fetchGiftCatalog, sendGift } from "../../lib/api";

type GiftActionsProps = {
  profileId: string;
};

export function GiftActions({ profileId }: GiftActionsProps) {
  const [success, setSuccess] = useState("");

  const giftCatalogQuery = useQuery({
    queryKey: ["giftCatalog"],
    queryFn: fetchGiftCatalog,
  });

  const giftMutation = useMutation({
    mutationFn: (giftType: string) => sendGift(profileId, giftType),
    onSuccess: (_, giftType) => {
      const gift = giftCatalogQuery.data?.gifts.find((item) => item.key === giftType);
      setSuccess(gift ? `${gift.label} sent.` : "Gift sent.");
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
              setSuccess("");
              giftMutation.mutate(gift.key);
            }}
          >
            {giftMutation.isPending ? "Sending..." : `Send ${gift.label}`}
          </button>
        ))}
      </div>

      {giftMutation.error ? (
        <p className="form-error">
          {giftMutation.error instanceof Error
            ? giftMutation.error.message
            : "Unable to send gift."}
        </p>
      ) : null}

      {success ? <p className="success-message">{success}</p> : null}
    </div>
  );
}
