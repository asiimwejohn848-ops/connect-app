"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { createClient } from "@/utils/supabase/client";

type Profile = {
  username: string | null;
  display_name: string | null;
  bio: string | null;
};

export default function ProfileForm({ initialProfile }: { initialProfile: Profile }) {
  const [displayName, setDisplayName] = useState(initialProfile.display_name ?? "");
  const [username, setUsername] = useState(initialProfile.username ?? "");
  const [bio, setBio] = useState(initialProfile.bio ?? "");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [isError, setIsError] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsError(false);

    const cleanUsername = username.trim().toLowerCase();
    const cleanName = displayName.trim();
    const cleanBio = bio.trim();

    if (!cleanName || cleanName.length > 60) {
      setIsError(true);
      setMessage("Display name is required and must be 60 characters or fewer.");
      return;
    }
    if (cleanUsername && !/^[a-z0-9_]{3,24}$/.test(cleanUsername)) {
      setIsError(true);
      setMessage("Username must be 3–24 characters using lowercase letters, numbers or underscores.");
      return;
    }
    if (cleanBio.length > 160) {
      setIsError(true);
      setMessage("Bio must be 160 characters or fewer.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setSaving(false);
      setIsError(true);
      setMessage("Your session has expired. Please sign in again.");
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: cleanName,
        username: cleanUsername || null,
        bio: cleanBio || null,
      })
      .eq("id", user.id);

    setSaving(false);
    if (error) {
      setIsError(true);
      setMessage(error.code === "23505" ? "That username is already taken. Please choose another." : error.message);
      return;
    }

    setMessage("Your profile has been saved.");
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="displayName">Display name</label>
        <input id="displayName" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={60} required placeholder="Your name" />
      </div>
      <div className="field">
        <label htmlFor="username">Username</label>
        <input id="username" value={username} onChange={(event) => setUsername(event.target.value.toLowerCase())} maxLength={24} minLength={3} pattern="[a-z0-9_]{3,24}" placeholder="e.g. john_asiimwe" />
        <small className="muted">Optional for now. 3–24 lowercase letters, numbers or underscores.</small>
      </div>
      <div className="field">
        <label htmlFor="bio">About you</label>
        <textarea id="bio" value={bio} onChange={(event) => setBio(event.target.value)} maxLength={160} rows={4} placeholder="Write a short introduction (up to 160 characters)." />
        <small className="muted">{bio.length}/160 characters</small>
      </div>
      {message && <p className="notice" role="status" aria-live="polite" style={isError ? { borderColor: "#9b4b68", background: "#351b28" } : undefined}>{message}</p>}
      <button className="button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save profile"}</button>
    </form>
  );
}
