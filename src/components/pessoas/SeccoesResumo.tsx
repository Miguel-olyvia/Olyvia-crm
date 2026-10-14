// As secções do Resumo da ficha que mostram o estado da pessoa: o próximo passo e o prazo, os avisos e "Sobre a pessoa".
// Cada uma é uma `Seccao` de `ficha-comum` com os seus campos; ícones sempre com texto.
import { AlertCircle, CalendarClock, Clock, Repeat, TimerOff, XCircle, type LucideIcon } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { LinhaCampo, ListaCampos } from "@/components/ficha-comum/ListaCampos";
import { Seccao } from "@/components/ficha-comum/Seccao";
import { FOCO } from "@/components/negocio-metas/estilos";
import { SaudeTag } from "@/components/negocio-metas/SaudeTag";
import { diasParaPrazo } from "@/components/negocio-metas/saudeNegocio";
import { avisosPessoa, type AvisoPessoa } from "./avisosPessoa";
import { passoDaPerdida, proximoPasso } from "./etapaPessoa";
import { resultadoEfetivo } from "./filtrosPessoas";
import { faixaSaude, textoDiaCompleto, textoPrazoPasso, textoUltimoContacto } from "./formatoPessoas";
import type { ResumoPessoa } from "./pessoasTipos";
import { MarcaExemplo, SeloResultado } from "./SelosPessoa";

const P = "pessoasPagina.";

/** O prazo com ícone e texto: ultrapassado, hoje ou futuro (com a hora, se foi marcada); sem prazo, o texto a dizê-lo. */
export function Prazo({ prazo, hoje, hora }: { prazo: string | null; hoje: string; hora?: string }) {
  const { t } = useTranslation();
  const texto = textoPrazoPasso(t, prazo, hoje);
  if (texto === null) return <p className="text-[15px] text-muted-foreground">{t(`${P}sum.noDeadline`)}</p>;
  const dias = diasParaPrazo(prazo, hoje) ?? 1;
  const Icone: LucideIcon = dias < 0 ? AlertCircle : dias === 0 ? Clock : CalendarClock;
  return (
    <p className={cn("inline-flex items-center gap-1.5 text-[15px] text-foreground", dias < 0 && "font-medium")}>
      <Icone className={cn("h-4 w-4 shrink-0", dias < 0 && "text-destructive")} aria-hidden="true" />
      {hora ? `${texto} · ${hora}` : texto}
    </p>
  );
}

/**
 * "Próximo passo e prazo": o título, a explicação de uma linha e o prazo; numa perdida, "Perdida" com motivo, data e passo.
 * Quando o passo é a visita e o bloco "Próxima visita" está por cima (`comVisita`), o passo remete para ele em vez de repetir o dia.
 */
export function SeccaoPasso({ resumo, hoje, comVisita = false }: { resumo: ResumoPessoa; hoje: string; comVisita?: boolean }) {
  const { t } = useTranslation();
  const { pessoa } = resumo;
  const passo = proximoPasso(resumo);
  let conteudo;
  if (pessoa.perdida) {
    const detalhe = t(`${P}sum.lostDetail`, {
      reason: t(`${P}lost.${pessoa.perdida.motivo}`), date: textoDiaCompleto(pessoa.perdida.data),
      step: t(`${P}journey.step${passoDaPerdida(resumo)}`),
    });
    conteudo = (
      <div className="space-y-0.5">
        <p className="inline-flex items-center gap-1.5 text-[15px] font-medium text-foreground">
          <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t(`${P}sum.lostState`)}
        </p>
        <p className="text-[15px] text-foreground">{detalhe}</p>
      </div>
    );
  } else if (passo.id === "nenhum") {
    conteudo = <p className="text-[15px] text-muted-foreground">{t(`${P}sum.noNext`)}</p>;
  } else if (comVisita && passo.id === "fecharLevantamento") {
    conteudo = (
      <div className="space-y-0.5">
        <p className="text-[15px] font-medium text-foreground">{t(`${P}next.${passo.id}`)}</p>
        <p className="text-[15px] text-muted-foreground">{t(`${P}nextVisit.seeStep`)}</p>
      </div>
    );
  } else {
    conteudo = (
      <div className="space-y-0.5">
        <p className="text-[15px] font-medium text-foreground">{t(`${P}next.${passo.id}`)}</p>
        <p className="text-[15px] text-muted-foreground">{t(`${P}next.${passo.id}.hint`)}</p>
        <Prazo prazo={passo.prazo} hoje={hoje} hora={passo.prazo !== null && passo.prazo === pessoa.proximoContacto ? pessoa.proximoHora : undefined} />
      </div>
    );
  }
  return <Seccao titulo={t(`${P}sum.nextTitle`)} marca={<MarcaExemplo />}>{conteudo}</Seccao>;
}

const ICONE_AVISO: Record<AvisoPessoa["tipo"], LucideIcon> = { voltou: Repeat, semContacto: TimerOff, negociosAbertosPerdida: XCircle };

function textosDoAviso(t: ReturnType<typeof useTranslation>["t"], a: AvisoPessoa): { titulo: string; dica: string } {
  if (a.tipo === "voltou") return { titulo: t(`${P}alert.returned`), dica: t(`${P}alert.returnedHint`) };
  if (a.tipo === "semContacto") return { titulo: t(`${P}alert.stale`, { count: a.dias }), dica: t(`${P}alert.staleHint`) };
  return { titulo: t(`${P}alert.lostDeals`), dica: a.quantos === 1 ? t(`${P}alert.lostDealsHint.one`) : t(`${P}alert.lostDealsHint.many`, { count: a.quantos }) };
}

interface SeccaoAvisosProps {
  resumo: ResumoPessoa;
  voltou: boolean;
  podeVerSubmissoes: boolean;
  pendentes: number;
  aoVerSubmissoes: () => void;
}

/** "Avisos": só aparece se houver algum; cada linha leva ícone e texto sobre fundo neutro (sem caixa amarela). */
export function SeccaoAvisos({ resumo, voltou, podeVerSubmissoes, pendentes, aoVerSubmissoes }: SeccaoAvisosProps) {
  const { t } = useTranslation();
  const avisos = avisosPessoa({ pessoa: resumo.pessoa, voltou, podeVerSubmissoes, negociosAbertos: resumo.abertos.length });
  if (avisos.length === 0) return null;
  return (
    <Seccao titulo={t(`${P}sum.alerts`)}>
      <ul className="space-y-1.5">
        {avisos.map((a) => {
          const Icone = ICONE_AVISO[a.tipo];
          const { titulo, dica } = textosDoAviso(t, a);
          return (
            <li key={a.tipo} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md bg-muted/60 px-3 py-2">
              <Icone className="h-4 w-4 shrink-0 text-foreground" aria-hidden="true" />
              <p className="min-w-0 flex-1 text-sm text-foreground"><strong className="font-semibold">{titulo}</strong> {dica}</p>
              {a.tipo === "voltou" && pendentes > 0 && (
                <Button type="button" variant="outline" className={cn("relative -my-1 h-8 px-3 after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']", FOCO)} onClick={aoVerSubmissoes}>
                  {t(`${P}actions.submissions`, { count: pendentes })}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </Seccao>
  );
}

/** A saúde de 0 a 100: o número, a faixa em texto e a barra (a barra é só reforço). */
function SaudePessoa({ valor }: { valor: number }) {
  const { t } = useTranslation();
  const texto = t(`${P}sum.healthValue`, { value: valor });
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="font-medium tabular-nums">{texto}</span>
      <span>{t(`${P}health.${faixaSaude(valor)}`)}</span>
      <Progress value={valor} aria-label={`${t(`${P}sum.personHealth`)}: ${texto}`} className="h-2 w-28" />
    </span>
  );
}

/** "Sobre a pessoa": saúde, último contacto e resultado, comercial, qualificação, desde quando e saúde do negócio. */
export function SeccaoSobre({ resumo, hoje }: { resumo: ResumoPessoa; hoje: string }) {
  const { t } = useTranslation();
  const { pessoa, piorAberto } = resumo;
  return (
    <Seccao titulo={t(`${P}sum.about`)} marca={<MarcaExemplo />}>
      <ListaCampos>
        <LinhaCampo rotulo={t(`${P}sum.personHealth`)}><SaudePessoa valor={pessoa.saude} /></LinhaCampo>
        <LinhaCampo rotulo={t(`${P}sum.last`)}>
          <span className="flex flex-wrap items-center gap-2">
            {textoUltimoContacto(t, pessoa.ultimoContactoDias)}
            <SeloResultado resultado={resultadoEfetivo(pessoa)} />
          </span>
        </LinhaCampo>
        <LinhaCampo rotulo={t(`${P}sum.rep`)}>{pessoa.comercial}</LinhaCampo>
        {pessoa.qualificacao && <LinhaCampo rotulo={t(`${P}sum.qual`)}>{t(`${P}sum.qual${pessoa.qualificacao}`)}</LinhaCampo>}
        {pessoa.desde && (
          <LinhaCampo rotulo={t(resumo.papel === "cliente" ? `${P}sum.clientSince` : `${P}sum.created`)}>{textoDiaCompleto(pessoa.desde)}</LinhaCampo>
        )}
        <LinhaCampo rotulo={t(`${P}sum.health`)}>
          {piorAberto ? <SaudeTag negocio={piorAberto} hoje={hoje} /> : <span className="text-muted-foreground">{t(`${P}sum.healthNone`)}</span>}
        </LinhaCampo>
      </ListaCampos>
    </Seccao>
  );
}
