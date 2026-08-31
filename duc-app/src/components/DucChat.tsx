import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, Button, Spinner, cx } from "./ui";
import { fetchMessages, postMessage, notifyMentions, type DucMessage } from "../lib/chat";
import { fetchOrgMembers, type OrgMember } from "../lib/members";

/** Iniciais para o avatar. */
function initials(name: string | null): string {
  const src = (name || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

/** Hora curta relativa. */
function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const min = Math.floor((Date.now() - t) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

/** Realça @menções no corpo da mensagem. */
function renderBody(body: string) {
  const parts = body.split(/(@[\p{L}][\p{L}0-9._-]*(?:\s[\p{L}][\p{L}0-9._-]*)?)/gu);
  return parts.map((p, i) =>
    p.startsWith("@") ? (
      <span key={i} className="font-medium text-brand">
        {p}
      </span>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

export function DucChat({
  ducId,
  orgId,
  businessUserId,
  userName,
  ducNumber,
}: {
  ducId: string;
  orgId: string;
  businessUserId: string | null;
  userName: string | null;
  ducNumber: string | null;
}) {
  const [messages, setMessages] = useState<DucMessage[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [picked, setPicked] = useState<Array<{ name: string; id: string }>>([]);
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const m = await fetchMessages(ducId);
    setMessages(m);
    setLoading(false);
  }, [ducId]);

  useEffect(() => {
    void load();
    void fetchOrgMembers(orgId).then(setMembers);
    // Refresca periodicamente (conversa colaborativa).
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [load, orgId]);

  // Scroll para o fim quando chegam mensagens.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  const onDraftChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setDraft(text);
    const caret = e.target.selectionStart ?? text.length;
    const upto = text.slice(0, caret);
    const m = upto.match(/@([\p{L}0-9._-]*)$/u);
    setMention(m ? { query: m[1], start: caret - m[0].length } : null);
  };

  const mentionOptions = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return members.filter((mem) => mem.name.toLowerCase().includes(q)).slice(0, 6);
  }, [mention, members]);

  const insertMention = (mem: OrgMember) => {
    if (!mention) return;
    const caret = taRef.current?.selectionStart ?? draft.length;
    const before = draft.slice(0, mention.start);
    const after = draft.slice(caret);
    const token = `@${mem.name} `;
    setDraft(before + token + after);
    setPicked((p) => (p.some((x) => x.id === mem.id) ? p : [...p, { name: mem.name, id: mem.id }]));
    setMention(null);
    setTimeout(() => taRef.current?.focus(), 0);
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    // Menções válidas = as escolhidas cujo "@Nome" ainda está no texto.
    const mentionIds = picked.filter((p) => body.includes(`@${p.name}`)).map((p) => p.id);
    const err = await postMessage({
      ducId,
      orgId,
      authorId: businessUserId,
      authorName: userName,
      body,
      mentions: mentionIds,
    });
    if (!err) {
      if (mentionIds.length > 0) {
        void notifyMentions(mentionIds, {
          organizationId: orgId,
          ducNumber,
          author: userName,
          ducUrl: window.location.href,
          excerpt: body.slice(0, 160),
        });
      }
      setDraft("");
      setPicked([]);
      setMention(null);
      await load();
    }
    setSending(false);
  };

  return (
    <Card className="flex h-[calc(100vh-16rem)] min-h-[420px] flex-col p-0 print:hidden">
      <div className="border-b border-slate-100 px-5 py-3.5">
        <h2 className="text-base font-semibold text-slate-800">Conversa</h2>
        <p className="text-xs text-slate-400">
          Fala com a equipa sobre este DUC. Menciona alguém com <span className="font-mono">@</span>{" "}
          para o notificar.
        </p>
      </div>

      {/* Mensagens */}
      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {loading ? (
          <Spinner label="A carregar conversa…" />
        ) : messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">
            Ainda não há mensagens. Sê o primeiro a escrever.
          </p>
        ) : (
          messages.map((m) => {
            const mine = businessUserId != null && m.author_id === businessUserId;
            return (
              <div key={m.id} className={cx("flex gap-2.5", mine && "flex-row-reverse")}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-semibold text-brand-800 ring-1 ring-inset ring-brand-100">
                  {initials(m.author_name)}
                </span>
                <div className={cx("min-w-0 max-w-[80%]", mine && "text-right")}>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="font-medium text-slate-600">{m.author_name ?? "—"}</span>
                    <span>{relTime(m.created_at)}</span>
                  </div>
                  <div
                    className={cx(
                      "mt-1 inline-block whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-left text-sm",
                      mine
                        ? "bg-brand text-white"
                        : "bg-slate-100 text-slate-700"
                    )}
                  >
                    {mine ? m.body : renderBody(m.body)}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Caixa de escrita + menções */}
      <div className="relative border-t border-slate-100 p-3">
        {mention && mentionOptions.length > 0 && (
          <div className="absolute bottom-full left-3 mb-1 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-elevated">
            {mentionOptions.map((mem) => (
              <button
                key={mem.id}
                type="button"
                onClick={() => insertMention(mem)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-50 text-[10px] font-semibold text-brand-800">
                  {initials(mem.name)}
                </span>
                {mem.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={taRef}
            value={draft}
            onChange={onDraftChange}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={2}
            placeholder="Escreve uma mensagem…  (@ para mencionar)"
            className="max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
          <Button onClick={() => void send()} disabled={sending || !draft.trim()}>
            Enviar
          </Button>
        </div>
      </div>
    </Card>
  );
}
