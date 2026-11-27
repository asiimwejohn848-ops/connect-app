"use client";

import { useRef, useState } from "react";
import type { FormEvent, ChangeEvent } from "react";
import { createClient } from "@/utils/supabase/client";

type Profile = {
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url?: string | null;
  team_role?: string | null;
  current_activity?: string | null;
  availability_status?: "available" | "busy" | "away" | "offline" | null;
};

export default function ProfileForm({ initialProfile }: { initialProfile: Profile }) {
  const [displayName, setDisplayName] = useState(initialProfile.display_name ?? "");
  const [username, setUsername] = useState(initialProfile.username ?? "");
  const [bio, setBio] = useState(initialProfile.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initialProfile.avatar_url ?? "");
  const [teamRole, setTeamRole] = useState(initialProfile.team_role ?? "");
  const [currentActivity, setCurrentActivity] = useState(initialProfile.current_activity ?? "");
  const [availability, setAvailability] = useState(initialProfile.availability_status ?? "available");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isError, setIsError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setIsError(true);
      setMessage("Choose a JPG, PNG or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setIsError(true);
      setMessage("Profile photos must be 5 MB or smaller.");
      return;
    }
    setUploading(true);
    setIsError(false);
    setMessage("Uploading profile photo…");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setUploading(false);
      setIsError(true);
      setMessage("Your session has expired. Please sign in again.");
      return;
    }
    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${user.id}/avatar.${extension}`;
    const { error: uploadError } = await supabase.storage.from("connect-avatars")
      .upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
    if (uploadError) {
      setUploading(false);
      setIsError(true);
      setMessage(uploadError.message);
      return;
    }
    const { data } = supabase.storage.from("connect-avatars").getPublicUrl(path);
    setAvatarUrl(data.publicUrl);
    const { error: updateError } = await supabase.from("profiles")
      .update({ avatar_url: data.publicUrl })
      .eq("id", user.id);
    setUploading(false);
    if (updateError) {
      setIsError(true);
      setMessage(updateError.message);
      return;
    }
    setMessage("Profile photo updated.");
  }

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
    if (teamRole.trim().length > 80 || currentActivity.trim().length > 120) {
      setIsError(true);
      setMessage("Team role must be 80 characters or fewer and current activity 120 characters or fewer.");
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
    const { error } = await supabase.from("profiles")
      .update({ display_name: cleanName, username: cleanUsername || null, bio: cleanBio || null, team_role: teamRole.trim(), current_activity: currentActivity.trim(), availability_status: availability })
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
        <label>Profile photo</label>
        <div style={{ display: "flex", alignItems: "center", gap: 16, margin: "8px 0 14px" }}>
          {avatarUrl ? <img src={avatarUrl} alt="Your profile" style={{ width: 84, height: 84, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--accent)" }} /> :
            <div aria-label="No profile photo" style={{ width: 84, height: 84, borderRadius: "50%", display: "grid", placeItems: "center", background: "#30243f", color: "#d8c0f5", fontSize: 28, fontWeight: 800 }}>{(displayName.trim()[0] || "?").toUpperCase()}</div>}
          <div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAvatar} style={{ display: "none" }} />
            <button type="button" className="button secondary" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? "Uploading…" : "Change photo"}</button>
            <p className="muted" style={{ fontSize: ".8rem", marginBottom: 0 }}>JPG, PNG or WebP · Up to 5 MB</p>
          </div>
        </div>
      </div>
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
        <label htmlFor="teamRole">Team role (optional)</label>
        <input id="teamRole" value={teamRole} onChange={(event) => setTeamRole(event.target.value)} maxLength={80} placeholder="e.g. Project lead, designer, researcher" />
      </div>
      <div className="field">
        <label htmlFor="currentActivity">What are you working on? (optional)</label>
        <input id="currentActivity" value={currentActivity} onChange={(event) => setCurrentActivity(event.target.value)} maxLength={120} placeholder="A short note about your current work" />
      </div>
      <div className="field">
        <label htmlFor="availability">Your availability</label>
        <select id="availability" value={availability} onChange={(event) => setAvailability(event.target.value as "available" | "busy" | "away" | "offline")}>
          <option value="available">Available</option>
          <option value="busy">Busy</option>
          <option value="away">Away</option>
          <option value="offline">Appear offline</option>
        </select>
        <small className="muted">You control what other signed-in CONNECT members can see.</small>
      </div>
      <div className="field">
        <label htmlFor="bio">About you</label>
        <textarea id="bio" value={bio} onChange={(event) => setBio(event.target.value)} maxLength={160} rows={4} placeholder="Write a short introduction (up to 160 characters)." />
        <small className="muted">{bio.length}/160 characters</small>
      </div>
      {message && <p className="notice" role="status" aria-live="polite" style={isError ? { borderColor: "#9b4b68", background: "#351b28" } : undefined}>{message}</p>}
      <button className="button" type="submit" disabled={saving || uploading}>{saving ? "Saving…" : "Save profile"}</button>
    </form>
  );
}
