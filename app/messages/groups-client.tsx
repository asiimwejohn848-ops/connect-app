"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type Person = { id: string; username: string | null; display_name: string | null; avatar_url?: string | null };
type Group = { id: string; name: string; created_by: string; created_at: string };
type GroupMessage = { id: string; group_id: string; sender_id: string; body: string; created_at: string };
type Member = { group_id: string; user_id: string; role: "admin" | "member" };

export default function GroupsClient({ userId }: { userId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [contacts, setContacts] = useState<Person[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selected, setSelected] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [groupName, setGroupName] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState(false);

  const loadGroups = useCallback(async () => {
    const { data: memberships, error: memberError } = await supabase
      .from("group_members").select("group_id").eq("user_id", userId);
    if (memberError) { setProblem(true); setNotice(memberError.message); return; }
    const ids = (memberships ?? []).map((row: { group_id: string }) => row.group_id);
    if (!ids.length) { setGroups([]); return; }
    const { data, error } = await supabase.from("group_conversations")
      .select("id, name, created_by, created_at").in("id", ids).order("created_at", { ascending: false });
    if (error) { setProblem(true); setNotice(error.message); return; }
    setGroups((data ?? []) as Group[]);
  }, [supabase, userId]);

  const loadSelected = useCallback(async (group: Group) => {
    const [messageResult, memberResult] = await Promise.all([
      supabase.from("group_messages").select("id, group_id, sender_id, body, created_at")
        .eq("group_id", group.id).order("created_at", { ascending: true }),
      supabase.from("group_members").select("group_id, user_id, role").eq("group_id", group.id),
    ]);
    if (messageResult.error || memberResult.error) {
      setProblem(true); setNotice(messageResult.error?.message ?? memberResult.error?.message ?? "Could not load group.");
      return;
    }
    setMessages((messageResult.data ?? []) as GroupMessage[]);
    const rows = (memberResult.data ?? []) as Member[];
    setMembers(rows);
    const ids = [...new Set(rows.map((row) => row.user_id))];
    if (ids.length) {
      const { data: people } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids);
      const map: Record<string, string> = {};
      const photoMap: Record<string, string> = {};
      (people ?? []).forEach((person: Person) => {
        map[person.id] = person.display_name || (person.username ? "@" + person.username : "CONNECT member");
        if (person.avatar_url) photoMap[person.id] = person.avatar_url;
      });
      setNames(map);
      setAvatars(photoMap);
    }
  }, [supabase]);

  useEffect(() => {
    void loadGroups();
    void (async () => {
      const { data: requests, error } = await supabase.from("contact_requests")
        .select("sender_id, recipient_id").eq("status", "accepted")
        .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`);
      if (error) { setProblem(true); setNotice(error.message); return; }
      const ids = [...new Set((requests ?? []).map((row) => row.sender_id === userId ? row.recipient_id : row.sender_id))];
      if (!ids.length) { setContacts([]); return; }
      const { data: people, error: peopleError } = await supabase.from("profiles")
        .select("id, username, display_name").in("id", ids);
      if (peopleError) { setProblem(true); setNotice(peopleError.message); return; }
      setContacts((people ?? []) as Person[]);
    })();
  }, [loadGroups, supabase, userId]);

  useEffect(() => {
    if (!selected) { setMessages([]); setMembers([]); return; }
    void loadSelected(selected);
    const channel = supabase.channel("connect-group-" + selected.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "group_messages", filter: "group_id=eq." + selected.id },
        () => { void loadSelected(selected); })
      .on("postgres_changes", { event: "*", schema: "public", table: "group_members", filter: "group_id=eq." + selected.id },
        () => { void loadSelected(selected); void loadGroups(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [selected, supabase, loadSelected, loadGroups]);

  async function createGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = groupName.trim();
    if (cleanName.length < 2) { setProblem(true); setNotice("Group names must contain at least 2 characters."); return; }
    if (!chosen.length) { setProblem(true); setNotice("Choose at least one accepted contact to create a group."); return; }
    setBusy(true); setProblem(false); setNotice("");
    const { data: group, error } = await supabase.from("group_conversations")
      .insert({ name: cleanName, created_by: userId })
      .select("id, name, created_by, created_at").single();
    if (error || !group) { setBusy(false); setProblem(true); setNotice(error?.message ?? "Could not create group."); return; }
    const { error: addError } = await supabase.from("group_members")
      .insert(chosen.map((id) => ({ group_id: group.id, user_id: id, role: "member" })));
    setBusy(false);
    if (addError) { setProblem(true); setNotice("Group was created, but adding members failed: " + addError.message); await loadGroups(); return; }
    setGroupName(""); setChosen([]);
    await loadGroups(); setSelected(group as Group); setNotice("Group created and members added.");
  }

  async function sendGroupMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !draft.trim()) return;
    setBusy(true); setProblem(false); setNotice("");
    const { error } = await supabase.from("group_messages").insert({
      group_id: selected.id, sender_id: userId, body: draft.trim(),
    });
    setBusy(false);
    if (error) { setProblem(true); setNotice(error.message); return; }
    setDraft("");
    await loadSelected(selected);
  }

  async function leaveGroup() {
    if (!selected) return;
    if (!window.confirm("Leave this group? You will no longer see its messages.")) return;
    setBusy(true);
    const { error } = await supabase.from("group_members").delete()
      .eq("group_id", selected.id).eq("user_id", userId);
    setBusy(false);
    if (error) { setProblem(true); setNotice(error.message); return; }
    setSelected(null); await loadGroups(); setNotice("You left the group.");
  }

  const isAdmin = members.some((member) => member.user_id === userId && member.role === "admin");

  return (
    <section className="panel" style={{ marginTop: 20 }}>
      <h2 style={{ marginTop: 0 }}>Group conversations</h2>
      <p className="muted">Create a group with accepted contacts, share messages, and manage membership.</p>
      <form onSubmit={createGroup} style={{ display: "grid", gap: 10, marginBottom: 18 }}>
        <input value={groupName} onChange={(event) => setGroupName(event.target.value)} maxLength={80}
          placeholder="New group name" aria-label="New group name"
          style={{ width: "100%", boxSizing: "border-box", padding: 11, borderRadius: 9, border: "1px solid var(--line)", background: "#0f0c16", color: "white" }} />
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {contacts.length === 0 ? <span className="muted">Add and accept contacts before creating a group.</span> : contacts.map((person) => (
            <label key={person.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={chosen.includes(person.id)}
                onChange={(event) => setChosen((current) => event.target.checked ? [...current, person.id] : current.filter((id) => id !== person.id))} />
              {person.display_name || (person.username ? "@" + person.username : "CONNECT member")}
            </label>
          ))}
        </div>
        <button className="button" type="submit" disabled={busy || contacts.length === 0}>{busy ? "Working…" : "Create group"}</button>
      </form>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(150px, .7fr) minmax(0, 1.5fr)", gap: 14 }}>
        <aside>
          <strong>Your groups</strong>
          {groups.length === 0 ? <p className="muted">No groups yet.</p> : groups.map((group) => (
            <button key={group.id} type="button" className={selected?.id === group.id ? "button" : "button secondary"}
              onClick={() => { setSelected(group); setNotice(""); setProblem(false); }}
              style={{ display: "block", width: "100%", textAlign: "left", marginTop: 8 }}>{group.name}</button>
          ))}
        </aside>
        <div style={{ minWidth: 0, border: "1px solid var(--line)", borderRadius: 10, padding: 12, minHeight: 220 }}>
          {selected ? <>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", borderBottom: "1px solid var(--line)", paddingBottom: 10 }}>
              <div><strong>{selected.name}</strong><div className="muted" style={{ fontSize: ".8rem" }}>{members.length} members · {isAdmin ? "Admin" : "Member"}</div>
                <div className="muted" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: ".78rem", marginTop: 6 }}>{members.map((m) => <span key={m.user_id} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 24, height: 24, borderRadius: "50%", overflow: "hidden", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "#382451", flexShrink: 0 }}>{avatars[m.user_id] ? <img src={avatars[m.user_id]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (names[m.user_id] || "C").slice(0, 1).toUpperCase()}</span>{names[m.user_id] || "CONNECT member"}</span>)}</div>
              </div>
              <button className="button secondary" type="button" onClick={() => void leaveGroup()} disabled={busy}>Leave group</button>
            </div>
            {isAdmin && contacts.filter((person) => !members.some((member) => member.user_id === person.id)).length > 0 && (
              <div style={{ marginTop: 10 }}>
                <label className="muted" htmlFor="add-group-member">Add an accepted contact</label>
                <select id="add-group-member" defaultValue="" disabled={busy}
                  onChange={async (event) => {
                    const id = event.target.value; if (!id || !selected) return;
                    setBusy(true);
                    const { error } = await supabase.from("group_members").insert({ group_id: selected.id, user_id: id, role: "member" });
                    setBusy(false); event.target.value = "";
                    if (error) { setProblem(true); setNotice(error.message); } else { setNotice("Member added."); await loadSelected(selected); }
                  }}
                  style={{ display: "block", width: "100%", marginTop: 5, padding: 8, background: "#0f0c16", color: "white", border: "1px solid var(--line)", borderRadius: 8 }}>
                  <option value="">Choose contact…</option>
                  {contacts.filter((person) => !members.some((member) => member.user_id === person.id)).map((person) =>
                    <option key={person.id} value={person.id}>{person.display_name || person.username || "CONNECT member"}</option>)}
                </select>
              </div>
            )}
            <div aria-live="polite" style={{ display: "grid", gap: 8, alignContent: "start", maxHeight: 260, overflowY: "auto", padding: "12px 0" }}>
              {messages.length === 0 ? <p className="muted">No group messages yet. Say hello.</p> : messages.map((message) => (
                <div key={message.id} style={{ justifySelf: message.sender_id === userId ? "end" : "start", maxWidth: "90%", background: message.sender_id === userId ? "#382451" : "#211b2b", border: "1px solid var(--line)", borderRadius: 12, padding: "8px 11px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}><span style={{ width: 22, height: 22, borderRadius: "50%", overflow: "hidden", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "#382451", flexShrink: 0 }}>{avatars[message.sender_id] ? <img src={avatars[message.sender_id]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (names[message.sender_id] || (message.sender_id === userId ? "Y" : "C")).slice(0, 1).toUpperCase()}</span><strong style={{ fontSize: ".78rem" }}>{message.sender_id === userId ? "You" : names[message.sender_id] || "CONNECT member"}</strong></div>
                  <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{message.body}</div>
                  <div className="muted" style={{ fontSize: ".7rem", marginTop: 4 }}>{new Date(message.created_at).toLocaleString()}</div>
                </div>
              ))}
            </div>
            <form onSubmit={sendGroupMessage} style={{ display: "flex", gap: 8, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
              <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={5000}
                placeholder="Message the group…" aria-label="Message the group"
                style={{ flex: 1, minWidth: 0, padding: 10, borderRadius: 9, border: "1px solid var(--line)", background: "#0f0c16", color: "white" }} />
              <button className="button" type="submit" disabled={busy || !draft.trim()}>{busy ? "Sending…" : "Send"}</button>
            </form>
          </> : <p className="muted">Choose a group to view its messages.</p>}
        </div>
      </div>
      {notice && <p className="notice" role="status" style={{ marginBottom: 0, borderColor: problem ? "#9b4b68" : undefined }}>{notice}</p>}
      <style jsx>{`@media (max-width: 640px) { section > div[style*="grid-template-columns"] { grid-template-columns: 1fr !important; } }`}</style>
    </section>
  );
}
