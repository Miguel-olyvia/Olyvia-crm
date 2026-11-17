// 17/11 (Rúben, ideia WOW): a Olyvia por comando. Um botão flutuante que ouve (ou lê) e salta para o sítio: «abre os negócios», «vai ao
//  catálogo», «mostra o inventário», «procura o Nuno». Protótipo v1: só navegação e pesquisa. A voz é o Web Speech do browser (grátis,
//  instantâneo, pt-PT); sem ele (ou sem microfone), fica a caixa de texto. Não está «sempre a ouvir»: carrega-se para falar (privado e
//  barato). A compreensão é determinística (comandoOlyvia.ts). Esconde-se nas páginas públicas (login, formulários).
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Mic, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { interpretarComando } from "./comandoOlyvia";

// Web Speech API (SpeechRecognition): o mínimo que usamos, para não depender de tipos globais que o TS não traz.
interface ResultadoVoz { results: ArrayLike<ArrayLike<{ transcript: string }>> }
interface Reconhecedor {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: ResultadoVoz) => void) | null; onerror: (() => void) | null; onend: (() => void) | null;
  start(): void; stop(): void;
}
type ConstrutorVoz = new () => Reconhecedor;
const classeVoz = (): ConstrutorVoz | null => {
  const w = window as unknown as { SpeechRecognition?: ConstrutorVoz; webkitSpeechRecognition?: ConstrutorVoz };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/** As páginas onde a Olyvia não aparece (login, formulários públicos, reservas). */
const ESCONDER = ["/auth", "/reset-password", "/escolher-acesso", "/form", "/lead-form", "/campaign", "/booking", "/admissao"];
const paginaPublica = (p: string) => p === "/" || ESCONDER.some((x) => p === x || p.startsWith(x + "/"));

/** O evento que o quadro de Negócios ouve para pôr o termo na pesquisa (NegociosEmylia.tsx). */
export const EVENTO_PESQUISA = "olyvia-pesquisa";

const EXEMPLOS = ["abre os negócios", "vai ao catálogo", "mostra o inventário", "procura o Nuno", "hoje"];

export function OlyviaComando() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [aOuvir, setAOuvir] = useState(false);
  const [aviso, setAviso] = useState<{ msg: string; ok: boolean } | null>(null);
  const recRef = useRef<Reconhecedor | null>(null);
  const temVoz = useRef<boolean>(!!classeVoz());

  const executar = useCallback((frase: string) => {
    const c = interpretarComando(frase);
    if (c.acao === "navegar") {
      setAviso({ msg: `A abrir ${c.nome}…`, ok: true });
      navigate(c.url);
      setTimeout(() => { setAberto(false); setAviso(null); setTexto(""); }, 700);
    } else if (c.acao === "pesquisar") {
      setAviso({ msg: `A procurar «${c.termo}»…`, ok: true });
      navigate("/negocios");
      // o quadro de Negócios põe o termo na pesquisa (ouve este evento)
      setTimeout(() => window.dispatchEvent(new CustomEvent(EVENTO_PESQUISA, { detail: c.termo })), 60);
      setTimeout(() => { setAberto(false); setAviso(null); setTexto(""); }, 900);
    } else {
      setAviso({ msg: "Não percebi. Tenta «abre os negócios».", ok: false });
    }
  }, [navigate]);

  const ouvir = useCallback(() => {
    const C = classeVoz();
    if (!C) { setAviso({ msg: "O browser não ouve aqui — escreve o comando.", ok: false }); return; }
    if (aOuvir) { recRef.current?.stop(); return; }
    const r = new C();
    r.lang = "pt-PT"; r.continuous = false; r.interimResults = false;
    r.onresult = (e) => { const frase = e.results?.[0]?.[0]?.transcript ?? ""; setTexto(frase); if (frase) executar(frase); };
    r.onerror = () => setAviso({ msg: "Não deu para ouvir. Tenta outra vez ou escreve.", ok: false });
    r.onend = () => setAOuvir(false);
    recRef.current = r;
    setAviso(null); setAOuvir(true);
    try { r.start(); } catch { setAOuvir(false); }
  }, [aOuvir, executar]);

  // fecha com Escape; pára o reconhecimento ao desmontar
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    window.addEventListener("keydown", h);
    return () => { window.removeEventListener("keydown", h); recRef.current?.stop(); };
  }, []);

  if (paginaPublica(pathname)) return null;

  return (
    <div className="fixed bottom-5 left-5 z-[60] flex flex-col items-start gap-3 print:hidden">
      {aberto && (
        <section aria-label="Comando da Olyvia" className="w-[min(92vw,22rem)] space-y-3 rounded-2xl border border-primary/30 bg-card p-4 shadow-[var(--shadow-lg,0_10px_30px_rgba(0,0,0,0.18))]">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight"><Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />Diz ou escreve o que queres</h2>
            <button type="button" aria-label="Fechar" className="rounded-lg p-1 text-muted-foreground hover:bg-accent" onClick={() => setAberto(false)}><X className="h-4 w-4" aria-hidden="true" /></button>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); if (texto.trim()) executar(texto); }} className="flex items-center gap-2">
            <input autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="ex.: abre os negócios"
              className="min-h-10 flex-1 rounded-xl border border-border bg-background px-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-primary/40" aria-label="Comando" />
            {temVoz.current && (
              <button type="button" aria-label={aOuvir ? "Parar de ouvir" : "Falar"} aria-pressed={aOuvir} onClick={ouvir}
                className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl border transition-colors", aOuvir ? "border-destructive bg-destructive/10 text-destructive animate-pulse" : "border-border bg-background hover:bg-accent")}>
                <Mic className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </form>
          {aviso ? (
            <p role="status" className={cn("text-sm", aviso.ok ? "text-primary" : "text-muted-foreground")}>{aviso.msg}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Tenta: {EXEMPLOS.map((x) => <button key={x} type="button" onClick={() => executar(x)} className="mr-1 rounded-full border border-border bg-background px-2 py-0.5 text-xs hover:bg-accent">{x}</button>)}</p>
          )}
        </section>
      )}
      <button type="button" aria-expanded={aberto} aria-label="Olyvia — comando por voz"
        onClick={() => { setAberto((v) => !v); setAviso(null); }}
        className="group inline-flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-primary-foreground shadow-[var(--shadow-lg,0_10px_30px_rgba(0,0,0,0.25))] transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
        <Mic className="h-5 w-5" aria-hidden="true" />
        <span className="text-[15px] font-semibold">Olyvia</span>
      </button>
    </div>
  );
}
