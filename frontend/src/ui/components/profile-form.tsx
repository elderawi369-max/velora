import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  identityOptions,
  lookingForOptions,
  personalityTypeIcons,
  personalityTypeAvatarMap,
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
    initialProfile?.identity ?? "prefer not to say",
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
  const avatarPreset =
    personalityTypeAvatarMap[
      personalityType as keyof typeof personalityTypeAvatarMap
    ] ?? "rose";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const payload = {
        username,
        displayName,
        personalityType,
        identity,
        lookingFor,
        bio,
        promptEntries: promptEntries.filter((entry) => entry.answer.trim().length > 0),
        avatarPreset,
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
        <p className="intro">
          In Velora, the profile is the product. It needs a memorable tone,
          clear preferences, and a vibe that feels intentional.
        </p>
      </div>

      <form className="panel form-panel" onSubmit={handleSubmit}>
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
              {identityOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
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
        </label>

        <div className="picker-group">
          <span className="picker-label">Profile prompts</span>
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
                </label>
              </div>
            ))}
          </div>
        </div>

        <div className="picker-group">
          <span className="picker-label">Profile picture</span>
          <div className="chip-row">
            <ProfileAvatar
              personalityType={personalityType}
              identity={identity}
              size="large"
            />
            <span className="chip">
              {personalityTypeIcons[
                personalityType as keyof typeof personalityTypeIcons
              ]} {avatarPreset}
            </span>
          </div>
          <p className="status-message">
            Your profile picture is assigned automatically from your personality type.
          </p>
        </div>

        <div className="picker-group">
          <span className="picker-label">Vibe tags</span>
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
          <span className="picker-label">Profile preferences</span>
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

        {error ? <p className="form-error">{error}</p> : null}

        <button className="primary-button" type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? "Saving profile..."
            : mode === "edit"
              ? "Save profile"
              : "Create profile"}
        </button>
      </form>
    </section>
  );
}
