// "Nova encomenda a fornecedor": só se encomendam artigos do fornecedor, em embalagens dele (o stock conta em unidades). Cria um rascunho.
import { useState } from "react";
import { criarPoManual } from "./po";
import { Dlg } from "./DialogosInv";
import { useCtxInv } from "./ctxInv";
import { EditorLinhas } from "./EditorLinhas";
import { linhasValidas, type LinhaEd } from "./linhasEd";
import { opcoesArmazens, opcoesArtigosDe, opcoesFornecedores } from "./opcoes";
import { Lista, Nota, Pri, Sec } from "./pecasInv";

export function NovaPoDialogo({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const { db, agir, abrir } = useCtxInv();
  const [f, setF] = useState<{ sup: string; wh: string; linhas: LinhaEd[]; erro: string }>({ sup: "", wh: db.settings.defaultWh, linhas: [{ sku: "", qty: 1 }], erro: "" });
  const mudar = (p: Partial<typeof f>): void => setF((x) => ({ ...x, ...p, erro: "" }));
  const criar = (): void => {
    const l = linhasValidas(f.linhas);
    if (!f.sup) { setF((x) => ({ ...x, erro: "Escolha o fornecedor." })); return; }
    if (!l || !l.length) { setF((x) => ({ ...x, erro: "Adicione pelo menos uma linha, com produto e quantidade inteira (embalagens)." })); return; }
    const r = agir((d) => criarPoManual(d, { sup: f.sup, wh: f.wh, linhas: l.map((x) => ({ sku: x.sku, packs: x.qty })) }), (p) => `${p.id} criada como rascunho.`);
    if (!r.ok) { setF((x) => ({ ...x, erro: r.erro })); return; }
    aoFechar();
    abrir({ t: "po", id: r.valor.id });
  };
  return (
    <Dlg aberto={aberto} aoFechar={aoFechar} titulo="Nova encomenda a fornecedor" largo descricao="Escolha o fornecedor e os artigos dele. A quantidade é em embalagens do fornecedor."
      rodape={<><Sec onClick={aoFechar}>Cancelar</Sec><Pri onClick={criar}>Criar rascunho</Pri></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Lista rotulo="Fornecedor" valor={f.sup} aoMudar={(v) => mudar({ sup: v, linhas: [{ sku: "", qty: 1 }] })} opcoes={[["", "Escolher…"], ...opcoesFornecedores(db)]} obrigatorio />
        <Lista rotulo="Entregar em" valor={f.wh} aoMudar={(v) => mudar({ wh: v })} opcoes={opcoesArmazens(db)} />
      </div>
      {f.sup ? <EditorLinhas titulo="Linhas (quantidade em embalagens)" rotuloQtd="Embalagens" linhas={f.linhas} aoMudar={(l) => mudar({ linhas: l })} opcoes={opcoesArtigosDe(db, f.sup)} />
        : <Nota tom="info">Escolha primeiro o fornecedor para ver os artigos dele.</Nota>}
      {f.erro && <Nota tom="bad" alerta>{f.erro}</Nota>}
    </Dlg>
  );
}
