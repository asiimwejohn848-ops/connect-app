"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type Poll = { id: string; question: string; options: string[] };
type Vote = { poll_id: string; user_id: string; option_index: number };
type Member = { user_id: string; display_name: string | null; username: string | null };

export default function VipExtras({ userId }: { userId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState("polls");
  const [polls, setPolls] = useState<Poll[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState("Yes\nNo");
  const [error, setError] = useState("");

  async function refresh() {
    const [p, v, m] = await Promise.all([
      supabase.from("connect_vip_polls").select("id,question,options").order("created_at", { ascending: false }).limit(20),
      supabase.from("connect_vip_poll_votes").select("poll_id,user_id,option_index"),
      supabase.rpc("get_connect_vip_directory")
    ]);
    if (p.error || v.error || m.error) setError([p.error, v.error, m.error].find(Boolean)?.message || "Could not load VIP extras.");
    setPolls((p.data || []) as Poll[]);
    setVotes((v.data || []) as Vote[]);
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

  return <section className="panel" style={{ borderColor: "#7653a2" }}>
    <h3 style={{ marginTop: 0 }}>✨ VIP Community</h3>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
      <button className="button secondary" type="button" onClick={() => setTab("polls")}>📊 Community polls</button>
      <button className="button secondary" type="button" onClick={() => setTab("members")}>👑 VIP directory</button>
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
      {!polls.length && <p className="muted">No polls yet. Start one for the community.</p>}
    </div>}
    {tab === "members" && <div style={{ marginTop: 12 }}>
      <strong>Active Premium members</strong><p className="muted">Only public display names and usernames are listed.</p>
      {members.map(member => <p key={member.user_id}>💎 {member.display_name || (member.username ? "@" + member.username : "CONNECT VIP member")}</p>)}
      {!members.length && <p className="muted">No active VIP members to display yet.</p>}
    </div>}
  </section>;
}
