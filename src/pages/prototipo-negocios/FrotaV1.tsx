// A Frota no V1 (16/10/2026). A Frota do Rafael (frota/) tem 10 ecrãs, 9 separadores e 13 diálogos para quatro coisas do dia a dia;
// aqui são dois ecrãs: a Frota (o que fazer agora, o resto das tarefas e as viaturas) e a viatura (numa página, sem separadores).
// As regras e as ações são as dele (frota/regras.ts, frota/acoes.ts, frota/loja.ts), sem mudanças: aqui só se decide o que mostrar e como.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HOJE, addDias } from "./frota/base";
import {
  gravarAbastecer, gravarConcluir, gravarIdentificar, gravarKm, gravarManut, gravarOcorrencia, gravarRenovar, iniAbastecer, iniConcluir,
  validarAbastecer, validarConcluir, validarIdentificar, validarKm, validarManut, validarOcorrencia, validarRenovar, type Erros, type Vals,
} from "./frota/acoes";
import { executar, lerFrota, useFrota } from "./frota/loja";
import { OFICINAS } from "./frota/seed";
import type { Frota } from "./frota/tipos";
import {
  condutoresParaMulta, datasRevisao, fData, fichaViatura, linhasViaturas, nomeViatura, resumoFrota, tarefasFrota, validadeSugerida, type TarefaFrota,
} from "./frotaV1Docs";

const LISTA = "divide-y divide-border rounded-2xl border border-border bg-card px-4 shadow-[var(--shadow-sm)] sm:px-5";
const CAMPO = "h-11 w-full rounded-lg border border-input bg-background px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25 aria-[invalid=true]:border-destructive";
const ESCOLHA = (on: boolean): string => cn("min-h-11 rounded-lg border px-4 text-[15px] transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:border-foreground/40");

/** A viatura aberta (a página desmonta ao mudar de ecrã). */
let aberta: string | null = null;
export function esquecerFrotaV1(): void { aberta = null; }
/** "Abrir na Frota" noutro módulo (a página da obra, Definições › Agenda): a Frota do V1 abre nessa viatura. */
export function abrirViaturaFrotaV1(vid: string | null): void { aberta = vid; }

/* ---------------------------------------------------------------- peças dos formulários */

function Campo({ id, rotulo, erro, children, nota }: { id: string; rotulo: string; erro?: string; nota?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[15px] font-medium">{rotulo}{nota && <span className="font-normal text-muted-foreground"> {nota}</span>}</label>
      {children}
      {erro && <p id={id + "-erro"} className="flex items-center gap-2 text-[15px] font-medium text-destructive animate-in fade-in-0"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />{erro}</p>}
    </div>
  );
}
const ligar = (id: string, erro?: string) => ({ id, "aria-invalid": erro ? true : undefined, "aria-describedby": erro ? id + "-erro" : undefined });

/** Escolher em vez de escrever (P5): botões com aria-pressed num grupo com rótulo. */
function Escolhas({ rotulo, opcoes, valor, mudar, sugerido, erro }: { rotulo: string; opcoes: { v: string; t: string }[]; valor: string; mudar: (v: string) => void; sugerido?: string; erro?: string }) {
  const id = "esc-" + rotulo.replace(/\W+/g, "");
  return (
    <div className="grid gap-1.5">
      <span id={id} className="text-[15px] font-medium">{rotulo}</span>
      <div role="group" aria-labelledby={id} aria-describedby={erro ? id + "-erro" : undefined} className="flex flex-wrap gap-2">
        {opcoes.map((o) => (
          <button key={o.v} type="button" aria-pressed={valor === o.v} aria-invalid={erro ? true : undefined} onClick={() => mudar(o.v)}
            className={cn(ESCOLHA(valor === o.v), valor !== o.v && sugerido === o.v && "border-2 border-dashed border-primary/70")}>
            {o.t}{valor !== o.v && sugerido === o.v && <span className="ml-1.5 text-sm text-primary">Sugerido</span>}
          </button>
        ))}
      </div>
      {erro && <p id={id + "-erro"} className="flex items-center gap-2 text-[15px] font-medium text-destructive"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />{erro}</p>}
    </div>
  );
}

/** Uma data num toque (C7): as sugeridas e "Outra data". */
function EscolherData({ rotulo, opcoes, valor, mudar, erro }: { rotulo: string; opcoes: { rotulo: string; data: string }[]; valor: string; mudar: (d: string) => void; erro?: string }) {
  const [outra, setOutra] = useState(!opcoes.some((o) => o.data === valor));
  const id = "data-" + rotulo.replace(/\W+/g, "");
  return (
    <div className="grid gap-1.5">
      <span id={id} className="text-[15px] font-medium">{rotulo}</span>
      <div role="group" aria-labelledby={id} className="flex flex-wrap gap-2">
        {opcoes.map((o) => <button key={o.data} type="button" aria-pressed={!outra && valor === o.data} onClick={() => { setOutra(false); mudar(o.data); }} className={ESCOLHA(!outra && valor === o.data)}>{o.rotulo}</button>)}
        <button type="button" aria-pressed={outra} onClick={() => setOutra(true)} className={ESCOLHA(outra)}>Outra data</button>
      </div>
      {outra && <input type="date" aria-label={rotulo + ": outra data"} value={valor} onChange={(e) => mudar(e.target.value)} {...ligar(id + "-d", erro)} className={cn(CAMPO, "sm:w-56")} />}
      {erro && <p id={id + "-d-erro"} className="flex items-center gap-2 text-[15px] font-medium text-destructive"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />{erro}</p>}
    </div>
  );
}

/** Valida com a regra da Frota; sem erros, grava com a ação dela. Devolve a mensagem de sucesso, ou null (os erros ficam em `setErros`). */
function gravar(x: Vals, validar: (F: Frota, x: Vals) => Erros, acao: (F: Frota, x: Vals) => string, setErros: (e: Erros) => void): string | null {
  const e = validar(lerFrota(), x);
  if (Object.keys(e).length) {
    setErros(e);
    setTimeout(() => (document.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus(), 30); // R6: leva ao campo
    return null;
  }
  const r = executar((F) => acao(F, x));
  if (!r.ok) { setErros({ geral: r.erro }); return null; }
  setErros({});
  return r.valor;
}

const num = (s: string): string => s.replace(",", ".").replace(/[^\d.]/g, "");

/* ---------------------------------------------------------------- o formulário de cada tarefa */

function FormTarefa({ t, feito, primario = true }: { t: TarefaFrota; feito: (msg: string) => void; primario?: boolean }) {
  const F = useFrota();
  const v = F.viaturas.find((x) => x.id === t.vid)!;
  const a = t.acao;
  const [x, setX] = useState<Vals>(() => {
    if (a.tipo === "renovar") return { vid: t.vid, k: a.k, data: validadeSugerida(v.venc[a.k]), valor: "" };
    if (a.tipo === "revisao") return { vid: t.vid, tipo: "Revisão", data: datasRevisao()[0].data, oficina: OFICINAS[0], valor: "" };
    if (a.tipo === "concluir") return iniConcluir(F, a.mid);
    return { o: a.oid, pid: "" };
  });
  const [e, setE] = useState<Erros>({});
  const muda = (k: string, val: string) => { setX((y) => ({ ...y, [k]: val })); setE((z) => ({ ...z, [k]: "" })); };
  const sub = () => {
    const m = a.tipo === "renovar" ? gravar(x, validarRenovar, gravarRenovar, setE)
      : a.tipo === "revisao" ? gravar(x, validarManut, gravarManut, setE)
      : a.tipo === "concluir" ? gravar(x, validarConcluir, gravarConcluir, setE)
      : gravar(x, validarIdentificar, gravarIdentificar, setE);
    if (m) feito(m);
  };
  const umAno = validadeSugerida(a.tipo === "renovar" ? v.venc[a.k] : null);
  return (
    <form noValidate className="mt-5 grid gap-5" onSubmit={(ev) => { ev.preventDefault(); sub(); }}>
      {a.tipo === "renovar" && (
        <>
          <EscolherData rotulo="Nova validade" valor={x.data} mudar={(d) => muda("data", d)} erro={e.data} opcoes={[{ rotulo: `Daqui a 1 ano (${fData(umAno)})`, data: umAno }]} />
          <Campo id="renovar-valor" rotulo="Quanto custou" nota="(opcional, em €)"><input inputMode="decimal" value={x.valor} onChange={(ev) => muda("valor", num(ev.target.value))} {...ligar("renovar-valor", e.valor)} className={cn(CAMPO, "text-right sm:w-40")} /></Campo>
        </>
      )}
      {a.tipo === "revisao" && (
        <>
          <EscolherData rotulo="Quando" valor={x.data} mudar={(d) => muda("data", d)} erro={e.data} opcoes={datasRevisao()} />
          <Escolhas rotulo="Onde" valor={x.oficina} mudar={(o) => muda("oficina", o)} opcoes={OFICINAS.filter((o) => !/Inspe/.test(o)).map((o) => ({ v: o, t: o }))} />
        </>
      )}
      {a.tipo === "concluir" && (
        <div className="grid gap-5 sm:grid-cols-2">
          <Campo id="concluir-km" rotulo="Quilómetros agora"><input inputMode="numeric" value={x.km} onChange={(ev) => muda("km", ev.target.value.replace(/\D/g, ""))} {...ligar("concluir-km", e.km)} className={cn(CAMPO, "text-right")} /></Campo>
          <Campo id="concluir-valor" rotulo="Quanto custou" nota="(em €, 0 se nada)"><input inputMode="decimal" value={x.valor} onChange={(ev) => muda("valor", num(ev.target.value))} {...ligar("concluir-valor", e.valor)} className={cn(CAMPO, "text-right")} /></Campo>
        </div>
      )}
      {a.tipo === "identificar" && (
        <Escolhas rotulo="Quem conduzia" valor={x.pid} mudar={(p) => muda("pid", p)} erro={e.pid}
          sugerido={condutoresParaMulta(F, a.oid).find((p) => p.sugerido)?.id} opcoes={condutoresParaMulta(F, a.oid).map((p) => ({ v: p.id, t: p.nome }))} />
      )}
      {e.geral && <p role="alert" className="flex items-center gap-2 text-[15px] font-medium text-destructive"><AlertCircle className="h-4 w-4" aria-hidden="true" />{e.geral}</p>}
      <div><Button type="submit" size="lg" variant={primario ? "default" : "outline"} className="w-full sm:w-auto">{t.btn}</Button></div>
    </form>
  );
}

/** O cartão "O que fazer agora" (C21): uma frase, o porquê e o formulário da tarefa, com o único primário. */
function Agora({ t, feito, irViatura, primario = true }: { t: TarefaFrota | undefined; feito: (msg: string) => void; irViatura?: (vid: string) => void; primario?: boolean }) {
  const titulo = useRef<HTMLParagraphElement>(null);
  return (
    <section aria-labelledby="frota-agora" className={cn("mt-8 rounded-2xl border bg-card p-5 sm:p-6", t ? "border-primary/25 shadow-[var(--shadow-md)]" : "border-border shadow-[var(--shadow-sm)]")}>
      <h2 id="frota-agora" className="text-sm font-medium text-primary">O que fazer agora</h2>
      {t ? (
        <div key={t.id} className="animate-in fade-in-0 slide-in-from-right-3 duration-300">
          <p ref={titulo} tabIndex={-1} className="mt-2 flex items-start gap-2 text-xl font-semibold outline-none">
            {t.urgente && <AlertCircle className="mt-1 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />}{t.t}
          </p>
          <p className="mt-1 text-base text-muted-foreground">
            {irViatura && <><button type="button" onClick={() => irViatura(t.vid)} className="font-medium text-foreground underline-offset-4 hover:underline">{t.viatura}</button>{" · "}</>}
            {t.urgente && <span className="sr-only">Urgente. </span>}{t.sub}
          </p>
          <FormTarefa t={t} feito={feito} primario={primario} />
        </div>
      ) : (
        <p className="mt-2 flex items-center gap-2 text-lg"><CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden="true" />Nada por fazer. Os documentos a vencer, as revisões e as multas aparecem aqui.</p>
      )}
    </section>
  );
}

/** A mensagem do que acabou de se fazer (C24): diz o que ficou feito e desaparece sozinha. */
function useFeito(): [string, (m: string) => void] {
  const [msg, setMsg] = useState("");
  useEffect(() => { if (!msg) return; const id = setTimeout(() => setMsg(""), 5000); return () => clearTimeout(id); }, [msg]);
  return [msg, setMsg];
}
const Feito = ({ msg }: { msg: string }) => (
  <div role="status" className="min-h-0">
    {msg && (
      <p className="mt-6 flex items-center gap-3 rounded-xl border border-success/30 bg-success/[0.08] px-4 py-3 text-[15px] animate-in fade-in-0 slide-in-from-top-2 duration-500">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-success text-white"><Check className="h-4 w-4" aria-hidden="true" /></span>{msg}
      </p>
    )}
  </div>
);

/* ---------------------------------------------------------------- a Frota */

export function FrotaV1() {
  const F = useFrota();
  const [sel, setSelE] = useState<string | null>(aberta);
  const setSel = (v: string | null) => { setSelE(v); aberta = v; };
  const [msg, feito] = useFeito();
  if (sel && F.viaturas.some((v) => v.id === sel)) return <ViaturaV1 vid={sel} voltar={() => setSel(null)} />;

  const T = tarefasFrota(F), [primeira, ...resto] = T, L = linhasViaturas(F);
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-8 sm:pt-10">
      <h1 className="text-3xl font-semibold tracking-tight">Frota</h1>
      <p className="mt-1 text-base text-muted-foreground">{resumoFrota(F)}</p>
      <Feito msg={msg} />
      <Agora t={primeira} feito={feito} irViatura={setSel} />

      {resto.length > 0 && (
        <section aria-labelledby="frota-depois" className="mt-10">
          <h2 id="frota-depois" className="text-lg font-semibold">Depois</h2>
          <ul className={cn("mt-3", LISTA)}>
            {resto.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => setSel(t.vid)} className="group flex min-h-16 w-full items-center gap-4 py-3 text-left hover:bg-muted/50 sm:px-2">
                  {t.urgente ? <AlertCircle className="h-5 w-5 shrink-0 text-destructive" aria-hidden="true" /> : <span className="h-5 w-5 shrink-0" aria-hidden="true" />}
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-medium">{t.t}{t.urgente && <span className="sr-only"> (urgente)</span>}</span>
                    <span className="block text-[15px] text-muted-foreground">{t.viatura} · {t.sub}</span>
                  </span>
                  <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="frota-viaturas" className="mt-10">
        <h2 id="frota-viaturas" className="text-lg font-semibold">Viaturas</h2>
        <ul className={cn("mt-3", LISTA)}>
          {L.map((l) => (
            <li key={l.vid}>
              <button type="button" onClick={() => setSel(l.vid)} className="group flex min-h-16 w-full items-center gap-4 py-3 text-left hover:bg-muted/50 sm:px-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-medium">{l.nome}</span>
                  <span className="block text-[15px] text-muted-foreground">{l.quem}{l.estado !== "Ativa" ? " · " + l.estado : ""}</span>
                  <span className={cn("mt-0.5 flex items-center gap-1.5 text-[15px]", l.urgente ? "text-destructive" : "text-foreground")}>
                    {l.urgente && <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />}{l.proximo}{l.tarefas > 1 ? ` (e mais ${l.tarefas - 1})` : ""}
                  </span>
                </span>
                <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------- a viatura */

type Registo = "km" | "abastecer" | "ocorrencia";
const REGISTOS: { id: Registo; t: string }[] = [{ id: "km", t: "Quilómetros" }, { id: "abastecer", t: "Abastecimento" }, { id: "ocorrencia", t: "Avaria, multa ou sinistro" }];

function ViaturaV1({ vid, voltar }: { vid: string; voltar: () => void }) {
  const F = useFrota();
  const f = fichaViatura(F, vid)!;
  const T = tarefasFrota(F, vid);
  const [reg, setReg] = useState<Registo | null>(null);
  const [msg, feito] = useFeito();
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titulo.current?.focus(); }, [vid]);
  const fechar = (m: string) => { setReg(null); feito(m); };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-8 sm:pt-10">
      <button type="button" onClick={voltar} className="inline-flex min-h-11 items-center gap-2 rounded-lg text-[15px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Frota
      </button>
      <h1 ref={titulo} tabIndex={-1} className="mt-2 text-3xl font-semibold tracking-tight outline-none">{f.nome}</h1>
      <p className="mt-1 text-base text-muted-foreground">{f.sub}</p>
      <Feito msg={msg} />

      {/* com um registo aberto, o primário é o desse registo: o do "O que fazer agora" passa a secundário (P1) */}
      <Agora t={T[0]} feito={feito} primario={reg === null} />

      <section aria-labelledby="registar" className="mt-10">
        <h2 id="registar" className="text-lg font-semibold">Registar</h2>
        <div role="group" aria-label="O que registar" className="mt-3 flex flex-wrap gap-2">
          {REGISTOS.map((r) => (
            <button key={r.id} type="button" aria-pressed={reg === r.id} aria-expanded={reg === r.id} onClick={() => setReg(reg === r.id ? null : r.id)} className={ESCOLHA(reg === r.id)}>{r.t}</button>
          ))}
        </div>
        {reg && (
          <div className="mt-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)] animate-in fade-in-0 slide-in-from-top-1">
            {reg === "km" && <RegistoKm vid={vid} feito={fechar} />}
            {reg === "abastecer" && <RegistoAbastecer vid={vid} feito={fechar} />}
            {reg === "ocorrencia" && <RegistoOcorrencia vid={vid} feito={fechar} />}
          </div>
        )}
      </section>

      {T.length > 1 && (
        <section aria-labelledby="v-depois" className="mt-10">
          <h2 id="v-depois" className="text-lg font-semibold">Depois</h2>
          <ul className={cn("mt-3", LISTA)}>
            {T.slice(1).map((t) => (
              <li key={t.id} className="flex min-h-16 items-center gap-4 py-3 sm:px-2">
                {t.urgente ? <AlertCircle className="h-5 w-5 shrink-0 text-destructive" aria-hidden="true" /> : <span className="h-5 w-5 shrink-0" aria-hidden="true" />}
                <span className="min-w-0 flex-1"><span className="block text-base font-medium">{t.t}</span><span className="block text-[15px] text-muted-foreground">{t.sub}</span></span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="v-datas" className="mt-10">
        <h2 id="v-datas" className="text-lg font-semibold">Datas</h2>
        <dl className={cn("mt-3", LISTA)}>
          {f.datas.map((d) => (
            <div key={d.rotulo} className="flex min-h-14 flex-wrap items-baseline gap-x-4 py-3 sm:px-2">
              <dt className="w-32 shrink-0 text-[15px] text-muted-foreground">{d.rotulo}</dt>
              <dd className="flex min-w-0 flex-1 items-center gap-1.5 text-[15px]">
                {(d.urgente || d.aviso) && <AlertCircle className={cn("h-4 w-4 shrink-0", d.urgente ? "text-destructive" : "text-warning")} aria-hidden="true" />}
                {d.valor}{d.urgente ? <span className="sr-only"> (passou)</span> : d.aviso ? <span className="sr-only"> (está perto)</span> : null}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="v-semana" className="mt-10">
        <h2 id="v-semana" className="text-lg font-semibold">Esta semana</h2>
        {f.semana.length === 0
          ? <p className="mt-3 text-[15px] text-muted-foreground">Nada marcado. As tarefas das obras e as reservas com esta viatura aparecem aqui.</p>
          : <ul className={cn("mt-3", LISTA)}>{f.semana.map((s, i) => <li key={i} className="flex min-h-14 flex-wrap items-baseline gap-x-4 py-3 sm:px-2"><span className="w-28 shrink-0 text-[15px] tabular-nums text-muted-foreground">{s.quando}</span><span className="min-w-0 flex-1 text-[15px]">{s.oQue}</span></li>)}</ul>}
      </section>

      <section aria-labelledby="v-custos" className="mt-10">
        <h2 id="v-custos" className="text-lg font-semibold">Custos desde 1 de setembro</h2>
        <dl className="mt-3 grid grid-cols-2 overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)]">
          <div className="p-4 sm:p-5"><dt className="text-[15px] text-muted-foreground">Total</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{f.custos.total}</dd></div>
          <div className="border-l border-border p-4 sm:p-5"><dt className="text-[15px] text-muted-foreground">Por quilómetro</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{f.custos.porKm}</dd></div>
        </dl>
      </section>

      {f.historico.length > 0 && (
        <section aria-labelledby="v-hist" className="mt-10">
          <h2 id="v-hist" className="text-lg font-semibold">Histórico</h2>
          <ul className={cn("mt-3", LISTA)}>
            {f.historico.map((h, i) => <li key={i} className="flex min-h-14 flex-wrap items-baseline gap-x-3 py-3 sm:px-2"><span className="min-w-0 flex-1 text-[15px]">{h.t}</span><span className="shrink-0 text-[15px] tabular-nums text-muted-foreground">{h.q}</span></li>)}
          </ul>
        </section>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- os registos do dia a dia */

const DIAS = [{ rotulo: "Hoje", data: HOJE }, { rotulo: "Ontem", data: addDias(HOJE, -1) }];

function RegistoKm({ vid, feito }: { vid: string; feito: (m: string) => void }) {
  const F = useFrota();
  const [x, setX] = useState<Vals>({ vid, km: "", data: HOJE });
  const [e, setE] = useState<Erros>({});
  const muda = (k: string, v: string) => { setX((y) => ({ ...y, [k]: v })); setE((z) => ({ ...z, [k]: "" })); };
  const km = F.viaturas.find((v) => v.id === vid)!.km;
  return (
    <form noValidate className="grid gap-5" onSubmit={(ev) => { ev.preventDefault(); const m = gravar(x, validarKm, gravarKm, setE); if (m) feito(m); }}>
      <Campo id="km-km" rotulo="Quilómetros no painel" nota={`(a última leitura foi ${km.toLocaleString("pt-PT")} km)`} erro={e.km}>
        <input autoFocus inputMode="numeric" value={x.km} onChange={(ev) => muda("km", ev.target.value.replace(/\D/g, ""))} {...ligar("km-km", e.km)} className={cn(CAMPO, "text-right sm:w-48")} />
      </Campo>
      <EscolherData rotulo="Quando" valor={x.data} mudar={(d) => muda("data", d)} erro={e.data} opcoes={DIAS} />
      <div><Button type="submit" size="lg" className="w-full sm:w-auto">Guardar os quilómetros</Button></div>
    </form>
  );
}

function RegistoAbastecer({ vid, feito }: { vid: string; feito: (m: string) => void }) {
  const F = useFrota();
  const v = F.viaturas.find((z) => z.id === vid)!, el = v.comb === "Elétrico";
  const [x, setX] = useState<Vals>(() => iniAbastecer(F, vid));
  const [e, setE] = useState<Erros>({});
  const muda = (k: string, val: string) => { setX((y) => ({ ...y, [k]: val })); setE((z) => ({ ...z, [k]: "" })); };
  return (
    <form noValidate className="grid gap-5" onSubmit={(ev) => { ev.preventDefault(); const m = gravar(x, validarAbastecer, gravarAbastecer, setE); if (m) feito(m); }}>
      <div className="grid gap-5 sm:grid-cols-3">
        <Campo id="ab-qtd" rotulo={el ? "kWh" : "Litros"} erro={e.qtd}><input autoFocus inputMode="decimal" value={x.qtd} onChange={(ev) => muda("qtd", num(ev.target.value))} {...ligar("ab-qtd", e.qtd)} className={cn(CAMPO, "text-right")} /></Campo>
        <Campo id="ab-valor" rotulo="Valor (€)" erro={e.valor}><input inputMode="decimal" value={x.valor} onChange={(ev) => muda("valor", num(ev.target.value))} {...ligar("ab-valor", e.valor)} className={cn(CAMPO, "text-right")} /></Campo>
        <Campo id="ab-km" rotulo="Quilómetros" erro={e.km}><input inputMode="numeric" placeholder={String(v.km)} value={x.km} onChange={(ev) => muda("km", ev.target.value.replace(/\D/g, ""))} {...ligar("ab-km", e.km)} className={cn(CAMPO, "text-right")} /></Campo>
      </div>
      <p className="text-[15px] text-muted-foreground">Pago com: {x.fonte}.</p>
      <div><Button type="submit" size="lg" className="w-full sm:w-auto">Guardar o abastecimento</Button></div>
    </form>
  );
}

function RegistoOcorrencia({ vid, feito }: { vid: string; feito: (m: string) => void }) {
  const [x, setX] = useState<Vals>({ vid, tipo: "Avaria", quando: HOJE + "T09:00", local: "", desc: "", valor: "" });
  const [e, setE] = useState<Erros>({});
  const muda = (k: string, val: string) => { setX((y) => ({ ...y, [k]: val })); setE((z) => ({ ...z, [k]: "" })); };
  const nome = (x.tipo === "Sinistro" ? "o " : "a ") + x.tipo.toLowerCase();
  return (
    <form noValidate className="grid gap-5" onSubmit={(ev) => { ev.preventDefault(); const m = gravar(x, validarOcorrencia, gravarOcorrencia, setE); if (m) feito(m); }}>
      <Escolhas rotulo="O que foi" valor={x.tipo} mudar={(t) => muda("tipo", t)} opcoes={[{ v: "Avaria", t: "Avaria" }, { v: "Multa", t: "Multa" }, { v: "Sinistro", t: "Sinistro" }]} />
      <EscolherData rotulo="Quando" valor={x.quando.slice(0, 10)} mudar={(d) => muda("quando", d + "T09:00")} erro={e.quando} opcoes={DIAS} />
      <Campo id="oc-local" rotulo="Onde" erro={e.local}><input autoComplete="off" placeholder="Ex.: A2, km 12" value={x.local} onChange={(ev) => muda("local", ev.target.value)} {...ligar("oc-local", e.local)} className={CAMPO} /></Campo>
      <Campo id="oc-desc" rotulo="O que aconteceu" erro={e.desc}><input autoComplete="off" value={x.desc} onChange={(ev) => muda("desc", ev.target.value)} {...ligar("oc-desc", e.desc)} className={CAMPO} /></Campo>
      {x.tipo === "Multa" && <p className="text-[15px] text-muted-foreground">A multa fica por identificar: o prazo para dizer quem conduzia é de 15 dias úteis. Aparece em "O que fazer agora".</p>}
      <div><Button type="submit" size="lg" className="w-full sm:w-auto">Registar {nome}</Button></div>
    </form>
  );
}

export { nomeViatura };
