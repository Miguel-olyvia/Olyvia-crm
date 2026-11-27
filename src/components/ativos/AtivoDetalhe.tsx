/**
 * O detalhe de um ativo (folha lateral larga; no telemóvel ocupa o ecrã inteiro, com os botões fixos em baixo). Num COMPRADO: o valor
 * atual em grande com a regra de depreciação em frase simples, a linha de vida desenhada (compra, hoje, fim), a amortização desde a
 * compra (euros e percentagem, barra, meses decorridos e totais, o mês em que acaba), e em duas colunas o valor e a vida útil, e os
 * dados. Num ALUGADO: a renda mensal em grande, a barra do contrato (início, hoje, fim) e as datas do contrato e quanto já se pagou,
 * sem valor de compra nem amortização. Nos ativos de Pessoas (e no alugado de estrutura) diz também QUEM paga cada mês: a faixa pela
 * ordem do tempo e cada pessoa que o teve, mais a parte da estrutura. O armazém ligado e o valor em produtos aparecem a quem pode. As
 * ações (editar, desativar, reativar) vivem no rodapé, e só para quem pode. Ligar e desligar uma pessoa saíram: o equipamento atribuído
 * no RH cria o ativo sozinho e devolve-se no RH. Um ativo atribuído a uma pessoa não se desativa (a base recusa com ATV17): diz-se
 * porquê em vez de oferecer o botão.
 */
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { dataPt, euros } from "@/components/rh-exemplo/custo/formato";
import { useAtivoLido } from "@/hooks/ativos/useAtivoLido";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { AmortizacaoAtivo } from "./AmortizacaoAtivo";
import { ArmazemDoAtivoSecao } from "./ArmazemDoAtivoSecao";
import { AvisoAtivo } from "./AvisoAtivo";
import { Linha, Seccao, TITULO_SECCAO } from "./DetalheBlocos";
import { EtiquetaEstado } from "./EtiquetaEstado";
import { LinhaDeVida } from "./LinhaDeVida";
import { QuemPagaAtivo } from "./QuemPagaAtivo";
import { avisosDoAtivo, contaDoAtivo, ocupacaoParaConta, repartoDoAtivo, resumoAmortizacao } from "./lib/amortizacaoAtivo";
import { MARCA_VALOR, TOM_GRUPO, iconeDoAtivo, partirTexto } from "./lib/ativosUi";
import { estadoDoAtivo, fraseDepreciacao, motivoSemValor, vidaRestante, type FraseDepreciacao } from "./lib/resumoAtivo";
import type { Ativo, OpcaoCentroCusto } from "./lib/tipos";
import { valorAtual, vidaEfetivaMeses } from "./lib/valorAtivo";

interface Props {
  ativo: Ativo | null;
  /** O mês em que se calcula o valor atual («AAAA-MM»). */
  mes: string;
  /** Hoje (AAAA-MM-DD): o dia de referência do mês a decorrer. */
  hoje: string;
  centrosCusto: readonly OpcaoCentroCusto[];
  rhOculto: boolean;
  podeEditar: boolean;
  /** Tem `inventory.view` e `products.view_cost`: vê o valor em produtos do armazém ligado. */
  podeVerValorStock: boolean;
  aoFechar: () => void;
  /** Ao fechar a folha, devolve o foco a quem a abriu (a página guarda a origem). */
  aoFecharFoco?: (e: Event) => void;
  aoEditar: (a: Ativo) => void;
  aoDesativar: (a: Ativo) => void;
  aoReativar: (a: Ativo) => void;
}

function useFrase() {
  const { t } = useTranslation();
  return (f: FraseDepreciacao): string => {
    switch (f.chave) {
      case "porUso": return t("ativos.frase.porUso");
      case "semVida": return t("ativos.frase.semVida");
      case "semPerda": return t("ativos.frase.semPerda");
      case "perdePouco": return t("ativos.frase.perdePouco", { fim: f.fim });
      case "perdePorMes": return t("ativos.frase.perdePorMes", { valor: euros(f.valor, "—"), fim: f.fim });
      case "aindaNaoComeca": return t("ativos.frase.aindaNaoComeca", { inicio: f.inicio });
      case "completa": return t("ativos.frase.completa", { valor: euros(f.valor, "—") });
      case "desativada": return t("ativos.frase.desativada", { fim: f.fim, valor: euros(f.valor, "—") });
    }
  };
}

type PropsDoAtivo = Omit<Props, "ativo" | "aoFechar" | "aoFecharFoco"> & { a: Ativo };

const NUMERO_GRANDE = "text-4xl font-bold leading-none tracking-tight tabular-nums sm:text-[2.75rem]";

/** O topo de um comprado: o valor atual em grande e a regra de depreciação em frase. */
function TopoComprado({ a, mes }: { a: Ativo; mes: string }) {
  const { t } = useTranslation();
  const frase = useFrase();
  const desativado = a.estado === "desativado";
  const atual = valorAtual(a, mes);
  const rotulo = t(desativado ? "ativos.detalhe.valorDesativado" : "ativos.col.valorAtual");
  return (
    <section aria-label={rotulo}>
      <p data-testid="detalhe-valor-rotulo" className={TITULO_SECCAO}>{rotulo}</p>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <p data-testid="detalhe-valor-atual" className={cn(NUMERO_GRANDE, atual === null && "text-3xl sm:text-4xl")}>
          {atual === null ? t(motivoSemValor(a) === "porUso" ? "ativos.vida.semVida" : "ativos.vida.indefinida") : euros(atual, "—")}
        </p>
        <p data-testid="detalhe-frase" className="text-sm text-muted-foreground">{frase(fraseDepreciacao(a, mes))}</p>
      </div>
    </section>
  );
}

/** O topo de um alugado: a renda mensal em grande (um alugado não tem valor atual). */
function TopoAlugado({ a }: { a: Ativo }) {
  const { t } = useTranslation();
  const [antes, depois] = partirTexto(t("ativos.lista.rendaMes", { valor: MARCA_VALOR }), MARCA_VALOR);
  return (
    <section aria-label={t("ativos.detalhe.rendaRotulo")}>
      <p className={TITULO_SECCAO}>{t("ativos.detalhe.rendaRotulo")}</p>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <p data-testid="detalhe-renda" className="tabular-nums">
          {antes}<span className={NUMERO_GRANDE}>{euros(a.rendaMensal, "—")}</span><span className="text-base font-medium text-muted-foreground">{depois}</span>
        </p>
        <p data-testid="detalhe-frase" className="text-sm text-muted-foreground">{t("ativos.detalhe.rendaFrase")}</p>
      </div>
    </section>
  );
}

function SeccaoValorComprado({ a, mes }: { a: Ativo; mes: string }) {
  const { t } = useTranslation();
  const vida = vidaEfetivaMeses(a);
  const restante = vidaRestante(a, mes);
  const vidaTexto = vida === null
    ? t(motivoSemValor(a) === "porUso" ? "ativos.vida.semVida" : "ativos.vida.indefinida")
    : a.vidaMeses === null
      ? t("ativos.detalhe.vidaDoModelo", { n: vida, anos: a.catEquipamento?.vidaAnos ?? vida / 12 })
      : vida % 12 === 0 ? t("ativos.detalhe.vidaMesesAnos", { n: vida, anos: vida / 12 }) : t("ativos.vida.meses", { n: vida });
  const restanteTexto = !restante
    ? null
    : restante.acabou
      ? t("ativos.detalhe.vidaRestanteAcabou", { fim: restante.fim })
      : restante.meses === 0
        ? t("ativos.detalhe.vidaRestanteUltimo", { fim: restante.fim })
        : t(restante.meses === 1 ? "ativos.detalhe.vidaRestanteUm" : "ativos.detalhe.vidaRestanteValor", { n: restante.meses, fim: restante.fim });
  return (
    <Seccao titulo={t("ativos.detalhe.seccaoValor")}>
      <Linha rotulo={t("ativos.col.valorCompra")} id="detalhe-valor-compra">{euros(a.valorCompra, "—")}</Linha>
      <Linha rotulo={t("ativos.campo.valorResidual")} id="detalhe-residual">{euros(a.valorResidual, "—")}</Linha>
      <Linha rotulo={t("ativos.col.vida")} id="detalhe-vida">{vidaTexto}</Linha>
      {a.vidaOrigem && <Linha rotulo={t("ativos.detalhe.vidaOrigem")} id="detalhe-vida-origem">{t(`ativos.vida.origem.${a.vidaOrigem}`)}</Linha>}
      {restanteTexto && <Linha rotulo={t("ativos.detalhe.vidaRestante")} id="detalhe-vida-restante">{restanteTexto}</Linha>}
      <Linha rotulo={t("ativos.campo.manutencao")} id="detalhe-manutencao">{t("ativos.detalhe.porAno", { valor: euros(a.manutencaoAno, "—") })}</Linha>
    </Seccao>
  );
}

/** As datas do contrato e quanto já se pagou (a renda inteira de cada mês que o contrato tocou, até hoje). */
function SeccaoAluguer({ a, pago }: { a: Ativo; pago: { valor: number; meses: number } | null }) {
  const { t } = useTranslation();
  return (
    <Seccao titulo={t("ativos.detalhe.seccaoAluguer")}>
      <Linha rotulo={t("ativos.aluguer.inicio")} id="detalhe-inicio-aluguer">{a.inicioAluguer ? dataPt(a.inicioAluguer) : "—"}</Linha>
      <Linha rotulo={t("ativos.aluguer.fim")} id="detalhe-fim-aluguer">{a.fimAluguer ? dataPt(a.fimAluguer) : t("ativos.aluguer.semFim")}</Linha>
      {pago && <Linha rotulo={t("ativos.aluguer.meses")} id="detalhe-aluguer-meses">{pago.meses}</Linha>}
      {pago && <Linha rotulo={t("ativos.aluguer.pago")} id="detalhe-aluguer-pago">{euros(pago.valor, "—")}</Linha>}
      <Linha rotulo={t("ativos.campo.manutencao")} id="detalhe-manutencao">{t("ativos.detalhe.porAno", { valor: euros(a.manutencaoAno, "—") })}</Linha>
    </Seccao>
  );
}

function DetalheDoAtivo({ a, mes, hoje, centrosCusto, rhOculto, podeEditar, podeVerValorStock, aoEditar, aoDesativar, aoReativar }: PropsDoAtivo) {
  const { t } = useTranslation();
  // A lista só traz o id da pessoa; o nome vem de `rpc_ativo_ler`, que só se pede quando a ficha é de Pessoas e o RH deixa ver nomes.
  const lido = useAtivoLido(a.id, a.grupo === "pessoa" && !rhOculto);
  const ocupacoes = lido.ativo?.ocupacoes ?? a.ocupacoes;
  const conta = contaDoAtivo(a);
  const alugado = a.forma === "alugado";
  const resumo = conta?.forma === "comprado" ? resumoAmortizacao(conta, mes) : null;
  const pago = conta ? repartoDoAtivo(conta, ocupacoes.map(ocupacaoParaConta), mes, hoje).total : null;
  const mostraQuemPaga = conta !== null && (a.grupo === "pessoa" || (alugado && a.grupo === "estrutura"));
  const avisos = avisosDoAtivo(a, hoje);
  const centro = a.centroCustoId ? (centrosCusto.find((c) => c.id === a.centroCustoId)?.nome ?? "—") : "—";
  const tipo = a.tipo && a.grupo !== "servico" ? t(`ativos.tipo.${a.grupo}.${a.tipo}`) : null;
  const motivo = a.desativadoMotivo ? t(`ativos.desativar.motivo.${a.desativadoMotivo}`).toLowerCase() : "";
  const desativado = a.estado === "desativado";
  const BOTAO = cn("min-h-11 flex-1 rounded-xl px-5 font-semibold sm:flex-none", FOCO);
  const Icone = iconeDoAtivo(a.grupo, a.tipo);
  const pessoa = rhOculto
    ? t("ativos.pessoa.rhOculto")
    : a.atribuicao
      ? (a.atribuicao.entrega ? t("ativos.pessoa.nomeDesde", { nome: a.atribuicao.pessoaNome ?? "—", data: dataPt(a.atribuicao.entrega) }) : (a.atribuicao.pessoaNome ?? "—"))
      : a.ligado ? t("ativos.pessoa.ligado") : t("ativos.pessoa.semAtribuicao");
  const temLinhaDeVida = alugado ? a.inicioAluguer !== null : resumo !== null;

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="space-y-5 px-4 pb-8 pt-6 sm:space-y-6 sm:px-8 sm:pt-8">
          <SheetHeader className="space-y-0 text-left">
            <div className="flex items-start gap-4 pr-8">
              <span aria-hidden="true" className={cn("grid h-14 w-14 shrink-0 place-items-center rounded-2xl", TOM_GRUPO[a.grupo], desativado && "grayscale")}>
                <Icone className="h-7 w-7" />
              </span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <SheetTitle className="break-words text-2xl font-bold tracking-tight">{a.nome}</SheetTitle>
                  <EtiquetaEstado estado={estadoDoAtivo(a)} />
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <SheetDescription>{[t(`ativos.grupo.${a.grupo}`), tipo, alugado ? t("ativos.forma.etiqueta.alugado") : null].filter(Boolean).join(" · ")}</SheetDescription>
                  {a.codigo && <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-primary dark:bg-primary/20 dark:text-violet-300">{a.codigo}</span>}
                </div>
              </div>
            </div>
          </SheetHeader>

          {avisos.map((aviso) => (
            <AvisoAtivo key={aviso} tom="aviso" role="note" data-testid={`detalhe-aviso-${aviso}`}>{t(`ativos.aviso.${aviso}`)}</AvisoAtivo>
          ))}

          {desativado && (
            <p data-testid="detalhe-desativado" className="rounded-xl border border-dashed bg-muted/30 p-3 text-sm">
              {a.desativadoEm ? `${t("ativos.detalhe.desativadoEm", { data: dataPt(a.desativadoEm), motivo })} ` : ""}
              {a.desativadoNota && <span>{a.desativadoNota}</span>}
            </p>
          )}

          <div className="space-y-5 rounded-2xl border bg-muted/30 p-4 sm:p-6">
            {alugado ? <TopoAlugado a={a} /> : <TopoComprado a={a} mes={mes} />}
            {temLinhaDeVida && <LinhaDeVida a={a} mes={mes} resumo={resumo} pago={pago?.valor ?? null} />}
            {resumo && <AmortizacaoAtivo resumo={resumo} desativado={desativado} />}
          </div>

          {mostraQuemPaga && conta && (
            <QuemPagaAtivo
              conta={conta} grupo={a.grupo} ocupacoes={ocupacoes} mes={mes} hoje={hoje} rhOculto={rhOculto}
              nomes={lido.aCarregar ? "aCarregar" : lido.falhou ? "falhou" : "ok"}
              podeEntregar={a.grupo === "pessoa" && !rhOculto && !desativado && !a.ligado && !a.atribuicao}
            />
          )}

          <div className="grid items-start gap-4 md:grid-cols-2">
            {alugado ? <SeccaoAluguer a={a} pago={pago} /> : <SeccaoValorComprado a={a} mes={mes} />}
            <div className="space-y-4">
              <Seccao titulo={t("ativos.detalhe.seccaoDados")}>
                {!alugado && a.dataCompra && <Linha rotulo={t("ativos.col.compra")} id="detalhe-data-compra">{dataPt(a.dataCompra)}</Linha>}
                {a.grupo === "servico" && <Linha rotulo={t("ativos.col.modelo")} id="detalhe-equipamento">{a.catEquipamento?.nome ?? "—"}</Linha>}
                {a.grupo === "pessoa" && <Linha rotulo={t("ativos.col.pessoa")} id="detalhe-pessoa">{pessoa}</Linha>}
                <Linha rotulo={t("ativos.col.localizacao")} id="detalhe-localizacao">{a.localizacao ?? "—"}</Linha>
                <Linha rotulo={t("ativos.campo.centroCusto")} id="detalhe-centro">{centro}</Linha>
                {a.numSerie && <Linha rotulo={t("ativos.campo.numSerie")} id="detalhe-serie">{a.numSerie}</Linha>}
              </Seccao>
              <ArmazemDoAtivoSecao ativo={a} podeVerValor={podeVerValorStock} />
            </div>
          </div>

          {a.notas && (
            <section className="rounded-2xl border bg-card p-4 sm:p-5">
              <h3 className={TITULO_SECCAO}>{t("ativos.campo.notas")}</h3>
              <p className="mt-2 whitespace-pre-line text-sm">{a.notas}</p>
            </section>
          )}
        </div>
      </div>

      {podeEditar && (
        <div className="flex flex-wrap items-center gap-3 border-t bg-background px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:px-8">
          {desativado ? (
            <Button type="button" onClick={() => aoReativar(a)} className={cn(BOTAO, "sm:ml-auto")}>{t("ativos.acao.reativar")}</Button>
          ) : (
            <>
              {a.ligado
                ? <p data-testid="detalhe-desativar-bloqueado" className="min-w-0 basis-full text-xs text-muted-foreground sm:flex-1 sm:basis-auto">{t("ativos.detalhe.desativarBloqueado")}</p>
                : <Button type="button" variant="outline" onClick={() => aoDesativar(a)} className={cn(BOTAO, "sm:ml-auto")}>{t("ativos.acao.desativar")}</Button>}
              <Button type="button" onClick={() => aoEditar(a)} className={BOTAO}>{t("ativos.acao.editar")}</Button>
            </>
          )}
        </div>
      )}
    </>
  );
}

export function AtivoDetalhe({ ativo, aoFechar, aoFecharFoco, ...resto }: Props) {
  return (
    <Sheet open={ativo !== null} onOpenChange={(aberto) => !aberto && aoFechar()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[860px]" onCloseAutoFocus={aoFecharFoco}>
        {ativo && <DetalheDoAtivo a={ativo} {...resto} />}
      </SheetContent>
    </Sheet>
  );
}
