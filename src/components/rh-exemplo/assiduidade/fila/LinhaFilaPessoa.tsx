/**
 * Uma pessoa com pendencias na fila de trabalho: avatar, nome, contadores por tipo (cor, icone E texto), total, o item mais
 * antigo e o selo «Fecha em N dias». A linha toda e UM botao que abre o painel da pessoa; o nome acessivel diz tudo
 * («Ana Silva, 4 pendencias: 2 horas extra e 2 alertas, mais antigo ha 24 dias, abrir»).
 */
import { ChevronRight, Clock } from "lucide-react";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { dataCurta } from "@/components/rh-exemplo/fluxosC/formatosC";
import { TIPOS_FILA, type PessoaNaFila } from "@/components/rh-exemplo/hooks/useFilaDeTrabalho";
import { diasDesdeEnvio } from "@/components/rh-exemplo/lib/justificacaoDia";
import { iniciaisDoNome } from "@/components/rh-exemplo/lib/anexosAdmissao";
import { EtiquetaDoTipo, textoDaContagem, textoDasPendencias, textoDeHaQuanto, type Traduzir } from "./aspectoTipoFila";

interface LinhaFilaPessoaProps {
  pessoa: PessoaNaFila;
  hoje: string;
  aoAbrir: (pessoa: PessoaNaFila) => void;
}

/** «2 horas extra, 1 justificação»: so os tipos com pendencias. */
export function resumoDasContagens(t: Traduzir, pessoa: PessoaNaFila): string {
  return TIPOS_FILA.filter((tipo) => pessoa.contagem[tipo] > 0)
    .map((tipo) => textoDaContagem(t, tipo, pessoa.contagem[tipo]))
    .join(", ");
}

export function LinhaFilaPessoa({ pessoa, hoje, aoAbrir }: LinhaFilaPessoaProps) {
  const { t } = useTranslation();
  const dias = diasDesdeEnvio(pessoa.maisAntigo, hoje);
  const antigo = t("rhFila.maisAntigo", { data: dataCurta(pessoa.maisAntigo), quando: textoDeHaQuanto(t, dias) });
  const fecha =
    pessoa.fechaEmDias === null
      ? null
      : pessoa.fechaEmDias === 0
        ? t("rhFila.fecha.hoje")
        : t(pessoa.fechaEmDias === 1 ? "rhFila.fecha.um" : "rhFila.fecha.varios", { n: String(pessoa.fechaEmDias) });

  return (
    <li>
      <button
        type="button"
        data-fila-pessoa={pessoa.pessoaId}
        aria-haspopup="dialog"
        aria-label={t("rhFila.linha.aria", {
          nome: pessoa.nome,
          resumo: `${textoDasPendencias(t, pessoa.total)}: ${resumoDasContagens(t, pessoa)}`,
          antigo,
          // A informacao mais urgente tambem entra no nome acessivel (que substitui o conteudo visivel).
          fecha: fecha ? `, ${fecha}` : "",
        })}
        onClick={() => aoAbrir(pessoa)}
        className={cn(
          "flex min-h-11 w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-md px-3 py-3 text-left text-sm hover:bg-muted/50",
          FOCO,
        )}
      >
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 select-none items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-xs font-semibold text-foreground"
        >
          {iniciaisDoNome(pessoa.nome)}
        </span>
        <span className="min-w-40 flex-1 basis-40 font-medium">{pessoa.nome}</span>
        <span className="flex flex-wrap items-center gap-1.5">
          {TIPOS_FILA.filter((tipo) => pessoa.contagem[tipo] > 0).map((tipo) => (
            <EtiquetaDoTipo key={tipo} tipo={tipo} texto={textoDaContagem(t, tipo, pessoa.contagem[tipo])} />
          ))}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium tabular-nums text-foreground">{textoDasPendencias(t, pessoa.total)}</span>
          <span className="tabular-nums">{antigo}</span>
          {fecha && (
            <span className="inline-flex items-center gap-1 rounded-full border border-destructive/50 bg-destructive/10 px-2 py-0.5 font-medium text-destructive">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {fecha}
            </span>
          )}
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </button>
    </li>
  );
}
