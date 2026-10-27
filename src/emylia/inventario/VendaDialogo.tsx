// "Simular venda assinada" (simSaleDlg do mockup): cria a Encomenda Cliente como faria o gatilho real (serve do stock livre, o que falta vai para a PO do preferencial).
import { useState } from "react";
import { Play } from "lucide-react";
import { Dlg } from "./DialogosInv";
import { Fonte } from "./cabInv";
import { useCtxInv } from "./ctxInv";
import { simularVenda } from "./ec";
import { useAbrirEc } from "./ecAbrir";
import { EditorLinhas } from "./EditorLinhas";
import { naoReconhecida } from "./prodTexto";
import type { LinhaEd } from "./linhasEd";
import { opcoesExpedicao, opcoesProdutos } from "./opcoes";
import { Lista, Nota, Pri, Sec, Texto } from "./pecasInv";

type Origem = "CT" | "PR" | "VD";
const ORIGENS: readonly (readonly [Origem, string])[] = [["CT", "Contrato assinado"], ["PR", "Proposta aceite"], ["VD", "Venda direta confirmada"]];
const INICIO = (wh: string): { kind: Origem; client: string; addr: string; wh: string; linhas: LinhaEd[]; erro: string } => ({
  kind: "CT", client: "Cliente Exemplo Lda", addr: "Rua Exemplo 1, 1000-001 Lisboa", wh,
  linhas: [{ sku: "PV-450", qty: 12 }, { sku: "TR-50", qty: 1 }, { sku: "KIT-PV4", qty: 1 }], erro: "",
});

export function VendaDialogo({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const { db, agir, avisar, ir } = useCtxInv();
  const abrirEc = useAbrirEc();
  const [f, setF] = useState(() => INICIO(db.settings.defaultWh));
  const ded = db.settings.deduction;
  const semGerar = (f.kind === "PR" && ded === "contract") || (f.kind === "CT" && ded === "proposal");
  const mudar = (p: Partial<typeof f>): void => setF((x) => ({ ...x, ...p, erro: "" }));
  /** simSaleGo(): as duas recusas do próprio diálogo ficam no diálogo; as regras da encomenda recusam com aviso. */
  const gerar = (): void => {
    if (semGerar) { setF((x) => ({ ...x, erro: "Com a definição atual esta origem não gera encomenda. Nada foi criado." })); return; }
    const nr = naoReconhecida(f.linhas);
    if (nr) { setF((x) => ({ ...x, erro: `Produto não reconhecido: ${nr}` })); return; }
    const r = agir((d) => simularVenda(d, { kind: f.kind, client: f.client, addr: f.addr, wh: f.wh, lines: f.linhas.filter((l) => l.sku).map((l) => ({ sku: l.sku, qty: Number(l.qty) })) }));
    if (!r.ok) return;
    aoFechar();
    ir({ aba: "ec" });
    abrirEc(r.valor.id);
    avisar(`${r.valor.id} criada a partir de ${r.valor.origin.ref}. Veja de onde vem cada linha.`);
  };
  return (
    <Dlg aberto={aberto} aoFechar={aoFechar} titulo="Simular venda assinada" largo
      rodape={<><Sec onClick={aoFechar}>Cancelar</Sec><Pri onClick={gerar}><Play className="ic" aria-hidden="true" />Assinar e gerar</Pri></>}>
      <p className="muted">Cria a Encomenda Cliente como faria o gatilho real: por linha, serve do stock livre (FIFO) e o que falta vai para a PO do fornecedor preferencial (uma por fornecedor e por contrato). Pacotes são expandidos.</p>
      <div className="fg">
        <Lista rotulo="Origem" valor={f.kind} aoMudar={(v) => mudar({ kind: v as Origem })} opcoes={ORIGENS} />
        <Texto rotulo="Cliente" valor={f.client} aoMudar={(v) => mudar({ client: v })} obrigatorio />
        <Texto rotulo="Morada de entrega" valor={f.addr} aoMudar={(v) => mudar({ addr: v })} />
        <Lista rotulo="Armazém de expedição" valor={f.wh} aoMudar={(v) => mudar({ wh: v })} opcoes={opcoesExpedicao(db)} />
      </div>
      {semGerar && <Nota tom="warn">Definição atual: baixa de stock no momento <b>{ded === "contract" ? "contrato assinado" : "proposta aceite"}</b>. Esta origem <b>não gera</b> Encomenda Cliente (nunca os dois). Mude em Armazém › Armazéns › Definições.</Nota>}
      <EditorLinhas linhas={f.linhas} aoMudar={(l) => mudar({ linhas: l })} opcoes={opcoesProdutos(db)} />
      {f.erro && <Nota tom="bad">{f.erro}</Nota>}
      <Fonte>stock_deduction_trigger · rpc_register_sale_stock_movement · fn_client_order_request_missing</Fonte>
    </Dlg>
  );
}
