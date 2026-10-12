// "Simular venda assinada": cria a Encomenda Cliente como faria o gatilho real (serve do stock livre, o que falta vai para a PO do preferencial).
import { useState } from "react";
import { simularVenda } from "./ec";
import { Dlg } from "./DialogosInv";
import { useCtxInv } from "./ctxInv";
import { EditorLinhas } from "./EditorLinhas";
import { linhasValidas, type LinhaEd } from "./linhasEd";
import { opcoesExpedicao, opcoesProdutos } from "./opcoes";
import { Lista, Nota, Pri, Sec, Texto } from "./pecasInv";

type Origem = "CT" | "PR" | "VD";
const ORIGENS: readonly (readonly [Origem, string])[] = [["CT", "Contrato assinado"], ["PR", "Proposta aceite"], ["VD", "Venda direta confirmada"]];
const INICIO = (wh: string): { kind: Origem; client: string; addr: string; wh: string; linhas: LinhaEd[]; erro: string } => ({
  kind: "CT", client: "Cliente Exemplo Lda", addr: "Rua Exemplo 1, 1000-001 Lisboa", wh,
  linhas: [{ sku: "PV-450", qty: 12 }, { sku: "TR-50", qty: 1 }, { sku: "KIT-PV4", qty: 1 }], erro: "",
});

export function VendaDialogo({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const { db, agir, abrir, ir } = useCtxInv();
  const [f, setF] = useState(() => INICIO(db.settings.defaultWh));
  const ded = db.settings.deduction;
  const semGerar = (f.kind === "PR" && ded === "contract") || (f.kind === "CT" && ded === "proposal");
  const mudar = (p: Partial<typeof f>): void => setF((x) => ({ ...x, ...p, erro: "" }));
  const gerar = (): void => {
    const linhas = linhasValidas(f.linhas);
    if (!linhas || !linhas.length) { setF((x) => ({ ...x, erro: "Escolha o produto e uma quantidade inteira em cada linha." })); return; }
    const r = agir((d) => simularVenda(d, { kind: f.kind, client: f.client, addr: f.addr, wh: f.wh, lines: linhas }), (e) => `${e.id} criada. Veja de onde vem cada linha.`);
    if (!r.ok) { setF((x) => ({ ...x, erro: r.erro })); return; }
    aoFechar();
    ir({ aba: "ec" });
    abrir({ t: "ec", id: r.valor.id });
  };
  return (
    <Dlg aberto={aberto} aoFechar={aoFechar} titulo="Simular venda assinada" largo
      descricao="Cria a Encomenda Cliente como faria o gatilho real: por linha, serve do stock livre (FIFO) e o que falta vai para a PO do fornecedor preferencial. Os pacotes são expandidos."
      rodape={<><Sec onClick={aoFechar}>Cancelar</Sec><Pri onClick={gerar}>Assinar e gerar</Pri></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Lista rotulo="Origem" valor={f.kind} aoMudar={(v) => mudar({ kind: v as Origem })} opcoes={ORIGENS} />
        <Texto rotulo="Cliente" valor={f.client} aoMudar={(v) => mudar({ client: v })} obrigatorio />
        <Texto rotulo="Morada de entrega" valor={f.addr} aoMudar={(v) => mudar({ addr: v })} />
        <Lista rotulo="Armazém de expedição" valor={f.wh} aoMudar={(v) => mudar({ wh: v })} opcoes={opcoesExpedicao(db)} />
      </div>
      {semGerar && <Nota tom="warn">Definição atual: baixa de stock no momento <b>{ded === "contract" ? "contrato assinado" : "proposta aceite"}</b>. Esta origem não gera Encomenda Cliente (nunca os dois). Mude em Armazéns.</Nota>}
      <EditorLinhas linhas={f.linhas} aoMudar={(l) => mudar({ linhas: l })} opcoes={opcoesProdutos(db)} />
      {f.erro && <Nota tom="bad" alerta>{f.erro}</Nota>}
    </Dlg>
  );
}
