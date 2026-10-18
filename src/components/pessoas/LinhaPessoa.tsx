import { AlertCircle, Clock, XCircle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { TableCell, TableRow } from "@/components/ui/table";
import { FOCO } from "@/components/negocio-metas/estilos";
import { AvatarPessoa } from "./AvatarPessoa";
import { proximoPasso } from "./etapaPessoa";
import { LIMITE_SEM_CONTACTO, resultadoEfetivo } from "./filtrosPessoas";
import { textoEtapa, textoSemContacto, textoUltimoContacto, textoValor } from "./formatoPessoas";
import { COR_ETAPA, COR_PERDIDA, ICONE_ETAPA } from "./iconesPessoa";
import type { Pessoa, ResumoPessoa } from "./pessoasTipos";
import type { ItemProcesso } from "./processo/tiposProcesso";
import { BotaoNegocios, ResumoNegocios, SemNegocios } from "./quadro/ControloNegociosPessoa";
import { SeloEncerrada, SeloPerdida, SeloResultado, SeloVoltou } from "./SelosPessoa";

interface LinhaPessoaProps {
  resumo: ResumoPessoa;
  voltou: boolean;
  /** Os itens em curso da pessoa: ela em abordagem, ou os negócios (ver `itensDaPessoa`); vazio = sem botão de negócios. */
  itens: readonly ItemProcesso[];
  /** As sub-linhas de negócios estão abertas. */
  aberta: boolean;
  aoAlternar: (id: string) => void;
  aoAbrir: (id: string) => void;
}

const CELULA = "px-3 py-1 align-middle text-sm";

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
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs leading-4 text-muted-foreground">
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
      {pessoa.encerrada && <SeloEncerrada />}
    </span>
  );
}

/** A etapa, com ícone e texto; uma perdida mostra "Perdida · motivo" com o ícone de perda. */
function Etapa({ resumo }: { resumo: ResumoPessoa }) {
  const { t } = useTranslation();
  const fechada = !!resumo.pessoa.perdida || !!resumo.pessoa.encerrada;
  const Icone = fechada ? XCircle : ICONE_ETAPA[resumo.etapa];
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={cn("grid size-6 shrink-0 place-items-center rounded-full", fechada ? COR_PERDIDA : COR_ETAPA[resumo.etapa])}
        aria-hidden="true"
      >
        <Icone className="h-3.5 w-3.5" />
      </span>
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
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span className={cn("inline-flex items-center gap-1.5", antigo ? "font-medium text-foreground" : "text-muted-foreground")}>
        <Clock className={cn("h-3.5 w-3.5 shrink-0", antigo && "text-destructive")} aria-hidden="true" />
        {antigo ? textoSemContacto(t, dias) : textoUltimoContacto(t, dias)}
      </span>
      <SeloResultado resultado={resultadoEfetivo(pessoa)} className="h-5 border-transparent py-0" />
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

/** Uma linha: o nome é o botão que abre a ficha (Enter), e a linha toda também abre ao clicar. Na última célula, o botão dos negócios. */
export function LinhaPessoa({ resumo, voltou, itens, aberta, aoAlternar, aoAbrir }: LinhaPessoaProps) {
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
        <span className="flex items-center gap-2.5">
          <AvatarPessoa nome={pessoa.nome} pequeno />
          <span className="flex min-w-0 flex-col">
            <button
              type="button" data-linha-pessoa={pessoa.id}
              className={cn(
                "relative w-fit rounded-sm text-left text-sm font-medium leading-5 text-foreground hover:underline",
                "after:absolute after:-inset-x-1 after:-inset-y-3 after:content-['']", // alvo táctil de 44 px sem aumentar a linha
                FOCO,
              )}
            >
              {pessoa.nome}
            </button>
            <Sublinha resumo={resumo} voltou={voltou} />
            {!aberta && <ResumoNegocios resumo={resumo} itens={itens} />}
          </span>
        </span>
      </TableCell>
      <TableCell className={CELULA}>{pessoa.morada?.localidade ?? <SemTexto rotulo={t("pessoasPagina.place.none")} />}</TableCell>
      <TableCell className={CELULA}><Etapa resumo={resumo} /></TableCell>
      <TableCell className={cn(CELULA, "break-words text-xs", !resumo.formulario && "text-muted-foreground")}>
        <span className="line-clamp-2">{resumo.formulario ?? t("pessoasPagina.formManual")}</span>
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
      <TableCell className={CELULA}>
        {itens.length === 0
          ? <SemNegocios />
          : <BotaoNegocios pessoaId={pessoa.id} nome={pessoa.nome} quantidade={itens.length} aberta={aberta} aoAlternar={aoAlternar} />}
      </TableCell>
    </TableRow>
  );
}
