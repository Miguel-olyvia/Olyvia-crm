// O cabeçalho da folha de uma PO: os campos editáveis na própria célula com os bloqueios do mockup (poHdr e poEditLock), a linha temporal e o aviso de bloqueio.
import type { ReactNode } from "react";
import { Check, X } from "lucide-react";
import { fmtD, nomeArm, nomeForn } from "./base";
import { useCtxInv } from "./ctxInv";
import { Ed } from "./mockPecas";
import { opcoesArmazens, opcoesFornecedores } from "./opcoes";
import { Selo, Ligacao } from "./pecasInv";
import { editarCabecalhoPo, motivoBloqueioPo, percursoPo, poLate, poLocked, poOpen, poStatus, aceitarDataPrometida, type CampoCabPo, poRecebivel } from "./po";
import { Desbloquear, SeloEstadoPo } from "./poPecas";
import type { AcoesPo } from "./poTipos";
import { acessoDaPoEnviada } from "./poAcesso";
import type { Inventario, Po } from "./tipos";

const PM = "purchase_orders.manage";
export const poDe = (d: Inventario, id: string): Po => d.pos.find((x) => x.id === id) as Po;

/** O botão que levanta o bloqueio de edição (a segunda parte de poEditLock). */
export function desbloqueioPo(p: Po, a: AcoesPo): ReactNode {
  if (p.deleted) return <Desbloquear rotulo="Restaurar" aoClicar={a.restaurar} />;
  if (poLocked(p)) return <Desbloquear rotulo="Retirar do portal para editar" aoClicar={() => a.pedir({ t: "retirar" })} />;
  if (poStatus(p) === "received") return <Desbloquear rotulo="Reverter receção" aoClicar={() => a.irTab("rec")} />;
  return <Desbloquear rotulo="Duplicar como nova encomenda" aoClicar={a.duplicar} />;
}

type Bloq = { bloqueio?: string; desbloquear?: ReactNode };

function bloqueioSup(p: Po, pub: Bloq, a: AcoesPo, abrirSup: () => void): Bloq {
  if (pub.bloqueio) return pub;
  if (p.status !== "pending") return { bloqueio: "O fornecedor só muda em rascunho", desbloquear: <Desbloquear rotulo="Duplicar para outro fornecedor" aoClicar={a.duplicar} /> };
  if (p.lines.some((l) => l.ecLine)) return { bloqueio: "Linhas ligadas a Encomendas Clientes: vai sempre ao fornecedor preferencial", desbloquear: <Desbloquear rotulo="Mudar o preferido" aoClicar={abrirSup} /> };
  return {};
}

function EstadoEd({ p, pub, a, gravar }: { p: Po; pub: Bloq; a: AcoesPo; gravar: (v: string | boolean) => unknown }) {
  const st = poStatus(p);
  const selo = <SeloEstadoPo p={p} />;
  if (pub.bloqueio) return <Ed valor={p.status} aoGravar={gravar} mostrar={selo} {...pub} />;
  if (st === "partial" || st === "received") return <Ed valor={p.status} aoGravar={gravar} mostrar={selo} bloqueio="Calculado pelas receções" desbloquear={<Desbloquear rotulo="Ver receções" aoClicar={() => a.irTab("rec")} />} />;
  if (st === "cancelled") return <Ed valor={p.status} aoGravar={gravar} mostrar={selo} bloqueio="Encomenda cancelada" desbloquear={<Desbloquear rotulo="Duplicar como nova" aoClicar={a.duplicar} />} />;
  const opcoes = p.status === "pending" ? [["pending", "Pendente"], ["ordered", "Encomendado (aprovar e enviar)"], ["cancelled", "Cancelada"]] as const : [["ordered", "Encomendado"], ["cancelled", "Cancelada"]] as const;
  return <Ed valor={p.status} aoGravar={gravar} tipo="select" opcoes={opcoes} mostrar={selo} perm={PM} />;
}

/** Um campo do cabeçalho da PO (poHdr do mockup). */
export function PoHdr({ p, k, a }: { p: Po; k: "wh" | "date" | "due" | "sup" | "status"; a: AcoesPo }) {
  const { db, agir, abrir, avisar } = useCtxInv();
  const gravar = (v: string | boolean): unknown => {
    const r = agir((d) => editarCabecalhoPo(d, poDe(d, p.id), k as CampoCabPo, String(v)), "Gravado.");
    // 22/10: Pendente → Encomendado aprova e envia: o popup com o acesso do fornecedor ao portal (poAcesso.ts)
    if (r.ok && k === "status" && v === "ordered" && p.status === "pending") acessoDaPoEnviada(p.id, avisar);
    return r;
  };
  const pub: Bloq = p.deleted ? { bloqueio: "Encomenda eliminada", desbloquear: <Desbloquear rotulo="Restaurar" aoClicar={a.restaurar} /> }
    : poLocked(p) ? { bloqueio: "Publicada no portal", desbloquear: <Desbloquear rotulo="Retirar do portal" aoClicar={() => a.pedir({ t: "retirar" })} /> } : {};
  if (k === "wh") return <Ed valor={p.wh} aoGravar={gravar} tipo="select" opcoes={opcoesArmazens(db, true)} mostrar={nomeArm(db, p.wh)} perm={PM} {...pub} />;
  if (k === "date") return <Ed valor={p.date} aoGravar={gravar} tipo="date" mostrar={fmtD(p.date)} perm={PM} {...pub} />;
  if (k === "due") return <Ed valor={p.due} aoGravar={gravar} tipo="date" mostrar={<span className={poLate(p) ? "late" : ""}>{fmtD(p.due)}</span>} perm={PM} {...pub} />;
  if (k === "sup") return <Ed valor={p.sup} aoGravar={gravar} tipo="select" opcoes={opcoesFornecedores(db)} mostrar={nomeForn(db, p.sup)} perm={PM} {...bloqueioSup(p, pub, a, () => abrir({ t: "sup", id: p.sup, tab: "artigos" }))} />;
  return <EstadoEd p={p} pub={pub} a={a} gravar={gravar} />;
}

/** O bloqueio de edição da PO (texto e botão), ou nada se se pode editar. */
export const bloqueioPo = (p: Po, a: AcoesPo): { msg: string; unlock: ReactNode } | null => { const msg = motivoBloqueioPo(p); return msg ? { msg, unlock: desbloqueioPo(p, a) } : null; };

/** 16/10: o passo da receção no armazém, a seguir à linha temporal; com ligação quando é o passo atual (há o que receber). */
export function ProximoRececao({ p, aoIr }: { p: Po; aoIr: () => void }) {
  const st = poStatus(p);
  if (p.deleted || st === "cancelled") return null;
  const atual = poRecebivel(p);
  return (
    <p className="muted" style={{ margin: "-4px 0 12px" }}>
      {st === "received" ? "Receção no armazém: feita." : <>Próximo passo: {atual ? <Ligacao aoClicar={aoIr}>Receção no armazém (Armazém › Receção) →</Ligacao> : "Receção no armazém"}{st === "pending" ? " · pode receber-se mesmo pendente" : ""}</>}
    </p>
  );
}

/** A linha temporal da PO (poTimeline do mockup). */
export function Timeline({ p }: { p: Po }) {
  const { agir } = useCtxInv();
  if (poStatus(p) === "cancelled") return <div className="alert neu" style={{ margin: "6px 0 12px" }}><X className="ic" aria-hidden="true" />Encomenda cancelada.</div>;
  return (
    <ol className="tl" aria-label="Linha temporal">
      {percursoPo(p).map((s, i) => (
        <li key={s.nome} className={s.estado === "feito" ? "done" : s.estado === "atual" ? "cur" : ""}>
          <span className="dot">{s.estado === "feito" ? <Check className="ic sm" aria-hidden="true" /> : i + 1}</span><span className="tt">{s.nome}</span><small>{s.detalhe || " "}</small>
          {i === 3 && p.portal.state === "confirmed" && !p.promiseAccepted && poOpen(p) && <button type="button" className="btn btn-xs" onClick={() => agir((d) => aceitarDataPrometida(d, poDe(d, p.id)), "Data prometida aceite.")}>Aceitar data prometida</button>}
          {i === 3 && p.promiseAccepted && <small><Selo tom="ok">Data aceite</Selo></small>}
        </li>
      ))}
    </ol>
  );
}
