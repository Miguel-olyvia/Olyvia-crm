/**
 * O separador «Custo» da ficha (fluxo 11): quanto custa a pessoa à empresa, no mês escolhido, e só isso. Mostra o título do mês e as contas
 * passo a passo até ao custo total (a retribuição é o total bruto estimado do processamento salarial real), os equipamentos que a pessoa tem
 * (cada um conta como foi escolhido), os valores avulsos (os lançamentos manuais do processamento salarial, da base) e a
 * taxa desta pessoa. Num mês fechado, as horas e a retribuição são as gravadas no fecho (sem valores gravados, avisa e não recalcula). Só para quem vê salários (`hr.pessoas.retribuicao.view`); a própria pessoa não vê o custo. Atribuir, devolver, alterar a conta
 * e guardar taxas pedem também `hr.pessoas.retribuicao.edit`. Equipamentos, taxas e exceções vêm da base; enquanto não chegam mostra-se «a calcular».
 */
import { Seccao } from "@/components/ficha-comum/Seccao";
import { Button } from "@/components/ui/button";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { useCusto } from "@/components/rh-exemplo/dados/lojaCusto";
import type { AbaProps } from "@/components/rh-exemplo/ficha/AbasPessoa";
import { useTranslation } from "@/hooks/useTranslation";
import { CustoAvulsos } from "./CustoAvulsos";
import { CustoContas } from "./CustoContas";
import { CustoEncargos } from "./CustoEncargos";
import { CustoEquipamentos } from "./CustoEquipamentos";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { euros, chaveRazaoSemValor, nomeDoMes } from "./formato";
import { SeletorMesCusto } from "./SeletorMesCusto";
import { useCustoDaPessoa } from "./useCustoDaPessoa";

/** `aoMudarAba` abre outra aba da ficha (a da retribuição, em «Contratos», para «Definir retribuição»). */
export function AbaCusto({ pessoa, ctx, aoMudarAba }: AbaProps & { aoMudarAba?: (aba: string) => void }) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const mes = useCusto((e) => e.mes);
  const { custo, aCarregar, retribuicaoRecusada, erroBase, podeEditar, incompleta, lancamentos, fechado, semValoresGravados } = useCustoDaPessoa(pessoa, mes);
  const autor = ctx.nomePorPessoaId.get(ctx.minhaPessoaId ?? "") ?? t("rhA.custo.autorOmissao");

  return (
    <div className="space-y-4">
      <SeletorMesCusto id="rhCustos-ficha-mes" rotulo={t("rhCustos.mesCusto")} />
      {retribuicaoRecusada && <p role="status" className="text-sm text-amber-800 dark:text-amber-300">{t("rhProcReal.custo.fichaSemPermissao")}</p>}
      {!retribuicaoRecusada && aCarregar && (
        <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <OlyviaLoader size={16} />{t("rhProcReal.custo.fichaACalcular")}
        </div>
      )}
      {erroBase && !retribuicaoRecusada && <p role="alert" className="text-sm text-destructive">{t("rhCustos.base.erro", { erro: erroBase })}</p>}
      {fechado && !retribuicaoRecusada && <p role="status" className="text-sm text-muted-foreground">{t("rhCustoFecho.nota")}</p>}
      {semValoresGravados && !retribuicaoRecusada && <p role="status" className="text-sm text-amber-800 dark:text-amber-300">{t("rhCustoFecho.semValoresPessoa")}</p>}
      {!retribuicaoRecusada && custo?.estimadoPeloCargo && (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          <p>{t("rhCustoEstimativa.nota", { cargo: custo.estimadoPeloCargo.cargo, valor: euros(custo.estimadoPeloCargo.salario, "") })}</p>
          {podeEditar && aoMudarAba && <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => aoMudarAba("contratos")}>{t("rhCustoEstimativa.definir")}</Button>}
        </div>
      )}
      {!retribuicaoRecusada && custo?.razaoSemValor && <p role="status" className="text-sm text-amber-800 dark:text-amber-300">{t(chaveRazaoSemValor(custo.razaoSemValor))}</p>}
      {incompleta && !aCarregar && <p role="status" className="text-sm text-amber-800 dark:text-amber-300">{t("rhProcReal.custo.fichaIncompleta")}</p>}
      {custo && (
        <>
          <Seccao titulo={t("rhA.custo.mesTitulo", { mes: nomeDoMes(custo.mes, language) })} marca={custo.atual.total === null && <Badge variant="outline" className="font-normal">{t("rhA.custo.semSalario")}</Badge>}>
            <CustoContas custo={custo} nome={pessoa.nome_completo} fechado={fechado} />
          </Seccao>
          <CustoEquipamentos pessoaId={pessoa.id} pessoaNome={pessoa.nome_completo} mes={mes} autor={autor} equipamentos={custo.equipamentos} podeGerir={podeEditar} />
          <CustoAvulsos pessoaId={pessoa.id} avulsos={custo.avulsos} mes={mes} acoes={lancamentos} podeGerir={podeEditar} />
          <CustoEncargos pessoaId={pessoa.id} podeGerir={podeEditar} />
        </>
      )}
    </div>
  );
}
