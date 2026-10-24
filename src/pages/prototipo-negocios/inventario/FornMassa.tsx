// As ações em massa dos fornecedores selecionados (supBulk e supBulkGo do mockup): a barra `.bulk` e o diálogo que pede o novo estado, a nova empresa ou confirma a eliminação.
import { AlertTriangle, Info } from "lucide-react";
import { fornecedor } from "./base";
import { useCtxInv } from "./ctxInv";
import { Dlg } from "./DialogosInv";
import { Fonte } from "./cabInv";
import { Lista, Peq, Pri, Sec } from "./pecasInv";
import { PM, perm } from "./permForn";
import { emMassa, type AcaoMassa } from "./regrasForn";
import { useState } from "react";

const TITULO: Record<AcaoMassa, string> = { state: "Mudar estado", company: "Mudar empresa", delete: "Eliminar fornecedores" };

/** A barra fixa em baixo com o que se pode fazer aos selecionados. */
export function BarraMassa({ n, aoEscolher, aoLimpar }: { n: number; aoEscolher: (k: AcaoMassa) => void; aoLimpar: () => void }) {
  return (
    <div className="bulk" role="region" aria-label="Ações em massa">
      <b>{n} selecionado(s)</b>
      <Peq {...perm(PM)} onClick={() => aoEscolher("state")}>Mudar estado</Peq>
      <Peq {...perm(PM)} onClick={() => aoEscolher("company")}>Mudar empresa</Peq>
      <Peq {...perm(PM)} onClick={() => aoEscolher("delete")}>Eliminar</Peq>
      <Peq onClick={aoLimpar}>Limpar seleção</Peq>
      <Fonte>rpc_bulk_delete_supplier · rpc_bulk_status_supplier</Fonte>
    </div>
  );
}

/** O diálogo de uma ação em massa; as regras decidem quais dos selecionados são mexidos e quais ficam de fora. */
export function MassaDlg({ ids, kind, aoFechar, aoFeito }: { ids: readonly string[]; kind: AcaoMassa; aoFechar: () => void; aoFeito: () => void }) {
  const { db, agir } = useCtxInv();
  const empresas = [...new Set(db.suppliers.map((s) => s.company))];
  const [v, setV] = useState(kind === "state" ? "active" : kind === "company" ? db.suppliers[0].company : "");
  const aplicar = (): void => {
    const r = agir((d) => emMassa(d, ids, kind, v), (x) => `${x.n} atualizado(s)${x.skip ? `, ${x.skip} ignorado(s) pelas regras` : ""}.`);
    if (r.ok) aoFeito();
    aoFechar();
  };
  return (
    <Dlg aberto aoFechar={aoFechar} titulo={TITULO[kind]} rodape={<><Sec onClick={aoFechar}>Cancelar</Sec><Pri variant={kind === "delete" ? "destructive" : "default"} onClick={aplicar}>Aplicar</Pri></>}>
      <p>{ids.length} fornecedor(es): {ids.map((i) => fornecedor(db, i)?.name ?? i).join(", ")}</p>
      {kind === "state" && <Lista rotulo="Novo estado" valor={v} aoMudar={setV} opcoes={[["active", "Ativo"], ["inactive", "Inativo"]]} />}
      {kind === "company" && <><Lista rotulo="Empresa" valor={v} aoMudar={setV} opcoes={empresas.map((c) => [c, c] as const)} /><div className="alert info"><Info className="ic" aria-hidden="true" />Fornecedores com portal ativo mantêm a empresa (bloqueada; revogue o acesso para mudar).</div></>}
      {kind === "delete" && <div className="alert warn"><AlertTriangle className="ic" aria-hidden="true" />Ficam ocultos; pode restaurá-los com “Ver eliminados”. Fornecedores com encomendas em aberto não são eliminados.</div>}
    </Dlg>
  );
}
