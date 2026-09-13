/**
 * Os locais de trabalho da organizacao activa (`hr_locais_trabalho`).
 *
 * PORQUE EXISTE UMA TABELA PROPRIA
 * --------------------------------
 * Na ronda 1 o local era `pessoas.local_trabalho`, texto livre: "Porto" e
 * "porto" eram dois locais distintos e nao havia como dizer QUANTAS horas se
 * fizeram em cada um. A partir de `20261120130000` o local e uma linha com
 * nome unico por organizacao, e cada intervalo de horario aponta para ele.
 *
 * `organizacao_ref_id` e o que responde a "das 9 as 14 naquela empresa": o
 * local pode referir uma organizacao, e a maioria dos locais nao refere
 * nenhuma (uma loja, uma obra, a casa de um cliente).
 *
 * UMA RECUSA POR PERMISSAO NAO E UM DEFEITO. Quem nao tem `hr.locais.view`
 * fica com a lista vazia e `semPermissao = true` -- e os ecras mostram-no como
 * "pedir a quem gere locais", nao como avaria. Ao Sentry so vai o resto.
 *
 * `apenasAtivos` (por omissao `true`) e o que distingue os DOIS consumidores
 * deste hook: os selectores espalhados pelo formulario de pessoa/assiduidade
 * so querem locais activos (o comportamento de sempre, inalterado); o ecra de
 * GESTAO de centros (`/rh/centros`) precisa de ver tambem os desactivados,
 * para os poder reactivar -- por isso pede `{ apenasAtivos: false }`. Um
 * centro apagado (`deleted_at`) nunca aparece em nenhum dos dois: apagar nao
 * e uma operacao que este modulo ofereca (a base bloqueia o DELETE).
 */
import { useCallback, useEffect, useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { hrFrom, isPermissionError } from "@/lib/hr/hrDb";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import type { LocalTrabalho, TipoLocal } from "@/types/hr";

const COLUNAS = [
  "id",
  "organization_id",
  "nome",
  "codigo",
  "tipo",
  "organizacao_ref_id",
  "organograma_node_id",
  "morada",
  "cidade",
  "codigo_postal",
  "pais",
  "latitude",
  "longitude",
  "contacto_nome",
  "contacto_telefone",
  "activo",
  "notas",
].join(", ");

/** Campos aceites por `criarLocal`/`atualizarLocal`, alem de nome e tipo. */
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

/** `undefined` fica de fora do payload; `""`/`null` viram `null` explicito. */
function limparOpcional(valor: string | null | undefined): string | null | undefined {
  if (valor === undefined) return undefined;
  if (valor === null) return null;
  const aparado = valor.trim();
  return aparado === "" ? null : aparado;
}

/**
 * Para colunas uuid (`organograma_node_id`, `organizacao_ref_id`): o ecra
 * representa "nenhuma escolha" como `""` (o sentinela de `CampoSelect`), mas
 * uma string vazia enviada a uma coluna uuid nao e "sem valor" -- e um erro
 * de sintaxe na base (`invalid input syntax for type uuid`). `undefined`
 * fica de fora do payload; `""` e `null` viram `null` explicito.
 */
function limparUuidOpcional(valor: string | null | undefined): string | null | undefined {
  if (valor === undefined) return undefined;
  if (valor === null || valor.trim() === "") return null;
  return valor;
}

export function useLocaisTrabalho(opcoes: { apenasAtivos?: boolean } = {}) {
  const apenasAtivos = opcoes.apenasAtivos ?? true;
  const { activeCompany } = useCompany();
  const [locais, setLocais] = useState<LocalTrabalho[]>([]);
  const [loading, setLoading] = useState(true);
  const [semPermissao, setSemPermissao] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeCompany?.id) {
      setLocais([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setSemPermissao(false);
    let query = hrFrom("hr_locais_trabalho")
      .select(COLUNAS)
      .eq("organization_id", activeCompany.id)
      .is("deleted_at", null);
    if (apenasAtivos) {
      query = query.eq("activo", true);
    }
    const { data, error: erro } = await query.order("nome", { ascending: true });

    if (erro) {
      if (isPermissionError(erro)) {
        setSemPermissao(true);
      } else {
        captureFlowError(erro, "hr-locais-load");
        setError(await getFriendlyErrorMessage(erro));
      }
      setLocais([]);
      setLoading(false);
      return;
    }
    setLocais((data ?? []) as LocalTrabalho[]);
    setLoading(false);
  }, [activeCompany?.id, apenasAtivos]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Cria um local e devolve o id, ou lanca. `organization_id` vem SEMPRE da
   * organizacao activa: a base recusaria de outra forma, mas nao se manda ao
   * servidor uma escolha que o utilizador nao devia poder fazer.
   */
  const criarLocal = useCallback(
    async (dados: DadosLocalTrabalho): Promise<string> => {
      if (!activeCompany?.id) throw new Error("Sem organizacao activa");
      const autorId = await resolveCurrentBusinessUserId();
      const { data, error: erro } = await hrFrom("hr_locais_trabalho")
        .insert({
          organization_id: activeCompany.id,
          nome: dados.nome.trim(),
          tipo: dados.tipo,
          codigo: limparOpcional(dados.codigo),
          organizacao_ref_id: limparUuidOpcional(dados.organizacao_ref_id),
          organograma_node_id: limparUuidOpcional(dados.organograma_node_id),
          morada: limparOpcional(dados.morada),
          cidade: limparOpcional(dados.cidade),
          codigo_postal: limparOpcional(dados.codigo_postal),
          pais: limparOpcional(dados.pais) ?? null,
          contacto_nome: limparOpcional(dados.contacto_nome),
          contacto_telefone: limparOpcional(dados.contacto_telefone),
          notas: limparOpcional(dados.notas),
          created_by: autorId,
          updated_by: autorId,
        })
        .select("id")
        .single();
      if (erro) {
        if (!isPermissionError(erro)) captureFlowError(erro, "hr-locais-write");
        throw erro;
      }
      await load();
      return (data as { id: string }).id;
    },
    [activeCompany?.id, load],
  );

  /**
   * Actualiza um centro existente. So os campos passados em `dados` mudam --
   * quem chama decide o que edita, `activo` inclusive (ver `definirActivo`,
   * que e o caminho preferido para desactivar/reactivar).
   */
  const atualizarLocal = useCallback(
    async (id: string, dados: Partial<DadosLocalTrabalho>): Promise<void> => {
      if (!activeCompany?.id) throw new Error("Sem organizacao activa");
      const autorId = await resolveCurrentBusinessUserId();
      const payload: Record<string, unknown> = { updated_by: autorId };
      if (dados.nome !== undefined) payload.nome = dados.nome.trim();
      if (dados.tipo !== undefined) payload.tipo = dados.tipo;
      if (dados.codigo !== undefined) payload.codigo = limparOpcional(dados.codigo);
      if (dados.organizacao_ref_id !== undefined) payload.organizacao_ref_id = limparUuidOpcional(dados.organizacao_ref_id);
      if (dados.organograma_node_id !== undefined) payload.organograma_node_id = limparUuidOpcional(dados.organograma_node_id);
      if (dados.morada !== undefined) payload.morada = limparOpcional(dados.morada);
      if (dados.cidade !== undefined) payload.cidade = limparOpcional(dados.cidade);
      if (dados.codigo_postal !== undefined) payload.codigo_postal = limparOpcional(dados.codigo_postal);
      if (dados.pais !== undefined) payload.pais = limparOpcional(dados.pais);
      if (dados.contacto_nome !== undefined) payload.contacto_nome = limparOpcional(dados.contacto_nome);
      if (dados.contacto_telefone !== undefined) payload.contacto_telefone = limparOpcional(dados.contacto_telefone);
      if (dados.notas !== undefined) payload.notas = limparOpcional(dados.notas);

      const { error: erro } = await hrFrom("hr_locais_trabalho")
        .update(payload)
        .eq("id", id)
        .eq("organization_id", activeCompany.id);
      if (erro) {
        if (!isPermissionError(erro)) captureFlowError(erro, "hr-locais-write");
        throw erro;
      }
      await load();
    },
    [activeCompany?.id, load],
  );

  /**
   * Desactiva ou reactiva -- NUNCA apaga. Um centro desactivado sai dos
   * selectores (`apenasAtivos`, por omissao `true`) mas o historico de
   * afectacoes/horario que ja aponta para ele fica intacto: a base bloqueia o
   * DELETE desta tabela (`hr_locais_trabalho_block_delete`, 20261120130000).
   */
  const definirActivo = useCallback(
    async (id: string, activo: boolean): Promise<void> => {
      if (!activeCompany?.id) throw new Error("Sem organizacao activa");
      const autorId = await resolveCurrentBusinessUserId();
      const { error: erro } = await hrFrom("hr_locais_trabalho")
        .update({ activo, updated_by: autorId })
        .eq("id", id)
        .eq("organization_id", activeCompany.id);
      if (erro) {
        if (!isPermissionError(erro)) captureFlowError(erro, "hr-locais-write");
        throw erro;
      }
      await load();
    },
    [activeCompany?.id, load],
  );

  return {
    locais,
    loading,
    semPermissao,
    error,
    refresh: load,
    criarLocal,
    atualizarLocal,
    definirActivo,
  };
}
