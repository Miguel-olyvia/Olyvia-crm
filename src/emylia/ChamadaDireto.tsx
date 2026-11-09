// 4/11 (Rúben): o painel «Chamada em direto» no «Tudo na chamada». O telemóvel em alta voz, o browser capta o
// microfone e corta as falas (VAD Silero em WebAssembly); cada fala vai à função Supabase chamada-transcrever
// (Gemini) e aparece aqui com quem falou; no fim, chamada-campos propõe os campos da Lead e do Contacto e a
// comercial confirma o que entra. Nada corre no PC de ninguém. A lógica das propostas está em chamadaMotor.ts
// e a ligação ao Supabase em chamadaNuvem.ts.
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, Mic, PhoneOff, RotateCcw, Sparkles, Square, UserRoundCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Def, Grupo } from "./campos";
import { LINHAS, camposMedida, medida, nomeLinha, porMedida, servicosPedidos, type LinhaId, type Negocio } from "./motor";
import { mudarDadosLead } from "./DadosDaLead";
import type { Ctx } from "./pecas";
import { juntarExtracoes, juntarVarios, propostas, type Extracao, type Fala, type Proposta } from "./chamadaMotor";
import { divisaoPrincipal } from "./campos";
import { areaChaoM2, faltaFechar, gravarPlanta, plantaDaFolha, type PlantaLida } from "./planta";
import { pedirMarcacao } from "./marcacaoDaChamada";
import { GRUPO_VISITA, falasDeFicheiro, lerFolha, gravarMicrofone, guardarVoz, linhasDaFala, preencherCampos, transcreverFala, vozGuardada, vozTextoGuardado, wavBase64 } from "./chamadaNuvem";
import { descartarGravacao, escolherMicrofone, iniciarGravacao, microfoneEscolhido, microfones, painelAberto, repetirFalhadas, terminarGravacao, useGravacao } from "./gravador";
import { urlDoNegocio } from "./urlNegocio";

/** Depois de terminar: a preencher os campos, terminado, ou erro. A gravação em si vive no gravador (gravador.ts). */
type Fase = "livre" | "a_preencher" | "terminado" | "erro";
const EXEMPLO_URL = "/chamadas/exemplo.ogg";
const SEGUNDOS_VOZ = 15;

const tempo = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
/** 9/11: a transcrição como texto, para ficar no negócio (uma linha por fala, com o tempo e quem fala). */
export const textoDaTranscricao = (falas: readonly Fala[]) =>
  falas.map((f) => `${tempo(f.inicio)} ${f.falante === "comercial" ? "Comercial" : "Cliente"}: ${f.texto}`).join("\n");

/** Chaves que não são campos do formulário: gravam-se por ações próprias do motor (ver `aplicarEspecial`). */
const CHAVES_ESPECIAIS = new Set(["lead_primeiro", "lead_apelido", "tipo_servico", "servicos_catalogo"]);

/** 5/11 (Rúben, a visita real): na visita, as medidas ditas em voz alta entram nas medidas da visita (chaves `med_*`). */
const MEDIDA = /^med_(.+)$/;

/** Os textos do painel: a chamada (telemóvel em alta voz) ou a visita (o telemóvel na mesa, em casa do cliente). */
const TEXTOS = {
  chamada: { titulo: "Chamada em direto", sub: "O telemóvel em alta voz junto ao microfone. A transcrição aparece aqui e no fim preenche os campos em baixo.",
    iniciar: "Iniciar chamada", aOuvir: "A ouvir.", sem: "A chamada não deu nenhum campo para preencher." },
  visita: { titulo: "Gravar a visita", sub: "O telemóvel na mesa, perto de si e do cliente. A conversa aparece aqui e, no fim, a Olyvia propõe os campos da visita: o local, a área, as medidas, as peças e o prazo.",
    iniciar: "Começar a gravar", aOuvir: "A gravar a visita. O ecrã fica aceso.", sem: "A visita não deu nenhum campo para preencher." },
} as const;

export function ChamadaDireto({ ctx, d, grupos: gruposDoNegocio, modo = "chamada" }: { ctx: Ctx; d: Negocio; grupos: Grupo[]; modo?: "chamada" | "visita" }) {
  const T = TEXTOS[modo];
  // os campos do negócio, mais o cliente (nome), o serviço (tipo e serviços do Catálogo) e a visita combinada
  const svc = useMemo(() => ctx.S.svc ?? {}, [ctx.S.svc]);
  const medidas = useMemo(() => (modo === "visita" && LINHAS[d.linha] ? camposMedida(LINHAS[d.linha]) : []), [modo, d.linha]);
  const grupos = useMemo<Grupo[]>(() => modo === "visita" ? [
    ...gruposDoNegocio,
    ...(medidas.length ? [{ titulo: "Medidas da área", campos: medidas.map(([k, l]) => ({ k: `med_${k}`, l, t: "numero" as const,
      ajuda: "Só se foi dito o número (m², ou a contagem). Medidas em cm das paredes não são m²: deixe vazio." })) }] : []),
    { titulo: "Da visita", campos: [
      { k: "notas_visita", l: "Notas da visita", t: "texto_longo" as const,
        ajuda: "Para quem faz o orçamento e para o supervisor: o que se vai fazer, as escolhas, as dúvidas do cliente, o que ficou combinado e por decidir. Com detalhe." },
    ] },
  ] : [
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
  ], [gruposDoNegocio, d.dadosLead, svc, modo, medidas]);
  // o que o negócio já tem nessas chaves especiais, para as propostas saberem o que «já tinha»
  const fComEspeciais = useMemo(() => ({
    ...d.f,
    lead_primeiro: d.dadosLead?.primeiro ?? "", lead_apelido: d.dadosLead?.apelido ?? "",
    tipo_servico: d.linhaPorDefinir ? "" : nomeLinha(d),
    servicos_catalogo: servicosPedidos(d, ctx.S).map((x) => x.n).join(", "),
    ...Object.fromEntries(medidas.map(([k]) => [`med_${k}`, d.visita?.med && medida(d.visita.med, k) ? String(medida(d.visita.med, k)) : ""])),
  }), [d, ctx.S, medidas]);
  // 9/11: a gravação é do gravador da app (continua no Estúdio, guarda-se a cada fala); aqui só a parte deste negócio
  const g = useGravacao();
  const minha = g.negocio === d.id && g.modo === modo;
  const vivo = minha ? g.estado : "parado";
  const [fase, setFase] = useState<Fase>("livre");
  const [msg, setMsg] = useState("");
  const [falasFim, setFalasFim] = useState<Fala[]>([]);
  const falas = minha && vivo !== "parado" ? g.falas : falasFim;
  const [agora, setAgora] = useState(Date.now());
  const [extracao, setExtracao] = useState<Extracao | null>(null);
  const [resumoFim, setResumoFim] = useState("");
  const [voz, setVoz] = useState<string | null>(() => vozGuardada());
  const [aGravarVoz, setAGravarVoz] = useState<number | null>(null);
  const [mics, setMics] = useState<{ id: string; nome: string }[]>([]);
  const [mic, setMic] = useState(microfoneEscolhido);
  // quando o microfone ouviu alguma coisa pela última vez (para avisar se não ouve nada)
  const ouviuEm = useRef(Date.now());
  // por proposta: entra ou não, e o valor (editável) que entra
  const [escolhas, setEscolhas] = useState<Record<string, { incluir: boolean; valor: string }>>({});
  const [aplicadas, setAplicadas] = useState<string[] | null>(null);
  const falasRef = useRef<Fala[]>([]);
  const fila = useRef<Promise<void>>(Promise.resolve());
  // 5/11: a foto da folha da visita (lida pela função visita-folha) e a planta que ela deu
  const inputFolha = useRef<HTMLInputElement>(null);
  const [aLerFolha, setALerFolha] = useState(false);
  const [plantaLida, setPlantaLida] = useState<PlantaLida | null>(null);
  const [plantaUsada, setPlantaUsada] = useState(false);
  const fimLista = useRef<HTMLDivElement>(null);
  const teste = typeof location !== "undefined" && new URLSearchParams(location.search).get("teste") === "1";

  useEffect(() => { fimLista.current?.scrollIntoView({ block: "nearest" }); }, [falas.length]);
  // o painel à vista: o indicador de baixo esconde-se
  useEffect(() => painelAberto(), []);
  useEffect(() => { void microfones().then(setMics); }, [vivo]);
  // o relógio e o aviso do microfone calado, enquanto grava
  useEffect(() => {
    if (vivo !== "a_ouvir") return;
    ouviuEm.current = Date.now();
    const t = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [vivo]);
  if (g.nivel > 0.08) ouviuEm.current = Date.now();
  const segundos = minha && g.inicioEm ? Math.max(0, Math.floor((agora - g.inicioEm) / 1000)) : 0;
  const micCalado = vivo === "a_ouvir" && agora - ouviuEm.current > 12_000;

  const limpar = () => { setFalasFim([]); falasRef.current = []; setExtracao(null); setAplicadas(null); setResumoFim(""); setFase("livre"); };

  async function iniciar(continuar = false) {
    if (!continuar) limpar();
    setMsg("");
    try {
      await iniciarGravacao({ negocio: d.id, nome: d.nome, modo, voltar: urlDoNegocio(d.id) }, continuar);
    } catch (e) {
      setMsg((e as Error).message.startsWith("Já está") ? (e as Error).message : "Sem acesso ao microfone: " + (e as Error).message);
    }
  }

  /** Para o teste com a chamada de exemplo: cada fala vai ao Gemini por ordem, sem o gravador. */
  const tratarFala = (pcm: Float32Array, inicioS: number) => {
    fila.current = fila.current.then(async () => {
      try {
        const frases = await transcreverFala(pcm, inicioS, voz, voz ? vozTextoGuardado() : "");
        falasRef.current = [...falasRef.current, ...linhasDaFala(frases, "cliente")].sort((a, b) => a.inicio - b.inicio);
        setFalasFim(falasRef.current);
      } catch (e) {
        setMsg("Uma fala ficou por transcrever: " + (e as Error).message);
      }
    });
  };

  async function iniciarTeste() {
    limpar(); setFase("a_preencher"); setMsg("A carregar a chamada de exemplo...");
    try {
      const falasFicheiro = await falasDeFicheiro(EXEMPLO_URL);
      setMsg(`A ouvir a chamada de exemplo (${falasFicheiro.length} falas).`);
      for (const f of falasFicheiro) tratarFala(f.pcm, f.inicioS);
      await fila.current;
      await acabar(falasRef.current, false);
    } catch (e) {
      setFase("erro"); setMsg("A chamada de exemplo falhou: " + (e as Error).message);
    }
  }

  async function terminar() {
    setMsg("");
    const segs = await terminarGravacao();
    await acabar(segs, true);
  }

  /** As falas acabadas: ficam no negócio (a transcrição inteira) e vão preencher os campos. */
  async function acabar(segs: Fala[], doGravador: boolean) {
    falasRef.current = segs; setFalasFim(segs);
    if (segs.length) ctx.run(() => ctx.A.campo(d.id, modo === "visita" ? "transcricao_visita" : "transcricao_chamada", textoDaTranscricao(segs)));
    if (doGravador) descartarGravacao();
    if (!segs.length) { setFase("terminado"); setMsg(modo === "visita" ? "Gravação terminada sem falas transcritas." : "Chamada terminada sem falas transcritas."); return; }
    setFase("a_preencher"); setMsg("A preencher os campos com o que se disse...");
    try {
      const ext = await preencherCampos(segs, grupos, modo);
      setExtracao(ext);
      // 5/11 (Rúben: as falas do cliente vinham como «Comercial»): a etiqueta de cada linha passa a ser a revista pelo sentido
      const revistas = ext.falantes && ext.falantes.length === segs.length
        ? segs.filter((s, i) => s.falante !== ext.falantes![i]).length : 0;
      if (ext.falantes && ext.falantes.length === segs.length) {
        falasRef.current = segs.map((s, i) => ({ ...s, falante: ext.falantes![i], confianca_falante: 1 }));
        setFalasFim(falasRef.current);
        if (revistas) ctx.run(() => ctx.A.campo(d.id, modo === "visita" ? "transcricao_visita" : "transcricao_chamada", textoDaTranscricao(falasRef.current)));
      }
      setResumoFim(`${segs.length} falas, guardadas no negócio.${revistas ? ` Quem fala foi corrigido em ${revistas} ${revistas === 1 ? "linha" : "linhas"}, pelo sentido da conversa.` : ""}`);
      setFase("terminado"); setMsg(`${modo === "visita" ? "Gravação terminada" : "Chamada terminada"}. Confirme o que entra nos campos.`);
    } catch (e) {
      setFase("erro"); setMsg("A transcrição ficou guardada no negócio, mas os campos não: " + (e as Error).message);
    }
  }

  // terminada noutro sítio (o ecrã saiu a meio do «Terminar»): acaba-se aqui
  useEffect(() => {
    if (minha && g.estado === "terminada") void acabar(g.falas, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir o negócio
  }, []);

  async function folhaEscolhida(ficheiro: File | undefined) {
    if (!ficheiro) return;
    setALerFolha(true); setMsg("A ler a folha...");
    try {
      const r = await lerFolha(ficheiro, grupos, divisaoPrincipal(d.f) ?? undefined);
      const { planta, ...ext } = r;
      setExtracao((antes) => juntarExtracoes(antes, ext));
      setAplicadas(null);
      setPlantaLida(planta); setPlantaUsada(false);
      setMsg(`Folha lida.${planta ? " Há uma planta para confirmar." : ""} Confirme o que entra nos campos.`);
    } catch (e) {
      setMsg("Não deu para ler a folha: " + (e as Error).message);
    } finally {
      setALerFolha(false);
      if (inputFolha.current) inputFolha.current.value = "";
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
    } else {
      const m = k.match(MEDIDA), n = Number(valor.replace(",", "."));
      if (m && Number.isFinite(n) && n >= 0) porMedida(d.visita.med, m[1] as Parameters<typeof porMedida>[1], n);
    }
  };
  const aplicar = () => {
    ctx.run(() => {
      for (const p of entram) {
        const valor = escolhas[p.k].valor.trim();
        if (CHAVES_ESPECIAIS.has(p.k) || MEDIDA.test(p.k)) aplicarEspecial(p.k, valor);
        else ctx.A.campo(d.id, p.k, juntarVarios(defs.get(p.k), d.f[p.k] || "", valor));
      }
    });
    setAplicadas(entram.map((p) => p.l));
    // o dia combinado entrou: «Marcar a visita» marca-a sozinha (o comercial livre mais perto a essa hora) e o ecrã vai lá
    if (modo === "chamada" && entram.some((p) => p.k === "visita_dia")) {
      pedirMarcacao(d.id);
      setTimeout(() => document.getElementById(`chamada-1-vaga`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  };
  const aOuvir = vivo === "a_ouvir";
  const interrompida = vivo === "interrompida";
  const ocupado = vivo === "a_ligar" || vivo === "a_terminar" || fase === "a_preencher";
  const outroAGravar = !minha && g.negocio !== null && (g.estado === "a_ouvir" || g.estado === "a_ligar");
  const texto = msg || (minha ? g.msg : "") || (aOuvir ? (voz ? `${T.aOuvir} A sua voz está registada.` : `${T.aOuvir} Sem voz registada: as falas ficam como do cliente até registar a sua.`)
    : vivo === "a_ligar" ? "A pedir o microfone..." : outroAGravar ? `A gravar outro negócio (${g.nome}).`
    : voz ? "Pronto. A sua voz está registada." : "Pronto. Registe a sua voz uma vez para a transcrição saber quem fala.");

  return (
    <section aria-labelledby={`direto-${d.id}`} className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id={`direto-${d.id}`} className="flex items-center gap-2 text-lg font-semibold tracking-tight"><Mic className="h-5 w-5 text-primary" aria-hidden="true" />{T.titulo}</h2>
          <p className="text-sm text-muted-foreground">{T.sub}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {!aOuvir && !ocupado && !interrompida ? (
            <Button type="button" variant="outline" onClick={() => void registarVoz()} disabled={aGravarVoz !== null}>
              <UserRoundCheck className="h-4 w-4" aria-hidden="true" />
              {aGravarVoz !== null ? `A gravar... ${aGravarVoz}/${SEGUNDOS_VOZ} s` : voz ? "Registar a minha voz outra vez" : "Registar a minha voz"}
            </Button>
          ) : null}
          {!aOuvir && !ocupado && !interrompida ? <Button type="button" onClick={() => void iniciar()} disabled={aGravarVoz !== null || outroAGravar}><Mic className="h-4 w-4" aria-hidden="true" />{T.iniciar}</Button> : null}
          {interrompida ? <Button type="button" onClick={() => void iniciar(true)}><Mic className="h-4 w-4" aria-hidden="true" />Continuar a gravar</Button> : null}
          {modo === "visita" && !ocupado ? (
            <>
              <input ref={inputFolha} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true"
                onChange={(e) => void folhaEscolhida(e.target.files?.[0])} />
              <Button type="button" variant="outline" disabled={aLerFolha} onClick={() => inputFolha.current?.click()}>
                <Camera className="h-4 w-4" aria-hidden="true" />{aLerFolha ? "A ler a folha..." : "Ler a folha"}
              </Button>
            </>
          ) : null}
          {!aOuvir && !ocupado && teste ? <Button type="button" variant="outline" onClick={() => void iniciarTeste()} disabled={aGravarVoz !== null}>Testar com a chamada de exemplo</Button> : null}
          {aOuvir || interrompida ? <Button type="button" variant="destructive" onClick={() => void terminar()}><PhoneOff className="h-4 w-4" aria-hidden="true" />Terminar e preencher</Button> : null}
          {ocupado ? <Button type="button" disabled><Square className="h-4 w-4" aria-hidden="true" />{vivo === "a_ligar" ? "A ligar..." : fase === "a_preencher" ? "A preencher..." : "A terminar..."}</Button> : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground" aria-live="polite">
        <span className={cn((fase === "erro" || interrompida) && "text-destructive")}>{texto}</span>
        {aOuvir ? (
          <>
            <span className={cn("inline-block h-2.5 w-2.5 rounded-full", g.aFalar ? "bg-success" : "bg-muted-foreground/40")} aria-label={g.aFalar ? "a ouvir fala" : "silêncio"} />
            <span>{tempo(segundos)}</span>
            {g.pendentes > 0 ? <span>a transcrever {g.pendentes}…</span> : null}
          </>
        ) : null}
        {minha && g.falhadas > 0 ? (
          <Button type="button" size="sm" variant="outline" onClick={repetirFalhadas}><RotateCcw className="h-4 w-4" aria-hidden="true" />Tentar outra vez ({g.falhadas})</Button>
        ) : null}
        {fase === "terminado" ? <span>{resumoFim}</span> : null}
      </div>
      {/* 9/11 (Rúben: «talvez seja por causa do microfone»): o nível do microfone à vista, qual está a gravar, e escolher outro */}
      {aOuvir ? (
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center gap-3 text-sm">
            <span className="shrink-0 text-muted-foreground">Microfone</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="meter" aria-label="Nível do microfone" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(g.nivel * 100)}>
              <span className={cn("block h-full rounded-full transition-[width] duration-200", g.nivel > 0.08 ? "bg-success" : "bg-muted-foreground/40")} style={{ width: `${Math.round(g.nivel * 100)}%` }} />
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{g.microfone}{g.pausas ? ` · cortado ${g.pausas} ${g.pausas === 1 ? "vez" : "vezes"} e retomado` : ""}</p>
          {micCalado ? <p className="text-sm text-warning-foreground">O microfone quase não ouve nada. Ponha o aparelho mais perto de quem fala{mics.length > 1 ? " ou escolha outro microfone (termine e volte a começar)" : ""}.</p> : null}
        </div>
      ) : !ocupado && mics.length > 1 ? (
        <label className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">Microfone
          <select value={mic} onChange={(e) => { setMic(e.target.value); escolherMicrofone(e.target.value); }} className="h-9 min-w-0 max-w-full rounded-lg border border-input bg-card px-2.5 text-[15px] text-foreground">
            <option value="">O do aparelho</option>
            {mics.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        </label>
      ) : null}

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

      {plantaLida ? (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/[0.04] p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[15px]">
            <b className="font-semibold">Planta da folha:</b> paredes de {plantaLida.paredes.map((x) => x.c).join(", ")} cm
            {plantaLida.pecas.length ? `, ${plantaLida.pecas.length} ${plantaLida.pecas.length === 1 ? "peça" : "peças"}` : ""}.{" "}
            {(() => { const pl = plantaDaFolha(plantaLida).paredes, f = faltaFechar(pl);
              return f > 1 ? `Não fecha (faltam ${f === Infinity ? "paredes" : `${f} cm`}): corrija-a em «Medidas da área».` : `Chão de ${String(areaChaoM2(pl)).replace(".", ",")} m².`; })()}
            {plantaLida.confianca < 0.75 ? " Leitura incerta: confira as medidas." : ""}
          </p>
          {plantaUsada ? <span className="text-sm text-success">Na planta. Veja-a em «Medidas da área».</span> : (
            <Button type="button" className="shrink-0" onClick={() => { ctx.A.campo(d.id, "planta", gravarPlanta(plantaDaFolha(plantaLida))); setPlantaUsada(true); }}>
              <Check className="h-4 w-4" aria-hidden="true" />Usar esta planta
            </Button>
          )}
        </div>
      ) : null}

      {extracao ? (
        <div className="mt-4 space-y-3">
          {extracao.resumo ? <p className="rounded-xl bg-muted/60 p-3 text-[15px] leading-snug"><b>Resumo:</b> {extracao.resumo}</p> : null}
          {props.length === 0 ? <p className="text-sm text-muted-foreground">{T.sem}</p> : (
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
  // 5/11 (a folha): «Cor» aparece na base, na coluna, no resguardo… o bloco diz de que peça é
  const rotulo = def?.bloco ? `${def.bloco} · ${p.l}` : p.l;
  return (
    <li className={cn("rounded-xl border border-border bg-background px-3 py-2.5 transition-colors", escolha.incluir ? "border-primary/40" : "opacity-70")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="button" role="checkbox" aria-checked={escolha.incluir} aria-labelledby={`${id}-rotulo`} disabled={bloqueada}
          onClick={() => onMudar({ incluir: !escolha.incluir })}
          className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-lg border-2 transition-colors",
            escolha.incluir ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card text-transparent hover:border-primary/60")}>
          <Check className="h-4 w-4" aria-hidden="true" />
        </button>
        <label id={`${id}-rotulo`} htmlFor={id} className="w-44 shrink-0 text-sm text-muted-foreground">{rotulo}</label>
        <div className="min-w-[200px] flex-1"><Editor id={id} def={def} valor={escolha.valor} rotulo={rotulo} bloqueado={bloqueada} onMudar={(v) => onMudar({ valor: v })} /></div>
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
