import {
  getLegacyAvatarPreset,
  getPersonalityAvatarPreset,
  identityFallbackIcons,
  personalityTypeIcons,
} from "../../config";

const portraitAssetModules = import.meta.glob("../../assets/avatar-presets/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const portraitAssetMap = Object.fromEntries(
  Object.entries(portraitAssetModules).map(([filePath, assetUrl]) => {
    const fileName = filePath.split("/").pop() ?? filePath;
    return [fileName.replace(".png", ""), assetUrl];
  }),
) as Record<string, string>;

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

function getAvatarImageSource(personalityType?: string | null, identity?: string | null) {
  const portraitPreset = getPersonalityAvatarPreset(personalityType, identity);
  if (portraitPreset) {
    return portraitAssetMap[portraitPreset] ?? null;
  }

  const legacyPreset = getLegacyAvatarPreset(personalityType);
  if (identity === "prefer not to say" && legacyPreset) {
    return null;
  }

  return null;
}

export function ProfileAvatar({
  personalityType,
  identity,
  dominantGiftType = null,
  size = "medium",
}: ProfileAvatarProps) {
  const icon = getAvatarIcon(personalityType, identity);
  const imageSource = getAvatarImageSource(personalityType, identity);
  const classes = [
    "profile-avatar",
    `profile-avatar-${size}`,
    imageSource ? "profile-avatar-portrait" : "",
    personalityType ? "profile-avatar-personality" : "profile-avatar-fallback",
    dominantGiftType ? `profile-avatar-gift-${dominantGiftType}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} aria-hidden="true">
      {dominantGiftType ? <span className="profile-avatar-frame" /> : null}

      {dominantGiftType === "crown" ? (
        <>
          <span className="profile-avatar-crown">👑</span>
          <span className="profile-avatar-crown-shine" />
        </>
      ) : null}

      {dominantGiftType === "rose" ? (
        <>
          <span className="profile-avatar-petal profile-avatar-petal-1">🌹</span>
          <span className="profile-avatar-petal profile-avatar-petal-2">🌹</span>
          <span className="profile-avatar-petal profile-avatar-petal-3">🌹</span>
          <span className="profile-avatar-petal profile-avatar-petal-4">🌹</span>
          <span className="profile-avatar-petal profile-avatar-petal-5">🌹</span>
          <span className="profile-avatar-petal profile-avatar-petal-6">🌹</span>
        </>
      ) : null}

      {dominantGiftType === "starlight" ? (
        <>
          <span className="profile-avatar-sparkle profile-avatar-sparkle-a">✦</span>
          <span className="profile-avatar-sparkle profile-avatar-sparkle-b">✦</span>
          <span className="profile-avatar-sparkle profile-avatar-sparkle-c">✦</span>
          <span className="profile-avatar-sparkle profile-avatar-sparkle-d">✦</span>
        </>
      ) : null}

      {imageSource ? (
        <img
          className="profile-avatar-image"
          src={imageSource}
          alt=""
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className="profile-avatar-icon">{icon}</span>
      )}
    </div>
  );
}
