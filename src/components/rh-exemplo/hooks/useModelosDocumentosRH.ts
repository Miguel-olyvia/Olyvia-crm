/** Os modelos de documento de RH de exemplo, em memória (os mesmos que a ficha usa para emitir documentos). */
import { useCallback, useMemo } from "react";
import { ORGANIZACAO_EXEMPLO_ID } from "@/components/rh-exemplo/dados/constantes";
import { definirEstado, novoId, useEstadoRh } from "@/components/rh-exemplo/dados/loja";
import type { PessoaDocumentoModelo, TipoDocumentoRH } from "@/components/rh-exemplo/tipos";

export interface ModeloDocumentoRH extends PessoaDocumentoModelo {
  created_at: string;
  updated_at: string;
}

export interface NovoModeloDocumentoRH {
  nome: string;
  tipo: TipoDocumentoRH;
  corpo_html: string;
  variaveis: string[];
}

export type EdicaoModeloDocumentoRH = NovoModeloDocumentoRH & { id: string };

const CRIADO = "2024-01-02T09:00:00Z";

export function useModelosDocumentosRH() {
  const todos = useEstadoRh((e) => e.modelos);

  const modelos = useMemo<ModeloDocumentoRH[]>(
    () =>
      todos
        .map((m) => ({ ...m, created_at: CRIADO, updated_at: CRIADO }))
        .sort((a, b) => a.nome.localeCompare(b.nome)),
    [todos],
  );

  const criar = useCallback(async (novo: NovoModeloDocumentoRH): Promise<void> => {
    const modelo: PessoaDocumentoModelo = {
      id: novoId("mod"),
      organization_id: ORGANIZACAO_EXEMPLO_ID,
      nome: novo.nome,
      tipo: novo.tipo,
      corpo_html: novo.corpo_html,
      variaveis: novo.variaveis,
      activo: true,
    };
    definirEstado((e) => ({ ...e, modelos: [...e.modelos, modelo] }));
  }, []);

  const editar = useCallback(async (edicao: EdicaoModeloDocumentoRH): Promise<void> => {
    definirEstado((e) => ({
      ...e,
      modelos: e.modelos.map((m) =>
        m.id === edicao.id
          ? { ...m, nome: edicao.nome, tipo: edicao.tipo, corpo_html: edicao.corpo_html, variaveis: edicao.variaveis }
          : m,
      ),
    }));
  }, []);

  const definirActivo = useCallback(async (id: string, activo: boolean): Promise<void> => {
    definirEstado((e) => ({ ...e, modelos: e.modelos.map((m) => (m.id === id ? { ...m, activo } : m)) }));
  }, []);

  return { modelos, isLoading: false, error: null as unknown, isSaving: false, criar, editar, definirActivo };
}
