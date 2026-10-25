// Os passos de documento do guia de um negócio (enviar a proposta, a resposta do cliente, criar o contrato, a assinatura), sem sair da ficha: abre o
// diálogo desse passo por cima do guia (`DialogosDocumentoGuia`, que só se carrega à primeira abertura). Vive à parte do `ProcessoProviderReal` (cujo
// contrato não muda; ele continua a levar estes passos a /proposals e /client-contracts para quem os usa fora do guia). Sem ficha, sem a base, sem
// permissão ou sem o documento no negócio, `pode` é falso e `abrir` não faz nada: o guia mostra o passo desativado com a razão.
import { createContext, lazy, Suspense, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { FichaDb } from "@/hooks/pessoas/fichaTipos";
import { useFontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { useTranslation } from "@/hooks/useTranslation";
import { useFechoV4 } from "@/components/negocio-metas/bandeiraFecho";
import { useMutacoesDaFicha } from "@/components/negocio-metas/mutacoesNegocio";
import { planoDoDocumento, type PassoDocumento, type PlanoDocumento } from "./documentosGuia";

// Os quatro diálogos vêm do mesmo módulo (um só carregamento): são ecrãs grandes que a ficha não paga a quem não os usa.
const EnviarPropostaNoGuia = lazy(() => import("./DialogosDocumentoGuia").then((m) => ({ default: m.EnviarPropostaNoGuia })));
const RespostaPropostaNoGuia = lazy(() => import("./DialogosDocumentoGuia").then((m) => ({ default: m.RespostaPropostaNoGuia })));
const CriarContratoNoGuia = lazy(() => import("./DialogosDocumentoGuia").then((m) => ({ default: m.CriarContratoNoGuia })));
const AssinarContratoNoGuia = lazy(() => import("./DialogosDocumentoGuia").then((m) => ({ default: m.AssinarContratoNoGuia })));

export interface DocumentosDoNegocioValor {
  /** O passo tem documento, permissão e a base à mão: o botão do guia faz alguma coisa. */
  pode: (passo: PassoDocumento, negocioId: string) => boolean;
  /** Abre o diálogo do passo para este negócio. */
  abrir: (passo: PassoDocumento, negocioId: string) => void;
}

const DocumentosContext = createContext<DocumentosDoNegocioValor | null>(null);

/** Os passos de documento do negócio; `null` fora do provider (o exemplo, e as fichas sem a base). */
export const useDocumentosDoNegocio = (): DocumentosDoNegocioValor | null => useContext(DocumentosContext);

/** O que se ouve enquanto o diálogo carrega à primeira abertura: sem isto o clique parecia morto. */
function AbrindoDialogo() {
  const { t } = useTranslation();
  return <p role="status" className="sr-only">{t("pessoasPagina.process.visitSurvey.loading")}</p>;
}

interface Aberto {
  plano: PlanoDocumento;
  negocioId: string;
  pessoa: string;
}

export function DocumentosDoNegocioProvider({ ficha, children }: { ficha: FichaDb | null; children: ReactNode }) {
  const fonte = useFontePessoas();
  const mutacoes = useMutacoesDaFicha();
  const fechoV4 = useFechoV4();
  const [aberto, setAberto] = useState<Aberto | null>(null);
  const pessoaDaFicha = ficha?.pessoa.id ?? null;
  const organizationId = fonte.modo === "real" ? fonte.organizationId : null;
  const permissoes = fonte.modo === "real" ? fonte.permissoesFecho : undefined;
  // Trocar de pessoa (ou fechar a ficha) larga o diálogo: voltar à pessoa em que ele se abriu não o reabre.
  useEffect(() => {
    setAberto((atual) => (atual !== null && atual.pessoa !== pessoaDaFicha ? null : atual));
  }, [pessoaDaFicha]);

  const valor = useMemo<DocumentosDoNegocioValor | null>(() => {
    if (!ficha || !mutacoes || !organizationId) return null;
    const planear = (passo: PassoDocumento, negocioId: string): PlanoDocumento | null => {
      const negocio = ficha.negocios?.itens.find((n) => n.id === negocioId);
      const podeEditar = ficha.permissoes.editar === true && negocio?.pode_editar !== false && negocio?.estado !== "ganho" && negocio?.estado !== "perdido";
      return planoDoDocumento(passo, negocio, { podeEditar, permissoes, fechoV4 });
    };
    return {
      pode: (passo, negocioId) => planear(passo, negocioId) !== null,
      abrir: (passo, negocioId) => {
        const plano = planear(passo, negocioId);
        if (plano) setAberto({ plano, negocioId, pessoa: ficha.pessoa.id });
      },
    };
  }, [ficha, mutacoes, organizationId, permissoes, fechoV4]);

  const fechar = (): void => setAberto(null);
  const dialogo = aberto && ficha && aberto.pessoa === ficha.pessoa.id && mutacoes && organizationId
    ? <Suspense fallback={<AbrindoDialogo />}><DialogoAberto aberto={aberto} organizationId={organizationId} mutacoes={mutacoes} aoFechar={fechar} permissoes={permissoes} /></Suspense>
    : null;
  return (
    <DocumentosContext.Provider value={valor}>
      {children}
      {dialogo}
    </DocumentosContext.Provider>
  );
}

type PropsDoDialogo = {
  aberto: Aberto;
  organizationId: string;
  mutacoes: NonNullable<ReturnType<typeof useMutacoesDaFicha>>;
  aoFechar: () => void;
  permissoes: readonly string[] | undefined;
};

/** Escolhe o diálogo do passo. Fica dentro do `Suspense`: o módulo dos diálogos só se pede quando há um aberto. */
function DialogoAberto({ aberto, organizationId, mutacoes, aoFechar, permissoes }: PropsDoDialogo) {
  const { plano, negocioId } = aberto;
  const comum = { organizationId, mutacoes, aoFechar, permissoes };
  switch (plano.passo) {
    case "enviarProposta": return <EnviarPropostaNoGuia plano={plano} {...comum} />;
    case "registarRespostaCliente": return <RespostaPropostaNoGuia plano={plano} {...comum} />;
    case "criarContrato": return <CriarContratoNoGuia plano={plano} negocioId={negocioId} {...comum} />;
    case "registarAssinatura": return <AssinarContratoNoGuia plano={plano} {...comum} />;
  }
}
