/**
 * O detalhe de um ativo (folha lateral): o valor atual em grande com a regra de depreciação em frase simples, e por baixo tudo o
 * que a lista esconde, com números exatos, unidades e datas claras (valor de compra, residual, vida útil e vida restante, manutenção
 * por ano, data de compra, localização, centro de custo, número de série, notas, equipamento do catálogo ou pessoa). Num ativo
 * desativado o valor é o «à data da desativação». As ações (editar, desativar, reativar, ligar a pessoa, desligar) vivem aqui, e só
 * para quem pode. Um ativo atribuído a uma pessoa não se desativa (a base recusa com ATV17): diz-se porquê em vez de oferecer o botão.
 */
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { dataPt, euros } from "@/components/rh-exemplo/custo/formato";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { EtiquetaEstado } from "./EtiquetaEstado";
import { estadoDoAtivo, fraseDepreciacao, motivoSemValor, vidaRestante, type FraseDepreciacao } from "./lib/resumoAtivo";
import type { Ativo, OpcaoCentroCusto } from "./lib/tipos";
import { valorAtual, vidaEfetivaMeses } from "./lib/valorAtivo";

interface Props {
  ativo: Ativo | null;
  /** O mês em que se calcula o valor atual («AAAA-MM»). */
  mes: string;
  centrosCusto: readonly OpcaoCentroCusto[];
  rhOculto: boolean;
  podeEditar: boolean;
  /** `ativos.edit` e `hr.pessoas.retribuicao.edit`. */
  podeLigar: boolean;
  aoFechar: () => void;
  /** Ao fechar a folha, devolve o foco a quem a abriu (a página guarda a origem). */
  aoFecharFoco?: (e: Event) => void;
  aoEditar: (a: Ativo) => void;
  aoDesativar: (a: Ativo) => void;
  aoReativar: (a: Ativo) => void;
  aoLigar: (a: Ativo) => void;
  aoDesligar: (a: Ativo) => void;
}

function Linha({ rotulo, id, children }: { rotulo: string; id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b py-2.5 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="text-sm text-muted-foreground">{rotulo}</dt>
      <dd data-testid={id} className="min-w-0 break-words text-sm font-medium tabular-nums sm:text-right">{children}</dd>
    </div>
  );
}

function Seccao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      <dl>{children}</dl>
    </section>
  );
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

function DetalheDoAtivo({ a, mes, centrosCusto, rhOculto, podeEditar, podeLigar, aoEditar, aoDesativar, aoReativar, aoLigar, aoDesligar }: PropsDoAtivo) {
  const { t } = useTranslation();
  const frase = useFrase();
  const atual = valorAtual(a, mes);
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
  const centro = a.centroCustoId ? (centrosCusto.find((c) => c.id === a.centroCustoId)?.nome ?? "—") : "—";
  const tipo = a.tipo && a.grupo !== "servico" ? t(`ativos.tipo.${a.grupo}.${a.tipo}`) : null;
  const motivo = a.desativadoMotivo ? t(`ativos.desativar.motivo.${a.desativadoMotivo}`).toLowerCase() : "";
  const desativado = a.estado === "desativado";
  const ligacao = a.grupo === "pessoa" && podeLigar && !rhOculto && !desativado;
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
        <SheetDescription>{[t(`ativos.grupo.${a.grupo}`), tipo].filter(Boolean).join(" · ")}</SheetDescription>
        <div className="flex flex-wrap items-center gap-2">
          <EtiquetaEstado estado={estadoDoAtivo(a)} />
          {a.codigo && <span className="text-sm text-muted-foreground">{a.codigo}</span>}
        </div>
      </SheetHeader>

      <div className="mt-6 space-y-6">
        <section aria-label={t(desativado ? "ativos.detalhe.valorDesativado" : "ativos.col.valorAtual")} className="rounded-lg border bg-muted/40 p-4">
          <p data-testid="detalhe-valor-rotulo" className="text-sm text-muted-foreground">{t(desativado ? "ativos.detalhe.valorDesativado" : "ativos.col.valorAtual")}</p>
          <p data-testid="detalhe-valor-atual" className="text-3xl font-semibold tabular-nums">
            {atual === null ? t(motivoSemValor(a) === "porUso" ? "ativos.vida.semVida" : "ativos.vida.indefinida") : euros(atual, "—")}
          </p>
          <p data-testid="detalhe-frase" className="mt-1 text-sm">{frase(fraseDepreciacao(a, mes))}</p>
        </section>

        {desativado && (
          <p data-testid="detalhe-desativado" className="rounded-md border border-dashed p-3 text-sm">
            {a.desativadoEm ? `${t("ativos.detalhe.desativadoEm", { data: dataPt(a.desativadoEm), motivo })} ` : ""}
            {a.desativadoNota && <span>{a.desativadoNota}</span>}
          </p>
        )}

        <Seccao titulo={t("ativos.detalhe.seccaoValor")}>
          <Linha rotulo={t("ativos.col.valorCompra")} id="detalhe-valor-compra">{euros(a.valorCompra, "—")}</Linha>
          <Linha rotulo={t("ativos.campo.valorResidual")} id="detalhe-residual">{euros(a.valorResidual, "—")}</Linha>
          <Linha rotulo={t("ativos.col.vida")} id="detalhe-vida">{vidaTexto}</Linha>
          {restanteTexto && <Linha rotulo={t("ativos.detalhe.vidaRestante")} id="detalhe-vida-restante">{restanteTexto}</Linha>}
          <Linha rotulo={t("ativos.campo.manutencao")} id="detalhe-manutencao">{t("ativos.detalhe.porAno", { valor: euros(a.manutencaoAno, "—") })}</Linha>
        </Seccao>

        <Seccao titulo={t("ativos.detalhe.seccaoDados")}>
          <Linha rotulo={t("ativos.col.compra")} id="detalhe-data-compra">{dataPt(a.dataCompra)}</Linha>
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
              {ligacao && a.ligado && a.atribuicao && <Button type="button" variant="outline" onClick={() => aoDesligar(a)} className={BOTAO}>{t("ativos.acao.desligar")}</Button>}
              {ligacao && !a.ligado && <Button type="button" variant="outline" onClick={() => aoLigar(a)} className={BOTAO}>{t("ativos.acao.ligar")}</Button>}
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
