// O Portal do colaborador LIGADO: a página pública do link de admissão (sem login da aplicação), a falar com a Edge Function
// `convite-admissao`. Percurso: consulta limitada (ação `estado`) -> código por e-mail (`otp_pedir`, `otp_verificar`) -> sessão
// em memória, leitura do que o estado permite (`ler`), NISS e IBAN (`sensiveis`) -> `sair`. A sessão nunca sai da memória.
// Reutiliza as peças do portal real (via `hooks/portalAdmissaoReal`). A troca de documentos com o RH (pedir, enviar, responder)
// NÃO está aqui: não tem tabela nem ação na Edge, e continua só nos links de demonstração.
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { IdiomaForcadoProvider } from "@/contexts/IdiomaForcadoContext";
import { useTranslation } from "@/hooks/useTranslation";
import {
  ConviteCartaoLinkInvalido, PortalConsulta, PortalEmAnalise, PortalMoldura, PortalOtpDialogo, PortalSessaoAtiva,
  idiomaDoNavegador, motivoDaVista, useConviteAdmissaoPublico, vistaDoConvite, type IdiomaConvite,
} from "@/components/rh-exemplo/hooks/portalAdmissaoReal";

export function PortalReal({ token }: { token: string | undefined }) {
  // A pessoa que abre o link não tem sessão nem preferência: a língua é a do navegador, só neste ecrã.
  const idioma = useMemo(() => idiomaDoNavegador(), []);
  return (
    <IdiomaForcadoProvider idioma={idioma}>
      <PortalRealEcra token={token} idioma={idioma} />
    </IdiomaForcadoProvider>
  );
}

function PortalRealEcra({ token, idioma }: { token: string | undefined; idioma: IdiomaConvite }) {
  const { t } = useTranslation(idioma);
  const portal = useConviteAdmissaoPublico(token);
  const { sessaoAtiva, otp, pedirCodigo } = portal;
  const [dialogoAberto, setDialogoAberto] = useState(false);
  const tituloRef = useRef<HTMLDivElement>(null);

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
  const vista = vistaDoConvite(portal.erroInicial, convite);
  if (vista === "analise" && convite) {
    return (
      <PortalMoldura organizacao={convite.organizacao_nome} nome={convite.primeiro_nome}>
        <PortalEmAnalise estado={convite.estado} />
      </PortalMoldura>
    );
  }
  if (vista !== "consulta" || !convite) {
    return <ConviteCartaoLinkInvalido t={t} motivo={motivoDaVista(vista === "consulta" || vista === "analise" ? "invalido" : vista)} />;
  }

  const confirmarIdentidade = () => {
    setDialogoAberto(true);
    // Reabrir o diálogo depois de cancelar não gasta outro pedido.
    if (!otp.pedido) void pedirCodigo();
  };

  return (
    <>
      <PortalMoldura
        organizacao={convite.organizacao_nome}
        nome={convite.primeiro_nome}
        aoSair={sessaoAtiva ? () => void portal.terminarSessao() : undefined}
      >
        {sessaoAtiva ? (
          <PortalSessaoAtiva
            convite={convite}
            dados={portal.dados}
            erroLeitura={portal.erroLeitura}
            sessaoAExpirar={portal.sessaoAExpirar}
            aoManterSessao={() => void portal.manterSessao()}
            aoGravarSensiveis={portal.gravarSensiveis}
            tituloRef={tituloRef}
          />
        ) : (
          <PortalConsulta convite={convite} aviso={portal.aviso} aoConfirmarIdentidade={confirmarIdentidade} tituloRef={tituloRef} />
        )}
      </PortalMoldura>
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
