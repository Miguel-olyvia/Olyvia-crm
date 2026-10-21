// O levantamento por conversa (21/10/2026), o primeiro passo das Necessidades: o comercial conta à Olyvia o que o
// cliente quer, por voz, por escrito ou com fotografias; ela liga ao Catálogo e propõe. A proposta cresce à medida que se fala: medidas, serviços, produtos e notas, cada um com o
// seu interruptor (por baixo da caixa de escrita: a coluna da etapa é estreita mesmo no portátil). O "Validar" da barra de baixo junta à visita o que está ligado e passa às trocas.
// A lógica está em conversaIA.ts (o que se manda e o que se faz) e conversaStore.ts (a conversa e a chamada).
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, Camera, Check, ChevronDown, Mic, RotateCcw, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { itemCatalogo } from "./catalogo";
import { LINHAS, camposMedida, eur, nfmt, type Negocio } from "./motor";
import { type Ctx } from "./pecas";
import { useCatalogo } from "./v2/catalogoStore";
import { caminho, oficioDe, type Catalogo } from "./v2/catalogoModelo";
import { IconeServico, Ilustracao, iconeDoServico, ilustracaoDoProduto } from "./ilustracoes";
import { precoUnitario } from "./produtosVisita";
import { nomeCurto } from "./necessidades";
import { encurtar } from "./selecao";
import { CartaoProduto, QtdMudar } from "./CartoesSelecao";
import { MOLA, useReduzir } from "./movimento";
import { rascunhoTemAlgo, validarNaVisita, type Rascunho } from "./conversaIA";
import {
  alternar, enviar, escolherProduto, lerConversa, mudarQtd, recomecar, useConversa, useLigada, validado, verLigada, type EstadoConversa, type Fonte, type Msg,
} from "./conversaStore";

type P = Ctx & { d: Negocio };

/* ================================================================== a Olyvia */
export type Humor = EstadoConversa | "a ouvir";
/**
 * A Olyvia: um círculo da cor da marca com dois olhos. Respira parada; ouve (anéis que pulsam); pensa (os olhos
 * olham para cima e três pontos rodam); escreve (os olhos piscam ao ritmo). Pisca de vez em quando.
 */
export function Olyvia({ humor, tamanho = 40 }: { humor: Humor; tamanho?: number }) {
  const reduzir = useReduzir();
  const [pisca, setPisca] = useState(false);
  useEffect(() => {
    if (reduzir) return;
    let t: number;
    const proximo = () => { t = window.setTimeout(() => { setPisca(true); window.setTimeout(() => setPisca(false), 140); proximo(); }, 2600 + Math.random() * 2600); };
    proximo();
    return () => window.clearTimeout(t);
  }, [reduzir]);
  const olhar = humor === "a pensar" ? { x: 2, y: -3 } : humor === "a ouvir" ? { x: 0, y: 1 } : { x: 0, y: 0 };
  const olhos = pisca ? 0.12 : humor === "a ouvir" ? 1.15 : 1;
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: tamanho, height: tamanho }} aria-hidden="true">
      {!reduzir && humor === "a ouvir" && [0, 1].map((i) => (
        <motion.span key={i} className="absolute inset-0 rounded-full bg-primary/25"
          initial={{ scale: 1, opacity: 0.6 }} animate={{ scale: 1.7, opacity: 0 }} transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.8, ease: "easeOut" }} />
      ))}
      <motion.svg viewBox="0 0 40 40" width={tamanho} height={tamanho} className="relative"
        animate={reduzir ? undefined : humor === "a escrever" ? { scale: [1, 1.04, 1] } : { scale: [1, 1.025, 1] }}
        transition={{ duration: humor === "a escrever" ? 0.5 : 3.2, repeat: Infinity, ease: "easeInOut" }}>
        <defs>
          <radialGradient id="olyvia-g" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="hsl(var(--primary) / 0.75)" />
            <stop offset="100%" stopColor="hsl(var(--primary))" />
          </radialGradient>
        </defs>
        <circle cx="20" cy="20" r="19" fill="url(#olyvia-g)" />
        <motion.g animate={olhar} transition={MOLA}>
          {[14.5, 25.5].map((x) => (
            <motion.ellipse key={x} cx={x} cy="18" rx="2.4" ry="3.4" fill="white" style={{ originX: `${x}px`, originY: "18px" }}
              animate={{ scaleY: olhos }} transition={{ duration: 0.08 }} />
          ))}
        </motion.g>
        {humor === "parado" && <path d="M15.5 25.5 Q20 28.5 24.5 25.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" fill="none" />}
      </motion.svg>
      {!reduzir && humor === "a pensar" && (
        <motion.span className="absolute inset-[-5px]" animate={{ rotate: 360 }} transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}>
          {[0, 120, 240].map((g) => (
            <span key={g} className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-primary"
              style={{ transform: `rotate(${g}deg)`, transformOrigin: `50% ${tamanho / 2 + 5}px` }} />
          ))}
        </motion.span>
      )}
    </span>
  );
}

/* ================================================================== o ditado (Web Speech) */
type Reconhecimento = { lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
const ClasseDitado = (): (new () => Reconhecimento) | null => {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => Reconhecimento) | null;
};

/** O ditado em português de Portugal: o texto vai chegando (o provisório incluído) e, ao parar, chama `aoParar`. */
function useDitado(aoTexto: (t: string) => void, aoParar: (t: string) => void) {
  const [aOuvir, setAOuvir] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const rec = useRef<Reconhecimento | null>(null);
  const final = useRef("");
  const ultimo = useRef("");
  const existe = typeof window !== "undefined" && !!ClasseDitado();
  const comecar = (base: string) => {
    const C = ClasseDitado();
    if (!C) return;
    const r = new C();
    r.lang = "pt-PT"; r.continuous = true; r.interimResults = true;
    final.current = base ? base.trimEnd() + " " : "";
    r.onresult = (e) => {
      let prov = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const x = e.results[i];
        if (x.isFinal) final.current += x[0].transcript.trim() + " "; else prov += x[0].transcript;
      }
      ultimo.current = (final.current + prov).trimStart();
      aoTexto(ultimo.current);
    };
    r.onerror = (e) => setErro(e.error === "not-allowed" ? "O microfone não está autorizado neste browser." : e.error === "no-speech" ? null : "O ditado parou. Tente outra vez.");
    r.onend = () => { setAOuvir(false); rec.current = null; aoParar(ultimo.current.trim()); };
    rec.current = r;
    ultimo.current = final.current;
    setErro(null);
    setAOuvir(true);
    r.start();
  };
  const parar = () => rec.current?.stop();
  useEffect(() => () => rec.current?.stop(), []);
  return { existe, aOuvir, erro, comecar, parar };
}

/* ================================================================== as fotografias */
/** Reduz a fotografia (lado maior 1280 px, JPEG) para mandar à IA, e faz a miniatura para a conversa. */
async function prepararFoto(f: File): Promise<{ tipo: string; base64: string; mini: string }> {
  const img = await createImageBitmap(f);
  const tela = (lado: number, q: number) => {
    const k = Math.min(1, lado / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", q);
  };
  const grande = tela(1280, 0.82), mini = tela(240, 0.7);
  return { tipo: "image/jpeg", base64: grande.slice(grande.indexOf(",") + 1), mini };
}

/* ================================================================== a proposta */
interface Item { chave: string; nome: string; detalhe: string; q: number | null; un: string; preco: number; figura: ReactNode; motivo?: string }
type Grupo = { titulo: string; itens: Item[] };

/** As linhas da proposta, por grupo: medidas, serviços, produtos, respostas e notas. */
function gruposDaProposta(ctx: P, K: Catalogo, r: Rascunho): Grupo[] {
  const { S, d } = ctx;
  const L = LINHAS[d.linha];
  const rotulo = new Map(camposMedida(L));
  const medidas: Item[] = Object.entries(r.medidas).map(([k, x]) => ({
    chave: "m:" + k, nome: (rotulo.get(k as never) ?? k).replace(/ \(.*\)/, ""), detalhe: "", q: x ?? 0, un: /\(m²\)/.test(rotulo.get(k as never) ?? "") ? "m²" : "", preco: 0,
    figura: <span className="text-sm font-semibold text-primary">{nfmt(x ?? 0)}</span>,
  }));
  const servicos: Item[] = Object.entries(r.servicos).map(([sid, x]) => {
    const s = S.svc[sid], c = itemCatalogo(sid), n = s?.n ?? c?.n ?? sid;
    const of = oficioDe(K.arvore, K.classe[sid])?.n ?? c?.cat ?? "";
    return { chave: "s:" + sid, nome: nomeCurto(n), detalhe: of, q: x.q, un: s?.un ?? c?.un ?? "un", preco: (s?.preco ?? c?.pvp ?? 0) * x.q, motivo: x.motivo,
      figura: <IconeServico k={iconeDoServico(n, of, K.icone?.[sid])} className="h-5 w-5" /> };
  });
  const produtos: Item[] = Object.entries(r.produtos).flatMap(([pid, x]) => {
    const p = K.produtos.find((y) => y.id === pid);
    if (!p) return [];
    return [{ chave: "p:" + pid, nome: encurtar(p.n).nome, detalhe: [p.marca, `${eur(precoUnitario(p))} € / ${p.un}`].filter(Boolean).join(" · "), q: x.q, un: p.un,
      preco: precoUnitario(p) * x.q, motivo: x.motivo, figura: <Ilustracao k={ilustracaoDoProduto(p, caminho(K.arvore, p.no))} className="h-8 w-8" /> }];
  });
  const respostas: Item[] = Object.entries(r.manter).map(([sid, x]) => ({
    chave: "k:" + sid, nome: K.perguntaManter?.[sid] ?? sid, detalhe: x === "sim" ? "Sim, mantém" : "Não, vai trocar", q: null, un: "", preco: 0,
    figura: <Check className="h-5 w-5 text-primary" aria-hidden="true" />,
  }));
  const notas: Item[] = r.notas.map((n) => ({ chave: "n:" + n, nome: n, detalhe: "", q: null, un: "", preco: 0, figura: <span className="text-base text-primary">“</span> }));
  return [
    { titulo: "Medidas", itens: medidas }, { titulo: "Serviços", itens: servicos }, { titulo: "Produtos", itens: produtos },
    { titulo: "Respostas", itens: respostas }, { titulo: "Notas", itens: notas },
  ].filter((g) => g.itens.length);
}

function LinhaProposta({ it, on, novo, dealId }: { it: Item; on: boolean; novo: boolean; dealId: number }) {
  const reduzir = useReduzir();
  const editavel = it.q != null && (it.chave.startsWith("s:") || it.chave.startsWith("p:"));
  return (
    <motion.li layout={!reduzir} initial={novo && !reduzir ? { opacity: 0, y: 8, backgroundColor: "hsl(var(--primary) / 0.12)" } : false}
      animate={{ opacity: 1, y: 0, backgroundColor: "hsl(var(--primary) / 0)" }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-xl">
      <button type="button" role="switch" aria-checked={on} onClick={() => alternar(dealId, it.chave)}
        className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-primary/50">
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted/70 transition-opacity", !on && "opacity-40")}>{it.figura}</span>
        <span className={cn("min-w-0 flex-1 transition-opacity", !on && "opacity-50")}>
          <span className={cn("block text-[15px] font-medium leading-snug text-foreground", !on && "line-through decoration-muted-foreground/60")}>{it.nome}</span>
          {(it.detalhe || it.motivo) && <span className="block truncate text-sm text-muted-foreground">{[it.detalhe, it.motivo].filter(Boolean).join(" · ")}</span>}
        </span>
        {it.preco > 0 && <span className={cn("shrink-0 text-[15px] tabular-nums", !on && "text-muted-foreground line-through")}>{eur(it.preco)} €</span>}
        <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
          {on && <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />}
        </span>
        <span className="sr-only">{on ? "Entra ao validar" : "Fica de fora"}</span>
      </button>
      {editavel && on && (
        <QtdMudar id={`cq-${dealId}-${it.chave}`} valor={it.q!} un={it.un} nome={it.nome} texto={`${nfmt(it.q!)} ${it.un}`}
          onMudar={(n) => mudarQtd(dealId, it.chave, n)} recuo />
      )}
    </motion.li>
  );
}

/** A proposta da Olyvia: o que vai entrar na visita, com o total estimado. */
function Proposta({ ctx, grupos, fora, novos, aberta, setAberta }: { ctx: P; grupos: Grupo[]; fora: string[]; novos: string[]; aberta: boolean; setAberta: (v: boolean) => void }) {
  const itens = grupos.flatMap((g) => g.itens);
  const ligados = itens.filter((it) => !fora.includes(it.chave));
  const total = ligados.reduce((a, it) => a + it.preco, 0);
  const n = ligados.length;
  return (
    <section aria-labelledby={`prop-${ctx.d.id}`} className="rounded-2xl border border-border bg-card">
      <button type="button" aria-expanded={aberta} onClick={() => setAberta(!aberta)}
        className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
        <span className="min-w-0 flex-1">
          <span id={`prop-${ctx.d.id}`} className="block text-[15px] font-semibold text-foreground">Proposta para validar</span>
          <span className="block text-sm text-muted-foreground" aria-live="polite">
            {n ? `${n} ${n === 1 ? "item" : "itens"}${total > 0 ? ` · ${eur(total)} € estimado` : ""}` : "Vai aparecendo enquanto conversam"}
          </span>
        </span>
        <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform", aberta && "rotate-180")} aria-hidden="true" />
      </button>
      <div className={cn("border-t border-border px-2 pb-3 pt-1", !aberta && "hidden")}>
        {!itens.length && <p className="px-2 py-4 text-[15px] text-muted-foreground">Ainda nada. Conte o que o cliente quer e a Olyvia vai juntando aqui o que encontra no Catálogo.</p>}
        {grupos.map((g) => (
          <div key={g.titulo} className="mt-2">
            <h4 className="px-2 pb-1 pt-2 text-sm font-medium text-muted-foreground">{g.titulo}</h4>
            <ul>
              <AnimatePresence initial={false}>
                {g.itens.map((it) => <LinhaProposta key={it.chave} it={it} on={!fora.includes(it.chave)} novo={novos.includes(it.chave)} dealId={ctx.d.id} />)}
              </AnimatePresence>
            </ul>
          </div>
        ))}
        {itens.length > 0 && <p className="px-2 pt-3 text-sm text-muted-foreground">Toque para tirar ou voltar a pôr. “Validar”, em baixo, junta à visita o que está marcado.</p>}
      </div>
    </section>
  );
}

/* ================================================================== a conversa */
const EXEMPLOS: Record<Negocio["linha"], string[]> = {
  wc: ["Trocar a banheira por base de duche", "Remodelação completa, 2 por 2,5", "Só trocar as louças e o móvel"],
  coz: ["Cozinha nova com bancada em pedra", "Trocar os eletrodomésticos", "Mudar o lava-loiça de sítio"],
};

function Mensagem({ m, ctx, K, fonte, ultima }: { m: Msg; ctx: P; K: Catalogo; fonte: () => Fonte; ultima: boolean }) {
  const reduzir = useReduzir();
  const ocupado = lerConversa(ctx.d.id).estado !== "parado";
  if (m.de === "eu") return (
    <motion.li initial={reduzir ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-end gap-1.5">
      {m.fotos && <span className="flex flex-wrap justify-end gap-1.5">{m.fotos.map((f, i) => <img key={i} src={f} alt={`Fotografia ${i + 1}`} className="h-20 w-20 rounded-xl object-cover" />)}</span>}
      {m.texto && <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-muted px-4 py-2.5 text-[15px] leading-relaxed text-foreground">{m.texto}</p>}
    </motion.li>
  );
  const vazio = m.vivo && !m.texto;
  return (
    <motion.li initial={reduzir ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-start gap-3">
      <Olyvia humor={m.vivo ? (vazio ? "a pensar" : "a escrever") : "parado"} tamanho={32} />
      <div className="min-w-0 flex-1 pt-1">
        {vazio ? <p className="text-[15px] text-muted-foreground">A ver no Catálogo…</p>
          : m.texto && (
            <p className={cn("whitespace-pre-wrap text-[15px] leading-relaxed", m.erro ? "text-destructive" : m.nota ? "font-medium text-foreground" : "text-foreground")}>
              {m.texto}{m.vivo && <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-primary" aria-hidden="true" />}
            </p>
          )}
        {m.cartoes?.map((c, i) => c.k === "produtos" ? (
          <div key={i} className="mt-3">
            <p className="text-[15px] font-medium text-foreground">{c.pergunta}</p>
            <ul className="mt-2 grid items-start gap-2 grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
              {c.ids.map((pid) => {
                const p = K.produtos.find((x) => x.id === pid);
                if (!p) return null;
                const on = m.escolha?.[i] === pid;
                return (
                  <li key={pid}>
                    <CartaoProduto nome={encurtar(p.n).nome} nomeCompleto={p.n} detalhe={p.marca || null} preco={precoUnitario(p)} un={p.un}
                      img={ilustracaoDoProduto(p, caminho(K.arvore, p.no))} on={on} trazInstalacao={!!p.servico}
                      onTocar={() => { if (!on && !ocupado) escolherProduto(fonte, m.id, i, pid, p.n, c.para ? nomeCurto(itemCatalogo(c.para)?.n ?? c.para) : null); }} />
                  </li>
                );
              })}
            </ul>
          </div>
        ) : ultima && !ocupado ? (
          <div key={i} className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Respostas rápidas">
            {c.opcoes.map((o) => (
              <button key={o} type="button" onClick={() => void enviar(fonte, o)}
                className="min-h-11 rounded-full border border-input bg-card px-4 text-[15px] text-foreground outline-none transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-primary/50">{o}</button>
            ))}
          </div>
        ) : null)}
      </div>
    </motion.li>
  );
}

/** Junta à visita o que está ligado na proposta e diz, na conversa, o que entrou. Devolve false se não havia nada. */
export function validarConversa(ctx: P, K: Catalogo): boolean {
  const { S, A, run, d } = ctx;
  const c = lerConversa(d.id);
  if (!rascunhoTemAlgo(c.rascunho)) return false;
  let res = { servicos: 0, produtos: 0, medidas: 0 };
  run(() => { res = validarNaVisita(A, S, K, d, c.rascunho, new Set(c.fora)); });
  const partes = [
    res.servicos && `${res.servicos} ${res.servicos === 1 ? "serviço" : "serviços"}`,
    res.produtos && `${res.produtos} ${res.produtos === 1 ? "produto" : "produtos"}`,
    res.medidas && "as medidas",
  ].filter(Boolean) as string[];
  validado(d.id, partes.length ? `Juntei à visita ${partes.length > 1 ? partes.slice(0, -1).join(", ") + " e " + partes[partes.length - 1] : partes[0]}.` : "Validado.");
  return true;
}
/** Quantos itens vão entrar ao validar (para o botão da barra de baixo). */
export function itensAValidar(id: number): number {
  const c = lerConversa(id), r = c.rascunho;
  const todos = [...Object.keys(r.medidas).map((k) => "m:" + k), ...Object.keys(r.servicos).map((k) => "s:" + k), ...Object.keys(r.produtos).map((k) => "p:" + k),
    ...Object.keys(r.manter).map((k) => "k:" + k), ...r.notas.map((n) => "n:" + n)];
  return todos.filter((k) => !c.fora.includes(k)).length;
}

export function ConversaLevantamento({ ctx }: { ctx: P }) {
  const { d } = ctx;
  const K = useCatalogo();
  const conv = useConversa(d.id);
  const ligada = useLigada();
  const reduzir = useReduzir();
  const [texto, setTexto] = useState("");
  const [fotos, setFotos] = useState<{ tipo: string; base64: string; mini: string }[]>([]);
  const [aberta, setAberta] = useState(false);
  const ocupado = conv.estado !== "parado";
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const KRef = useRef(K);
  KRef.current = K;
  // a cada volta lê o estado atual (o run muda o S no sítio; o negócio pode ter mudado entretanto)
  const fonte = useMemo(() => (): Fonte => {
    const c = ctxRef.current;
    return { S: c.S, K: KRef.current, d: c.S.deals.find((x) => x.id === c.d.id) ?? c.d };
  }, []);
  useEffect(() => { void verLigada(); }, []);

  const mandar = (t = texto) => {
    const tt = t.trim();
    if ((!tt && !fotos.length) || ocupado) return;
    void enviar(fonte, tt, fotos);
    setTexto(""); setFotos([]);
  };
  const dit = useDitado(setTexto, (t) => { if (t) mandar(t); });
  const fotoRef = useRef<HTMLInputElement>(null);
  const caixa = useRef<HTMLTextAreaElement>(null);
  const fim = useRef<HTMLDivElement>(null);
  // a mensagem nova à vista (só se a conversa cresceu e o fim está fora do ecrã)
  const n = conv.msgs.length, ultimoTexto = conv.msgs[n - 1]?.texto.length ?? 0;
  useEffect(() => {
    const el = fim.current;
    if (!el || !n) return;
    const r = el.getBoundingClientRect();
    if (r.bottom > window.innerHeight - 90) el.scrollIntoView({ block: "end", behavior: reduzir ? "auto" : "smooth" });
  }, [n, ultimoTexto, reduzir]);
  // a caixa de texto cresce com o texto (até 6 linhas)
  useEffect(() => { const t = caixa.current; if (!t) return; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 160) + "px"; }, [texto]);
  // a proposta abre-se sozinha no telemóvel quando entra a primeira coisa
  const temAlgo = rascunhoTemAlgo(conv.rascunho);
  const jaAbriu = useRef(false);
  useEffect(() => { if (temAlgo && !jaAbriu.current) { jaAbriu.current = true; setAberta(true); } }, [temAlgo]);

  const grupos = gruposDaProposta(ctx, K, conv.rascunho);
  const humor: Humor = dit.aOuvir ? "a ouvir" : conv.estado;
  const estadoTxt = dit.aOuvir ? "A ouvir… toque no quadrado para parar e enviar" : conv.estado === "a pensar" ? "A pensar…" : conv.estado === "a escrever" ? "A escrever…"
    : ligada === false ? "Modo de demonstração (sem IA no servidor)" : ligada ? "Ligada ao Catálogo" : "";

  const juntarFotos = async (fs: FileList | null) => {
    if (!fs?.length) return;
    const novas = await Promise.all([...fs].slice(0, 4).map(prepararFoto));
    setFotos((a) => [...a, ...novas].slice(0, 4));
    caixa.current?.focus();
  };

  return (
    <div className="space-y-5">
      <div className="min-w-0">
        {/* quem fala e em que estado está */}
        <div className="flex items-center gap-3">
          <Olyvia humor={humor} tamanho={44} />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-foreground">Olyvia</p>
            <p className="truncate text-sm text-muted-foreground" aria-live="polite">{estadoTxt}</p>
          </div>
          {n > 0 && !ocupado && (
            <button type="button" onClick={() => recomecar(d.id)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/50">
              <RotateCcw className="h-4 w-4" aria-hidden="true" />Recomeçar
            </button>
          )}
        </div>

        <ol role="log" aria-label="Conversa com a Olyvia" aria-live="polite" className="mt-5 space-y-5">
          {!n && (
            <li className="flex items-start gap-3">
              <span className="w-8 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] leading-relaxed text-foreground">
                  Olá! Conte-me o que o cliente quer: o que sai, o que entra e as medidas. Pode falar, escrever ou mandar fotografias. Eu vou ao Catálogo e preparo a proposta.
                </p>
                <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Exemplos">
                  {EXEMPLOS[d.linha].map((o) => (
                    <button key={o} type="button" onClick={() => mandar(o)}
                      className="min-h-11 rounded-full border border-input bg-card px-4 text-[15px] text-foreground outline-none transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-primary/50">{o}</button>
                  ))}
                </div>
              </div>
            </li>
          )}
          {conv.msgs.map((m, i) => <Mensagem key={m.id} m={m} ctx={ctx} K={K} fonte={fonte} ultima={i === n - 1} />)}
        </ol>
        <div ref={fim} />

        {/* escrever, falar, fotografar */}
        <div className="mt-5 rounded-2xl border border-input bg-card p-2 shadow-[0_1px_2px_hsl(var(--foreground)/0.05)] focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
          {fotos.length > 0 && (
            <ul className="flex flex-wrap gap-2 px-1 pb-2 pt-1" aria-label="Fotografias por enviar">
              {fotos.map((f, i) => (
                <li key={i} className="relative">
                  <img src={f.mini} alt={`Fotografia ${i + 1}`} className="h-16 w-16 rounded-lg object-cover" />
                  <button type="button" onClick={() => setFotos((a) => a.filter((_, j) => j !== i))} aria-label={`Tirar a fotografia ${i + 1}`}
                    className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full bg-foreground text-background outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <label className="block">
            <span className="sr-only">Mensagem para a Olyvia</span>
            <textarea ref={caixa} rows={1} value={texto} onChange={(e) => setTexto(e.target.value)} disabled={dit.aOuvir}
              placeholder={dit.aOuvir ? "A ouvir…" : "Ex.: tirar a banheira, base de duche de 120, 2 por 2,5"}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); mandar(); } }}
              className="block max-h-40 min-h-11 w-full resize-none bg-transparent px-2 py-2.5 text-base text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-100" />
          </label>
          <div className="flex items-center gap-1">
            <input ref={fotoRef} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} aria-hidden="true"
              onChange={(e) => { void juntarFotos(e.target.files); e.target.value = ""; }} />
            <button type="button" onClick={() => fotoRef.current?.click()} disabled={ocupado || dit.aOuvir} aria-label="Juntar fotografias"
              className="grid h-11 w-11 place-items-center rounded-xl text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-40">
              <Camera className="h-5 w-5" aria-hidden="true" />
            </button>
            {dit.existe && (
              <button type="button" onClick={() => (dit.aOuvir ? dit.parar() : dit.comecar(texto))} disabled={ocupado}
                aria-label={dit.aOuvir ? "Parar e enviar" : "Falar"} aria-pressed={dit.aOuvir}
                className={cn("grid h-11 w-11 place-items-center rounded-xl outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-40",
                  dit.aOuvir ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                {dit.aOuvir ? <Square className="h-4 w-4 fill-current" aria-hidden="true" /> : <Mic className="h-5 w-5" aria-hidden="true" />}
              </button>
            )}
            <span className="min-w-0 flex-1 truncate px-1 text-sm text-destructive" role="status">{dit.erro}</span>
            <button type="button" onClick={() => mandar()} disabled={ocupado || dit.aOuvir || (!texto.trim() && !fotos.length)} aria-label="Enviar"
              className="grid h-11 w-11 place-items-center rounded-xl bg-foreground text-background outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-25">
              <ArrowUp className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div>
        <Proposta ctx={ctx} grupos={grupos} fora={conv.fora} novos={conv.novos} aberta={aberta} setAberta={setAberta} />
      </div>
    </div>
  );
}
