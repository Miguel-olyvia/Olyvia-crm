// Armazém › Saídas para clientes (scrEC do mockup): o que existe em stock é reservado (FIFO) e sai do armazém de expedição; o que falta vai para a encomenda ao fornecedor preferencial.
// O cabeçalho leva Exportar e "Nova encomenda manual"; depois vêm os KPI, os filtros (um cartão com pesquisa, armazém, datas, chips e legenda) e a tabela.
import { useState } from "react";
import { Plus } from "lucide-react";
import { fmtD } from "./base";
import { AcoesCab, Fonte } from "./cabInv";
import { contadores } from "./contadores";
import { useCtxInv } from "./ctxInv";
import { EC_ESTADOS, ecEstado, ecProntas, type EstadoEc } from "./ec";
import { defEcs } from "./ecAcoes";
import { OrigemChip, Progresso } from "./ecPecas";
import { useAbrirEc } from "./ecAbrir";
import { AcoesLinhaEc } from "./EcMenu";
import { EcFormDialogo } from "./EcFormDialogo";
import { filtrarEcs } from "./filtros";
import { BotaoExportar } from "./ImportarInv";
import { Kpi } from "./kpiInv";
import { Check, Chip } from "./mockPecas";
import { opcoesArmazens } from "./opcoes";
import { can, porqueNao } from "./perfil";
import { Pesquisa, Selo, Vazio } from "./pecasInv";
import { TabelaInv, type Coluna } from "./TabelaInv";
import type { Ec, Tom } from "./tipos";

const TOM: Record<EstadoEc, Tom> = { full: "ok", partial: "warn", waiting: "info", nosup: "bad", deleted: "neu" };
const ESTADOS: readonly (readonly [EstadoEc, string])[] = [["full", "Totalmente servido"], ["partial", "Parcialmente pendente"], ["waiting", "A aguardar encomenda"], ["nosup", "Sem fornecedor"]];

export function EcInv() {
  const { db, filtros, setFiltros } = useCtxInv();
  const abrirEc = useAbrirEc();
  const f = filtros.ec, c = contadores(db);
  const lista = filtrarEcs(db, f);
  const [nova, setNova] = useState(false);
  const pode = can("inventory.manage");
  const cols: Coluna<Ec>[] = [
    { id: "id", titulo: "Nº EC · origem", celula: (e) => <><b className="mono">{e.id}</b><br /><OrigemChip e={e} /></> },
    { id: "cl", titulo: "Cliente", celula: (e) => e.client },
    { id: "ad", titulo: "Morada", celula: (e) => <small>{e.addr}</small> },
    { id: "d", titulo: "Data", classe: () => "nowrap", celula: (e) => <>{fmtD(e.date)}<br /><small className="muted">{db.warehouses.find((w) => w.id === e.wh)?.code}</small></> },
    { id: "ln", titulo: "Linhas", direita: true, celula: (e) => e.lines.length },
    { id: "pr", titulo: "Progresso", largura: "170px", celula: (e) => <Progresso db={db} e={e} /> },
    { id: "st", titulo: "Estado", celula: (e) => { const st = ecEstado(db, e), n = ecProntas(db, e); return <><Selo tom={TOM[st]}>{EC_ESTADOS[st]}</Selo>{n > 0 && <><br /><Selo tom="violet">{n} pronta(s) a sair</Selo></>}</>; } },
  ];
  const estado = (k: "" | EstadoEc, nome: string, n?: number): React.ReactNode => <Chip key={k + nome} ativo={f.status === k && !f.prontas} n={n} aoClicar={() => setFiltros("ec", { status: k, prontas: false })}>{nome}</Chip>;
  return (
    <>
      <AcoesCab>
        <BotaoExportar def={defEcs(db, () => lista)} novo />
        <button type="button" className="btn btn-p" disabled={!pode} title={pode ? undefined : porqueNao("inventory.manage")} onClick={() => setNova(true)}><Plus className="ic" aria-hidden="true" />Nova encomenda manual</button>
      </AcoesCab>
      <div className="kpis">
        <Kpi tom="ok" rotulo="Prontas a expedir" valor={String(c.ecReady)} nota="com linhas prontas a sair" fonte="fn_client_order_line_reservations" aoClicar={() => setFiltros("ec", { prontas: true, status: "" })} />
        <Kpi tom="warn" rotulo="Parcialmente pendentes" valor={String(c.ecPartial)} fonte="client_orders" aoClicar={() => setFiltros("ec", { status: "partial", prontas: false })} />
        <Kpi tom="info" rotulo="A aguardar PO" valor={String(c.ecWaiting)} nota="à espera do fornecedor" fonte="purchase_order_items ↔ client_order_items" aoClicar={() => setFiltros("ec", { status: "waiting", prontas: false })} />
        <Kpi tom="bad" rotulo="Sem fornecedor" valor={String(c.ecNoSup)} nota="sem preferido para encomendar" fonte="item_suppliers.is_preferred" aoClicar={() => setFiltros("ec", { status: "nosup", prontas: false })} />
      </div>
      <div className="card filters">
        <div className="frow">
          <Pesquisa valor={f.q} aoMudar={(q) => setFiltros("ec", { q })} rotulo="Pesquisar encomendas clientes" dica="Nº EC, contrato, VD, cliente ou produto" />
          <select aria-label="Armazém de expedição" value={f.wh} onChange={(e) => setFiltros("ec", { wh: e.target.value })}>
            <option value="">Todos os armazéns de expedição</option>
            {opcoesArmazens(db).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
          <label className="inl">De <input type="date" value={f.de} onChange={(e) => setFiltros("ec", { de: e.target.value })} /></label>
          <label className="inl">Até <input type="date" value={f.ate} onChange={(e) => setFiltros("ec", { ate: e.target.value })} /></label>
          <Check rotulo="Ver eliminadas" ativo={f.eliminadas} aoMudar={(v) => setFiltros("ec", { eliminadas: v })} />
        </div>
        <div className="chips" role="group" aria-label="Estado">
          {estado("", "Todas", db.ecs.filter((e) => !e.deleted).length)}
          <Chip ativo={f.prontas} n={c.ecReady} aoClicar={() => setFiltros("ec", { prontas: !f.prontas, status: "" })}>Prontas a expedir</Chip>
          {ESTADOS.map(([k, t]) => estado(k, t))}
        </div>
        <div className="legend"><span><i className="s-served" />Servido</span><span><i className="s-stock" />Em stock (reservado, pronto)</span><span><i className="s-po" />A aguardar PO</span><span><i className="s-miss" />Em falta / sem fornecedor</span></div>
      </div>
      {lista.length ? <TabelaInv titulo="Saídas para clientes" minimo={1000} colunas={cols} linhas={lista} chave={(e) => e.id} abrir={(e) => abrirEc(e.id)} classeLinha={(e) => (e.deleted ? "deleted" : "")} rotuloAbrir={(e) => `Abrir ${e.id}, ${e.client}`} acoes={(e) => <AcoesLinhaEc id={e.id} />} />
        : <Vazio titulo="Sem encomendas com estes filtros" />}
      <div className="tbl-foot"><span>{lista.length} encomenda(s)</span><Fonte>client_orders · client_order_items · rpc_list_client_order_documents</Fonte></div>
      {nova && <EcFormDialogo aberto aoFechar={() => setNova(false)} />}
    </>
  );
}
