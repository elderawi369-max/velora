import {
  identityFallbackIcons,
  personalityTypeIcons,
} from "../../config";

type GiftType = "rose" | "starlight" | "crown" | null;

type ProfileAvatarProps = {
  personalityType?: string | null;
  identity?: string | null;
  dominantGiftType?: GiftType;
  size?: "large" | "medium" | "small";
};

function getAvatarIcon(personalityType?: string | null, identity?: string | null) {
  if (personalityType && personalityType in personalityTypeIcons) {
    return personalityTypeIcons[
      personalityType as keyof typeof personalityTypeIcons
    ];
  }

  if (identity === "woman" || identity === "man" || identity === "prefer not to say") {
    return identityFallbackIcons[identity];
  }

  return "✨";
}

export function ProfileAvatar({
  personalityType,
  identity,
  dominantGiftType = null,
  size = "medium",
}: ProfileAvatarProps) {
  const icon = getAvatarIcon(personalityType, identity);
  const classes = [
    "profile-avatar",
    `profile-avatar-${size}`,
    personalityType ? "profile-avatar-personality" : "profile-avatar-fallback",
    dominantGiftType ? `profile-avatar-gift-${dominantGiftType}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} aria-hidden="true">
      {dominantGiftType === "crown" ? (
        <span className="profile-avatar-crown">👑</span>
      ) : null}
      {dominantGiftType === "rose" ? (
        <>
          <span className="profile-avatar-petal profile-avatar-petal-a">✿</span>
          <span className="profile-avatar-petal profile-avatar-petal-b">✿</span>
        </>
      ) : null}
      {dominantGiftType === "starlight" ? (
        <>
          <span className="profile-avatar-sparkle profile-avatar-sparkle-a">✦</span>
          <span className="profile-avatar-sparkle profile-avatar-sparkle-b">✦</span>
        </>
      ) : null}
      <span className="profile-avatar-icon">{icon}</span>
    </div>
  );
}
