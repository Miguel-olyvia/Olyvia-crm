/**
 * O separador «Custo» da ficha (fluxo 11): quanto custa a pessoa à empresa, no mês escolhido. Mostra o quadro do mês (a
 * retribuição é o total bruto estimado do processamento salarial real), a composição, os equipamentos que a pessoa tem
 * (cada um conta como foi escolhido), os valores avulsos (os lançamentos pontuais do processamento salarial, da base) e os
 * encargos. Só para quem vê salários; a própria pessoa não vê o custo. Equipamentos e taxas dos encargos ainda só existem em memória.
 */
import { Seccao } from "@/components/ficha-comum/Seccao";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { useCusto } from "@/components/rh-exemplo/dados/lojaCusto";
import type { AbaProps } from "@/components/rh-exemplo/ficha/AbasPessoa";
import { useTranslation } from "@/hooks/useTranslation";
import { BarraComposicao } from "./BarraComposicao";
import { CustoAvulsos } from "./CustoAvulsos";
import { CustoEncargos } from "./CustoEncargos";
import { CustoEquipamentos } from "./CustoEquipamentos";
import { CustoResumo } from "./CustoResumo";
import { SeletorMesCusto } from "./SeletorMesCusto";
import { useCustoDaPessoa } from "./useCustoDaPessoa";

export function AbaCusto({ pessoa, ctx }: AbaProps) {
  const { t } = useTranslation();
  const mes = useCusto((e) => e.mes);
  const { custo, aCarregar, retribuicaoRecusada, incompleta, lancamentos } = useCustoDaPessoa(pessoa, mes);
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
      {incompleta && !aCarregar && <p role="status" className="text-sm text-amber-800 dark:text-amber-300">{t("rhProcReal.custo.fichaIncompleta")}</p>}
      {custo && (
        <>
          <CustoResumo custo={custo} />
          <Seccao titulo={t("rhCustos.comp.fichaTitulo")}>
            <BarraComposicao partes={custo.composicao} titulo={t("rhCustos.comp.titulo", { nome: pessoa.nome_completo })} />
          </Seccao>
          <CustoEquipamentos pessoaId={pessoa.id} pessoaNome={pessoa.nome_completo} mes={mes} autor={autor} equipamentos={custo.equipamentos} />
          <CustoAvulsos pessoaId={pessoa.id} avulsos={custo.avulsos} mes={mes} acoes={lancamentos} podeGerir />
          <CustoEncargos pessoaId={pessoa.id} />
        </>
      )}
    </div>
  );
}
