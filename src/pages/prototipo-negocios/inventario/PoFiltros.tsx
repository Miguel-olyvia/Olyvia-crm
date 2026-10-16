// O cartão de filtros das encomendas (`card filters` do mockup): pesquisa, fornecedor, campo e intervalo de datas, "Ver eliminados", "Agrupar por fornecedor", os chips de estado com contagens e a nota das regras.
import { Info } from "lucide-react";
import { useCtxInv } from "./ctxInv";
import type { EstadoPoFiltro, FiltrosPo } from "./filtros";
import { Chip, Check, Sw } from "./mockPecas";
import { Pesquisa } from "./pecasInv";

const ESTADOS: readonly (readonly [EstadoPoFiltro, string])[] = [["all", "Todas"], ["pending", "Pendente"], ["ordered", "Encomendado"], ["partial", "Parcialmente recebida"], ["received", "Recebida"], ["cancelled", "Cancelada"], ["late", "Atrasadas"], ["portal", "No portal"], ["receber", "Por receber"]];

export function PoFiltros({ n }: { n: (k: EstadoPoFiltro) => number }) {
  const { db, filtros, setFiltros } = useCtxInv();
  const f = filtros.po;
  const set = (p: Partial<FiltrosPo>): void => setFiltros("po", p);
  return (
    <div className="card filters">
      <div className="frow">
        <Pesquisa valor={f.q} aoMudar={(q) => set({ q })} rotulo="Pesquisar encomendas" dica="Nº PO, produto, SKU/EAN ou cliente" />
        <select aria-label="Fornecedor" value={f.sup} onChange={(e) => set({ sup: e.target.value })}>
          <option value="">Todos os fornecedores</option>
          {db.suppliers.filter((s) => !s.deleted).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select aria-label="Campo de data" value={f.campoData} onChange={(e) => set({ campoData: e.target.value === "real" ? "real" : "date" })}>
          <option value="date">Data da encomenda</option><option value="real">Data de entrega real</option>
        </select>
        <label className="inl">De <input type="date" value={f.de} onChange={(e) => set({ de: e.target.value })} /></label>
        <label className="inl">Até <input type="date" value={f.ate} onChange={(e) => set({ ate: e.target.value })} /></label>
        <Check rotulo="Ver eliminados" ativo={f.eliminadas} aoMudar={(v) => set({ eliminadas: v })} />
        <Sw rotulo="Agrupar por fornecedor" ativo={f.group} aoMudar={(v) => set({ group: v })} />
      </div>
      <div className="chips" role="group" aria-label="Estado">
        {ESTADOS.map(([k, nome]) => <Chip key={k} ativo={f.status === k} aoClicar={() => set({ status: k })} n={n(k)}>{nome}</Chip>)}
      </div>
      <div className="rules"><Info className="ic sm" aria-hidden="true" /><span>“Recebida” nunca se escolhe à mão e “Parcialmente recebida” é calculado pelas receções. Passar a Encomendado exige <span className="mono">purchase_orders.approve</span>.</span></div>
    </div>
  );
}
