import { AlertCircle, Clock, XCircle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { TableCell, TableRow } from "@/components/ui/table";
import { FOCO } from "@/components/negocio-metas/estilos";
import { AvatarPessoa } from "./AvatarPessoa";
import { proximoPasso } from "./etapaPessoa";
import { LIMITE_SEM_CONTACTO, resultadoEfetivo } from "./filtrosPessoas";
import { textoEtapa, textoSemContacto, textoUltimoContacto, textoValor } from "./formatoPessoas";
import { ICONE_ETAPA } from "./iconesPessoa";
import type { Pessoa, ResumoPessoa } from "./pessoasTipos";
import { SeloPerdida, SeloResultado, SeloVoltou } from "./SelosPessoa";

interface LinhaPessoaProps {
  resumo: ResumoPessoa;
  voltou: boolean;
  aoAbrir: (id: string) => void;
}

const CELULA = "px-3 py-2 align-middle";

/** A sublinha do nome: "Lead · Empresa · MQL · Atrasada · exemplo", com "Voltou a contactar" e "Perdida" à parte. */
function Sublinha({ resumo, voltou }: { resumo: ResumoPessoa; voltou: boolean }) {
  const { t } = useTranslation();
  const { pessoa } = resumo;
  const partes = [
    t(`pessoasPagina.role.${resumo.papel}`),
    pessoa.empresa && t("pessoasPagina.row.company"),
    pessoa.qualificacao,
  ].filter(Boolean);
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
      <span>{partes.join(" · ")}</span>
      {resumo.atrasada && (
        <span className="inline-flex items-center gap-1 font-medium text-destructive">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
          {t("pessoasPagina.row.late")}
        </span>
      )}
      <span>{t("pessoasPagina.head.example")}</span>
      {voltou && <SeloVoltou />}
      {pessoa.perdida && <SeloPerdida />}
    </span>
  );
}

/** A etapa, com ícone e texto; uma perdida mostra "Perdida · motivo" com o ícone de perda. */
function Etapa({ resumo }: { resumo: ResumoPessoa }) {
  const { t } = useTranslation();
  const Icone = resumo.pessoa.perdida ? XCircle : ICONE_ETAPA[resumo.etapa];
  return (
    <span className="inline-flex items-start gap-1.5">
      <Icone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{textoEtapa(t, resumo)}</span>
    </span>
  );
}

/** O último contacto: "há 4 dias" e o resultado; a partir de 7 dias, "sem contacto há N dias" com o relógio vermelho. */
function UltimoContacto({ pessoa }: { pessoa: Pessoa }) {
  const { t } = useTranslation();
  const dias = pessoa.ultimoContactoDias;
  const antigo = dias >= LIMITE_SEM_CONTACTO;
  return (
    <span className="flex flex-col items-start gap-1">
      <span className={cn("inline-flex items-center gap-1.5", antigo && "font-medium")}>
        <Clock className={cn("h-4 w-4 shrink-0", antigo && "text-destructive")} aria-hidden="true" />
        {antigo ? textoSemContacto(t, dias) : textoUltimoContacto(t, dias)}
      </span>
      <SeloResultado resultado={resultadoEfetivo(pessoa)} />
    </span>
  );
}

function SemTexto({ rotulo }: { rotulo: string }) {
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className="sr-only">{rotulo}</span>
    </>
  );
}

/** Uma linha: o nome é o botão que abre a ficha (Enter), e a linha toda também abre ao clicar. */
export function LinhaPessoa({ resumo, voltou, aoAbrir }: LinhaPessoaProps) {
  const { t } = useTranslation();
  const { pessoa } = resumo;
  const passo = proximoPasso(resumo);
  const valor = textoValor(resumo);
  return (
    <TableRow
      data-pessoa-id={pessoa.id} className="cursor-pointer"
      onClick={(e) => { e.currentTarget.querySelector<HTMLElement>("[data-linha-pessoa]")?.focus(); aoAbrir(pessoa.id); }}
    >
      <TableCell className={CELULA}>
        <span className="flex items-start gap-3">
          <AvatarPessoa nome={pessoa.nome} pequeno />
          <span className="flex min-w-0 flex-col">
            <button
              type="button" data-linha-pessoa={pessoa.id}
              className={cn("min-h-11 rounded-sm text-left font-medium text-foreground hover:underline", FOCO)}
            >
              {pessoa.nome}
            </button>
            <Sublinha resumo={resumo} voltou={voltou} />
          </span>
        </span>
      </TableCell>
      <TableCell className={CELULA}>{pessoa.morada?.localidade ?? <SemTexto rotulo={t("pessoasPagina.place.none")} />}</TableCell>
      <TableCell className={CELULA}><Etapa resumo={resumo} /></TableCell>
      <TableCell className={cn(CELULA, "break-words", !resumo.formulario && "text-muted-foreground")}>
        {resumo.formulario ?? t("pessoasPagina.formManual")}
      </TableCell>
      <TableCell className={CELULA}><UltimoContacto pessoa={pessoa} /></TableCell>
      <TableCell className={CELULA}>
        {passo.id === "nenhum"
          ? <SemTexto rotulo={t("pessoasPagina.next.none")} />
          : <span className="line-clamp-2 font-medium">{t(`pessoasPagina.next.${passo.id}`)}</span>}
      </TableCell>
      <TableCell className={cn(CELULA, "text-right tabular-nums")}>
        {valor ?? <SemTexto rotulo={t("pessoasPagina.value.none")} />}
      </TableCell>
    </TableRow>
  );
}
