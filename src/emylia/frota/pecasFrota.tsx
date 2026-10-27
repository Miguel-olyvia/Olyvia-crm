// As peças da Frota com o DOM e as classes do protótipo HTML (plate, src, cab, kpi, chip, vazio, prog, btn com permissão). O CSS é o do
// Inventário (.inv-root) mais os extras de frota.css. As peças genéricas (Selo, Nota, Pesquisa, TabelaInv) vêm do Inventário, sem mudanças.
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { Inbox, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Selo } from "../inventario/pecasInv";
import { useCtxFrota } from "./ctxFrota";
import { pode, porqueNao, type AcaoFrota } from "./perfil";
import { ESTADOS } from "./regras";
import type { Tom, Viatura } from "./tipos";

/** A matrícula portuguesa (faixa azul com o P). */
export function Placa({ mat, grande }: { mat: string; grande?: boolean }) {
  return <span className={cn("plate", grande && "lg")} title={`Matrícula ${mat}`}><span className="eu" aria-hidden="true">P</span><span className="n">{mat}</span></span>;
}

/** A fonte de dados de um bloco: "nova · tabela" (a laranja) ou "existe · tabela" (violeta). Só se vê com "Mostrar fontes de dados". */
export function Src({ t, nova }: { t: string; nova?: boolean }) {
  return <span className={cn("src", nova && "nova")} title="Fonte de dados">{nova ? "nova · " : "existe · "}{t}</span>;
}

export const SeloEstado = ({ v }: { v: Viatura }) => <Selo tom={ESTADOS[v.estado][0]}>{ESTADOS[v.estado][1]}</Selo>;

/** O cabeçalho de cada ecrã (função cab()): "Frota › Título", o título (recebe o foco ao mudar de ecrã), o texto, a fonte e as ações. */
export function Cab({ titulo, texto, acoes, fonte }: { titulo: string; texto: ReactNode; acoes?: ReactNode; fonte?: ReactNode }) {
  return (
    <div className="ph">
      <div style={{ minWidth: 0, maxWidth: 760 }}>
        <div className="crumbs">Frota › {titulo}</div>
        <h1 tabIndex={-1} id="frota-h1" style={{ outline: "none" }}>{titulo}</h1>
        <p className="muted" style={{ marginTop: 4 }}>{texto}</p>
        {fonte}
      </div>
      <div className="ph-actions">{acoes}</div>
    </div>
  );
}

/** Um cartão de métrica (função kpi()); com `aoClicar` é um botão que filtra. */
export function KpiF({ rotulo, valor, nota, tom, fonte, aoClicar }: { rotulo: string; valor: ReactNode; nota?: ReactNode; tom?: "ok" | "warn" | "bad"; fonte?: ReactNode; aoClicar?: () => void }) {
  const corpo = <><span className="kl">{rotulo}</span><span className="kv">{valor}</span><span className="kh">{nota}</span>{fonte}</>;
  const cls = cn("kpi", tom && `k-${tom}`);
  return aoClicar ? <button type="button" className={cls} onClick={aoClicar}>{corpo}</button> : <div className={cls}>{corpo}</div>;
}

/** Um chip de filtro (`aria-pressed`) ligado a um filtro do ecrã. */
export function ChipF({ k, v, children, n, padrao = "todas" }: { k: string; v: string; children: ReactNode; n?: number; padrao?: string }) {
  const { f, setF } = useCtxFrota();
  return (
    <button type="button" className="chip" aria-pressed={(f[k] || padrao) === v} onClick={() => setF(k, v)}>
      {children}{n != null ? <span className="cnt">{n}</span> : null}
    </button>
  );
}

/** Nada para mostrar (função vazio()). */
export function VazioF({ titulo, texto }: { titulo: string; texto: string }) {
  return <div className="empty"><Inbox className="ic lg" aria-hidden="true" /><b>{titulo}</b><span>{texto}</span></div>;
}

/** A barra de progresso da revisão. */
export const Prog = ({ tom, pct, largo }: { tom: Tom; pct: number; largo?: boolean }) => (
  <div className={cn("prog", tom !== "ok" && tom)} style={largo ? { width: "100%", margin: "8px 0" } : undefined} aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
);

interface BtnProps { children: ReactNode; aoClicar: () => void; acao?: AcaoFrota; icone?: LucideIcon; primario?: boolean; pequeno?: boolean; rotulo?: string; className?: string }
/** Um botão (função btn()): sem permissão no perfil simulado fica desativado e diz porquê. */
export function Btn({ children, aoClicar, acao, icone: I, primario, pequeno, rotulo, className }: BtnProps) {
  const { perfil } = useCtxFrota();
  const ok = !acao || pode(perfil, acao);
  return (
    <button type="button" className={cn("btn", primario && "btn-p", pequeno && "btn-sm", className)} disabled={!ok} title={ok ? undefined : porqueNao(perfil)} aria-label={rotulo}
      onClick={(e) => { e.stopPropagation(); aoClicar(); }}>
      {I ? <I className="ic" aria-hidden="true" /> : null}{children}
    </button>
  );
}

/** A viatura numa célula: matrícula e marca/modelo. */
export const VRef = ({ v }: { v: Viatura }) => <div className="stk"><Placa mat={v.mat} /><small className="muted">{v.marca} {v.modelo}</small></div>;

/** As ações de um ecrã desenhadas no cabeçalho de outro sítio (por exemplo no topo do protótipo). */
export const Portal = ({ alvo, children }: { alvo: HTMLElement | null; children: ReactNode }) => (alvo ? createPortal(children, alvo) : null);

/** A ligação para uma obra do protótipo ("Obra #1022"): abre a obra quando o protótipo deixa; senão é só texto. */
export function LigObra({ id, children }: { id: number; children?: ReactNode }) {
  const { irObra, obras } = useCtxFrota();
  const o = obras.find((x) => x.id === id);
  const txt = children ?? `Obra #${id}`;
  return irObra && o
    ? <button type="button" className="link" onClick={(e) => { e.stopPropagation(); irObra(id); }} title={`Abrir a obra de ${o.nome} em Operações`}>{txt}</button>
    : <span>{txt}</span>;
}
