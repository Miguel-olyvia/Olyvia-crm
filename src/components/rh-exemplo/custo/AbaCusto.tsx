/**
 * O separador «Custo» da ficha (fluxo 11): quanto custa a pessoa à empresa. Tudo em memória, com os dados de exemplo.
 * Há duas vistas: a do RH (quem vê salários: custo, encargos, valores avulsos) e a «visão da pessoa», em que a própria
 * pessoa vê só os seus valores avulsos, para conferir os quilómetros, sem encargos nem custo total.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import type { AbaProps } from "@/components/rh-exemplo/ficha/AbasPessoa";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { CustoAvulsos } from "./CustoAvulsos";
import { CustoEncargos } from "./CustoEncargos";
import { CustoResumo } from "./CustoResumo";
import { useCustoDaPessoa } from "./useCustoDaPessoa";

type Visao = "rh" | "pessoa";

function SeletorDeVisao({ visao, aoMudar }: { visao: Visao; aoMudar: (v: Visao) => void }) {
  const { t } = useTranslation();
  return (
    <div role="group" aria-label={t("rhA.custo.visao")} className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">{t("rhA.custo.visao")}</span>
      {(["rh", "pessoa"] as const).map((v) => (
        <Button
          key={v} type="button" size="sm" variant={visao === v ? "default" : "outline"} aria-pressed={visao === v}
          onClick={() => aoMudar(v)} className={cn("min-h-11", FOCO)}
        >
          {visao === v && <span aria-hidden="true" className="mr-1">✓</span>}
          {t(`rhA.custo.visao.${v}`)}
        </Button>
      ))}
    </div>
  );
}

export function AbaCusto({ ficha, pessoa, ctx }: AbaProps) {
  const { t } = useTranslation();
  const [visao, setVisao] = useState<Visao>("rh");
  const custo = useCustoDaPessoa({
    pessoaId: pessoa.id, admissao: pessoa.data_admissao, retribuicao: ficha.retribuicao, horasSemanais: ctx.horasContratadasSemanais,
  });
  const autor = ctx.nomePorPessoaId.get(ctx.minhaPessoaId ?? "") ?? t("rhA.custo.autorOmissao");
  const rh = visao === "rh";

  return (
    <div className="space-y-4">
      <SeletorDeVisao visao={visao} aoMudar={setVisao} />
      {!rh && <p className="rounded-md bg-muted/50 p-3 text-sm" role="status">{t("rhA.custo.visaoPessoaAjuda", { nome: pessoa.nome_completo })}</p>}
      {rh && <CustoResumo custo={custo} />}
      <CustoAvulsos pessoaId={pessoa.id} autor={autor} avulsos={custo.avulsos} podeGerir={rh} />
      {rh && <CustoEncargos pessoaId={pessoa.id} />}
    </div>
  );
}
