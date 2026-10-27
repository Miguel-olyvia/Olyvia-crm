// Uma linha compacta (cerca de 45 px) da lista de pessoas de RH, como a lista de Pessoas: avatar, nome (o botão que abre a
// ficha, com alvo de 44 px sem aumentar a linha), e-mail, cargo, centro, entrada e os selos de estado (acesso e contrato),
// sempre em texto. A linha toda também abre ao clicar; o botão do nome é só para teclado e leitor de ecrã.
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { EstadoAdmissaoDaPessoa } from "@/components/rh-exemplo/admissao/EstadoAdmissaoDaPessoa";
import { iniciaisDoNome } from "@/components/rh-exemplo/lib/anexosAdmissao";
import type { PessoaListItem } from "@/components/rh-exemplo/tipos";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import type { EstadoAdmissao } from "@/components/rh-exemplo/hooks/aspectoSelosAdmissao";

interface LinhaPessoaRhProps {
  pessoa: PessoaListItem;
  /** O nome do centro de trabalho, já resolvido (ou `null`). */
  local: string | null;
  comContrato: boolean;
  aberta: boolean;
  aoAbrir: (id: string) => void;
  /** O estado do processo de admissão mais recente da pessoa (da lista real), ou `undefined` se não houver. */
  estadoAdmissao?: EstadoAdmissao;
}

const CELULA = "px-3 py-1 align-middle text-sm";

function Vazio({ rotulo }: { rotulo: string }) {
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className="sr-only">{rotulo}</span>
    </>
  );
}

export function LinhaPessoaRh({ pessoa, local, comContrato, aberta, aoAbrir, estadoAdmissao }: LinhaPessoaRhProps) {
  const { t } = useTranslation();
  const vazio = <Vazio rotulo={t("rhForm.lista.semValor")} />;
  return (
    <TableRow
      data-pessoa-id={pessoa.id} data-state={aberta ? "selected" : undefined} className="cursor-pointer"
      onClick={(e) => {
        e.currentTarget.querySelector<HTMLElement>("[data-linha-pessoa]")?.focus();
        aoAbrir(pessoa.id);
      }}
    >
      <TableCell className={CELULA}>
        <span className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 select-none items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-xs font-semibold text-foreground"
          >
            {iniciaisDoNome(pessoa.nome_completo)}
          </span>
          <span className="flex min-w-0 flex-col">
            <button
              type="button" data-linha-pessoa={pessoa.id} aria-label={t("rhForm.lista.abrir", { nome: pessoa.nome_completo })}
              className={cn(
                "relative w-fit rounded-sm text-left text-sm font-medium leading-5 text-foreground hover:underline",
                "after:absolute after:-inset-x-1 after:-inset-y-3 after:content-['']", // alvo táctil de 44 px sem aumentar a linha
                FOCO,
              )}
            >
              {pessoa.nome_completo}
            </button>
            {pessoa.email_trabalho && <span className="text-xs leading-4 text-muted-foreground">{pessoa.email_trabalho}</span>}
          </span>
        </span>
      </TableCell>
      <TableCell className={CELULA}>{pessoa.cargo ?? vazio}</TableCell>
      <TableCell className={CELULA}>{local ?? pessoa.local_trabalho ?? vazio}</TableCell>
      <TableCell className={cn(CELULA, "tabular-nums")}>{pessoa.data_admissao ?? vazio}</TableCell>
      <TableCell className={CELULA}>
        <span className="flex flex-wrap items-center gap-1">
          <Badge variant={pessoa.estadoAcesso === "ativo" ? "default" : "outline"} className="font-normal">
            {t(`hr.estadoAcesso.${pessoa.estadoAcesso}`)}
          </Badge>
          <EstadoAdmissaoDaPessoa estado={estadoAdmissao} />
        </span>
      </TableCell>
      {comContrato && (
        <TableCell className={CELULA}>
          {pessoa.estado_contrato_derivado && (
            <Badge variant={pessoa.estado_contrato_derivado === "em_curso" ? "secondary" : "outline"} className="font-normal">
              {t(`hr.estadoContrato.${pessoa.estado_contrato_derivado}`)}
            </Badge>
          )}
        </TableCell>
      )}
    </TableRow>
  );
}
