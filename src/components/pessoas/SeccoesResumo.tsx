// As secções do Resumo da ficha que mostram o estado da pessoa: o próximo passo e o prazo, os avisos e "Lead" (a origem e o resumo da pessoa, juntos).
// Cada uma é uma `Seccao` de `ficha-comum` com os seus campos; ícones sempre com texto.
import type { ReactNode } from "react";
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
import type { MotivoEncerramento, Pessoa, ResumoPessoa } from "./pessoasTipos";
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

/** O motivo de encerrar, em texto: o escrito à mão no «Outro», ou o da lista. */
const textoDoMotivo = (t: ReturnType<typeof useTranslation>["t"], motivo: MotivoEncerramento, outro?: string): string =>
  motivo === "outro" ? outro ?? t(`${P}close.reason.other`) : t(`${P}lost.${motivo}`);

/**
 * O estado de uma pessoa que já não está em abordagem: numa abordagem encerrada, o resultado, o motivo e o dia; numa perdida (exemplo antigo), «Perdida» com
 * motivo, data e passo. Sem nenhum dos dois não desenha nada. Vive no cabeçalho do guia (e, no ramo antigo, dentro de «Próximo passo e prazo»).
 */
export function AvisoEstadoPessoa({ resumo }: { resumo: ResumoPessoa }) {
  const { t } = useTranslation();
  const { pessoa } = resumo;
  if (pessoa.encerrada) {
    const e = pessoa.encerrada;
    return (
      <div className="space-y-0.5">
        <p className="inline-flex items-center gap-1.5 text-[15px] font-medium text-foreground">
          <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t(`${P}close.summary`, { result: t(`${P}close.result.${e.resultado}`), reason: textoDoMotivo(t, e.motivo, e.motivoOutro), date: textoDiaCompleto(e.data) })}
        </p>
      </div>
    );
  }
  if (!pessoa.perdida) return null;
  const detalhe = t(`${P}sum.lostDetail`, {
    reason: t(`${P}lost.${pessoa.perdida.motivo}`), date: textoDiaCompleto(pessoa.perdida.data),
    step: t(`${P}journey.step${passoDaPerdida(resumo)}`),
  });
  return (
    <div className="space-y-0.5">
      <p className="inline-flex items-center gap-1.5 text-[15px] font-medium text-foreground">
        <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        {t(`${P}sum.lostState`)}
      </p>
      <p className="text-[15px] text-foreground">{detalhe}</p>
    </div>
  );
}

interface SeccaoPassoProps {
  resumo: ResumoPessoa;
  hoje: string;
  /** A pessoa tem visitas (não canceladas): o passo da visita remete para elas em vez de repetir o dia. */
  comVisita?: boolean;
  /** O bloco «Próxima visita» está no Resumo: o passo remete para ele; sem ele, remete para a aba «Visitas». */
  proximaVisitaVisivel?: boolean;
  /** O bloco «Por fechar» está no Resumo (há visitas que já passaram): o passo remete para ele, onde está o botão. */
  visitaPorFechar?: boolean;
  /** O botão do passo, quando não há bloco «Por fechar» nem «Próxima visita» onde o pôr (a visita já foi feita, ou não tem dia). */
  acao?: ReactNode;
}

/**
 * "Próximo passo e prazo": o título, a explicação de uma linha e o prazo; numa abordagem encerrada, o resultado, o motivo e o dia; numa
 * perdida (exemplo antigo), "Perdida" com motivo, data e passo. Quando o passo é a visita e a pessoa tem visitas (`comVisita`), o passo
 * remete para o bloco «Por fechar» ou «Próxima visita» (ou, sem eles, para a aba «Visitas») em vez de repetir o dia.
 */
export function SeccaoPasso({ resumo, hoje, comVisita = false, proximaVisitaVisivel = false, visitaPorFechar = false, acao }: SeccaoPassoProps) {
  const { t } = useTranslation();
  const { pessoa } = resumo;
  const passo = proximoPasso(resumo);
  let conteudo;
  if (pessoa.encerrada || pessoa.perdida) {
    conteudo = <AvisoEstadoPessoa resumo={resumo} />;
  } else if (passo.id === "nenhum") {
    conteudo = <p className="text-[15px] text-muted-foreground">{t(`${P}sum.noNext`)}</p>;
  } else if (comVisita && passo.id === "fecharLevantamento") {
    conteudo = (
      <div className="space-y-0.5">
        <p className="text-[15px] font-medium text-foreground">{t(`${P}next.${passo.id}`)}</p>
        <p className="text-[15px] text-muted-foreground">{t(`${P}nextVisit.${visitaPorFechar ? "seeToClose" : proximaVisitaVisivel ? "seeStep" : "seeTab"}`)}</p>
      </div>
    );
  } else {
    conteudo = (
      <div className="space-y-0.5">
        <p className="text-[15px] font-medium text-foreground">{t(`${P}next.${passo.id}`)}</p>
        <p className="text-[15px] text-muted-foreground">{t(`${P}next.${passo.id}.hint`)}</p>
        <Prazo prazo={passo.prazo} hoje={hoje} hora={passo.prazo !== null && passo.prazo === resumo.proximoContacto ? resumo.proximoHora : undefined} />
      </div>
    );
  }
  return (
    <Seccao titulo={t(`${P}sum.nextTitle`)} marca={<MarcaExemplo />}>
      {acao ? <div className="space-y-2">{conteudo}{acao}</div> : conteudo}
    </Seccao>
  );
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

/** As linhas da origem que existem: origem, canal, campanha, formulário e via de entrada. */
function linhasDeOrigem(t: ReturnType<typeof useTranslation>["t"], pessoa: Pessoa): [string, string][] {
  const linhas: [string, string | undefined][] = [
    [t(`${P}origin.source`), pessoa.origem ? t(`${P}origin.${pessoa.origem}`) : undefined],
    [t(`${P}origin.channel`), pessoa.canal],
    [t(`${P}origin.campaign`), pessoa.campanha],
    [t(`${P}origin.form`), pessoa.formulario],
    [t(`${P}origin.via`), pessoa.viaEntrada ? t(`${P}via.${pessoa.viaEntrada}`) : undefined],
  ];
  return linhas.filter((l): l is [string, string] => Boolean(l[1]));
}

/**
 * "Lead": tudo o que se sabe da lead numa só secção. A origem (origem, canal, campanha, formulário, via de entrada) só tem as linhas que existem; segue-se
 * o resumo (desde quando, qualificação, comercial, saúde, último contacto com o selo do resultado e saúde do negócio).
 */
export function SeccaoLead({ resumo, hoje }: { resumo: ResumoPessoa; hoje: string }) {
  const { t } = useTranslation();
  const { pessoa, piorAberto } = resumo;
  return (
    <Seccao titulo={t(`${P}sum.lead`)} marca={<MarcaExemplo />}>
      <ListaCampos>
        {linhasDeOrigem(t, pessoa).map(([rotulo, valor]) => <LinhaCampo key={rotulo} rotulo={rotulo}>{valor}</LinhaCampo>)}
        {pessoa.saude !== undefined && <LinhaCampo rotulo={t(`${P}sum.personHealth`)}><SaudePessoa valor={pessoa.saude} /></LinhaCampo>}
        <LinhaCampo rotulo={t(`${P}sum.last`)}>
          <span className="flex flex-wrap items-center gap-2">
            {/* Nunca contactada: o selo já diz «Sem contacto», não se repete em texto. */}
            {pessoa.ultimoContactoDias !== null && textoUltimoContacto(t, pessoa.ultimoContactoDias)}
            <SeloResultado resultado={resultadoEfetivo(pessoa)} />
          </span>
        </LinhaCampo>
        {pessoa.comercial !== "" && <LinhaCampo rotulo={t(`${P}sum.rep`)}>{pessoa.comercial}</LinhaCampo>}
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
