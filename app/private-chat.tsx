"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchApi, readJsonResponse } from "./api-response";

type Message = { id: number; matricula: string; fullName: string; designation: string | null; body: string; createdAt: string };
type OnlineMember = { matricula: string; fullName: string; designation: string | null };

export function PrivateChat({ matricula }: { matricula: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [online, setOnline] = useState<OnlineMember[]>([]);
  const load = useCallback(async () => {
    const response = await fetchApi(`/api/chat?fresh=${Date.now()}`, { cache: "no-store" });
    const data = await readJsonResponse<{ messages?: Message[]; online?: OnlineMember[]; error?: string }>(response);
    if (!response.ok) throw new Error(data?.error || "No fue posible cargar el chat.");
    setMessages(data?.messages || []);
    setOnline(data?.online || []);
  }, []);
  useEffect(() => { void load().catch((caught) => setError(caught instanceof Error ? caught.message : "No fue posible cargar el chat.")); const timer = window.setInterval(() => void load().catch(() => undefined), 15000); return () => window.clearInterval(timer); }, [load]);
  const send = async () => {
    if (!body.trim() || sending) return;
    setSending(true); setError("");
    try {
      const response = await fetchApi("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body }) });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) throw new Error(data?.error || "No fue posible enviar el mensaje.");
      setBody(""); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No fue posible enviar el mensaje."); }
    finally { setSending(false); }
  };
  return <section className="privateChat" aria-labelledby="private-chat-title">
    <div className="privateChatHeader"><div><span className="eyebrow">ÁREA RESERVADA</span><h1 id="private-chat-title">Chat sindical privado</h1><p>Solo participan matrículas con el rol Chat activo.</p></div><span className="chatLock" aria-label="Acceso restringido">🔒</span></div>
    <div className="chatOnlineBar" aria-label="Integrantes conectados"><div className="chatOnlineTitle"><span className="onlineDot" />En línea <b>{online.length}</b></div><div className="chatOnlineMembers">{online.length ? online.map((member) => <span className="chatOnlineMember" key={member.matricula} title={`${member.designation || "Rol Chat"} · ${member.matricula}`}><i>{member.fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</i>{member.fullName}</span>) : <small>Nadie más está conectado</small>}</div><small className="ghostNotice">🔒 Las cuentas administradoras están en modo fantasma.</small></div>
    <div className="privateChatMessages" aria-live="polite">
      {!messages.length && <div className="chatEmpty">Aún no hay mensajes. Este espacio ya está listo para el equipo.</div>}
      {messages.map((message) => <article className={`chatMessage ${message.matricula === matricula ? "own" : ""}`} key={message.id}><div className="chatMessageMeta"><b>{message.matricula === matricula ? "Tú" : message.fullName}</b><small>{message.designation || "Rol Chat"} · {new Date(message.createdAt.replace(" ", "T") + (message.createdAt.endsWith("Z") ? "" : "Z")).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}</small></div><p>{message.body}</p></article>)}
    </div>
    {error && <p className="chatError" role="alert">{error}</p>}
    <div className="privateChatComposer"><textarea value={body} maxLength={1000} rows={3} onChange={(event) => setBody(event.target.value)} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") void send(); }} placeholder="Escribe un mensaje para el equipo…" aria-label="Mensaje" /><button className="button primary" type="button" onClick={() => void send()} disabled={sending || !body.trim()}>{sending ? "Enviando…" : "Enviar"}</button></div>
    <small className="chatHint">Ctrl + Enter para enviar · Los mensajes quedan disponibles únicamente para este grupo autorizado.</small>
  </section>;
}
