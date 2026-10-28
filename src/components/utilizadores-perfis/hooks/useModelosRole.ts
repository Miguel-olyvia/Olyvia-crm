// Wrapper: os modelos de role (role_templates e role_template_permissions) para "Começar de um modelo". Como em Roles.tsx,
// as permissões de um modelo só entram se quem edita as tiver. Uma falha de leitura sobe como `erro` (não se esconde).
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Editor } from "../logica";
import type { ModeloRole } from "../modelosRole";
import { mensagemDeErro, tiraPermissoesDoEditor } from "../rolesReais";

interface LinhaModelo { id: string; name: string; description: string | null }
interface LinhaPermissaoModelo { template_id: string; permission_code: string }

async function lerModelos(): Promise<LinhaModelo[]> {
  const { data, error } = await supabase.from("role_templates").select("*").eq("is_active", true).order("display_order");
  if (error) throw error;
  return (data ?? []) as unknown as LinhaModelo[];
}

async function lerPermissoesDosModelos(): Promise<LinhaPermissaoModelo[]> {
  const { data, error } = await supabase.from("role_template_permissions").select("template_id, permission_code");
  if (error) throw error;
  return (data ?? []) as unknown as LinhaPermissaoModelo[];
}

export interface ModelosRole {
  modelos: ModeloRole[];
  carregando: boolean;
  erro: string | null;
}

export function useModelosRole(editor: Editor): ModelosRole {
  const modelos = useQuery({ queryKey: ["role_templates"], queryFn: lerModelos });
  const permissoes = useQuery({ queryKey: ["role_template_permissions"], queryFn: lerPermissoesDosModelos });
  const lista = useMemo<ModeloRole[]>(
    () => (modelos.data ?? []).map((m) => ({
      id: m.id, nome: m.name, descricao: m.description ?? "",
      permissoes: tiraPermissoesDoEditor((permissoes.data ?? []).filter((p) => p.template_id === m.id).map((p) => p.permission_code), editor),
    })),
    [modelos.data, permissoes.data, editor],
  );
  const falha = modelos.error ?? permissoes.error;
  return { modelos: lista, carregando: modelos.isPending || permissoes.isPending, erro: falha ? mensagemDeErro(falha) : null };
}
