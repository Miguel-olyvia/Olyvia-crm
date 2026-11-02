// O Portal do colaborador LIGADO: a página pública do link de admissão (sem login da aplicação), a falar com a Edge Function
// `convite-admissao`. Percurso: consulta limitada (ação `estado`) -> código por e-mail (`otp_pedir`, `otp_verificar`) -> sessão
// em memória, leitura do que o estado permite (`ler`), rascunho automático (NISS e IBAN incluídos, cifrados) e submissão -> `sair`.
// A sessão nunca sai da memória; o link sozinho não escreve. Os anexos ficam para a fase 2.
// Reutiliza as peças do portal real (via `hooks/portalAdmissaoReal`).
// DOCUMENTOS: depois de o RH aprovar a admissão o preenchimento continua fechado, mas o RH reabre o portal SÓ para documentos
// (`documentos_abertos`): a pessoa entra com um código novo por e-mail e vê a aba «Documentos» (o contrato para assinar por
// código SMS, o que o RH lhe pede, o que ela pede ao RH). Vista `documentos` (ver `portalDocumentosReal`).
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Clock3, FolderOpen, Loader2, ShieldCheck } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { IdiomaForcadoProvider } from "@/contexts/IdiomaForcadoContext";
import { useTranslation } from "@/hooks/useTranslation";
import {
  AvisoSessaoPerdida, ConviteCartaoLinkInvalido, PortalOtpDialogo, PortalSucesso,
  idiomaDoNavegador, motivoDaVista, useConviteAdmissaoPublico, vistaDoConvite, type ConvitePublico, type IdiomaConvite,
} from "@/components/rh-exemplo/hooks/portalAdmissaoReal";
import { usePortalDocumentosPublico } from "@/components/rh-exemplo/hooks/portalDocumentosPublicoReal";
import { lerAbaDocumentos, lerSeccao, type AbaDocumentos } from "@/components/rh-exemplo/lib/portalEstado";
import { cn } from "@/lib/utils";
import { PortalDocumentosReal } from "./PortalDocumentosReal";
import { PortalAnaliseReal, PortalFichaReal, PortalSeloReal } from "./PortalFichaReal";
import { PortalMolduraReal } from "./PortalMoldura";
import { PortalNavegacao } from "./PortalNavegacao";
import { etiquetaDoEstadoReal } from "./portalRealEstado";

export function PortalReal({ token }: { token: string | undefined }) {
  // A pessoa que abre o link não tem sessão nem preferência: a língua é a do navegador, só neste ecrã.
  const idioma = useMemo(() => idiomaDoNavegador(), []);
  return (
    <IdiomaForcadoProvider idioma={idioma}>
      <PortalRealEcra token={token} idioma={idioma} />
    </IdiomaForcadoProvider>
  );
}

/** Sem sessão na janela de documentos: pede-se o código por e-mail (só aparece com `precisa_otp`; o link sozinho não mostra nada). */
function DocumentosEmConsulta({ convite, aoConfirmarIdentidade }: { convite: ConvitePublico; aoConfirmarIdentidade: () => void }) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="portal-docs-consulta-titulo" className="space-y-3 rounded-lg border bg-background p-5">
      <h1 id="portal-docs-consulta-titulo" className="flex items-center gap-2 text-base font-semibold">
        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        {t("rhPortalReal.docs.consulta.titulo")}
      </h1>
      <p className="text-sm text-muted-foreground">{t("rhPortalReal.docs.consulta.texto")}</p>
      {convite.precisa_otp && (
        <Button type="button" className={cn("min-h-11", FOCO)} onClick={aoConfirmarIdentidade}>
          {t("portal.consulta.botao")}
        </Button>
      )}
    </section>
  );
}

/** Na ficha, quando há pendentes na janela de documentos: um cartão que leva à aba. */
function CartaoDocumentosEspera({ n }: { n: number }) {
  const { t } = useTranslation();
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/5 px-4 py-3 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <FolderOpen className="h-4 w-4 shrink-0" aria-hidden="true" />
        {t("rhPortalReal.docs.esperaTitulo", { n })}
      </p>
      <Link to={{ search: "?sec=documentos" }} className={cn(buttonVariants({ variant: "default" }), "min-h-11", FOCO)}>
        {t("rhPortalReal.docs.esperaAbrir")}
      </Link>
    </div>
  );
}

function PortalRealEcra({ token, idioma }: { token: string | undefined; idioma: IdiomaConvite }) {
  const { t } = useTranslation(idioma);
  const portal = useConviteAdmissaoPublico(token);
  const { sessaoAtiva, otp, pedirCodigo } = portal;
  const escrita = {
    gravarRascunho: portal.gravarRascunho,
    gravarRascunhoAoFechar: portal.gravarRascunhoAoFechar,
    submeter: portal.submeter,
    rascunhoGuardadoEm: portal.rascunhoGuardadoEm,
    aGravar: portal.aGravar,
    erroRascunho: portal.erroRascunho,
  };
  const [dialogoAberto, setDialogoAberto] = useState(false);
  const tituloRef = useRef<HTMLDivElement>(null);
  const docs = usePortalDocumentosPublico(portal);
  const [params, setParams] = useSearchParams();

  // Quando a sessão abre ou acaba, o botão que tinha o foco desaparece: leva-se o foco ao topo.
  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    setDialogoAberto(false);
    tituloRef.current?.focus();
  }, [sessaoAtiva]);

  if (portal.carregando) {
    return (
      <div role="status" className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">{t("portal.carregando")}</span>
      </div>
    );
  }

  const { convite } = portal;
  // Submetido: o ecra de sucesso na moldura do portal. A base fechou o portal, por isso nao se volta a perguntar pelo estado.
  if (portal.concluido && convite) {
    return (
      <PortalMolduraReal
        organizacao={convite.organizacao_nome} nome={convite.primeiro_nome} selo={<PortalSeloReal validUntil={convite.valid_until} />}
        navegacao={<PortalNavegacao seccao="ficha" etiqueta={etiquetaDoEstadoReal("submetida")} pendentes={0} comDocumentos={false} />}
      >
        <PortalSucesso />
      </PortalMolduraReal>
    );
  }
  const vista = vistaDoConvite(portal.erroInicial, convite);
  if (vista === "analise" && convite) {
    return (
      <PortalMolduraReal
        organizacao={convite.organizacao_nome} nome={convite.primeiro_nome} selo={<PortalSeloReal validUntil={convite.valid_until} />}
        navegacao={<PortalNavegacao seccao="ficha" etiqueta={etiquetaDoEstadoReal(convite.estado)} pendentes={0} comDocumentos={false} />}
      >
        <PortalAnaliseReal convite={convite} />
      </PortalMolduraReal>
    );
  }
  if (vista === "documentos" && convite) {
    const seccao = lerSeccao(params.get("sec"), "documentos");
    const aba = lerAbaDocumentos(params.get("aba"));
    const pedirCodigoDocumentos = () => {
      setDialogoAberto(true);
      if (!otp.pedido) void pedirCodigo();
    };
    return (
      <>
        <PortalMolduraReal
          organizacao={convite.organizacao_nome} nome={convite.primeiro_nome}
          aoSair={sessaoAtiva ? () => void portal.terminarSessao() : undefined}
          navegacao={
            <PortalNavegacao
              seccao={seccao} etiqueta={etiquetaDoEstadoReal(convite.estado)} pendentes={docs.dados?.pendentes ?? 0} comDocumentos
            />
          }
        >
          <div ref={tituloRef} id="portal-topo" tabIndex={-1} className="space-y-4 outline-none">
            {!sessaoAtiva && portal.aviso && <AvisoSessaoPerdida aviso={portal.aviso} />}
            {sessaoAtiva && portal.sessaoAExpirar && (
              <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/70 bg-amber-500/10 px-4 py-3 text-sm">
                <p className="flex items-center gap-2"><Clock3 className="h-4 w-4 shrink-0" aria-hidden="true" />{t("portal.sessao.aExpirar")}</p>
                <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={() => void portal.manterSessao()}>
                  {t("portal.sessao.manter")}
                </Button>
              </div>
            )}
            {!sessaoAtiva ? (
              <DocumentosEmConsulta convite={convite} aoConfirmarIdentidade={pedirCodigoDocumentos} />
            ) : seccao === "documentos" ? (
              <PortalDocumentosReal
                docs={docs} aba={aba}
                aoMudarAba={(nova: AbaDocumentos) => setParams({ sec: "documentos", aba: nova }, { replace: true })}
              />
            ) : (
              <>
                <PortalAnaliseReal convite={convite} />
                {(docs.dados?.pendentes ?? 0) > 0 && <CartaoDocumentosEspera n={docs.dados?.pendentes ?? 0} />}
              </>
            )}
          </div>
        </PortalMolduraReal>
        <PortalOtpDialogo
          aberto={dialogoAberto && !sessaoAtiva}
          otp={otp}
          aoFechar={() => setDialogoAberto(false)}
          aoPedirNovo={() => void pedirCodigo()}
          aoConfirmar={portal.verificarCodigo}
        />
      </>
    );
  }
  if (vista !== "consulta" || !convite) {
    return <ConviteCartaoLinkInvalido t={t} motivo={motivoDaVista(vista === "consulta" || vista === "analise" || vista === "documentos" ? "invalido" : vista)} />;
  }

  const confirmarIdentidade = () => {
    setDialogoAberto(true);
    // Reabrir o diálogo depois de cancelar não gasta outro pedido.
    if (!otp.pedido) void pedirCodigo();
  };

  return (
    <>
      <PortalMolduraReal
        organizacao={convite.organizacao_nome}
        nome={convite.primeiro_nome}
        selo={<PortalSeloReal validUntil={convite.valid_until} />}
        aoSair={sessaoAtiva ? () => void portal.terminarSessao() : undefined}
        navegacao={
          <PortalNavegacao
            seccao="ficha" etiqueta={etiquetaDoEstadoReal(portal.dados?.estado ?? convite.estado)} pendentes={0} comDocumentos={false}
          />
        }
      >
        <PortalFichaReal
          convite={convite}
          sessaoAtiva={sessaoAtiva}
          aviso={portal.aviso}
          dados={portal.dados}
          erroLeitura={portal.erroLeitura}
          sessaoAExpirar={portal.sessaoAExpirar}
          aoManterSessao={() => void portal.manterSessao()}
          aoConfirmarIdentidade={confirmarIdentidade}
          escrita={escrita}
          tituloRef={tituloRef}
        />
      </PortalMolduraReal>
      <PortalOtpDialogo
        aberto={dialogoAberto && !sessaoAtiva}
        otp={otp}
        aoFechar={() => setDialogoAberto(false)}
        aoPedirNovo={() => void pedirCodigo()}
        aoConfirmar={portal.verificarCodigo}
      />
    </>
  );
}
