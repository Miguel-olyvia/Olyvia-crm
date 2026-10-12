// O topo do Quadro de Negócios V2, no estilo do Inventário: a faixa de KPIs (os mesmos seis cartões do dashboard, por isso batem com ele e com o Quadro) e a "Fila de trabalho"
// (as vistas rápidas: cada cartão aplica o filtro e deixa o Quadro filtrado). Só desenha: os números vêm de dashboardNegocios e de filaNegocios.
import type { AcaoN, ContextoN, LinhaN } from "./filtrosNegocios";
import { cartoesNegocios } from "./dashboardNegocios";
import { valorCartao } from "./graficosTipos";
import { filaNegocios, type AcaoFilaN } from "./filaNegocios";
import { FaixaKpi } from "./FaixaKpi";
import { CartaoFila, GrelhaFila } from "./CartaoFila";

interface ResumoProps {
  linhas: readonly LinhaN[];
  ctx: ContextoN;
  /** Junta o filtro ao Quadro e fica nele (o nome serve para avisar "Quadro filtrado por ..."). */
  aoAgir: (acao: AcaoN, rotulo: string) => void;
  /** Liga o filtro rápido "Com atraso" e fica no Quadro. */
  verAtrasos: () => void;
}

export function NegociosResumo({ linhas, ctx, aoAgir, verAtrasos }: ResumoProps) {
  const kpis = cartoesNegocios(linhas, ctx).map((c) => ({
    id: c.id, rotulo: c.rotulo, valor: valorCartao(c), nota: c.nota, acaoRotulo: c.acaoRotulo, aoClicar: c.acao ? () => aoAgir(c.acao!, c.rotulo) : undefined,
  }));
  const abrir = (a: AcaoFilaN, rotulo: string): void => (a.rapido ? verAtrasos() : aoAgir(a, rotulo));
  return (
    <>
      <FaixaKpi nome="Resumo dos negócios" itens={kpis} />
      <GrelhaFila titulo="Fila de trabalho" ajuda="Cada cartão abre o Quadro já filtrado; o número é o dos negócios que vai ver.">
        {filaNegocios(linhas, ctx).map((i) => <CartaoFila key={i.id} item={i} aoAbrir={() => abrir(i.acao, i.titulo)} />)}
      </GrelhaFila>
    </>
  );
}
