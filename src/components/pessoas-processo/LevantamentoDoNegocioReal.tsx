// «Fazer o levantamento» de um negócio, sem sair da ficha: abre o painel «Visita e levantamento» sobre a pessoa, mas a gravar ligado ao negócio
// (`PainelVisitaLevantamentoReal` com `negocioId`: as visitas novas e o levantamento ficam no negócio e na pessoa). Vive à parte do
// `ProcessoProviderReal` (cujo contrato não muda) e só se carrega quando se abre pela primeira vez. Sem ficha, sem a base ou sem permissão para
// editar, `pode` é falso e `abrir` não faz nada: o guia mostra o passo desativado com a razão em vez de um botão morto.
import { createContext, lazy, Suspense, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { FichaDb } from "@/hooks/pessoas/fichaTipos";
import { useFontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { useTranslation } from "@/hooks/useTranslation";

const PainelVisitaLevantamentoReal = lazy(() => import("./PainelVisitaLevantamentoReal").then((m) => ({ default: m.PainelVisitaLevantamentoReal })));

export interface LevantamentoDoNegocioValor {
  /** Pode abrir-se: a base é a fonte e a ficha pode ser editada por quem está na sessão. */
  pode: boolean;
  /** Abre o painel para este negócio; `origem` é o botão a que o foco volta quando o painel fecha. */
  abrir: (negocioId: string, origem: HTMLElement | null) => void;
}

const LevantamentoDoNegocioContext = createContext<LevantamentoDoNegocioValor | null>(null);

/** O levantamento do negócio; `null` fora do provider (o exemplo, e as fichas sem a base). */
export const useLevantamentoDoNegocio = (): LevantamentoDoNegocioValor | null => useContext(LevantamentoDoNegocioContext);

/** O que se ouve enquanto o painel carrega à primeira abertura: sem isto o clique parecia morto. */
function AbrindoPainel() {
  const { t } = useTranslation();
  return <p role="status" className="sr-only">{t("pessoasPagina.process.visitSurvey.loading")}</p>;
}

interface AbertoDoPainel {
  pessoa: string | null;
  negocio: string | null;
  /** Conta as aberturas (0: nunca abriu, e nada se monta). */
  n: number;
}

export function LevantamentoDoNegocioProvider({ ficha, children }: { ficha: FichaDb | null; children: ReactNode }) {
  const fonte = useFontePessoas();
  const [aberto, setAberto] = useState<AbertoDoPainel>({ pessoa: null, negocio: null, n: 0 });
  const origemDoFoco = useRef<HTMLElement | null>(null);
  const pessoaDaFicha = ficha?.pessoa.id ?? null;
  // Trocar de pessoa (ou fechar a ficha) larga o painel: voltar à pessoa em que ele se abriu não o reabre.
  useEffect(() => {
    setAberto((atual) => (atual.pessoa !== null && atual.pessoa !== pessoaDaFicha ? { ...atual, pessoa: null } : atual));
  }, [pessoaDaFicha]);
  const pode = fonte.modo === "real" && ficha?.permissoes.editar === true;
  const valor = useMemo<LevantamentoDoNegocioValor | null>(() => {
    if (!pessoaDaFicha) return null;
    return {
      pode,
      abrir: (negocioId, origem) => {
        if (!pode) return;
        origemDoFoco.current = origem;
        setAberto((atual) => ({ pessoa: pessoaDaFicha, negocio: negocioId, n: atual.n + 1 }));
      },
    };
  }, [pessoaDaFicha, pode]);
  const devolverFoco = (): boolean => {
    const origem = origemDoFoco.current;
    origemDoFoco.current = null;
    if (!origem?.isConnected) return false;
    origem.focus();
    return true;
  };
  return (
    <LevantamentoDoNegocioContext.Provider value={valor}>
      {children}
      {ficha && aberto.n > 0 && (
        <Suspense fallback={<AbrindoPainel />}>
          <PainelVisitaLevantamentoReal
            ficha={ficha} aberto={aberto.pessoa === ficha.pessoa.id} abertura={aberto.n} negocioId={aberto.negocio}
            aoDevolverFoco={devolverFoco}
            aoMudarAberto={(abre) => { if (!abre) setAberto((atual) => ({ ...atual, pessoa: null })); }}
          />
        </Suspense>
      )}
    </LevantamentoDoNegocioContext.Provider>
  );
}
