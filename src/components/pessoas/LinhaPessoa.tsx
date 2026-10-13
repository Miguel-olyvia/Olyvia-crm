import { Clock } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { TableCell, TableRow } from "@/components/ui/table";
import { FOCO } from "@/components/negocio-metas/estilos";
import { SaudeTag } from "@/components/negocio-metas/SaudeTag";
import { textoNegocios, textoUltimoContacto } from "./formatoPessoas";
import { LIMITE_SEM_CONTACTO } from "./filtrosPessoas";
import type { ResumoPessoa } from "./pessoasTipos";
import { SeloPapel, SeloPerdida, SeloVoltou } from "./SelosPessoa";

interface LinhaPessoaProps {
  resumo: ResumoPessoa;
  hoje: string;
  voltou: boolean;
  aoAbrir: (id: string) => void;
}

/** O último contacto: "há N dias"; a partir de 7 dias ganha um relógio (o texto continua a dizê-lo). */
function UltimoContacto({ dias }: { dias: number }) {
  const { t } = useTranslation();
  const antigo = dias >= LIMITE_SEM_CONTACTO;
  return (
    <span className={cn("inline-flex items-center gap-1.5", antigo && "font-medium")}>
      {antigo && <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />}
      {textoUltimoContacto(t, dias)}
    </span>
  );
}

function Contacto({ resumo }: { resumo: ResumoPessoa }) {
  const { t } = useTranslation();
  const { telefone, email } = resumo.pessoa.contacto;
  if (!telefone && !email) return <span className="text-muted-foreground">{t("pessoasPagina.noContact")}</span>;
  return (
    <span className="flex flex-col">
      {telefone && <span className="tabular-nums">{telefone}</span>}
      {email && <span className="text-muted-foreground">{email}</span>}
    </span>
  );
}

/** Uma linha: o nome é o botão que abre a ficha (Enter), e a linha toda também abre ao clicar. */
export function LinhaPessoa({ resumo, hoje, voltou, aoAbrir }: LinhaPessoaProps) {
  const { t } = useTranslation();
  const { pessoa } = resumo;
  return (
    <TableRow data-pessoa-id={pessoa.id} className="cursor-pointer" onClick={(e) => { e.currentTarget.querySelector<HTMLElement>("[data-linha-pessoa]")?.focus(); aoAbrir(pessoa.id); }}>
      <TableCell className="px-3 py-2 align-middle">
        <button
          type="button" data-linha-pessoa={pessoa.id}
          className={cn("min-h-11 rounded-sm text-left font-medium text-foreground hover:underline", FOCO)}
        >
          {pessoa.nome}
        </button>
        <span className="flex flex-wrap gap-1.5 pb-1">
          <SeloPapel papel={resumo.papel} />
          {voltou && <SeloVoltou />}
          {pessoa.perdida && <SeloPerdida />}
        </span>
      </TableCell>
      <TableCell className="px-3 py-2 align-middle"><Contacto resumo={resumo} /></TableCell>
      <TableCell className="px-3 py-2 align-middle">
        {t(`pessoasPagina.origin.${pessoa.origem}`)}
        {pessoa.origemDetalhe && <span className="text-muted-foreground"> · {pessoa.origemDetalhe}</span>}
      </TableCell>
      <TableCell className="px-3 py-2 align-middle">{t(`pessoasPagina.stage.${pessoa.etapa}`)}</TableCell>
      <TableCell className="px-3 py-2 align-middle"><UltimoContacto dias={pessoa.ultimoContactoDias} /></TableCell>
      <TableCell className="px-3 py-2 align-middle">{pessoa.comercial}</TableCell>
      <TableCell className="px-3 py-2 align-middle tabular-nums">{textoNegocios(t, resumo)}</TableCell>
      <TableCell className="px-3 py-2 align-middle">
        {resumo.piorAberto ? <SaudeTag negocio={resumo.piorAberto} hoje={hoje} /> : <><span aria-hidden="true">—</span><span className="sr-only">{t("pessoasPagina.noHealth")}</span></>}
      </TableCell>
    </TableRow>
  );
}
