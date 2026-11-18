// 17/11 (Rúben, ideia WOW): a Olyvia por comando. Um botão flutuante que navega a app por voz ou texto: «abre os negócios», «vai ao
//  catálogo», «mostra o inventário», «procura o Nuno». Protótipo v1: só navegação e pesquisa.
// 17/11 (tarde): palavra de ativação «Olyvia». Com a «Escuta sempre» ligada, o browser ouve e só age quando apanha «Olyvia» seguido de um
//  comando («Olyvia, abre os negócios») — o efeito «sempre à escuta», mas sem mandar nada para um modelo (a compreensão é local) e com
//  um interruptor para desligar (privacidade). Sem «Escuta sempre», carrega-se o micro para falar. A voz é o Web Speech do browser (pt-PT);
//  sem ele, fica a caixa de texto. Esconde-se nas páginas públicas (login, formulários).
// 18/11 (Rúben: «precisamos que entenda linguagem natural, que não corte nas gravações… quero controlar tudo por voz»):
//  · não corta: espera pelo fim do pensamento, não pela primeira pausa (esperaAteAgir em comandoOlyvia.ts);
//  · a IA vê o ecrã inteiro (ecraOlyvia.ts), faz pedidos de vários passos, responde a perguntas, lembra-se da conversa e fala;
//  · o que não se desfaz (enviar, apagar, assinar, pagar…) pede confirmação: «Vou carregar em "Enviar". Confirmas?» → «sim».
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Ear, Mic, MicOff, Sparkles, Volume2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DESTINOS, EV_ABRIR, EV_ESTUDIO, EV_FASE, EV_PASSO, EV_PESQUISA, EV_RESPOSTA, eConfirmacao, eRecusa, esperaAteAgir, extrairAposGatilho, extrairFase, interpretarComando, juntarLetras, limparFrase, normal, pedeParaParar, temGatilho, VERBO_PREENCHER } from "./comandoOlyvia";
import { acompanharFala, andarNaPagina, botaoPeloNome, escreverNaPesquisa, executarPlano, lerCampos, preencherPelaFrase, type Acao } from "./preencherOlyvia";
import { assentar, carregar, eIrreversivel, escolherEm, escreverEm, lerEcra, type Ecra } from "./ecraOlyvia";
import { supabase } from "@/integrations/supabase/client";

export { PAUSA_A_MEIO, PAUSA_CURTA, PAUSA_FRASE, PAUSA_ORDEM } from "./comandoOlyvia";

/** O primeiro botão à vista (fora da própria Olyvia) cujo texto bate certo. */
function botaoVisivel(rx: RegExp): HTMLButtonElement | null {
  for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>("button"))) {
    if (b.disabled || b.closest("[data-olyvia]")) continue;
    if (rx.test((b.textContent ?? "").replace(/\s+/g, " ").trim())) return b;
  }
  return null;
}

type AcaoIa = { tipo: string; elemento?: number | null; campo?: number | null; opcao?: number | null; n?: number | null; texto?: string | null; fase?: string | null };
interface RespostaIa { acoes: AcaoIa[]; resposta: string; continuar: boolean }
/** 17/11: a frase vai à IA (função olyvia-comando) com o ecrã. 18/11: o ecrã inteiro, a conversa e o que já se fez. Null se não houver resposta. */
async function perguntarIa(corpo: Record<string, unknown>): Promise<RespostaIa | null> {
  try {
    const { data, error } = await supabase.functions.invoke("olyvia-comando", { body: corpo });
    if (error || !data || !Array.isArray(data.acoes)) return null;
    return { acoes: data.acoes as AcaoIa[], resposta: String(data.resposta ?? ""), continuar: data.continuar === true };
  } catch { return null; }
}
import { useGravacao } from "./gravador";

/** Os passos curtos e sem dúvida: agem logo, sem esperar que se pare de falar. */
const PASSOS_JA = new Set(["fim", "proximo", "anterior", "inicio"]);
/** Quanto tempo (ms) fica acordada depois de «Olyvia» ou da última fala: entretanto, as ordens não precisam do nome. */
export const ACORDADA_MS = 60_000;
/** 17/11: uma frase com mais palavras do que isto é linguagem natural — vai primeiro à IA (as regras só apanham frases feitas).
 *  18/11: 8 → 6 («o que é que há para fazer hoje» saltava para o Hoje pela palavra solta). */
const PALAVRAS_FRASE_NATURAL = 6;
/** 18/11: quantos ecrãs seguidos a IA pode percorrer num pedido («abre o Carlos, vai à proposta e muda o prazo»). */
export const MAX_RONDAS = 6;
/** Quanto tempo (ms) uma pergunta «Confirmas?» fica à espera do «sim». */
export const CONFIRMAR_MS = 45_000;
const CHAVE_VOZ = "olyvia-voz";
const hojeTexto = () => { try { return new Date().toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); } catch { return ""; } };
const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

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
const EXEMPLOS = ["vai aos negócios", "abre o negócio do Carlos e vai à proposta", "quanto custa esta proposta?", "desce", "o que falta fazer aqui?"];
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
  const [acordada, setAcordada] = useState(false);
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

  const ultimoScroll = useRef<"baixo" | "cima" | null>(null);

  // 18/11 (Rúben: «falar com a AI»): a Olyvia responde em voz alta (pt-PT do browser) quando se lhe falou. Enquanto fala, o reconhecimento
  // pára (senão ouvia-se a si própria) e volta logo a seguir. A gravar uma visita nunca fala (ia para a gravação).
  const [respostaVoz, setRespostaVoz] = useState<boolean>(() => { try { return localStorage.getItem(CHAVE_VOZ) !== "0"; } catch { return true; } });
  const vozRef = useRef(respostaVoz);
  vozRef.current = respostaVoz;
  useEffect(() => { try { localStorage.setItem(CHAVE_VOZ, respostaVoz ? "1" : "0"); } catch { /* ignore */ } }, [respostaVoz]);
  const aGravarRef = useRef(aGravar);
  aGravarRef.current = aGravar;
  const aFalarRef = useRef(false);
  /** O «arrancar» da escuta contínua (o efeito põe-no aqui), para voltar a ouvir quando acaba de falar. */
  const retomarRef = useRef<(() => void) | null>(null);
  const falarAlto = useCallback((t: string) => {
    if (!vozRef.current || aGravarRef.current || !t.trim() || typeof window === "undefined" || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return;
    const s = window.speechSynthesis;
    const u = new SpeechSynthesisUtterance(t.replace(/[«»"]/g, ""));
    u.lang = "pt-PT"; u.rate = 1.05;
    const vozes = s.getVoices();
    const v = vozes.find((x) => /^pt[-_]PT/i.test(x.lang)) ?? vozes.find((x) => /^pt/i.test(x.lang));
    if (v) u.voice = v;
    aFalarRef.current = true;
    const r = recRef.current;
    if (r) { recRef.current = null; r.onend = null; try { r.stop(); } catch { /* ignore */ } setAEscutar(false); }
    let seguro: ReturnType<typeof setTimeout> | null = null;
    const acabar = () => {
      if (!aFalarRef.current) return;
      aFalarRef.current = false;
      if (seguro) clearTimeout(seguro);
      setTimeout(() => retomarRef.current?.(), 250);
    };
    u.onend = acabar; u.onerror = acabar;
    seguro = setTimeout(acabar, 2000 + t.length * 90); // o Chrome às vezes não avisa o fim
    s.cancel(); s.speak(u);
  }, []);

  // 18/11: o que não se desfaz espera por um «sim» (dito ou no botão)
  const pendenteRef = useRef<{ msg: string; fazer: () => Promise<void>; ate: number } | null>(null);
  const [pendente, setPendente] = useState<string | null>(null);
  const limparPendente = () => { pendenteRef.current = null; setPendente(null); };
  const pedirConfirmacao = (msg: string, porVoz: boolean, fazer: () => Promise<void>) => {
    pendenteRef.current = { msg, fazer, ate: Date.now() + CONFIRMAR_MS };
    setPendente(msg);
    if (porVoz) falarAlto(msg);
  };
  useEffect(() => {
    if (!pendente) return;
    const t = setTimeout(() => { if (pendenteRef.current && Date.now() >= pendenteRef.current.ate) limparPendente(); }, CONFIRMAR_MS + 50);
    return () => clearTimeout(t);
  }, [pendente]);

  // 18/11: a conversa (para «e o outro?», «abre esse»): as últimas trocas dos últimos 10 minutos
  const conversaRef = useRef<{ eu: string; olyvia: string; em: number }[]>([]);
  const lembrar = (eu: string, olyvia: string) => { conversaRef.current = [...conversaRef.current, { eu, olyvia, em: Date.now() }].slice(-8); };
  const conversaRecente = () => conversaRef.current.filter((c) => Date.now() - c.em < 600_000).slice(-6).map(({ eu, olyvia }) => ({ eu: eu.slice(0, 1500), olyvia: olyvia.slice(0, 600) }));

  /** Faz as ações da IA no ecrã que ela viu. Devolve o que fez, por palavras («carreguei em "Proposta"»), para a ronda seguinte. */
  const fazerAcoes = async (acoes: AcaoIa[], campos: ReturnType<typeof lerCampos>, ecra: Ecra): Promise<string[]> => {
    const feito: string[] = [];
    for (const a of acoes) {
      const t = a.texto ?? "";
      const loc = locRef.current;
      const naNeg = loc.pathname === "/negocios", noNeg = naNeg && !!new URLSearchParams(loc.search).get("negocio");
      const el = a.elemento != null ? ecra.nos[a.elemento] : undefined;
      const nome = a.elemento != null ? ecra.elementos[a.elemento]?.texto ?? "" : "";
      if (a.tipo === "opcao" || a.tipo === "contador" || a.tipo === "texto") {
        if (a.campo != null && campos[a.campo]) feito.push(...(await executarPlano(campos, [a as unknown as Acao])));
      } else if (a.tipo === "clicar") {
        if (el?.isConnected) { carregar(el); feito.push(`carreguei em «${nome}»`); await esperar(120); }
      } else if (a.tipo === "escrever") {
        if (el?.isConnected && escreverEm(el, t)) feito.push(`escrevi «${t}» em «${nome}»`);
      } else if (a.tipo === "escolher") {
        if (el?.isConnected) feito.push(escolherEm(el, t) ? `escolhi «${t}» em «${nome}»` : `abri a lista «${nome}»`);
      } else if (a.tipo === "navegar") {
        const d = DESTINOS.find((x) => x.nome === t);
        if (d) { navigate(d.url); feito.push(`fui a ${d.nome}`); }
      } else if (a.tipo === "scroll") { andarNaPagina(t as "baixo" | "cima" | "topo" | "fundo"); feito.push(`andei na página (${t})`); }
      else if (a.tipo === "voltar") { navigate(-1); feito.push("voltei à página anterior"); }
      else if (a.tipo === "passo") { if (noNeg) { avisa(EV_PASSO, { passo: t, tentar: true, ok: false }); feito.push(`fui ao passo ${t}`); } }
      else if (a.tipo === "limpar") { if (naNeg) avisa(EV_PESQUISA, ""); escreverNaPesquisa(""); feito.push("limpei a pesquisa"); }
      else if (a.tipo === "pesquisar") {
        if (!naNeg && escreverNaPesquisa(t)) feito.push(`procurei «${t}»`);
        else { if (!naNeg) navigate("/negocios"); setTimeout(() => avisa(EV_PESQUISA, t), naNeg ? 0 : 80); feito.push(`procurei «${t}» nos negócios`); }
      } else if (a.tipo === "abrir_negocio") {
        const fase = a.fase ? extrairFase(`fase de ${normal(a.fase)}`).fase : null;
        if (!naNeg) navigate("/negocios");
        setTimeout(() => avisa(EV_ABRIR, { nome: t, fase }), naNeg ? 0 : 120);
        feito.push(`abri o negócio de ${t}`);
        await esperar(400);
      }
    }
    return feito;
  };

  /** A IA no fim do pedido: mostra (e diz, se se falou) a resposta e guarda a troca na conversa. */
  const terminar = (frase: string, msg: string, ok: boolean, porVoz: boolean) => {
    lembrar(frase, msg);
    if (!msg) { setAviso({ msg: `Ouvi «${frase}».`, ok: false }); return; }
    setAviso({ msg, ok });
    if (porVoz) falarAlto(msg);
  };

  /**
   * 18/11 (Rúben: «quero controlar tudo por voz»): a IA vê o ecrã inteiro e faz; num pedido de vários passos, faz o que dá, olha para o
   * ecrã novo e segue (até MAX_RONDAS). Um clique que não se desfaz pára e pergunta «Confirmas?». False se a IA não respondeu à primeira.
   */
  const correrIa = async (frase: string, porVoz: boolean, feito: string[] = [], ronda0 = 0, vistos = new Set<string>()): Promise<boolean> => {
    for (let ronda = ronda0; ronda < MAX_RONDAS; ronda++) {
      setAviso({ msg: ronda === 0 ? `«${frase}» — a pensar…` : `${feito[feito.length - 1] ?? "…"} — a seguir…`, ok: true });
      const loc = locRef.current;
      const noNeg = loc.pathname === "/negocios" && !!new URLSearchParams(loc.search).get("negocio");
      const lista = { passo: "", listar: true, lista: [] as string[] };
      if (noNeg) avisa(EV_PASSO, lista);
      const campos = lerCampos().slice(0, 120);
      const cobertos = new Set<Element>(campos.flatMap((c) => [...(c.botoes ?? []), c.menos, c.mais, c.entrada].filter((x): x is NonNullable<typeof x> => !!x)));
      const ecra = lerEcra(cobertos);
      if (ronda > 0 && /sem permiss[aã]o/i.test(ecra.texto)) {
        terminar(frase, "Cheguei, mas não tens permissão para ver esta página.", false, porVoz);
        return true;
      }
      const r = await perguntarIa({
        frase: frase.slice(0, 1500), pagina: (loc.pathname + loc.search).slice(0, 300), passos: lista.lista.slice(0, 40), destinos: DESTINOS.map((d) => d.nome),
        campos: campos.map((c) => ({ rotulo: c.rotulo.slice(0, 200), tipo: c.tipo, ...(c.opcoes ? { opcoes: c.opcoes.map((o) => o.texto.slice(0, 120)) } : {}), ...(c.valor ? { valor: c.valor.slice(0, 300) } : {}) })),
        elementos: ecra.elementos, textoPagina: ecra.texto, conversa: conversaRecente(), feito: feito.slice(-40), hoje: hojeTexto(),
      });
      if (!r) {
        if (ronda === 0) return false;
        terminar(frase, `Fiz parte (${feito.slice(-2).join(", ")}), mas o resto não consegui.`, false, porVoz);
        return true;
      }
      // 18/11 (testarh): a IA não anda às voltas. Repetir o que já fez neste pedido (a mesma página, as mesmas ações) é parar.
      const assinatura = JSON.stringify(r.acoes.map((a) => a.tipo === "clicar" || a.tipo === "escrever" || a.tipo === "escolher" ? { ...a, elemento: ecra.elementos[a.elemento ?? -1]?.texto } : a));
      const repete = r.acoes.length > 0 && (vistos.has(assinatura) || r.acoes.every((a) => a.tipo === "navegar" && feito.includes(`fui a ${a.texto}`)));
      vistos.add(assinatura);
      if (repete) {
        terminar(frase, r.resposta && !r.continuar ? r.resposta : "Não encontro isso aqui. Diz-me onde está, ou de outra maneira.", false, porVoz);
        return true;
      }
      // o que não se desfaz: faz-se o que vem antes, e pergunta-se
      const k = r.acoes.findIndex((a) => a.tipo === "clicar" && a.elemento != null && eIrreversivel(ecra.elementos[a.elemento]?.texto ?? ""));
      feito.push(...(await fazerAcoes(k === -1 ? r.acoes : r.acoes.slice(0, k), campos, ecra)));
      if (k !== -1) {
        const nome = ecra.elementos[r.acoes[k].elemento!]?.texto ?? "";
        const resto = [r.acoes[k], ...r.acoes.slice(k + 1).filter((a) => !(a.tipo === "clicar" && a.elemento != null && eIrreversivel(ecra.elementos[a.elemento]?.texto ?? "")))];
        pedirConfirmacao(`Vou carregar em «${nome}». Confirmas?`, porVoz, async () => {
          feito.push(...(await fazerAcoes(resto, campos, ecra)));
          if (r.continuar || resto.length < r.acoes.length - k) { await assentar(); await correrIa(frase, porVoz, feito, ronda + 1, vistos); }
          else terminar(frase, r.resposta || `Carreguei em «${nome}».`, true, porVoz);
        });
        return true;
      }
      if (!r.continuar) {
        terminar(frase, r.resposta || (feito.length ? "Feito." : ""), feito.length > 0 || !!r.resposta, porVoz);
        return true;
      }
      await assentar();
    }
    terminar(frase, feito.length ? `Fiz isto: ${feito.slice(-3).join(", ")}.` : "Não consegui acabar.", feito.length > 0, porVoz);
    return true;
  };

  const executar = useCallback(async (fraseDita: string, porVoz = false) => {
    const frase = fraseDita.trim();
    // 18/11: a resposta a «Confirmas?»
    const p = pendenteRef.current;
    if (p) {
      limparPendente();
      if (Date.now() < p.ate) {
        if (eConfirmacao(frase)) { setAviso({ msg: "A fazer…", ok: true }); await p.fazer(); return; }
        if (eRecusa(frase)) { setAviso({ msg: "Está bem, não faço.", ok: true }); if (porVoz) falarAlto("Está bem, não faço."); return; }
      }
    }
    const c = interpretarComando(frase);
    const fechar = (ms: number) => setTimeout(() => { setAberto(false); setTexto(""); }, ms);
    const naPaginaNegocios = locRef.current.pathname === "/negocios";
    const noNegocio = naPaginaNegocios && !!new URLSearchParams(locRef.current.search).get("negocio");
    const limpa = limparFrase(juntarLetras(normal(frase)).replace(/^(?:ok |o |a )?o ?l[iy]via\s*/, ""));

    const viaIa = (): Promise<boolean> => correrIa(frase, porVoz);

    // 17/11 (Rúben: «no Estúdio falta ele trabalhar também»): no Estúdio, a frase vai primeiro ao projeto (passos, alturas, peças,
    // cores — estudioPorVoz.ts); o que ele não souber fazer segue o caminho de sempre (gravar, navegar, IA)
    if (locRef.current.pathname.startsWith("/prototipo/estudio") && c.acao !== "gravar" && c.acao !== "navegar") {
      const det = { frase: frase.replace(/^\s*(?:ok\s+|ó\s+)?o\s?l[iíy]via[\s,.:!]*/i, ""), ok: false, msg: "" };
      avisa(EV_ESTUDIO, det);
      if (det.ok) { setAviso({ msg: det.msg, ok: true }); return; }
    }

    // 17/11 (Rúben: «tudo por voz»): o nome de um botão à vista carrega nele («escolher o estilo», «aplicar o estilo», «desfazer»,
    // «todos», «gravar a visita»); o que não se desfaz (enviar, apagar, assinar…) nunca se carrega por voz
    if (c.acao === "nada" || c.acao === "abrir-negocio" || c.acao === "ir-passo") {
      const b = botaoPeloNome(limpa);
      if (b) { b.click(); setAviso({ msg: `«${(b.textContent ?? "").replace(/\s+/g, " ").trim() || b.getAttribute("aria-label")}»`, ok: true }); return; }
    }

    // 17/11 (Rúben: «se a plataforma não entender linguagem natural por voz, isto é inútil»): uma frase natural (comprida) vai
    // primeiro à IA, que a percebe toda («não vai haver contentor, o prédio tem 4 andares e estamos no primeiro»); as regras por
    // palavras-chave só apanham frases feitas e enganam-se nas compridas («obra… hoje» saltava para o Hoje). Sem IA, seguem as regras.
    if (limpa.split(" ").length > PALAVRAS_FRASE_NATURAL) {
      if (await viaIa()) return;
      // sem IA: de uma frase comprida só se aproveita o que responde às perguntas do ecrã (navegar por uma palavra solta enganava-se);
      // 18/11: uma ordem clara e ainda curta («abre o Ruben Branco na fase de negócio») segue para as regras, como antes
      const ordemClara = c.acao !== "nada" && c.acao !== "navegar" && limpa.split(" ").length <= 9;
      if (!ordemClara) {
        const feito = await preencherPelaFrase(limpa);
        setAviso(feito.length ? { msg: `Feito — ${feito.join(" · ")}.`, ok: true } : { msg: `Ouvi «${frase.trim()}» — não percebi.`, ok: false });
        return;
      }
    }

    // 17/11 (Rúben): «volta para trás» = a página anterior; «mais» repete o último scroll
    if (c.acao === "voltar") { navigate(-1); setAviso({ msg: "Página anterior.", ok: true }); return; }
    if (c.acao === "mais") {
      if (!ultimoScroll.current) { setAviso({ msg: "Mais o quê? Diz, por exemplo, «desce».", ok: false }); return; }
      andarNaPagina(ultimoScroll.current);
      setAviso({ msg: ultimoScroll.current === "baixo" ? "A descer mais." : "A subir mais.", ok: true });
      return;
    }
    // 17/11 (gravação do Rúben): andar na página e limpar a pesquisa, em qualquer página
    if (c.acao === "scroll") {
      ultimoScroll.current = c.para === "cima" || c.para === "topo" ? "cima" : "baixo";
      andarNaPagina(c.para);
      setAviso({ msg: c.para === "baixo" ? "A descer." : c.para === "cima" ? "A subir." : c.para === "topo" ? "Topo da página." : "Fundo da página.", ok: true });
      return;
    }
    if (c.acao === "gravar") {
      // 17/11 (Rúben: «isto vai substituir a gravação da chamada»): carrega nos botões do painel da chamada / da visita, para o fim da
      // gravação (preencher os campos, a análise) seguir igual
      const botao = botaoVisivel(c.ligar ? /^(?:Começar a gravar|Iniciar chamada|Continuar a gravar)$/ : /^Terminar e preencher$/);
      if (botao) { botao.click(); setAviso({ msg: c.ligar ? "A gravar a conversa. Para uma ordem, diz «Olyvia, …»." : "Gravação terminada — a preencher os campos.", ok: true }); }
      else setAviso({ msg: c.ligar ? "Para gravar, abre um negócio no Contacto ou na Visita." : "Não há nenhuma gravação a decorrer.", ok: false });
      return;
    }
    if (c.acao === "limpar-pesquisa") {
      if (naPaginaNegocios) avisa(EV_PESQUISA, "");
      const ok = escreverNaPesquisa("") || naPaginaNegocios;
      setAviso(ok ? { msg: "Pesquisa limpa.", ok: true } : { msg: "Não há pesquisa nesta página.", ok: false });
      return;
    }
    // preencher o que está no ecrã («acesso fácil, estacionamento pago»): quando a frase não é outra ordem, ou começa por «põe/marca…»
    if (c.acao === "nada" || (VERBO_PREENCHER.test(limpa) && c.acao !== "navegar")) {
      const feito = await preencherPelaFrase(limpa);
      if (feito.length) { setAviso({ msg: `Feito — ${feito.join(" · ")}.`, ok: true }); return; }
    }
    // dentro de um negócio, um nome que é um passo («exterior do edifício», «abre as necessidades») vai para esse passo
    if (noNegocio && (c.acao === "nada" || c.acao === "abrir-negocio" || c.acao === "pesquisar")) {
      const alvo = c.acao === "abrir-negocio" ? c.nome : c.acao === "pesquisar" ? c.termo : limpa.replace(/^(?:vai|vamos|abre|mostra|passa)\s+(?:(?:para|pra|ao|a|o|as|os|no|na)\s+)*/, "");
      const pedido = { passo: alvo, tentar: true, ok: false };
      avisa(EV_PASSO, pedido);
      if (pedido.ok) return;
    }
    // procurar noutra página com pesquisa própria (Pessoas, Catálogo…): escreve ali, sem saltar para os Negócios
    if (c.acao === "pesquisar" && !naPaginaNegocios && !/\bnegocio/.test(limpa) && escreverNaPesquisa(c.termo)) {
      setAviso({ msg: `A procurar «${c.termo}».`, ok: true });
      return;
    }
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
        // 17/11: as regras não perceberam — pergunta à IA com o que está no ecrã (olyvia-comando); sem ela, diz o que ouviu
        if (!(await viaIa())) setAviso({ msg: `Ouvi «${frase.trim()}» — não percebi. Tenta «vai aos negócios», «desce» ou «acesso fácil».`, ok: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- o resto são refs e setters estáveis
  }, [navigate, falarAlto]);

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

  // Carregar para falar (um pedido de cada vez), quando a «Escuta sempre» está desligada.
  // 18/11 (Rúben: «que não corte»): antes o browser acabava na primeira pausa; agora ouve até se calar a sério (esperaAteAgir) ou até se
  // carregar outra vez no micro, e o ecrã acompanha as perguntas de que se fala.
  const acabarUmaVez = useRef<(() => void) | null>(null);
  const ouvirUmaVez = useCallback(() => {
    const C = classeVoz();
    if (!C) { setAviso({ msg: "O browser não ouve aqui — escreve o comando.", ok: false }); return; }
    if (aGravar) { setAviso({ msg: "A gravação está a usar o micro — escreve o comando.", ok: false }); return; }
    if (aOuvir) { acabarUmaVez.current?.(); return; }
    const r = new C();
    r.lang = "pt-PT"; r.continuous = true; r.interimResults = true;
    let dito = "", feito = false, t: ReturnType<typeof setTimeout> | null = null;
    const acabar = () => {
      if (feito) return;
      feito = true; acabarUmaVez.current = null;
      if (t) clearTimeout(t);
      try { r.stop(); } catch { /* ignore */ }
      if (dito.trim()) void executar(dito.trim(), true);
    };
    acabarUmaVez.current = acabar;
    r.onstart = () => setAOuvir(true);
    r.onresult = (e) => {
      const lista = Array.from(e.results);
      dito = lista.map((x) => x[0]?.transcript ?? "").join(" ").replace(/\s+/g, " ").trim();
      setTexto(dito);
      acompanharFala(dito);
      if (t) clearTimeout(t);
      t = setTimeout(acabar, esperaAteAgir(dito, interpretarComando(dito), !!lista[lista.length - 1]?.isFinal));
    };
    r.onerror = (ev) => { if (ev?.error !== "no-speech" && ev?.error !== "aborted") setAviso({ msg: "Não deu para ouvir. Tenta outra vez ou escreve.", ok: false }); };
    r.onend = () => { setAOuvir(false); acabar(); };
    recRef.current = r; setAviso(null);
    try { r.start(); } catch { setAOuvir(false); acabarUmaVez.current = null; }
  }, [aOuvir, aGravar, executar]);

  useEffect(() => { try { localStorage.setItem(CHAVE_ESCUTA, escutaSempre ? "1" : "0"); } catch { /* ignore */ } }, [escutaSempre]);

  // diz quando pausa por causa de uma gravação e quando volta (só com a escuta ligada)
  const gravavaAntes = useRef(aGravar);
  useEffect(() => {
    if (gravavaAntes.current === aGravar) return;
    gravavaAntes.current = aGravar;
    if (escutaSempre) setAviso(aGravar ? { msg: "A ouvir a conversa. Para uma ordem, diz «Olyvia, …».", ok: true } : { msg: "Voltei a ouvir — diz «Olyvia…».", ok: true });
  }, [aGravar, escutaSempre]);

  // 17/11 (Rúben: «isto vai substituir a gravação da chamada; ele também vai estar a ouvir o cliente e a tomar anotações»): enquanto
  // se grava, o micro é do gravador (um só micro: no telemóvel não dá para dois) e a Olyvia ouve pelas falas que ele transcreve. A
  // conversa toda vai para as notas e os campos (como antes); as ordens começam por «Olyvia, …» (decidido com o Rúben, para o que o
  // cliente diz nunca ser tomado como ordem). Só «Olyvia»: a fala seguinte, nos 10 s, é a ordem. As falas revistas (a 2.ª passagem)
  // não contam outra vez.
  const ultimaFala = useRef<number | null>(null);
  const esperaOrdem = useRef(0);
  useEffect(() => {
    const fs = gravacao.falas ?? [];
    // ao abrir (ou numa gravação que continua), as falas que já lá estavam não são ordens novas
    if (ultimaFala.current === null) { ultimaFala.current = fs.reduce((m, f) => Math.max(m, f.inicio), -1); return; }
    if (!fs.length) { ultimaFala.current = -1; return; }
    if (!escutaSempre) return;
    for (const f of fs) {
      if (f.revista || f.inicio <= ultimaFala.current) continue;
      ultimaFala.current = f.inicio;
      const t = f.texto ?? "";
      // 18/11 (Rúben): enquanto se fala das perguntas do formulário, o ecrã acompanha (desliza até à pergunta de que se fala)
      acompanharFala(t);
      if (temGatilho(t)) {
        const cmd = extrairAposGatilho(t);
        if (cmd && !pedeParaParar(cmd)) { esperaOrdem.current = 0; void executarRef.current(cmd, true); }
        else { esperaOrdem.current = Date.now() + 10_000; setAviso({ msg: "Sim? Diz a ordem.", ok: true }); }
      } else if (esperaOrdem.current > Date.now()) {
        esperaOrdem.current = 0;
        void executarRef.current(t, true);
      }
    }
  }, [gravacao.falas, escutaSempre]);

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
    /** 18/11: o que está à espera da pausa; se o browser fechar a sessão de reconhecimento entretanto, faz-se logo (não se perde). */
    let agirPendente: (() => void) | null = null;
    /** A última ordem feita (para completar uma dita aos bocados: «abre o Carlos» … «Mendes»). */
    let ultima: { frase: string; acao: string; em: number } | null = null;
    // 17/11 (Rúben: «é chato estar sempre a dizer Olyvia, a primeira vez chega»): «Olyvia» acorda-a; acordada, as frases curtas são
    // ordens sem o nome. Cada ordem renova o tempo; ACORDADA_MS sem ordens, ou «obrigado / chega», e volta a precisar de «Olyvia».
    let acordadaAte = 0;
    let sono: ReturnType<typeof setTimeout> | null = null;
    const estaAcordada = () => Date.now() < acordadaAte;
    const adormecer = (msg?: string) => {
      acordadaAte = 0; if (sono) clearTimeout(sono); sono = null; setAcordada(false);
      if (msg) setAviso({ msg, ok: true });
    };
    const acordar = () => {
      acordadaAte = Date.now() + ACORDADA_MS; setAcordada(true);
      if (sono) clearTimeout(sono);
      sono = setTimeout(() => adormecer("Fico à espera — diz «Olyvia» quando precisares."), ACORDADA_MS);
    };
    const arrancar = () => {
      if (parado || recRef.current) return;
      const r = new C();
      r.lang = "pt-PT"; r.continuous = true; r.interimResults = true;
      // 17/11 (Rúben: «disse "agora abre o Carlos Mendes" e ele apanhou "Carlos", parou, depois "Mendes", e não fez nada; devia estar
      // sempre a ouvir tudo sem cortar»): quando age a meio de uma frase (numa pausa), o que se disse a seguir NÃO se perde — guarda-se
      // quantas palavras do resultado ainda em curso já foram usadas (`prefixo`) e o resto continua a contar
      let usados = 0, prefixo = 0, inicio = Date.now();
      r.onstart = () => { inicio = Date.now(); setAEscutar(true); };
      r.onresult = (e) => {
        cancelamentos = 0;
        if (espera) { clearTimeout(espera); espera = null; }
        agirPendente = null;
        const lista = Array.from(e.results);
        const partes = lista.slice(usados).map((x) => x[0]?.transcript ?? "");
        if (prefixo && partes.length) partes[0] = partes[0].trim().split(/\s+/).slice(prefixo).join(" ");
        const txt = partes.join(" ").replace(/\s+/g, " ").trim();
        const final = !!lista[lista.length - 1]?.isFinal, ate = lista.length;
        if (!txt) { if (final) { usados = ate; prefixo = 0; } return; }
        const comGatilho = temGatilho(txt);
        // 17/11 (gravação do Rúben: falava em frases naturais e ela adormecia a meio): acordada, qualquer fala renova o tempo — não só as
        // ordens que resultam
        if (comGatilho || estaAcordada()) acordar();
        if (pedeParaParar(txt)) { if (final) { usados = ate; adormecer("Até já — diz «Olyvia» quando precisares."); } return; }
        let cmd = extrairAposGatilho(txt);
        if (!cmd) {
          // disse só «Olyvia»: acordada, à espera
          if (comGatilho) { if (final) usados = ate; setAviso({ msg: "Sim? Estou a ouvir — podes falar à vontade.", ok: true }); return; }
          if (!estaAcordada()) return; // a dormir: sem «Olyvia», não é com ela
          cmd = normal(txt);
        }
        // 17/11 (gravação do Rúben: «estou a falar em linguagem natural e não regista nada»): as frases naturais são compridas — antes,
        // mais de 9 palavras era «conversa à volta» e deitava-se fora sem dizer nada. Agora, acordada, tudo conta (a IA percebe-as);
        // só um monólogo enorme fica de fora
        if (!comGatilho && normal(cmd).split(" ").length > 60) { if (final) usados = ate; return; }
        const c = interpretarComando(cmd);
        // 18/11 (Rúben: «enquanto vai falando os campos do formulário, a AI vai fazendo scroll sozinha para acompanhar»)
        acompanharFala(cmd);
        const agir = () => {
          espera = null; agirPendente = null;
          // o resultado ainda em curso fica: só as palavras já usadas saem (o que vier a seguir nele continua a contar)
          if (final) { usados = ate; prefixo = 0; }
          else { usados = ate - 1; prefixo = (lista[ate - 1]?.[0]?.transcript ?? "").trim().split(/\s+/).filter(Boolean).length; }
          acordar(); // cada ordem renova o tempo acordada
          // o resto de uma ordem dita aos bocados («abre o Carlos» … «Mendes»): junta-se à ordem de antes e faz-se outra vez, completa
          let frase = cmd!;
          if (ultima && Date.now() - ultima.em < 6000 && c.acao === "nada" && (ultima.acao === "abrir-negocio" || ultima.acao === "pesquisar")) {
            const junto = `${ultima.frase} ${frase}`;
            if (interpretarComando(junto).acao === ultima.acao) frase = junto;
          }
          ultima = { frase, acao: interpretarComando(frase).acao, em: Date.now() };
          void executarRef.current(frase, true);
        };
        if (c.acao === "ir-passo" && PASSOS_JA.has(c.passo) && normal(cmd).split(" ").length <= 5) { agir(); return; }
        setAviso({ msg: `«${txt}…»`, ok: true });
        // 18/11 (Rúben: «que não corte; se a pessoa fizer uma pequena pausa, ele não quebra»): o «fim de frase» do browser (~0,7 s de
        // silêncio) já não chega para agir — espera-se pelo fim do pensamento, contado desde a última palavra ouvida: curto nas ordens
        // feitas, mais longo numa frase natural, e bem mais longo se a frase acaba a meio («… do», «… e», «hum»). Cada palavra nova recomeça.
        espera = setTimeout(agir, esperaAteAgir(cmd, c, final));
        agirPendente = agir;
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
        if (agirPendente) { if (espera) clearTimeout(espera); espera = null; const f = agirPendente; agirPendente = null; f(); }
        if (Date.now() - inicio >= 2000) cancelamentos = 0;
        if (cancelamentos >= 3) {
          precisaGesto = true;
          setAviso({ msg: "O micro está ocupado noutro separador ou programa. Toca aqui para eu ouvir neste.", ok: false });
          return;
        }
        if (ativoRef.current && !parado && !precisaGesto && !aFalarRef.current) setTimeout(arrancar, cancelamentos ? 600 * cancelamentos : 100);
      };
      recRef.current = r;
      // 17/11 (Rúben: «às vezes deixa de ouvir, não sei porquê»): se o browser recusa arrancar (ainda a fechar a sessão anterior), antes
      // ficava assim para sempre; agora tenta de novo daqui a pouco
      try { r.start(); } catch { recRef.current = null; setTimeout(arrancar, 800); }
    };
    arrancar();
    retomarRef.current = () => { if (ativoRef.current && !parado && !aFalarRef.current) arrancar(); };
    // e uma vigia: ligada, sem reconhecimento ativo e sem estar à espera de um toque → volta a ouvir (o Chrome às vezes termina sem «end»)
    const vigia = setInterval(() => { if (ativoRef.current && !parado && !precisaGesto && !recRef.current && !aFalarRef.current) arrancar(); }, 4000);
    const noGesto = () => { precisaGesto = false; avisouGesto = false; cancelamentos = 0; if (ativoRef.current && !recRef.current) arrancar(); };
    window.addEventListener("pointerdown", noGesto);
    window.addEventListener("keydown", noGesto);
    return () => {
      parado = true;
      retomarRef.current = null;
      clearInterval(vigia);
      if (espera) clearTimeout(espera);
      if (sono) clearTimeout(sono);
      setAcordada(false);
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

  // 17/11: a gravar, a Olyvia não está em pausa — ouve a conversa pelo gravador (as ordens com «Olyvia, …»)
  const naConversa = escutaSempre && aGravar;
  const emPausa = escutaSempre && !aGravar && outroOuve;
  const rotulo = naConversa ? "Olyvia — a ouvir a conversa (diz «Olyvia, …»)" : emPausa ? "Olyvia — a ouvir noutro separador"
    : acordada ? "Olyvia — a ouvir-te" : aEscutar ? "Olyvia — à escuta (diz «Olyvia»)" : "Olyvia — comando por voz";

  // 17/11 (Rúben: «mete o ícone de uma ovelha ao lado do ícone do chat»): um botão redondo do mesmo tamanho do chat, mesmo à esquerda
  // dele (InternalChatWidget: bottom-4 right-4, 48 px; sm: bottom-6 right-6, 56 px). O painel e os avisos abrem por cima.
  return (
    <div data-olyvia="" className="fixed bottom-4 right-[4.75rem] z-[500] flex flex-col items-end gap-3 print:hidden sm:bottom-6 sm:right-[5.75rem]">
      {/* 18/11: o que não se desfaz espera por um «sim» (dito ou aqui) */}
      {pendente && (
        <div role="alertdialog" aria-label="Confirmar" className="w-[min(calc(100vw-6rem),20rem)] space-y-2 rounded-2xl border border-primary/40 bg-card p-3 shadow-[var(--shadow-lg,0_10px_30px_rgba(0,0,0,0.18))]">
          <p className="text-sm font-medium">{pendente}</p>
          <p className="text-xs text-muted-foreground">Diz «sim» ou «não».</p>
          <div className="flex gap-2">
            <button type="button" className="min-h-9 flex-1 rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              onClick={() => { const p = pendenteRef.current; limparPendente(); if (p) { setAviso({ msg: "A fazer…", ok: true }); void p.fazer(); } }}>Confirmar</button>
            <button type="button" className="min-h-9 flex-1 rounded-xl border border-border bg-background px-3 text-sm hover:bg-accent"
              onClick={() => { limparPendente(); setAviso({ msg: "Está bem, não faço.", ok: true }); }}>Cancelar</button>
          </div>
        </div>
      )}
      {aberto ? (
        <section aria-label="Comando da Olyvia" className="w-[min(calc(100vw-6rem),22rem)] space-y-3 rounded-2xl border border-primary/30 bg-card p-4 shadow-[var(--shadow-lg,0_10px_30px_rgba(0,0,0,0.18))]">
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
          {pendente ? null : aviso ? (
            <p role="status" className={cn("text-sm", aviso.ok ? "text-primary" : "text-muted-foreground")}>{aviso.msg}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Tenta: {EXEMPLOS.map((x) => <button key={x} type="button" onClick={() => executar(x)} className="mb-1 mr-1 rounded-full border border-border bg-background px-2 py-0.5 text-xs hover:bg-accent">{x}</button>)}</p>
          )}
          <label className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2">
            <span className="flex items-center gap-2 text-sm"><Volume2 className="h-4 w-4 text-primary" aria-hidden="true" />Responder em voz alta</span>
            <button type="button" role="switch" aria-checked={respostaVoz} aria-label="Responder em voz alta" onClick={() => setRespostaVoz((v) => !v)}
              className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", respostaVoz ? "bg-primary" : "bg-muted")}>
              <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-all", respostaVoz ? "left-[22px]" : "left-0.5")} />
            </button>
          </label>
          {temVoz.current && (
            <label className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2">
              <span className="flex items-center gap-2 text-sm"><Ear className="h-4 w-4 text-primary" aria-hidden="true" />{naConversa ? "A ouvir a conversa e a tomar notas — para uma ordem, diz «Olyvia, …»" : emPausa ? "A ouvir noutro separador — toca aqui para usar neste" : "Escuta sempre — diz «Olyvia» uma vez e depois fala à vontade"}</span>
              <button type="button" role="switch" aria-checked={escutaSempre} aria-label="Escuta sempre" onClick={() => setEscutaSempre((v) => !v)}
                className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", escutaSempre ? "bg-primary" : "bg-muted")}>
                <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-all", escutaSempre ? "left-[22px]" : "left-0.5")} />
              </button>
            </label>
          )}
        </section>
      ) : aviso && !pendente ? (
        <div role="status" className={cn("max-w-[min(calc(100vw-6rem),18rem)] rounded-xl border px-3 py-2 text-sm shadow-[var(--shadow-md,0_6px_18px_rgba(0,0,0,0.14))]", aviso.ok ? "border-primary/40 bg-card text-primary" : "border-border bg-card text-muted-foreground")}>{aviso.msg}</div>
      ) : null}
      <button type="button" aria-expanded={aberto} aria-label={rotulo} title={rotulo}
        onClick={() => { setAberto((v) => !v); setAviso(null); }}
        className={cn("relative grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all duration-200 hover:scale-105 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:h-14 sm:w-14",
          acordada && "ring-4 ring-emerald-400/70", emPausa && "opacity-75")}>
        <IconeOvelha className="h-8 w-8 sm:h-9 sm:w-9" />
        {/* o estado num sinal no canto: a ouvir-te (verde), à escuta à espera de «Olyvia» (vermelho), em pausa (micro cortado) */}
        {naConversa ? (
          <span aria-hidden="true" className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full border-2 border-card bg-destructive text-destructive-foreground animate-pulse"><Mic className="h-3 w-3" /></span>
        ) : emPausa ? (
          <span aria-hidden="true" className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full border-2 border-card bg-muted text-muted-foreground"><MicOff className="h-3 w-3" /></span>
        ) : acordada ? (
          <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 animate-pulse rounded-full border-2 border-card bg-emerald-500" />
        ) : aEscutar ? (
          <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-card bg-destructive" />
        ) : null}
      </button>
    </div>
  );
}

/** A ovelha da Olyvia (o Lucide não tem ovelha): lã branca fofa, cara e patas escuras. */
export function IconeOvelha({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <g fill="#2b1a52">
        <rect x="12.6" y="21" width="2.4" height="7" rx="1.2" />
        <rect x="20.4" y="21" width="2.4" height="7" rx="1.2" />
      </g>
      <g fill="currentColor">
        <circle cx="14.5" cy="11.5" r="5" />
        <circle cx="20.5" cy="11" r="5" />
        <circle cx="25" cy="15.5" r="4.5" />
        <circle cx="21.5" cy="20" r="5" />
        <circle cx="15" cy="20" r="5" />
        <circle cx="12" cy="15.5" r="4.6" />
        <circle cx="18.5" cy="15.5" r="5.5" />
      </g>
      <ellipse cx="8.2" cy="15.6" rx="4" ry="4.9" fill="#2b1a52" />
      <ellipse cx="4.7" cy="12.4" rx="2.4" ry="1.25" fill="#2b1a52" transform="rotate(-28 4.7 12.4)" />
      <circle cx="7.1" cy="14.6" r="0.95" fill="currentColor" />
    </svg>
  );
}
