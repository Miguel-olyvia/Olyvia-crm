-- ============================================================
-- 20270112710000 — papéis de teste sem permissões a mais
-- ============================================================
-- O que faz: retira de anew_role_permissions, SÓ nos papéis de teste da organização b6ffce4f-f630-4933-833a-008649757a33,
--   15 códigos que estes papéis não devem ter. Não toca em super_admin/system_admin nem em nenhum outro papel.
--   deals.view NÃO é retirado.
--
-- Papéis (lista fechada, por id e código — confirmados por SELECT em 10/11/2026; nenhum é is_system):
--   teste_rh_chefia             5b198fb0-4617-0de5-ba2b-97794d75adc4
--   teste_rh_colaborador        67582433-3082-2d00-9e7d-6f282b40049c
--   teste_rh_gestao             cc8bb969-8b1c-f71f-be35-6091a3af5697
--   teste_rh_so_ponto           62b2302a-ed25-b085-e543-52d20dbdaf2a   (não tem nenhum dos códigos; fica na lista)
--   testescope_base_role        cdbe453f-1732-4cec-aa0f-a5832324112f
--   testescope_gestor_contratos b10c6fb2-ed52-4173-bddb-ac59242f973f   (não tem nenhum dos códigos; fica na lista)
--   testescope_outofteam_role   8aad9a25-905d-4162-ade0-1fa2566b6b16
--   testescope_sem_rh           e3d4bfc8-1b30-449b-83bf-186a06e46849
--   testescope_so_utilizadores  9420af2f-e637-4316-bd3f-cafc3fe467f3   (não tem nenhum dos códigos; fica na lista)
--   testescope_vendas_junior    51921d18-0168-4032-a748-ff53c5f651b4
--   testescope_vendas_senior    263ed08c-f6b7-4d5c-b3d0-1eca5a1017ec
--   viewer                      72ce614f-38c9-4017-ad8c-03413f702bda
--
-- Linhas que saem (29, estado de 10/11/2026):
--   teste_rh_chefia            hr.module.access
--   teste_rh_colaborador       hr.module.access
--   teste_rh_gestao            hr.ausencias.direitos.edit, hr.module.access, hr.pessoas.horario_realizado.edit
--   testescope_base_role       channels.view, contacts.view, lists.view, product_subcategories.view,
--                              service_categories.view, service_subcategories.view
--   testescope_outofteam_role  channels.view, contacts.view, lists.view, product_subcategories.view,
--                              service_categories.view, service_subcategories.view
--   testescope_sem_rh          contacts.view
--   testescope_vendas_junior   contacts.create, contacts.view
--   testescope_vendas_senior   contacts.create, contacts.view, deals.create, direct_sales.confirm, direct_sales.create,
--                              direct_sales.edit, direct_sales.register_invoice
--   viewer                     product_subcategories.view, service_subcategories.view
--
-- Guardas: cada id tem de existir, ter o código indicado, ser da organização b6ffce4f, não ser de sistema e não estar
--   apagado; senão pára. Os gatilhos de anew_role_permissions ficam ligados (o de auditoria regista cada DELETE;
--   protect_system_role_permissions não se aplica porque nenhum é de sistema).
-- Reversão: reinserir as 29 linhas acima (role_id, permission_code).
-- ============================================================
SET lock_timeout = '5s';

CREATE TEMP TABLE tmp_m2_papeis (role_id uuid PRIMARY KEY, code text NOT NULL) ON COMMIT DROP;
INSERT INTO tmp_m2_papeis (role_id, code) VALUES
  ('5b198fb0-4617-0de5-ba2b-97794d75adc4', 'teste_rh_chefia'),
  ('67582433-3082-2d00-9e7d-6f282b40049c', 'teste_rh_colaborador'),
  ('cc8bb969-8b1c-f71f-be35-6091a3af5697', 'teste_rh_gestao'),
  ('62b2302a-ed25-b085-e543-52d20dbdaf2a', 'teste_rh_so_ponto'),
  ('cdbe453f-1732-4cec-aa0f-a5832324112f', 'testescope_base_role'),
  ('b10c6fb2-ed52-4173-bddb-ac59242f973f', 'testescope_gestor_contratos'),
  ('8aad9a25-905d-4162-ade0-1fa2566b6b16', 'testescope_outofteam_role'),
  ('e3d4bfc8-1b30-449b-83bf-186a06e46849', 'testescope_sem_rh'),
  ('9420af2f-e637-4316-bd3f-cafc3fe467f3', 'testescope_so_utilizadores'),
  ('51921d18-0168-4032-a748-ff53c5f651b4', 'testescope_vendas_junior'),
  ('263ed08c-f6b7-4d5c-b3d0-1eca5a1017ec', 'testescope_vendas_senior'),
  ('72ce614f-38c9-4017-ad8c-03413f702bda', 'viewer');

CREATE TEMP TABLE tmp_m2_codigos (permission_code text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO tmp_m2_codigos (permission_code) VALUES
  ('hr.module.access'),
  ('hr.ausencias.direitos.edit'),
  ('hr.pessoas.horario_realizado.edit'),
  ('deals.create'),
  ('contacts.view'),
  ('contacts.create'),
  ('direct_sales.confirm'),
  ('direct_sales.create'),
  ('direct_sales.edit'),
  ('direct_sales.register_invoice'),
  ('channels.view'),
  ('lists.view'),
  ('product_subcategories.view'),
  ('service_categories.view'),
  ('service_subcategories.view');

DO $guarda$
DECLARE
  v_mal text;
BEGIN
  SELECT string_agg(t.code || ' (' || t.role_id || ')', ', ') INTO v_mal
    FROM tmp_m2_papeis t
    LEFT JOIN public.anew_roles r ON r.id = t.role_id
   WHERE r.id IS NULL
      OR r.code IS DISTINCT FROM t.code
      OR r.organization_id IS DISTINCT FROM 'b6ffce4f-f630-4933-833a-008649757a33'::uuid
      OR r.is_system IS NOT FALSE
      OR r.deleted_at IS NOT NULL;
  IF v_mal IS NOT NULL THEN
    RAISE EXCEPTION 'Guarda: papéis que já não são os de teste esperados: %. Rever esta migration.', v_mal;
  END IF;

  IF EXISTS (SELECT 1 FROM tmp_m2_codigos WHERE permission_code IN ('deals.view', 'system.manage')) THEN
    RAISE EXCEPTION 'Guarda: deals.view/system.manage não podem estar na lista.';
  END IF;
END $guarda$;

DO $apagar$
DECLARE
  v_n int;
BEGIN
  DELETE FROM public.anew_role_permissions rp
   USING tmp_m2_papeis t, tmp_m2_codigos c
   WHERE rp.role_id = t.role_id
     AND rp.permission_code = c.permission_code;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Papéis de teste: % permissões retiradas (esperadas 29 em 10/11/2026).', v_n;

  IF EXISTS (SELECT 1 FROM public.anew_role_permissions rp
               JOIN tmp_m2_papeis t ON t.role_id = rp.role_id
               JOIN tmp_m2_codigos c ON c.permission_code = rp.permission_code) THEN
    RAISE EXCEPTION 'Verificação: ainda há permissões da lista nos papéis de teste.';
  END IF;
END $apagar$;
