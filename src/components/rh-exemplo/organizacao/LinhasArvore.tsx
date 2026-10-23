/**
 * As duas linhas da árvore da organização que não são nós da estrutura: a pessoa (avatar, nome, cargo e chips «Chefia»,
 * «Reporta a» e «Vínculo legal») e «Sem centro atribuído». Clicar na pessoa abre a ficha de RH; a outra só abre e fecha.
 * O chevron (só rato) e o cartão são `div`, nunca botões: o foco e o teclado vivem no `li` da árvore.
 */
import { ChevronRight, UserRoundX, Users } from "lucide-react";
import { ChipChefia, ChipNoutroCentro, ChipReportaA } from "@/components/rh-exemplo/organizacao/Chips";
import { idRotuloNo } from "@/components/rh-exemplo/organizacao/estilosArvore";
import { iniciaisDoNome } from "@/components/rh-exemplo/lib/anexosAdmissao";
import { useTranslation } from "@/hooks/useTranslation";
import type { NoPessoa, NoSemCentro } from "@/components/rh-exemplo/organizacao/tipos";

const CARTAO = "flex min-h-11 min-w-0 flex-1 cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-card px-3 py-2 text-left transition-colors hover:border-primary/50 hover:bg-muted/50 motion-reduce:transition-none";

/** A coluna do chevron: clicável com o rato quando há filhos; um espaço do mesmo tamanho quando não há. */
export function ColunaChevron({ aberto, temFilhos, aoAlternar }: { aberto: boolean; temFilhos: boolean; aoAlternar: () => void }) {
  if (!temFilhos) return <span aria-hidden="true" className="w-8 shrink-0" />;
  return (
    <span
      aria-hidden="true" onClick={aoAlternar}
      className="flex min-h-11 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
    >
      <ChevronRight className={`h-4 w-4 transition-transform motion-reduce:transition-none ${aberto ? "rotate-90" : ""}`} />
    </span>
  );
}

interface LinhaProps<N> {
  no: N;
  aberto: boolean;
  aoAlternar: () => void;
}

export function LinhaPessoaArvore({ no, aberto, aoAlternar, aoAbrirPessoa }: LinhaProps<NoPessoa> & { aoAbrirPessoa: (pessoaId: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-stretch gap-1">
      <ColunaChevron aberto={aberto} temFilhos={no.filhos.length > 0} aoAlternar={aoAlternar} />
      <div id={idRotuloNo(no.id)} onClick={() => aoAbrirPessoa(no.pessoaId)} className={CARTAO}>
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 select-none items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-xs font-semibold text-foreground"
        >
          {iniciaisDoNome(no.nome)}
        </span>
        <span className="flex min-w-0 flex-1 basis-40 flex-col">
          <span className="truncate text-sm font-medium">{no.nome}</span>
          <span className="truncate text-xs text-muted-foreground">{no.cargo ?? "—"}</span>
        </span>
        {no.chefia && <ChipChefia />}
        {no.reportaA && <ChipReportaA nome={no.reportaA} />}
        {no.vinculo && <ChipNoutroCentro texto={t("rhOrg.vinculoDe", { filial: no.vinculo })} />}
      </div>
    </div>
  );
}

export function LinhaSemCentroArvore({ no, aberto, aoAlternar }: LinhaProps<NoSemCentro>) {
  const { t } = useTranslation();
  return (
    <div className="flex items-stretch gap-1">
      <ColunaChevron aberto={aberto} temFilhos={no.filhos.length > 0} aoAlternar={aoAlternar} />
      <div id={idRotuloNo(no.id)} onClick={aoAlternar} className={`${CARTAO} border-dashed`}>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
          <UserRoundX className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 basis-40 truncate text-sm font-medium">{t("rhOrg.semCentro")}</span>
        <span className="inline-flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground">
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          {t(no.total === 1 ? "rhOrg.pessoas.um" : "rhOrg.pessoas.n", { n: no.total })}
        </span>
      </div>
    </div>
  );
}
