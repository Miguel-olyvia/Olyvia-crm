// O dashboard de Negócios V2: seis cartões e quatro gráficos (o resto atrás de "Mais gráficos"), sobre os mesmos negócios e os mesmos filtros do Quadro
// ("No Quadro" e as barras batem com o Quadro). Cada cartão e barra com filtro aplica-o e muda para o Quadro.
// Os ganhos e os perdidos não têm coluna no Quadro: contam-se à parte, em todo o período, e não são clicáveis.
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Ctx } from "./pecas";
import { NOTA_RESULTADOS, ignoraResultados, selecionarQuadro, type AcaoN, type ContextoN, type LinhaN } from "./filtrosNegocios";
import {
  cartoesNegocios, funilFases, passosEmAtraso, perdidosPorMotivo, porFaixa, porServicoN, porTipoN, resultadosN, tempoParado, valorPorComercial,
  type BarraN,
} from "./dashboardNegocios";
import { eurosTexto, pctTexto, valorCartao } from "./graficosTipos";
import { BORDA_CTRL } from "./PessoaLinha";
import { BarrasH } from "./BarrasH";
import { CaixaGrafico } from "./CaixaGrafico";
import { GrelhaKpi, Kpi } from "./Kpi";
import { MaisGraficos, useMaisGraficos } from "./MaisGraficos";
import { TabelaAlternativa } from "./TabelaAlternativa";

export interface NegociosDashboardProps extends Pick<Ctx, "A" | "go"> {
  linhas: readonly LinhaN[];
  ctx: ContextoN;
  /** Aplica a ação de um cartão ou de uma barra (o nome serve para avisar "Quadro filtrado por ...") e passa ao Quadro. */
  aoAgir: (acao: AcaoN, rotulo: string) => void;
  /** Aplica o filtro "Com atraso" e passa ao Quadro. */
  verAtrasos: () => void;
  limpar: () => void;
}

const negocios = (n: number): string => (n === 1 ? "1 negócio" : `${n} negócios`);

interface BarrasProps {
  titulo: string;
  barras: readonly BarraN[];
  total: number;
  aoAgir?: (a: AcaoN, rotulo: string) => void;
  vazio?: string;
  /** Uma nota curta a seguir ao número (por exemplo quando um filtro não conta para este gráfico). */
  aviso?: string;
  /** Com uma só barra, esta frase ocupa o lugar do gráfico (uma barra a 100 % não diz nada). */
  frase?: (b: BarraN) => string;
}

/** Um gráfico de barras com o número de negócios e o valor de cada uma. */
function Barras({ titulo, barras, total, aoAgir, vazio, aviso, frase }: BarrasProps) {
  const valor = barras.reduce((a, b) => a + (b.euros ?? 0), 0), comValor = barras.some((b) => b.euros !== undefined);
  const numero = (comValor ? `${negocios(total)} · ${eurosTexto(valor)}` : negocios(total)) + (aviso ? `. ${aviso}` : "");
  const grafico = frase && barras.length === 1
    ? <p className="text-[15px] text-foreground">{frase(barras[0])}</p>
    : <BarrasH nome={titulo} barras={barras} total={total} aoEscolher={aoAgir} acaoRotulo={aoAgir ? (b) => `Filtrar por ${b.rotulo}: ${negocios(b.n)}` : undefined} euros={comValor} />;
  return (
    <CaixaGrafico titulo={titulo} numero={numero} vazio={total > 0 ? undefined : vazio ?? "Nenhum negócio com estes filtros."} grafico={grafico}
      tabela={(
        <TabelaAlternativa legenda={titulo} colunas={comValor ? ["Valor", "Negócios", "Percentagem", "Valor em euros"] : ["Valor", "Negócios", "Percentagem"]}
          linhas={barras.map((b) => [b.rotulo, b.n, pctTexto(b.n, total), ...(comValor ? [eurosTexto(b.euros ?? 0)] : [])])}
          total={["Total", total, total > 0 ? "100 %" : "0 %", ...(comValor ? [eurosTexto(valor)] : [])]} />
      )} />
  );
}

const PASSOS_VISIVEIS = 5;

interface AtrasosProps { F: readonly LinhaN[]; A: Ctx["A"]; go: Ctx["go"]; noQuadro: number; verAtrasos: () => void }

/** Os próximos passos em atraso: uma lista curta, cada um com ligação ao cartão do negócio; os que não cabem passam ao Quadro com o filtro "Com atraso". */
function Atrasos({ F, A, go, noQuadro, verAtrasos }: AtrasosProps) {
  const passos = passosEmAtraso(F), resto = passos.length - PASSOS_VISIVEIS;
  return (
    <CaixaGrafico titulo="Próximos passos em atraso" numero={negocios(passos.length)} vazio={passos.length ? undefined : "Nenhum próximo passo em atraso."}
      grafico={(
        <ul aria-label="Próximos passos em atraso" className="grid gap-1">
          {passos.slice(0, PASSOS_VISIVEIS).map((p) => (
            <li key={p.id}>
              <button type="button" onClick={go(() => A.abrir(p.negocioId))}
                className="block min-h-11 w-full cursor-pointer rounded-md px-1 py-1.5 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <span className="block text-[15px] font-medium text-foreground">{p.nome} · {p.titulo}</span>
                <span className="block text-[15px] text-muted-foreground">{p.proximo}<ArrowRight className="ml-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" /></span>
              </button>
            </li>
          ))}
          {resto > 0 && (
            <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 pt-1">
              <span className="text-[15px] text-muted-foreground">e mais {resto}</span>
              <Button type="button" variant="outline" className={cn("min-h-11 cursor-pointer text-[15px]", BORDA_CTRL)} onClick={verAtrasos}>
                Ver os {noQuadro} com atraso no Quadro
              </Button>
            </li>
          )}
        </ul>
      )}
      tabela={<TabelaAlternativa legenda="Próximos passos em atraso" colunas={["Negócio", "Próximo passo"]} linhas={passos.map((p) => [`${p.nome} · ${p.titulo}`, p.proximo])} />} />
  );
}

function Cartoes({ linhas, ctx, aoAgir }: Pick<NegociosDashboardProps, "linhas" | "ctx" | "aoAgir">) {
  return (
    <GrelhaKpi nome="Números dos negócios">
      {cartoesNegocios(linhas, ctx).map((c) => (
        <Kpi key={c.id} rotulo={c.rotulo} valor={valorCartao(c)} nota={c.nota} acaoRotulo={c.acaoRotulo} aoClicar={c.acao ? () => aoAgir(c.acao!, c.rotulo) : undefined} />
      ))}
    </GrelhaKpi>
  );
}

export function NegociosDashboard({ linhas, ctx, aoAgir, verAtrasos, limpar, A, go }: NegociosDashboardProps) {
  const [mais, alternar] = useMaisGraficos("negocios");
  const F = selecionarQuadro(linhas, ctx), total = F.length, perdidos = resultadosN(linhas, ctx).perdidos;
  const parados = tempoParado(F), totalParados = parados.reduce((a, b) => a + b.n, 0);
  // Com "Com atraso" ligado o Quadro troca o filtro rápido que lá estiver: o número do botão é o que o Quadro vai mostrar.
  const noQuadroAtraso = selecionarQuadro(linhas, { ...ctx, rapido: "atraso" }).length;
  return (
    <div className="grid gap-4 pt-4">
      <h2 className="sr-only">Dashboard de negócios</h2>
      <Cartoes linhas={linhas} ctx={ctx} aoAgir={aoAgir} />
      {total === 0 && (
        <div className="grid gap-2 border-t border-border pt-4">
          <p className="text-base font-medium">Nenhum negócio a decorrer com estes filtros.</p>
          <div><Button type="button" variant="outline" className={cn("min-h-11 cursor-pointer text-[15px]", BORDA_CTRL)} onClick={limpar}>Limpar filtros</Button></div>
        </div>
      )}
      {total > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Barras titulo="Funil por fase" barras={funilFases(F)} total={total} aoAgir={aoAgir} />
          <Barras titulo="Casa de banho contra cozinha" barras={porServicoN(F)} total={total} aoAgir={aoAgir} />
          <Barras titulo="Com contrato contra venda direta" barras={porTipoN(F)} total={total} aoAgir={aoAgir} />
          <Atrasos F={F} A={A} go={go} noQuadro={noQuadroAtraso} verAtrasos={verAtrasos} />
        </div>
      )}
      <MaisGraficos aberto={mais} aoAlternar={alternar}>
        {total > 0 && (
          <>
            <Barras titulo="Valor por comercial" barras={valorPorComercial(F)} total={total} aoAgir={aoAgir} frase={(b) => `Todos os negócios são do ${b.rotulo}.`} />
            <Barras titulo="Negócios por faixa de valor" barras={porFaixa(F)} total={total} aoAgir={aoAgir} />
            <Barras titulo="Parados em Orçamento e Proposta" barras={parados} total={totalParados} aoAgir={aoAgir} vazio="Nenhum negócio em Orçamento ou Proposta com estes filtros." />
          </>
        )}
        <Barras titulo="Perdidos por motivo" barras={perdidosPorMotivo(perdidos)} total={perdidos.length} vazio="Nenhum negócio perdido com estes filtros."
          aviso={ignoraResultados(ctx) ? NOTA_RESULTADOS : undefined} />
      </MaisGraficos>
      <p className="text-[15px] text-muted-foreground">
        Exemplo: os números vêm dos mesmos negócios do Quadro, os de exemplo incluídos; a probabilidade de fechar e o tempo parado (desde a entrada em Orçamento ou desde o envio da proposta) são
        derivados dos dados de exemplo. Os ganhos e os perdidos não têm coluna no Quadro, por isso contam-se em todo o período (os perdidos não têm data) e os seus cartões e o gráfico dos perdidos não são clicáveis.
      </p>
    </div>
  );
}
