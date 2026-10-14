/**
 * Uma linha compacta (cerca de 45 px) do módulo «Custos»: avatar, nome (o botão que abre a ficha no separador Custo, com
 * alvo de 44 px sem aumentar a linha), cargo, centro e filial, e os valores do mês. A linha toda também abre ao clicar; o
 * botão do nome serve o teclado e o leitor de ecrã. A composição abre numa segunda linha, por um botão próprio.
 */
import { ChevronDown, ChevronRight } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { iniciaisDoNome } from "@/components/rh-exemplo/lib/anexosAdmissao";
import type { LinhaCusto } from "@/components/rh-exemplo/lib/custoOrganizacao";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { BarraComposicao } from "@/components/rh-exemplo/custo/BarraComposicao";
import { euros } from "@/components/rh-exemplo/custo/formato";

const CELULA = "px-3 py-1 align-middle text-sm";
const NUMERO = `${CELULA} text-right tabular-nums`;

interface Props {
  linha: LinhaCusto;
  expandida: boolean;
  aoAbrir: (id: string) => void;
  aoAlternar: (id: string) => void;
}

function Equipamentos({ linha }: { linha: LinhaCusto }) {
  const { t } = useTranslation();
  return (
    <>
      {euros(linha.equipamentosMes, "—")}
      <span className="block text-xs leading-4 text-muted-foreground">{t("rhCustos.nEquipamentos", { n: linha.nEquipamentos })}</span>
    </>
  );
}

function CelulaPessoa({ linha, aoAbrir }: { linha: LinhaCusto; aoAbrir: (id: string) => void }) {
  const { t } = useTranslation();
  return (
    <TableCell className={CELULA}>
      <span className="flex items-center gap-2.5">
        <span aria-hidden="true" className="flex size-8 shrink-0 select-none items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-xs font-semibold text-foreground">
          {iniciaisDoNome(linha.nome)}
        </span>
        <span className="flex min-w-0 flex-col">
          <button
            type="button" aria-label={t("rhCustos.abrirFicha", { nome: linha.nome })}
            onClick={(e) => { e.stopPropagation(); aoAbrir(linha.pessoaId); }}
            className={cn("relative w-fit rounded-sm text-left text-sm font-medium leading-5 text-foreground hover:underline after:absolute after:-inset-x-1 after:-inset-y-3 after:content-['']", FOCO)}
          >
            {linha.nome}
          </button>
          <span className="text-xs leading-4 text-muted-foreground">{linha.cargo ?? t("rhCustos.semValor")}</span>
        </span>
      </span>
    </TableCell>
  );
}

interface CelulaComposicaoProps {
  linha: LinhaCusto;
  expandida: boolean;
  idDetalhe: string;
  aoAlternar: (id: string) => void;
}

function CelulaComposicao({ linha, expandida, idDetalhe, aoAlternar }: CelulaComposicaoProps) {
  const { t } = useTranslation();
  const Seta = expandida ? ChevronDown : ChevronRight;
  return (
    <TableCell className={CELULA}>
      <button
        type="button" aria-expanded={expandida} aria-controls={idDetalhe}
        aria-label={t(expandida ? "rhCustos.comp.esconder" : "rhCustos.comp.ver", { nome: linha.nome })}
        onClick={(e) => { e.stopPropagation(); aoAlternar(linha.pessoaId); }}
        className={cn("relative flex w-full min-w-28 items-center gap-1.5 rounded-sm text-left after:absolute after:-inset-x-1 after:-inset-y-3 after:content-['']", FOCO)}
      >
        <Seta aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1"><BarraComposicao partes={linha.composicao} variante="mini" titulo={linha.nome} /></span>
      </button>
    </TableCell>
  );
}

export function LinhaTabelaCusto({ linha, expandida, aoAbrir, aoAlternar }: Props) {
  const { t } = useTranslation();
  const sem = t("rhCustos.semValor");
  const eur = (v: number | null) => euros(v, sem);
  const idDetalhe = `rhCustos-comp-${linha.pessoaId}`;
  return (
    <>
      <TableRow data-pessoa-id={linha.pessoaId} className="cursor-pointer" onClick={() => aoAbrir(linha.pessoaId)}>
        <CelulaPessoa linha={linha} aoAbrir={aoAbrir} />
        <TableCell className={CELULA}>
          {linha.centro ?? sem}
          <span className="block text-xs leading-4 text-muted-foreground">{linha.filial ?? sem}</span>
        </TableCell>
        <TableCell className={NUMERO}>{eur(linha.retribuicao)}</TableCell>
        <TableCell className={NUMERO}>{eur(linha.retribuicao === null ? null : linha.encargos)}</TableCell>
        <TableCell className={NUMERO}>{eur(linha.avulsosMes)}</TableCell>
        <TableCell className={NUMERO}><Equipamentos linha={linha} /></TableCell>
        <TableCell className={NUMERO}>{eur(linha.retribuicao === null ? null : linha.seguro)}</TableCell>
        <TableCell className={cn(NUMERO, "font-semibold")}>{eur(linha.total)}</TableCell>
        <TableCell className={NUMERO}>{eur(linha.porHora)}</TableCell>
        <CelulaComposicao linha={linha} expandida={expandida} idDetalhe={idDetalhe} aoAlternar={aoAlternar} />
      </TableRow>
      {expandida && (
        <TableRow id={idDetalhe} className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={10} className="px-3 py-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">{t("rhCustos.comp.titulo", { nome: linha.nome })}</p>
            <BarraComposicao partes={linha.composicao} titulo={t("rhCustos.comp.titulo", { nome: linha.nome })} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
