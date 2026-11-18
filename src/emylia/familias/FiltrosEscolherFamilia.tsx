// Famílias (interface): os filtros do passo «Escolher produtos», com os mesmos componentes e a mesma ordem da página de Produtos
// (ComboPesquisa com a pesquisa num painel próprio): Categoria > Subcategoria > Modelo > Marca.
import { ComboPesquisa, type ItemCombo } from "../ComboPesquisa";
import { normalizarMarca } from "../filtroProdutosCatalogo";
import { Campo } from "../pecasForm";
import type { FiltrosFamilia } from "./usarFiltrosFamilia";

const atual = (itens: readonly ItemCombo[], id: string): ItemCombo | null => (id ? itens.find((x) => normalizarMarca(x.id) === normalizarMarca(id)) ?? null : null);

export function FiltrosEscolherFamilia({ f }: { f: FiltrosFamilia }) {
  const { escolha, mudar, cats, subs, modelos, marcas } = f;
  return (
    <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Campo rot="Categoria">{(id) => (
        <ComboPesquisa id={id} rotulo="Categoria" itens={cats} atual={atual(cats, escolha.cat)} semValor="Todas as categorias" semValorComoValor placeholder="Todas as categorias"
          vazio="Nenhuma categoria encontrada" onEscolher={(i) => mudar({ cat: i.id, sub: "", modelo: "" })} />
      )}</Campo>
      <Campo rot="Subcategoria" dica={!escolha.cat ? "Escolha primeiro a categoria." : undefined}>{(id) => (
        <ComboPesquisa id={id} rotulo="Subcategoria" itens={subs} atual={atual(subs, escolha.sub)} desativado={!escolha.cat} semValor="Todas as subcategorias" semValorComoValor
          placeholder="Todas as subcategorias" vazio="Nenhuma subcategoria encontrada" onEscolher={(i) => mudar({ sub: i.id, modelo: "" })} />
      )}</Campo>
      {modelos && (
        <Campo rot="Modelo" dica={!escolha.sub ? "Escolha primeiro a subcategoria." : undefined}>{(id) => (
          <ComboPesquisa id={id} rotulo="Modelo" itens={modelos} atual={atual(modelos, escolha.modelo)} desativado={!escolha.sub} semValor="Todos os modelos" semValorComoValor
            placeholder="Todos os modelos" vazio="Esta subcategoria não tem modelos" onEscolher={(i) => mudar({ modelo: i.id })} />
        )}</Campo>
      )}
      <Campo rot="Marca">{(id) => (
        <ComboPesquisa id={id} rotulo="Marca" itens={marcas} atual={atual(marcas, escolha.marca) ?? (escolha.marca ? { id: escolha.marca, nome: escolha.marca } : null)} semValor="Todas as marcas"
          semValorComoValor placeholder="Todas as marcas" vazio="Nenhuma marca encontrada" onEscolher={(i) => mudar({ marca: i.id })} />
      )}</Campo>
    </div>
  );
}
