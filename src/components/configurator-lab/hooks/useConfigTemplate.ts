/**
 * useConfigTemplate — hook isolado para o Lab do configurador (Fase 2 + 4).
 *
 * Carrega TODAS as versões do template para um produto, expõe a versão
 * selecionada (default = ativa, fallback = mais recente) e suporta:
 *   - createFirstVersion (cria v1 ativa quando não existe nenhuma versão)
 *   - duplicateVersion (cópia Lab-only, fail-closed com cleanup)
 *   - selectVersion (apenas troca o foco do editor)
 *
 * Sem publish, sem delete nesta fase. Edições aplicam-se sempre à versão
 * selecionada (selectedTemplate), nunca implicitamente à ativa.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";

export interface CTemplate {
  id: string;
  organization_id: string;
  product_id: string;
  name: string;
  version: number;
  is_active: boolean;
  created_at: string;
}
export interface CBlock {
  id: string;
  organization_id: string;
  template_id: string;
  label: string;
  description: string | null;
  sort_order: number;
  is_required: boolean;
}
export interface CSlot {
  id: string;
  organization_id: string;
  block_id: string;
  slot_key: string;
  label: string;
  slot_type: "attribute_value" | "component_product" | "quantity" | "measure" | "boolean" | "custom_input";
  attribute_id: string | null;
  required: boolean;
  min_quantity: number | null;
  max_quantity: number | null;
  pricing_behavior: string;
  inventory_behavior: string;
  sort_order: number;
}
export interface CSlotOption {
  id: string;
  organization_id: string;
  slot_id: string;
  attribute_value_id: string | null;
  component_product_id: string | null;
  label: string;
  is_enabled: boolean;
  default_quantity: number | null;
  sort_order: number;
}
export interface CRule {
  id: string;
  organization_id: string;
  template_id: string;
  rule_type: "compatibility" | "visibility" | "requirement" | "quantity" | "defaulting";
  source_slot_id: string | null;
  source_operator: string | null;
  source_value: any;
  target_slot_id: string | null;
  target_action:
    | "allow_options"
    | "deny_options"
    | "show_slot"
    | "hide_slot"
    | "require_slot"
    | "set_quantity"
    | "set_default";
  target_value: any;
  priority: number;
  message: string | null;
  is_active: boolean;
}

export function useConfigTemplate(productId: string | null, organizationId: string | null) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [versions, setVersions] = useState<CTemplate[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<CBlock[]>([]);
  const [slots, setSlots] = useState<CSlot[]>([]);
  const [options, setOptions] = useState<CSlotOption[]>([]);
  const [rules, setRules] = useState<CRule[]>([]);

  const activeTemplate = useMemo(
    () => versions.find((v) => v.is_active) ?? null,
    [versions]
  );
  const selectedTemplate = useMemo(
    () => versions.find((v) => v.id === selectedVersionId) ?? null,
    [versions, selectedVersionId]
  );

  const identityGuard = useCallback(async (): Promise<string | null> => {
    const id = await resolveCurrentBusinessUserId();
    if (!id) {
      toast({
        title: "Erro de identidade",
        description: "Não foi possível resolver o utilizador de negócio.",
        variant: "destructive",
      });
      return null;
    }
    return id;
  }, [toast]);

  // Carrega todas as versões do produto
  const reloadVersions = useCallback(async (): Promise<CTemplate[]> => {
    if (!productId || !organizationId) {
      setVersions([]);
      setSelectedVersionId(null);
      return [];
    }
    const { data, error } = await supabase
      .from("product_configuration_templates")
      .select("*")
      .eq("product_id", productId)
      .eq("organization_id", organizationId)
      .order("version", { ascending: false });
    if (error) {
      console.error("[useConfigTemplate] reloadVersions error", error);
      toast({
        title: "Erro a carregar versões",
        description: error.message,
        variant: "destructive",
      });
      setVersions([]);
      return [];
    }
    const list = (data ?? []) as CTemplate[];
    setVersions(list);
    return list;
  }, [productId, organizationId, toast]);

  // Carrega filhos (blocks/slots/options/rules) da versão selecionada
  const reloadChildren = useCallback(
    async (templateId: string | null) => {
      if (!templateId) {
        setBlocks([]);
        setSlots([]);
        setOptions([]);
        setRules([]);
        return;
      }
      try {
        const [b, r] = await Promise.all([
          supabase
            .from("product_config_blocks")
            .select("*")
            .eq("template_id", templateId)
            .order("sort_order"),
          supabase
            .from("product_config_rules")
            .select("*")
            .eq("template_id", templateId)
            .order("priority"),
        ]);
        if (b.error) throw b.error;
        if (r.error) throw r.error;
        const blockRows = (b.data ?? []) as CBlock[];
        setBlocks(blockRows);
        setRules((r.data ?? []) as CRule[]);

        const blockIds = blockRows.map((x) => x.id);
        if (blockIds.length === 0) {
          setSlots([]);
          setOptions([]);
          return;
        }
        const { data: slotRows, error: sErr } = await supabase
          .from("product_config_slots")
          .select("*")
          .in("block_id", blockIds)
          .order("sort_order");
        if (sErr) throw sErr;
        const slotsArr = (slotRows ?? []) as CSlot[];
        setSlots(slotsArr);

        const slotIds = slotsArr.map((s) => s.id);
        if (slotIds.length === 0) {
          setOptions([]);
          return;
        }
        const { data: optRows, error: oErr } = await supabase
          .from("product_config_slot_options")
          .select("*")
          .in("slot_id", slotIds)
          .order("sort_order");
        if (oErr) throw oErr;
        setOptions((optRows ?? []) as CSlotOption[]);
      } catch (err: any) {
        console.error("[useConfigTemplate] reloadChildren error", err);
        toast({
          title: "Erro a carregar template",
          description: err.message ?? String(err),
          variant: "destructive",
        });
      }
    },
    [toast]
  );

  // Effect: ao mudar produto/organização, recarrega versões e escolhe default
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const list = await reloadVersions();
      if (cancelled) return;
      const next =
        list.find((v) => v.is_active)?.id ??
        list[0]?.id ??
        null;
      setSelectedVersionId(next);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [productId, organizationId, reloadVersions]);

  // Effect: ao mudar versão selecionada, recarrega filhos
  useEffect(() => {
    reloadChildren(selectedVersionId);
  }, [selectedVersionId, reloadChildren]);

  const reload = useCallback(async () => {
    const list = await reloadVersions();
    const stillExists = selectedVersionId && list.some((v) => v.id === selectedVersionId);
    const targetId = stillExists
      ? selectedVersionId!
      : list.find((v) => v.is_active)?.id ?? list[0]?.id ?? null;
    if (targetId !== selectedVersionId) {
      setSelectedVersionId(targetId);
    } else {
      await reloadChildren(targetId);
    }
  }, [reloadVersions, reloadChildren, selectedVersionId]);

  const selectVersion = useCallback((id: string) => {
    setSelectedVersionId(id);
  }, []);

  // ---------------- Mutations (versionamento) ----------------

  const createFirstVersion = useCallback(
    async (name: string) => {
      if (!productId || !organizationId) return;
      if (versions.length > 0) {
        toast({
          title: "Já existem versões",
          description: "Use 'Duplicar para teste' para criar uma nova versão inativa.",
          variant: "destructive",
        });
        return;
      }
      const created_by = await identityGuard();
      if (!created_by) return;
      const { data, error } = await supabase
        .from("product_configuration_templates")
        .insert({
          organization_id: organizationId,
          product_id: productId,
          name,
          version: 1,
          is_active: true,
          created_by,
        })
        .select()
        .single();
      if (error) {
        toast({ title: "Erro a criar template", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Template v1 criado" });
      const list = await reloadVersions();
      const newId = (data as CTemplate).id;
      setSelectedVersionId(list.some((v) => v.id === newId) ? newId : list[0]?.id ?? null);
    },
    [productId, organizationId, versions.length, identityGuard, reloadVersions, toast]
  );

  const duplicateVersion = useCallback(
    async (sourceId: string) => {
      if (!productId || !organizationId) return;
      const source = versions.find((v) => v.id === sourceId);
      if (!source) {
        toast({ title: "Versão de origem não encontrada", variant: "destructive" });
        return;
      }
      const created_by = await identityGuard();
      if (!created_by) return;

      const nextVersion = (versions[0]?.version ?? 0) + 1;
      let newTemplateId: string | null = null;

      try {
        // 1. INSERT do novo template
        const { data: tplData, error: tplErr } = await supabase
          .from("product_configuration_templates")
          .insert({
            organization_id: organizationId,
            product_id: productId,
            name: `${source.name} (cópia v${nextVersion})`,
            version: nextVersion,
            is_active: false,
            created_by,
          })
          .select()
          .single();
        if (tplErr) throw tplErr;
        newTemplateId = (tplData as CTemplate).id;

        // 2. Buscar blocks da origem
        const { data: srcBlocks, error: bErr } = await supabase
          .from("product_config_blocks")
          .select("*")
          .eq("template_id", sourceId)
          .order("sort_order");
        if (bErr) throw bErr;

        const blockIdMap = new Map<string, string>();
        if ((srcBlocks ?? []).length > 0) {
          const blockInserts = (srcBlocks as CBlock[]).map((b) => ({
            organization_id: organizationId,
            template_id: newTemplateId!,
            label: b.label,
            description: b.description,
            sort_order: b.sort_order,
            is_required: b.is_required,
            created_by,
          }));
          const { data: newBlocks, error: nbErr } = await supabase
            .from("product_config_blocks")
            .insert(blockInserts)
            .select();
          if (nbErr) throw nbErr;
          // Mapeamento por (label, sort_order) — preserva ordem inserida
          const ordered = [...(newBlocks as CBlock[])].sort(
            (a, b) => a.sort_order - b.sort_order
          );
          const orderedSrc = [...(srcBlocks as CBlock[])].sort(
            (a, b) => a.sort_order - b.sort_order
          );
          orderedSrc.forEach((sb, i) => {
            const nb = ordered[i];
            if (nb) blockIdMap.set(sb.id, nb.id);
          });
        }

        // 3. Buscar slots da origem
        const srcBlockIds = (srcBlocks ?? []).map((b: any) => b.id);
        const slotIdMap = new Map<string, string>();
        let srcSlots: CSlot[] = [];
        if (srcBlockIds.length > 0) {
          const { data: sData, error: sErr } = await supabase
            .from("product_config_slots")
            .select("*")
            .in("block_id", srcBlockIds)
            .order("sort_order");
          if (sErr) throw sErr;
          srcSlots = (sData ?? []) as CSlot[];

          if (srcSlots.length > 0) {
            const slotInserts = srcSlots.map((s) => ({
              organization_id: organizationId,
              block_id: blockIdMap.get(s.block_id)!,
              slot_key: s.slot_key,
              label: s.label,
              slot_type: s.slot_type,
              attribute_id: s.attribute_id,
              required: s.required,
              min_quantity: s.min_quantity,
              max_quantity: s.max_quantity,
              pricing_behavior: s.pricing_behavior,
              inventory_behavior: s.inventory_behavior,
              sort_order: s.sort_order,
              created_by,
            }));
            const { data: newSlots, error: nsErr } = await supabase
              .from("product_config_slots")
              .insert(slotInserts)
              .select();
            if (nsErr) throw nsErr;
            // Mapeamento por (block_id_novo, slot_key)
            const newByKey = new Map<string, string>();
            (newSlots as CSlot[]).forEach((ns) => {
              newByKey.set(`${ns.block_id}::${ns.slot_key}`, ns.id);
            });
            srcSlots.forEach((ss) => {
              const newBlockId = blockIdMap.get(ss.block_id)!;
              const nid = newByKey.get(`${newBlockId}::${ss.slot_key}`);
              if (nid) slotIdMap.set(ss.id, nid);
            });
          }
        }

        // 4. Buscar options da origem
        const optionIdMap = new Map<string, string>();
        const srcSlotIds = srcSlots.map((s) => s.id);
        if (srcSlotIds.length > 0) {
          const { data: oData, error: oErr } = await supabase
            .from("product_config_slot_options")
            .select("*")
            .in("slot_id", srcSlotIds)
            .order("sort_order");
          if (oErr) throw oErr;
          const srcOpts = (oData ?? []) as CSlotOption[];
          if (srcOpts.length > 0) {
            const optInserts = srcOpts.map((o) => ({
              organization_id: organizationId,
              slot_id: slotIdMap.get(o.slot_id)!,
              attribute_value_id: o.attribute_value_id,
              component_product_id: o.component_product_id,
              label: o.label,
              is_enabled: o.is_enabled,
              default_quantity: o.default_quantity,
              sort_order: o.sort_order,
              created_by,
            }));
            const { data: newOpts, error: noErr } = await supabase
              .from("product_config_slot_options")
              .insert(optInserts)
              .select();
            if (noErr) throw noErr;
            // Mapeamento por (slot_id_novo, label, sort_order) — única chave razoável
            const newByKey = new Map<string, string>();
            (newOpts as CSlotOption[]).forEach((no) => {
              newByKey.set(`${no.slot_id}::${no.label}::${no.sort_order}`, no.id);
            });
            srcOpts.forEach((so) => {
              const newSlotId = slotIdMap.get(so.slot_id)!;
              const nid = newByKey.get(`${newSlotId}::${so.label}::${so.sort_order}`);
              if (nid) optionIdMap.set(so.id, nid);
            });
          }
        }

        // 5. Buscar rules da origem e remapear referências
        const { data: srcRules, error: rErr } = await supabase
          .from("product_config_rules")
          .select("*")
          .eq("template_id", sourceId);
        if (rErr) throw rErr;
        if ((srcRules ?? []).length > 0) {
          const ruleInserts = (srcRules as CRule[]).map((r) => {
            // Remapear option_ids dentro de target_value (allow_options/deny_options arrays)
            let newTargetValue: any = r.target_value;
            if (
              (r.target_action === "allow_options" || r.target_action === "deny_options") &&
              Array.isArray(r.target_value)
            ) {
              newTargetValue = (r.target_value as string[]).map(
                (oid) => optionIdMap.get(oid) ?? oid
              );
            } else if (
              r.target_action === "set_default" &&
              r.target_value &&
              typeof r.target_value === "object" &&
              r.target_value.option_id
            ) {
              newTargetValue = {
                ...r.target_value,
                option_id:
                  optionIdMap.get(r.target_value.option_id) ?? r.target_value.option_id,
              };
            }
            return {
              organization_id: organizationId,
              template_id: newTemplateId!,
              rule_type: r.rule_type,
              source_slot_id: r.source_slot_id ? slotIdMap.get(r.source_slot_id) ?? null : null,
              source_operator: r.source_operator,
              source_value: r.source_value,
              target_slot_id: r.target_slot_id ? slotIdMap.get(r.target_slot_id) ?? null : null,
              target_action: r.target_action,
              target_value: newTargetValue,
              priority: r.priority,
              message: r.message,
              is_active: r.is_active,
              created_by,
            };
          });
          const { error: nrErr } = await supabase
            .from("product_config_rules")
            .insert(ruleInserts);
          if (nrErr) throw nrErr;
        }

        // Sucesso — recarregar e selecionar a nova
        toast({ title: `Versão v${nextVersion} criada (inativa)` });
        const list = await reloadVersions();
        setSelectedVersionId(list.some((v) => v.id === newTemplateId) ? newTemplateId : list[0]?.id ?? null);
      } catch (err: any) {
        console.error("[useConfigTemplate] duplicateVersion error", err);
        // Cleanup fail-closed
        if (newTemplateId) {
          const { error: delErr } = await supabase
            .from("product_configuration_templates")
            .delete()
            .eq("id", newTemplateId);
          if (delErr) {
            console.error("[useConfigTemplate] cleanup failed", delErr);
            toast({
              title: "Cleanup parcial falhou",
              description: "Verificar manualmente o template parcial criado.",
              variant: "destructive",
            });
          }
        }
        toast({
          title: "Falha ao duplicar versão",
          description: "Alterações revertidas.",
          variant: "destructive",
        });
        await reloadVersions();
      }
    },
    [productId, organizationId, versions, identityGuard, reloadVersions, toast]
  );

  // ---------------- Mutations (estrutura — agora sobre selectedTemplate) ----------------

  const addBlock = useCallback(
    async (label: string) => {
      if (!selectedTemplate || !organizationId) return;
      const created_by = await identityGuard();
      if (!created_by) return;
      const { error } = await supabase.from("product_config_blocks").insert({
        organization_id: organizationId,
        template_id: selectedTemplate.id,
        label,
        sort_order: blocks.length,
        created_by,
      });
      if (error) {
        toast({ title: "Erro a criar bloco", description: error.message, variant: "destructive" });
        return;
      }
      await reloadChildren(selectedTemplate.id);
    },
    [selectedTemplate, organizationId, blocks.length, identityGuard, reloadChildren, toast]
  );

  const deleteBlock = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("product_config_blocks").delete().eq("id", id);
      if (error) {
        toast({ title: "Erro a apagar bloco", description: error.message, variant: "destructive" });
        return;
      }
      await reloadChildren(selectedVersionId);
    },
    [reloadChildren, selectedVersionId, toast]
  );

  const addSlot = useCallback(
    async (
      blockId: string,
      payload: Partial<CSlot> & { slot_key: string; label: string; slot_type: CSlot["slot_type"] }
    ) => {
      if (!organizationId) return;
      const created_by = await identityGuard();
      if (!created_by) return;
      const { error } = await supabase.from("product_config_slots").insert({
        organization_id: organizationId,
        block_id: blockId,
        slot_key: payload.slot_key,
        label: payload.label,
        slot_type: payload.slot_type,
        attribute_id: payload.attribute_id ?? null,
        required: payload.required ?? false,
        sort_order: slots.filter((s) => s.block_id === blockId).length,
        created_by,
      });
      if (error) {
        toast({ title: "Erro a criar slot", description: error.message, variant: "destructive" });
        return;
      }
      await reloadChildren(selectedVersionId);
    },
    [organizationId, slots, identityGuard, reloadChildren, selectedVersionId, toast]
  );

  const deleteSlot = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("product_config_slots").delete().eq("id", id);
      if (error) {
        toast({ title: "Erro a apagar slot", description: error.message, variant: "destructive" });
        return;
      }
      await reloadChildren(selectedVersionId);
    },
    [reloadChildren, selectedVersionId, toast]
  );

  const addOption = useCallback(
    async (
      slotId: string,
      payload: { label: string; attribute_value_id?: string | null; component_product_id?: string | null }
    ) => {
      if (!organizationId) return;
      const created_by = await identityGuard();
      if (!created_by) return;
      const { error } = await supabase.from("product_config_slot_options").insert({
        organization_id: organizationId,
        slot_id: slotId,
        label: payload.label,
        attribute_value_id: payload.attribute_value_id ?? null,
        component_product_id: payload.component_product_id ?? null,
        sort_order: options.filter((o) => o.slot_id === slotId).length,
        created_by,
      });
      if (error) {
        toast({ title: "Erro a criar opção", description: error.message, variant: "destructive" });
        return;
      }
      await reloadChildren(selectedVersionId);
    },
    [organizationId, options, identityGuard, reloadChildren, selectedVersionId, toast]
  );

  const deleteOption = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("product_config_slot_options").delete().eq("id", id);
      if (error) {
        toast({ title: "Erro a apagar opção", description: error.message, variant: "destructive" });
        return;
      }
      await reloadChildren(selectedVersionId);
    },
    [reloadChildren, selectedVersionId, toast]
  );

  const addRule = useCallback(
    async (payload: Partial<CRule> & { rule_type: CRule["rule_type"]; target_action: CRule["target_action"] }) => {
      if (!selectedTemplate || !organizationId) return;
      const created_by = await identityGuard();
      if (!created_by) return;
      const { error } = await supabase.from("product_config_rules").insert({
        organization_id: organizationId,
        template_id: selectedTemplate.id,
        rule_type: payload.rule_type,
        source_slot_id: payload.source_slot_id ?? null,
        source_operator: payload.source_operator ?? null,
        source_value: payload.source_value ?? null,
        target_slot_id: payload.target_slot_id ?? null,
        target_action: payload.target_action,
        target_value: payload.target_value ?? null,
        message: payload.message ?? null,
        priority: payload.priority ?? 0,
        created_by,
      });
      if (error) {
        toast({ title: "Erro a criar regra", description: error.message, variant: "destructive" });
        return;
      }
      await reloadChildren(selectedTemplate.id);
    },
    [selectedTemplate, organizationId, identityGuard, reloadChildren, toast]
  );

  const deleteRule = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("product_config_rules").delete().eq("id", id);
      if (error) {
        toast({ title: "Erro a apagar regra", description: error.message, variant: "destructive" });
        return;
      }
      await reloadChildren(selectedVersionId);
    },
    [reloadChildren, selectedVersionId, toast]
  );

  const updateBlock = useCallback(
    async (id: string, patch: Partial<Pick<CBlock, "label" | "description">>) => {
      const { error } = await supabase.from("product_config_blocks").update(patch).eq("id", id);
      if (error) {
        toast({ title: "Erro a atualizar secção", description: error.message, variant: "destructive" });
        return;
      }
      await reloadChildren(selectedVersionId);
    },
    [reloadChildren, selectedVersionId, toast]
  );

  const updateSlot = useCallback(
    async (
      id: string,
      patch: Partial<Pick<CSlot, "label" | "required" | "slot_type" | "attribute_id">> & {
        /** When true, deletes existing options first (used when changing slot_type / attribute_id). */
        wipeOptions?: boolean;
      }
    ) => {
      const { wipeOptions, ...dbPatch } = patch;
      if (wipeOptions) {
        const { error: delErr } = await supabase
          .from("product_config_slot_options")
          .delete()
          .eq("slot_id", id);
        if (delErr) {
          toast({ title: "Erro a limpar valores", description: delErr.message, variant: "destructive" });
          return;
        }
      }
      const { error } = await supabase.from("product_config_slots").update(dbPatch).eq("id", id);
      if (error) {
        toast({ title: "Erro a atualizar escolha", description: error.message, variant: "destructive" });
        return;
      }
      await reloadChildren(selectedVersionId);
    },
    [reloadChildren, selectedVersionId, toast]
  );

  const updateOption = useCallback(
    async (
      id: string,
      patch: Partial<Pick<CSlotOption, "label" | "is_enabled" | "default_quantity" | "attribute_value_id" | "component_product_id">>
    ) => {
      const { error } = await supabase.from("product_config_slot_options").update(patch).eq("id", id);
      if (error) {
        toast({ title: "Erro a atualizar valor", description: error.message, variant: "destructive" });
        return;
      }
      await reloadChildren(selectedVersionId);
    },
    [reloadChildren, selectedVersionId, toast]
  );

  return {
    loading,
    versions,
    activeTemplate,
    selectedTemplate,
    selectedVersionId,
    selectVersion,
    blocks,
    slots,
    options,
    rules,
    reload,
    createFirstVersion,
    duplicateVersion,
    addBlock,
    updateBlock,
    deleteBlock,
    addSlot,
    updateSlot,
    deleteSlot,
    addOption,
    updateOption,
    deleteOption,
    addRule,
    deleteRule,
  };
}
