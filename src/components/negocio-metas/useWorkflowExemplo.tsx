// O estado da aba "Workflow": a configuração de exemplo, que só vive neste navegador (ver
// `workflowGuardado.ts`). Um provider à volta da página deixa o painel de um negócio ler a
// mesma configuração; sem provider, quem lê recebe a predefinição e nada se grava.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { guardarWorkflow, lerWorkflow } from "./workflowGuardado";
import { PREDEFINICAO, copiarConfig, normalizarConfig, type ConfigWorkflow, type Texto } from "./workflowNegocio";

/** Uma mudança parcial; `fases` também pode vir só com um dos dois campos. */
export type MudancaWorkflow = Partial<Omit<ConfigWorkflow, "fases">> & { fases?: Partial<ConfigWorkflow["fases"]> };

/** Um aviso com número de série: o número serve de `key`, para o DOM mudar e o leitor de ecrã o anunciar outra vez. */
export interface AvisoWorkflow {
  id: number;
  texto: Texto;
}

export interface WorkflowExemplo {
  config: ConfigWorkflow;
  /** O que mudou sozinho na última alteração ("Alterámos X porque Y"). */
  avisos: AvisoWorkflow[];
  /** Número de série da última reposição da predefinição (`null` = nenhuma desde a última alteração). */
  reposta: number | null;
  mudar: (mudanca: MudancaWorkflow) => void;
  repor: () => void;
  /** Esquece o aviso e a "Predefinição reposta" da última alteração (ao fechar o diálogo do workflow). */
  limparAvisos: () => void;
}

const SEM_PROVIDER: WorkflowExemplo = { config: PREDEFINICAO, avisos: [], reposta: null, mudar: () => {}, repor: () => {}, limparAvisos: () => {} };

export const WorkflowExemploContext = createContext<WorkflowExemplo | null>(null);

/** A configuração de exemplo; fora do provider devolve a predefinição, só de leitura. */
export function useWorkflowExemplo(): WorkflowExemplo {
  return useContext(WorkflowExemploContext) ?? SEM_PROVIDER;
}

export function useEstadoWorkflowExemplo(): WorkflowExemplo {
  const [config, setConfig] = useState<ConfigWorkflow>(lerWorkflow);
  const [avisos, setAvisos] = useState<AvisoWorkflow[]>([]);
  const [reposta, setReposta] = useState<number | null>(null);
  const serie = useRef(0);

  const aplicar = useCallback((proxima: ConfigWorkflow, repondo: boolean) => {
    const { config: coerente, avisos: textos } = normalizarConfig(proxima);
    setConfig(coerente);
    setAvisos(textos.map((texto) => ({ id: ++serie.current, texto })));
    setReposta(repondo ? ++serie.current : null);
    guardarWorkflow(coerente);
  }, []);

  const mudar = useCallback((m: MudancaWorkflow) => {
    aplicar({ ...config, ...m, fases: { ...config.fases, ...m.fases } }, false);
  }, [config, aplicar]);

  const repor = useCallback(() => aplicar(copiarConfig(PREDEFINICAO), true), [aplicar]);
  const limparAvisos = useCallback(() => { setAvisos([]); setReposta(null); }, []);

  return useMemo(
    () => ({ config, avisos, reposta, mudar, repor, limparAvisos }), [config, avisos, reposta, mudar, repor, limparAvisos],
  );
}

export function WorkflowExemploProvider({ children }: { children: ReactNode }) {
  const estado = useEstadoWorkflowExemplo();
  return <WorkflowExemploContext.Provider value={estado}>{children}</WorkflowExemploContext.Provider>;
}
