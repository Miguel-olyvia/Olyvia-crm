// O topo da Lista de Pessoas V2, no estilo do Inventário: a faixa de KPIs (os mesmos cartões do dashboard, por isso batem com ele e com a lista) e a "Fila de trabalho"
// (cada cartão junta o filtro correspondente e deixa a Lista filtrada). Só desenha: os números vêm de dashboardPessoas e de filaPessoas.
import type { SeparadorLista } from "./pessoasDocs";
import type { FiltrosP, LinhaP } from "./filtrosPessoas";
import { cartoesPessoas, notaDoCartao, type AcaoP } from "./dashboardPessoas";
import { valorCartao } from "./graficosTipos";
import { filaPessoas } from "./filaPessoas";
import { FaixaKpi } from "./FaixaKpi";
import { CartaoFila, GrelhaFila } from "./CartaoFila";

interface ResumoProps {
  linhas: readonly LinhaP[];
  aba: SeparadorLista;
  f: FiltrosP;
  /** Junta o filtro (e, se for o caso, muda de separador) e fica na Lista; o nome serve para avisar "Lista filtrada por ...". */
  aoAgir: (acao: AcaoP, rotulo: string) => void;
}

export function PessoasResumo({ linhas, aba, f, aoAgir }: ResumoProps) {
  const kpis = cartoesPessoas(linhas, aba, f).map((c) => ({
    id: c.id, rotulo: c.rotulo, valor: valorCartao(c), nota: notaDoCartao(c, aba, linhas, f), acaoRotulo: c.acaoRotulo, aoClicar: () => aoAgir(c.acao ?? {}, c.rotulo),
  }));
  return (
    <div className="px-4 pt-4">
      <FaixaKpi nome="Resumo das pessoas" itens={kpis} />
      <GrelhaFila titulo="Fila de trabalho" ajuda="Cada cartão abre a Lista já filtrada; o número é o das pessoas que vai ver.">
        {filaPessoas(linhas, aba, f).map((i) => <CartaoFila key={i.id} item={i} aoAbrir={() => aoAgir(i.acao, i.titulo)} />)}
      </GrelhaFila>
    </div>
  );
}
