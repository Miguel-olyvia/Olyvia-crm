/**
 * Os ficheiros anexados ao convite de admissão, em memória: valida o ficheiro como o ecrã real (formato, tamanho,
 * limites de contagem) e fica com ele só enquanto a página estiver aberta. Nada é enviado.
 *
 * SÓ PRÉ-VISUALIZAÇÃO (links de demonstração). NÃO há equivalente real a ligar: o hook real `@/hooks/useConviteAnexos` do portal real
 * (V3a) não tem envio de ficheiros, e a Edge `convite-admissao` responde 410 `portal_em_atualizacao` a `rascunho`, `submeter` e aos
 * anexos (`portalAntigoAtivo` nunca é ligado em `index.ts`). Os links reais usam `PortalReal`, que fala com a Edge.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import {
  contarPorTipo,
  validarFicheiroLocal,
  verificarLimitesDeContagem,
  type AnexoConvite,
  type ContagemPorTipo,
  type TipoAnexoConvite,
} from "@/components/rh-exemplo/lib/conviteAnexos";

export type FaseEnvio = "a_enviar" | "a_verificar" | "erro";

export interface EnvioAnexo {
  tipo: TipoAnexoConvite;
  nome: string;
  fase: FaseEnvio;
  progresso: number;
  codigoErro: string | null;
}

export interface ContagemAnexos {
  total: number;
  porTipo: ContagemPorTipo;
}

export interface ResultadoConviteAnexos {
  anexos: AnexoConvite[];
  envios: Record<string, EnvioAnexo>;
  emCurso: boolean;
  removendo: ReadonlySet<string>;
  contagem: ContagemAnexos;
  erroConvite: string | null;
  adicionar: (tipo: TipoAnexoConvite, file: File) => Promise<void>;
  remover: (id: string) => Promise<void>;
}

const SEM_REMOCOES: ReadonlySet<string> = new Set();

export function useConviteAnexos(
  _token: string | undefined,
  iniciais?: AnexoConvite[],
): ResultadoConviteAnexos {
  const [anexos, setAnexos] = useState<AnexoConvite[]>(() => (iniciais ? [...iniciais] : []));
  const [envios, setEnvios] = useState<Record<string, EnvioAnexo>>({});
  const contador = useRef(0);

  const adicionar = useCallback(
    async (tipo: TipoAnexoConvite, file: File): Promise<void> => {
      contador.current += 1;
      const numero = contador.current;
      const semErrosDoTipo = Object.fromEntries(
        Object.entries(envios).filter(([, e]) => !(e.tipo === tipo && e.fase === "erro")),
      );
      const recusa = validarFicheiroLocal(tipo, file) ?? verificarLimitesDeContagem(tipo, contarPorTipo(anexos));
      if (recusa) {
        setEnvios({
          ...semErrosDoTipo,
          [`envio-${numero}`]: { tipo, nome: file.name, fase: "erro", progresso: 0, codigoErro: recusa },
        });
        return;
      }
      setEnvios(semErrosDoTipo);
      setAnexos((actuais) => [
        ...actuais,
        { id: `anexo-${numero}`, tipo, nome_original: file.name, tamanho_bytes: file.size, mime_type: file.type },
      ]);
    },
    [anexos, envios],
  );

  const remover = useCallback(async (id: string): Promise<void> => {
    setAnexos((actuais) => actuais.filter((a) => a.id !== id));
  }, []);

  const contagem = useMemo<ContagemAnexos>(
    () => ({ total: anexos.length, porTipo: contarPorTipo(anexos) }),
    [anexos],
  );

  return { anexos, envios, emCurso: false, removendo: SEM_REMOCOES, contagem, erroConvite: null, adicionar, remover };
}
