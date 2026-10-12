// Compras › Fornecedores: a lista com pesquisa, filtros e ordenação; a linha abre a ficha (resumo, dados, artigos e preços, preços por aprovar e portal).
// Esta lista não tem botão primário (criar um fornecedor é convidá-lo para o portal e não foi portado: ver README).
import { useRef } from "react";
import { Escolher, Interruptor } from "../FiltrosPopover";
import { pct } from "./base";
import { contadores } from "./contadores";
import { useCtxInv } from "./ctxInv";
import { filtrarForn } from "./filtros";
import { portalTexto, posAbertas, precosPorAprovar, slaStats } from "./fornecedores";
import { ExportarInv } from "./ExportarInv";
import { Ligacao, Pesquisa, Sec, Selo, Vazio } from "./pecasInv";
import { TabelaInv, type Coluna } from "./TabelaInv";
import type { Fornecedor } from "./tipos";

export function FornecedoresInv() {
  const { db, filtros, setFiltros, abrir, ir } = useCtxInv();
  const f = filtros.forn;
  const lista = filtrarForn(db, f);
  const aguardam = db.suppliers.filter((s) => !s.deleted && s.portal === "invited" && s.awaiting);
  const cols: Coluna<Fornecedor>[] = [
    { id: "n", titulo: "Nome", celula: (s) => <>{s.name}{s.deleted ? " · Eliminado" : ""} · {s.company}</>, valor: (s) => s.name },
    { id: "c", titulo: "Código", celula: (s) => s.code, valor: (s) => s.code },
    { id: "ct", titulo: "Contacto", celula: (s) => <>{s.contact}<span className="block text-muted-foreground">{s.email}</span><span className="block text-muted-foreground">{s.phone}</span></> },
    { id: "ci", titulo: "Cidade", celula: (s) => s.city, valor: (s) => s.city },
    { id: "po", titulo: "POs abertas", direita: true, celula: (s) => (posAbertas(db, s.id) ? <Ligacao aoClicar={() => ir({ aba: "po", f: { sup: s.id } })}>{posAbertas(db, s.id)}</Ligacao> : "0"), valor: (s) => posAbertas(db, s.id) },
    { id: "sla", titulo: "SLA %", direita: true, celula: (s) => <>{pct(slaStats(db, s.id).pct)}<span className="block text-muted-foreground">prazo {s.sla} d</span></>, valor: (s) => slaStats(db, s.id).pct },
    { id: "pt", titulo: "Portal", celula: (s) => <Selo tom={s.portal === "active" ? "ok" : s.portal === "revoked" ? "bad" : s.portal === "invited" ? "info" : "neu"}>{portalTexto(s)}</Selo> },
    { id: "pr", titulo: "Preços por aprovar", celula: (s) => (precosPorAprovar(db, s.id).length ? <Selo tom="warn">{precosPorAprovar(db, s.id).length} por aprovar</Selo> : "—"), valor: (s) => precosPorAprovar(db, s.id).length },
    { id: "e", titulo: "Estado", celula: (s) => <Selo tom={s.active ? "ok" : "neu"}>{s.active ? "Ativo" : "Inativo"}</Selo> },
  ];
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-end gap-3">
        <ExportarInv nome="fornecedores" rotulo="fornecedores" cabecalho={["Nome", "Código", "Empresa", "Contacto", "Email", "Telefone", "Cidade", "POs abertas", "SLA %", "Prazo (dias)", "Estado"]} linhas={() => lista.map((s) => [s.name, s.code, s.company, s.contact, s.email, s.phone, s.city, posAbertas(db, s.id), Math.round(slaStats(db, s.id).pct), s.sla, s.active ? "Ativo" : "Inativo"])} />
      </div>
      {aguardam.length > 0 && (
        <p className="rounded-md border border-border px-3 py-2 text-[15px]"><b>{aguardam.length} fornecedor(es) à espera de preencher a ficha no portal:</b> {aguardam.map((s) => <Ligacao key={s.id} aoClicar={() => abrir({ t: "sup", id: s.id })}>{s.name}</Ligacao>)}. <Ligacao aoClicar={() => setFiltros("forn", { aguardam: true })}>Filtrar</Ligacao></p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <Pesquisa valor={f.q} aoMudar={(q) => setFiltros("forn", { q })} rotulo="Pesquisar fornecedores por nome, código, NIF, cidade ou contacto" dica="Nome, código, NIF, cidade, contacto" />
        <div className="w-48"><Escolher rotulo="Estado" valor={f.estado} aoMudar={(v) => setFiltros("forn", { estado: v === "active" || v === "inactive" ? v : "" })} todas="Todos os estados" opcoes={[{ valor: "active", nome: "Ativos" }, { valor: "inactive", nome: "Inativos" }]} /></div>
        <Interruptor nome="À espera do fornecedor" ativo={f.aguardam} aoMudar={() => setFiltros("forn", { aguardam: !f.aguardam })} />
        <Interruptor nome="Com catálogo por ligar" ativo={f.catalogo} aoMudar={() => setFiltros("forn", { catalogo: !f.catalogo })} />
        <Interruptor nome="Com preços por aprovar" ativo={f.precos} aoMudar={() => setFiltros("forn", { precos: !f.precos })} />
        <Interruptor nome="Ver eliminados" ativo={f.eliminados} aoMudar={() => setFiltros("forn", { eliminados: !f.eliminados })} />
      </div>
      {lista.length === 0 ? <Vazio titulo="Sem fornecedores" texto="Ajuste os filtros."><Sec onClick={() => ir({ aba: "sup", f: {} })}>Limpar filtros</Sec></Vazio> : (
        <TabelaInv titulo="Fornecedores" colunas={cols} linhas={lista} chave={(s) => s.id} abrir={(s) => abrir({ t: "sup", id: s.id })} ordemInicial={{ col: "n", dir: "asc" }} classeLinha={(s) => (s.deleted ? "opacity-70" : "")} rotuloAbrir={(s) => `Abrir a ficha de ${s.name}`} />
      )}
      <p className="text-[15px] text-muted-foreground" aria-live="polite">{lista.length} fornecedor(es) · {contadores(db).catUnlinked} artigos do portal por ligar</p>
    </div>
  );
}
