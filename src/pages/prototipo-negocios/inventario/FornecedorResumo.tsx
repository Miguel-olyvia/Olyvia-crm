// O separador "Resumo" da ficha do fornecedor (supTab 'resumo' e supDraftTab do mockup): o cumprimento do prazo (SLA) e as encomendas; no rascunho, a lista do que falta para gravar.
import { fmtD, fornecedor, pct } from "./base";
import { useCtxInv } from "./ctxInv";
import { slaStats } from "./fornecedores";
import { Kpi, Kpis } from "./kpiInv";
import { Nota, Selo } from "./pecasInv";
import { poLate, poOpen, poStatus, poStatusLabel, poTotals } from "./po";
import { dinheiro } from "./ProdutoCampo";
import { emailValido, donoDoEmail, nifValido, validarNovoForn, type ArtigoRascunho, type DadosForn } from "./regrasForn";
import { TabelaInv } from "./TabelaInv";
import type { EstadoPo, Po, Tom } from "./tipos";

const TOM_PO: Record<EstadoPo, Tom> = { pending: "warn", ordered: "info", partial: "violet", received: "ok", cancelled: "neu" };

export function ResumoForn({ id }: { id: string }) {
  const { db, abrir } = useCtxInv();
  const s = fornecedor(db, id), sl = slaStats(db, id);
  if (!s) return null;
  const pos = db.pos.filter((p) => p.sup === id && !p.deleted).sort((a, b) => (b.date > a.date ? 1 : -1));
  const abertas = pos.filter(poOpen);
  const tabela = (l: Po[]): React.ReactNode => (
    <TabelaInv titulo="Encomendas" minimo={560} linhas={l} chave={(p) => p.id} abrir={(p) => abrir({ t: "po", id: p.id })} rotuloAbrir={(p) => `Abrir a encomenda ${p.id}`}
      colunas={[
        { id: "i", titulo: "Nº", classe: () => "mono", celula: (p) => p.id }, { id: "d", titulo: "Data", celula: (p) => fmtD(p.date) },
        { id: "e", titulo: "Entrega", classe: (p) => (poLate(p) ? "late" : ""), celula: (p) => fmtD(p.due) },
        { id: "s", titulo: "Estado", celula: (p) => <Selo tom={TOM_PO[poStatus(p)]}>{poStatusLabel[poStatus(p)]}</Selo> }, { id: "v", titulo: "Valor", direita: true, celula: (p) => dinheiro(poTotals(p).total) },
      ]} />
  );
  return (
    <>
      <Kpis>
        <Kpi rotulo="Recebidas" valor={String(sl.rec)} nota="histórico" fonte="rpc_get_supplier_sla_report" />
        <Kpi tom="ok" rotulo="Dentro do SLA" valor={String(sl.inn)} nota={`prazo ${s.sla} dias`} fonte="suppliers.sla_days" />
        <Kpi tom={sl.out ? "bad" : undefined} rotulo="Fora do SLA" valor={String(sl.out)} fonte="rpc_get_supplier_sla_orders" />
        <Kpi tom={sl.pct >= 90 ? "ok" : "warn"} rotulo="% cumprimento" valor={pct(sl.pct)} fonte="rpc_get_supplier_sla_report" />
        <Kpi rotulo="Atraso médio" valor={`${(Math.round(sl.avg * 10) / 10).toString().replace(".", ",")} dias`} fonte="rpc_get_supplier_sla_report" />
      </Kpis>
      <h3 style={{ margin: "6px 0 8px" }}>POs abertas ({abertas.length})</h3>
      {abertas.length ? tabela(abertas) : <p className="muted">Sem encomendas em aberto.</p>}
      <h3 style={{ margin: "16px 0 8px" }}>Últimas encomendas</h3>
      {pos.length ? tabela(pos.slice(0, 6)) : <p className="muted">Sem encomendas.</p>}
    </>
  );
}

export function ResumoRascunho({ d, items, enviar }: { d: DadosForn; items: ArtigoRascunho[]; enviar: boolean }) {
  const { db } = useCtxInv();
  const v = validarNovoForn(db, { company: d.company, name: d.name, nif: d.nif, email: d.email, contactName: d.contact }, enviar);
  const ok = (b: boolean, texto: React.ReactNode): React.ReactNode => <li>{b ? <Selo tom="ok">✓</Selo> : <Selo tom="neu">—</Selo>} {texto}</li>;
  const erros = Object.values(v.errs);
  return (
    <>
      <p className="muted" style={{ marginBottom: 10 }}>Ainda sem histórico: o resumo de SLA e encomendas aparece depois de gravar.</p>
      <ul className="stack" style={{ listStyle: "none", padding: 0, gap: 6 }}>
        {ok(!!String(d.name).trim(), <>Dados: nome{d.name ? ` “${d.name}”` : ""}</>)}{ok(nifValido(d.nif), "NIF válido")}{ok(emailValido(d.email) && !donoDoEmail(db, d.email), "Email único")}
        {ok(items.length > 0, `${items.length} artigo(s) preparados`)}{ok(enviar, "Enviar acesso ao portal ao gravar")}
      </ul>
      {erros.length > 0 && <div style={{ marginTop: 10 }}><Nota tom="warn">{erros.join(" · ")}</Nota></div>}
    </>
  );
}
