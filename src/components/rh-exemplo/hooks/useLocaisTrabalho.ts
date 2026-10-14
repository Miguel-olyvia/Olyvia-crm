/** Os centros de trabalho de exemplo, em memória. Mesma forma do hook real. */
import { useCallback, useMemo } from "react";
import { ORGANIZACAO_EXEMPLO_ID } from "@/components/rh-exemplo/dados/constantes";
import { definirEstado, novoId, useEstadoRh } from "@/components/rh-exemplo/dados/loja";
import type { LocalTrabalho, TipoLocal } from "@/components/rh-exemplo/tipos";

export interface DadosLocalTrabalho {
  nome: string;
  tipo: TipoLocal;
  codigo?: string | null;
  organizacao_ref_id?: string | null;
  organograma_node_id?: string | null;
  morada?: string | null;
  cidade?: string | null;
  codigo_postal?: string | null;
  pais?: string | null;
  contacto_nome?: string | null;
  contacto_telefone?: string | null;
  notas?: string | null;
}

const limpo = (valor: string | null | undefined): string | null =>
  valor === undefined || valor === null || valor.trim() === "" ? null : valor.trim();

export function useLocaisTrabalho(opcoes: { apenasAtivos?: boolean } = {}) {
  const apenasAtivos = opcoes.apenasAtivos ?? true;
  const todos = useEstadoRh((e) => e.locais);
  const locais = useMemo(() => (apenasAtivos ? todos.filter((l) => l.activo) : todos), [todos, apenasAtivos]);

  const criarLocal = useCallback(async (dados: DadosLocalTrabalho): Promise<string> => {
    const id = novoId("loc");
    const novo: LocalTrabalho = {
      id,
      organization_id: ORGANIZACAO_EXEMPLO_ID,
      nome: dados.nome.trim(),
      tipo: dados.tipo,
      codigo: limpo(dados.codigo),
      organizacao_ref_id: limpo(dados.organizacao_ref_id),
      organograma_node_id: limpo(dados.organograma_node_id),
      morada: limpo(dados.morada),
      cidade: limpo(dados.cidade),
      codigo_postal: limpo(dados.codigo_postal),
      pais: limpo(dados.pais),
      latitude: null,
      longitude: null,
      contacto_nome: limpo(dados.contacto_nome),
      contacto_telefone: limpo(dados.contacto_telefone),
      activo: true,
      notas: limpo(dados.notas),
    };
    definirEstado((e) => ({ ...e, locais: [...e.locais, novo] }));
    return id;
  }, []);

  const atualizarLocal = useCallback(async (id: string, dados: Partial<DadosLocalTrabalho>): Promise<void> => {
    definirEstado((e) => ({
      ...e,
      locais: e.locais.map((l) =>
        l.id === id
          ? {
              ...l,
              ...(dados.nome !== undefined ? { nome: dados.nome.trim() } : {}),
              ...(dados.tipo !== undefined ? { tipo: dados.tipo } : {}),
              ...(dados.codigo !== undefined ? { codigo: limpo(dados.codigo) } : {}),
              ...(dados.morada !== undefined ? { morada: limpo(dados.morada) } : {}),
              ...(dados.cidade !== undefined ? { cidade: limpo(dados.cidade) } : {}),
              ...(dados.codigo_postal !== undefined ? { codigo_postal: limpo(dados.codigo_postal) } : {}),
              ...(dados.contacto_nome !== undefined ? { contacto_nome: limpo(dados.contacto_nome) } : {}),
              ...(dados.contacto_telefone !== undefined
                ? { contacto_telefone: limpo(dados.contacto_telefone) }
                : {}),
              ...(dados.notas !== undefined ? { notas: limpo(dados.notas) } : {}),
            }
          : l,
      ),
    }));
  }, []);

  const definirActivo = useCallback(async (id: string, activo: boolean): Promise<void> => {
    definirEstado((e) => ({ ...e, locais: e.locais.map((l) => (l.id === id ? { ...l, activo } : l)) }));
  }, []);

  const refresh = useCallback(async (): Promise<void> => undefined, []);

  return useMemo(
    () => ({
      locais,
      loading: false,
      semPermissao: false,
      error: null as string | null,
      refresh,
      criarLocal,
      atualizarLocal,
      definirActivo,
    }),
    [locais, refresh, criarLocal, atualizarLocal, definirActivo],
  );
}
