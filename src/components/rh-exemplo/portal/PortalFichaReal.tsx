// A «Ficha de admissão» do portal REAL, com o desenho da pré-visualização (título, barra dos quatro passos, faixa do acesso
// temporário) alimentada pelo que a Edge `convite-admissao` devolve. O conteúdo é o do portal real, sem o reescrever: a saudação,
// o formulário (só o NISS e o IBAN se gravam, com o botão junto de cada campo), a nota de devolução e o que fica para a fase seguinte.
// Documentos: a troca com o RH não existe na base, por isso a entrada não aparece (ver `PortalNavegacao`, `comDocumentos`).
import { useEffect, useRef, useState, type RefObject } from "react";
import { AlertTriangle, Clock3, Hourglass, Info, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader } from "@/components/ui/card";
import { dataEHora } from "@/components/rh-exemplo/admissao/auxiliares";
import {
  AvisoSessaoPerdida, ConviteSaudacao, PortalDevolvida, PortalFormulario, PortalProximaFase, estadoAdmissaoDe, mensagemErroPortal,
  prazoEmAviso, restoDoPrazo,
  type AvisoPortal, type ConvitePublico, type PortalLer, type ResultadoSensiveis, type RestoDoPrazo,
} from "@/components/rh-exemplo/hooks/portalAdmissaoReal";
import { passosDoEstadoReal } from "@/components/rh-exemplo/portal/portalRealEstado";
import { PassosDoPortal } from "@/components/rh-exemplo/portal/PortalFicha";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

type Traduzir = ReturnType<typeof useTranslation>["t"];

/** «3 dias» / «1 dia» / «5 h» do prazo, no feitio do selo da pré-visualização (minutos e fim usam os textos do portal real). */
function restaDoSelo(t: Traduzir, resto: RestoDoPrazo): string {
  switch (resto.tipo) {
    case "dias": return t(resto.n === 1 ? "rhPortal.selo.umDia" : "rhPortal.selo.dias", { n: resto.n });
    case "horas": return t("rhPortal.selo.horas", { n: resto.n });
    case "minutos": return t("portal.resta.minutos", { n: resto.n });
    default: return t("portal.resta.terminado");
  }
}

/** «Expira em 7 dias» da faixa. */
function expiraEm(t: Traduzir, resto: RestoDoPrazo): string {
  switch (resto.tipo) {
    case "dias": return t(resto.n === 1 ? "rhAdm.prazo.umDia" : "rhAdm.prazo.dias", { n: resto.n });
    case "horas": return t("rhAdm.prazo.horas", { n: resto.n });
    case "minutos": return t("portal.resta.minutos", { n: resto.n });
    default: return t("rhAdm.prazo.expirado");
  }
}

/** O selo do cabeçalho: «Acesso temporário · termina a dd/mm às hh:mm (N dias)», âmbar e com texto quando resta pouco. */
export function PortalSeloReal({ validUntil }: { validUntil: string | null }) {
  const { t } = useTranslation();
  if (!validUntil || Number.isNaN(Date.parse(validUntil))) return null;
  const agora = new Date();
  const termina = dataEHora(validUntil);
  const aviso = prazoEmAviso(validUntil, agora);
  const Icone = aviso ? AlertTriangle : Clock3;
  return (
    <p
      data-testid="portal-selo" data-aviso={aviso ? "sim" : "nao"}
      className={cn(
        "inline-flex flex-wrap items-center gap-x-1.5 rounded-full border px-3 py-1 text-xs",
        aviso ? "border-amber-500/70 bg-amber-500/10 font-medium text-amber-900 dark:text-amber-300" : "text-muted-foreground",
      )}
    >
      <Icone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{t("rhPortal.selo.texto", { data: termina.data, hora: termina.hora, resta: restaDoSelo(t, restoDoPrazo(validUntil, agora)) })}</span>
      {aviso && <span>· {t("rhPortal.selo.aviso")}</span>}
    </p>
  );
}

interface FaixaAcessoProps {
  convite: ConvitePublico;
  /** Com sessão aberta, a faixa diz também quando a sessão acaba sozinha. */
  sessaoAtiva: boolean;
}

/** A faixa do acesso temporário. Não há «Rascunho guardado»: nesta fase o rascunho não se grava, e não se finge o contrário. */
function FaixaAcessoReal({ convite, sessaoAtiva }: FaixaAcessoProps) {
  const { t } = useTranslation();
  const valida = convite.valid_until !== null && !Number.isNaN(Date.parse(convite.valid_until));
  const termina = valida && convite.valid_until ? dataEHora(convite.valid_until) : null;
  return (
    <div className="space-y-1 rounded-lg border bg-muted/30 px-4 py-3 text-sm" data-testid="convite-faixa-prazo">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {termina && (
          <p className="flex items-center gap-2 font-medium">
            <Clock3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {t("rhAdm.pub.termina", { data: termina.data, hora: termina.hora })}
          </p>
        )}
        <span className="inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs" data-testid="portal-estado-processo">
          {t(`hr.convite.estadoAdmissao.${estadoAdmissaoDe(convite.estado)}`)}
        </span>
      </div>
      {valida && <p className="text-xs text-muted-foreground">{expiraEm(t, restoDoPrazo(convite.valid_until, new Date()))}</p>}
      {sessaoAtiva && <p role="status" className="text-xs text-muted-foreground">{t("portal.ligado.aviso")}</p>}
    </div>
  );
}

function TituloFicha() {
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      <h1 id="portal-ficha-titulo" className="text-2xl font-bold">{t("rhPortal.ficha.titulo")}</h1>
      <p className="text-sm text-muted-foreground">{t("rhPortal.ficha.sub")}</p>
    </div>
  );
}

interface PortalFichaRealProps {
  convite: ConvitePublico;
  sessaoAtiva: boolean;
  aviso: AvisoPortal | null;
  dados: PortalLer | null;
  erroLeitura: string | null;
  sessaoAExpirar: boolean;
  aoManterSessao: () => void;
  aoConfirmarIdentidade: () => void;
  aoGravarSensiveis: (valores: { niss?: string; iban?: string }) => Promise<ResultadoSensiveis>;
  tituloRef: RefObject<HTMLDivElement>;
}

/** A ficha com acesso temporário válido: sem sessão (consulta, pede o código) ou com sessão (o formulário). */
export function PortalFichaReal(props: PortalFichaRealProps) {
  const { convite, sessaoAtiva, aviso, dados, tituloRef } = props;
  const estado = dados?.estado ?? convite.estado;
  return (
    <section aria-labelledby="portal-ficha-titulo" className="space-y-4">
      {!sessaoAtiva && aviso && <AvisoSessaoPerdida aviso={aviso} />}
      <TituloFicha />
      <PassosDoPortal passos={passosDoEstadoReal(estado)} />
      <FaixaAcessoReal convite={{ ...convite, estado }} sessaoAtiva={sessaoAtiva} />
      {sessaoAtiva ? <FichaComSessao {...props} /> : <FichaEmConsulta {...props} />}
    </section>
  );
}

function Saudacao({ convite, tituloRef, pagina, dados }: Pick<PortalFichaRealProps, "convite" | "tituloRef" | "dados"> & { pagina?: 1 | 2 }) {
  const { t } = useTranslation();
  return (
    <div ref={tituloRef} id="portal-topo" tabIndex={-1} className="outline-none">
      <ConviteSaudacao
        t={t} pagina={pagina}
        estado={{
          pessoa_nome: convite.primeiro_nome, valid_until: convite.valid_until,
          niss_ultimos4: dados?.niss_ultimos4 ?? null, conta_ultimos4: dados?.iban_ultimos4 ?? null,
        }}
      />
    </div>
  );
}

function FichaEmConsulta({ convite, dados, tituloRef, aoConfirmarIdentidade }: PortalFichaRealProps) {
  const { t } = useTranslation();
  return (
    <>
      <Saudacao convite={convite} dados={dados} tituloRef={tituloRef} />
      <section aria-labelledby="portal-consulta-titulo" className="space-y-3 rounded-lg border bg-background p-5">
        <h2 id="portal-consulta-titulo" className="flex items-center gap-2 text-base font-semibold">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          {t("portal.consulta.titulo")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("portal.consulta.texto")}</p>
        {convite.precisa_otp && (
          <Button type="button" className="min-h-11" onClick={aoConfirmarIdentidade}>
            {t("portal.consulta.botao")}
          </Button>
        )}
      </section>
    </>
  );
}

function FichaComSessao({ convite, dados, erroLeitura, sessaoAExpirar, aoManterSessao, aoGravarSensiveis, tituloRef }: PortalFichaRealProps) {
  const { t } = useTranslation();
  const [pagina, setPagina] = useState<1 | 2>(1);
  // Ao mudar de página o botão que tinha o foco desaparece: leva-se o foco à saudação (focável sem entrar na ordem de tabulação).
  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    tituloRef.current?.scrollIntoView?.();
    tituloRef.current?.focus({ preventScroll: true });
  }, [pagina, tituloRef]);

  return (
    <>
      <Saudacao convite={convite} dados={dados} tituloRef={tituloRef} pagina={dados ? pagina : undefined} />
      {sessaoAExpirar && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/70 bg-amber-500/10 px-4 py-3 text-sm">
          <p className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t("portal.sessao.aExpirar")}
          </p>
          <Button type="button" variant="outline" className="min-h-11" onClick={aoManterSessao}>
            {t("portal.sessao.manter")}
          </Button>
        </div>
      )}
      {!dados && erroLeitura && (
        <div role="alert" className="space-y-2 rounded-lg border border-destructive/50 px-4 py-3 text-sm">
          <p>{mensagemErroPortal(t, erroLeitura)}</p>
          <Button type="button" variant="outline" className="min-h-11" onClick={aoManterSessao}>
            {t("portal.ligado.tentarDeNovo")}
          </Button>
        </div>
      )}
      {dados && (
        <>
          {dados.devolucao && dados.estado === "devolvida" && <PortalDevolvida devolucao={dados.devolucao} />}
          <PortalFormulario dados={dados} pagina={pagina} aoMudarPagina={setPagina} aoGravarSensiveis={aoGravarSensiveis} />
          <PortalProximaFase devolvida={dados.estado === "devolvida"} />
        </>
      )}
    </>
  );
}

/** O processo já está nas mãos do RH (submetida, aprovada, contrato...): a mesma moldura, só o estado, sem formulário nem dados. */
export function PortalAnaliseReal({ convite }: { convite: ConvitePublico }) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="portal-ficha-titulo" className="space-y-4">
      <TituloFicha />
      <PassosDoPortal passos={passosDoEstadoReal(convite.estado)} />
      <FaixaAcessoReal convite={convite} sessaoAtiva={false} />
      <Card>
        <CardHeader className="items-center text-center">
          <Hourglass className="h-10 w-10 text-primary" aria-hidden="true" />
          <h2 className="text-xl font-semibold leading-none tracking-tight">{t("portal.vista.analise.titulo")}</h2>
          <CardDescription role="status">{t("portal.vista.analise.texto")}</CardDescription>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Info className="h-4 w-4" aria-hidden="true" />
            {t("portal.vista.contactarRh")}
          </p>
        </CardHeader>
      </Card>
    </section>
  );
}
