"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type VipMessage = { id: string; sender_id: string; body: string; created_at: string };
type VipReaction = { id: string; message_id: string; user_id: string; emoji: string };
type Profile = { id: string; username: string | null; display_name: string | null };
type PaymentRow = { id: string; plan_code: string; amount_ugx: number; status: string; created_at: string; transaction_reference: string };
type VipNotice = { id: string; title: string; body: string; created_at: string; read_at: string | null };

const plans = [
  { code: "weekly", name: "Weekly VIP", price: "UGX 1,000", detail: "7 days" },
  { code: "monthly", name: "Monthly VIP", price: "UGX 3,000", detail: "30 days" },
  { code: "quarterly", name: "Quarterly VIP", price: "UGX 8,000", detail: "90 days" },
  { code: "annual", name: "Annual VIP", price: "UGX 30,000", detail: "365 days" },
] as const;

function personName(person?: Profile) {
  return person?.display_name || (person?.username ? "@" + person.username : "CONNECT member");
}

export default function VipClient({ userId }: { userId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [active, setActive] = useState(false);
  const [messages, setMessages] = useState<VipMessage[]>([]);
  const [reactions, setReactions] = useState<VipReaction[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState("");
  const [plan, setPlan] = useState("monthly");
  const [reference, setReference] = useState("");
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [notices, setNotices] = useState<VipNotice[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState(false);

  const load = useCallback(async () => {
    const now = new Date().toISOString();
    const [{ data: subs }, { data: paymentRows }, { data: notificationRows }] = await Promise.all([
      supabase.from("connect_subscriptions").select("id").eq("status", "active").lte("starts_at", now).gt("ends_at", now).limit(1),
      supabase.from("connect_vip_payment_submissions").select("id, plan_code, amount_ugx, status, created_at, transaction_reference").order("created_at", { ascending: false }).limit(5),
      supabase.from("connect_vip_notifications").select("id, title, body, created_at, read_at").order("created_at", { ascending: false }).limit(5),
    ]);
    const isActive = Boolean(subs?.length);
    setActive(isActive);
    setPayments((paymentRows ?? []) as PaymentRow[]);
    setNotices((notificationRows ?? []) as VipNotice[]);
    if (!isActive) { setMessages([]); return; }
    const { data: rows, error } = await supabase.from("connect_vip_messages")
      .select("id, sender_id, body, created_at").order("created_at", { ascending: true }).limit(100);
    if (error) { setProblem(true); setNotice(error.message); return; }
    const list = (rows ?? []) as VipMessage[];
    setMessages(list);
    if (list.length) {
      const { data: reactionRows } = await supabase.from("connect_vip_message_reactions")
        .select("id, message_id, user_id, emoji").in("message_id", list.map((message) => message.id));
      setReactions((reactionRows ?? []) as VipReaction[]);
    } else setReactions([]);
    const ids = [...new Set(list.map((message) => message.sender_id))];
    if (ids.length) {
      const { data: people } = await supabase.from("profiles").select("id, username, display_name").in("id", ids);
      setNames(Object.fromEntries(((people ?? []) as Profile[]).map((person) => [person.id, personName(person)])));
    }
    const unread = (notificationRows ?? []).filter((item: VipNotice) => !item.read_at).map((item: VipNotice) => item.id);
    if (unread.length) await supabase.from("connect_vip_notifications").update({ read_at: new Date().toISOString() }).in("id", unread);
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!active) return;
    const channel = supabase.channel("connect-vip-lounge")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "connect_vip_messages" }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [active, load, supabase]);

  async function toggleReaction(messageId: string, emoji: string) {
    const existing = reactions.find((reaction) => reaction.message_id === messageId && reaction.user_id === userId && reaction.emoji === emoji);
    if (existing) {
      const { error } = await supabase.from("connect_vip_message_reactions").delete().eq("id", existing.id);
      if (error) { setProblem(true); setNotice(error.message); return; }
    } else {
      const { error } = await supabase.from("connect_vip_message_reactions").insert({ message_id: messageId, user_id: userId, emoji });
      if (error) { setProblem(true); setNotice(error.message); return; }
    }
    await load();
  }

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setProblem(false); setNotice("");
    const { error } = await supabase.rpc("submit_connect_vip_payment", {
      p_plan_code: plan,
      p_transaction_reference: reference.trim(),
    });
    setBusy(false);
    if (error) { setProblem(true); setNotice(error.message); return; }
    setReference("");
    setNotice("Payment reference submitted. Your VIP access will activate after the payment is verified.");
    await load();
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim()) return;
    setBusy(true); setProblem(false); setNotice("");
    const { error } = await supabase.from("connect_vip_messages").insert({ sender_id: userId, body: draft.trim() });
    setBusy(false);
    if (error) { setProblem(true); setNotice(error.message); return; }
    setDraft("");
    await load();
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {notice && <p className="notice" role="status" style={{ borderColor: problem ? "#b45353" : undefined }}>{notice}</p>}
      {notices.map((item) => (
        <section className="panel" key={item.id} style={{ borderColor: "#9b6bdb" }}>
          <strong>✨ {item.title}</strong>
          <p style={{ marginBottom: 0 }}>{item.body}</p>
          <small className="muted">{new Date(item.created_at).toLocaleString()}</small>
        </section>
      ))}

      {active ? (
        <section className="panel">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div><p style={{ color: "#c8aaff", fontWeight: 800, letterSpacing: ".12em", fontSize: ".72rem", margin: 0 }}>MEMBERS ONLY</p><h2 style={{ margin: "5px 0" }}>💎 VIP Lounge</h2></div>
            <span className="button" style={{ cursor: "default" }}>VIP ACTIVE</span>
          </div>
          <p className="muted">Your private-feeling members' lounge: real-time conversation, exclusive reactions, VIP identity and a members-only community.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(135px,1fr))", gap: 8, margin: "14px 0 18px" }}>
            {[["💎","VIP identity","Exclusive member badge"],["⚡","Live lounge","Instant shared chat"],["💜","VIP reactions","Six expressive reactions"],["🎁","Gift Messages","Unlockable special messages"]].map(([icon,title,desc]) => (
              <div key={title} style={{ padding: 12, borderRadius: 12, background: "#21172f", border: "1px solid #49335f" }}>
                <div style={{ fontSize: 22 }}>{icon}</div><strong style={{ display: "block" }}>{title}</strong><small className="muted">{desc}</small>
              </div>
            ))}
          </div>
          <div aria-live="polite" style={{ minHeight: 300, maxHeight: 480, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, padding: 12, background: "#100c18", border: "1px solid var(--line)", borderRadius: 12 }}>
            {messages.length === 0 ? <p className="muted">Welcome to the VIP Lounge. Start the conversation.</p> : messages.map((message) => (
              <article key={message.id} style={{ alignSelf: message.sender_id === userId ? "flex-end" : "flex-start", maxWidth: "85%", background: message.sender_id === userId ? "#382451" : "#211a2c", padding: "10px 13px", borderRadius: 12 }}>
                <strong style={{ fontSize: ".8rem", color: "#d6baff" }}>{message.sender_id === userId ? "You" : names[message.sender_id] || "VIP member"} <span title="Verified active VIP member" style={{ color: "#c8aaff" }}>💎 VIP</span></strong>
                <p style={{ margin: "4px 0", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{message.body}</p>
                <small className="muted">{new Date(message.created_at).toLocaleTimeString()}</small>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
                  {["💜","🔥","👏","😂","✨","🚀"].map((emoji) => {
                    const matching = reactions.filter((reaction) => reaction.message_id === message.id && reaction.emoji === emoji);
                    const mine = matching.some((reaction) => reaction.user_id === userId);
                    return <button key={emoji} type="button" onClick={() => void toggleReaction(message.id, emoji)}
                      aria-label={"React with " + emoji} className="button secondary"
                      style={{ padding: "3px 7px", fontSize: ".82rem", borderColor: mine ? "#b48be8" : "var(--line)", background: mine ? "#4b2d6b" : "transparent" }}>
                      {emoji}{matching.length > 0 ? " " + matching.length : ""}
                    </button>;
                  })}
                </div>
              </article>
            ))}
          </div>
          <form onSubmit={sendMessage} style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={3000} placeholder="Write to the VIP Lounge…" aria-label="VIP message" style={{ flex: 1, minWidth: 0, padding: 12, borderRadius: 10, background: "#100c18", color: "white", border: "1px solid var(--line)" }} />
            <button className="button" type="submit" disabled={busy || !draft.trim()}>{busy ? "…" : "Send"}</button>
          </form>
        </section>
      ) : (
        <section className="panel">
          <p style={{ color: "#c8aaff", fontWeight: 800, letterSpacing: ".12em", fontSize: ".72rem" }}>CONNECT PREMIUM</p>
          <h2 style={{ marginTop: 4 }}>Unlock VIP Chat</h2>
          <p className="muted">Choose a plan, pay through MTN Mobile Money, then submit the transaction ID shown on your receipt. Access is enabled only after payment verification.</p>
          <div style={{ padding: 16, border: "1px solid #7653a2", borderRadius: 12, background: "#171020", margin: "14px 0" }}>
            <small className="muted">PAYMENT NUMBER · MTN MOBILE MONEY</small>
            <h2 style={{ margin: "5px 0", letterSpacing: ".04em" }}>0771363654</h2>
            <p className="muted" style={{ margin: 0, fontSize: ".85rem" }}>Before sending, confirm the recipient name displayed by MTN. Never share your MoMo PIN or OTP.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))", gap: 9, marginBottom: 16 }}>
            {plans.map((item) => (
              <button key={item.code} type="button" onClick={() => setPlan(item.code)} className={plan === item.code ? "button" : "button secondary"} style={{ textAlign: "left", padding: 12 }}>
                <strong>{item.name}</strong><br /><span>{item.price}</span><br /><small>{item.detail}</small>
              </button>
            ))}
          </div>
          <ol className="muted" style={{ paddingLeft: 22 }}>
            <li>Send the exact plan amount to the number above using MTN Mobile Money.</li>
            <li>Copy the transaction ID from your payment receipt.</li>
            <li>Submit it below. CONNECT will review the payment before activating VIP.</li>
          </ol>
          <form onSubmit={submitPayment} style={{ display: "grid", gap: 10 }}>
            <label>MTN transaction ID
              <input required minLength={5} maxLength={100} value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Enter receipt transaction ID" style={{ display: "block", width: "100%", boxSizing: "border-box", marginTop: 6, padding: 12, borderRadius: 9 }} />
            </label>
            <button className="button" type="submit" disabled={busy || !reference.trim()}>{busy ? "Submitting…" : "Submit payment for verification"}</button>
          </form>
          {payments.length > 0 && <div style={{ marginTop: 18 }}>
            <strong>Recent payment submissions</strong>
            {payments.map((payment) => <p key={payment.id} className="muted" style={{ margin: "7px 0", fontSize: ".85rem" }}>{payment.plan_code} · UGX {payment.amount_ugx.toLocaleString()} · {payment.status.toUpperCase()} · {new Date(payment.created_at).toLocaleDateString()}</p>)}
          </div>}
        </section>
      )}
      <p className="muted" style={{ fontSize: ".78rem" }}>VIP Chat is a Premium feature. Ordinary CONNECT messages remain free. Payment verification is currently manual; automatic MTN confirmation will require official merchant API integration.</p>
    </div>
  );
}
