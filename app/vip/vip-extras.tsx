"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type Message = { id: string; body: string };
type Poll = { id: string; question: string; options: string[] };
type Vote = { poll_id: string; user_id: string; option_index: number };
type Member = { user_id: string; display_name: string | null; username: string | null };

export default function VipExtras({ userId, messages }: { userId: string; messages: Message[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState("polls");
  const [theme, setTheme] = useState("midnight");
  const [polls, setPolls] = useState<Poll[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState("Yes\nNo");
  const [error, setError] = useState("");

  async function refresh() {
    const [p, v, s, m] = await Promise.all([
      supabase.from("connect_vip_polls").select("id,question,options").order("created_at", { ascending: false }).limit(20),
      supabase.from("connect_vip_poll_votes").select("poll_id,user_id,option_index"),
      supabase.from("connect_vip_saved_messages").select("message_id").eq("user_id", userId),
      supabase.rpc("get_connect_vip_directory")
    ]);
    if (p.error || v.error || s.error || m.error) setError([p.error, v.error, s.error, m.error].find(Boolean)?.message || "Could not load VIP extras.");
    setPolls((p.data || []) as Poll[]);
    setVotes((v.data || []) as Vote[]);
    setSaved((s.data || []).map((x: { message_id: string }) => x.message_id));
    setMembers((m.data || []) as Member[]);
  }

  useEffect(() => { void refresh(); }, []);

  async function createPoll(event: FormEvent) {
    event.preventDefault();
    const choices = options.split("\n").map(x => x.trim()).filter(Boolean);
    if (choices.length < 2 || choices.length > 5) { setError("Enter 2 to 5 poll options, one per line."); return; }
    const { error: e } = await supabase.from("connect_vip_polls").insert({ creator_id: userId, question: question.trim(), options: choices });
    if (e) { setError(e.message); return; }
    setQuestion(""); setOptions("Yes\nNo"); setError(""); await refresh();
  }

  async function vote(pollId: string, optionIndex: number) {
    const { error: e } = await supabase.from("connect_vip_poll_votes").insert({ poll_id: pollId, user_id: userId, option_index: optionIndex });
    if (e) { setError(e.message); return; }
    await refresh();
  }

  async function toggleSave(messageId: string) {
    const result = saved.includes(messageId)
      ? await supabase.from("connect_vip_saved_messages").delete().eq("user_id", userId).eq("message_id", messageId)
      : await supabase.from("connect_vip_saved_messages").insert({ user_id: userId, message_id: messageId });
    if (result.error) { setError(result.error.message); return; }
    await refresh();
  }

  return <section className="panel" style={{ borderColor: "#7653a2" }}>
    <h3 style={{ marginTop: 0 }}>✨ VIP Extras</h3>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
      <button className="button secondary" type="button" onClick={() => setTab("polls")}>📊 Polls</button>
      <button className="button secondary" type="button" onClick={() => setTab("members")}>👑 Members</button>
      <button className="button secondary" type="button" onClick={() => setTab("saved")}>🔖 Saved ({saved.length})</button>
      <select aria-label="VIP chat theme" value={theme} onChange={e => setTheme(e.target.value)} style={{ padding: 9, borderRadius: 8, background: theme === "gold" ? "#332711" : theme === "ocean" ? "#102b40" : "#21172f", color: "white" }}>
        <option value="midnight">Midnight Purple</option><option value="gold">Royal Gold</option><option value="ocean">Ocean Blue</option>
      </select>
    </div>
    {error && <p role="alert" className="notice">{error}</p>}
    {tab === "polls" && <div style={{ marginTop: 12 }}>
      <strong>Create a VIP community poll</strong>
      <form onSubmit={createPoll} style={{ display: "grid", gap: 8, marginTop: 8 }}>
        <input required minLength={5} maxLength={180} value={question} onChange={e => setQuestion(e.target.value)} placeholder="Ask the VIP community…" />
        <textarea rows={3} value={options} onChange={e => setOptions(e.target.value)} placeholder="One option per line (2–5)" />
        <button className="button" type="submit" disabled={!question.trim()}>Publish poll</button>
      </form>
      {polls.map(poll => {
        const mine = votes.find(v => v.poll_id === poll.id && v.user_id === userId);
        const total = votes.filter(v => v.poll_id === poll.id).length;
        return <div key={poll.id} style={{ borderTop: "1px solid var(--line)", marginTop: 12, paddingTop: 10 }}>
          <strong>{poll.question}</strong><small className="muted"> · {total} votes</small>
          {poll.options.map((choice, index) => {
            const count = votes.filter(v => v.poll_id === poll.id && v.option_index === index).length;
            return <button key={index} type="button" className="button secondary" disabled={Boolean(mine)} onClick={() => void vote(poll.id, index)} style={{ display: "flex", justifyContent: "space-between", width: "100%", marginTop: 6 }}>
              <span>{choice}{mine?.option_index === index ? " ✓" : ""}</span><span>{total ? Math.round(count / total * 100) : 0}%</span>
            </button>;
          })}
        </div>;
      })}
    </div>}
    {tab === "members" && <div style={{ marginTop: 12 }}>
      <strong>Active Premium members</strong><p className="muted">Only public display names and usernames are listed.</p>
      {members.map(member => <p key={member.user_id}>💎 {member.display_name || (member.username ? "@" + member.username : "CONNECT VIP member")}</p>)}
      {!members.length && <p className="muted">No other active VIP members to display yet.</p>}
    </div>}
    {tab === "saved" && <div style={{ marginTop: 12 }}>
      <strong>Your saved messages</strong>
      {messages.filter(message => saved.includes(message.id)).map(message => <div key={message.id} style={{ borderTop: "1px solid var(--line)", padding: "8px 0" }}>{message.body}<button className="button secondary" type="button" onClick={() => void toggleSave(message.id)} style={{ marginLeft: 8 }}>Remove</button></div>)}
      {!saved.length && <p className="muted">Use the bookmark control below a chat message to save it.</p>}
    </div>}
    <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
      <strong>Bookmark messages</strong>
      {messages.slice(-8).map(message => <div key={message.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "5px 0" }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{message.body}</span>
        <button type="button" className="button secondary" onClick={() => void toggleSave(message.id)}>{saved.includes(message.id) ? "Saved" : "🔖 Save"}</button>
      </div>)}
    </div>
  </section>;
}
