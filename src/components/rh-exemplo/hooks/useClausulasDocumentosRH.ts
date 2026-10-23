/** As cláusulas reutilizáveis dos modelos de documento de RH, em memória. */
import { useCallback, useMemo } from "react";
import { ORGANIZACAO_EXEMPLO_ID } from "@/components/rh-exemplo/dados/constantes";
import { definirGestao, novoIdGestao, useGestao } from "@/components/rh-exemplo/dados/lojaGestao";

export interface ClausulaDocumentoRH {
  id: string;
  organization_id: string;
  nome: string;
  categoria: string | null;
  corpo_html: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface NovaClausulaDocumentoRH {
  nome: string;
  categoria: string | null;
  corpo_html: string;
}

export type EdicaoClausulaDocumentoRH = NovaClausulaDocumentoRH & { id: string };

export function useClausulasDocumentosRH() {
  const todas = useGestao((g) => g.clausulas);
  const clausulas = useMemo<ClausulaDocumentoRH[]>(() => [...todas].sort((a, b) => a.nome.localeCompare(b.nome)), [todas]);

  const criar = useCallback(async (nova: NovaClausulaDocumentoRH): Promise<void> => {
    const agora = new Date().toISOString();
    definirGestao((g) => ({
      ...g,
      clausulas: [
        ...g.clausulas,
        {
          id: novoIdGestao("cl"),
          organization_id: ORGANIZACAO_EXEMPLO_ID,
          nome: nova.nome,
          categoria: nova.categoria,
          corpo_html: nova.corpo_html,
          activo: true,
          created_at: agora,
          updated_at: agora,
        },
      ],
    }));
  }, []);

  const editar = useCallback(async (edicao: EdicaoClausulaDocumentoRH): Promise<void> => {
    definirGestao((g) => ({
      ...g,
      clausulas: g.clausulas.map((c) =>
        c.id === edicao.id
          ? { ...c, nome: edicao.nome, categoria: edicao.categoria, corpo_html: edicao.corpo_html, updated_at: new Date().toISOString() }
          : c,
      ),
    }));
  }, []);

  const definirActivo = useCallback(async (id: string, activo: boolean): Promise<void> => {
    definirGestao((g) => ({ ...g, clausulas: g.clausulas.map((c) => (c.id === id ? { ...c, activo } : c)) }));
  }, []);

  return { clausulas, isLoading: false, error: null as unknown, isSaving: false, criar, editar, definirActivo };
}
