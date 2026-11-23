"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
};

type ContactRequest = {
  id: string;
  sender_id: string;
  recipient_id: string;
  status: "pending" | "accepted" | "declined";
  created_at: string;
};

export default function ContactsClient({ userId }: { userId: string }) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [requests, setRequests] = useState<ContactRequest[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);

  const supabase = createClient();

  const loadRequests = useCallback(async () => {
    const { data, error: requestError } = await supabase
      .from("contact_requests")
      .select("id, sender_id, recipient_id, status, created_at")
      .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
      .order("created_at", { ascending: false });

    if (requestError) {
      setError(true);
      setMessage(requestError.message);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as ContactRequest[];
    setRequests(rows);

    const otherIds = [...new Set(rows.map((row) => row.sender_id === userId ? row.recipient_id : row.sender_id))];
    if (otherIds.length) {
      const { data: people, error: peopleError } = await supabase
        .from("profiles")
        .select("id, username, display_name, bio")
        .in("id", otherIds);

      if (peopleError) {
        setError(true);
        setMessage(peopleError.message);
      } else {
        const map: Record<string, Profile> = {};
        (people ?? []).forEach((person) => { map[person.id] = person as Profile; });
        setProfiles(map);
      }
    } else {
      setProfiles({});
    }
    setLoading(false);
  }, [supabase, userId]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  async function searchPeople(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = term.trim();
    setMessage("");
    setError(false);
    if (query.length < 2) {
      setResults([]);
      setMessage("Enter at least 2 characters to search.");
      return;
    }
    setSearching(true);
    const [byName, byUsername] = await Promise.all([
      supabase.from("profiles").select("id, username, display_name, bio").ilike("display_name", `%${query}%`).neq("id", userId).limit(20),
      supabase.from("profiles").select("id, username, display_name, bio").ilike("username", `%${query}%`).neq("id", userId).limit(20),
    ]);
    setSearching(false);
    if (byName.error || byUsername.error) {
      setError(true);
      setMessage(byName.error?.message ?? byUsername.error?.message ?? "Search failed.");
      return;
    }
    const combined = [...(byName.data ?? []), ...(byUsername.data ?? [])] as Profile[];
    setResults([...new Map(combined.map((person) => [person.id, person])).values()]);
    if (!combined.length) setMessage("No matching CONNECT members found.");
  }

  async function sendRequest(personId: string) {
    setBusyId(personId);
    setMessage("");
    setError(false);
    const { error: sendError } = await supabase.from("contact_requests").insert({
      sender_id: userId,
      recipient_id: personId,
      status: "pending",
    });
    setBusyId("");
    if (sendError) {
      setError(true);
      setMessage(sendError.code === "23505" ? "A request or connection already exists between you." : sendError.message);
      return;
    }
    setMessage("Contact request sent.");
    await loadRequests();
  }

  async function respond(requestId: string, status: "accepted" | "declined") {
    setBusyId(requestId);
    setMessage("");
    setError(false);
    const { error: responseError } = await supabase
      .from("contact_requests")
      .update({ status })
      .eq("id", requestId)
      .eq("recipient_id", userId)
      .eq("status", "pending");
    setBusyId("");
    if (responseError) {
      setError(true);
      setMessage(responseError.message);
      return;
    }
    setMessage(status === "accepted" ? "Contact request accepted." : "Contact request declined.");
    await loadRequests();
  }

  const incoming = requests.filter((request) => request.recipient_id === userId && request.status === "pending");
  const outgoing = requests.filter((request) => request.sender_id === userId && request.status === "pending");
  const accepted = requests.filter((request) => request.status === "accepted");

  function personName(id: string) {
    const person = profiles[id];
    return person?.display_name || (person?.username ? `@${person.username}` : "CONNECT member");
  }

  function requestState(personId: string) {
    const request = requests.find((row) =>
      (row.sender_id === userId && row.recipient_id === personId) ||
      (row.sender_id === personId && row.recipient_id === userId)
    );
    if (!request) return null;
    if (request.status === "accepted") return "Connected";
    if (request.status === "pending") return request.sender_id === userId ? "Request sent" : "Request received";
    return null;
  }

  return (
    <div style={{ display: "grid", gap: 20, marginTop: 24 }}>
      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Find people</h2>
        <form onSubmit={searchPeople} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            aria-label="Search by name or username"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search name or username"
            style={{ flex: "1 1 220px", minWidth: 0, padding: 12, borderRadius: 10, border: "1px solid var(--line)", background: "#0f0c16", color: "white" }}
          />
          <button className="button" type="submit" disabled={searching}>{searching ? "Searching…" : "Search"}</button>
        </form>
        {results.map((person) => {
          const state = requestState(person.id);
          return (
            <div key={person.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, borderTop: "1px solid var(--line)", padding: "14px 0" }}>
              <div>
                <strong>{person.display_name || "CONNECT member"}</strong>
                {person.username && <div className="muted">@{person.username}</div>}
                {person.bio && <div className="muted" style={{ fontSize: ".85rem" }}>{person.bio}</div>}
              </div>
              {state ? <span className="muted">{state}</span> : <button className="button" type="button" disabled={busyId === person.id} onClick={() => void sendRequest(person.id)}>{busyId === person.id ? "Sending…" : "Add contact"}</button>}
            </div>
          );
        })}
      </section>

      {message && <p className="notice" role="status" aria-live="polite" style={error ? { borderColor: "#9b4b68", background: "#351b28" } : undefined}>{message}</p>}

      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Requests received <span className="muted">({incoming.length})</span></h2>
        {loading ? <p className="muted">Loading requests…</p> : incoming.length === 0 ? <p className="muted">No pending requests.</p> : incoming.map((request) => (
          <div key={request.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", borderTop: "1px solid var(--line)", padding: "14px 0" }}>
            <strong>{personName(request.sender_id)}</strong>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="button" type="button" disabled={busyId === request.id} onClick={() => void respond(request.id, "accepted")}>Accept</button>
              <button className="button secondary" type="button" disabled={busyId === request.id} onClick={() => void respond(request.id, "declined")}>Decline</button>
            </div>
          </div>
        ))}
      </section>

      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Your contacts <span className="muted">({accepted.length})</span></h2>
        {loading ? <p className="muted">Loading contacts…</p> : accepted.length === 0 ? <p className="muted">Your accepted contacts will appear here.</p> : accepted.map((request) => {
          const otherId = request.sender_id === userId ? request.recipient_id : request.sender_id;
          return <div key={request.id} style={{ borderTop: "1px solid var(--line)", padding: "14px 0" }}><strong>{personName(otherId)}</strong>{profiles[otherId]?.username && <div className="muted">@{profiles[otherId].username}</div>}</div>;
        })}
      </section>

      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Requests sent <span className="muted">({outgoing.length})</span></h2>
        {loading ? <p className="muted">Loading requests…</p> : outgoing.length === 0 ? <p className="muted">You have no outgoing requests.</p> : outgoing.map((request) => <div key={request.id} style={{ borderTop: "1px solid var(--line)", padding: "14px 0" }}><strong>{personName(request.recipient_id)}</strong><div className="muted">Waiting for a response</div></div>)}
      </section>
    </div>
  );
}
