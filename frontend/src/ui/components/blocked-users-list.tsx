import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchBlocks, unblockProfile } from "../../lib/api";
import { ProfileAvatar } from "./profile-avatar";

export function BlockedUsersList() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["blocks"],
    queryFn: fetchBlocks,
  });

  const unblockMutation = useMutation({
    mutationFn: unblockProfile,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["blocks"] });
      await queryClient.invalidateQueries({ queryKey: ["profiles"] });
    },
  });

  if (isLoading) {
    return <p className="status-message">Loading blocked users...</p>;
  }

  if (error) {
    return (
      <div className="panel">
        <p className="error-message">
          {error instanceof Error ? error.message : "Unable to load blocked users."}
        </p>
      </div>
    );
  }

  if (!data || data.blocks.length === 0) {
    return (
      <div className="panel empty-state">
        <h2>No blocked users.</h2>
        <p>If you block someone, you'll be able to review and undo it here.</p>
      </div>
    );
  }

  return (
    <section className="card-grid">
      {data.blocks.map((block) => (
        <article className="card profile-card" key={block.id}>
          <ProfileAvatar
            personalityType={block.personalityType}
            identity={block.identity}
            size="medium"
          />
          <div className="profile-head">
            <h2>{block.displayName ?? "Unknown profile"}</h2>
            <p>@{block.username ?? "missing-profile"}</p>
          </div>
          <button
            className="secondary-button"
            type="button"
            disabled={unblockMutation.isPending}
            onClick={() => unblockMutation.mutate(block.targetProfileId)}
          >
            {unblockMutation.isPending ? "Updating..." : "Unblock"}
          </button>
        </article>
      ))}
    </section>
  );
}
