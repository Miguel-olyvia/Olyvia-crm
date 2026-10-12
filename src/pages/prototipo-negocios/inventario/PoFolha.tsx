// A folha lateral de uma PO: cabeçalho com o percurso, sete abas e o rodapé com a ação principal do estado (aprovar e enviar, ou receber). Os diálogos pedem motivo quando a regra o exige.
import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { AbasFolha, Confirmar, Folha } from "./DialogosInv";
import { eur, fmtD, nomeArm, nomeForn, poPorId } from "./base";
import { useCtxInv } from "./ctxInv";
import { SeloEstadoPo } from "./EncomendasInv";
import { Dados, Ligacao, Pri, Sec, Selo } from "./pecasInv";
import { enviarPo, eliminarPo, percursoPo, poLate, poOpen, poStatus, poTotals, retirarDoPortal, restaurarPo, textoPortal } from "./po";
import { PoTabs } from "./PoTabsSwitch";
import { reverterRececao } from "./receber";
import { ReceberDialogo } from "./ReceberDialogo";
import type { DlgPo } from "./PoTabs";

type TabPo = "lines" | "rec" | "guias" | "portal" | "ann" | "notes" | "hist";

export function PoFolha({ id, tabInicial, aoFechar }: { id: string; tabInicial?: string; aoFechar: () => void }) {
  const { db, agir, abrir } = useCtxInv();
  const p = poPorId(db, id);
  const [tab, setTab] = useState<TabPo>((tabInicial as TabPo) || "lines");
  const [dlg, setDlg] = useState<DlgPo | null>(null);
  if (!p) return null;
  const st = poStatus(p);
  const porId = (d: typeof db) => d.pos.find((x) => x.id === id)!;
  const sup = db.suppliers.find((s) => s.id === p.sup);
  const rodape = p.deleted ? <><Sec onClick={aoFechar}>Fechar</Sec><Pri onClick={() => agir((d) => restaurarPo(d, porId(d)), `${id} restaurada.`)}>Restaurar</Pri></>
    : st === "pending" ? <><Sec className="mr-auto" onClick={() => setDlg({ t: "eliminar" })}>Eliminar</Sec><Pri onClick={() => setDlg({ t: "enviar" })}>Aprovar e enviar</Pri></>
    : poOpen(p) ? <><Sec className="mr-auto" onClick={() => setDlg({ t: "resto" })}>Não vou receber o resto</Sec><Pri onClick={() => setDlg({ t: "receber" })}>Receber</Pri></>
    : <Sec onClick={aoFechar}>Fechar</Sec>;
  return (
    <Folha aberta aoFechar={aoFechar} chave={id} titulo={p.id} subtitulo="Compras › Encomenda a fornecedor" rodape={rodape}
      selos={<><SeloEstadoPo p={p} />{textoPortal(p) && <Selo>{textoPortal(p)}</Selo>}{poLate(p) && <Selo tom="bad">Atrasada</Selo>}{p.deleted && <Selo>Eliminada</Selo>}</>}
      abas={<AbasFolha<TabPo> rotulo="Partes da encomenda" atual={tab} escolher={setTab} abas={[["lines", "Linhas", p.lines.length], ["rec", "Receções", p.receipts.length], ["guias", "Guias", db.guias.filter((g) => g.pos.includes(id)).length], ["portal", "Portal"], ["ann", "Anulações", p.cancels.filter((c) => !c.undone).length], ["notes", "Notas"], ["hist", "Histórico"]]} />}>
      <Dados itens={[
        ["Fornecedor", <Ligacao key="f" aoClicar={() => abrir({ t: "sup", id: p.sup })}>{nomeForn(db, p.sup)}</Ligacao>],
        ["Portal do fornecedor", sup?.portal === "active" ? "Ativo" : "Sem portal ativo"],
        ["Origem", p.origin.k === "stock" ? "Reposição de stock" : <span key="o">Gerada de {p.origin.ref ?? p.origin.ec}{p.origin.ec && <> · <Ligacao aoClicar={() => abrir({ t: "ec", id: p.origin.ec as string })}>Ver Encomenda Cliente {p.origin.ec}</Ligacao></>}</span>],
        ["Entregar em", nomeArm(db, p.wh)], ["Data · entrega prevista", `${fmtD(p.date)} · ${fmtD(p.due)}`], ["Valor", eur(poTotals(p).total)],
      ]} />
      <ol aria-label="Percurso da encomenda" className="flex flex-wrap gap-x-4 gap-y-2 text-[15px]">
        {st === "cancelled" ? <li>Encomenda cancelada.</li> : percursoPo(p).map((s) => (
          <li key={s.nome} aria-current={s.estado === "atual" ? "step" : undefined} className={cn("flex items-center gap-1.5", s.estado === "depois" && "text-muted-foreground")}>
            {s.estado === "feito" ? <Check className="h-4 w-4 text-emerald-700" aria-hidden="true" /> : <span className="h-4 w-4 rounded-full border border-current" aria-hidden="true" />}
            <span className={s.estado === "atual" ? "font-semibold" : ""}>{s.nome}</span>{s.detalhe && <span className="text-muted-foreground">· {s.detalhe}</span>}
          </li>
        ))}
      </ol>
      <PoTabs tab={tab} p={p} pedir={setDlg} />
      {dlg?.t === "receber" && <ReceberDialogo aberto aoFechar={() => setDlg(null)} id={id} />}
      {dlg?.t === "resto" && <ReceberDialogo aberto aoFechar={() => setDlg(null)} id={id} soResto />}
      {dlg?.t === "enviar" && <Confirmar aberto aoFechar={() => setDlg(null)} titulo={`Aprovar e enviar ${id}`} ok="Aprovar e enviar" texto={<p>{nomeForn(db, p.sup)} · {p.lines.length} linha(s) · {eur(poTotals(p).total)}. Passa de Pendente a Encomendado.</p>}
        aoConfirmar={() => agir((d) => enviarPo(d, porId(d)), `${id} aprovada e enviada ao fornecedor.`)} />}
      {dlg?.t === "eliminar" && <Confirmar aberto aoFechar={() => setDlg(null)} titulo={`Eliminar ${id}`} ok="Eliminar" perigo motivo="Motivo" texto={<p>A encomenda deixa de aparecer nas listas (pode restaurá-la com «Ver eliminadas»).{p.lines.some((l) => l.ecLine) ? " Linhas ligadas a Encomendas Clientes passam a «Em falta» nessas encomendas." : ""}</p>}
        aoConfirmar={(m) => { const r = agir((d) => eliminarPo(d, porId(d), m), `${id} eliminada.`); if (r.ok) aoFechar(); return r; }} />}
      {dlg?.t === "retirar" && <Confirmar aberto aoFechar={() => setDlg(null)} titulo={`Retirar ${id} do portal`} ok="Retirar do portal" motivo="Motivo" texto={<p>O fornecedor deixa de ver a encomenda. Linhas, fornecedor, data e estado ficam editáveis.</p>}
        aoConfirmar={(m) => agir((d) => retirarDoPortal(d, porId(d), m), `${id} retirada do portal.`)} />}
      {dlg?.t === "reverter" && <Confirmar aberto aoFechar={() => setDlg(null)} titulo="Reverter receção" ok="Reverter receção" perigo motivo="Motivo" texto={<p>As unidades saem do stock e fica um movimento no livro. Falha se já saíram para o cliente.</p>}
        aoConfirmar={(m) => agir((d) => reverterRececao(d, porId(d), dlg.rid, m), "Receção revertida.")} />}
    </Folha>
  );
}
