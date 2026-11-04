// 4/11 (Rúben): o painel «Chamada em direto» no «Tudo na chamada». O telemóvel em alta voz, o browser capta o
// microfone e corta as falas (VAD Silero em WebAssembly); cada fala vai à função Supabase chamada-transcrever
// (Gemini) e aparece aqui com quem falou; no fim, chamada-campos propõe os campos da Lead e do Contacto e a
// comercial confirma o que entra. Nada corre no PC de ninguém. A lógica das propostas está em chamadaMotor.ts
// e a ligação ao Supabase em chamadaNuvem.ts.
import { useEffect, useRef, useState } from "react";
import { Mic, PhoneOff, Sparkles, Square, UserRoundCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Grupo } from "./campos";
import type { Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { aAplicar, juntarVarios, propostas, type Extracao, type Fala, type Proposta } from "./chamadaMotor";
import { falasDeFicheiro, gravarMicrofone, guardarVoz, linhasDaFala, ouvirMicrofone, preencherCampos, transcreverFala, vozGuardada, wavBase64, type Ouvinte } from "./chamadaNuvem";

type EstadoLig = "parado" | "a_ligar" | "a_ouvir" | "a_terminar" | "terminado" | "erro";
const EXEMPLO_URL = "/chamadas/exemplo.ogg";
const SEGUNDOS_VOZ = 15;

const tempo = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function ChamadaDireto({ ctx, d, grupos }: { ctx: Ctx; d: Negocio; grupos: Grupo[] }) {
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
  const [substituir, setSubstituir] = useState(false);
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
        const frases = await transcreverFala(pcm, inicioS, voz);
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
      setResumoFim(`${segs.length} falas.`);
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
      guardarVoz(b64); setVoz(b64);
      setMsg("A sua voz ficou registada neste browser.");
    } catch (e) {
      setMsg("Não deu para gravar a voz: " + (e as Error).message);
    } finally {
      setAGravarVoz(null);
    }
  }

  const props = propostas(extracao, grupos, d.f);
  const entram = aAplicar(props, substituir);
  const defs = new Map(grupos.flatMap((g) => g.campos).map((c) => [c.k, c] as const));
  const aplicar = () => {
    ctx.run(() => { for (const p of entram) ctx.A.campo(d.id, p.k, juntarVarios(defs.get(p.k), d.f[p.k] || "", p.valor)); });
    setAplicadas(entram.map((p) => p.l));
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
              <ul className="divide-y divide-border rounded-xl border border-border">
                {props.map((p) => <LinhaProposta key={p.k} p={p} entra={entram.includes(p)} />)}
              </ul>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" onClick={aplicar} disabled={entram.length === 0 || aplicadas !== null}><Sparkles className="h-4 w-4" aria-hidden="true" />Preencher {entram.length} {entram.length === 1 ? "campo" : "campos"}</Button>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={substituir} onChange={(e) => setSubstituir(e.target.checked)} disabled={aplicadas !== null} />Substituir também os já preenchidos</label>
                {aplicadas ? <span className="text-sm text-success">Preenchidos: {aplicadas.join(", ")}. Confira em baixo e corrija o que for preciso.</span> : null}
              </div>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

function LinhaProposta({ p, entra }: { p: Proposta; entra: boolean }) {
  const rever = p.estado === "rever";
  return (
    <li className={cn("flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 text-[15px]", !entra && "opacity-60")}>
      <span className="w-44 shrink-0 text-sm text-muted-foreground">{p.l}</span>
      <span className="font-medium">{p.valor}</span>
      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", rever ? "bg-warning/15 text-warning-foreground" : "bg-success/15 text-success")}>{rever ? "a rever" : "ouvido"} · {Math.round(p.confianca * 100)}%</span>
      {p.jaTinha && p.jaTinha !== p.valor ? <span className="text-xs text-muted-foreground">já tinha «{p.jaTinha}»{entra ? "" : " · fica"}</span> : null}
      {p.excerto ? <span className="basis-full text-xs italic text-muted-foreground">{p.excerto}</span> : null}
    </li>
  );
}
