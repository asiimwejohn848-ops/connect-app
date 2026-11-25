"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type ContactRequest = {
  id: string;
  sender_id: string;
  recipient_id: string;
  status: "accepted";
};
type Profile = { id: string; username: string | null; display_name: string | null; avatar_url?: string | null };
type Message = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
  delivered_at: string | null;
  edited_at: string | null;
  reply_to_id: string | null;
  voice_path: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_mime: string | null;
  attachment_size: number | null;
  forwarded_from_sender_id: string | null;
  forwarded_from_name: string | null;
};
type MessageReaction = { id: string; message_id: string; user_id: string; emoji: string };
type ConversationPreview = { body: string; created_at: string; sender_id: string; voice_path: string | null; attachment_path: string | null };

export default function MessagesClient({ userId }: { userId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [contacts, setContacts] = useState<Profile[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [messageSearch, setMessageSearch] = useState("");
  const [selected, setSelected] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [conversationPreviews, setConversationPreviews] = useState<Record<string, ConversationPreview>>({});
  const [reactions, setReactions] = useState<MessageReaction[]>([]);
  const [pinnedMessageIds, setPinnedMessageIds] = useState<string[]>([]);
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [contactTyping, setContactTyping] = useState(false);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [forwardTargetId, setForwardTargetId] = useState("");
  const [recording, setRecording] = useState(false);
  const [voiceUrls, setVoiceUrls] = useState<Record<string, string>>({});
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState(false);
  const [desktopNotifications, setDesktopNotifications] = useState(false);

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
    const deliveryTime = new Date().toISOString();
    const { error: deliveryError } = await supabase.from("messages")
      .update({ delivered_at: deliveryTime })
      .eq("recipient_id", userId)
      .is("delivered_at", null);
    if (deliveryError) {
      setProblem(true);
      setNotice(deliveryError.message);
    }
    const { data: recentMessages } = await supabase.from("messages")
      .select("sender_id, recipient_id, body, created_at, voice_path, attachment_path")
      .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(500);
    const previews: Record<string, ConversationPreview> = {};
    (recentMessages ?? []).forEach((message: ConversationPreview & { recipient_id: string }) => {
      const otherId = message.sender_id === userId ? message.recipient_id : message.sender_id;
      if (!previews[otherId]) previews[otherId] = {
        body: message.body, created_at: message.created_at, sender_id: message.sender_id,
        voice_path: message.voice_path, attachment_path: message.attachment_path,
      };
    });
    setConversationPreviews(previews);
    const ids = [...new Set((rows ?? []).map((row: ContactRequest) => row.sender_id === userId ? row.recipient_id : row.sender_id))];
    if (!ids.length) {
      setContacts([]);
      setLoading(false);
      return;
    }
    const { data: people, error: peopleError } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", ids);
    if (peopleError) {
      setProblem(true);
      setNotice(peopleError.message);
    } else {
      setContacts((people ?? []) as Profile[]);
    }
    setLoading(false);
  }, [supabase, userId]);

  const loadUnreadCounts = useCallback(async () => {
    const { data, error } = await supabase.from("messages")
      .select("sender_id")
      .eq("recipient_id", userId)
      .is("read_at", null);
    if (error) return;
    const counts: Record<string, number> = {};
    (data ?? []).forEach((row: { sender_id: string }) => {
      counts[row.sender_id] = (counts[row.sender_id] ?? 0) + 1;
    });
    setUnreadCounts(counts);
  }, [supabase, userId]);

  useEffect(() => {
    void loadUnreadCounts();
    const channel = supabase
      .channel(`connect-unread-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        void loadUnreadCounts();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadUnreadCounts, supabase, userId]);

  const loadMessages = useCallback(async (person: Profile) => {
    const { data, error } = await supabase
      .from("messages")
      .select("id, sender_id, recipient_id, body, created_at, read_at, delivered_at, edited_at, reply_to_id, voice_path, attachment_path, attachment_name, attachment_mime, attachment_size, forwarded_from_sender_id, forwarded_from_name")
      .or(`and(sender_id.eq.${userId},recipient_id.eq.${person.id}),and(sender_id.eq.${person.id},recipient_id.eq.${userId})`)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      setProblem(true);
      setNotice(error.message);
      return;
    }
    const newestFirst = (data ?? []) as Message[];
    setHasOlderMessages(newestFirst.length === 50);
    const rows = newestFirst.reverse();
    setMessages(rows);
    if (rows.length) {
      const { data: pins } = await supabase.from("message_pins").select("message_id").eq("user_id", userId).in("message_id", rows.map((message) => message.id));
      setPinnedMessageIds((pins ?? []).map((pin: { message_id: string }) => pin.message_id));
    } else setPinnedMessageIds([]);
    if (rows.length) {
      const { data: reactionRows } = await supabase.from("message_reactions")
        .select("id, message_id, user_id, emoji")
        .in("message_id", rows.map((message) => message.id));
      setReactions((reactionRows ?? []) as MessageReaction[]);
    } else setReactions([]);
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
        .update({ delivered_at: readAt, read_at: readAt })
        .in("id", unreadIds);
      if (!readError) {
        setMessages((current) => current.map((m) => unreadIds.includes(m.id) ? { ...m, read_at: readAt } : m));
      }
    }
  }, [loadUnreadCounts, supabase, userId]);


  async function loadOlderMessages() {
    if (!selected || !messages.length || loadingOlderMessages || !hasOlderMessages) return;
    setLoadingOlderMessages(true);
    const oldest = messages[0];
    const { data, error } = await supabase.from("messages")
      .select("id, sender_id, recipient_id, body, created_at, read_at, delivered_at, edited_at, reply_to_id, voice_path, attachment_path, attachment_name, attachment_mime, attachment_size, forwarded_from_sender_id, forwarded_from_name")
      .or(`and(sender_id.eq.${userId},recipient_id.eq.${selected.id}),and(sender_id.eq.${selected.id},recipient_id.eq.${userId})`)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      setProblem(true);
      setNotice(error.message);
      setLoadingOlderMessages(false);
      return;
    }
    const older = ((data ?? []) as Message[]).reverse();
    setHasOlderMessages(older.length === 50);
    if (older.length) {
      setMessages((current) => [...older, ...current]);
      const ids = older.map((message) => message.id);
      const [{ data: pins }, { data: reactionRows }] = await Promise.all([
        supabase.from("message_pins").select("message_id").eq("user_id", userId).in("message_id", ids),
        supabase.from("message_reactions").select("id, message_id, user_id, emoji").in("message_id", ids),
      ]);
      setPinnedMessageIds((current) => [...new Set([...current, ...(pins ?? []).map((pin: { message_id: string }) => pin.message_id)])]);
      setReactions((current) => [...current, ...((reactionRows ?? []) as MessageReaction[])]);
      const voicePaths = older.filter((message) => message.voice_path).map((message) => message.voice_path as string);
      const attachmentPaths = older.filter((message) => message.attachment_path).map((message) => message.attachment_path as string);
      const [voiceEntries, attachmentEntries] = await Promise.all([
        Promise.all(voicePaths.map(async (path) => {
          const { data: signed } = await supabase.storage.from("connect-voice-messages").createSignedUrl(path, 3600);
          return signed?.signedUrl ? [path, signed.signedUrl] as const : null;
        })),
        Promise.all(attachmentPaths.map(async (path) => {
          const { data: signed } = await supabase.storage.from("connect-message-attachments").createSignedUrl(path, 3600);
          return signed?.signedUrl ? [path, signed.signedUrl] as const : null;
        })),
      ]);
      setVoiceUrls((current) => ({ ...current, ...Object.fromEntries(voiceEntries.filter((entry): entry is readonly [string, string] => Boolean(entry))) }));
      setAttachmentUrls((current) => ({ ...current, ...Object.fromEntries(attachmentEntries.filter((entry): entry is readonly [string, string] => Boolean(entry))) }));
      const unreadIds = older.filter((message) => message.recipient_id === userId && !message.read_at).map((message) => message.id);
      if (unreadIds.length) {
        const readAt = new Date().toISOString();
        const { error: readError } = await supabase.from("messages").update({ delivered_at: readAt, read_at: readAt }).in("id", unreadIds);
        if (!readError) setMessages((current) => current.map((message) => unreadIds.includes(message.id) ? { ...message, read_at: readAt, delivered_at: message.delivered_at || readAt } : message));
      }
    }
    setLoadingOlderMessages(false);
  }

  useEffect(() => {
    setDesktopNotifications(window.localStorage.getItem("connect-desktop-notifications") === "enabled");
  }, []);

  useEffect(() => {
    if (!desktopNotifications || typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return;
    const channel = supabase
      .channel(`connect-desktop-notifications-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `recipient_id=eq.${userId}` }, (payload) => {
        const incoming = payload.new as { sender_id?: string; body?: string; id?: string };
        if (!incoming.sender_id || incoming.sender_id === selected?.id) return;
        const sender = contacts.find((person) => person.id === incoming.sender_id);
        const notification = new Notification(sender ? displayName(sender) : "New CONNECT message", {
          body: (incoming.body || "You received a new message.").slice(0, 140),
          tag: incoming.id || "connect-new-message",
          icon: "/favicon.ico",
        });
        notification.onclick = () => {
          window.focus();
          if (sender) setSelected(sender);
          notification.close();
        };
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [contacts, desktopNotifications, selected?.id, supabase, userId]);

  async function toggleDesktopNotifications() {
    if (desktopNotifications) {
      window.localStorage.setItem("connect-desktop-notifications", "disabled");
      setDesktopNotifications(false);
      setNotice("Desktop notifications disabled.");
      setProblem(false);
      return;
    }
    if (!("Notification" in window)) {
      setNotice("This browser does not support desktop notifications.");
      setProblem(true);
      return;
    }
    const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (permission !== "granted") {
      setNotice("Notifications were not enabled. Check your browser's site permissions.");
      setProblem(true);
      return;
    }
    window.localStorage.setItem("connect-desktop-notifications", "enabled");
    setDesktopNotifications(true);
    setNotice("Desktop notifications enabled.");
    setProblem(false);
  }

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
    if (!selected) {
      setContactTyping(false);
      return;
    }
    const channel = supabase
      .channel(`connect-typing-${[userId, selected.id].sort().join("-")}`)
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload?.userId === selected.id) {
          setContactTyping(Boolean(payload.isTyping));
        }
      })
      .subscribe();
    typingChannelRef.current = channel;
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingChannelRef.current = null;
      setContactTyping(false);
      void supabase.removeChannel(channel);
    };
  }, [selected, supabase, userId]);

  async function broadcastTyping(isTyping: boolean) {
    if (!selected || !typingChannelRef.current) return;
    await typingChannelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: { userId, isTyping },
    });
  }

  function handleDraftChange(value: string) {
    setDraft(value);
    if (!selected) return;
    void broadcastTyping(Boolean(value.trim()));
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (value.trim()) {
      typingTimeoutRef.current = setTimeout(() => void broadcastTyping(false), 1600);
    }
  }

  useEffect(() => {
    if (!selected) return;
    const refreshReactions = async () => {
      const { data, error } = await supabase.from("message_reactions")
        .select("id, message_id, user_id, emoji")
        .in("message_id", messages.map((message) => message.id));
      if (!error) setReactions((data ?? []) as MessageReaction[]);
    };
    const channel = supabase
      .channel(`connect-reactions-${[userId, selected.id].sort().join("-")}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, () => {
        void refreshReactions();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [messages, selected, supabase, userId]);

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

  async function toggleReaction(messageId: string, emoji: string) {
    const existing = reactions.find((reaction) => reaction.message_id === messageId && reaction.user_id === userId && reaction.emoji === emoji);
    if (existing) {
      const { error } = await supabase.from("message_reactions").delete().eq("id", existing.id);
      if (error) { setProblem(true); setNotice(error.message); return; }
      setReactions((current) => current.filter((reaction) => reaction.id !== existing.id));
    } else {
      const { data, error } = await supabase.from("message_reactions")
        .insert({ message_id: messageId, user_id: userId, emoji })
        .select("id, message_id, user_id, emoji").single();
      if (error) { setProblem(true); setNotice(error.message); return; }
      if (data) setReactions((current) => [...current, data as MessageReaction]);
    }
  }

  async function togglePin(messageId: string) {
    const isPinned = pinnedMessageIds.includes(messageId);
    if (isPinned) {
      const { error } = await supabase.from("message_pins").delete().eq("message_id", messageId).eq("user_id", userId);
      if (error) { setProblem(true); setNotice(error.message); return; }
      setPinnedMessageIds((current) => current.filter((id) => id !== messageId));
      setNotice("Message unpinned.");
    } else {
      const { error } = await supabase.from("message_pins").insert({ message_id: messageId, user_id: userId });
      if (error) { setProblem(true); setNotice(error.message); return; }
      setPinnedMessageIds((current) => [...current, messageId]);
      setNotice("Message pinned for you.");
    }
    setProblem(false);
  }

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

  async function forwardMessage() {
    if (!forwardingMessage || !forwardTargetId) return;
    setSending(true);
    setProblem(false);
    setNotice("Forwarding message…");
    const { error } = await supabase.rpc("forward_private_message", {
      p_message_id: forwardingMessage.id,
      p_recipient_id: forwardTargetId,
    });
    setSending(false);
    if (error) {
      setProblem(true);
      setNotice(error.message);
      return;
    }
    setForwardingMessage(null);
    setForwardTargetId("");
    setNotice("Message forwarded.");
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

  function applyFormatting(prefix: string, suffix = prefix) {
    const field = composerRef.current;
    if (!field) return;
    const start = field.selectionStart;
    const end = field.selectionEnd;
    const selectedText = draft.slice(start, end);
    const replacement = selectedText ? prefix + selectedText + suffix : prefix + suffix;
    const next = draft.slice(0, start) + replacement + draft.slice(end);
    setDraft(next);
    requestAnimationFrame(() => {
      field.focus();
      const cursorStart = start + prefix.length;
      const cursorEnd = selectedText ? cursorStart + selectedText.length : cursorStart;
      field.setSelectionRange(cursorStart, cursorEnd);
    });
  }

  function renderFormattedBody(body: string) {
    const lines = body.split("\n");
    return lines.map((line, lineIndex) => {
      const bullet = /^\s*[-•]\s+/.test(line);
      const content = bullet ? line.replace(/^\s*[-•]\s+/, "") : line;
      const tokens = content.split(/(\*\*.*?\*\*|__.*?__|~~.*?~~|\*[^*]+\*|_[^_]+_)/g);
      const rendered = tokens.map((token, index) => {
        if (token.startsWith("**") && token.endsWith("**")) return <strong key={index}>{token.slice(2, -2)}</strong>;
        if (token.startsWith("__") && token.endsWith("__")) return <u key={index}>{token.slice(2, -2)}</u>;
        if (token.startsWith("~~") && token.endsWith("~~")) return <s key={index}>{token.slice(2, -2)}</s>;
        if (token.startsWith("*") && token.endsWith("*")) return <em key={index}>{token.slice(1, -1)}</em>;
        if (token.startsWith("_") && token.endsWith("_")) return <em key={index}>{token.slice(1, -1)}</em>;
        return <span key={index}>{token}</span>;
      });
      return <div key={lineIndex} style={bullet ? { paddingLeft: 14, position: "relative" } : undefined}>{bullet ? <span aria-hidden="true" style={{ position: "absolute", left: 0 }}>•</span> : null}{rendered}</div>;
    });
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
        ) : [...contacts].filter((person) => displayName(person).toLowerCase().includes(contactSearch.trim().toLowerCase())).sort((a, b) =>
          (conversationPreviews[b.id]?.created_at || "").localeCompare(conversationPreviews[a.id]?.created_at || "")
        ).map((person) => (
          <button key={person.id} type="button" onClick={() => { setSelected(person); setNotice(""); setProblem(false); }}
            className={selected?.id === person.id ? "button" : "button secondary"}
            style={{ display: "block", width: "100%", textAlign: "left", marginTop: 8 }}>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ minWidth: 0, display: "grid", gap: 3 }}>
                <span>{displayName(person)}</span>
                {conversationPreviews[person.id] && <span className="muted" style={{ fontSize: ".76rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
                  {conversationPreviews[person.id].sender_id === userId ? "You: " : ""}
                  {conversationPreviews[person.id].voice_path ? "🎤 Voice message" : conversationPreviews[person.id].attachment_path ? "📎 Attachment" : conversationPreviews[person.id].body.slice(0, 52)}
                </span>}
              </span>
              <span style={{ display: "grid", justifyItems: "end", gap: 4 }}>
                {conversationPreviews[person.id] && <span className="muted" style={{ fontSize: ".68rem" }}>{new Date(conversationPreviews[person.id].created_at).toLocaleDateString()}</span>}
                {Boolean(unreadCounts[person.id]) && <span aria-label={`${unreadCounts[person.id]} unread messages`} style={{ minWidth: 20, height: 20, padding: "0 6px", display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 999, background: "#9b72d4", color: "#fff", fontSize: ".72rem", fontWeight: 800 }}>{unreadCounts[person.id]}</span>}
              </span>
            </span>
          </button>
        ))}
      </aside>

      <section className="panel" style={{ minHeight: 420, display: "flex", flexDirection: "column" }}>
        {selected ? (
          <>
            <div style={{ borderBottom: "1px solid var(--line)", paddingBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {selected.avatar_url ? <img src={selected.avatar_url} alt="" style={{ width: 42, height: 42, borderRadius: "50%", objectFit: "cover" }} /> : <span aria-hidden="true" style={{ width: 42, height: 42, borderRadius: "50%", display: "grid", placeItems: "center", background: "#30243f", color: "#d8c0f5", fontWeight: 800 }}>{displayName(selected)[0]?.toUpperCase()}</span>}
                <h2 style={{ margin: 0 }}>{displayName(selected)}</h2>
              </div>
              {selected.username && <span className="muted">@{selected.username}</span>}
              {contactTyping && <div className="muted" role="status" style={{ fontSize: ".8rem", marginTop: 4 }}>Typing…</div>}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                <button className="button secondary" type="button" onClick={() => void loadMessages(selected)}>Refresh conversation</button>
                <button className="button secondary" type="button" onClick={() => void toggleDesktopNotifications()}>{desktopNotifications ? "Notifications on" : "Enable notifications"}</button>
                <button className="button secondary" type="button" aria-pressed={showPinnedOnly} onClick={() => setShowPinnedOnly((value) => !value)}>{showPinnedOnly ? "Show all messages" : `Pinned (${pinnedMessageIds.length})`}</button>
                <input value={messageSearch} onChange={(event) => setMessageSearch(event.target.value)}
                  placeholder="Search messages in this chat…" aria-label="Search messages in this conversation"
                  style={{ flex: 1, minWidth: 160, padding: 9, borderRadius: 9, border: "1px solid var(--line)", background: "#0f0c16", color: "white" }} />
              </div>
              {messageSearch.trim() && <p className="muted" style={{ fontSize: ".78rem", margin: "6px 0 0" }}>
                {messages.filter((message) => message.body.toLowerCase().includes(messageSearch.trim().toLowerCase())).length} matching messages
              </p>}
            </div>
            {forwardingMessage && (
              <div role="dialog" aria-label="Forward message" aria-modal="true" style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 12, marginTop: 12, background: "#211b2b" }}>
                <strong>Forward message</strong>
                <p className="muted" style={{ margin: "6px 0 10px" }}>{forwardingMessage.body.slice(0, 180)}</p>
                <label htmlFor="forward-target" className="muted">Choose an accepted contact</label>
                <select id="forward-target" value={forwardTargetId} onChange={(event) => setForwardTargetId(event.target.value)}
                  style={{ display: "block", width: "100%", marginTop: 6, padding: 10, borderRadius: 8, background: "#0f0c16", color: "white", border: "1px solid var(--line)" }}>
                  <option value="">Select a contact…</option>
                  {contacts.filter((person) => person.id !== selected.id).map((person) => (
                    <option key={person.id} value={person.id}>{displayName(person)}</option>
                  ))}
                </select>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button type="button" className="button" onClick={() => void forwardMessage()} disabled={sending || !forwardTargetId}>
                    {sending ? "Forwarding…" : "Forward"}
                  </button>
                  <button type="button" className="button secondary" onClick={() => { setForwardingMessage(null); setForwardTargetId(""); }}>Cancel</button>
                </div>
                {contacts.filter((person) => person.id !== selected.id).length === 0 && <p className="muted">You need another accepted contact to forward this message.</p>}
              </div>
            )}
            <div aria-live="polite" style={{ flex: 1, display: "grid", alignContent: "start", gap: 10, padding: "16px 0", maxHeight: 420, overflowY: "auto" }}>
              {hasOlderMessages && <div style={{ textAlign: "center" }}><button type="button" className="button secondary" onClick={() => void loadOlderMessages()} disabled={loadingOlderMessages}>{loadingOlderMessages ? "Loading older messages…" : "Load older messages"}</button></div>}
              {messages.filter((message) => message.body.toLowerCase().includes(messageSearch.trim().toLowerCase()) && (!showPinnedOnly || pinnedMessageIds.includes(message.id))).length === 0 ? (
                <p className="muted">{showPinnedOnly ? "No pinned messages in this conversation yet." : messageSearch.trim() ? "No messages match that search." : "No messages yet. Start the conversation."}</p>
              ) : messages.filter((message) => message.body.toLowerCase().includes(messageSearch.trim().toLowerCase()) && (!showPinnedOnly || pinnedMessageIds.includes(message.id))).map((message) => {
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
                        <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{renderFormattedBody(message.body)}</div>
                        <div className="muted" style={{ fontSize: ".72rem", marginTop: 6 }}>
                          {new Date(message.created_at).toLocaleString()}
                          {message.edited_at ? " · Edited" : ""}
                          {mine && message.read_at ? " · Read" : mine && message.delivered_at ? " · Delivered" : mine ? " · Sent" : ""}
                        </div>
                        {pinnedMessageIds.includes(message.id) && <div style={{ fontSize: ".73rem", color: "#d2b6f4", marginTop: 5 }}>◆ Pinned for you</div>}
                        {message.forwarded_from_sender_id && (
                          <div className="muted" style={{ fontSize: ".75rem", marginTop: 5, fontStyle: "italic" }}>
                            Forwarded · Originally sent by {message.forwarded_from_name || "a CONNECT member"}
                          </div>
                        )}
                        <div aria-label="Message reactions" style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
                          {["👍", "❤️", "😂", "😮", "😢", "🔥"].map((emoji) => {
                            const matching = reactions.filter((reaction) => reaction.message_id === message.id && reaction.emoji === emoji);
                            const mine = matching.some((reaction) => reaction.user_id === userId);
                            return <button key={emoji} type="button" className="button secondary" aria-label={`React ${emoji}${mine ? ", remove reaction" : ""}`} aria-pressed={mine}
                              onClick={() => void toggleReaction(message.id, emoji)}
                              style={{ padding: "3px 7px", borderColor: mine ? "#b58ae8" : undefined, background: mine ? "#4a3265" : undefined, fontSize: ".8rem" }}>
                              {emoji}{matching.length > 0 ? ` ${matching.length}` : ""}
                            </button>;
                          })}
                        </div>
                        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                          <button type="button" className="button secondary" onClick={async () => { try { await navigator.clipboard.writeText(message.body); setNotice("Message copied."); setProblem(false); } catch { setNotice("Could not copy this message. Check clipboard permissions."); setProblem(true); } }}>Copy</button>
                          <button type="button" className="button secondary" onClick={() => void togglePin(message.id)}>{pinnedMessageIds.includes(message.id) ? "Unpin" : "Pin"}</button>
                          <button type="button" className="button secondary" onClick={() => { setReplyingTo(message); setEditingId(null); }}>Reply</button>
                          {!message.voice_path && !message.attachment_path && (
                            <button type="button" className="button secondary" onClick={() => { setForwardingMessage(message); setForwardTargetId(""); }}>Forward</button>
                          )}
                          {mine && canEdit && <button type="button" className="button secondary" onClick={() => { setEditingId(message.id); setEditDraft(message.body); }}>Edit</button>}
                          {mine && <button type="button" className="button secondary" onClick={() => void deleteMessage(message)}>Delete</button>}
                        </div>
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
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} aria-label="Message formatting">
                <button type="button" className="button secondary" title="Bold" aria-label="Bold" onClick={() => applyFormatting("**")} disabled={sending}><strong>B</strong></button>
                <button type="button" className="button secondary" title="Italic" aria-label="Italic" onClick={() => applyFormatting("*")} disabled={sending}><em>I</em></button>
                <button type="button" className="button secondary" title="Underline" aria-label="Underline" onClick={() => applyFormatting("__")} disabled={sending}><u>U</u></button>
                <button type="button" className="button secondary" title="Bullet list" aria-label="Bullet list" onClick={() => applyFormatting("- ", "")} disabled={sending}>• List</button>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "stretch" }}>
                <textarea ref={composerRef} value={draft} onChange={(event) => {
                    handleDraftChange(event.target.value);
                    const area = event.currentTarget;
                    area.style.height = "auto";
                    const maxHeight = Math.max(140, Math.floor(window.innerHeight * 0.45));
                    area.style.height = `${Math.min(area.scrollHeight, maxHeight)}px`;
                    area.style.overflowY = area.scrollHeight > maxHeight ? "auto" : "hidden";
                  }} maxLength={5000}
                  rows={4} placeholder="Write a message…" aria-label="Write a message"
                  style={{ flex: 1, minWidth: 0, minHeight: 120, maxHeight: "45vh", resize: "vertical", overflowY: "hidden", padding: 12, borderRadius: 10, border: "1px solid var(--line)", background: "#0f0c16", color: "white", font: "inherit", lineHeight: 1.5 }} />
                <button className="button" type="submit" disabled={sending || !draft.trim()}>{sending ? "Sending…" : "Send"}</button>
                <button className="button secondary" type="button" onClick={() => fileInputRef.current?.click()} disabled={sending}>Attach file</button>
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
