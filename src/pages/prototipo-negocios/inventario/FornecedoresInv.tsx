// Compras › Fornecedores, como no mockup (scrSup): ações no cabeçalho (Exportar, Importar, Novo fornecedor), o alerta dos que esperam o portal, os filtros, a tabela com seleção
// e edição na própria célula, a barra de ações em massa e o menu "Mais ações". Criar um fornecedor é convidá-lo para o portal; a ficha abre numa folha lateral.
import { useState } from "react";
import { Clock, Eye, Pencil, Play, Plus, ShoppingCart, Trash2, Undo2, Upload, Users } from "lucide-react";
import { AcoesCab, Fonte } from "./cabInv";
import { useCtxInv } from "./ctxInv";
import { Confirmar } from "./DialogosInv";
import { filtrarForn } from "./filtros";
import { AcoesLinha } from "./FornColunas";
import { useColunasForn } from "./useColunasForn";
import { BarraMassa, MassaDlg } from "./FornMassa";
import { FolhaForn } from "./FornecedorFolha";
import { defFornecedores } from "./impForn";
import { BotaoExportar, ImportarDlg } from "./ImportarInv";
import { Check, type ItemMenu } from "./mockPecas";
import { NovoFornecedorDialogo, type PreFicha } from "./NovoFornecedorDialogo";
import { Ligacao, Nota, Pesquisa, Pri, Sec, Vazio } from "./pecasInv";
import { can, porqueNao } from "./perfil";
import { PM, perm } from "./permForn";
import { PortalSimDialogo } from "./PortalSimDialogo";
import { eliminarFornecedor, restaurarFornecedor } from "./cadastros";
import { podeSimular, type AcaoMassa } from "./regrasForn";
import { TabelaInv } from "./TabelaInv";
import type { Fornecedor } from "./tipos";

const FONTE_LISTA = "suppliers · rpc_get_supplier_sla_report · supplier_portal_user_access · supplier_price_change_requests";

function Aguardam({ lista, abrir, filtrar }: { lista: Fornecedor[]; abrir: (id: string) => void; filtrar: () => void }) {
  return (
    <div className="alert info" style={{ marginBottom: 12 }}><Clock className="ic" aria-hidden="true" />
      <div><b>{lista.length} fornecedor(es) à espera de preencher a ficha no portal:</b> {lista.map((s, i) => <span key={s.id}>{i ? ", " : ""}<Ligacao aoClicar={() => abrir(s.id)}>{s.name}</Ligacao></span>)}. <Ligacao aoClicar={filtrar}>Filtrar</Ligacao></div>
    </div>
  );
}

export function FornecedoresInv() {
  const { db, filtros, setFiltros, abrir, ir, agir, avisar, fecharDetalhe } = useCtxInv();
  const f = filtros.forn;
  const lista = filtrarForn(db, f);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [dlg, setDlg] = useState<"novo" | "importar" | null>(null);
  const [massa, setMassa] = useState<AcaoMassa | null>(null);
  const [sim, setSim] = useState<string | null>(null);
  const [apagar, setApagar] = useState<Fornecedor | null>(null);
  const [rascunho, setRascunho] = useState<PreFicha | null>(null);
  const marcados = Object.keys(sel).filter((k) => sel[k] && lista.some((s) => s.id === k));
  const empresas = [...new Set(db.suppliers.map((s) => s.company))];
  const aguardam = db.suppliers.filter((s) => !s.deleted && s.portal === "invited" && s.awaiting);
  const simular = (id: string): void => { if (podeSimular(db, id, avisar)) setSim(id); };
  const menu = (s: Fornecedor): readonly (ItemMenu | "-")[] => [
    { label: "Abrir ficha", icone: <Eye className="ic" aria-hidden="true" />, run: () => abrir({ t: "sup", id: s.id }) },
    { label: "Editar dados", icone: <Pencil className="ic" aria-hidden="true" />, run: () => abrir({ t: "sup", id: s.id, tab: "dados" }) },
    { label: "Ver encomendas", icone: <ShoppingCart className="ic" aria-hidden="true" />, run: () => ir({ aba: "po", f: { sup: s.id } }) },
    s.portal === "invited" ? { label: "Simular: fornecedor entra no portal", icone: <Play className="ic" aria-hidden="true" />, run: () => simular(s.id) } : { label: "Portal do fornecedor", icone: <Users className="ic" aria-hidden="true" />, run: () => abrir({ t: "sup", id: s.id, tab: "portal" }) },
    "-",
    s.deleted ? { label: "Restaurar", icone: <Undo2 className="ic" aria-hidden="true" />, fonte: "rpc_restore_supplier", run: () => { agir((d) => restaurarFornecedor(d, s.id), "Fornecedor restaurado."); } }
      : { label: "Eliminar", icone: <Trash2 className="ic" aria-hidden="true" />, perigo: true, desativado: !can(PM), porque: porqueNao(PM), fonte: "rpc_delete_supplier", run: () => setApagar(s) },
  ];
  const colunas = useColunasForn({
    selecionados: sel, marcar: (id, v) => setSel((x) => ({ ...x, [id]: v })), marcarTodos: (v) => setSel(Object.fromEntries(lista.map((s) => [s.id, v]))),
    todosMarcados: marcados.length > 0 && marcados.length === lista.length, simular, menu,
  });
  return (
    <div>
      <AcoesCab>
        <BotaoExportar def={defFornecedores(() => lista)} />
        <Sec {...perm(PM)} onClick={() => setDlg("importar")}><Upload className="ic" aria-hidden="true" />Importar</Sec>
        <Pri {...perm(PM)} onClick={() => setDlg("novo")}><Plus className="ic" aria-hidden="true" />Novo fornecedor</Pri>
      </AcoesCab>
      {aguardam.length > 0 && <Aguardam lista={aguardam} abrir={(id) => abrir({ t: "sup", id })} filtrar={() => setFiltros("forn", { aguardam: true })} />}
      <div className="card filters">
        <div className="frow">
          <Pesquisa valor={f.q} aoMudar={(q) => setFiltros("forn", { q })} rotulo="Pesquisar fornecedores" dica="Nome, código, NIF, cidade, contacto" />
          <select aria-label="Estado" value={f.estado} onChange={(e) => setFiltros("forn", { estado: e.target.value === "active" || e.target.value === "inactive" ? e.target.value : "" })}><option value="">Todos os estados</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select>
          <select aria-label="Empresa" value={f.empresa} onChange={(e) => setFiltros("forn", { empresa: e.target.value })}><option value="">Todas as empresas</option>{empresas.map((c) => <option key={c}>{c}</option>)}</select>
          <Check rotulo={<>À espera do fornecedor <span className="new">Novo</span></>} ativo={f.aguardam} aoMudar={(v) => setFiltros("forn", { aguardam: v })} />
          <Check rotulo="Com catálogo por ligar" ativo={f.catalogo} aoMudar={(v) => setFiltros("forn", { catalogo: v })} />
          <Check rotulo="Com preços por aprovar" ativo={f.precos} aoMudar={(v) => setFiltros("forn", { precos: v })} />
          <Check rotulo="Ver eliminados" ativo={f.eliminados} aoMudar={(v) => setFiltros("forn", { eliminados: v })} />
        </div>
        <div className="rules"><Pencil className="ic sm" aria-hidden="true" /><span>Clique num valor da tabela para o editar (Enter grava, Esc cancela). Email repetido de equipa, cliente ou outro fornecedor é recusado.</span></div>
      </div>
      {lista.length ? <TabelaInv titulo="Fornecedores" minimo={1000} colunas={colunas} linhas={lista} chave={(s) => s.id} abrir={(s) => abrir({ t: "sup", id: s.id })} classeLinha={(s) => (s.deleted ? "deleted" : "")} rotuloAbrir={(s) => `Abrir a ficha de ${s.name}`} ordemInicial={{ col: "n", dir: "asc" }}
        acoes={(s) => <AcoesLinha s={s} abrir={() => abrir({ t: "sup", id: s.id })} menu={menu} />} />
        : <Vazio titulo="Sem fornecedores" texto="Ajuste os filtros."><Sec onClick={() => ir({ aba: "sup", f: {} })}>Limpar filtros</Sec></Vazio>}
      <div className="tbl-foot"><span>{lista.length} fornecedor(es)</span><Fonte>{FONTE_LISTA}</Fonte></div>
      {marcados.length > 0 && <BarraMassa n={marcados.length} aoEscolher={setMassa} aoLimpar={() => setSel({})} />}
      {dlg === "novo" && <NovoFornecedorDialogo aoFechar={() => setDlg(null)} aoRascunho={setRascunho} />}
      {dlg === "importar" && <ImportarDlg def={defFornecedores(() => lista)} aoFechar={() => setDlg(null)} />}
      {massa && <MassaDlg ids={marcados} kind={massa} aoFechar={() => setMassa(null)} aoFeito={() => setSel({})} />}
      {sim && <PortalSimDialogo sid={sim} aoFechar={() => setSim(null)} />}
      {rascunho && <FolhaForn id={null} pre={rascunho} aoFechar={() => setRascunho(null)} />}
      {apagar && <Confirmar aberto aoFechar={() => setApagar(null)} titulo={`Eliminar ${apagar.name}`} ok="Eliminar" perigo
        texto={<><p>O fornecedor fica oculto (pode restaurar).</p>{apagar.portal === "active" && <Nota tom="warn">Tem portal ativo: o acesso é revogado.</Nota>}</>}
        aoConfirmar={() => { const r = agir((d) => eliminarFornecedor(d, apagar.id)); if (r.ok) fecharDetalhe(); return r; }} />}
    </div>
  );
}
