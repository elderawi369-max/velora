import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  formatAvatarPreviewLabel,
  identityOptions,
  isLegacyIdentity,
  lookingForOptions,
  getPersonalityAvatarPreset,
  personalityTypeDescriptions,
  personalityTypeOptions,
  platformRules,
  preferenceOptions,
  profilePromptOptions,
  vibeOptions,
} from "../../config";
import { createProfile, type PublicProfile, updateOwnProfile } from "../../lib/api";
import { ProfileAvatar } from "./profile-avatar";

function toggleItem(items: string[], item: string) {
  return items.includes(item)
    ? items.filter((entry) => entry !== item)
    : [...items, item];
}

function countProfileCompletion(input: {
  bio: string;
  promptEntries: Array<{ question: string; answer: string }>;
  vibeTags: string[];
  boundaries: string[];
}) {
  let completed = 0;

  if (input.bio.trim().length >= 10) {
    completed += 1;
  }
  if (input.promptEntries.filter((entry) => entry.answer.trim().length > 0).length >= 2) {
    completed += 1;
  }
  if (input.vibeTags.length >= 3) {
    completed += 1;
  }
  if (input.boundaries.length >= 2) {
    completed += 1;
  }

  return completed;
}

type ProfileFormProps = {
  mode?: "create" | "edit";
  initialProfile?: PublicProfile | null;
};

export function ProfileForm({ mode = "create", initialProfile = null }: ProfileFormProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState(initialProfile?.username ?? "");
  const [displayName, setDisplayName] = useState(initialProfile?.displayName ?? "");
  const [personalityType, setPersonalityType] = useState<string>(
    initialProfile?.personalityType ?? "soft / sweet",
  );
  const [identity, setIdentity] = useState<string>(
    initialProfile?.identity && !isLegacyIdentity(initialProfile.identity)
      ? initialProfile.identity
      : "",
  );
  const [lookingFor, setLookingFor] = useState<string>(initialProfile?.lookingFor ?? "any");
  const [bio, setBio] = useState(initialProfile?.bio ?? "");
  const [vibeTags, setVibeTags] = useState<string[]>(initialProfile?.vibeTags ?? ["sweet"]);
  const [boundaries, setBoundaries] = useState<string[]>(
    initialProfile?.boundaries ?? ["kind tone only"],
  );
  const [promptEntries, setPromptEntries] = useState<Array<{ question: string; answer: string }>>(
    initialProfile?.promptEntries?.length
      ? initialProfile.promptEntries
      : [
          { question: profilePromptOptions[0], answer: "" },
          { question: profilePromptOptions[1], answer: "" },
        ],
  );
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(mode === "edit");
  const avatarPreset = getPersonalityAvatarPreset(personalityType, identity);
  const hasLegacyIdentity = Boolean(initialProfile?.identity && isLegacyIdentity(initialProfile.identity));
  const answeredPrompts = promptEntries.filter((entry) => entry.answer.trim().length > 0);
  const completionCount = countProfileCompletion({
    bio,
    promptEntries,
    vibeTags,
    boundaries,
  });
  const completionPercent = Math.round((completionCount / 4) * 100);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const shortPromptAnswer = promptEntries.find((entry) => {
        const answerLength = entry.answer.trim().length;
        return answerLength > 0 && answerLength < 4;
      });
      const selectedIdentity = identity;

      if (selectedIdentity !== "woman" && selectedIdentity !== "man") {
        setError("Choose whether your profile appears as woman or man before saving.");
        setIsSubmitting(false);
        return;
      }

      const selectedAvatarPreset = getPersonalityAvatarPreset(
        personalityType,
        selectedIdentity,
      );

      if (!selectedAvatarPreset) {
        setError("Unable to assign your portrait avatar. Try changing personality or identity.");
        setIsSubmitting(false);
        return;
      }

      if (shortPromptAnswer) {
        setError("Finish or clear any prompt answer shorter than 4 characters.");
        setIsSubmitting(false);
        return;
      }

      const payload = {
        username,
        displayName,
        personalityType,
        identity: selectedIdentity,
        lookingFor,
        bio,
        promptEntries: answeredPrompts.filter((entry) => entry.answer.trim().length >= 4),
        avatarPreset: selectedAvatarPreset,
        vibeTags,
        boundaries,
      };

      if (mode === "edit") {
        await updateOwnProfile(payload);
        await queryClient.invalidateQueries({ queryKey: ["ownProfile"] });
        await queryClient.invalidateQueries({ queryKey: ["profiles"] });
        navigate("/my-profile");
      } else {
        await createProfile(payload);
        await queryClient.invalidateQueries({ queryKey: ["ownProfile"] });
        await queryClient.invalidateQueries({ queryKey: ["profiles"] });
        navigate("/browse");
      }
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to save profile.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="content-section">
      <div className="section-copy">
        <p className="eyebrow">Profile setup</p>
        <h1>
          {mode === "edit"
            ? "Refine the profile people return to."
            : "Create a profile people will want to return to."}
        </h1>
        <p className="status-message">
          {mode === "edit"
            ? `Profile strength ${completionPercent}% complete. Add prompts, vibes, and preferences to improve visibility.`
            : "Start with the essentials, then add extra detail for better matches and better placement in Browse."}
        </p>
      </div>

      <form className="panel form-panel" onSubmit={handleSubmit}>
        <div className="panel form-panel">
          <div className="section-copy compact-copy">
            <p className="eyebrow">{showAdvanced ? "Advanced" : "Quick start"}</p>
            <h2>{showAdvanced ? "Polish the profile people reply to." : "Get live fast with the essentials."}</h2>
          </div>
          <div className="chip-row">
            <span className="chip">Completion {completionPercent}%</span>
            <span className={completionCount >= 2 ? "chip" : "chip chip-muted"}>
              Minimum profile ready
            </span>
            <span className={completionCount === 4 ? "chip" : "chip chip-muted"}>
              Full profile boost
            </span>
          </div>
          {mode === "create" ? (
            <p className="status-message">
              Prompts, vibe tags, and profile preferences are optional at first. You can skip them now, enter Browse immediately, and add them later from My Profile.
            </p>
          ) : null}
        </div>

        <div className="field-grid">
          <label className="field">
            <span>Username</span>
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value.toLowerCase())}
              placeholder="softnightowl"
              minLength={3}
              maxLength={20}
              pattern="[a-z0-9_]+"
              required
            />
          </label>

          <label className="field">
            <span>Display name</span>
            <input
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Mina"
              minLength={2}
              maxLength={30}
              required
            />
          </label>
        </div>

        <div className="field-grid">
          <label className="field">
            <span>Personality type</span>
            <select
              value={personalityType}
              onChange={(event) => setPersonalityType(event.target.value)}
            >
              {personalityTypeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <small className="status-message">
              {personalityTypeDescriptions[
                personalityType as keyof typeof personalityTypeDescriptions
              ]}
            </small>
          </label>

          <label className="field">
            <span>I am</span>
            <select value={identity} onChange={(event) => setIdentity(event.target.value)}>
              <option value="" disabled>
                Choose one
              </option>
              {identityOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            {hasLegacyIdentity ? (
              <small className="form-hint">
                Your older profile used a retired identity setting. Choose woman or man to keep updating this profile.
              </small>
            ) : null}
          </label>

          <label className="field">
            <span>I want to chat with</span>
            <select
              value={lookingFor}
              onChange={(event) => setLookingFor(event.target.value)}
            >
              {lookingForOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="field">
          <span>Bio</span>
          <textarea
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            placeholder="Warm late-night talker who likes comforting chats, playful teasing, and clear boundaries."
            minLength={10}
            maxLength={280}
            rows={4}
            required
          />
          <small className="status-message">
            Keep it inside Velora. Do not include emails, usernames, links, or off-app contact details.
          </small>
        </label>

        <div className="picker-group">
          <span className="picker-label">Profile picture</span>
            <div className="chip-row">
              <ProfileAvatar
                personalityType={personalityType}
                identity={identity || initialProfile?.identity}
                size="medium"
              />
              {avatarPreset ? (
                <span className="chip">
                  {formatAvatarPreviewLabel(
                    personalityType,
                    identity || initialProfile?.identity,
                  )}
                </span>
              ) : (
                <span className="chip chip-muted">
                Choose woman or man to unlock the new portrait avatar.
              </span>
            )}
          </div>
          <p className="status-message">
            Your profile picture is assigned automatically from your personality type and identity.
          </p>
        </div>

        {showAdvanced ? (
          <>
            <div className="picker-group">
              <span className="picker-label">Profile prompts (optional)</span>
              <p className="status-message">
                Short answers make profiles easier to remember and easier to start chatting with.
              </p>
              <div className="content-section">
                {promptEntries.map((entry, index) => (
                  <div className="panel form-panel" key={`${entry.question}-${index}`}>
                    <label className="field">
                      <span>Prompt {index + 1}</span>
                      <select
                        value={entry.question}
                        onChange={(event) =>
                          setPromptEntries((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, question: event.target.value }
                                : item,
                            ),
                          )
                        }
                      >
                        {profilePromptOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field">
                      <span>Answer</span>
                      <textarea
                        value={entry.answer}
                        onChange={(event) =>
                          setPromptEntries((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, answer: event.target.value }
                                : item,
                            ),
                          )
                        }
                        placeholder="Give people a concrete feel for how you like to chat."
                        rows={3}
                        maxLength={180}
                      />
                      <small className="status-message">
                        No emails, social handles, links, or other off-app contact details.
                      </small>
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="picker-group">
              <span className="picker-label">Vibe tags (optional)</span>
              <div className="tag-grid">
                {vibeOptions.map((option) => {
                  const active = vibeTags.includes(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      className={active ? "tag-button tag-active" : "tag-button"}
                      onClick={() => setVibeTags(toggleItem(vibeTags, option))}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="picker-group">
              <span className="picker-label">Platform rules</span>
              <p className="status-message">
                These are fixed for everyone and do not need to be selected per profile.
              </p>
              <div className="tag-grid">
                {platformRules.map((rule) => (
                  <span className="chip chip-muted" key={rule}>
                    {rule}
                  </span>
                ))}
              </div>
            </div>

            <div className="picker-group">
              <span className="picker-label">Profile preferences (optional)</span>
              <div className="tag-grid">
                {preferenceOptions.map((option) => {
                  const active = boundaries.includes(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      className={active ? "tag-button tag-active" : "tag-button"}
                      onClick={() => setBoundaries(toggleItem(boundaries, option))}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="panel form-panel">
            <div className="section-copy compact-copy">
              <p className="eyebrow">Optional boost</p>
              <h2>Add prompts and preferences after you go live.</h2>
            </div>
            <p className="status-message">
              You can create the profile now, or add more detail first for stronger Browse placement and easier chat openers.
            </p>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setShowAdvanced(true)}
            >
              Add more detail first
            </button>
          </div>
        )}

        {error ? <p className="form-error">{error}</p> : null}

        <div className="action-row">
          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? "Saving profile..."
              : mode === "edit"
                ? "Save profile"
                : showAdvanced
                  ? "Create full profile"
                  : "Create profile now"}
          </button>
          {mode === "create" && showAdvanced ? (
            <button
              className="secondary-button"
              type="button"
              onClick={() => setShowAdvanced(false)}
            >
              Back to quick start
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
