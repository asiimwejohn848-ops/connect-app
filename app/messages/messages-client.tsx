"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type ContactRequest = {
  id: string;
  sender_id: string;
  recipient_id: string;
  status: "accepted";
};
type Profile = { id: string; username: string | null; display_name: string | null };
type Message = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

export default function MessagesClient({ userId }: { userId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [contacts, setContacts] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState(false);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    const { data: rows, error } = await supabase
      .from("contact_requests")
      .select("id, sender_id, recipient_id, status")
      .eq("status", "accepted")
      .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`);
    if (error) {
      setProblem(true);
      setNotice(error.message);
      setLoading(false);
      return;
    }
    const ids = [...new Set((rows ?? []).map((row: ContactRequest) => row.sender_id === userId ? row.recipient_id : row.sender_id))];
    if (!ids.length) {
      setContacts([]);
      setLoading(false);
      return;
    }
    const { data: people, error: peopleError } = await supabase
      .from("profiles")
      .select("id, username, display_name")
      .in("id", ids);
    if (peopleError) {
      setProblem(true);
      setNotice(peopleError.message);
    } else {
      setContacts((people ?? []) as Profile[]);
    }
    setLoading(false);
  }, [supabase, userId]);

  const loadMessages = useCallback(async (person: Profile) => {
    const { data, error } = await supabase
      .from("messages")
      .select("id, sender_id, recipient_id, body, created_at, read_at")
      .or(`and(sender_id.eq.${userId},recipient_id.eq.${person.id}),and(sender_id.eq.${person.id},recipient_id.eq.${userId})`)
      .order("created_at", { ascending: true });
    if (error) {
      setProblem(true);
      setNotice(error.message);
      return;
    }
    const rows = (data ?? []) as Message[];
    setMessages(rows);
    const unreadIds = rows.filter((m) => m.recipient_id === userId && m.read_at === null).map((m) => m.id);
    if (unreadIds.length) {
      const readAt = new Date().toISOString();
      const { error: readError } = await supabase
        .from("messages")
        .update({ read_at: readAt })
        .in("id", unreadIds);
      if (!readError) {
        setMessages((current) => current.map((m) => unreadIds.includes(m.id) ? { ...m, read_at: readAt } : m));
      }
    }
  }, [supabase, userId]);

  useEffect(() => { void loadContacts(); }, [loadContacts]);
  useEffect(() => {
    if (selected) void loadMessages(selected);
    else setMessages([]);
  }, [selected, loadMessages]);

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !draft.trim()) return;
    setSending(true);
    setNotice("");
    setProblem(false);
    const body = draft.trim();
    const { error } = await supabase.from("messages").insert({
      sender_id: userId,
      recipient_id: selected.id,
      body,
    });
    setSending(false);
    if (error) {
      setProblem(true);
      setNotice(error.message);
      return;
    }
    setDraft("");
    await loadMessages(selected);
  }

  function displayName(person: Profile) {
    return person.display_name || (person.username ? `@${person.username}` : "CONNECT member");
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(190px, 0.75fr) minmax(0, 1.6fr)", gap: 16, marginTop: 24 }}>
      <aside className="panel">
        <h2 style={{ marginTop: 0 }}>Conversations</h2>
        {loading ? <p className="muted">Loading contacts…</p> : contacts.length === 0 ? (
          <p className="muted">You don't have accepted contacts yet. When someone accepts your contact request, they will appear here.</p>
        ) : contacts.map((person) => (
          <button key={person.id} type="button" onClick={() => { setSelected(person); setNotice(""); setProblem(false); }}
            className={selected?.id === person.id ? "button" : "button secondary"}
            style={{ display: "block", width: "100%", textAlign: "left", marginTop: 8 }}>
            {displayName(person)}
          </button>
        ))}
      </aside>

      <section className="panel" style={{ minHeight: 420, display: "flex", flexDirection: "column" }}>
        {selected ? (
          <>
            <div style={{ borderBottom: "1px solid var(--line)", paddingBottom: 12 }}>
              <h2 style={{ margin: 0 }}>{displayName(selected)}</h2>
              {selected.username && <span className="muted">@{selected.username}</span>}
              <button className="button secondary" type="button" onClick={() => void loadMessages(selected)} style={{ marginTop: 10 }}>Refresh conversation</button>
            </div>
            <div aria-live="polite" style={{ flex: 1, display: "grid", alignContent: "start", gap: 10, padding: "16px 0", maxHeight: 420, overflowY: "auto" }}>
              {messages.length === 0 ? <p className="muted">No messages yet. Start the conversation.</p> : messages.map((message) => {
                const mine = message.sender_id === userId;
                return (
                  <div key={message.id} style={{ justifySelf: mine ? "end" : "start", maxWidth: "85%", background: mine ? "#382451" : "#211b2b", border: "1px solid var(--line)", borderRadius: 14, padding: "10px 13px" }}>
                    <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{message.body}</div>
                    <div className="muted" style={{ fontSize: ".72rem", marginTop: 6 }}>
                      {new Date(message.created_at).toLocaleString()}
                      {mine && message.read_at ? " · Read" : ""}
                    </div>
                  </div>
                );
              })}
            </div>
            <form onSubmit={sendMessage} style={{ display: "flex", gap: 8, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
              <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={5000}
                placeholder="Write a message…" aria-label="Write a message"
                style={{ flex: 1, minWidth: 0, padding: 12, borderRadius: 10, border: "1px solid var(--line)", background: "#0f0c16", color: "white" }} />
              <button className="button" type="submit" disabled={sending || !draft.trim()}>{sending ? "Sending…" : "Send"}</button>
            </form>
          </>
        ) : (
          <div style={{ margin: "auto", textAlign: "center" }}>
            <h2>Private messages</h2>
            <p className="muted">Choose an accepted contact to open a conversation.</p>
          </div>
        )}
      </section>
      {notice && <p className="notice" role="status" style={{ gridColumn: "1 / -1", borderColor: problem ? "#9b4b68" : undefined }}>{notice}</p>}
      <style jsx>{`
        @media (max-width: 640px) {
          div[style*="grid-template-columns"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
