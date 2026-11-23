"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  edited_at: string | null;
  reply_to_id: string | null;
  voice_path: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_mime: string | null;
  attachment_size: number | null;
};

export default function MessagesClient({ userId }: { userId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [contacts, setContacts] = useState<Profile[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [messageSearch, setMessageSearch] = useState("");
  const [selected, setSelected] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [recording, setRecording] = useState(false);
  const [voiceUrls, setVoiceUrls] = useState<Record<string, string>>({});
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
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
      .select("id, sender_id, recipient_id, body, created_at, read_at, edited_at, reply_to_id, voice_path, attachment_path, attachment_name, attachment_mime, attachment_size")
      .or(`and(sender_id.eq.${userId},recipient_id.eq.${person.id}),and(sender_id.eq.${person.id},recipient_id.eq.${userId})`)
      .order("created_at", { ascending: true });
    if (error) {
      setProblem(true);
      setNotice(error.message);
      return;
    }
    const rows = (data ?? []) as Message[];
    setMessages(rows);
    const paths = rows.filter((message) => message.voice_path).map((message) => message.voice_path as string);
    const signedEntries = await Promise.all(paths.map(async (path) => {
      const { data: signed } = await supabase.storage.from("connect-voice-messages").createSignedUrl(path, 3600);
      return signed?.signedUrl ? [path, signed.signedUrl] as const : null;
    }));
    const urls: Record<string, string> = {};
    signedEntries.forEach((entry) => { if (entry) urls[entry[0]] = entry[1]; });
    setVoiceUrls(urls);
    const attachmentPaths = rows.filter((message) => message.attachment_path).map((message) => message.attachment_path as string);
    const attachmentEntries = await Promise.all(attachmentPaths.map(async (path) => {
      const { data: signed } = await supabase.storage.from("connect-message-attachments").createSignedUrl(path, 3600);
      return signed?.signedUrl ? [path, signed.signedUrl] as const : null;
    }));
    const attachmentLinks: Record<string, string> = {};
    attachmentEntries.forEach((entry) => { if (entry) attachmentLinks[entry[0]] = entry[1]; });
    setAttachmentUrls(attachmentLinks);
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
  useEffect(() => () => {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);
  useEffect(() => {
    if (selected) void loadMessages(selected);
    else setMessages([]);
  }, [selected, loadMessages]);

  // Keep the open conversation synchronized when either participant changes a message.
  useEffect(() => {
    if (!selected) return;
    const channel = supabase
      .channel(`connect-messages-${[userId, selected.id].sort().join("-")}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => { void loadMessages(selected); }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [selected, supabase, userId, loadMessages]);

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
      reply_to_id: replyingTo?.id ?? null,
    });
    setSending(false);
    if (error) {
      setProblem(true);
      setNotice(error.message);
      return;
    }
    setDraft("");
    setReplyingTo(null);
    await loadMessages(selected);
  }

  async function recordVoiceMessage() {
    if (!selected) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setProblem(true);
      setNotice("Voice recording is not supported by this browser. Please use a recent version of Chrome.");
      return;
    }
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg", "audio/mp4"]
        .find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setRecording(false);
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (!blob.size) {
          setNotice("No audio was recorded. Please try again.");
          return;
        }
        if (blob.size > 20 * 1024 * 1024) {
          setProblem(true);
          setNotice("That recording is too large. Please record a shorter voice message.");
          return;
        }
        setSending(true);
        setNotice("Uploading voice message…");
        setProblem(false);
        const extension = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "mp4" : "webm";
        const filePath = `${userId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("connect-voice-messages")
          .upload(filePath, blob, { contentType: blob.type, upsert: false });
        if (uploadError) {
          setSending(false);
          setProblem(true);
          setNotice(uploadError.message);
          return;
        }
        const { error: insertError } = await supabase.from("messages").insert({
          sender_id: userId,
          recipient_id: selected.id,
          body: "Voice message",
          voice_path: filePath,
          reply_to_id: replyingTo?.id ?? null,
        });
        if (insertError) {
          await supabase.storage.from("connect-voice-messages").remove([filePath]);
          setSending(false);
          setProblem(true);
          setNotice(insertError.message);
          return;
        }
        setSending(false);
        setReplyingTo(null);
        setNotice("Voice message sent.");
        await loadMessages(selected);
      };
      recorder.start();
      setRecording(true);
      setNotice("Recording… press Stop recording when you're finished.");
      setProblem(false);
    } catch (error) {
      setProblem(true);
      setNotice(error instanceof Error ? error.message : "Could not access the microphone. Check your browser permissions.");
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }

  async function sendAttachment(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !selected) return;
    const allowedTypes = new Set([
      "image/jpeg", "image/png", "image/webp", "image/gif",
      "application/pdf", "text/plain", "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ]);
    if (!allowedTypes.has(file.type)) {
      setProblem(true);
      setNotice("This file type is not supported. Choose an image, PDF, Word, Excel, PowerPoint or text file.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setProblem(true);
      setNotice("Files must be 20 MB or smaller.");
      return;
    }
    setSending(true);
    setProblem(false);
    setNotice("Uploading attachment…");
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "attachment";
    const filePath = `${userId}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("connect-message-attachments")
      .upload(filePath, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      setSending(false);
      setProblem(true);
      setNotice(uploadError.message);
      return;
    }
    const { error: insertError } = await supabase.from("messages").insert({
      sender_id: userId,
      recipient_id: selected.id,
      body: file.name.slice(0, 5000),
      attachment_path: filePath,
      attachment_name: file.name,
      attachment_mime: file.type,
      attachment_size: file.size,
      reply_to_id: replyingTo?.id ?? null,
    });
    if (insertError) {
      await supabase.storage.from("connect-message-attachments").remove([filePath]);
      setSending(false);
      setProblem(true);
      setNotice(insertError.message);
      return;
    }
    setSending(false);
    setReplyingTo(null);
    setNotice("Attachment sent.");
    await loadMessages(selected);
  }

  async function saveEdit(message: Message) {
    const body = editDraft.trim();
    if (!body) {
      setNotice("A message cannot be empty.");
      setProblem(true);
      return;
    }
    const { error } = await supabase.from("messages")
      .update({ body })
      .eq("id", message.id);
    if (error) {
      setProblem(true);
      setNotice(error.message);
      return;
    }
    setEditingId(null);
    setEditDraft("");
    setNotice("Message updated.");
    setProblem(false);
    if (selected) await loadMessages(selected);
  }

  async function deleteMessage(message: Message) {
    if (!window.confirm("Delete this message? This cannot be undone.")) return;
    const { error } = await supabase.from("messages").delete().eq("id", message.id);
    if (error) {
      setProblem(true);
      setNotice(error.message);
      return;
    }
    setMessages((current) => current.filter((item) => item.id !== message.id));
    const storedPaths = [message.voice_path, message.attachment_path].filter((path): path is string => Boolean(path));
    if (storedPaths.length) {
      if (message.voice_path) await supabase.storage.from("connect-voice-messages").remove([message.voice_path]);
      if (message.attachment_path) await supabase.storage.from("connect-message-attachments").remove([message.attachment_path]);
    }
    setNotice("Message deleted.");
    setProblem(false);
  }

  function displayName(person: Profile) {
    return person.display_name || (person.username ? `@${person.username}` : "CONNECT member");
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(190px, 0.75fr) minmax(0, 1.6fr)", gap: 16, marginTop: 24 }}>
      <aside className="panel">
        <h2 style={{ marginTop: 0 }}>Conversations</h2>
        <input value={contactSearch} onChange={(event) => setContactSearch(event.target.value)}
          placeholder="Search contacts…" aria-label="Search contacts"
          style={{ width: "100%", boxSizing: "border-box", margin: "4px 0 10px", padding: 10, borderRadius: 9, border: "1px solid var(--line)", background: "#0f0c16", color: "white" }} />
        {loading ? <p className="muted">Loading contacts…</p> : contacts.length === 0 ? (
          <p className="muted">You don't have accepted contacts yet. When someone accepts your contact request, they will appear here.</p>
        ) : contacts.filter((person) => displayName(person).toLowerCase().includes(contactSearch.trim().toLowerCase())).length === 0 ? (
          <p className="muted">No contacts match that search.</p>
        ) : contacts.filter((person) => displayName(person).toLowerCase().includes(contactSearch.trim().toLowerCase())).map((person) => (
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
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                <button className="button secondary" type="button" onClick={() => void loadMessages(selected)}>Refresh conversation</button>
                <input value={messageSearch} onChange={(event) => setMessageSearch(event.target.value)}
                  placeholder="Search messages in this chat…" aria-label="Search messages in this conversation"
                  style={{ flex: 1, minWidth: 160, padding: 9, borderRadius: 9, border: "1px solid var(--line)", background: "#0f0c16", color: "white" }} />
              </div>
              {messageSearch.trim() && <p className="muted" style={{ fontSize: ".78rem", margin: "6px 0 0" }}>
                {messages.filter((message) => message.body.toLowerCase().includes(messageSearch.trim().toLowerCase())).length} matching messages
              </p>}
            </div>
            <div aria-live="polite" style={{ flex: 1, display: "grid", alignContent: "start", gap: 10, padding: "16px 0", maxHeight: 420, overflowY: "auto" }}>
              {messages.filter((message) => message.body.toLowerCase().includes(messageSearch.trim().toLowerCase())).length === 0 ? (
                <p className="muted">{messageSearch.trim() ? "No messages match that search." : "No messages yet. Start the conversation."}</p>
              ) : messages.filter((message) => message.body.toLowerCase().includes(messageSearch.trim().toLowerCase())).map((message) => {
                const mine = message.sender_id === userId;
                const canEdit = mine && !message.read_at;
                const repliedMessage = message.reply_to_id ? messages.find((item) => item.id === message.reply_to_id) : null;
                return (
                  <div key={message.id} style={{ justifySelf: mine ? "end" : "start", maxWidth: "85%", minWidth: 120, background: mine ? "#382451" : "#211b2b", border: "1px solid var(--line)", borderRadius: 14, padding: "10px 13px" }}>
                    {repliedMessage && <div style={{ borderLeft: "3px solid #b58ae8", paddingLeft: 8, marginBottom: 8, opacity: .85, fontSize: ".82rem" }}><strong>{repliedMessage.sender_id === userId ? "You" : displayName(selected)}</strong><div style={{ whiteSpace: "pre-wrap", overflow: "hidden", textOverflow: "ellipsis" }}>{repliedMessage.body}</div></div>}
                    {message.reply_to_id && !repliedMessage && <div className="muted" style={{ fontSize: ".8rem", marginBottom: 6 }}>Reply to an unavailable message</div>}
                    {message.voice_path ? (
                      voiceUrls[message.voice_path] ? (
                        <audio controls preload="none" src={voiceUrls[message.voice_path]} style={{ display: "block", maxWidth: "100%" }} />
                      ) : <span className="muted">Loading voice message…</span>
                    ) : null}
                    {message.attachment_path && (
                      attachmentUrls[message.attachment_path] ? (
                        <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                          {message.attachment_mime?.startsWith("image/") && (
                            <a href={attachmentUrls[message.attachment_path]} target="_blank" rel="noreferrer">
                              <img src={attachmentUrls[message.attachment_path]} alt={message.attachment_name || "Shared image"} style={{ display: "block", maxWidth: "100%", maxHeight: 280, objectFit: "contain", borderRadius: 8 }} />
                            </a>
                          )}
                          <a href={attachmentUrls[message.attachment_path]} target="_blank" rel="noreferrer" download={message.attachment_name || true}>
                            {message.attachment_name || "Open attachment"}
                          </a>
                          <span className="muted" style={{ fontSize: ".75rem" }}>
                            {message.attachment_size ? `${(message.attachment_size / (1024 * 1024)).toFixed(2)} MB` : "Attachment"}
                          </span>
                        </div>
                      ) : <span className="muted">Loading attachment…</span>
                    )}
                    {editingId === message.id ? (
                      <div style={{ display: "grid", gap: 8 }}>
                        <textarea value={editDraft} onChange={(event) => setEditDraft(event.target.value)} maxLength={5000} rows={3}
                          aria-label="Edit message" style={{ width: "100%", boxSizing: "border-box", padding: 8, borderRadius: 8, background: "#0f0c16", color: "white", border: "1px solid var(--line)" }} />
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button type="button" className="button" onClick={() => void saveEdit(message)}>Save</button>
                          <button type="button" className="button secondary" onClick={() => { setEditingId(null); setEditDraft(""); }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{message.body}</div>
                        <div className="muted" style={{ fontSize: ".72rem", marginTop: 6 }}>
                          {new Date(message.created_at).toLocaleString()}
                          {message.edited_at ? " · Edited" : ""}
                          {mine && message.read_at ? " · Read" : ""}
                        </div>
                        {mine && (
                          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                            <button type="button" className="button secondary" onClick={() => { setReplyingTo(message); setEditingId(null); }}>Reply</button>
                            {canEdit && <button type="button" className="button secondary" onClick={() => { setEditingId(message.id); setEditDraft(message.body); }}>Edit</button>}
                            <button type="button" className="button secondary" onClick={() => void deleteMessage(message)}>Delete</button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <form onSubmit={sendMessage} style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
              {replyingTo && <div style={{ display: "flex", justifyContent: "space-between", gap: 8, background: "#211b2b", borderLeft: "3px solid #b58ae8", padding: 8, borderRadius: 8 }}><div><strong>Replying to {replyingTo.sender_id === userId ? "your message" : displayName(selected)}</strong><div className="muted">{replyingTo.body.slice(0, 120)}</div></div><button type="button" className="button secondary" onClick={() => setReplyingTo(null)}>Cancel</button></div>}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                onChange={(event) => void sendAttachment(event)}
                style={{ display: "none" }}
                aria-label="Choose an image or document"
              />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={5000}
                placeholder="Write a message…" aria-label="Write a message"
                style={{ flex: 1, minWidth: 0, padding: 12, borderRadius: 10, border: "1px solid var(--line)", background: "#0f0c16", color: "white" }} />
              <button className="button" type="submit" disabled={sending || !draft.trim()}>{sending ? "Sending…" : "Send"}</button>
              <button className="button secondary" type="button" onClick={() => fileInputRef.current?.click()} disabled={sending}>
                Attach file
              </button>
              <button className="button secondary" type="button" onClick={() => void recordVoiceMessage()} disabled={sending}>
                {recording ? "Stop recording" : "Record voice"}
              </button>
              </div>
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
