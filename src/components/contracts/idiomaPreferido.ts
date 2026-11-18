// A escolha de idiomas ao gerar um contrato: pré-seleciona o último idioma usado por ESTE utilizador com ESTA
// minuta (localStorage; nada vai para a base). Sem preferência, o idioma base. Tudo o que toca no armazenamento
// está protegido (modo privado, quota cheia, valor corrompido): nunca impede de gerar o contrato.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { ordenarPorRegisto, parseEscolha, serializarEscolha } from "@/lib/idiomaDocumento";

const PREFIXO = "olyvia:idioma-contrato";

export function chavePreferencia(utilizadorId: string, minutaId: string): string {
  return `${PREFIXO}:${utilizadorId}:${minutaId}`;
}

/** A última escolha guardada, ou null (nada guardado, valor ilegível ou armazenamento indisponível). */
export function lerPreferencia(utilizadorId: string, minutaId: string): string[] | null {
  try {
    const bruto = window.localStorage.getItem(chavePreferencia(utilizadorId, minutaId));
    if (!bruto || !/^[a-z]{2}(\+[a-z]{2})*$/i.test(bruto)) return null;
    return parseEscolha(bruto);
  } catch {
    return null;
  }
}

export function guardarPreferencia(utilizadorId: string, minutaId: string, escolha: readonly string[]): void {
  try {
    window.localStorage.setItem(chavePreferencia(utilizadorId, minutaId), serializarEscolha(escolha));
  } catch {
    /* sem armazenamento: perde-se a pré-seleção, nada mais */
  }
}

/** A escolha guardada reduzida aos idiomas que a minuta tem; vazia se não sobrar nenhum. */
function dentroDosDisponiveis(escolha: readonly string[] | null, disponiveis: readonly string[]): string[] {
  return escolha ? ordenarPorRegisto(escolha.filter((c) => disponiveis.includes(c))) : [];
}

export interface EscolhaDeIdiomas {
  escolha: string[];
  mudar: (escolha: string[]) => void;
}

/**
 * A escolha de idiomas de um contrato a gerar com a minuta `minutaId`: a que o utilizador fez neste ecrã, senão a
 * última que usou com esta minuta, senão `base`. `disponiveis` são os idiomas que a minuta tem.
 */
export function useEscolhaDeIdiomas(
  minutaId: string | null | undefined,
  disponiveis: readonly string[],
  base: string,
): EscolhaDeIdiomas {
  const [utilizadorId, setUtilizadorId] = useState<string | null>(null);
  const [manual, setManual] = useState<{ minutaId: string | null; escolha: string[] } | null>(null);
  const utilizadorRef = useRef<Promise<string | null> | null>(null);

  const obterUtilizador = useCallback((): Promise<string | null> => {
    if (!utilizadorRef.current) {
      utilizadorRef.current = resolveCurrentBusinessUserId().then(
        (id) => id ?? null,
        () => null,
      );
    }
    return utilizadorRef.current;
  }, []);

  useEffect(() => {
    let vivo = true;
    void obterUtilizador().then((id) => {
      if (vivo) setUtilizadorId(id);
    });
    return () => {
      vivo = false;
    };
  }, [obterUtilizador]);

  const chaveDisponiveis = disponiveis.join("+");
  const escolha = useMemo(() => {
    const lista = chaveDisponiveis ? chaveDisponiveis.split("+") : [];
    const feita = manual && manual.minutaId === (minutaId ?? null) ? dentroDosDisponiveis(manual.escolha, lista) : [];
    if (feita.length > 0) return feita;
    const guardada = utilizadorId && minutaId ? dentroDosDisponiveis(lerPreferencia(utilizadorId, minutaId), lista) : [];
    return guardada.length > 0 ? guardada : [base];
  }, [manual, minutaId, utilizadorId, chaveDisponiveis, base]);

  const mudar = useCallback(
    (nova: string[]) => {
      setManual({ minutaId: minutaId ?? null, escolha: nova });
      if (!minutaId) return;
      void obterUtilizador().then((id) => {
        if (id) guardarPreferencia(id, minutaId, nova);
      });
    },
    [minutaId, obterUtilizador],
  );

  return { escolha, mudar };
}
