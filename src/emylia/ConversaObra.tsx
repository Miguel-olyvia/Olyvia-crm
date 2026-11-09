// A conversa da obra (21/10/2026): o cliente escreve no portal, o gestor responde na página da obra (e vice-versa).
// Uma só conversa por obra (Negocio.obra.chat); no protótipo, as duas janelas veem-na ao vivo (storage).
// 3/11 (Rúben): as mensagens podem levar fotografias (o cliente mostra um problema na obra). `fotoDe` lê cada uma pelo id (a base); uma
// imagem já em data URL (o protótipo) mostra-se tal como está. Com `anexar`, o campo tem o botão para juntar até 4 fotografias.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Camera, ImageOff, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NaFrente } from "./NaFrente";
import type { MensagemObra } from "./motor";

const iniciais = (n: string) => n.split(" ").filter(Boolean).map((x) => x[0]).slice(0, 2).join("").toUpperCase();
/** Até 4 fotografias por mensagem (a base recusa o resto). */
const MAX_FOTOS = 4;

/** As fotografias de uma mensagem: os ids da base, ou a imagem do protótipo. */
const fotosDaMensagem = (m: MensagemObra): string[] => (m.fotos?.length ? m.fotos : m.foto ? [m.foto] : []);

/** Uma fotografia: lê-se pelo id (ou já é a imagem); carregada, amplia-se ao tocar. */
export function FotoMensagem({ id, fotoDe, tam = "h-24 w-32", rotulo }: { id: string; fotoDe?: (id: string) => Promise<string>; tam?: string; rotulo: string }) {
  const direta = id.startsWith("data:") || id.startsWith("blob:") || id.startsWith("http");
  const [src, setSrc] = useState<string | null>(direta ? id : null);
  const [erro, setErro] = useState(false);
  const [aberta, setAberta] = useState(false);
  useEffect(() => {
    if (direta || !fotoDe) return;
    let vivo = true;
    setErro(false);
    fotoDe(id).then((s) => { if (vivo) setSrc(s); }, () => { if (vivo) setErro(true); });
    return () => { vivo = false; };
  }, [id, direta, fotoDe]);
  if (erro || (!src && !fotoDe)) {
    return <span className={cn("grid place-items-center rounded-lg border border-border bg-muted text-muted-foreground", tam)} role="img" aria-label={`${rotulo}: não foi possível abrir`}><ImageOff className="h-5 w-5" aria-hidden="true" /></span>;
  }
  if (!src) return <span className={cn("block animate-pulse rounded-lg bg-muted", tam)} role="status" aria-label={`${rotulo}: a carregar`} />;
  return (
    <>
      <button type="button" onClick={() => setAberta(true)} aria-label={`Ampliar: ${rotulo}`} className="overflow-hidden rounded-lg border border-border transition-transform hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-primary">
        <img src={src} alt="" className={cn("object-cover", tam)} />
      </button>
      {aberta && (
        <NaFrente>
        <div role="dialog" aria-modal="true" aria-label={rotulo} className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onClick={() => setAberta(false)}
          onKeyDown={(e) => { if (e.key === "Escape") setAberta(false); }}>
          <img src={src} alt={rotulo} className="max-h-[85vh] max-w-full rounded-lg object-contain" />
          <button type="button" autoFocus onClick={() => setAberta(false)} aria-label="Fechar" className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-white/90 text-black"><X className="h-5 w-5" /></button>
        </div>
        </NaFrente>
      )}
    </>
  );
}

/** As fotografias de uma mensagem, em fila. */
export function FotosMensagem({ m, fotoDe, tam }: { m: MensagemObra; fotoDe?: (id: string) => Promise<string>; tam?: string }) {
  const F = fotosDaMensagem(m);
  if (!F.length) return null;
  return <div className="mt-1.5 flex flex-wrap gap-1.5">{F.map((id, k) => <FotoMensagem key={id + k} id={id} fotoDe={fotoDe} tam={tam} rotulo={`Fotografia ${k + 1} de ${m.quem}`} />)}</div>;
}

/**
 * `enviar` pode devolver uma promessa (a conversa da base): o texto só se apaga se correu bem (devolver `false` = falhou), e enquanto envia
 * não se envia outra. Com `anexar`, recebe também as fotografias escolhidas (e a mensagem pode ir só com elas).
 * `acao`: o que se mostra por baixo de uma mensagem (ex.: «Tratar como problema», nas Operações).
 */
export function Conversa({ msgs, eu, enviar, rapidas = [], vazio, fotoDe, anexar, acao }: {
  msgs: MensagemObra[]; eu: "cliente" | "empresa"; enviar: (t: string, fotos?: File[]) => void | boolean | Promise<boolean | void>; rapidas?: string[]; vazio: string;
  fotoDe?: (id: string) => Promise<string>; anexar?: boolean; acao?: (m: MensagemObra, i: number) => ReactNode;
}) {
  const [texto, setTexto] = useState("");
  const [fotos, setFotos] = useState<File[]>([]);
  const [aMandar, setAMandar] = useState(false);
  const fim = useRef<HTMLDivElement>(null), caixa = useRef<HTMLDivElement>(null), ficheiro = useRef<HTMLInputElement>(null);
  // as pré-visualizações das fotografias escolhidas (libertam-se quando mudam)
  const [previas, setPrevias] = useState<string[]>([]);
  useEffect(() => {
    if (typeof URL.createObjectURL !== "function") { setPrevias([]); return; }
    const L = fotos.map((f) => URL.createObjectURL(f));
    setPrevias(L);
    return () => L.forEach((u) => URL.revokeObjectURL(u));
  }, [fotos]);
  // a última mensagem à vista (só dentro da caixa: a página não salta)
  useEffect(() => { const c = caixa.current; if (c) c.scrollTop = c.scrollHeight; }, [msgs.length]);
  const mandar = async (t: string, comFotos = fotos) => {
    const limpo = t.trim();
    if ((!limpo && !comFotos.length) || aMandar) return;
    setAMandar(true);
    try {
      const r = await (comFotos.length ? enviar(limpo, comFotos) : enviar(limpo));
      if (r !== false) { setTexto(""); setFotos([]); }
    } finally {
      setAMandar(false);
    }
  };
  const juntar = (L: FileList | null) => {
    if (!L) return;
    setFotos((F) => [...F, ...Array.from(L).filter((f) => f.type.startsWith("image/"))].slice(0, MAX_FOTOS));
    if (ficheiro.current) ficheiro.current.value = "";
  };
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)]">
      <div ref={caixa} className="max-h-[26rem] space-y-3 overflow-y-auto p-4" aria-live="polite">
        {!msgs.length && <p className="py-6 text-center text-[15px] text-muted-foreground">{vazio}</p>}
        {msgs.map((m, k) => {
          const meu = m.de === eu, extra = acao?.(m, k);
          return (
            <div key={m.id ?? k} className={cn("flex items-end gap-2 animate-in fade-in-0 slide-in-from-bottom-1", meu && "flex-row-reverse")}>
              <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold", m.de === "empresa" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")} aria-hidden="true">{iniciais(m.quem)}</span>
              <div className={cn("max-w-[80%]", meu && "flex flex-col items-end")}>
                <div className={cn("rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed", meu ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted text-foreground")}>
                  <p className={cn("text-xs font-medium", meu ? "text-primary-foreground/80" : "text-muted-foreground")}>{m.quem} · {m.q}</p>
                  <p>{m.t}</p>
                  <FotosMensagem m={m} fotoDe={fotoDe} />
                </div>
                {extra && <div className="mt-1">{extra}</div>}
              </div>
            </div>
          );
        })}
        <div ref={fim} />
      </div>
      {rapidas.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto border-t border-border px-3 pt-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {rapidas.map((r) => <button key={r} type="button" disabled={aMandar} onClick={() => void mandar(r, [])} className="min-h-9 shrink-0 rounded-full border border-input px-3 text-sm hover:border-foreground/40">{r}</button>)}
        </div>
      )}
      {anexar && fotos.length > 0 && (
        <ul aria-label="Fotografias a enviar" className="flex flex-wrap gap-2 border-t border-border px-3 pt-3">
          {fotos.map((f, k) => (
            <li key={k} className="relative">
              {previas[k] ? <img src={previas[k]} alt={`Fotografia ${k + 1} a enviar`} className="h-16 w-20 rounded-lg object-cover" /> : <span className="grid h-16 w-20 place-items-center rounded-lg bg-muted text-xs text-muted-foreground">{f.name}</span>}
              <button type="button" onClick={() => setFotos((F) => F.filter((_, j) => j !== k))} aria-label={`Tirar a fotografia ${k + 1}`}
                className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full border border-border bg-card shadow-sm hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
      <form className="flex gap-2 p-3" onSubmit={(e) => { e.preventDefault(); void mandar(texto); }}>
        {anexar && <>
          <input ref={ficheiro} type="file" accept="image/*" multiple className="sr-only" aria-label="Escolher fotografias" onChange={(e) => juntar(e.target.files)} />
          <button type="button" disabled={aMandar || fotos.length >= MAX_FOTOS} onClick={() => ficheiro.current?.click()} aria-label={`Juntar fotografias (até ${MAX_FOTOS})`} title="Juntar fotografias"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-input text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-40"><Camera className="h-4 w-4" aria-hidden="true" /></button>
        </>}
        <input value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Escrever uma mensagem" placeholder={anexar && fotos.length ? "Explique o que se vê (opcional)" : "Escrever uma mensagem"} maxLength={2000}
          className="h-11 min-w-0 flex-1 rounded-full border border-input bg-background px-4 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        <button type="submit" disabled={(!texto.trim() && !fotos.length) || aMandar} aria-label="Enviar" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"><Send className="h-4 w-4" aria-hidden="true" /></button>
      </form>
    </div>
  );
}
