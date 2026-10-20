import { AlertCircle, Clock, MessageCircle, XCircle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { hojeLisboa } from "@/hooks/pessoas/adaptarResumoPessoa";
import { cn } from "@/lib/utils";
import { FOCO } from "@/components/negocio-metas/estilos";
import { formatarMeta } from "@/components/negocio-metas/formatoMetas";
import { ligacoes } from "@/components/ficha-comum/ligacoesContacto";
import { LIMITE_SEM_CONTACTO } from "./filtrosPessoas";
import { textoDiaCompleto, textoSemContacto, textoUltimoContacto } from "./formatoPessoas";
import { COR_ETAPA, COR_PERDIDA, ICONE_ETAPA } from "./iconesPessoa";
import { SeloEncerrada, SeloPerdida, SeloResultado, SeloVoltou } from "./SelosPessoa";
import type { VistaLinhaPessoa } from "./vistaLinhaPessoa";

type Traduzir = ReturnType<typeof useTranslation>["t"];
const R = "pessoasPagina.real.";
const SELO = "inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium text-foreground";

/** Um travessão para quem vê e um texto para quem ouve. */
export function SemTexto({ rotulo }: { rotulo: string }) {
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className="sr-only">{rotulo}</span>
    </>
  );
}

/** A fonte não dá este dado (ainda não existe, ou ainda não foi lido). */
export function SemDado() {
  const { t } = useTranslation();
  return <SemTexto rotulo={t(`${R}noData`)} />;
}

/** Texto, ou o travessão com `vazio` quando se sabe que não há (null), ou «Sem dado» quando não se sabe (undefined). */
export function TextoOuTravessao({ valor, vazio, quebra }: { valor: string | null | undefined; vazio: string; quebra?: boolean }) {
  if (valor === undefined) return <SemDado />;
  if (valor === null || valor.trim() === "") return <SemTexto rotulo={vazio} />;
  // Com `quebra` (o email) o texto quebra por inteiro: cortá-lo em duas linhas escondia o fim sem forma de o ler. Nos outros, o corte em duas
  // linhas fica e o valor completo vai em `title`.
  return <span title={valor} className={quebra ? "break-all" : "line-clamp-2"}>{valor}</span>;
}

/** «Lead · Empresa · MQL · Atrasada · exemplo», com «Voltou a contactar», «Perdida» e «Encerrada» à parte. Uma cliente leva o papel no selo do nome. */
export function Sublinha({ vista }: { vista: VistaLinhaPessoa }) {
  const { t } = useTranslation();
  const papelNoSelo = vista.papel === "cliente" && vista.etapa === null;
  const partes = [
    !papelNoSelo && t(`pessoasPagina.role.${vista.papel}`),
    vista.empresa && t("pessoasPagina.row.company"),
    vista.qualificacao,
  ].filter(Boolean);
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs leading-4 text-muted-foreground">
      {partes.length > 0 && <span>{partes.join(" · ")}</span>}
      {vista.atrasada === true && (
        <span className="inline-flex items-center gap-1 font-medium text-destructive">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
          {t("pessoasPagina.row.late")}
        </span>
      )}
      {vista.exemplo && <span>{t("pessoasPagina.head.example")}</span>}
      {vista.voltou === true && <SeloVoltou />}
      {vista.perdidaMotivo && <SeloPerdida />}
      {vista.encerrada && <SeloEncerrada />}
    </span>
  );
}

/** O selo «Cliente» junto ao nome: só quando a linha não tem etapa (é o papel que identifica a pessoa). */
export function SeloPapel({ vista }: { vista: VistaLinhaPessoa }) {
  const { t } = useTranslation();
  if (vista.papel !== "cliente" || vista.etapa !== null) return null;
  return <span className={cn(SELO, "border-border bg-card")}>{t("pessoasPagina.role.cliente")}</span>;
}

function textoEtapa(t: Traduzir, v: VistaLinhaPessoa, etapa: NonNullable<VistaLinhaPessoa["etapa"]>): string {
  if (v.encerrada) return t("pessoasPagina.close.stage", { result: t(`pessoasPagina.close.result.${v.encerrada}`) });
  if (v.perdidaMotivo) return t("pessoasPagina.stage.lost", { reason: t(`pessoasPagina.lost.${v.perdidaMotivo}`) });
  if (etapa === "qualificada") {
    return v.faseEtapa
      ? t("pessoasPagina.stage.qualificada", { phase: t(`businessGoals.phase.${v.faseEtapa}`) })
      : t("pessoasPagina.journey.step3");
  }
  return t(`pessoasPagina.stage.${etapa}`);
}

/** A etapa, com ícone e texto; uma perdida ou encerrada mostra o motivo com o ícone de perda. Sem etapa (cliente): «—». */
export function Etapa({ vista }: { vista: VistaLinhaPessoa }) {
  const { t } = useTranslation();
  if (vista.etapa === null) return <SemTexto rotulo={t(`${R}noStage`)} />;
  const fechada = !!vista.perdidaMotivo || !!vista.encerrada;
  const Icone = fechada ? XCircle : ICONE_ETAPA[vista.etapa];
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn("grid size-6 shrink-0 place-items-center rounded-full", fechada ? COR_PERDIDA : COR_ETAPA[vista.etapa])} aria-hidden="true">
        <Icone className="h-3.5 w-3.5" />
      </span>
      <span>{textoEtapa(t, vista, vista.etapa)}</span>
    </span>
  );
}

/** O último contacto: «há 4 dias»; a partir de 7 dias, «sem contacto há N dias» com o relógio vermelho; e o selo do resultado, se se sabe. */
export function UltimoContacto({ vista }: { vista: VistaLinhaPessoa }) {
  const { t } = useTranslation();
  const dias = vista.diasSemContacto;
  const antigo = dias !== null && dias >= LIMITE_SEM_CONTACTO;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span className={cn("inline-flex items-center gap-1.5", antigo ? "font-medium text-foreground" : "text-muted-foreground")}>
        <Clock className={cn("h-3.5 w-3.5 shrink-0", antigo && "text-destructive")} aria-hidden="true" />
        {antigo && dias !== null ? textoSemContacto(t, dias) : textoUltimoContacto(t, dias)}
      </span>
      {vista.resultado !== undefined && <SeloResultado resultado={vista.resultado} className="h-5 border-transparent py-0" />}
    </span>
  );
}

/** O próximo passo; «—» quando não há, e «—» com «Ver na ficha» quando a fonte não o sabe. */
export function Passo({ vista }: { vista: VistaLinhaPessoa }) {
  const { t } = useTranslation();
  if (vista.passo === null) return <SemTexto rotulo={t(`${R}nextUnknown`)} />;
  if (vista.passo === "nenhum") return <SemTexto rotulo={t("pessoasPagina.next.none")} />;
  return <span className="line-clamp-2 font-medium">{t(`pessoasPagina.next.${vista.passo}`)}</span>;
}

export function Valor({ vista }: { vista: VistaLinhaPessoa }) {
  const { t } = useTranslation();
  return vista.valorEmJogo > 0 ? <>{formatarMeta("euro", vista.valorEmJogo)}</> : <SemTexto rotulo={t("pessoasPagina.value.none")} />;
}

export function Formulario({ vista }: { vista: VistaLinhaPessoa }) {
  const { t } = useTranslation();
  if (vista.formulario === null) return <span className="line-clamp-2 text-muted-foreground">{t("pessoasPagina.formManual")}</span>;
  return <TextoOuTravessao valor={vista.formulario} vazio={t("pessoasPagina.formManual")} />;
}

const ORIGENS_CONHECIDAS: readonly string[] = ["web", "api", "import"];

/** A origem da lead (`anew_leads.source`): web, api e import com nome legível (como as Leads); o resto, tal como a base o guarda. */
export function Origem({ vista }: { vista: VistaLinhaPessoa }) {
  const { t } = useTranslation();
  const origem = vista.origem;
  if (origem === undefined) return <SemDado />;
  if (origem === null || origem.trim() === "") return <SemTexto rotulo={t(`${R}noData`)} />;
  const chave = origem.trim().toLowerCase();
  return <TextoOuTravessao valor={ORIGENS_CONHECIDAS.includes(chave) ? t(`${R}origin.${chave}`) : origem} vazio={t(`${R}noData`)} />;
}

export function Comercial({ vista }: { vista: VistaLinhaPessoa }) {
  const { t } = useTranslation();
  if (vista.comercial === null) return <span className="italic text-muted-foreground">{t(`${R}noAssigned`)}</span>;
  return <TextoOuTravessao valor={vista.comercial} vazio={t(`${R}noAssigned`)} />;
}

/** O dia de Lisboa (DD/MM/AAAA) de um instante ISO; `null` se o texto não for uma data. */
function textoCriado(iso: string): string | null {
  const quando = new Date(iso);
  return Number.isNaN(quando.getTime()) ? null : textoDiaCompleto(hojeLisboa(quando));
}

export function Criado({ vista }: { vista: VistaLinhaPessoa }) {
  const { t } = useTranslation();
  if (vista.criadoEm === undefined) return <SemDado />;
  const texto = vista.criadoEm === null ? null : textoCriado(vista.criadoEm);
  return texto === null ? <SemTexto rotulo={t(`${R}noDate`)} /> : <time dateTime={vista.criadoEm ?? undefined}>{texto}</time>;
}

/** WhatsApp: uma ligação por pessoa com telefone, noutro separador. Não deixa o clique subir (a linha abriria a ficha). */
export function Whatsapp({ vista }: { vista: VistaLinhaPessoa }) {
  const { t } = useTranslation();
  if (vista.telefone === undefined) return <SemDado />;
  const ligacao = ligacoes({ telefone: vista.telefone, email: null }).whatsapp;
  if (!ligacao) return <SemTexto rotulo={t(`${R}noPhone`)} />;
  return (
    <a
      href={ligacao} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
      aria-label={t(`${R}whatsappFor`, { name: vista.nome || t(`${R}noName`) })}
      className={cn("inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-green-700 hover:bg-accent dark:text-green-400", FOCO)}
    >
      <MessageCircle className="h-4 w-4" aria-hidden="true" />
    </a>
  );
}
