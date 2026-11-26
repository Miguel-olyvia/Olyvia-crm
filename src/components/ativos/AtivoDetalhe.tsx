/**
 * O detalhe de um ativo (folha lateral). Num COMPRADO: o valor atual em grande com a regra de depreciação em frase simples, a
 * amortização desde a compra (euros e percentagem, barra, meses decorridos e totais, o mês em que acaba), o valor e a vida útil, e
 * os dados. Num ALUGADO: a renda mensal em grande, as datas do contrato e quanto já se pagou, sem valor de compra nem amortização.
 * Nos ativos de Pessoas (e no alugado de estrutura) diz também QUEM paga cada mês: cada pessoa que o teve e a parte da estrutura. O
 * armazém ligado e o valor em produtos aparecem a quem pode. As ações (editar, desativar, reativar) vivem aqui, e só para quem
 * pode. Ligar e desligar uma pessoa saíram: o equipamento atribuído no RH cria o ativo sozinho e devolve-se no RH. Um ativo
 * atribuído a uma pessoa não se desativa (a base recusa com ATV17): diz-se porquê em vez de oferecer o botão.
 */
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { dataPt, euros } from "@/components/rh-exemplo/custo/formato";
import { useAtivoLido } from "@/hooks/ativos/useAtivoLido";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { AmortizacaoAtivo } from "./AmortizacaoAtivo";
import { ArmazemDoAtivoSecao } from "./ArmazemDoAtivoSecao";
import { AvisoAtivo } from "./AvisoAtivo";
import { Linha, Seccao } from "./DetalheBlocos";
import { EtiquetaEstado } from "./EtiquetaEstado";
import { QuemPagaAtivo } from "./QuemPagaAtivo";
import { avisosDoAtivo, contaDoAtivo, ocupacaoParaConta, repartoDoAtivo, resumoAmortizacao } from "./lib/amortizacaoAtivo";
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

/** O topo de um comprado: o valor atual em grande e a regra de depreciação em frase. */
function TopoComprado({ a, mes }: { a: Ativo; mes: string }) {
  const { t } = useTranslation();
  const frase = useFrase();
  const desativado = a.estado === "desativado";
  const atual = valorAtual(a, mes);
  const rotulo = t(desativado ? "ativos.detalhe.valorDesativado" : "ativos.col.valorAtual");
  return (
    <section aria-label={rotulo} className="rounded-lg border bg-muted/40 p-4">
      <p data-testid="detalhe-valor-rotulo" className="text-sm text-muted-foreground">{rotulo}</p>
      <p data-testid="detalhe-valor-atual" className="text-3xl font-semibold tabular-nums">
        {atual === null ? t(motivoSemValor(a) === "porUso" ? "ativos.vida.semVida" : "ativos.vida.indefinida") : euros(atual, "—")}
      </p>
      <p data-testid="detalhe-frase" className="mt-1 text-sm">{frase(fraseDepreciacao(a, mes))}</p>
    </section>
  );
}

/** O topo de um alugado: a renda mensal em grande (um alugado não tem valor atual). */
function TopoAlugado({ a }: { a: Ativo }) {
  const { t } = useTranslation();
  return (
    <section aria-label={t("ativos.detalhe.rendaRotulo")} className="rounded-lg border bg-muted/40 p-4">
      <p className="text-sm text-muted-foreground">{t("ativos.detalhe.rendaRotulo")}</p>
      <p data-testid="detalhe-renda" className="text-3xl font-semibold tabular-nums">{t("ativos.lista.rendaMes", { valor: euros(a.rendaMensal, "—") })}</p>
      <p data-testid="detalhe-frase" className="mt-1 text-sm">{t("ativos.detalhe.rendaFrase")}</p>
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
  const BOTAO = cn("min-h-11", FOCO);
  const pessoa = rhOculto
    ? t("ativos.pessoa.rhOculto")
    : a.atribuicao
      ? (a.atribuicao.entrega ? t("ativos.pessoa.nomeDesde", { nome: a.atribuicao.pessoaNome ?? "—", data: dataPt(a.atribuicao.entrega) }) : (a.atribuicao.pessoaNome ?? "—"))
      : a.ligado ? t("ativos.pessoa.ligado") : t("ativos.pessoa.semAtribuicao");

  return (
    <>
      <SheetHeader className="space-y-2 text-left">
        <SheetTitle className="break-words pr-6">{a.nome}</SheetTitle>
        <SheetDescription>{[t(`ativos.grupo.${a.grupo}`), tipo, alugado ? t("ativos.forma.etiqueta.alugado") : null].filter(Boolean).join(" · ")}</SheetDescription>
        <div className="flex flex-wrap items-center gap-2">
          <EtiquetaEstado estado={estadoDoAtivo(a)} />
          {a.codigo && <span className="text-sm text-muted-foreground">{a.codigo}</span>}
        </div>
      </SheetHeader>

      <div className="mt-6 space-y-6">
        {alugado ? <TopoAlugado a={a} /> : <TopoComprado a={a} mes={mes} />}

        {avisos.map((aviso) => (
          <AvisoAtivo key={aviso} tom="aviso" role="note" data-testid={`detalhe-aviso-${aviso}`}>{t(`ativos.aviso.${aviso}`)}</AvisoAtivo>
        ))}

        {desativado && (
          <p data-testid="detalhe-desativado" className="rounded-md border border-dashed p-3 text-sm">
            {a.desativadoEm ? `${t("ativos.detalhe.desativadoEm", { data: dataPt(a.desativadoEm), motivo })} ` : ""}
            {a.desativadoNota && <span>{a.desativadoNota}</span>}
          </p>
        )}

        {resumo && <AmortizacaoAtivo resumo={resumo} desativado={desativado} />}

        {alugado ? <SeccaoAluguer a={a} pago={pago} /> : <SeccaoValorComprado a={a} mes={mes} />}

        {mostraQuemPaga && conta && (
          <QuemPagaAtivo
            conta={conta} grupo={a.grupo} ocupacoes={ocupacoes} mes={mes} hoje={hoje} rhOculto={rhOculto}
            nomes={lido.aCarregar ? "aCarregar" : lido.falhou ? "falhou" : "ok"}
            podeEntregar={a.grupo === "pessoa" && !rhOculto && !desativado && !a.ligado && !a.atribuicao}
          />
        )}

        <ArmazemDoAtivoSecao ativo={a} podeVerValor={podeVerValorStock} />

        <Seccao titulo={t("ativos.detalhe.seccaoDados")}>
          {!alugado && a.dataCompra && <Linha rotulo={t("ativos.col.compra")} id="detalhe-data-compra">{dataPt(a.dataCompra)}</Linha>}
          {a.grupo === "servico" && <Linha rotulo={t("ativos.col.modelo")} id="detalhe-equipamento">{a.catEquipamento?.nome ?? "—"}</Linha>}
          {a.grupo === "pessoa" && <Linha rotulo={t("ativos.col.pessoa")} id="detalhe-pessoa">{pessoa}</Linha>}
          <Linha rotulo={t("ativos.col.localizacao")} id="detalhe-localizacao">{a.localizacao ?? "—"}</Linha>
          <Linha rotulo={t("ativos.campo.centroCusto")} id="detalhe-centro">{centro}</Linha>
          {a.numSerie && <Linha rotulo={t("ativos.campo.numSerie")} id="detalhe-serie">{a.numSerie}</Linha>}
        </Seccao>

        {a.notas && (
          <section className="space-y-1">
            <h3 className="text-sm font-semibold">{t("ativos.campo.notas")}</h3>
            <p className="whitespace-pre-line text-sm">{a.notas}</p>
          </section>
        )}
      </div>

      {podeEditar && (
        <SheetFooter className="mt-6 flex-col gap-2 sm:flex-col sm:space-x-0">
          {desativado ? (
            <Button type="button" onClick={() => aoReativar(a)} className={BOTAO}>{t("ativos.acao.reativar")}</Button>
          ) : (
            <>
              <Button type="button" onClick={() => aoEditar(a)} className={BOTAO}>{t("ativos.acao.editar")}</Button>
              {a.ligado
                ? <p data-testid="detalhe-desativar-bloqueado" className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">{t("ativos.detalhe.desativarBloqueado")}</p>
                : <Button type="button" variant="outline" onClick={() => aoDesativar(a)} className={BOTAO}>{t("ativos.acao.desativar")}</Button>}
            </>
          )}
        </SheetFooter>
      )}
    </>
  );
}

export function AtivoDetalhe({ ativo, aoFechar, aoFecharFoco, ...resto }: Props) {
  return (
    <Sheet open={ativo !== null} onOpenChange={(aberto) => !aberto && aoFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md" onCloseAutoFocus={aoFecharFoco}>
        {ativo && <DetalheDoAtivo a={ativo} {...resto} />}
      </SheetContent>
    </Sheet>
  );
}
