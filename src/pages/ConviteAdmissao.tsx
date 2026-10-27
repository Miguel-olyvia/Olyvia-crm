/**
 * O PORTAL temporario da admissao -- pagina PUBLICA (/admissao/:token), SEM sessao da app e
 * fora do layout, aberta pelo link que o e-mail do convite leva. Substitui o formulario
 * antigo, que gravava rascunho e submetia directo sem confirmar quem era a pessoa.
 *
 * O PERCURSO
 *  1. Ao abrir o link so ha CONSULTA LIMITADA: organizacao, primeiro nome, estado do processo e
 *     prazo. Nenhum dado pessoal. A Edge (`estado`) nao devolve mais do que isso sem sessao.
 *  2. "Confirmar identidade para editar" pede um codigo de 6 algarismos ao e-mail do convite
 *     (OTP) e abre o passo do codigo.
 *  3. Com o codigo certo abre-se uma SESSAO (30 min sem actividade, 4 h no maximo): a pessoa ve
 *     o que o estado permite, preenche o formulario (que se grava sozinho como rascunho, NISS e IBAN
 *     incluidos, cifrados), submete e pode terminar a sessao. O link sozinho NAO escreve.
 *  4. Depois de submeter ve o ecra de sucesso e o link fica fechado.
 *  5. Sem acesso (link invalido, revogado, encerrado, expirado, bloqueado) ou com o processo em
 *     analise, a pessoa ve so o estado e e mandada contactar o RH.
 *
 * O QUE FICA PARA UMA FASE SEGUINTE (desenhado e desactivado, com a razao): enviar documentos (anexos),
 * contrato e assinatura, pedidos de documentos.
 *
 * O token do link vem do caminho e nao se copia para outro sitio; a sessao so vive em MEMORIA (ver
 * `lib/hr/portalSessao.ts`): recarregar ou fechar o separador pede o codigo de novo. A lingua escolhe-se
 * pelo navegador (pt, es, fr, de ou en; portugues por omissao), so neste ecra: quem abre o link nao tem
 * sessao nem preferencia.
 *
 * O QUE SE REUTILIZA DO CONVITE QUE JA EXISTIA: o formulario (`ConvitePagina1` e `ConvitePagina2`, dentro
 * de `PortalFormulario`), a saudacao (`ConviteSaudacao`, dentro de `TopoPortal`) e o cartao de link
 * invalido (`ConviteCartaoLinkInvalido`) para todas as vistas sem acesso, menos a de processo em analise.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { IdiomaForcadoProvider } from "@/contexts/IdiomaForcadoContext";
import { useTranslation } from "@/hooks/useTranslation";
import { useConviteAdmissaoPublico } from "@/hooks/useConviteAdmissaoPublico";
import { idiomaDoNavegador, type IdiomaConvite } from "@/lib/hr/conviteAdmissaoEcra";
import { motivoDaVista, vistaDoConvite } from "@/lib/hr/portalAdmissao";
import { ConviteCartaoLinkInvalido } from "@/components/hr/convite/ConviteCartaoLinkInvalido";
import { PortalConsulta } from "@/components/hr/portal/PortalConsulta";
import { PortalMoldura } from "@/components/hr/portal/PortalMoldura";
import { PortalOtpDialogo } from "@/components/hr/portal/PortalOtpDialogo";
import { PortalEmAnalise } from "@/components/hr/portal/PortalSemAcesso";
import { PortalSessaoAtiva } from "@/components/hr/portal/PortalSessaoAtiva";
import { PortalSucesso } from "@/components/hr/portal/PortalSucesso";

export default function ConviteAdmissao() {
  // O provider faz com que os componentes da arvore (que chamam useTranslation() sem
  // argumento) usem a mesma lingua; o resto da aplicacao nao a muda.
  const idioma = useMemo(() => idiomaDoNavegador(), []);
  return (
    <IdiomaForcadoProvider idioma={idioma}>
      <PortalEcra idioma={idioma} />
    </IdiomaForcadoProvider>
  );
}

function PortalEcra({ idioma }: { idioma: IdiomaConvite }) {
  const { t } = useTranslation(idioma);
  const { token } = useParams<{ token: string }>();
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

  // FOCO. Quando a sessao abre ou acaba, o botao que o tinha desaparece e o foco cairia para o
  // corpo da pagina: leva-se ao topo (a saudacao, que e focavel sem entrar na ordem de tabulacao).
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
  // Submetido: a base fechou o portal; o ecra de sucesso fica no lugar, sem voltar a perguntar pelo estado.
  if (portal.concluido && convite) {
    return (
      <PortalMoldura organizacao={convite.organizacao_nome} nome={convite.primeiro_nome}>
        <PortalSucesso />
      </PortalMoldura>
    );
  }
  const vista = vistaDoConvite(portal.erroInicial, convite);
  // Em analise: so o estado (sem dados nem nome), dentro da moldura do portal.
  if (vista === "analise" && convite) {
    return (
      <PortalMoldura organizacao={convite.organizacao_nome} nome={convite.primeiro_nome}>
        <PortalEmAnalise estado={convite.estado} />
      </PortalMoldura>
    );
  }
  // Link invalido, revogado, encerrado, expirado ou bloqueado: o cartao que o convite ja tinha.
  if (vista !== "consulta" || !convite) {
    return <ConviteCartaoLinkInvalido t={t} motivo={motivoDaVista(vista === "consulta" || vista === "analise" ? "invalido" : vista)} />;
  }

  const confirmarIdentidade = () => {
    setDialogoAberto(true);
    // Reabrir o dialogo depois de cancelar nao gasta outro pedido (so 1 por minuto, 10 por dia).
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
            escrita={escrita}
            tituloRef={tituloRef}
          />
        ) : (
          <PortalConsulta
            convite={convite}
            aviso={portal.aviso}
            aoConfirmarIdentidade={confirmarIdentidade}
            tituloRef={tituloRef}
          />
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
