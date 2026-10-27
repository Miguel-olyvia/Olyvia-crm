// A conversa da obra (21/10/2026): o cliente escreve no portal, o gestor responde na página da obra (e vice-versa).
// Uma só conversa por obra (Negocio.obra.chat); no protótipo, as duas janelas veem-na ao vivo (storage).
import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MensagemObra } from "./motor";

const iniciais = (n: string) => n.split(" ").filter(Boolean).map((x) => x[0]).slice(0, 2).join("").toUpperCase();

export function Conversa({ msgs, eu, enviar, rapidas = [], vazio }: { msgs: MensagemObra[]; eu: "cliente" | "empresa"; enviar: (t: string) => void; rapidas?: string[]; vazio: string }) {
  const [texto, setTexto] = useState("");
  const fim = useRef<HTMLDivElement>(null), caixa = useRef<HTMLDivElement>(null);
  // a última mensagem à vista (só dentro da caixa: a página não salta)
  useEffect(() => { const c = caixa.current; if (c) c.scrollTop = c.scrollHeight; }, [msgs.length]);
  const mandar = (t: string) => { if (!t.trim()) return; enviar(t.trim()); setTexto(""); };
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)]">
      <div ref={caixa} className="max-h-[26rem] space-y-3 overflow-y-auto p-4" aria-live="polite">
        {!msgs.length && <p className="py-6 text-center text-[15px] text-muted-foreground">{vazio}</p>}
        {msgs.map((m, k) => {
          const meu = m.de === eu;
          return (
            <div key={k} className={cn("flex items-end gap-2 animate-in fade-in-0 slide-in-from-bottom-1", meu && "flex-row-reverse")}>
              <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold", m.de === "empresa" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")} aria-hidden="true">{iniciais(m.quem)}</span>
              <div className={cn("max-w-[80%] rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed", meu ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted text-foreground")}>
                <p className={cn("text-xs font-medium", meu ? "text-primary-foreground/80" : "text-muted-foreground")}>{m.quem} · {m.q}</p>
                <p>{m.t}</p>
              </div>
            </div>
          );
        })}
        <div ref={fim} />
      </div>
      {rapidas.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto border-t border-border px-3 pt-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {rapidas.map((r) => <button key={r} type="button" onClick={() => mandar(r)} className="min-h-9 shrink-0 rounded-full border border-input px-3 text-sm hover:border-foreground/40">{r}</button>)}
        </div>
      )}
      <form className="flex gap-2 p-3" onSubmit={(e) => { e.preventDefault(); mandar(texto); }}>
        <input value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Escrever uma mensagem" placeholder="Escrever uma mensagem"
          className="h-11 min-w-0 flex-1 rounded-full border border-input bg-background px-4 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        <button type="submit" disabled={!texto.trim()} aria-label="Enviar" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"><Send className="h-4 w-4" /></button>
      </form>
    </div>
  );
}
