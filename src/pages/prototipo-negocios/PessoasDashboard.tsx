// O dashboard de Pessoas: os cartões de métricas e quatro gráficos (o resto atrás de "Mais gráficos"), sobre as mesmas pessoas e os mesmos filtros da lista.
// Tudo é clicável: o cartão ou a barra junta o filtro correspondente e muda para a Lista. Cada gráfico tem a sua tabela ("Ver como tabela").
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SeparadorLista } from "./pessoasDocs";
import type { FiltrosP, LinhaP } from "./filtrosPessoas";
import {
  acaoEntradas, cartoesPessoas, entradasPorDia, funil, motivosDaPerda, notaDoCartao, populacao, porDistrito, porFormulario, porOrigemECanal, porResultado, porTipo,
  type AcaoP, type BarraP,
} from "./dashboardPessoas";
import { valorCartao } from "./graficosTipos";
import { BORDA_CTRL } from "./PessoaLinha";
import { BarrasH, LinhaBarra } from "./BarrasH";
import { MaisGraficos, useMaisGraficos } from "./MaisGraficos";
import { CaixaGrafico } from "./CaixaGrafico";
import { Funil } from "./Funil";
import { GrelhaKpi, Kpi } from "./Kpi";
import { TabelaAlternativa, linhasDeBarras } from "./TabelaAlternativa";
import { Tendencia } from "./Tendencia";

export interface DashboardProps {
  linhas: readonly LinhaP[];
  aba: SeparadorLista;
  f: FiltrosP;
  /** Aplica a ação de um cartão ou de uma barra (junta filtros, eventualmente muda de separador) e muda para a Lista. */
  /** O nome serve para avisar "Lista filtrada por ...". */
  aoAgir: (acao: AcaoP, rotulo: string) => void;
  limpar: () => void;
}

const pessoas = (n: number): string => (n === 1 ? "1 pessoa" : `${n} pessoas`);

type Aoagir = (a: AcaoP, rotulo: string) => void;

/** O nome acessível do botão de uma barra: o filtro que aplica e quantas pessoas dá ("Filtrar por Lisboa: 10 pessoas"). */
const rotuloBarra = (b: BarraP): string => `Filtrar por ${b.rotulo}: ${pessoas(b.n)}`;

/** O gráfico de barras mais comum: título, total, barras e tabela. */
function Barras({ titulo, barras, total, aoAgir, nome }: { titulo: string; barras: readonly BarraP[]; total: number; aoAgir: Aoagir; nome?: string }) {
  return (
    <CaixaGrafico titulo={titulo} numero={pessoas(total)} vazio={barras.length ? undefined : "Nenhuma pessoa com estes filtros."}
      grafico={<BarrasH nome={nome ?? titulo} barras={barras} total={total} aoEscolher={aoAgir} acaoRotulo={rotuloBarra} />}
      tabela={<TabelaAlternativa legenda={titulo} colunas={["Valor", "Pessoas", "Percentagem"]} linhas={linhasDeBarras(barras, total)} total={["Total", total, total > 0 ? "100 %" : "0 %"]} />} />
  );
}

function FunilCaixa({ F, f, aoAgir }: { F: readonly LinhaP[]; f: FiltrosP; aoAgir: Aoagir }) {
  const etapas = funil(F, f);
  return (
    <CaixaGrafico titulo="Funil por etapa" numero={`${pessoas(F.length)} · ${etapas[4].chegaram} já são clientes`} vazio={F.length ? undefined : "Nenhuma pessoa com estes filtros."}
      grafico={<Funil etapas={etapas} aoEscolher={aoAgir} acaoRotulo={(e) => `Filtrar por já chegou a ${e.rotulo}: ${pessoas(e.chegaram)}`} />}
      tabela={<TabelaAlternativa legenda="Funil por etapa" colunas={["Etapa", "Já chegaram", "Estão agora", "Do passo anterior"]}
        linhas={etapas.map((e) => [e.rotulo, e.chegaram, e.agora, e.passagem === null ? "—" : `${e.passagem} %`])} />} />
  );
}

function EntradasCaixa({ F, f, aoAgir }: { F: readonly LinhaP[]; f: FiltrosP; aoAgir: Aoagir }) {
  const { pontos, total } = entradasPorDia(F);
  const topo = pontos.reduce((a, p) => (p.n > a.n ? p : a), pontos[0]);
  const resumo = `${pessoas(total)} nos últimos 30 dias, de ${pontos[0].rotulo} a ${pontos[pontos.length - 1].rotulo}${total ? `; o dia com mais entradas foi ${topo.rotulo}, com ${topo.n}` : ""}`;
  return (
    <CaixaGrafico titulo="Entradas por dia" numero={`${pessoas(total)} nos últimos 30 dias`} vazio={total ? undefined : "Ninguém entrou nos últimos 30 dias com estes filtros."}
      grafico={(
        <>
          <Tendencia pontos={pontos} resumo={resumo} topo={topo} />
          <Button type="button" variant="outline" className={cn("mt-2 min-h-11 cursor-pointer text-[15px]", BORDA_CTRL)} onClick={() => aoAgir(acaoEntradas(f), "os últimos 30 dias")}>
            Ver estas {pessoas(total)} na lista
          </Button>
        </>
      )}
      tabela={<TabelaAlternativa legenda="Entradas por dia nos últimos 30 dias (só os dias com entradas)" colunas={["Dia", "Entradas"]}
        linhas={pontos.filter((p) => p.n > 0).map((p) => [p.rotulo, p.n])} total={["Total", total]} />} />
  );
}

function OrigemCaixa({ F, aoAgir }: { F: readonly LinhaP[]; aoAgir: Aoagir }) {
  const grupos = porOrigemECanal(F), total = F.length;
  return (
    <CaixaGrafico titulo="Origem, por canal" numero={pessoas(total)} vazio={total ? undefined : "Nenhuma pessoa com estes filtros."}
      grafico={(
        <div className="grid gap-3">
          {grupos.map((g) => (
            <div key={g.canal}>
              <ul aria-label={`Canal ${g.canal}`} className="grid">
                <LinhaBarra rotulo={`Canal: ${g.canal}`} texto={`${g.n} · ${Math.round((100 * g.n) / total)} %`} largura={(100 * g.n) / grupos[0].n} destaque={g === grupos[0]}
                  acaoRotulo={`Filtrar por o canal ${g.canal}: ${pessoas(g.n)}`} aoClicar={() => aoAgir(g.acao, `o canal ${g.canal}`)} />
              </ul>
              <div className="ml-4"><BarrasH nome={`Origens do canal ${g.canal}`} barras={g.barras} total={total} aoEscolher={aoAgir} acaoRotulo={rotuloBarra} /></div>
            </div>
          ))}
        </div>
      )}
      tabela={<TabelaAlternativa legenda="Origem, por canal" colunas={["Origem", "Canal", "Pessoas", "Percentagem"]}
        linhas={grupos.flatMap((g) => g.barras.map((b) => [b.rotulo, g.canal, b.n, `${Math.round((100 * b.n) / total)} %`]))} total={["Total", "", total, "100 %"]} />} />
  );
}

function PerdaCaixa({ linhas, aba, f, aoAgir }: { linhas: readonly LinhaP[]; aba: SeparadorLista; f: FiltrosP; aoAgir: Aoagir }) {
  const { barras, total } = motivosDaPerda(linhas, aba, f);
  return (
    <CaixaGrafico titulo="Perdidas com estes filtros" numero={`${pessoas(total)} · a Lista só as mostra com o estado Perdidas`} vazio={total ? undefined : "Nenhuma pessoa perdida com estes filtros."}
      grafico={<BarrasH nome="Perdidas com estes filtros, por motivo" barras={barras} total={total} aoEscolher={aoAgir} acaoRotulo={rotuloBarra} />}
      tabela={<TabelaAlternativa legenda="Perdidas com estes filtros, por motivo" colunas={["Motivo", "Pessoas", "Percentagem"]} linhas={linhasDeBarras(barras, total)} total={["Total", total, "100 %"]} />} />
  );
}

/** Os cartões de métricas, que mudam com o separador. */
function Cartoes({ linhas, aba, f, aoAgir }: Omit<DashboardProps, "limpar">) {
  const nomes = { leads: "Números das leads", clientes: "Números dos clientes", todos: "Números de todas as pessoas" };
  return (
    <GrelhaKpi nome={nomes[aba]}>
      {cartoesPessoas(linhas, aba, f).map((c) => (
        <Kpi key={c.id} rotulo={c.rotulo} valor={valorCartao(c)} nota={notaDoCartao(c, aba, linhas, f)} acaoRotulo={c.acaoRotulo} aoClicar={() => aoAgir(c.acao ?? {}, c.rotulo)} />
      ))}
    </GrelhaKpi>
  );
}

export function PessoasDashboard({ linhas, aba, f, aoAgir, limpar }: DashboardProps) {
  const [mais, alternar] = useMaisGraficos("pessoas");
  const F = populacao(linhas, aba, f);
  if (F.length === 0) {
    return (
      <div className="m-4 grid gap-2 border-t border-border pt-4">
        <p className="text-base font-medium">Nenhuma pessoa com estes filtros.</p>
        <p className="text-[15px] text-muted-foreground">Experimenta tirar um filtro ou mudar de separador.</p>
        <div><Button type="button" variant="outline" className={cn("min-h-11 cursor-pointer text-[15px]", BORDA_CTRL)} onClick={limpar}>Limpar filtros</Button></div>
      </div>
    );
  }
  const total = F.length;
  return (
    <div className="grid gap-4 px-4 pt-4 pb-24 lg:pb-6">
      <h2 className="sr-only">Dashboard de pessoas</h2>
      <Cartoes linhas={linhas} aba={aba} f={f} aoAgir={aoAgir} />
      <div className="grid gap-4 lg:grid-cols-2">
        <FunilCaixa F={F} f={f} aoAgir={aoAgir} />
        <EntradasCaixa F={F} f={f} aoAgir={aoAgir} />
        <Barras titulo="Por formulário" barras={porFormulario(F)} total={total} aoAgir={aoAgir} />
        <Barras titulo="Por distrito" barras={porDistrito(F)} total={total} aoAgir={aoAgir} />
      </div>
      <MaisGraficos aberto={mais} aoAlternar={alternar}>
        <OrigemCaixa F={F} aoAgir={aoAgir} />
        <Barras titulo="Resultado do último contacto" barras={porResultado(F)} total={total} aoAgir={aoAgir} />
        <PerdaCaixa linhas={linhas} aba={aba} f={f} aoAgir={aoAgir} />
        <Barras titulo="Pessoa ou empresa" barras={porTipo(F)} total={total} aoAgir={aoAgir} />
      </MaisGraficos>
      <p className="text-[15px] text-muted-foreground">
        Exemplo: os números vêm das mesmas pessoas da lista, as de exemplo incluídas (a data de chegada, a origem, a qualificação e o resultado do contacto são inventados). Carrega num cartão ou numa barra para ver essas pessoas na lista.
      </p>
    </div>
  );
}
