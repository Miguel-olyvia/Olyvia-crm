// O ecrã "Mockup · cobertura", igual ao do mockup (scrCov): cada funcionalidade atual, onde fica na nova UI e a fonte de dados; as regras mantidas e os problemas resolvidos.
import { useState } from "react";
import { Download } from "lucide-react";
import { csvDe, descarregarCsv } from "../funcCsv";
import { AcoesCab } from "./cabInv";
import { COBERTURA, PROBLEMAS, REGRAS, type LinhaCob } from "./coberturaDados";
import { useCtxInv, type AbaInv } from "./ctxInv";
import { Kpi, Kpis } from "./kpiInv";
import { Nota, Pesquisa, Sec } from "./pecasInv";

const CABECALHO = ["ecra_antigo", "funcionalidade", "onde_fica", "alimentado_por", "novo"];
const linhaCsv = (r: LinhaCob): string[] => [r[0], r[1], r[2], r[4], r[5] ? "sim" : ""];

function Grupo({ g, linhas, ir }: { g: string; linhas: readonly LinhaCob[]; ir: (a: AbaInv) => void }) {
  return (
    <>
      <tr className="grp"><td colSpan={3}>{g} <span className="muted" style={{ fontWeight: 500 }}>({linhas.length})</span></td></tr>
      {linhas.map((r) => (
        <tr key={r[1]}>
          <td>{r[1]}{r[5] ? <> <span className="badge b-new">Novo</span></> : null}</td>
          <td><button type="button" className="link" onClick={() => ir(r[3])}>{r[2]}</button></td>
          <td className="mono cov-src" style={{ fontSize: 12 }}>{r[4]}</td>
        </tr>
      ))}
    </>
  );
}

function Tabela({ lista }: { lista: readonly LinhaCob[] }) {
  const { ir } = useCtxInv();
  const grupos = [...new Set(lista.map((r) => r[0]))];
  return (
    <div className="tw"><table className="min-900">
      <thead><tr><th>Funcionalidade atual</th><th>Onde fica no novo UI</th><th>Alimentado por</th></tr></thead>
      <tbody>{grupos.map((g) => <Grupo key={g} g={g} linhas={lista.filter((r) => r[0] === g)} ir={(aba) => ir({ aba } as Parameters<typeof ir>[0])} />)}</tbody>
    </table></div>
  );
}

export function CoberturaInv() {
  const { avisar } = useCtxInv();
  const [q, setQ] = useState("");
  const qq = q.trim().toLowerCase();
  const lista = COBERTURA.filter((r) => !qq || (r[0] + " " + r[1] + " " + r[2] + " " + r[4]).toLowerCase().includes(qq));
  const exportar = (): void => {
    const ok = descarregarCsv("cobertura.csv", csvDe(CABECALHO, COBERTURA.map(linhaCsv)));
    if (ok) avisar("Cobertura exportada."); else avisar("O navegador bloqueou a transferência.", true);
  };
  return (
    <div>
      <AcoesCab><Sec onClick={exportar}><Download className="ic" aria-hidden="true" />Exportar</Sec></AcoesCab>
      <div style={{ marginBottom: 14 }}><Nota tom="warn"><b>Decisão a confirmar:</b> hoje a PO automática nasce como rascunho (pending) e precisa de aprovação (<span className="mono">purchase_orders.approve</span>) antes de ir ao portal; o mockup mostra o envio direto (alternável em Hoje › POs automáticas). O botão “Aprovar e enviar” mantém-se para POs manuais e para quando a aprovação estiver ativa.</Nota></div>
      <Kpis>
        <Kpi rotulo="Funcionalidades mapeadas" valor={String(COBERTURA.length)} />
        <Kpi rotulo="Acréscimos (Novo)" valor={String(COBERTURA.filter((r) => r[5]).length)} tom="info" />
        <Kpi rotulo="Removidas" valor="0" tom="ok" nota="nenhuma" />
        <Kpi rotulo="Entradas de menu" valor="7 → 2" nota="Compras e Armazém" />
      </Kpis>
      <div className="card filters"><div className="frow"><Pesquisa valor={q} aoMudar={setQ} rotulo="Filtrar cobertura" dica="Filtrar funcionalidades" /></div></div>
      <Tabela lista={lista} />
      <div className="flow-top" style={{ marginTop: 18, alignItems: "start" }}>
        <section className="card pad" aria-labelledby="h-rules"><h2 id="h-rules" style={{ fontSize: 16, marginBottom: 10 }}>Regras mantidas</h2>
          <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6, fontSize: 13.5 }}>{REGRAS.map((r) => <li key={r}>{r}</li>)}</ol>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Todas aplicadas no motor deste mockup: experimente violá-las (ex.: receber mais do que falta, fechar uma contagem com diferenças, eliminar uma EC de contrato).</p></section>
        <section className="card pad" aria-labelledby="h-prob"><h2 id="h-prob" style={{ fontSize: 16, marginBottom: 10 }}>Problemas atuais resolvidos</h2>
          <div className="stack" style={{ gap: 10 }}>{PROBLEMAS.map(([a, b]) => <div key={a}><b style={{ fontSize: 13.5 }}>{a}</b><br /><span className="muted" style={{ fontSize: 13 }}>→ {b}</span></div>)}</div></section>
      </div>
    </div>
  );
}
