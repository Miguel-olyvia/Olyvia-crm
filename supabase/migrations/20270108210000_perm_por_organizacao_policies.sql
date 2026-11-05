-- =============================================================================
-- 20270108210000 — Lote B (P1.4): permissão por organização nas policies
-- =============================================================================
-- Em cada policy das tabelas de inventário, armazéns, receção, compras,
-- fornecedores, frota, agenda e da ESCRITA do catálogo (produtos/serviços…),
-- has_anew_permission(uid, 'x') / has_scheduling_permission(uid, 'x') (globais)
-- passa a:
--     <organização da linha> IN (SELECT get_user_permission_org_ids(uid, 'x'))
-- A organização é a coluna organization_id da própria linha ou, nas tabelas
-- filhas, a do pai (contagem → contagens, linhas da PO → PO, campos do quadro →
-- quadro, atribuições/eventos → agendamento, distritos/áreas → recurso, valores
-- de grupo → grupo, componentes → bundle, valores/preços → produto ou serviço,
-- atributos/paletas → categoria; categorias/subcategorias → a da mãe, como já
-- faz a verificação de âmbito). Em auto_schedule_rules, as regras globais
-- (organization_id nulo) mantêm a verificação global.
-- O resto de cada policy (âmbito da organização, is_system_admin_user, âmbitos
-- ORG/TEAM/OWNED, condutor da viatura…) fica igual. Gerado a partir de
-- pg_policies vivas (05/11/2026); ALTER POLICY, sem tabelas nem colunas novas.
-- Fora: leituras do catálogo, entity_audit_log, schedule_fields (tabela sem
-- organização) e os outros módulos.
-- =============================================================================

-- attribute_option_group_values · DELETE
ALTER POLICY "attribute_option_group_values_delete" ON public.attribute_option_group_values
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((( SELECT lb_aog.organization_id FROM public.attribute_option_groups lb_aog WHERE lb_aog.id = attribute_option_group_values.group_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (EXISTS ( SELECT 1
   FROM attribute_option_groups aog
  WHERE ((aog.id = attribute_option_group_values.group_id) AND (aog.organization_id IS NOT NULL) AND (aog.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))))));

-- attribute_option_group_values · INSERT
ALTER POLICY "attribute_option_group_values_insert" ON public.attribute_option_group_values
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((( SELECT lb_aog.organization_id FROM public.attribute_option_groups lb_aog WHERE lb_aog.id = attribute_option_group_values.group_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (EXISTS ( SELECT 1
   FROM attribute_option_groups aog
  WHERE ((aog.id = attribute_option_group_values.group_id) AND (aog.organization_id IS NOT NULL) AND (aog.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))))));

-- attribute_option_group_values · UPDATE
ALTER POLICY "attribute_option_group_values_update" ON public.attribute_option_group_values
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((( SELECT lb_aog.organization_id FROM public.attribute_option_groups lb_aog WHERE lb_aog.id = attribute_option_group_values.group_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (EXISTS ( SELECT 1
   FROM attribute_option_groups aog
  WHERE ((aog.id = attribute_option_group_values.group_id) AND (aog.organization_id IS NOT NULL) AND (aog.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))))))
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((( SELECT lb_aog.organization_id FROM public.attribute_option_groups lb_aog WHERE lb_aog.id = attribute_option_group_values.group_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (EXISTS ( SELECT 1
   FROM attribute_option_groups aog
  WHERE ((aog.id = attribute_option_group_values.group_id) AND (aog.organization_id IS NOT NULL) AND (aog.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))))));

-- attribute_option_groups · DELETE
ALTER POLICY "attribute_option_groups_delete" ON public.attribute_option_groups
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((attribute_option_groups.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- attribute_option_groups · INSERT
ALTER POLICY "attribute_option_groups_insert" ON public.attribute_option_groups
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((attribute_option_groups.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (organization_id IS NOT NULL) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- attribute_option_groups · UPDATE
ALTER POLICY "attribute_option_groups_update" ON public.attribute_option_groups
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((attribute_option_groups.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))))
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((attribute_option_groups.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- auto_schedule_rules · DELETE
ALTER POLICY "auto_schedule_rules_delete" ON public.auto_schedule_rules
  USING (((((auto_schedule_rules.organization_id IS NULL) AND has_anew_permission(( SELECT auth.uid() AS uid), 'scheduling.rules.delete'::text)) OR (auto_schedule_rules.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.rules.delete'::text) AS get_user_permission_org_ids))) AND ((organization_id IS NULL) OR (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)))));

-- auto_schedule_rules · INSERT
ALTER POLICY "auto_schedule_rules_insert" ON public.auto_schedule_rules
  WITH CHECK (((((auto_schedule_rules.organization_id IS NULL) AND has_anew_permission(( SELECT auth.uid() AS uid), 'scheduling.rules.create'::text)) OR (auto_schedule_rules.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.rules.create'::text) AS get_user_permission_org_ids))) AND ((organization_id IS NULL) OR (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)))));

-- auto_schedule_rules · SELECT
ALTER POLICY "auto_schedule_rules_select" ON public.auto_schedule_rules
  USING (((((auto_schedule_rules.organization_id IS NULL) AND has_anew_permission(( SELECT auth.uid() AS uid), 'scheduling.rules.view'::text)) OR (auto_schedule_rules.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.rules.view'::text) AS get_user_permission_org_ids))) AND ((organization_id IS NULL) OR (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)))));

-- auto_schedule_rules · UPDATE
ALTER POLICY "auto_schedule_rules_update" ON public.auto_schedule_rules
  USING (((((auto_schedule_rules.organization_id IS NULL) AND has_anew_permission(( SELECT auth.uid() AS uid), 'scheduling.rules.edit'::text)) OR (auto_schedule_rules.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.rules.edit'::text) AS get_user_permission_org_ids))) AND ((organization_id IS NULL) OR (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)))));

-- board_schedule_fields · INSERT
ALTER POLICY "Users can create board schedule fields" ON public.board_schedule_fields
  WITH CHECK (((( SELECT lb_sb.organization_id FROM public.schedule_boards lb_sb WHERE lb_sb.id = board_schedule_fields.board_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.boards.edit'::text) AS get_user_permission_org_ids)) AND (EXISTS ( SELECT 1
   FROM schedule_boards sb
  WHERE ((sb.id = board_schedule_fields.board_id) AND (sb.organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)))))));

-- board_schedule_fields · DELETE
ALTER POLICY "Users can delete board schedule fields" ON public.board_schedule_fields
  USING (((( SELECT lb_sb.organization_id FROM public.schedule_boards lb_sb WHERE lb_sb.id = board_schedule_fields.board_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.boards.edit'::text) AS get_user_permission_org_ids)) AND (EXISTS ( SELECT 1
   FROM schedule_boards sb
  WHERE ((sb.id = board_schedule_fields.board_id) AND (sb.organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)))))));

-- board_schedule_fields · UPDATE
ALTER POLICY "Users can update board schedule fields" ON public.board_schedule_fields
  USING (((( SELECT lb_sb.organization_id FROM public.schedule_boards lb_sb WHERE lb_sb.id = board_schedule_fields.board_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.boards.edit'::text) AS get_user_permission_org_ids)) AND (EXISTS ( SELECT 1
   FROM schedule_boards sb
  WHERE ((sb.id = board_schedule_fields.board_id) AND (sb.organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)))))));

-- board_schedule_fields · SELECT
ALTER POLICY "Users can view board schedule fields" ON public.board_schedule_fields
  USING (((( SELECT lb_sb.organization_id FROM public.schedule_boards lb_sb WHERE lb_sb.id = board_schedule_fields.board_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.boards.view'::text) AS get_user_permission_org_ids)) AND (EXISTS ( SELECT 1
   FROM schedule_boards sb
  WHERE ((sb.id = board_schedule_fields.board_id) AND (sb.organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)))))));

-- brand_organizations · DELETE
ALTER POLICY "brand_organizations_delete" ON public.brand_organizations
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((brand_organizations.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'brands.edit'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- brand_organizations · INSERT
ALTER POLICY "brand_organizations_insert" ON public.brand_organizations
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((brand_organizations.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'brands.edit'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- brand_organizations · UPDATE
ALTER POLICY "brand_organizations_update" ON public.brand_organizations
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((brand_organizations.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'brands.edit'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))))
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((brand_organizations.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'brands.edit'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- brands · DELETE
ALTER POLICY "brands_delete" ON public.brands
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((brands.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'brands.edit'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- brands · INSERT
ALTER POLICY "brands_insert" ON public.brands
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((brands.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'brands.edit'::text) AS get_user_permission_org_ids)) AND (organization_id IS NOT NULL) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- brands · UPDATE
ALTER POLICY "brands_update" ON public.brands
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((brands.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'brands.edit'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))))
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((brands.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'brands.edit'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- bundle_choice_groups · DELETE
ALTER POLICY "bundle_choice_groups_delete" ON public.bundle_choice_groups
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((( SELECT lb_b.organization_id FROM public.bundles lb_b WHERE lb_b.id = bundle_choice_groups.bundle_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (EXISTS ( SELECT 1
   FROM bundles b
  WHERE ((b.id = bundle_choice_groups.bundle_id) AND (b.deleted_at IS NULL) AND (b.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))))));

-- bundle_choice_groups · INSERT
ALTER POLICY "bundle_choice_groups_insert" ON public.bundle_choice_groups
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((( SELECT lb_b.organization_id FROM public.bundles lb_b WHERE lb_b.id = bundle_choice_groups.bundle_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (EXISTS ( SELECT 1
   FROM bundles b
  WHERE ((b.id = bundle_choice_groups.bundle_id) AND (b.deleted_at IS NULL) AND (b.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))))));

-- bundle_choice_groups · UPDATE
ALTER POLICY "bundle_choice_groups_update" ON public.bundle_choice_groups
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((( SELECT lb_b.organization_id FROM public.bundles lb_b WHERE lb_b.id = bundle_choice_groups.bundle_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (EXISTS ( SELECT 1
   FROM bundles b
  WHERE ((b.id = bundle_choice_groups.bundle_id) AND (b.deleted_at IS NULL) AND (b.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))))))
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((( SELECT lb_b.organization_id FROM public.bundles lb_b WHERE lb_b.id = bundle_choice_groups.bundle_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (EXISTS ( SELECT 1
   FROM bundles b
  WHERE ((b.id = bundle_choice_groups.bundle_id) AND (b.deleted_at IS NULL) AND (b.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))))));

-- bundle_components · DELETE
ALTER POLICY "bundle_components_delete" ON public.bundle_components
  USING ((( SELECT is_system_admin_user(( SELECT auth.uid() AS uid)) AS is_system_admin_user) OR ((( SELECT lb_b.organization_id FROM public.bundles lb_b WHERE lb_b.id = bundle_components.bundle_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (EXISTS ( SELECT 1
   FROM bundles b
  WHERE ((b.id = bundle_components.bundle_id) AND (b.deleted_at IS NULL) AND (b.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))))));

-- bundle_components · INSERT
ALTER POLICY "bundle_components_insert" ON public.bundle_components
  WITH CHECK ((( SELECT is_system_admin_user(( SELECT auth.uid() AS uid)) AS is_system_admin_user) OR ((( SELECT lb_b.organization_id FROM public.bundles lb_b WHERE lb_b.id = bundle_components.bundle_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (EXISTS ( SELECT 1
   FROM bundles b
  WHERE ((b.id = bundle_components.bundle_id) AND (b.deleted_at IS NULL) AND (b.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))))));

-- bundle_components · UPDATE
ALTER POLICY "bundle_components_update" ON public.bundle_components
  USING ((( SELECT is_system_admin_user(( SELECT auth.uid() AS uid)) AS is_system_admin_user) OR ((( SELECT lb_b.organization_id FROM public.bundles lb_b WHERE lb_b.id = bundle_components.bundle_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (EXISTS ( SELECT 1
   FROM bundles b
  WHERE ((b.id = bundle_components.bundle_id) AND (b.deleted_at IS NULL) AND (b.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))))))
  WITH CHECK ((( SELECT is_system_admin_user(( SELECT auth.uid() AS uid)) AS is_system_admin_user) OR ((( SELECT lb_b.organization_id FROM public.bundles lb_b WHERE lb_b.id = bundle_components.bundle_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (EXISTS ( SELECT 1
   FROM bundles b
  WHERE ((b.id = bundle_components.bundle_id) AND (b.deleted_at IS NULL) AND (b.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))))));

-- bundles · DELETE
ALTER POLICY "bundles_delete" ON public.bundles
  USING ((( SELECT is_system_admin_user(( SELECT auth.uid() AS uid)) AS is_system_admin_user) OR ((bundles.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- bundles · INSERT
ALTER POLICY "bundles_insert" ON public.bundles
  WITH CHECK ((( SELECT is_system_admin_user(( SELECT auth.uid() AS uid)) AS is_system_admin_user) OR ((bundles.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- bundles · UPDATE
ALTER POLICY "bundles_update" ON public.bundles
  USING ((( SELECT is_system_admin_user(( SELECT auth.uid() AS uid)) AS is_system_admin_user) OR ((deleted_at IS NULL) AND (bundles.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))))
  WITH CHECK ((( SELECT is_system_admin_user(( SELECT auth.uid() AS uid)) AS is_system_admin_user) OR ((bundles.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- category_attribute_palettes · DELETE
ALTER POLICY "category_attribute_palettes_delete" ON public.category_attribute_palettes
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((( SELECT COALESCE(lb_pc.organization_id, get_product_category_org_id(COALESCE(lb_pc.parent_id, lb_pc.parent_category_id), 0)) FROM public.product_categories lb_pc WHERE lb_pc.id = category_attribute_palettes.category_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (EXISTS ( SELECT 1
   FROM product_categories pc
  WHERE ((pc.id = category_attribute_palettes.category_id) AND ((pc.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) OR ((pc.organization_id IS NULL) AND (COALESCE(pc.parent_id, pc.parent_category_id) IS NOT NULL) AND (get_product_category_org_id(COALESCE(pc.parent_id, pc.parent_category_id), 0) IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))))))));

-- category_attribute_palettes · INSERT
ALTER POLICY "category_attribute_palettes_insert" ON public.category_attribute_palettes
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((( SELECT COALESCE(lb_pc.organization_id, get_product_category_org_id(COALESCE(lb_pc.parent_id, lb_pc.parent_category_id), 0)) FROM public.product_categories lb_pc WHERE lb_pc.id = category_attribute_palettes.category_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (EXISTS ( SELECT 1
   FROM product_categories pc
  WHERE ((pc.id = category_attribute_palettes.category_id) AND ((pc.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) OR ((pc.organization_id IS NULL) AND (COALESCE(pc.parent_id, pc.parent_category_id) IS NOT NULL) AND (get_product_category_org_id(COALESCE(pc.parent_id, pc.parent_category_id), 0) IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))))))));

-- category_attribute_palettes · UPDATE
ALTER POLICY "category_attribute_palettes_update" ON public.category_attribute_palettes
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((( SELECT COALESCE(lb_pc.organization_id, get_product_category_org_id(COALESCE(lb_pc.parent_id, lb_pc.parent_category_id), 0)) FROM public.product_categories lb_pc WHERE lb_pc.id = category_attribute_palettes.category_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (EXISTS ( SELECT 1
   FROM product_categories pc
  WHERE ((pc.id = category_attribute_palettes.category_id) AND ((pc.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) OR ((pc.organization_id IS NULL) AND (COALESCE(pc.parent_id, pc.parent_category_id) IS NOT NULL) AND (get_product_category_org_id(COALESCE(pc.parent_id, pc.parent_category_id), 0) IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))))))))
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((( SELECT COALESCE(lb_pc.organization_id, get_product_category_org_id(COALESCE(lb_pc.parent_id, lb_pc.parent_category_id), 0)) FROM public.product_categories lb_pc WHERE lb_pc.id = category_attribute_palettes.category_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (EXISTS ( SELECT 1
   FROM product_categories pc
  WHERE ((pc.id = category_attribute_palettes.category_id) AND ((pc.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) OR ((pc.organization_id IS NULL) AND (COALESCE(pc.parent_id, pc.parent_category_id) IS NOT NULL) AND (get_product_category_org_id(COALESCE(pc.parent_id, pc.parent_category_id), 0) IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))))))));

-- category_attributes · DELETE
ALTER POLICY "category_attributes_delete" ON public.category_attributes
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((( SELECT COALESCE(lb_pc.organization_id, get_product_category_org_id(COALESCE(lb_pc.parent_id, lb_pc.parent_category_id), 0)) FROM public.product_categories lb_pc WHERE lb_pc.id = category_attributes.category_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (EXISTS ( SELECT 1
   FROM product_categories pc
  WHERE ((pc.id = category_attributes.category_id) AND ((pc.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) OR ((pc.organization_id IS NULL) AND (COALESCE(pc.parent_id, pc.parent_category_id) IS NOT NULL) AND (get_product_category_org_id(COALESCE(pc.parent_id, pc.parent_category_id), 0) IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))))))));

-- category_attributes · INSERT
ALTER POLICY "category_attributes_insert" ON public.category_attributes
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((( SELECT COALESCE(lb_pc.organization_id, get_product_category_org_id(COALESCE(lb_pc.parent_id, lb_pc.parent_category_id), 0)) FROM public.product_categories lb_pc WHERE lb_pc.id = category_attributes.category_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (EXISTS ( SELECT 1
   FROM product_categories pc
  WHERE ((pc.id = category_attributes.category_id) AND ((pc.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) OR ((pc.organization_id IS NULL) AND (COALESCE(pc.parent_id, pc.parent_category_id) IS NOT NULL) AND (get_product_category_org_id(COALESCE(pc.parent_id, pc.parent_category_id), 0) IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))))))));

-- category_attributes · UPDATE
ALTER POLICY "category_attributes_update" ON public.category_attributes
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((( SELECT COALESCE(lb_pc.organization_id, get_product_category_org_id(COALESCE(lb_pc.parent_id, lb_pc.parent_category_id), 0)) FROM public.product_categories lb_pc WHERE lb_pc.id = category_attributes.category_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (EXISTS ( SELECT 1
   FROM product_categories pc
  WHERE ((pc.id = category_attributes.category_id) AND ((pc.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) OR ((pc.organization_id IS NULL) AND (COALESCE(pc.parent_id, pc.parent_category_id) IS NOT NULL) AND (get_product_category_org_id(COALESCE(pc.parent_id, pc.parent_category_id), 0) IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))))))))
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((( SELECT COALESCE(lb_pc.organization_id, get_product_category_org_id(COALESCE(lb_pc.parent_id, lb_pc.parent_category_id), 0)) FROM public.product_categories lb_pc WHERE lb_pc.id = category_attributes.category_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (EXISTS ( SELECT 1
   FROM product_categories pc
  WHERE ((pc.id = category_attributes.category_id) AND ((pc.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) OR ((pc.organization_id IS NULL) AND (COALESCE(pc.parent_id, pc.parent_category_id) IS NOT NULL) AND (get_product_category_org_id(COALESCE(pc.parent_id, pc.parent_category_id), 0) IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))))))));

-- fleet_activity_log · SELECT
ALTER POLICY "fleet_activity_log_select" ON public.fleet_activity_log
  USING (((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (fleet_activity_log.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'fleet.view'::text) AS get_user_permission_org_ids))));

-- fleet_assignments · SELECT
ALTER POLICY "fleet_assignments_select" ON public.fleet_assignments
  USING ((((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (fleet_assignments.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'fleet.view'::text) AS get_user_permission_org_ids))) OR (driver_id IN ( SELECT fn_fleet_my_driver_ids() AS fn_fleet_my_driver_ids))));

-- fleet_compliance · SELECT
ALTER POLICY "fleet_compliance_select" ON public.fleet_compliance
  USING ((((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (fleet_compliance.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'fleet.view'::text) AS get_user_permission_org_ids))) OR (vehicle_id IN ( SELECT fn_fleet_my_vehicle_ids() AS fn_fleet_my_vehicle_ids))));

-- fleet_drivers · SELECT
ALTER POLICY "fleet_drivers_select" ON public.fleet_drivers
  USING ((((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (fleet_drivers.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'fleet.view'::text) AS get_user_permission_org_ids))) OR (id IN ( SELECT fn_fleet_my_driver_ids() AS fn_fleet_my_driver_ids))));

-- fleet_expense_imports · SELECT
ALTER POLICY "fleet_expense_imports_select" ON public.fleet_expense_imports
  USING (((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (fleet_expense_imports.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'fleet.costs'::text) AS get_user_permission_org_ids))));

-- fleet_expenses · SELECT
ALTER POLICY "fleet_expenses_select" ON public.fleet_expenses
  USING ((((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (fleet_expenses.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'fleet.costs'::text) AS get_user_permission_org_ids))) OR (driver_id IN ( SELECT fn_fleet_my_driver_ids() AS fn_fleet_my_driver_ids))));

-- fleet_incidents · SELECT
ALTER POLICY "fleet_incidents_select" ON public.fleet_incidents
  USING ((((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (fleet_incidents.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'fleet.view'::text) AS get_user_permission_org_ids))) OR (driver_id IN ( SELECT fn_fleet_my_driver_ids() AS fn_fleet_my_driver_ids)) OR ((created_by = current_business_user_id()) AND (vehicle_id IN ( SELECT fn_fleet_my_vehicle_ids() AS fn_fleet_my_vehicle_ids)))));

-- fleet_maintenance_events · SELECT
ALTER POLICY "fleet_maintenance_events_select" ON public.fleet_maintenance_events
  USING ((((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (fleet_maintenance_events.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'fleet.view'::text) AS get_user_permission_org_ids))) OR (vehicle_id IN ( SELECT fn_fleet_my_vehicle_ids() AS fn_fleet_my_vehicle_ids))));

-- fleet_maintenance_plans · SELECT
ALTER POLICY "fleet_maintenance_plans_select" ON public.fleet_maintenance_plans
  USING ((((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (fleet_maintenance_plans.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'fleet.view'::text) AS get_user_permission_org_ids))) OR (vehicle_id IN ( SELECT fn_fleet_my_vehicle_ids() AS fn_fleet_my_vehicle_ids))));

-- fleet_odometer_readings · SELECT
ALTER POLICY "fleet_odometer_readings_select" ON public.fleet_odometer_readings
  USING ((((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (fleet_odometer_readings.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'fleet.view'::text) AS get_user_permission_org_ids))) OR (vehicle_id IN ( SELECT fn_fleet_my_vehicle_ids() AS fn_fleet_my_vehicle_ids))));

-- fleet_ops_links · SELECT
ALTER POLICY "fleet_ops_links_select" ON public.fleet_ops_links
  USING (((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND ((fleet_ops_links.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'fleet.view'::text) AS get_user_permission_org_ids)) OR (fleet_ops_links.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'operations.view'::text) AS get_user_permission_org_ids)))));

-- fleet_restock_requests · SELECT
ALTER POLICY "fleet_restock_requests_select" ON public.fleet_restock_requests
  USING ((((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND ((fleet_restock_requests.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'fleet.view'::text) AS get_user_permission_org_ids)) OR (fleet_restock_requests.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'inventory.edit'::text) AS get_user_permission_org_ids)))) OR (vehicle_id IN ( SELECT fn_fleet_my_vehicle_ids() AS fn_fleet_my_vehicle_ids))));

-- fleet_vehicles · SELECT
ALTER POLICY "fleet_vehicles_select" ON public.fleet_vehicles
  USING ((((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (fleet_vehicles.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'fleet.view'::text) AS get_user_permission_org_ids))) OR (id IN ( SELECT fn_fleet_my_vehicle_ids() AS fn_fleet_my_vehicle_ids))));

-- inventory_count_lines · INSERT
ALTER POLICY "inventory_count_lines_insert_policy" ON public.inventory_count_lines
  WITH CHECK (((EXISTS ( SELECT 1
   FROM inventory_counts ic
  WHERE ((ic.id = inventory_count_lines.inventory_count_id) AND (ic.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))) AND ((( SELECT lb_ic.organization_id FROM public.inventory_counts lb_ic WHERE lb_ic.id = inventory_count_lines.inventory_count_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'inventory.count'::text) AS get_user_permission_org_ids)) OR (( SELECT lb_ic.organization_id FROM public.inventory_counts lb_ic WHERE lb_ic.id = inventory_count_lines.inventory_count_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'inventory.edit'::text) AS get_user_permission_org_ids)))));

-- inventory_count_lines · SELECT
ALTER POLICY "inventory_count_lines_select_policy" ON public.inventory_count_lines
  USING (((EXISTS ( SELECT 1
   FROM inventory_counts ic
  WHERE ((ic.id = inventory_count_lines.inventory_count_id) AND (ic.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))) AND (( SELECT lb_ic.organization_id FROM public.inventory_counts lb_ic WHERE lb_ic.id = inventory_count_lines.inventory_count_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'inventory.view'::text) AS get_user_permission_org_ids))));

-- inventory_counts · INSERT
ALTER POLICY "inventory_counts_insert_policy" ON public.inventory_counts
  WITH CHECK (((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND ((inventory_counts.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'inventory.count'::text) AS get_user_permission_org_ids)) OR (inventory_counts.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'inventory.edit'::text) AS get_user_permission_org_ids)))));

-- inventory_counts · SELECT
ALTER POLICY "inventory_counts_select_policy" ON public.inventory_counts
  USING (((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (inventory_counts.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'inventory.view'::text) AS get_user_permission_org_ids))));

-- item_suppliers · DELETE
ALTER POLICY "item_suppliers_delete_policy" ON public.item_suppliers
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (((item_type = 'product'::text) AND (item_suppliers.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.edit'::text) AS get_user_permission_org_ids))) OR ((item_type = 'service'::text) AND (item_suppliers.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'services.edit'::text) AS get_user_permission_org_ids)))))));

-- item_suppliers · INSERT
ALTER POLICY "item_suppliers_insert_policy" ON public.item_suppliers
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (((item_type = 'product'::text) AND (item_suppliers.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.edit'::text) AS get_user_permission_org_ids))) OR ((item_type = 'service'::text) AND (item_suppliers.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'services.edit'::text) AS get_user_permission_org_ids)))))));

-- item_suppliers · SELECT
ALTER POLICY "item_suppliers_select_policy" ON public.item_suppliers
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (((item_type = 'product'::text) AND (item_suppliers.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.view'::text) AS get_user_permission_org_ids)) AND (item_suppliers.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.view_cost'::text) AS get_user_permission_org_ids))) OR ((item_type = 'service'::text) AND (item_suppliers.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'services.view'::text) AS get_user_permission_org_ids)) AND (item_suppliers.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'services.view_cost'::text) AS get_user_permission_org_ids))) OR ((item_suppliers.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'suppliers.view'::text) AS get_user_permission_org_ids)) AND (item_suppliers.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'suppliers.view_pricing'::text) AS get_user_permission_org_ids)))))));

-- item_suppliers · UPDATE
ALTER POLICY "item_suppliers_update_policy" ON public.item_suppliers
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (((item_type = 'product'::text) AND (item_suppliers.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.edit'::text) AS get_user_permission_org_ids))) OR ((item_type = 'service'::text) AND (item_suppliers.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'services.edit'::text) AS get_user_permission_org_ids)))))))
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (((item_type = 'product'::text) AND (item_suppliers.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.edit'::text) AS get_user_permission_org_ids))) OR ((item_type = 'service'::text) AND (item_suppliers.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'services.edit'::text) AS get_user_permission_org_ids)))))));

-- organization_inventory_settings · INSERT
ALTER POLICY "organization_inventory_settings_insert_policy" ON public.organization_inventory_settings
  WITH CHECK (((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (organization_inventory_settings.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'inventory.edit'::text) AS get_user_permission_org_ids))));

-- organization_inventory_settings · SELECT
ALTER POLICY "organization_inventory_settings_select_policy" ON public.organization_inventory_settings
  USING (((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (organization_inventory_settings.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'inventory.view'::text) AS get_user_permission_org_ids))));

-- organization_inventory_settings · UPDATE
ALTER POLICY "organization_inventory_settings_update_policy" ON public.organization_inventory_settings
  USING (((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (organization_inventory_settings.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'inventory.edit'::text) AS get_user_permission_org_ids))))
  WITH CHECK (((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (organization_inventory_settings.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'inventory.edit'::text) AS get_user_permission_org_ids))));

-- price_contexts · DELETE
ALTER POLICY "price_contexts_delete" ON public.price_contexts
  USING (((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)) AND (price_contexts.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage_prices'::text) AS get_user_permission_org_ids))));

-- price_contexts · INSERT
ALTER POLICY "price_contexts_insert" ON public.price_contexts
  WITH CHECK (((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)) AND (price_contexts.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage_prices'::text) AS get_user_permission_org_ids))));

-- price_contexts · UPDATE
ALTER POLICY "price_contexts_update" ON public.price_contexts
  USING (((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)) AND (price_contexts.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage_prices'::text) AS get_user_permission_org_ids))))
  WITH CHECK (((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)) AND (price_contexts.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage_prices'::text) AS get_user_permission_org_ids))));

-- product_attribute_price_ranges · DELETE
ALTER POLICY "product_attribute_price_ranges_delete" ON public.product_attribute_price_ranges
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((product_attribute_price_ranges.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- product_attribute_price_ranges · INSERT
ALTER POLICY "product_attribute_price_ranges_insert" ON public.product_attribute_price_ranges
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((product_attribute_price_ranges.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (organization_id IS NOT NULL) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- product_attribute_price_ranges · UPDATE
ALTER POLICY "product_attribute_price_ranges_update" ON public.product_attribute_price_ranges
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((product_attribute_price_ranges.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (organization_id IS NOT NULL) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))))
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((product_attribute_price_ranges.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (organization_id IS NOT NULL) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- product_attribute_value_prices · DELETE
ALTER POLICY "product_attribute_value_prices_delete" ON public.product_attribute_value_prices
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((product_attribute_value_prices.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- product_attribute_value_prices · INSERT
ALTER POLICY "product_attribute_value_prices_insert" ON public.product_attribute_value_prices
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((product_attribute_value_prices.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (organization_id IS NOT NULL) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- product_attribute_value_prices · UPDATE
ALTER POLICY "product_attribute_value_prices_update" ON public.product_attribute_value_prices
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((product_attribute_value_prices.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (organization_id IS NOT NULL) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))))
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((product_attribute_value_prices.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (organization_id IS NOT NULL) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- product_attribute_values · DELETE
ALTER POLICY "product_attribute_values_delete" ON public.product_attribute_values
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((( SELECT lb_p.organization_id FROM public.products lb_p WHERE lb_p.id = product_attribute_values.product_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.delete'::text) AS get_user_permission_org_ids)) AND (EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_attribute_values.product_id) AND (p.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))))));

-- product_attribute_values · INSERT
ALTER POLICY "product_attribute_values_insert" ON public.product_attribute_values
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR (((( SELECT lb_p.organization_id FROM public.products lb_p WHERE lb_p.id = product_attribute_values.product_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.create'::text) AS get_user_permission_org_ids)) OR (( SELECT lb_p.organization_id FROM public.products lb_p WHERE lb_p.id = product_attribute_values.product_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.edit'::text) AS get_user_permission_org_ids))) AND (EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_attribute_values.product_id) AND (p.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))))));

-- product_attribute_values · UPDATE
ALTER POLICY "product_attribute_values_update" ON public.product_attribute_values
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((( SELECT lb_p.organization_id FROM public.products lb_p WHERE lb_p.id = product_attribute_values.product_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.edit'::text) AS get_user_permission_org_ids)) AND (EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_attribute_values.product_id) AND (p.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))))))
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((( SELECT lb_p.organization_id FROM public.products lb_p WHERE lb_p.id = product_attribute_values.product_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.edit'::text) AS get_user_permission_org_ids)) AND (EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_attribute_values.product_id) AND (p.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))))));

-- product_attributes · DELETE
ALTER POLICY "product_attributes_delete" ON public.product_attributes
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((product_attributes.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- product_attributes · INSERT
ALTER POLICY "product_attributes_insert" ON public.product_attributes
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((product_attributes.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (organization_id IS NOT NULL) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- product_attributes · UPDATE
ALTER POLICY "product_attributes_update" ON public.product_attributes
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((product_attributes.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))))
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((product_attributes.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- product_categories · DELETE
ALTER POLICY "product_categories_delete" ON public.product_categories
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((parent_id IS NULL) AND (CASE WHEN product_categories.parent_id IS NULL THEN product_categories.organization_id ELSE get_product_category_org_id(product_categories.parent_id, 0) END IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'product_categories.delete'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))) OR ((parent_id IS NOT NULL) AND (CASE WHEN product_categories.parent_id IS NULL THEN product_categories.organization_id ELSE get_product_category_org_id(product_categories.parent_id, 0) END IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'product_subcategories.delete'::text) AS get_user_permission_org_ids)) AND (get_product_category_org_id(parent_id, 0) IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- product_categories · INSERT
ALTER POLICY "product_categories_insert" ON public.product_categories
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((parent_id IS NULL) AND (CASE WHEN product_categories.parent_id IS NULL THEN product_categories.organization_id ELSE get_product_category_org_id(product_categories.parent_id, 0) END IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'product_categories.create'::text) AS get_user_permission_org_ids)) AND (organization_id IS NOT NULL) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))) OR ((parent_id IS NOT NULL) AND (CASE WHEN product_categories.parent_id IS NULL THEN product_categories.organization_id ELSE get_product_category_org_id(product_categories.parent_id, 0) END IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'product_subcategories.create'::text) AS get_user_permission_org_ids)) AND (get_product_category_org_id(parent_id, 0) IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- product_categories · UPDATE
ALTER POLICY "product_categories_update" ON public.product_categories
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((parent_id IS NULL) AND (CASE WHEN product_categories.parent_id IS NULL THEN product_categories.organization_id ELSE get_product_category_org_id(product_categories.parent_id, 0) END IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'product_categories.edit'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))) OR ((parent_id IS NOT NULL) AND (CASE WHEN product_categories.parent_id IS NULL THEN product_categories.organization_id ELSE get_product_category_org_id(product_categories.parent_id, 0) END IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'product_subcategories.edit'::text) AS get_user_permission_org_ids)) AND (get_product_category_org_id(parent_id, 0) IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))))
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((parent_id IS NULL) AND (CASE WHEN product_categories.parent_id IS NULL THEN product_categories.organization_id ELSE get_product_category_org_id(product_categories.parent_id, 0) END IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'product_categories.edit'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))) OR ((parent_id IS NOT NULL) AND (CASE WHEN product_categories.parent_id IS NULL THEN product_categories.organization_id ELSE get_product_category_org_id(product_categories.parent_id, 0) END IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'product_subcategories.edit'::text) AS get_user_permission_org_ids)) AND (EXISTS ( SELECT 1
   FROM ( SELECT get_product_category_org_id(product_categories.parent_id, 0) AS resolved_org) r
  WHERE ((r.resolved_org IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND ((product_categories.organization_id IS NULL) OR (product_categories.organization_id = r.resolved_org))))))));

-- product_category_organizations · DELETE
ALTER POLICY "product_category_organizations_delete" ON public.product_category_organizations
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((product_category_organizations.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'product_categories.delete'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- product_category_organizations · INSERT
ALTER POLICY "product_category_organizations_insert" ON public.product_category_organizations
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((product_category_organizations.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'product_categories.create'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- product_category_organizations · UPDATE
ALTER POLICY "product_category_organizations_update" ON public.product_category_organizations
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((product_category_organizations.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'product_categories.edit'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))))
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((product_category_organizations.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'product_categories.edit'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- product_codes · SELECT
ALTER POLICY "product_codes_select" ON public.product_codes
  USING (((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND ((product_codes.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.view'::text) AS get_user_permission_org_ids)) OR (product_codes.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'purchase_orders.receive'::text) AS get_user_permission_org_ids)))));

-- product_config_blocks · DELETE
ALTER POLICY "product_config_blocks_delete" ON public.product_config_blocks
  USING (((product_config_blocks.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.delete'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))));

-- product_config_blocks · INSERT
ALTER POLICY "product_config_blocks_insert" ON public.product_config_blocks
  WITH CHECK (((product_config_blocks.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.create'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))));

-- product_config_blocks · UPDATE
ALTER POLICY "product_config_blocks_update" ON public.product_config_blocks
  USING (((product_config_blocks.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.edit'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))))
  WITH CHECK (((product_config_blocks.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.edit'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))));

-- product_config_rules · DELETE
ALTER POLICY "product_config_rules_delete" ON public.product_config_rules
  USING (((product_config_rules.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.delete'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))));

-- product_config_rules · INSERT
ALTER POLICY "product_config_rules_insert" ON public.product_config_rules
  WITH CHECK (((product_config_rules.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.create'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))));

-- product_config_rules · UPDATE
ALTER POLICY "product_config_rules_update" ON public.product_config_rules
  USING (((product_config_rules.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.edit'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))))
  WITH CHECK (((product_config_rules.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.edit'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))));

-- product_config_slot_options · DELETE
ALTER POLICY "product_config_slot_options_delete" ON public.product_config_slot_options
  USING (((product_config_slot_options.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.delete'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))));

-- product_config_slot_options · INSERT
ALTER POLICY "product_config_slot_options_insert" ON public.product_config_slot_options
  WITH CHECK (((product_config_slot_options.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.create'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))));

-- product_config_slot_options · UPDATE
ALTER POLICY "product_config_slot_options_update" ON public.product_config_slot_options
  USING (((product_config_slot_options.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.edit'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))))
  WITH CHECK (((product_config_slot_options.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.edit'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))));

-- product_config_slots · DELETE
ALTER POLICY "product_config_slots_delete" ON public.product_config_slots
  USING (((product_config_slots.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.delete'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))));

-- product_config_slots · INSERT
ALTER POLICY "product_config_slots_insert" ON public.product_config_slots
  WITH CHECK (((product_config_slots.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.create'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))));

-- product_config_slots · UPDATE
ALTER POLICY "product_config_slots_update" ON public.product_config_slots
  USING (((product_config_slots.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.edit'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))))
  WITH CHECK (((product_config_slots.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.edit'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))));

-- product_configuration_templates · DELETE
ALTER POLICY "product_configuration_templates_delete" ON public.product_configuration_templates
  USING (((product_configuration_templates.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.delete'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))));

-- product_configuration_templates · INSERT
ALTER POLICY "product_configuration_templates_insert" ON public.product_configuration_templates
  WITH CHECK (((product_configuration_templates.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.create'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))));

-- product_configuration_templates · UPDATE
ALTER POLICY "product_configuration_templates_update" ON public.product_configuration_templates
  USING (((product_configuration_templates.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.edit'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))))
  WITH CHECK (((product_configuration_templates.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.edit'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))));

-- product_organizations · DELETE
ALTER POLICY "product_organizations_delete" ON public.product_organizations
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((product_organizations.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.edit'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- product_organizations · INSERT
ALTER POLICY "product_organizations_insert" ON public.product_organizations
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((product_organizations.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.edit'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- product_organizations · UPDATE
ALTER POLICY "product_organizations_update" ON public.product_organizations
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((product_organizations.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.edit'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))))
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((product_organizations.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.edit'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- product_prices · DELETE
ALTER POLICY "product_prices_delete" ON public.product_prices
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((( SELECT lb_p.organization_id FROM public.products lb_p WHERE lb_p.id = product_prices.product_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.delete'::text) AS get_user_permission_org_ids)) AND (EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_prices.product_id) AND (p.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))))));

-- product_prices · INSERT
ALTER POLICY "product_prices_insert" ON public.product_prices
  WITH CHECK (((current_business_user_id() = created_by) AND (is_system_admin_user(( SELECT auth.uid() AS uid)) OR (((( SELECT lb_p.organization_id FROM public.products lb_p WHERE lb_p.id = product_prices.product_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.create'::text) AS get_user_permission_org_ids)) OR (( SELECT lb_p.organization_id FROM public.products lb_p WHERE lb_p.id = product_prices.product_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.edit'::text) AS get_user_permission_org_ids))) AND (EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_prices.product_id) AND (p.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))))))));

-- product_prices · UPDATE
ALTER POLICY "product_prices_update" ON public.product_prices
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((( SELECT lb_p.organization_id FROM public.products lb_p WHERE lb_p.id = product_prices.product_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.edit'::text) AS get_user_permission_org_ids)) AND (EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_prices.product_id) AND (p.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))))))
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((( SELECT lb_p.organization_id FROM public.products lb_p WHERE lb_p.id = product_prices.product_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.edit'::text) AS get_user_permission_org_ids)) AND (EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_prices.product_id) AND (p.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))))));

-- products · DELETE
ALTER POLICY "products_delete" ON public.products
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((products.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.delete'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- products · INSERT
ALTER POLICY "products_insert" ON public.products
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((products.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.create'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- products · UPDATE
ALTER POLICY "products_update" ON public.products
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((products.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.edit'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))))
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((products.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.edit'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- purchase_order_items · UPDATE
ALTER POLICY "Users can update purchase order items" ON public.purchase_order_items
  USING (((EXISTS ( SELECT 1
   FROM purchase_orders po
  WHERE ((po.id = purchase_order_items.purchase_order_id) AND (po.organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))))) AND (( SELECT lb_po.organization_id FROM public.purchase_orders lb_po WHERE lb_po.id = purchase_order_items.purchase_order_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'purchase_orders.edit'::text) AS get_user_permission_org_ids))));

-- purchase_orders · DELETE
ALTER POLICY "purchase_orders_delete_policy" ON public.purchase_orders
  USING (((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)) AND (purchase_orders.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'purchase_orders.delete'::text) AS get_user_permission_org_ids))));

-- purchase_orders · INSERT
ALTER POLICY "purchase_orders_insert_policy" ON public.purchase_orders
  WITH CHECK (((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)) AND (purchase_orders.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'purchase_orders.create'::text) AS get_user_permission_org_ids))));

-- purchase_orders · SELECT
ALTER POLICY "purchase_orders_select_policy" ON public.purchase_orders
  USING (((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (purchase_orders.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'purchase_orders.view'::text) AS get_user_permission_org_ids))));

-- purchase_orders · UPDATE
ALTER POLICY "purchase_orders_update_policy" ON public.purchase_orders
  USING (((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)) AND (purchase_orders.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'purchase_orders.edit'::text) AS get_user_permission_org_ids))));

-- resource_districts · DELETE
ALTER POLICY "auth_delete_resource_districts" ON public.resource_districts
  USING (((( SELECT lb_sr.organization_id FROM public.schedule_resources lb_sr WHERE lb_sr.id = resource_districts.resource_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.resources.edit'::text) AS get_user_permission_org_ids)) AND (resource_id IN ( SELECT sr.id
   FROM schedule_resources sr
  WHERE (sr.organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))))));

-- resource_districts · INSERT
ALTER POLICY "auth_insert_resource_districts" ON public.resource_districts
  WITH CHECK (((( SELECT lb_sr.organization_id FROM public.schedule_resources lb_sr WHERE lb_sr.id = resource_districts.resource_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.resources.edit'::text) AS get_user_permission_org_ids)) AND (resource_id IN ( SELECT sr.id
   FROM schedule_resources sr
  WHERE (sr.organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))))));

-- resource_districts · SELECT
ALTER POLICY "auth_select_resource_districts" ON public.resource_districts
  USING (((( SELECT lb_sr.organization_id FROM public.schedule_resources lb_sr WHERE lb_sr.id = resource_districts.resource_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.resources.view'::text) AS get_user_permission_org_ids)) AND (resource_id IN ( SELECT sr.id
   FROM schedule_resources sr
  WHERE (sr.organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))))));

-- resource_districts · UPDATE
ALTER POLICY "auth_update_resource_districts" ON public.resource_districts
  USING (((( SELECT lb_sr.organization_id FROM public.schedule_resources lb_sr WHERE lb_sr.id = resource_districts.resource_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.resources.edit'::text) AS get_user_permission_org_ids)) AND (resource_id IN ( SELECT sr.id
   FROM schedule_resources sr
  WHERE (sr.organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))))));

-- resource_service_areas · DELETE
ALTER POLICY "auth_delete_resource_service_areas" ON public.resource_service_areas
  USING (((( SELECT lb_sr.organization_id FROM public.schedule_resources lb_sr WHERE lb_sr.id = resource_service_areas.resource_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.resources.edit'::text) AS get_user_permission_org_ids)) AND (resource_id IN ( SELECT schedule_resources.id
   FROM schedule_resources
  WHERE (schedule_resources.organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))))));

-- resource_service_areas · INSERT
ALTER POLICY "auth_insert_resource_service_areas" ON public.resource_service_areas
  WITH CHECK (((( SELECT lb_sr.organization_id FROM public.schedule_resources lb_sr WHERE lb_sr.id = resource_service_areas.resource_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.resources.edit'::text) AS get_user_permission_org_ids)) AND (resource_id IN ( SELECT schedule_resources.id
   FROM schedule_resources
  WHERE (schedule_resources.organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))))));

-- resource_service_areas · SELECT
ALTER POLICY "auth_select_resource_service_areas" ON public.resource_service_areas
  USING (((( SELECT lb_sr.organization_id FROM public.schedule_resources lb_sr WHERE lb_sr.id = resource_service_areas.resource_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.resources.view'::text) AS get_user_permission_org_ids)) AND (resource_id IN ( SELECT schedule_resources.id
   FROM schedule_resources
  WHERE (schedule_resources.organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))))));

-- resource_service_areas · UPDATE
ALTER POLICY "auth_update_resource_service_areas" ON public.resource_service_areas
  USING (((( SELECT lb_sr.organization_id FROM public.schedule_resources lb_sr WHERE lb_sr.id = resource_service_areas.resource_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.resources.edit'::text) AS get_user_permission_org_ids)) AND (resource_id IN ( SELECT schedule_resources.id
   FROM schedule_resources
  WHERE (schedule_resources.organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))))));

-- schedule_boards · INSERT
ALTER POLICY "Users can create schedule boards" ON public.schedule_boards
  WITH CHECK (((schedule_boards.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.boards.create'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))));

-- schedule_boards · DELETE
ALTER POLICY "Users can delete schedule boards" ON public.schedule_boards
  USING (((schedule_boards.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.boards.delete'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))));

-- schedule_boards · UPDATE
ALTER POLICY "Users can update schedule boards" ON public.schedule_boards
  USING (((schedule_boards.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.boards.edit'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))));

-- schedule_boards · SELECT
ALTER POLICY "Users can view schedule boards" ON public.schedule_boards
  USING (((schedule_boards.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.boards.view'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))));

-- schedule_holidays · DELETE
ALTER POLICY "schedule_holidays_delete" ON public.schedule_holidays
  USING (((schedule_holidays.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.settings'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))));

-- schedule_holidays · INSERT
ALTER POLICY "schedule_holidays_insert" ON public.schedule_holidays
  WITH CHECK (((schedule_holidays.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.settings'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))));

-- schedule_holidays · SELECT
ALTER POLICY "schedule_holidays_select" ON public.schedule_holidays
  USING (((schedule_holidays.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.items.view'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))));

-- schedule_holidays · UPDATE
ALTER POLICY "schedule_holidays_update" ON public.schedule_holidays
  USING (((schedule_holidays.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.settings'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))));

-- schedule_item_assignees · INSERT
ALTER POLICY "Users can create schedule item assignees" ON public.schedule_item_assignees
  WITH CHECK ((((( SELECT lb_si.organization_id FROM public.schedule_items lb_si WHERE lb_si.id = schedule_item_assignees.item_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.items.create'::text) AS get_user_permission_org_ids)) OR (( SELECT lb_si.organization_id FROM public.schedule_items lb_si WHERE lb_si.id = schedule_item_assignees.item_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.items.edit'::text) AS get_user_permission_org_ids))) AND (item_id IN ( SELECT si.id
   FROM schedule_items si
  WHERE (si.organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))))));

-- schedule_item_assignees · DELETE
ALTER POLICY "Users can delete schedule item assignees" ON public.schedule_item_assignees
  USING (((( SELECT lb_si.organization_id FROM public.schedule_items lb_si WHERE lb_si.id = schedule_item_assignees.item_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.items.edit'::text) AS get_user_permission_org_ids)) AND (item_id IN ( SELECT si.id
   FROM schedule_items si
  WHERE (si.organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))))));

-- schedule_item_assignees · SELECT
ALTER POLICY "Users can view schedule item assignees" ON public.schedule_item_assignees
  USING (((( SELECT lb_si.organization_id FROM public.schedule_items lb_si WHERE lb_si.id = schedule_item_assignees.item_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.items.view'::text) AS get_user_permission_org_ids)) AND (item_id IN ( SELECT si.id
   FROM schedule_items si
  WHERE (si.organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))))));

-- schedule_item_events · INSERT
ALTER POLICY "Users can create schedule item events" ON public.schedule_item_events
  WITH CHECK (((( SELECT lb_si.organization_id FROM public.schedule_items lb_si WHERE lb_si.id = schedule_item_events.item_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.items.view'::text) AS get_user_permission_org_ids)) AND (item_id IN ( SELECT si.id
   FROM schedule_items si
  WHERE (si.organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))))));

-- schedule_item_events · SELECT
ALTER POLICY "Users can view schedule item events" ON public.schedule_item_events
  USING (((( SELECT lb_si.organization_id FROM public.schedule_items lb_si WHERE lb_si.id = schedule_item_events.item_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.items.view'::text) AS get_user_permission_org_ids)) AND (item_id IN ( SELECT si.id
   FROM schedule_items si
  WHERE (si.organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))))));

-- schedule_items · INSERT
ALTER POLICY "Users can create schedule items" ON public.schedule_items
  WITH CHECK (((schedule_items.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.items.create'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))));

-- schedule_items · DELETE
ALTER POLICY "Users can delete schedule items" ON public.schedule_items
  USING (((schedule_items.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.items.delete'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)) AND (EXISTS ( SELECT 1
   FROM get_schedule_item_scope_context(schedule_items.organization_id, 'scheduling.items.delete'::text) ctx(applied_scope, owner_ids)
  WHERE ((ctx.applied_scope = 'ORG'::text) OR (schedule_items.created_by = ANY (ctx.owner_ids)) OR (schedule_items.user_id = ANY (ctx.owner_ids)) OR schedule_item_assigned_to_owners(schedule_items.id, ctx.owner_ids))))));

-- schedule_items · UPDATE
ALTER POLICY "Users can update schedule items" ON public.schedule_items
  USING (((schedule_items.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.items.edit'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)) AND (EXISTS ( SELECT 1
   FROM get_schedule_item_scope_context(schedule_items.organization_id, 'scheduling.items.edit'::text) ctx(applied_scope, owner_ids)
  WHERE ((ctx.applied_scope = 'ORG'::text) OR (schedule_items.created_by = ANY (ctx.owner_ids)) OR (schedule_items.user_id = ANY (ctx.owner_ids)) OR schedule_item_assigned_to_owners(schedule_items.id, ctx.owner_ids))))));

-- schedule_items · SELECT
ALTER POLICY "Users can view schedule items (scoped)" ON public.schedule_items
  USING (((schedule_items.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.items.view'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)) AND (EXISTS ( SELECT 1
   FROM get_schedule_item_scope_context(schedule_items.organization_id, 'scheduling.items.view'::text) ctx(applied_scope, owner_ids)
  WHERE ((ctx.applied_scope = 'ORG'::text) OR (schedule_items.created_by = ANY (ctx.owner_ids)) OR (schedule_items.user_id = ANY (ctx.owner_ids)) OR schedule_item_assigned_to_owners(schedule_items.id, ctx.owner_ids))))));

-- schedule_resources · INSERT
ALTER POLICY "Users can create schedule resources" ON public.schedule_resources
  WITH CHECK (((schedule_resources.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.resources.create'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))));

-- schedule_resources · DELETE
ALTER POLICY "Users can delete schedule resources" ON public.schedule_resources
  USING (((schedule_resources.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.resources.delete'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))));

-- schedule_resources · UPDATE
ALTER POLICY "Users can update schedule resources" ON public.schedule_resources
  USING (((schedule_resources.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.resources.edit'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))));

-- schedule_resources · SELECT
ALTER POLICY "Users can view schedule resources" ON public.schedule_resources
  USING (((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)) AND ((schedule_resources.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.resources.view'::text) AS get_user_permission_org_ids)) OR schedule_resource_is_current_user(user_id))));

-- schedule_settings · DELETE
ALTER POLICY "schedule_settings_delete" ON public.schedule_settings
  USING (((schedule_settings.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.settings'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))));

-- schedule_settings · INSERT
ALTER POLICY "schedule_settings_insert" ON public.schedule_settings
  WITH CHECK (((schedule_settings.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.settings'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))));

-- schedule_settings · SELECT
ALTER POLICY "schedule_settings_select" ON public.schedule_settings
  USING (((schedule_settings.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.settings'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))));

-- schedule_settings · UPDATE
ALTER POLICY "schedule_settings_update" ON public.schedule_settings
  USING (((schedule_settings.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.settings'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))));

-- service_categories · DELETE
ALTER POLICY "service_categories_delete" ON public.service_categories
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((parent_id IS NULL) AND (CASE WHEN service_categories.parent_id IS NULL THEN service_categories.organization_id ELSE get_service_category_org_id(service_categories.parent_id, 0) END IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'service_categories.delete'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))) OR ((parent_id IS NOT NULL) AND (CASE WHEN service_categories.parent_id IS NULL THEN service_categories.organization_id ELSE get_service_category_org_id(service_categories.parent_id, 0) END IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'service_subcategories.delete'::text) AS get_user_permission_org_ids)) AND (get_service_category_org_id(parent_id, 0) IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- service_categories · INSERT
ALTER POLICY "service_categories_insert" ON public.service_categories
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((parent_id IS NULL) AND (CASE WHEN service_categories.parent_id IS NULL THEN service_categories.organization_id ELSE get_service_category_org_id(service_categories.parent_id, 0) END IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'service_categories.create'::text) AS get_user_permission_org_ids)) AND (organization_id IS NOT NULL) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))) OR ((parent_id IS NOT NULL) AND (CASE WHEN service_categories.parent_id IS NULL THEN service_categories.organization_id ELSE get_service_category_org_id(service_categories.parent_id, 0) END IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'service_subcategories.create'::text) AS get_user_permission_org_ids)) AND (get_service_category_org_id(parent_id, 0) IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- service_categories · UPDATE
ALTER POLICY "service_categories_update" ON public.service_categories
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((parent_id IS NULL) AND (CASE WHEN service_categories.parent_id IS NULL THEN service_categories.organization_id ELSE get_service_category_org_id(service_categories.parent_id, 0) END IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'service_categories.edit'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))) OR ((parent_id IS NOT NULL) AND (CASE WHEN service_categories.parent_id IS NULL THEN service_categories.organization_id ELSE get_service_category_org_id(service_categories.parent_id, 0) END IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'service_subcategories.edit'::text) AS get_user_permission_org_ids)) AND (get_service_category_org_id(parent_id, 0) IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))))
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((parent_id IS NULL) AND (CASE WHEN service_categories.parent_id IS NULL THEN service_categories.organization_id ELSE get_service_category_org_id(service_categories.parent_id, 0) END IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'service_categories.edit'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))) OR ((parent_id IS NOT NULL) AND (CASE WHEN service_categories.parent_id IS NULL THEN service_categories.organization_id ELSE get_service_category_org_id(service_categories.parent_id, 0) END IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'service_subcategories.edit'::text) AS get_user_permission_org_ids)) AND (EXISTS ( SELECT 1
   FROM ( SELECT get_service_category_org_id(service_categories.parent_id, 0) AS resolved_org) r
  WHERE ((r.resolved_org IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND ((service_categories.organization_id IS NULL) OR (service_categories.organization_id = r.resolved_org))))))));

-- service_fee_types · DELETE
ALTER POLICY "service_fee_types_delete" ON public.service_fee_types
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((service_fee_types.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'service_fees.delete'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- service_fee_types · INSERT
ALTER POLICY "service_fee_types_insert" ON public.service_fee_types
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((service_fee_types.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'service_fees.create'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- service_fee_types · UPDATE
ALTER POLICY "service_fee_types_update" ON public.service_fee_types
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((service_fee_types.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'service_fees.edit'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))))
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((service_fee_types.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'service_fees.edit'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- service_materials · INSERT
ALTER POLICY "service_materials_insert_policy" ON public.service_materials
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (service_materials.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'services.edit'::text) AS get_user_permission_org_ids)) AND (EXISTS ( SELECT 1
   FROM services s
  WHERE (s.id = service_materials.service_id))))));

-- service_materials · UPDATE
ALTER POLICY "service_materials_update_policy" ON public.service_materials
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (service_materials.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'services.edit'::text) AS get_user_permission_org_ids)) AND (EXISTS ( SELECT 1
   FROM services s
  WHERE (s.id = service_materials.service_id))))))
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (service_materials.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'services.edit'::text) AS get_user_permission_org_ids)) AND (EXISTS ( SELECT 1
   FROM services s
  WHERE (s.id = service_materials.service_id))))));

-- service_organizations · DELETE
ALTER POLICY "authenticated_delete_service_organizations" ON public.service_organizations
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((service_organizations.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'services.edit'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- service_organizations · INSERT
ALTER POLICY "authenticated_insert_service_organizations" ON public.service_organizations
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((service_organizations.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'services.edit'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- service_organizations · UPDATE
ALTER POLICY "authenticated_update_service_organizations" ON public.service_organizations
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((service_organizations.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'services.edit'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))))
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((service_organizations.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'services.edit'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- service_prices · DELETE
ALTER POLICY "service_prices_delete" ON public.service_prices
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((( SELECT lb_s.organization_id FROM public.services lb_s WHERE lb_s.id = service_prices.service_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'services.delete'::text) AS get_user_permission_org_ids)) AND (EXISTS ( SELECT 1
   FROM services s
  WHERE ((s.id = service_prices.service_id) AND (s.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))))));

-- service_prices · INSERT
ALTER POLICY "service_prices_insert" ON public.service_prices
  WITH CHECK (((created_by = current_business_user_id()) AND (is_system_admin_user(( SELECT auth.uid() AS uid)) OR (((( SELECT lb_s.organization_id FROM public.services lb_s WHERE lb_s.id = service_prices.service_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'services.create'::text) AS get_user_permission_org_ids)) OR (( SELECT lb_s.organization_id FROM public.services lb_s WHERE lb_s.id = service_prices.service_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'services.edit'::text) AS get_user_permission_org_ids))) AND (EXISTS ( SELECT 1
   FROM services s
  WHERE ((s.id = service_prices.service_id) AND (s.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))))))));

-- service_prices · UPDATE
ALTER POLICY "service_prices_update" ON public.service_prices
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((( SELECT lb_s.organization_id FROM public.services lb_s WHERE lb_s.id = service_prices.service_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'services.edit'::text) AS get_user_permission_org_ids)) AND (EXISTS ( SELECT 1
   FROM services s
  WHERE ((s.id = service_prices.service_id) AND (s.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))))))
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((( SELECT lb_s.organization_id FROM public.services lb_s WHERE lb_s.id = service_prices.service_id) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'services.edit'::text) AS get_user_permission_org_ids)) AND (EXISTS ( SELECT 1
   FROM services s
  WHERE ((s.id = service_prices.service_id) AND (s.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))))));

-- services · DELETE
ALTER POLICY "services_delete" ON public.services
  USING (((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)) AND (services.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'services.delete'::text) AS get_user_permission_org_ids))));

-- services · INSERT
ALTER POLICY "services_insert" ON public.services
  WITH CHECK (((created_by = current_business_user_id()) AND (organization_id IS NOT NULL) AND (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)) AND (services.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'services.create'::text) AS get_user_permission_org_ids))));

-- services · UPDATE
ALTER POLICY "services_update" ON public.services
  USING (((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)) AND (services.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'services.edit'::text) AS get_user_permission_org_ids))))
  WITH CHECK (((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)) AND (services.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'services.edit'::text) AS get_user_permission_org_ids))));

-- stock_movements · INSERT
ALTER POLICY "stock_movements_insert_policy" ON public.stock_movements
  WITH CHECK (((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (stock_movements.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'inventory.edit'::text) AS get_user_permission_org_ids))));

-- stock_movements · SELECT
ALTER POLICY "stock_movements_select_policy" ON public.stock_movements
  USING (((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (stock_movements.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'inventory.view'::text) AS get_user_permission_org_ids))));

-- stocks · DELETE
ALTER POLICY "stocks_delete_policy" ON public.stocks
  USING (((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)) AND (stocks.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'inventory.delete'::text) AS get_user_permission_org_ids))));

-- stocks · INSERT
ALTER POLICY "stocks_insert_policy" ON public.stocks
  WITH CHECK (((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)) AND (stocks.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'inventory.create'::text) AS get_user_permission_org_ids))));

-- stocks · SELECT
ALTER POLICY "stocks_select_policy" ON public.stocks
  USING (((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (stocks.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'inventory.view'::text) AS get_user_permission_org_ids))));

-- stocks · UPDATE
ALTER POLICY "stocks_update_policy" ON public.stocks
  USING (((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)) AND (stocks.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'inventory.edit'::text) AS get_user_permission_org_ids))));

-- supplier_account_links · SELECT
ALTER POLICY "supplier_account_links_select_crm" ON public.supplier_account_links
  USING (((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (supplier_account_links.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'suppliers.view'::text) AS get_user_permission_org_ids))));

-- supplier_catalog_dismissals · SELECT
ALTER POLICY "supplier_catalog_dismissals_select_crm" ON public.supplier_catalog_dismissals
  USING (((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (supplier_catalog_dismissals.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'suppliers.view'::text) AS get_user_permission_org_ids))));

-- supplier_delivery_note_lines · SELECT
ALTER POLICY "supplier_delivery_note_lines_select" ON public.supplier_delivery_note_lines
  USING (((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND ((supplier_delivery_note_lines.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'purchase_orders.view'::text) AS get_user_permission_org_ids)) OR (supplier_delivery_note_lines.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'purchase_orders.receive'::text) AS get_user_permission_org_ids)))));

-- supplier_delivery_note_orders · SELECT
ALTER POLICY "supplier_delivery_note_orders_select" ON public.supplier_delivery_note_orders
  USING (((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND ((supplier_delivery_note_orders.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'purchase_orders.view'::text) AS get_user_permission_org_ids)) OR (supplier_delivery_note_orders.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'purchase_orders.receive'::text) AS get_user_permission_org_ids)))));

-- supplier_delivery_notes · SELECT
ALTER POLICY "supplier_delivery_notes_select" ON public.supplier_delivery_notes
  USING (((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND ((supplier_delivery_notes.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'purchase_orders.view'::text) AS get_user_permission_org_ids)) OR (supplier_delivery_notes.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'purchase_orders.receive'::text) AS get_user_permission_org_ids)))));

-- supplier_po_publications · SELECT
ALTER POLICY "supplier_po_publications_select_crm" ON public.supplier_po_publications
  USING (((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (supplier_po_publications.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'purchase_orders.view'::text) AS get_user_permission_org_ids))));

-- supplier_portal_user_access · SELECT
ALTER POLICY "supplier_portal_user_access_select_crm" ON public.supplier_portal_user_access
  USING (((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (supplier_portal_user_access.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'suppliers.view'::text) AS get_user_permission_org_ids))));

-- supplier_price_change_requests · SELECT
ALTER POLICY "supplier_price_change_requests_select_crm" ON public.supplier_price_change_requests
  USING (((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (supplier_price_change_requests.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'suppliers.view'::text) AS get_user_permission_org_ids)) AND ((supplier_price_change_requests.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'suppliers.view_pricing'::text) AS get_user_permission_org_ids)) OR (supplier_price_change_requests.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.view_cost'::text) AS get_user_permission_org_ids)))));

-- suppliers · DELETE
ALTER POLICY "suppliers_delete_policy" ON public.suppliers
  USING (((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)) AND (suppliers.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'suppliers.delete'::text) AS get_user_permission_org_ids))));

-- suppliers · INSERT
ALTER POLICY "suppliers_insert_policy" ON public.suppliers
  WITH CHECK (((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)) AND (suppliers.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'suppliers.create'::text) AS get_user_permission_org_ids))));

-- suppliers · SELECT
ALTER POLICY "suppliers_select_policy" ON public.suppliers
  USING (((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (suppliers.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'suppliers.view'::text) AS get_user_permission_org_ids))));

-- suppliers · UPDATE
ALTER POLICY "suppliers_update_policy" ON public.suppliers
  USING (((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)) AND (suppliers.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'suppliers.edit'::text) AS get_user_permission_org_ids))));

-- uom · DELETE
ALTER POLICY "uom_delete" ON public.uom
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((uom.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- uom · INSERT
ALTER POLICY "uom_insert" ON public.uom
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((uom.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (organization_id IS NOT NULL) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- uom · UPDATE
ALTER POLICY "uom_update" ON public.uom
  USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((uom.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))))
  WITH CHECK ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR ((uom.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'products.manage'::text) AS get_user_permission_org_ids)) AND (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))));

-- warehouses · DELETE
ALTER POLICY "warehouses_delete_policy" ON public.warehouses
  USING (((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)) AND (warehouses.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'warehouses.delete'::text) AS get_user_permission_org_ids))));

-- warehouses · INSERT
ALTER POLICY "warehouses_insert_policy" ON public.warehouses
  WITH CHECK (((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)) AND (warehouses.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'warehouses.create'::text) AS get_user_permission_org_ids))));

-- warehouses · SELECT
ALTER POLICY "warehouses_select_policy" ON public.warehouses
  USING (((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (warehouses.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'warehouses.view'::text) AS get_user_permission_org_ids))));

-- warehouses · UPDATE
ALTER POLICY "warehouses_update_policy" ON public.warehouses
  USING (((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)) AND (warehouses.organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'warehouses.edit'::text) AS get_user_permission_org_ids))));
