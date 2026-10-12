// "Nova encomenda manual" e "Editar" (só manuais): cada linha reserva o stock livre do armazém de expedição e o que falta vai para a PO do preferencial;
// as linhas já servidas ficam trancadas (a quantidade não desce abaixo do servido) e os pacotes expandem-se.
import { useState } from "react";
import { cn } from "@/lib/utils";
import { BORDA_CTRL } from "../PessoaLinha";
import { ecPorId, nomeProd } from "./base";
import { useCtxInv } from "./ctxInv";
import { Dlg } from "./DialogosInv";
import { criarEc, editarEcManual } from "./ec";
import { EditorLinhas } from "./EditorLinhas";
import { linhasValidas, type LinhaEd } from "./linhasEd";
import { opcoesExpedicao, opcoesProdutos } from "./opcoes";
import { Lista, Nota, Pri, Sec, Texto } from "./pecasInv";

interface Existente { id: string; sku: string; qty: number | ""; servido: number }

export function EcFormDialogo({ aberto, aoFechar, id }: { aberto: boolean; aoFechar: () => void; id?: string }) {
  const { db, agir, abrir } = useCtxInv();
  const e = id ? ecPorId(db, id) : undefined;
  const [f, setF] = useState(() => ({
    client: e?.client ?? "", addr: e?.addr ?? "", notes: e?.notes ?? "", wh: e?.wh ?? db.settings.defaultWh, erro: "",
    existentes: (e?.lines.filter((l) => l.sku) ?? []).map((l): Existente => ({ id: l.id, sku: l.sku as string, qty: l.qty, servido: l.served })),
    novas: (e ? [] : [{ sku: "", qty: 1 }]) as LinhaEd[],
  }));
  const m = (p: Partial<typeof f>): void => setF((x) => ({ ...x, ...p, erro: "" }));
  const gravar = (): void => {
    const novas = linhasValidas(f.novas);
    if (!novas) { setF((x) => ({ ...x, erro: "Quantidades inteiras e maiores que zero." })); return; }
    const r = agir((d) => {
      if (id) { editarEcManual(d, ecPorId(d, id)!, { client: f.client, addr: f.addr, notes: f.notes }, [...f.existentes.map((x) => ({ id: x.id, qty: Number(x.qty) })), ...novas.map((x) => ({ sku: x.sku, qty: x.qty }))]); return ecPorId(d, id)!; }
      return criarEc(d, { origin: { k: "manual", ref: null }, client: f.client, addr: f.addr, wh: f.wh, notes: f.notes, lines: novas.map((x) => ({ sku: x.sku, qty: x.qty })) });
    }, id ? "Encomenda gravada." : "Encomenda manual criada.");
    if (!r.ok) { setF((x) => ({ ...x, erro: r.erro })); return; }
    aoFechar();
    abrir({ t: "ec", id: r.valor.id });
  };
  return (
    <Dlg aberto={aberto} aoFechar={aoFechar} largo titulo={id ? `Editar ${id}` : "Nova encomenda manual"}
      descricao="Ao gravar, cada linha reserva o stock livre do armazém de expedição; o que falta vai para a PO do fornecedor preferencial. Linhas já servidas ficam trancadas. Pacotes são expandidos."
      rodape={<><Sec onClick={aoFechar}>Cancelar</Sec><Pri onClick={gravar}>Gravar</Pri></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Texto rotulo="Cliente" valor={f.client} aoMudar={(v) => m({ client: v })} obrigatorio />
        <Texto rotulo="Morada de entrega" valor={f.addr} aoMudar={(v) => m({ addr: v })} />
        <Lista rotulo="Armazém de expedição" valor={f.wh} aoMudar={(v) => m({ wh: v })} opcoes={opcoesExpedicao(db)} desativado={!!id} />
        <Texto rotulo="Notas" valor={f.notes} aoMudar={(v) => m({ notes: v })} />
      </div>
      {f.existentes.length > 0 && (
        <fieldset className="grid gap-2"><legend className="text-[15px] font-medium">Linhas da encomenda</legend>
          {f.existentes.map((x, i) => (
            <div key={x.id} className="flex flex-wrap items-end gap-3">
              <p className="min-w-0 flex-1 basis-48 text-[15px]">{nomeProd(db, x.sku)}{x.servido ? <span className="block text-muted-foreground">Linha trancada abaixo de {x.servido}: já saíram {x.servido} un</span> : null}</p>
              <label className="w-28 text-[15px] text-muted-foreground">Quantidade<input type="number" min={Math.max(1, x.servido)} step={1} value={x.qty} onChange={(ev) => m({ existentes: f.existentes.map((y, j) => (j === i ? { ...y, qty: ev.target.value === "" ? "" : Number(ev.target.value) } : y)) })} aria-label={`Quantidade de ${nomeProd(db, x.sku)}`} className={cn("block h-11 w-full rounded-md border bg-card px-3 text-[15px] text-foreground", BORDA_CTRL)} /></label>
            </div>
          ))}
        </fieldset>
      )}
      <EditorLinhas titulo={id ? "Acrescentar linhas" : "Linhas (quantidade em unidades inteiras)"} linhas={f.novas} aoMudar={(l) => m({ novas: l })} opcoes={opcoesProdutos(db)} minimo={id ? 0 : 1} />
      {f.erro && <Nota tom="bad" alerta>{f.erro}</Nota>}
    </Dlg>
  );
}
