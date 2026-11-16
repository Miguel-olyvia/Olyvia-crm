// 16/11: o campo «Modelo» do produto (Categoria › Subcategoria › Modelo). Vem a seguir à Subcategoria e só mostra os modelos da subcategoria escolhida
// («0001 · SORTY»): o número do modelo é o NNNN da referência. Fica desativado, com a razão escrita, sem subcategoria (ou sem a função na base).
// «Novo modelo…» escolhe um nome novo: nada se grava aqui; a base cria-o quando o produto é gravado (real/gravarCatalogo.ts), como as categorias novas.
// Serve a criação (CriarNoCatalogo) e a ficha (ClassificacaoFicha).
import { useMemo, useState } from "react";
import { Campo } from "./pecasForm";
import { ComboPesquisa, NovoNome, semAcentos, type ItemCombo } from "./ComboPesquisa";
import { AINDA_NAO } from "./fichaProdutoDados";
import { useFoco } from "./ClassificacaoProduto";
import { rotuloModelo } from "./modelosDados";
import type { ModeloK } from "./v2/catalogoModelo";

/** `id` «»: sem modelo; `novo`: o nome de um modelo por criar (id «»). */
export interface ModeloEscolhido { id: string; novo: string | null }
export const MODELO_VAZIO: ModeloEscolhido = { id: "", novo: null };

const NOVO = "__novo__";
const DICA_NOVO = "É novo: cria-se quando o produto for gravado. O número atribui-se ao guardar.";
const DESATIVADO = "Já existe e está desativado: reative-o na Gestão.";
const juntar = (t: string) => t.trim().replace(/\s+/g, " ");

export function CampoModelo({ modelos, sub, subNova, valor, onChange, podeCriar, original = "" }: {
  /** Os modelos da organização (K.modelos); sem eles o campo não se oferece. */
  modelos: readonly ModeloK[] | undefined;
  /** O nó da árvore da subcategoria escolhida («» = nenhuma) e se a subcategoria é nova (por criar). */
  sub: string; subNova: boolean;
  valor: ModeloEscolhido; onChange: (v: ModeloEscolhido) => void;
  /** products.edit: sem ela não se criam modelos. */
  podeCriar: boolean;
  /** O modelo que o produto já tem: se está desativado continua à vista. */
  original?: string;
}) {
  const [novo, setNovo] = useState<string | null>(null);
  const [erroNovo, setErroNovo] = useState<string | null>(null);
  const foco = useFoco();
  const temSub = !!sub || subNova;
  const itens = useMemo<ItemCombo[]>(() => (modelos ?? []).filter((m) => m.sub === sub && !!sub && (m.ativo || m.id === original))
    .map((m) => ({ id: m.id, nome: rotuloModelo({ numero: m.numero, nome: m.n }), ...(m.ativo ? {} : { inativo: true }) })), [modelos, sub, original]);
  const atual: ItemCombo | null = valor.novo ? { id: NOVO, nome: valor.novo } : valor.id ? itens.find((i) => i.id === valor.id) ?? null : null;
  const dica = !modelos ? AINDA_NAO : !temSub ? "Escolha primeiro a subcategoria (o modelo é da subcategoria)." : valor.novo ? DICA_NOVO : undefined;
  const fechar = () => { setNovo(null); setErroNovo(null); foco.devolver(); };
  const criar = (nome: string) => {
    const n = juntar(nome);
    const ja = (modelos ?? []).find((m) => m.sub === sub && !!sub && semAcentos(m.n) === semAcentos(n));
    if (ja && !ja.ativo) { setErroNovo(DESATIVADO); return; }
    onChange(ja ? { id: ja.id, novo: null } : { id: "", novo: n });
    fechar();
  };
  return (
    <>
      <Campo rot="Modelo" dica={dica}>{(id) => (
        <ComboPesquisa id={id} rotulo="Modelo" itens={itens} atual={atual} desativado={!modelos || !temSub} semValor="Sem modelo" textoNova="Novo modelo…" registar={foco.registar}
          onEscolher={(i) => onChange(i.id ? { id: i.id, novo: null } : MODELO_VAZIO)} onNova={podeCriar ? (t) => setNovo(t) : undefined} />
      )}</Campo>
      {novo !== null && <NovoNome rotulo="Novo modelo" rotuloCampo="Nome do novo modelo" inicial={novo} erro={erroNovo} onCriar={criar} onCancelar={fechar} />}
    </>
  );
}
