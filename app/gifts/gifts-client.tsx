"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type Person = { id: string; username: string | null; display_name: string | null };
type ReceivedGift = { id: string; sender_id: string; title: string; created_at: string; expires_at: string | null; request_status: "pending" | "approved" | "declined" | null };
type SentRequest = { request_id: string; gift_message_id: string; recipient_id: string; title: string; requested_at: string; status: "pending" | "approved" | "declined" };
type OpenGift = { title: string; body: string; sender_id: string; created_at: string };

function nameOf(person?: Person) {
  return person?.display_name || (person?.username ? `@${person.username}` : "CONNECT user");
}

export default function GiftsClient({ userId }: { userId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [contacts, setContacts] = useState<Person[]>([]);
  const [people, setPeople] = useState<Record<string, Person>>({});
  const [received, setReceived] = useState<ReceivedGift[]>([]);
  const [sentRequests, setSentRequests] = useState<SentRequest[]>([]);
  const [recipientId, setRecipientId] = useState("");
  const [title, setTitle] = useState("A special gift message");
  const [body, setBody] = useState("");
  const [opened, setOpened] = useState<Record<string, OpenGift>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState(false);

  const load = useCallback(async () => {
    const { data: links } = await supabase.from("contact_requests")
      .select("sender_id, recipient_id").eq("status", "accepted")
      .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`);
    const ids = [...new Set((links ?? []).map((row: {sender_id:string;recipient_id:string}) => row.sender_id === userId ? row.recipient_id : row.sender_id))];
    if (ids.length) {
      const { data: profiles } = await supabase.from("profiles").select("id, username, display_name").in("id", ids);
      const list = (profiles ?? []) as Person[];
      setContacts(list);
      setPeople(Object.fromEntries(list.map((person) => [person.id, person])));
    } else {
      setContacts([]);
    }
    const [{ data: inbox, error: inboxError }, { data: requests, error: requestError }] = await Promise.all([
      supabase.rpc("list_received_connect_gift_messages"),
      supabase.rpc("list_sent_connect_gift_requests"),
    ]);
    if (inboxError || requestError) {
      setProblem(true);
      setNotice(inboxError?.message || requestError?.message || "Could not load Gift Messages.");
      return;
    }
    setReceived((inbox ?? []) as ReceivedGift[]);
    setSentRequests((requests ?? []) as SentRequest[]);
  }, [supabase, userId]);

  useEffect(() => { void load(); }, [load]);

  async function createGift(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setProblem(false); setNotice("");
    const { error } = await supabase.rpc("create_connect_gift_message", {
      p_recipient_id: recipientId,
      p_title: title,
      p_body: body,
      p_expires_at: null,
    });
    setBusy(false);
    if (error) { setProblem(true); setNotice(error.message); return; }
    setBody(""); setNotice("Your locked gift message has been sent."); await load();
  }

  async function requestAccess(id: string) {
    setBusy(true); setProblem(false); setNotice("");
    const { error } = await supabase.rpc("request_connect_gift_access", { p_gift_message_id: id });
    setBusy(false);
    if (error) { setProblem(true); setNotice(error.message); return; }
    setNotice("Your request has been sent to the sender."); await load();
  }

  async function respond(requestId: string, approve: boolean) {
    setBusy(true); setProblem(false); setNotice("");
    const { error } = await supabase.rpc("respond_connect_gift_access", { p_request_id: requestId, p_approve: approve });
    setBusy(false);
    if (error) { setProblem(true); setNotice(error.message); return; }
    setNotice(approve ? "Access approved. The recipient can now open the gift." : "Access declined."); await load();
  }

  async function openGift(id: string) {
    setBusy(true); setProblem(false); setNotice("");
    const { data, error } = await supabase.rpc("read_approved_connect_gift_message", { p_gift_message_id: id });
    setBusy(false);
    if (error || !data?.length) { setProblem(true); setNotice(error?.message || "This gift has not been approved."); return; }
    setOpened((current) => ({ ...current, [id]: data[0] as OpenGift }));
  }

  return (
    <div style={{ display: "grid", gap: 22 }}>
      {notice && <p className={problem ? "notice" : "notice"} role="status" style={{ borderColor: problem ? "#b45353" : undefined }}>{notice}</p>}

      <section className="panel">
        <p style={{ color: "#c8aaff", fontWeight: 800, letterSpacing: ".12em", fontSize: ".72rem" }}>CONNECT PREMIUM</p>
        <h2 style={{ marginTop: 4 }}>Send a Gift Message</h2>
        <p className="muted">Send a private message that stays locked until the recipient asks to open it and you approve their request.</p>
        <form onSubmit={createGift} style={{ display: "grid", gap: 12 }}>
          <label>Recipient
            <select required value={recipientId} onChange={(event) => setRecipientId(event.target.value)} style={{ display: "block", width: "100%", marginTop: 6, padding: 12, borderRadius: 10, background: "#171323", color: "white", border: "1px solid #514568" }}>
              <option value="">Choose an accepted contact</option>
              {contacts.map((person) => <option key={person.id} value={person.id}>{nameOf(person)}</option>)}
            </select>
          </label>
          <label>Gift title
            <input required maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} style={{ display: "block", width: "100%", marginTop: 6, padding: 12, borderRadius: 10 }} />
          </label>
          <label>Secret message
            <textarea required maxLength={5000} rows={5} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write your special message..." style={{ display: "block", width: "100%", marginTop: 6, padding: 12, borderRadius: 10, width: "100%" }} />
          </label>
          <button className="button" type="submit" disabled={busy || !recipientId || !body.trim()}>{busy ? "Please wait..." : "Send locked gift"}</button>
        </form>
        <p className="muted" style={{ fontSize: ".8rem", marginBottom: 0 }}>An active Premium subscription is checked securely by the database before a gift can be sent. Messaging remains free.</p>
      </section>

      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Gift Messages sent to you</h2>
        {received.length === 0 ? <p className="muted">No gift messages yet.</p> : received.map((gift) => (
          <article key={gift.id} style={{ borderTop: "1px solid #40354f", padding: "14px 0", display: "grid", gap: 8 }}>
            <strong>🎁 {gift.title}</strong>
            <span className="muted" style={{ fontSize: ".85rem" }}>From {nameOf(people[gift.sender_id])} · {new Date(gift.created_at).toLocaleString()}</span>
            {opened[gift.id] ? <div className="notice" style={{ whiteSpace: "pre-wrap" }}>{opened[gift.id].body}</div> : gift.request_status === "approved" ? <button className="button" type="button" disabled={busy} onClick={() => void openGift(gift.id)}>Open gift</button> : gift.request_status === "pending" ? <span className="muted">Access requested. Waiting for sender approval.</span> : <button className="button" type="button" disabled={busy} onClick={() => void requestAccess(gift.id)}>Request to open</button>}
          </article>
        ))}
      </section>

      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Requests for your gifts</h2>
        {sentRequests.length === 0 ? <p className="muted">No access requests yet.</p> : sentRequests.map((request) => (
          <article key={request.request_id} style={{ borderTop: "1px solid #40354f", padding: "14px 0", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div><strong>{request.title}</strong><div className="muted" style={{ fontSize: ".85rem" }}>Request from {nameOf(people[request.recipient_id])} · {request.status}</div></div>
            {request.status === "pending" && <div style={{ display: "flex", gap: 8 }}><button className="button" type="button" disabled={busy} onClick={() => void respond(request.request_id, true)}>Approve</button><button className="button secondary" type="button" disabled={busy} onClick={() => void respond(request.request_id, false)}>Decline</button></div>}
          </article>
        ))}
      </section>
    </div>
  );
}
