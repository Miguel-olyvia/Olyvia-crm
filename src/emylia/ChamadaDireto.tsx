// 4/11 (Rúben): o painel «Chamada em direto» no «Tudo na chamada»: o telemóvel em alta voz, o browser capta o
// microfone, o motor local transcreve e diz quem fala; no fim propõe os campos da Lead e do Contacto e a comercial
// confirma o que entra. A lógica (campos, propostas) está em chamadaDireto.ts; aqui é o microfone, o WebSocket e o ecrã.
import { useEffect, useRef, useState } from "react";
import { Mic, PhoneOff, Sparkles, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Grupo } from "./campos";
import type { Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { aAplicar, camposParaMotor, httpDoMotor, juntarVarios, propostas, urlDoMotor, type Extracao, type Fala, type Proposta } from "./chamadaMotor";

type EstadoLig = "parado" | "a_ligar" | "a_ouvir" | "a_terminar" | "terminado" | "erro";

// O AudioWorklet que corta o microfone em blocos de 100 ms de int16 (o que o motor espera). Vai como texto para não
// precisar de um ficheiro à parte no build.
const WORKLET = `class Captura extends AudioWorkletProcessor {
  constructor(){ super(); this.buf = []; this.n = 0; }
  process(inputs){ const x = inputs[0][0]; if (!x) return true;
    this.buf.push(new Float32Array(x)); this.n += x.length;
    if (this.n >= 1600) { const out = new Int16Array(this.n); let k = 0;
      for (const b of this.buf) for (let i = 0; i < b.length; i++) out[k++] = Math.max(-1, Math.min(1, b[i])) * 32767;
      this.port.postMessage(out.buffer, [out.buffer]); this.buf = []; this.n = 0; }
    return true; } }
registerProcessor('captura', Captura);`;

const tempo = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function ChamadaDireto({ ctx, d, grupos }: { ctx: Ctx; d: Negocio; grupos: Grupo[] }) {
  const [estado, setEstado] = useState<EstadoLig>("parado");
  const [msg, setMsg] = useState("");
  const [falas, setFalas] = useState<Fala[]>([]);
  const [nivel, setNivel] = useState<{ som: number; a_falar: boolean; segundos: number } | null>(null);
  const [extracao, setExtracao] = useState<Extracao | null>(null);
  const [resumoFim, setResumoFim] = useState("");
  const [vozes, setVozes] = useState<string[]>([]);
  const [comercial, setComercial] = useState(() => { try { return localStorage.getItem("olyvia.chamadas.comercial") || ""; } catch { return ""; } });
  const [substituir, setSubstituir] = useState(false);
  const [aplicadas, setAplicadas] = useState<string[] | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const pararAudio = useRef<() => void>(() => {});
  const fimLista = useRef<HTMLDivElement>(null);
  const teste = typeof location !== "undefined" && new URLSearchParams(location.search).get("teste") === "1";

  useEffect(() => {
    fetch(httpDoMotor() + "/api/vozes").then((r) => r.json()).then((v: string[]) => setVozes(v)).catch(() => setVozes([]));
  }, []);
  useEffect(() => { fimLista.current?.scrollIntoView({ block: "nearest" }); }, [falas.length]);
  useEffect(() => () => { pararAudio.current(); ws.current?.close(); }, []);

  const fechar = () => { pararAudio.current(); pararAudio.current = () => {}; ws.current = null; };

  async function iniciar(modoTeste = false) {
    setEstado("a_ligar"); setMsg(modoTeste ? "A ligar ao motor..." : "A pedir o microfone..."); setFalas([]); setExtracao(null); setAplicadas(null); setNivel(null);
    try { localStorage.setItem("olyvia.chamadas.comercial", comercial); } catch { /* sem localStorage */ }
    let stream: MediaStream | null = null;
    if (!modoTeste) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
      } catch (e) { setEstado("erro"); setMsg("Sem acesso ao microfone: " + (e as Error).message); return; }
    }
    let socket: WebSocket;
    try { socket = new WebSocket(urlDoMotor()); } catch (e) { setEstado("erro"); setMsg("Não dá para ligar ao motor: " + (e as Error).message); stream?.getTracks().forEach((t) => t.stop()); return; }
    socket.binaryType = "arraybuffer";
    ws.current = socket;
    socket.onopen = () => {
      setMsg("A carregar os modelos no motor...");
      socket.send(JSON.stringify({ nome: `negocio-${d.id}-${Date.now().toString(36)}`, comercial: comercial || null, campos: camposParaMotor(grupos), teste: modoTeste }));
    };
    socket.onmessage = async (ev) => {
      const m = JSON.parse(ev.data);
      if (m.tipo === "pronto") {
        setEstado("a_ouvir");
        setMsg(modoTeste ? "A ouvir a chamada de exemplo." : m.comercial ? `A ouvir. Voz de ${m.comercial} registada.` : "A ouvir. Sem voz registada: a primeira voz conta como do cliente.");
        if (stream) {
          const ctxA = new AudioContext({ sampleRate: 16000 });
          await ctxA.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" })));
          const fonte = ctxA.createMediaStreamSource(stream);
          const nodo = new AudioWorkletNode(ctxA, "captura");
          nodo.port.onmessage = (e) => { if (socket.readyState === 1) socket.send(e.data); };
          fonte.connect(nodo); nodo.connect(ctxA.destination);
          const s = stream;
          pararAudio.current = () => { try { nodo.disconnect(); fonte.disconnect(); s.getTracks().forEach((t) => t.stop()); void ctxA.close(); } catch { /* já fechado */ } };
        }
      } else if (m.tipo === "fala") setFalas((f) => [...f, m as Fala]);
      else if (m.tipo === "nivel") setNivel({ som: m.som, a_falar: m.a_falar, segundos: m.segundos });
      else if (m.tipo === "a_terminar") { setEstado("a_terminar"); setMsg("A preencher os campos com o que se disse (menos de um minuto)..."); pararAudio.current(); }
      else if (m.tipo === "fim") {
        setEstado("terminado"); setExtracao(m.extracao ?? null);
        setResumoFim(`${m.minutos} min, ${m.falas} falas, ${m.latencia_media} s por fala.`);
        setMsg(m.extracao ? "Chamada terminada. Confirme o que entra nos campos." : "Chamada terminada sem falas transcritas.");
        fechar();
      } else if (m.tipo === "erro") { setEstado("erro"); setMsg("Erro no motor: " + m.mensagem); fechar(); }
    };
    socket.onerror = () => { setEstado((e) => (e === "a_ligar" ? "erro" : e)); setMsg(`Não dá para ligar ao motor em ${urlDoMotor()}. Está a correr? (python tools/chamadas/servidor.py)`); };
    socket.onclose = () => { setEstado((e) => { if (e === "a_ouvir" || e === "a_terminar") { setMsg("Ligação ao motor perdida. O que havia ficou guardado no motor."); return "erro"; } return e; }); fechar(); };
  }

  const terminar = () => { setEstado("a_terminar"); setMsg("A terminar..."); if (ws.current?.readyState === 1) ws.current.send("terminar"); };

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
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">Voz do comercial
            <select value={comercial} onChange={(e) => setComercial(e.target.value)} disabled={aOuvir || ocupado}
              className="h-9 rounded-lg border border-input bg-background px-2 text-sm text-foreground">
              <option value="">sem voz registada</option>
              {vozes.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          {!aOuvir && !ocupado ? <Button type="button" onClick={() => void iniciar(false)}><Mic className="h-4 w-4" aria-hidden="true" />Iniciar chamada</Button> : null}
          {!aOuvir && !ocupado && teste ? <Button type="button" variant="outline" onClick={() => void iniciar(true)}>Testar com a chamada de exemplo</Button> : null}
          {aOuvir ? <Button type="button" variant="destructive" onClick={terminar}><PhoneOff className="h-4 w-4" aria-hidden="true" />Terminar e preencher</Button> : null}
          {ocupado ? <Button type="button" disabled><Square className="h-4 w-4" aria-hidden="true" />{estado === "a_ligar" ? "A ligar..." : "A terminar..."}</Button> : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground" aria-live="polite">
        <span className={cn(estado === "erro" && "text-destructive")}>{msg || (vozes.length ? "Pronto." : `Motor em ${urlDoMotor()}.`)}</span>
        {nivel ? (
          <>
            <span className="inline-block h-2 w-32 overflow-hidden rounded bg-muted" aria-hidden="true">
              <i className={cn("block h-full transition-[width]", nivel.a_falar ? "bg-success" : "bg-muted-foreground/40")} style={{ width: `${Math.min(100, nivel.som * 400)}%` }} />
            </span>
            <span>{tempo(nivel.segundos)}</span>
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
