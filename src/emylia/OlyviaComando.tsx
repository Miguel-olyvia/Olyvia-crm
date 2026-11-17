// 17/11 (Rúben, ideia WOW): a Olyvia por comando. Um botão flutuante que navega a app por voz ou texto: «abre os negócios», «vai ao
//  catálogo», «mostra o inventário», «procura o Nuno». Protótipo v1: só navegação e pesquisa.
// 17/11 (tarde): palavra de ativação «Olyvia». Com a «Escuta sempre» ligada, o browser ouve e só age quando apanha «Olyvia» seguido de um
//  comando («Olyvia, abre os negócios») — o efeito «sempre à escuta», mas sem mandar nada para um modelo (a compreensão é local) e com
//  um interruptor para desligar (privacidade). Sem «Escuta sempre», carrega-se o micro para falar. A voz é o Web Speech do browser (pt-PT);
//  sem ele, fica a caixa de texto. Esconde-se nas páginas públicas (login, formulários).
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Ear, Mic, MicOff, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { EV_ABRIR, EV_FASE, EV_PASSO, EV_PESQUISA, EV_RESPOSTA, extrairAposGatilho, interpretarComando, normal } from "./comandoOlyvia";
import { useGravacao } from "./gravador";

/** Os passos curtos e sem dúvida: agem logo, sem esperar que se pare de falar. */
const PASSOS_JA = new Set(["fim", "proximo", "anterior", "inicio"]);
/** Quanto silêncio (ms) chega para agir sem esperar que o browser dê a frase por acabada (o browser leva ~1 s). */
export const PAUSA_PARA_AGIR = 400;

// Web Speech API (SpeechRecognition): o mínimo que usamos, para não depender de tipos globais que o TS não traz.
interface ResultadoVoz { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }> }
interface Reconhecedor {
  lang: string; continuous: boolean; interimResults: boolean;
  onstart: (() => void) | null; onresult: ((e: ResultadoVoz) => void) | null;
  onerror: ((e: { error?: string }) => void) | null; onend: (() => void) | null;
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
export const EVENTO_PESQUISA = EV_PESQUISA;
const CHAVE_ESCUTA = "olyvia-escuta";
const EXEMPLOS = ["vai aos negócios", "abre o Ruben Branco na fase de negócio", "vai para o fim", "próximo passo", "vai ao catálogo"];
const avisa = (nome: string, detail: unknown) => window.dispatchEvent(new CustomEvent(nome, { detail }));

export function OlyviaComando() {
  const navigate = useNavigate();
  const loc = useLocation();
  const { pathname } = loc;
  // o endereço atual num ref, para o «executar» não mudar a cada navegação (reiniciaria a escuta contínua)
  const locRef = useRef(loc);
  locRef.current = loc;
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [aOuvir, setAOuvir] = useState(false);
  const [aviso, setAviso] = useState<{ msg: string; ok: boolean } | null>(null);
  const [escutaSempre, setEscutaSempre] = useState<boolean>(() => { try { return localStorage.getItem(CHAVE_ESCUTA) !== "0"; } catch { return true; } });
  const [aEscutar, setAEscutar] = useState(false);
  const recRef = useRef<Reconhecedor | null>(null);
  const ativoRef = useRef(false);
  const temVoz = useRef<boolean>(!!classeVoz());
  // 17/11 (Rúben): a escuta pausa sozinha enquanto se grava a visita ou a chamada (o gravador precisa do micro, e a conversa com o
  // cliente não é para dar ordens à Olyvia); volta quando a gravação pára. Nas páginas públicas também não ouve.
  const gravacao = useGravacao();
  const aGravar = gravacao.estado === "a_ligar" || gravacao.estado === "a_ouvir";
  // 17/11 (Rúben: «o microfone desativa e ativa nonstop»): o Chrome só deixa UM reconhecimento de voz ativo no browser inteiro — com dois
  // separadores da app abertos, cada um cancelava o do outro ao arrancar («aborted») e os dois reiniciavam sem parar. Agora só ouve o
  // separador que se está a usar (o último com clique, tecla ou foco: avisa os outros por um BroadcastChannel e eles cedem), e um
  // separador escondido não ouve.
  const meuId = useRef(Math.random().toString(36).slice(2));
  const canalRef = useRef<BroadcastChannel | null>(null);
  const [visivel, setVisivel] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");
  const [outroOuve, setOutroOuve] = useState(false);
  const reclamar = useCallback(() => {
    setOutroOuve(false);
    canalRef.current?.postMessage({ tipo: "quero", id: meuId.current });
  }, []);
  useEffect(() => {
    const canal = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("olyvia-escuta") : null;
    canalRef.current = canal;
    if (canal) canal.onmessage = (e: MessageEvent<{ tipo?: string; id?: string }>) => { if (e.data?.tipo === "quero" && e.data.id !== meuId.current) setOutroOuve(true); };
    const aoVer = () => { const v = document.visibilityState !== "hidden"; setVisivel(v); if (v && document.hasFocus()) reclamar(); };
    window.addEventListener("focus", reclamar);
    window.addEventListener("pointerdown", reclamar);
    window.addEventListener("keydown", reclamar);
    document.addEventListener("visibilitychange", aoVer);
    if (document.visibilityState !== "hidden" && document.hasFocus()) reclamar();
    return () => {
      canal?.close(); canalRef.current = null;
      window.removeEventListener("focus", reclamar);
      window.removeEventListener("pointerdown", reclamar);
      window.removeEventListener("keydown", reclamar);
      document.removeEventListener("visibilitychange", aoVer);
    };
  }, [reclamar]);
  const ligado = escutaSempre && !aGravar && !paginaPublica(pathname) && visivel && !outroOuve;

  const executar = useCallback((frase: string) => {
    const c = interpretarComando(frase);
    const fechar = (ms: number) => setTimeout(() => { setAberto(false); setTexto(""); }, ms);
    const naPaginaNegocios = locRef.current.pathname === "/negocios";
    switch (c.acao) {
      case "navegar":
        setAviso({ msg: `A abrir ${c.nome}…`, ok: true });
        navigate(c.url); fechar(1200);
        break;
      case "pesquisar":
        setAviso({ msg: `A procurar «${c.termo}»…`, ok: true });
        if (!naPaginaNegocios) navigate("/negocios");
        setTimeout(() => avisa(EV_PESQUISA, c.termo), naPaginaNegocios ? 0 : 80); fechar(1500);
        break;
      case "abrir-negocio":
        // os Negócios procuram o nome e abrem-no (na fase pedida) e respondem (EV_RESPOSTA)
        setAviso({ msg: `A abrir «${c.nome}»…`, ok: true });
        if (!naPaginaNegocios) navigate("/negocios");
        setTimeout(() => avisa(EV_ABRIR, { nome: c.nome, fase: c.fase }), naPaginaNegocios ? 0 : 120); fechar(1800);
        break;
      case "ir-fase":
      case "ir-passo":
        if (!new URLSearchParams(locRef.current.search).get("negocio")) { setAviso({ msg: "Abre primeiro um negócio — ex.: «abre o Ruben Branco».", ok: false }); break; }
        if (c.acao === "ir-fase") avisa(EV_FASE, { fase: c.fase }); else avisa(EV_PASSO, { passo: c.passo });
        fechar(1500);
        break;
      default:
        setAviso({ msg: "Não percebi. Tenta «vai aos negócios».", ok: false });
    }
  }, [navigate]);

  // a página que cumpriu o comando responde (ex.: «A abrir Ruben Branco · Negócio.», «Não há o passo X nesta fase.»)
  useEffect(() => {
    const h = (e: Event) => { const d = (e as CustomEvent<{ msg: string; ok: boolean }>).detail; if (d?.msg) setAviso(d); };
    window.addEventListener(EV_RESPOSTA, h);
    return () => window.removeEventListener(EV_RESPOSTA, h);
  }, []);
  // o aviso apaga-se sozinho
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 3200);
    return () => clearTimeout(t);
  }, [aviso]);

  // o «executar» num ref: a escuta contínua não depende dele (o navigate muda a cada página, e isso reiniciava e desligava a escuta)
  const executarRef = useRef(executar);
  executarRef.current = executar;

  // Carregar para falar (um comando de cada vez), quando a «Escuta sempre» está desligada.
  const ouvirUmaVez = useCallback(() => {
    const C = classeVoz();
    if (!C) { setAviso({ msg: "O browser não ouve aqui — escreve o comando.", ok: false }); return; }
    if (aGravar) { setAviso({ msg: "A gravação está a usar o micro — escreve o comando.", ok: false }); return; }
    if (aOuvir) { recRef.current?.stop(); return; }
    const r = new C();
    r.lang = "pt-PT"; r.continuous = false; r.interimResults = false;
    r.onstart = () => setAOuvir(true);
    r.onresult = (e) => { const frase = Array.from(e.results).map((x) => x[0]?.transcript ?? "").join(" "); setTexto(frase); if (frase) executar(frase); };
    r.onerror = () => setAviso({ msg: "Não deu para ouvir. Tenta outra vez ou escreve.", ok: false });
    r.onend = () => setAOuvir(false);
    recRef.current = r; setAviso(null);
    try { r.start(); } catch { setAOuvir(false); }
  }, [aOuvir, aGravar, executar]);

  useEffect(() => { try { localStorage.setItem(CHAVE_ESCUTA, escutaSempre ? "1" : "0"); } catch { /* ignore */ } }, [escutaSempre]);

  // diz quando pausa por causa de uma gravação e quando volta (só com a escuta ligada)
  const gravavaAntes = useRef(aGravar);
  useEffect(() => {
    if (gravavaAntes.current === aGravar) return;
    gravavaAntes.current = aGravar;
    if (escutaSempre) setAviso(aGravar ? { msg: "Em pausa enquanto se grava.", ok: true } : { msg: "Voltei a ouvir — diz «Olyvia…».", ok: true });
  }, [aGravar, escutaSempre]);

  // Modo «sempre à escuta»: ouve em contínuo e só age depois de «Olyvia». Só depende de estar ligada — mudar de página não a reinicia.
  // 17/11 (Rúben: «leva tempo a reagir»): não espera que o browser dê a frase por acabada (~1 s); age quando se pára de falar um instante
  // (PAUSA_PARA_AGIR), e logo nos passos curtos («fim», «próximo»). Também já não pára e volta a arrancar depois de cada comando (perdia o
  // que se dizia nesse intervalo): os resultados já usados ficam para trás (`usados`).
  useEffect(() => {
    ativoRef.current = ligado;
    if (!ligado) {
      const r = recRef.current; recRef.current = null; setAEscutar(false);
      if (r) { r.onend = null; try { r.stop(); } catch { /* ignore */ } }
      return;
    }
    const C = classeVoz();
    if (!C) return;
    let parado = false, precisaGesto = false, avisouGesto = false;
    // travão: cancelada logo ao arrancar várias vezes seguidas (outro programa ou separador antigo a usar o reconhecimento) → espaça os
    // reinícios e, à terceira, pára e avisa em vez de ficar a ligar e desligar o micro
    let cancelamentos = 0;
    let espera: ReturnType<typeof setTimeout> | null = null;
    const arrancar = () => {
      if (parado || recRef.current) return;
      const r = new C();
      r.lang = "pt-PT"; r.continuous = true; r.interimResults = true;
      let usados = 0, inicio = Date.now();
      r.onstart = () => { inicio = Date.now(); setAEscutar(true); };
      r.onresult = (e) => {
        cancelamentos = 0;
        if (espera) { clearTimeout(espera); espera = null; }
        const lista = Array.from(e.results);
        const txt = lista.slice(usados).map((x) => x[0]?.transcript ?? "").join(" ");
        const cmd = extrairAposGatilho(txt);
        if (!cmd) {
          // disse só «Olyvia»: fica à espera do resto
          if (/\bol[yi]via\b/.test(normal(txt))) setAviso({ msg: "Sim? Diz o que queres.", ok: true });
          return;
        }
        const final = !!lista[lista.length - 1]?.isFinal, ate = lista.length;
        const c = interpretarComando(cmd);
        const agir = () => {
          espera = null;
          // meia frase sem sentido ainda pode crescer: só se dá por não percebida quando acaba
          if (c.acao === "nada") { if (final) { usados = ate; setAviso({ msg: `Ouvi «${cmd}» — não percebi.`, ok: false }); } return; }
          usados = ate;
          executarRef.current(cmd);
        };
        if (final || (c.acao === "ir-passo" && PASSOS_JA.has(c.passo))) { agir(); return; }
        setAviso({ msg: `Olyvia: «${cmd}…»`, ok: true });
        if (c.acao !== "nada") espera = setTimeout(agir, PAUSA_PARA_AGIR);
      };
      r.onerror = (ev) => {
        // sem um gesto recente o browser recusa o micro: não se desliga a escolha — espera-se pelo próximo clique ou tecla
        if (ev?.error === "not-allowed" || ev?.error === "service-not-allowed") {
          precisaGesto = true;
          if (!avisouGesto) { avisouGesto = true; setAviso({ msg: "Toca em qualquer sítio para eu voltar a ouvir.", ok: false }); }
        } else if (ev?.error === "aborted" && Date.now() - inicio < 2000) cancelamentos++;
      };
      r.onend = () => {
        recRef.current = null; setAEscutar(false);
        if (Date.now() - inicio >= 2000) cancelamentos = 0;
        if (cancelamentos >= 3) {
          precisaGesto = true;
          setAviso({ msg: "O micro está ocupado noutro separador ou programa. Toca aqui para eu ouvir neste.", ok: false });
          return;
        }
        if (ativoRef.current && !parado && !precisaGesto) setTimeout(arrancar, cancelamentos ? 600 * cancelamentos : 100);
      };
      recRef.current = r;
      try { r.start(); } catch { recRef.current = null; }
    };
    arrancar();
    const noGesto = () => { precisaGesto = false; avisouGesto = false; cancelamentos = 0; if (ativoRef.current && !recRef.current) arrancar(); };
    window.addEventListener("pointerdown", noGesto);
    window.addEventListener("keydown", noGesto);
    return () => {
      parado = true;
      if (espera) clearTimeout(espera);
      window.removeEventListener("pointerdown", noGesto);
      window.removeEventListener("keydown", noGesto);
      const r = recRef.current; recRef.current = null;
      if (r) { r.onend = null; try { r.stop(); } catch { /* ignore */ } }
    };
  }, [ligado]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  if (paginaPublica(pathname)) return null;

  // 17/11: em baixo à direita, por cima da bolha do chat (à esquerda a barra lateral tapava metade do botão e cortava o painel)
  return (
    <div className="fixed bottom-20 right-5 z-[60] flex flex-col items-end gap-3 print:hidden">
      {aberto ? (
        <section aria-label="Comando da Olyvia" className="w-[min(92vw,22rem)] space-y-3 rounded-2xl border border-primary/30 bg-card p-4 shadow-[var(--shadow-lg,0_10px_30px_rgba(0,0,0,0.18))]">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight"><Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />Diz ou escreve o que queres</h2>
            <button type="button" aria-label="Fechar" className="rounded-lg p-1 text-muted-foreground hover:bg-accent" onClick={() => setAberto(false)}><X className="h-4 w-4" aria-hidden="true" /></button>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); if (texto.trim()) executar(texto); }} className="flex items-center gap-2">
            <input autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="ex.: abre os negócios"
              className="min-h-10 flex-1 rounded-xl border border-border bg-background px-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-primary/40" aria-label="Comando" />
            {temVoz.current && !escutaSempre && (
              <button type="button" aria-label={aOuvir ? "Parar de ouvir" : "Falar"} aria-pressed={aOuvir} onClick={ouvirUmaVez}
                className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl border transition-colors", aOuvir ? "border-destructive bg-destructive/10 text-destructive animate-pulse" : "border-border bg-background hover:bg-accent")}>
                <Mic className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </form>
          {aviso ? (
            <p role="status" className={cn("text-sm", aviso.ok ? "text-primary" : "text-muted-foreground")}>{aviso.msg}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Tenta: {EXEMPLOS.map((x) => <button key={x} type="button" onClick={() => executar(x)} className="mb-1 mr-1 rounded-full border border-border bg-background px-2 py-0.5 text-xs hover:bg-accent">{x}</button>)}</p>
          )}
          {temVoz.current && (
            <label className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2">
              <span className="flex items-center gap-2 text-sm"><Ear className="h-4 w-4 text-primary" aria-hidden="true" />{escutaSempre && aGravar ? "Escuta em pausa enquanto se grava" : escutaSempre && outroOuve ? "A ouvir noutro separador — toca aqui para usar neste" : "Escuta sempre — diz «Olyvia…»"}</span>
              <button type="button" role="switch" aria-checked={escutaSempre} aria-label="Escuta sempre" onClick={() => setEscutaSempre((v) => !v)}
                className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", escutaSempre ? "bg-primary" : "bg-muted")}>
                <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-all", escutaSempre ? "left-[22px]" : "left-0.5")} />
              </button>
            </label>
          )}
        </section>
      ) : aviso ? (
        <div role="status" className={cn("max-w-[min(80vw,18rem)] rounded-xl border px-3 py-2 text-sm shadow-[var(--shadow-md,0_6px_18px_rgba(0,0,0,0.14))]", aviso.ok ? "border-primary/40 bg-card text-primary" : "border-border bg-card text-muted-foreground")}>{aviso.msg}</div>
      ) : null}
      <button type="button" aria-expanded={aberto} aria-label={escutaSempre && aGravar ? "Olyvia — em pausa (a gravar)" : escutaSempre && outroOuve ? "Olyvia — a ouvir noutro separador" : aEscutar ? "Olyvia — à escuta" : "Olyvia — comando por voz"}
        onClick={() => { setAberto((v) => !v); setAviso(null); }}
        className={cn("group relative inline-flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-primary-foreground shadow-[var(--shadow-lg,0_10px_30px_rgba(0,0,0,0.25))] transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
          aEscutar && "ring-2 ring-primary/40")}>
        {aEscutar && <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-pulse rounded-full border-2 border-card bg-destructive" />}
        {escutaSempre && (aGravar || outroOuve) ? <MicOff className="h-5 w-5" aria-hidden="true" /> : aEscutar ? <Ear className="h-5 w-5" aria-hidden="true" /> : <Mic className="h-5 w-5" aria-hidden="true" />}
        <span className="text-[15px] font-semibold">Olyvia</span>
      </button>
    </div>
  );
}
