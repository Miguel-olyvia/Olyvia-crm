// O separador Submissões da ficha real: um cartão por submissão de formulário, só para ler, como o separador «Formulários» do detalhe de uma
// lead (Leads). Resolver submissões continua a ser da página de submissões pendentes: aqui não há botões de ação.
import { AlertTriangle, FileText, Link2, Mail, Phone, Workflow } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";
import { textoDataCompleta } from "@/components/pessoas/formatoPessoas";
import { ETAPAS_DO_FUNIL, type CoincidenciaSubmissao, type SubmissaoFicha } from "@/hooks/pessoas/adaptarSubmissoes";
import { diaLisboa, horaLisboa } from "@/hooks/pessoas/tempoLisboa";

const S = "pessoasPagina.real.ficha.subs.";
const SELO = "inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-foreground";

interface SubmissoesFichaRealProps {
  submissoes: SubmissaoFicha[];
  estado: "inativo" | "a-carregar" | "ok" | "erro";
  /** A lista é a última que se leu: a releitura falhou. Mostra-se com um aviso e «Tentar de novo». */
  desatualizado?: boolean;
  /** O dia de hoje em Lisboa (AAAA-MM-DD), para dizer «hoje às 10:00». */
  hoje: string;
  aoTentarDeNovo: () => void;
}

/** Uma data ISO em AAAA-MM-DDTHH:MM de Lisboa (o que `textoDataCompleta` lê); `null` sem data. */
function dataLisboa(iso: string | null): string | null {
  const dia = diaLisboa(iso);
  const hora = horaLisboa(iso);
  return dia && hora ? `${dia}T${hora}` : null;
}

const entreParenteses = (valor: string | null): string => (valor ? ` (${valor})` : "");

function frase(t: ReturnType<typeof useTranslation>["t"], c: CoincidenciaSubmissao): string {
  return t(`${S}match.${c.por}`, { record: t(`${S}record.${c.registo}`), email: entreParenteses(c.email), phone: entreParenteses(c.telefone) });
}

function Etapa({ etapa }: { etapa: string }) {
  const { t } = useTranslation();
  return <span className={SELO}>{(ETAPAS_DO_FUNIL as readonly string[]).includes(etapa) ? t(`${S}stage.${etapa}`) : etapa}</span>;
}

function ValorNaoGravado({ icone: Icone, rotulo, valor }: { icone: typeof Mail; rotulo: string; valor: string }) {
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm">
      <Icone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="font-medium text-foreground">{valor}</span>
    </p>
  );
}

function Cartao({ s, hoje }: { s: SubmissaoFicha; hoje: string }) {
  const { t } = useTranslation();
  const data = dataLisboa(s.criadoEm);
  const Icone = s.tipo === "submissao" ? FileText : Workflow;
  return (
    <li className="space-y-2 border-b border-border py-4 first:pt-0 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="flex items-center gap-1.5 text-[15px] font-semibold text-foreground">
          <Icone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          {s.campanha ?? t(`${S}noCampaign`)}
        </p>
        {data && <p className="text-sm tabular-nums text-muted-foreground">{textoDataCompleta(t, data, hoje)}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {s.tipo === "submissao" && <span className={SELO}>{t(`${S}kind.submission`)}</span>}
        {s.revisao && <span className={cn(SELO, s.revisao === "pending" && "border-destructive bg-destructive/15")}>{t(`${S}review.${s.revisao}`)}</span>}
        {s.etapa && <Etapa etapa={s.etapa} />}
        {s.origem && <span className="text-xs text-muted-foreground">{s.origem}</span>}
      </div>
      {s.coincidencia && !s.conflito && (
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <Link2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{frase(t, s.coincidencia)}</span>
        </p>
      )}
      {s.conflito && (
        <div className="space-y-1 rounded-md border border-dashed border-border px-3 py-2">
          <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t(`${S}conflict.title`)}
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {s.conflito.map((e) => <li key={e.id} className={SELO}>{e.nome ?? t(`${S}conflict.unnamed`)}</li>)}
          </ul>
        </div>
      )}
      {(s.emailNaoGravado || s.telefoneNaoGravado) && (
        <div className="space-y-1 rounded-md border border-dashed border-border px-3 py-2">
          {s.emailNaoGravado && <ValorNaoGravado icone={Mail} rotulo={t(`${S}unsaved.email`)} valor={s.emailNaoGravado} />}
          {s.telefoneNaoGravado && <ValorNaoGravado icone={Phone} rotulo={t(`${S}unsaved.phone`)} valor={s.telefoneNaoGravado} />}
        </div>
      )}
      {s.campos.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t(`${S}none`)}</p>
      ) : (
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          {s.campos.map((c) => (
            <div key={c.chave} className="flex gap-2">
              <dt className="text-muted-foreground">{c.rotulo}:</dt>
              <dd className="break-words text-foreground">{c.valor}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}

export function SubmissoesFichaReal({ submissoes, estado, desatualizado = false, hoje, aoTentarDeNovo }: SubmissoesFichaRealProps) {
  const { t } = useTranslation();
  // Inativo (por exemplo a ficha a fechar, sem pessoa): nada se lê e nada se diz; «Sem submissões» seria falso.
  if (estado === "inativo") return null;
  if (estado === "a-carregar") return <p role="status" className="text-sm text-muted-foreground">{t(`${S}loading`)}</p>;
  if (estado === "erro") {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border p-4">
        <p role="alert" className="text-sm font-medium text-destructive">{t(`${S}error`)}</p>
        <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={aoTentarDeNovo}>{t("pessoasPagina.real.retry")}</Button>
      </div>
    );
  }
  // O aviso de leitura falhada vale com lista ou sem ela: uma lista vazia e desatualizada não pode dizer só «Sem submissões».
  const aviso = desatualizado && (
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
      <p role="status">{t(`${S}stale`)}</p>
      <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={aoTentarDeNovo}>{t("pessoasPagina.real.retry")}</Button>
    </div>
  );
  if (submissoes.length === 0) {
    return (
      <>
        {aviso}
        <p className="rounded-xl border border-dashed border-border p-4 text-sm font-semibold text-foreground">{t(`${S}empty`)}</p>
      </>
    );
  }
  return (
    <>
      {aviso}
      <ul aria-label={t(`${S}label`)}>{submissoes.map((s) => <Cartao key={s.chave} s={s} hoje={hoje} />)}</ul>
    </>
  );
}
