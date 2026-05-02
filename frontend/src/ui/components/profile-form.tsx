import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { avatarOptions, boundaryOptions, vibeOptions } from "../../config";
import { createProfile } from "../../lib/api";

function toggleItem(items: string[], item: string) {
  return items.includes(item)
    ? items.filter((entry) => entry !== item)
    : [...items, item];
}

export function ProfileForm() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarPreset, setAvatarPreset] = useState<string>(avatarOptions[0]);
  const [vibeTags, setVibeTags] = useState<string[]>(["sweet"]);
  const [boundaries, setBoundaries] = useState<string[]>(["no off-app contact"]);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await createProfile({
        username,
        displayName,
        bio,
        avatarPreset,
        vibeTags,
        boundaries,
      });
      navigate("/browse");
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to create profile.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="content-section">
      <div className="section-copy">
        <p className="eyebrow">Profile setup</p>
        <h1>Create a profile people will want to return to.</h1>
        <p className="intro">
          In Velora, the profile is the product. It needs a memorable tone,
          clear boundaries, and a vibe that feels intentional.
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

        <label className="field">
          <span>Avatar preset</span>
          <select
            value={avatarPreset}
            onChange={(event) => setAvatarPreset(event.target.value)}
          >
            {avatarOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

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
          <span className="picker-label">Boundaries</span>
          <div className="tag-grid">
            {boundaryOptions.map((option) => {
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
          {isSubmitting ? "Saving profile..." : "Create profile"}
        </button>
      </form>
    </section>
  );
}
