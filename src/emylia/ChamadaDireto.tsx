// 4/11 (Rúben): o painel «Chamada em direto» no «Tudo na chamada». O telemóvel em alta voz, o browser capta o
// microfone e corta as falas (VAD Silero em WebAssembly); cada fala vai à função Supabase chamada-transcrever
// (Gemini) e aparece aqui com quem falou; no fim, chamada-campos propõe os campos da Lead e do Contacto e a
// comercial confirma o que entra. Nada corre no PC de ninguém. A lógica das propostas está em chamadaMotor.ts
// e a ligação ao Supabase em chamadaNuvem.ts.
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Mic, PhoneOff, Sparkles, Square, UserRoundCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Def, Grupo } from "./campos";
import { LINHAS, nomeLinha, servicosPedidos, type LinhaId, type Negocio } from "./motor";
import { mudarDadosLead } from "./DadosDaLead";
import type { Ctx } from "./pecas";
import { juntarVarios, propostas, type Extracao, type Fala, type Proposta } from "./chamadaMotor";
import { pedirMarcacao } from "./marcacaoDaChamada";
import { GRUPO_VISITA, falasDeFicheiro, gravarMicrofone, guardarVoz, linhasDaFala, ouvirMicrofone, preencherCampos, transcreverFala, vozGuardada, vozTextoGuardado, wavBase64, type Ouvinte } from "./chamadaNuvem";

type EstadoLig = "parado" | "a_ligar" | "a_ouvir" | "a_terminar" | "terminado" | "erro";
const EXEMPLO_URL = "/chamadas/exemplo.ogg";
const SEGUNDOS_VOZ = 15;

const tempo = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Chaves que não são campos do formulário: gravam-se por ações próprias do motor (ver `aplicarEspecial`). */
const CHAVES_ESPECIAIS = new Set(["lead_primeiro", "lead_apelido", "tipo_servico", "servicos_catalogo"]);

export function ChamadaDireto({ ctx, d, grupos: gruposDoNegocio }: { ctx: Ctx; d: Negocio; grupos: Grupo[] }) {
  // os campos do negócio, mais o cliente (nome), o serviço (tipo e serviços do Catálogo) e a visita combinada
  const svc = useMemo(() => ctx.S.svc ?? {}, [ctx.S.svc]);
  const grupos = useMemo<Grupo[]>(() => [
    ...gruposDoNegocio,
    ...(d.dadosLead ? [{ titulo: "Cliente", campos: [
      { k: "lead_primeiro", l: "Nome próprio", t: "texto" as const, ajuda: "O nome por que o comercial trata o cliente." },
      { k: "lead_apelido", l: "Apelido", t: "texto" as const },
    ] }] : []),
    { titulo: "Serviço", campos: [
      { k: "tipo_servico", l: "Tipo de serviço", t: "escolha" as const, op: Object.values(LINHAS).map((l) => l.n) },
      { k: "servicos_catalogo", l: "Serviços do Catálogo", t: "varios" as const, op: Object.values(svc).map((x) => x.n),
        ajuda: "Tudo o que o cliente disse que quer fazer, trocar ou instalar, de entre os do Catálogo (sanita, pavimento, espelho, banheira…). Se disse «tudo», os típicos da divisão." },
    ] },
    GRUPO_VISITA,
  ], [gruposDoNegocio, d.dadosLead, svc]);
  // o que o negócio já tem nessas chaves especiais, para as propostas saberem o que «já tinha»
  const fComEspeciais = useMemo(() => ({
    ...d.f,
    lead_primeiro: d.dadosLead?.primeiro ?? "", lead_apelido: d.dadosLead?.apelido ?? "",
    tipo_servico: d.linhaPorDefinir ? "" : nomeLinha(d),
    servicos_catalogo: servicosPedidos(d, ctx.S).map((x) => x.n).join(", "),
  }), [d, ctx.S]);
  const [estado, setEstado] = useState<EstadoLig>("parado");
  const [msg, setMsg] = useState("");
  const [falas, setFalas] = useState<Fala[]>([]);
  const [aFalar, setAFalar] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [pendentes, setPendentes] = useState(0);
  const [extracao, setExtracao] = useState<Extracao | null>(null);
  const [resumoFim, setResumoFim] = useState("");
  const [voz, setVoz] = useState<string | null>(() => vozGuardada());
  const [aGravarVoz, setAGravarVoz] = useState<number | null>(null);
  // por proposta: entra ou não, e o valor (editável) que entra
  const [escolhas, setEscolhas] = useState<Record<string, { incluir: boolean; valor: string }>>({});
  const [aplicadas, setAplicadas] = useState<string[] | null>(null);
  const ouvinte = useRef<Ouvinte | null>(null);
  const falasRef = useRef<Fala[]>([]);
  const fila = useRef<Promise<void>>(Promise.resolve());
  const relogio = useRef<number | null>(null);
  const fimLista = useRef<HTMLDivElement>(null);
  const teste = typeof location !== "undefined" && new URLSearchParams(location.search).get("teste") === "1";

  useEffect(() => { fimLista.current?.scrollIntoView({ block: "nearest" }); }, [falas.length]);
  useEffect(() => () => { void ouvinte.current?.parar(); if (relogio.current) window.clearInterval(relogio.current); }, []);

  const juntar = (novas: Fala[]) => {
    if (!novas.length) return;
    falasRef.current = [...falasRef.current, ...novas].sort((a, b) => a.inicio - b.inicio);
    setFalas(falasRef.current);
  };

  /** Cada fala vai ao Gemini por ordem (uma de cada vez), para as linhas não trocarem de sítio. */
  const tratarFala = (pcm: Float32Array, inicioS: number) => {
    setPendentes((n) => n + 1);
    fila.current = fila.current.then(async () => {
      try {
        const frases = await transcreverFala(pcm, inicioS, voz, voz ? vozTextoGuardado() : "");
        juntar(linhasDaFala(frases, "cliente"));
      } catch (e) {
        setMsg("Uma fala ficou por transcrever: " + (e as Error).message);
      } finally {
        setPendentes((n) => n - 1);
      }
    });
  };

  const limpar = () => { setFalas([]); falasRef.current = []; setExtracao(null); setAplicadas(null); setSegundos(0); setResumoFim(""); };
  const pararRelogio = () => { if (relogio.current) { window.clearInterval(relogio.current); relogio.current = null; } };

  async function iniciar() {
    setEstado("a_ligar"); setMsg("A pedir o microfone..."); limpar();
    try {
      const t0 = Date.now();
      ouvinte.current = await ouvirMicrofone(tratarFala, setAFalar);
      relogio.current = window.setInterval(() => setSegundos(Math.floor((Date.now() - t0) / 1000)), 1000);
      setEstado("a_ouvir");
      setMsg(voz ? "A ouvir. A sua voz está registada." : "A ouvir. Sem voz registada: as falas ficam como do cliente até registar a sua.");
    } catch (e) {
      setEstado("erro"); setMsg("Sem acesso ao microfone: " + (e as Error).message);
    }
  }

  async function iniciarTeste() {
    setEstado("a_ligar"); setMsg("A carregar a chamada de exemplo..."); limpar();
    try {
      const falasFicheiro = await falasDeFicheiro(EXEMPLO_URL);
      setEstado("a_ouvir"); setMsg(`A ouvir a chamada de exemplo (${falasFicheiro.length} falas).`);
      for (const f of falasFicheiro) tratarFala(f.pcm, f.inicioS);
      await fila.current;
      await terminar();
    } catch (e) {
      setEstado("erro"); setMsg("A chamada de exemplo falhou: " + (e as Error).message);
    }
  }

  async function terminar() {
    setEstado("a_terminar"); setMsg("A terminar a chamada...");
    pararRelogio();
    await ouvinte.current?.parar(); ouvinte.current = null;
    await fila.current;  // as últimas falas ainda a transcrever
    const segs = falasRef.current;
    if (!segs.length) { setEstado("terminado"); setMsg("Chamada terminada sem falas transcritas."); return; }
    setMsg("A preencher os campos com o que se disse...");
    try {
      const ext = await preencherCampos(segs, grupos);
      setExtracao(ext);
      // 5/11 (Rúben: as falas do cliente vinham como «Comercial»): a etiqueta de cada linha passa a ser a revista pelo sentido
      const revistas = ext.falantes && ext.falantes.length === segs.length
        ? segs.filter((s, i) => s.falante !== ext.falantes![i]).length : 0;
      if (ext.falantes && ext.falantes.length === segs.length) {
        falasRef.current = segs.map((s, i) => ({ ...s, falante: ext.falantes![i], confianca_falante: 1 }));
        setFalas(falasRef.current);
      }
      setResumoFim(`${segs.length} falas.${revistas ? ` Quem fala foi corrigido em ${revistas} ${revistas === 1 ? "linha" : "linhas"}, pelo sentido da conversa.` : ""}`);
      setEstado("terminado"); setMsg("Chamada terminada. Confirme o que entra nos campos.");
    } catch (e) {
      setEstado("erro"); setMsg("A transcrição ficou, mas os campos não: " + (e as Error).message);
    }
  }

  async function registarVoz() {
    setAGravarVoz(0);
    try {
      const pcm = await gravarMicrofone(SEGUNDOS_VOZ, (s) => setAGravarVoz(Math.min(SEGUNDOS_VOZ, Math.floor(s))));
      const b64 = wavBase64(pcm);
      setMsg("A guardar a sua voz...");
      // o que a amostra diz fica guardado: serve para apanhar frases decalcadas da amostra
      let texto = "";
      try { texto = (await transcreverFala(pcm, 0, null)).map((f) => f.texto).join(" "); } catch { /* sem texto, a amostra serve na mesma */ }
      guardarVoz(b64, texto); setVoz(b64);
      setMsg("A sua voz ficou registada neste browser.");
    } catch (e) {
      setMsg("Não deu para gravar a voz: " + (e as Error).message);
    } finally {
      setAGravarVoz(null);
    }
  }

  const props = propostas(extracao, grupos, fComEspeciais);
  const defs = new Map(grupos.flatMap((g) => g.campos).map((c) => [c.k, c] as const));
  // quando chega uma extração nova: entram por defeito as propostas de campos ainda vazios, com o valor proposto
  useEffect(() => {
    if (!extracao) { setEscolhas({}); return; }
    setEscolhas(Object.fromEntries(propostas(extracao, grupos, fComEspeciais).map((p) => [p.k, { incluir: p.jaTinha.trim() === "", valor: p.valor }])));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando a extração muda; os valores do negócio são lidos nesse momento
  }, [extracao]);
  const escolha = (k: string, mudanca: Partial<{ incluir: boolean; valor: string }>) =>
    setEscolhas((e) => ({ ...e, [k]: { ...(e[k] ?? { incluir: true, valor: "" }), ...mudanca } }));
  const entram = props.filter((p) => escolhas[p.k]?.incluir && (escolhas[p.k]?.valor ?? "").trim() !== "");
  const marcarTodos = (incluir: boolean) => setEscolhas((e) => Object.fromEntries(props.map((p) => [p.k, { ...(e[p.k] ?? { valor: p.valor }), incluir }])));
  /** As chaves especiais gravam-se pelas ações próprias: nome na ficha da lead, serviço pela linha, serviços pelos ids do Catálogo. */
  const aplicarEspecial = (k: string, valor: string) => {
    if (k === "lead_primeiro" || k === "lead_apelido") {
      void mudarDadosLead(ctx, d, { [k === "lead_primeiro" ? "primeiro" : "apelido"]: valor }, k === "lead_primeiro" ? "nome próprio" : "apelido").catch(() => undefined);
    } else if (k === "tipo_servico") {
      const linha = (Object.keys(LINHAS) as LinhaId[]).find((id) => LINHAS[id].n.toLowerCase() === valor.toLowerCase());
      if (linha) ctx.A.servicoDaChamada(d.id, linha);
    } else if (k === "servicos_catalogo") {
      const nomes = valor.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
      const ids = Object.entries(svc).filter(([, x]) => nomes.includes(x.n.toLowerCase())).map(([id]) => id);
      const atuais = servicosPedidos(d, ctx.S).map((x) => x.id);
      ctx.A.servicosDoPedido(d.id, [...atuais, ...ids]);
    }
  };
  const aplicar = () => {
    ctx.run(() => {
      for (const p of entram) {
        const valor = escolhas[p.k].valor.trim();
        if (CHAVES_ESPECIAIS.has(p.k)) aplicarEspecial(p.k, valor);
        else ctx.A.campo(d.id, p.k, juntarVarios(defs.get(p.k), d.f[p.k] || "", valor));
      }
    });
    setAplicadas(entram.map((p) => p.l));
    // o dia combinado entrou: «Marcar a visita» marca-a sozinha (o comercial livre mais perto a essa hora) e o ecrã vai lá
    if (entram.some((p) => p.k === "visita_dia")) {
      pedirMarcacao(d.id);
      setTimeout(() => document.getElementById(`chamada-1-vaga`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  };
  const aOuvir = estado === "a_ouvir";
  const ocupado = estado === "a_ligar" || estado === "a_terminar";

  return (
    <section aria-labelledby={`direto-${d.id}`} className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id={`direto-${d.id}`} className="flex items-center gap-2 text-lg font-semibold tracking-tight"><Mic className="h-5 w-5 text-primary" aria-hidden="true" />Chamada em direto</h2>
          <p className="text-sm text-muted-foreground">O telemóvel em alta voz junto ao microfone. A transcrição aparece aqui e no fim preenche os campos em baixo.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {!aOuvir && !ocupado ? (
            <Button type="button" variant="outline" onClick={() => void registarVoz()} disabled={aGravarVoz !== null}>
              <UserRoundCheck className="h-4 w-4" aria-hidden="true" />
              {aGravarVoz !== null ? `A gravar... ${aGravarVoz}/${SEGUNDOS_VOZ} s` : voz ? "Registar a minha voz outra vez" : "Registar a minha voz"}
            </Button>
          ) : null}
          {!aOuvir && !ocupado ? <Button type="button" onClick={() => void iniciar()} disabled={aGravarVoz !== null}><Mic className="h-4 w-4" aria-hidden="true" />Iniciar chamada</Button> : null}
          {!aOuvir && !ocupado && teste ? <Button type="button" variant="outline" onClick={() => void iniciarTeste()} disabled={aGravarVoz !== null}>Testar com a chamada de exemplo</Button> : null}
          {aOuvir ? <Button type="button" variant="destructive" onClick={() => void terminar()}><PhoneOff className="h-4 w-4" aria-hidden="true" />Terminar e preencher</Button> : null}
          {ocupado ? <Button type="button" disabled><Square className="h-4 w-4" aria-hidden="true" />{estado === "a_ligar" ? "A ligar..." : "A terminar..."}</Button> : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground" aria-live="polite">
        <span className={cn(estado === "erro" && "text-destructive")}>{msg || (voz ? "Pronto. A sua voz está registada." : "Pronto. Registe a sua voz uma vez para a transcrição saber quem fala.")}</span>
        {aOuvir ? (
          <>
            <span className={cn("inline-block h-2.5 w-2.5 rounded-full", aFalar ? "bg-success" : "bg-muted-foreground/40")} aria-label={aFalar ? "a ouvir fala" : "silêncio"} />
            <span>{tempo(segundos)}</span>
            {pendentes > 0 ? <span>a transcrever {pendentes}…</span> : null}
          </>
        ) : null}
        {estado === "terminado" ? <span>{resumoFim}</span> : null}
      </div>

      {falas.length ? (
        <div className="mt-4 max-h-72 space-y-1.5 overflow-y-auto rounded-xl border border-border bg-background p-3 text-[15px]" aria-label="Transcrição">
          {falas.map((f, i) => (
            <p key={i} className="relative pl-12 leading-snug">
              <span className="absolute left-0 top-0.5 text-xs text-muted-foreground">{tempo(f.inicio)}</span>
              <b className={f.falante === "comercial" ? "text-primary" : "text-amber-800"}>{f.falante === "comercial" ? "Comercial" : "Cliente"}{f.confianca_falante < 0.3 ? " (?)" : ""}:</b> {f.texto}
            </p>
          ))}
          <div ref={fimLista} />
        </div>
      ) : null}

      {extracao ? (
        <div className="mt-4 space-y-3">
          {extracao.resumo ? <p className="rounded-xl bg-muted/60 p-3 text-[15px] leading-snug"><b>Resumo:</b> {extracao.resumo}</p> : null}
          {props.length === 0 ? <p className="text-sm text-muted-foreground">A chamada não deu nenhum campo para preencher.</p> : (
            <>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span>Marque o que entra e corrija o que for preciso antes de preencher.</span>
                {aplicadas === null ? (
                  <>
                    <button type="button" onClick={() => marcarTodos(true)} className="text-primary underline-offset-4 hover:underline">Marcar todos</button>
                    <button type="button" onClick={() => marcarTodos(false)} className="text-primary underline-offset-4 hover:underline">Desmarcar todos</button>
                  </>
                ) : null}
              </div>
              <ul className="space-y-2">
                {props.map((p) => (
                  <LinhaProposta key={p.k} p={p} def={defs.get(p.k)} escolha={escolhas[p.k] ?? { incluir: false, valor: p.valor }}
                    bloqueada={aplicadas !== null} onMudar={(m) => escolha(p.k, m)} />
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" onClick={aplicar} disabled={entram.length === 0 || aplicadas !== null}><Sparkles className="h-4 w-4" aria-hidden="true" />Preencher {entram.length} {entram.length === 1 ? "campo" : "campos"}</Button>
                {aplicadas ? <span className="text-sm text-success">Preenchidos: {aplicadas.join(", ")}. Confira em baixo e corrija o que for preciso.</span> : null}
              </div>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

type Escolha = { incluir: boolean; valor: string };

/** Uma proposta: caixa para entrar ou não, o valor editável conforme o tipo do campo, e o excerto que a justifica. */
function LinhaProposta({ p, def, escolha, bloqueada, onMudar }: { p: Proposta; def?: Def; escolha: Escolha; bloqueada: boolean; onMudar: (m: Partial<Escolha>) => void }) {
  const rever = p.estado === "rever";
  const id = `prop-${p.k}`;
  return (
    <li className={cn("rounded-xl border border-border bg-background px-3 py-2.5 transition-colors", escolha.incluir ? "border-primary/40" : "opacity-70")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="button" role="checkbox" aria-checked={escolha.incluir} aria-labelledby={`${id}-rotulo`} disabled={bloqueada}
          onClick={() => onMudar({ incluir: !escolha.incluir })}
          className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-lg border-2 transition-colors",
            escolha.incluir ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card text-transparent hover:border-primary/60")}>
          <Check className="h-4 w-4" aria-hidden="true" />
        </button>
        <label id={`${id}-rotulo`} htmlFor={id} className="w-44 shrink-0 text-sm text-muted-foreground">{p.l}</label>
        <div className="min-w-[200px] flex-1"><Editor id={id} def={def} valor={escolha.valor} rotulo={p.l} bloqueado={bloqueada} onMudar={(v) => onMudar({ valor: v })} /></div>
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", rever ? "bg-warning/15 text-warning-foreground" : "bg-success/15 text-success")}>{rever ? "a rever" : "ouvido"} · {Math.round(p.confianca * 100)}%</span>
        {p.jaTinha && p.jaTinha !== p.valor ? <span className="text-xs text-muted-foreground">já tinha «{p.jaTinha}»</span> : null}
      </div>
      {p.excerto ? <p className="mt-1 pl-9 text-xs italic text-muted-foreground">{p.excerto}</p> : null}
    </li>
  );
}

const CAIXA = "h-9 w-full rounded-lg border border-input bg-card px-2.5 text-[15px] text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60";

/** O valor proposto, editável com o controlo certo para o tipo do campo. */
function Editor({ id, def, valor, rotulo, bloqueado, onMudar }: { id: string; def?: Def; valor: string; rotulo: string; bloqueado: boolean; onMudar: (v: string) => void }) {
  const t = def?.t ?? "texto";
  if (t === "escolha" || t === "sim_nao") {
    const op = t === "sim_nao" ? ["Sim", "Não"] : (def?.op ?? []);
    const opcoes = valor && !op.includes(valor) ? [valor, ...op] : op;
    return (
      <select id={id} aria-label={rotulo} value={valor} disabled={bloqueado} onChange={(e) => onMudar(e.target.value)} className={CAIXA}>
        <option value="">—</option>
        {opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (t === "numero" || t === "contador") return <input id={id} aria-label={rotulo} type="number" step="any" value={valor} disabled={bloqueado} onChange={(e) => onMudar(e.target.value)} className={CAIXA} />;
  if (t === "data") return <input id={id} aria-label={rotulo} type="date" value={valor} disabled={bloqueado} onChange={(e) => onMudar(e.target.value)} className={CAIXA} />;
  if (t === "texto_longo") return <textarea id={id} aria-label={rotulo} value={valor} disabled={bloqueado} rows={2} onChange={(e) => onMudar(e.target.value)} className={cn(CAIXA, "h-auto py-1.5 leading-snug")} />;
  return <input id={id} aria-label={rotulo} type="text" value={valor} disabled={bloqueado} onChange={(e) => onMudar(e.target.value)} className={CAIXA}
    placeholder={t === "varios" ? (def?.op ?? []).join(", ") : undefined} />;
}
