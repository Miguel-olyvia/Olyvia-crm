/**
 * O separador «Custo» da ficha (fluxo 11): quanto custa a pessoa à empresa, no mês escolhido. Mostra o quadro do mês (a
 * retribuição é a do «Cálculo do mês»), a composição, os equipamentos que a pessoa tem (amortização por 36 meses), os valores
 * avulsos (quilómetros e ajudas de custo) e os encargos. Só para quem vê salários; a própria pessoa não vê o custo.
 * Tudo em memória, com os dados de exemplo.
 */
import { Seccao } from "@/components/ficha-comum/Seccao";
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
  const custo = useCustoDaPessoa(pessoa.id, mes);
  const autor = ctx.nomePorPessoaId.get(ctx.minhaPessoaId ?? "") ?? t("rhA.custo.autorOmissao");
  if (!custo) return null;

  return (
    <div className="space-y-4">
      <SeletorMesCusto id="rhCustos-ficha-mes" rotulo={t("rhCustos.mesCusto")} />
      <CustoResumo custo={custo} />
      <Seccao titulo={t("rhCustos.comp.fichaTitulo")}>
        <BarraComposicao partes={custo.composicao} titulo={t("rhCustos.comp.titulo", { nome: pessoa.nome_completo })} />
      </Seccao>
      <CustoEquipamentos pessoaId={pessoa.id} pessoaNome={pessoa.nome_completo} mes={mes} autor={autor} equipamentos={custo.equipamentos} />
      <CustoAvulsos pessoaId={pessoa.id} autor={autor} avulsos={custo.avulsos} podeGerir />
      <CustoEncargos pessoaId={pessoa.id} />
    </div>
  );
}
