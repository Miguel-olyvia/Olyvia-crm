-- ============================================================
-- 20270105500000_permissoes_denuncias_rotulos
-- ============================================================
-- O que faz (base RH uetjghdkwbywbftedtth, texto vivo lido a 3/11/2026). Sem tabelas nem colunas novas.
--   1. Catálogo: hr.denuncias.gerir ("Gerir denúncias"), categoria hr, scope organization, perigosa (dados sensíveis), display_order 770
--      (a seguir à última hr.*, 760), pai hr.module.access. Hoje nenhuma função/policy a verifica: fica no catálogo para a gestão das
--      denúncias no RH. Concedida aos papéis globais de sistema super_admin e system_admin e aos papéis de organização (não apagados)
--      que têm hr.pessoas.edit (a 3/11: só teste_rh_gestao, org b6ffce4f…).
--   2. Rótulos (UPDATE name/description) para dizerem o que controlam: hr.pessoas.retribuicao.view/.edit (também o módulo Custos e os
--      equipamentos: hr_custo_exigir_leitura/escrita), hr.vencimento.codigos.*, hr.vencimento.subsidio.*, hr.pessoas.laborais.*
--      (rh_guardar_oficios_pessoa, rh_guardar_papeis_pessoa, rh_guardar_cargo_tecnico), services.view (cat_ler_catalogo: o Catálogo
--      inteiro, produtos incluídos) e product_categories.view (atributos por categoria em orçamentos e encomendas).
--   3. Policy authenticated_update_anew_hierarchy (de 20261206120000) pedia organizations.manage, que não existe no catálogo (ninguém
--      passava). ALTER POLICY troca só o código por organizations.edit, como o INSERT/DELETE (20261110330000); roles, cmd, permissive e
--      o resto do USING ficam iguais ao pg_policies vivo; WITH CHECK continua nulo.
--   4. obra_guardar_negocio (CREATE OR REPLACE do pg_get_functiondef vivo, md5 2a52e513ec661f692dec6361db7ce7c0 deixado por
--      20270105200000): a quem falta negocios.obra.executar, o erro ao marcar uma tarefa passa a citar essa permissão em vez de
--      negocios.obra.planear. A regra não muda.
-- Porque o set_config: protect_system_role_permissions só deixa escrever em papéis de sistema com request.jwt.claims->>'role' =
--   'service_role'; a claim é LOCAL e reposta logo a seguir (padrão de 20270105200000). Nenhum trigger é desligado.
-- Idempotente nos dados (ON CONFLICT DO NOTHING). Reversão (só como migration nova): repor obra_guardar_negocio com o texto de
--   20270105200000, a policy com organizations.manage, os rótulos antigos, e apagar hr.denuncias.gerir (anew_role_permissions com a
--   mesma claim, depois anew_permissions).
-- ============================================================
SET lock_timeout = '5s';

DO $do$
BEGIN
  IF md5(pg_get_functiondef('public.obra_guardar_negocio(uuid,uuid,jsonb)'::regprocedure)) <> '2a52e513ec661f692dec6361db7ce7c0' THEN
    RAISE EXCEPTION 'Guarda: obra_guardar_negocio mudou desde 3/11/2026. Refazer a partir do pg_get_functiondef vivo.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'anew_hierarchy'
                 AND policyname = 'authenticated_update_anew_hierarchy' AND cmd = 'UPDATE' AND roles = '{authenticated}'
                 AND permissive = 'PERMISSIVE' AND with_check IS NULL AND qual LIKE '%''organizations.manage''::text%') THEN
    RAISE EXCEPTION 'Guarda: authenticated_update_anew_hierarchy já não é a de 20261206120000 (organizations.manage). Rever.';
  END IF;
  IF (SELECT count(*) FROM public.anew_permissions WHERE code IN ('organizations.edit', 'hr.pessoas.edit', 'hr.module.access',
        'hr.pessoas.retribuicao.view', 'hr.pessoas.retribuicao.edit', 'hr.vencimento.codigos.view', 'hr.vencimento.codigos.gerir',
        'hr.vencimento.subsidio.view', 'hr.vencimento.subsidio.gerir', 'hr.pessoas.laborais.view', 'hr.pessoas.laborais.edit',
        'services.view', 'product_categories.view')) <> 13 THEN
    RAISE EXCEPTION 'Guarda: falta alguma das permissões a rotular (ou organizations.edit) no catálogo.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'organizations.manage') THEN
    RAISE EXCEPTION 'Guarda: organizations.manage passou a existir no catálogo. Rever o passo 3.';
  END IF;
END $do$;


-- 1. Catálogo
INSERT INTO public.anew_permissions
  (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('hr.denuncias.gerir', 'Gerir denúncias',
   'Ver e tratar as denúncias do canal de denúncias (gestão no RH).', 'hr', 'hr.module.access', 770, true, 'organization', false)
ON CONFLICT (code) DO NOTHING;

DO $$
DECLARE
  v_role       uuid;
  v_papel      text;
  v_n          int;
  v_n_org      int;
  v_prev_claim text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.denuncias.gerir') THEN
    RAISE EXCEPTION 'GUARDA: hr.denuncias.gerir não está no catálogo';
  END IF;

  -- super_admin e system_admin globais
  FOREACH v_papel IN ARRAY ARRAY['super_admin', 'system_admin'] LOOP
    SELECT count(*) INTO v_n FROM public.anew_roles r WHERE r.code = v_papel AND r.is_system = true AND r.organization_id IS NULL;
    IF v_n = 0 THEN
      RAISE NOTICE 'Papel % global não existe nesta base: não se concede nada.', v_papel;
      CONTINUE;
    ELSIF v_n > 1 THEN
      RAISE EXCEPTION 'GUARDA: % papéis % globais de sistema (esperado 1)', v_n, v_papel;
    END IF;
    SELECT r.id INTO v_role FROM public.anew_roles r WHERE r.code = v_papel AND r.is_system = true AND r.organization_id IS NULL;
    v_prev_claim := current_setting('request.jwt.claims', true);
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
    VALUES (v_role, 'hr.denuncias.gerir', NULL::uuid)
    ON CONFLICT (role_id, permission_code) DO NOTHING;
    PERFORM set_config('request.jwt.claims', CASE WHEN coalesce(v_prev_claim, '') = '' THEN '{}' ELSE v_prev_claim END, true);
    IF NOT EXISTS (SELECT 1 FROM public.anew_role_permissions rp WHERE rp.role_id = v_role AND rp.permission_code = 'hr.denuncias.gerir') THEN
      RAISE EXCEPTION 'CONFERIR: o % ficou sem hr.denuncias.gerir', v_papel;
    END IF;
  END LOOP;

  -- papéis de organização (não apagados; de sistema ou não) que têm hr.pessoas.edit: os de RH/direção
  SELECT count(*) INTO v_n_org FROM public.anew_roles r WHERE r.organization_id IS NOT NULL AND r.deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM public.anew_role_permissions rp WHERE rp.role_id = r.id AND rp.permission_code = 'hr.pessoas.edit');
  v_prev_claim := current_setting('request.jwt.claims', true);
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
  SELECT r.id, 'hr.denuncias.gerir', NULL::uuid
  FROM public.anew_roles r
  WHERE r.organization_id IS NOT NULL AND r.deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM public.anew_role_permissions rp WHERE rp.role_id = r.id AND rp.permission_code = 'hr.pessoas.edit')
  ON CONFLICT (role_id, permission_code) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM set_config('request.jwt.claims', CASE WHEN coalesce(v_prev_claim, '') = '' THEN '{}' ELSE v_prev_claim END, true);
  RAISE NOTICE 'Papéis de organização com hr.pessoas.edit: %; % linhas novas de hr.denuncias.gerir.', v_n_org, v_n;
END $$;


-- 2. Rótulos
UPDATE public.anew_permissions AS p SET name = v.name, description = v.description
FROM (VALUES
  ('hr.pessoas.retribuicao.view', 'Ver retribuição e custos',
   'Ver o histórico de retribuição (valor base, periodicidade e subsídio de alimentação) e o módulo Custos, incluindo os equipamentos.'),
  ('hr.pessoas.retribuicao.edit', 'Editar retribuição e custos',
   'Criar e alterar versões de retribuição e gravar no módulo Custos, incluindo os equipamentos. Cada alteração fica registada.'),
  ('hr.vencimento.codigos.view', 'Processamento salarial: ver códigos',
   'Ver o catálogo de códigos de processamento salarial: os transversais a todo o grupo (ex.: 100, 200) e os próprios desta organização.'),
  ('hr.vencimento.codigos.gerir', 'Processamento salarial: gerir códigos',
   'Criar e desativar códigos de processamento salarial PRÓPRIOS desta organização (ex.: recibos verdes, horas noturnas). Nunca afeta os códigos transversais ao grupo (100, 200).'),
  ('hr.vencimento.subsidio.view', 'Processamento salarial: ver subsídio de alimentação',
   'Ver o valor diário, o modo de pagamento e o mínimo de minutos trabalhados que a organização exige para o subsídio de alimentação.'),
  ('hr.vencimento.subsidio.gerir', 'Processamento salarial: gerir subsídio de alimentação',
   'Definir o valor diário, o modo de pagamento e o mínimo de minutos trabalhados do subsídio de alimentação de TODA a organização. A exceção por pessoa continua na retribuição (hr.pessoas.retribuicao.edit).'),
  ('hr.pessoas.laborais.view', 'Ver dados laborais, ofícios e papéis',
   'Ver reporta a, entidade legal, número interno, datas de admissão e antiguidade, e os ofícios, papéis e cargo técnico da pessoa.'),
  ('hr.pessoas.laborais.edit', 'Editar dados laborais, ofícios e papéis',
   'Editar reporta a, entidade legal, número interno e datas, e gravar os ofícios, os papéis e o cargo técnico da pessoa.'),
  ('services.view', 'Ver Catálogo e custos',
   'Abrir o Catálogo inteiro (serviços e produtos), com os custos.'),
  ('product_categories.view', 'View product categories',
   'View product categories. Controla também os atributos por categoria nos orçamentos e nas encomendas.')
) AS v(code, name, description)
WHERE p.code = v.code;


-- 3. Policy de UPDATE em anew_hierarchy: organizations.manage (inexistente) -> organizations.edit; o resto fica igual
ALTER POLICY authenticated_update_anew_hierarchy ON public.anew_hierarchy
  USING ((parent_org_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (child_org_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND has_anew_permission(( SELECT auth.uid() AS uid), 'organizations.edit'::text));


-- 4. obra_guardar_negocio: mensagem de quem não tem negocios.obra.executar
CREATE OR REPLACE FUNCTION public.obra_guardar_negocio(p_org uuid, p_negocio_id uuid, p_obra jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- 20270102220000: o código antigo do papel da obra deu lugar a negocios.obra.planear (o Gestor de obra) e negocios.obra.executar (o técnico)
  v_user uuid := public.fn_cat_exigir_uma(p_org, ARRAY['pessoas.edit', 'negocios.obra.planear', 'negocios.obra.executar']);
  v_existe boolean; v_planear boolean; v_executar boolean; v_eu uuid; v_porque text; s record;
  v_neg negocios; v_obra ops_obra; v_codigo text; v_estado text; v_plano boolean; v_inicio date;
  t jsonb; v_chave text; v_nome text; v_fase uuid; v_tar uuid; v_skill uuid; v_skill_nome text; v_pessoa uuid; v_tarestado text; v_pessoas smallint;
  v_chaves text[] := '{}'; v_avisos text[] := '{}';
  v_imp_a jsonb; v_imp_d jsonb; v_auto_a jsonb; v_auto_d jsonb; -- 20270105200000
BEGIN
  SELECT * INTO v_neg FROM negocios WHERE id = p_negocio_id AND organization_id = p_org AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Negócio não encontrado nesta organização.' USING ERRCODE = 'NE003'; END IF;
  IF p_obra IS NULL OR jsonb_typeof(p_obra) <> 'object' THEN RAISE EXCEPTION 'A obra tem de ser um objeto.' USING ERRCODE = 'CT002'; END IF;
  v_plano := coalesce(jsonb_typeof(p_obra->'tarefas') = 'array', false);
  v_estado := coalesce(nullif(p_obra->>'estado', ''), 'planeada');
  IF v_estado NOT IN ('planeada', 'em_curso', 'suspensa', 'concluida', 'cancelada') THEN
    RAISE EXCEPTION 'Estado da obra inválido: %.', v_estado USING ERRCODE = 'CT002';
  END IF;
  BEGIN
    v_inicio := nullif(p_obra->>'inicio', '')::date;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Data de início inválida: %.', p_obra->>'inicio' USING ERRCODE = 'CT002';
  END;

  SELECT * INTO v_obra FROM ops_obra WHERE negocio_id = p_negocio_id AND organization_id = p_org FOR UPDATE;
  v_existe := FOUND;

  -- 20270102220000: sem negocios.obra.planear, compara-se a obra gravada com a nova e só passa o que é de quem executa: as tarefas
  -- atribuídas a ele (ops_obra_tarefa_rh; no estado da Emylia, tasks[i].tec), marcadas em curso ou feitas, com os registos, as
  -- fotografias, as notas e os imprevistos delas (fn_obra_execucao_permitida). Gravar sem mudanças passa sempre. O plano, o estado da
  -- obra, o cancelamento, a atribuição dos técnicos, a validação e as tarefas novas ou apagadas são do Gestor de obra.
  v_planear := public.fn_cat_pode(p_org, 'negocios.obra.planear');
  IF NOT v_planear AND NOT v_existe THEN
    -- a obra nasce do orçamento (o plano gerado, por aprovar, sem nada feito): quem grava o negócio pode criá-la
    IF v_plano AND (v_estado <> 'planeada' OR NOT public.fn_cat_pode(p_org, 'pessoas.edit')
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_obra->'tarefas') x WHERE coalesce(nullif(x->>'estado', ''), 'por_fazer') <> 'por_fazer')) THEN
      RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): só o Gestor de obra cria uma obra que já não está só planeada.' USING ERRCODE = 'CT001';
    END IF;
  ELSIF NOT v_planear THEN
    v_executar := public.fn_cat_pode(p_org, 'negocios.obra.executar');
    v_eu := CASE WHEN v_executar THEN public.fn_neg_pessoa_da_conta(p_org) END;
    IF NOT v_plano OR v_estado IS DISTINCT FROM v_obra.estado THEN
      RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): não pode mudar o estado da obra nem cancelá-la.' USING ERRCODE = 'CT001';
    END IF;
    IF (SELECT coalesce(array_agg(t.chave ORDER BY t.chave), '{}') FROM ops_obra_tarefa t WHERE t.obra_id = v_obra.id)
       IS DISTINCT FROM (SELECT coalesce(array_agg(btrim(x->>'chave') ORDER BY btrim(x->>'chave')), '{}') FROM jsonb_array_elements(p_obra->'tarefas') x) THEN
      RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): não pode juntar nem tirar tarefas do plano.' USING ERRCODE = 'CT001';
    END IF;
    FOR s IN SELECT t.chave, t.nome, t.estado, (SELECT r.pessoa_id FROM ops_obra_tarefa_rh r WHERE r.tarefa_id = t.id LIMIT 1) AS pessoa,
                    CASE WHEN coalesce(nullif(x->>'estado', ''), 'por_fazer') IN ('por_fazer', 'em_curso', 'feita', 'validada', 'rejeitada')
                         THEN coalesce(nullif(x->>'estado', ''), 'por_fazer') ELSE 'por_fazer' END AS novo,
                    CASE WHEN coalesce(x->>'pessoa', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (x->>'pessoa')::uuid END AS nova_pessoa
             FROM ops_obra_tarefa t JOIN jsonb_array_elements(p_obra->'tarefas') x ON btrim(x->>'chave') = t.chave
             WHERE t.obra_id = v_obra.id LOOP
      IF s.nova_pessoa IS DISTINCT FROM s.pessoa THEN
        RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): não pode mudar o técnico da tarefa %.', s.nome USING ERRCODE = 'CT001';
      END IF;
      IF s.novo IS DISTINCT FROM s.estado AND NOT (v_eu IS NOT NULL AND s.pessoa = v_eu AND s.estado <> 'validada' AND s.novo IN ('em_curso', 'feita')) THEN
        -- 20270105500000: sem negocios.obra.executar a falta é essa (não a do Gestor de obra); a regra não muda, só a mensagem
        IF NOT coalesce(v_executar, false) THEN
          RAISE EXCEPTION 'Sem permissão (negocios.obra.executar): não pode marcar a tarefa % em curso ou feita.', s.nome
            USING ERRCODE = 'CT001';
        END IF;
        RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): na tarefa % só quem a tem atribuída a marca em curso ou feita; validar e pedir correção é do Gestor de obra.', s.nome
          USING ERRCODE = 'CT001';
      END IF;
    END LOOP;
    v_porque := public.fn_obra_execucao_permitida(v_obra.estado_emylia, p_obra->'emylia', v_eu);
    IF v_porque IS NOT NULL THEN
      RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): não pode mudar %; só regista a execução das tarefas atribuídas a si.', v_porque USING ERRCODE = 'CT001';
    END IF;
    -- grava só a execução: o estado da Emylia e o estado das tarefas dele; o resto da projeção (datas, nomes, técnicos) fica o da base
    UPDATE ops_obra SET estado_emylia = p_obra->'emylia', atualizada_em = now()
    WHERE id = v_obra.id AND estado_emylia IS DISTINCT FROM p_obra->'emylia';
    UPDATE ops_obra_tarefa t SET estado = x.novo, atualizada_em = now()
    FROM (SELECT btrim(y->>'chave') AS chave, CASE WHEN coalesce(nullif(y->>'estado', ''), 'por_fazer') IN ('por_fazer', 'em_curso', 'feita', 'validada', 'rejeitada')
                         THEN coalesce(nullif(y->>'estado', ''), 'por_fazer') ELSE 'por_fazer' END AS novo FROM jsonb_array_elements(p_obra->'tarefas') y) x
    WHERE t.obra_id = v_obra.id AND t.chave = x.chave AND t.estado IS DISTINCT FROM x.novo;
    RETURN jsonb_build_object('obra_id', v_obra.id, 'codigo', v_obra.codigo, 'avisos', '[]'::jsonb);
  END IF;

  -- 20270105200000: daqui para baixo grava quem planeia (ou quem cria a obra só planeada). Por cima disso:
  --   negocios.obra.imprevistos  mudar ou tirar um imprevisto já gravado (propor ao cliente, decidir, fechar). Registar um novo (no fim da
  --                              lista) não a pede: é da execução (fn_obra_execucao_permitida) ou do planeamento.
  --   negocios.obra.fechar       a obra passar a concluída, ou o auto de receção mudar (enviá-lo). A assinatura do auto que o cliente fez no
  --                              portal (negocio_rececao_cliente com o mesmo número) passa sem ela: é o espelho do que já está na base.
  v_imp_a := public.fn_neg_lista(CASE WHEN v_existe THEN v_obra.estado_emylia->'imprevistos' END);
  v_imp_d := public.fn_neg_lista(p_obra->'emylia'->'imprevistos');
  IF (jsonb_array_length(v_imp_d) < jsonb_array_length(v_imp_a)
      OR EXISTS (SELECT 1 FROM generate_series(0, jsonb_array_length(v_imp_a) - 1) i WHERE (v_imp_d->i) IS DISTINCT FROM (v_imp_a->i)))
     AND NOT public.fn_cat_pode(p_org, 'negocios.obra.imprevistos') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.obra.imprevistos): não pode propor nem decidir os imprevistos da obra.' USING ERRCODE = 'CT001';
  END IF;
  v_auto_a := CASE WHEN v_existe AND jsonb_typeof(v_obra.estado_emylia->'auto') = 'object' THEN v_obra.estado_emylia->'auto' END;
  v_auto_d := CASE WHEN jsonb_typeof(p_obra->'emylia'->'auto') = 'object' THEN p_obra->'emylia'->'auto' END;
  IF ((v_estado = 'concluida' AND (NOT v_existe OR v_obra.estado IS DISTINCT FROM 'concluida'))
      OR (v_auto_d IS DISTINCT FROM v_auto_a
          AND NOT (v_auto_a->>'estado' = 'por assinar' AND v_auto_d->>'estado' = 'assinado' AND v_auto_d->>'n' = v_auto_a->>'n'
                   AND (v_auto_d - ARRAY['estado', 'assinado', 'assinatura', 'reservas']) = (v_auto_a - ARRAY['estado', 'assinado', 'assinatura', 'reservas'])
                   AND EXISTS (SELECT 1 FROM negocio_rececao_cliente r WHERE r.negocio_id = p_negocio_id AND r.auto_n = v_auto_d->>'n'))))
     AND NOT public.fn_cat_pode(p_org, 'negocios.obra.fechar') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.obra.fechar): não pode encerrar a obra nem enviar o auto de receção.' USING ERRCODE = 'CT001';
  END IF;

  IF NOT v_existe THEN
    IF NOT v_plano THEN RETURN jsonb_build_object('obra_id', NULL, 'codigo', NULL, 'avisos', '[]'::jsonb); END IF;
    v_codigo := 'OB-' || coalesce(v_neg.numero::text, left(p_negocio_id::text, 8));
    IF EXISTS (SELECT 1 FROM ops_obra WHERE organization_id = p_org AND codigo = v_codigo) THEN
      v_codigo := v_codigo || '-' || left(replace(gen_random_uuid()::text, '-', ''), 4);
    END IF;
    INSERT INTO ops_obra (organization_id, codigo, negocio_id, titulo, morada, estado, data_inicio_prevista, criada_por, estado_emylia,
                          iniciada_em, concluida_em)
    VALUES (p_org, v_codigo, p_negocio_id,
            coalesce(nullif(btrim(p_obra->>'titulo'), ''), nullif(btrim(v_neg.titulo), ''), 'Obra ' || v_codigo),
            nullif(btrim(coalesce(p_obra->>'morada', '')), ''), v_estado, v_inicio, v_user, p_obra->'emylia',
            CASE WHEN v_estado IN ('em_curso', 'concluida') THEN now() END, CASE WHEN v_estado = 'concluida' THEN now() END)
    RETURNING * INTO v_obra;
  ELSE
    UPDATE ops_obra SET
      titulo = coalesce(nullif(btrim(p_obra->>'titulo'), ''), titulo),
      morada = coalesce(nullif(btrim(coalesce(p_obra->>'morada', '')), ''), morada),
      estado = CASE WHEN v_plano THEN v_estado ELSE 'cancelada' END,
      data_inicio_prevista = coalesce(v_inicio, data_inicio_prevista),
      iniciada_em = CASE WHEN v_estado IN ('em_curso', 'concluida') THEN coalesce(iniciada_em, now()) ELSE iniciada_em END,
      concluida_em = CASE WHEN v_estado = 'concluida' THEN coalesce(concluida_em, now()) ELSE concluida_em END,
      estado_emylia = p_obra->'emylia',
      atualizada_em = now()
    WHERE id = v_obra.id
    RETURNING * INTO v_obra;
  END IF;

  IF NOT v_plano THEN
    DELETE FROM ops_obra_tarefa_rh WHERE obra_id = v_obra.id;
    RETURN jsonb_build_object('obra_id', v_obra.id, 'codigo', v_obra.codigo, 'avisos', '[]'::jsonb);
  END IF;

  -- as fases: as que o motor manda e as que as tarefas usam
  INSERT INTO ops_obra_fase (organization_id, obra_id, ordem, nome)
  SELECT p_org, v_obra.id, f.ordem, coalesce(max(f.nome), 'Fase ' || f.ordem)
  FROM (
    SELECT (x->>'ordem')::smallint AS ordem, nullif(btrim(x->>'nome'), '') AS nome
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_obra->'fases') = 'array' THEN p_obra->'fases' ELSE '[]'::jsonb END) x
    UNION ALL
    SELECT coalesce((x->>'fase')::smallint, 0), NULL FROM jsonb_array_elements(p_obra->'tarefas') x
  ) f
  GROUP BY f.ordem
  ON CONFLICT (obra_id, ordem) DO UPDATE SET nome = EXCLUDED.nome WHERE ops_obra_fase.nome IS DISTINCT FROM EXCLUDED.nome;

  FOR t IN SELECT x FROM jsonb_array_elements(p_obra->'tarefas') x LOOP
    v_chave := nullif(btrim(coalesce(t->>'chave', '')), '');
    v_nome := nullif(btrim(coalesce(t->>'nome', '')), '');
    IF v_chave IS NULL OR v_nome IS NULL THEN RAISE EXCEPTION 'Cada tarefa precisa de chave e nome.' USING ERRCODE = 'CT002'; END IF;
    IF v_chave = ANY (v_chaves) THEN RAISE EXCEPTION 'Tarefa repetida: %.', v_chave USING ERRCODE = 'CT002'; END IF;
    v_chaves := v_chaves || v_chave;

    v_skill := NULL; v_skill_nome := NULL;
    IF nullif(t->>'perfil', '') IS NOT NULL THEN
      SELECT k.id, k.nome INTO v_skill, v_skill_nome FROM ops_skill k
      WHERE k.organization_id = p_org AND (k.chave = t->>'perfil' OR k.id::text = t->>'perfil') LIMIT 1;
    END IF;
    SELECT id INTO v_fase FROM ops_obra_fase WHERE obra_id = v_obra.id AND ordem = coalesce((t->>'fase')::smallint, 0);
    v_tarestado := coalesce(nullif(t->>'estado', ''), 'por_fazer');
    IF v_tarestado NOT IN ('por_fazer', 'em_curso', 'feita', 'validada', 'rejeitada') THEN v_tarestado := 'por_fazer'; END IF;
    v_pessoas := least(20, greatest(1, coalesce((t->>'pessoas')::int, 1)));

    v_tar := NULL;
    SELECT id INTO v_tar FROM ops_obra_tarefa WHERE obra_id = v_obra.id AND chave = v_chave;
    IF v_tar IS NULL THEN
      INSERT INTO ops_obra_tarefa (organization_id, obra_id, fase_id, ordem, nome, minutos_previstos, inicio_planeado, fim_planeado,
                                   estado, skill_id, chave, pessoas_previstas)
      VALUES (p_org, v_obra.id, v_fase, coalesce((t->>'ordem')::int, 0), v_nome, greatest(1, coalesce(round((t->>'minutos')::numeric), 60))::int,
              nullif(t->>'inicio', '')::date, nullif(t->>'fim', '')::date, v_tarestado, v_skill, v_chave, v_pessoas)
      RETURNING id INTO v_tar;
    ELSE
      UPDATE ops_obra_tarefa SET fase_id = v_fase, ordem = coalesce((t->>'ordem')::int, 0), nome = v_nome,
        minutos_previstos = greatest(1, coalesce(round((t->>'minutos')::numeric), 60))::int,
        inicio_planeado = nullif(t->>'inicio', '')::date, fim_planeado = nullif(t->>'fim', '')::date,
        estado = v_tarestado, skill_id = v_skill, pessoas_previstas = v_pessoas, atualizada_em = now()
      WHERE id = v_tar
        AND (fase_id, ordem, nome, minutos_previstos, inicio_planeado, fim_planeado, estado, skill_id, pessoas_previstas) IS DISTINCT FROM
            (v_fase, coalesce((t->>'ordem')::int, 0), v_nome, greatest(1, coalesce(round((t->>'minutos')::numeric), 60))::int,
             nullif(t->>'inicio', '')::date, nullif(t->>'fim', '')::date, v_tarestado, v_skill, v_pessoas);
    END IF;

    -- quem a faz: só uma pessoa do RH desta organização
    v_pessoa := NULL;
    IF coalesce(t->>'pessoa', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT p.id INTO v_pessoa FROM pessoas p WHERE p.id = (t->>'pessoa')::uuid AND p.organization_id = p_org AND p.deleted_at IS NULL;
      IF v_pessoa IS NULL THEN
        v_avisos := v_avisos || format('%s: o técnico não é uma pessoa do RH desta organização. Ficou por atribuir.', v_nome);
      ELSIF NOT public.fn_rh_pessoa_tecnica(p_org, v_pessoa) THEN
        v_avisos := v_avisos || format('%s: a pessoa atribuída não tem um cargo técnico de obra no RH.', v_nome);
      ELSIF v_skill IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.fn_rh_oficios_efetivos(p_org, v_pessoa) o WHERE o.skill_id = v_skill) THEN
        v_avisos := v_avisos || format('%s: a pessoa atribuída não tem o ofício %s no RH.', v_nome, v_skill_nome);
      END IF;
    END IF;
    DELETE FROM ops_obra_tarefa_rh WHERE tarefa_id = v_tar AND pessoa_id IS DISTINCT FROM v_pessoa;
    IF v_pessoa IS NOT NULL THEN
      INSERT INTO ops_obra_tarefa_rh (organization_id, obra_id, tarefa_id, pessoa_id, atribuida_por)
      VALUES (p_org, v_obra.id, v_tar, v_pessoa, v_user)
      ON CONFLICT (tarefa_id, pessoa_id) DO NOTHING;
    END IF;
  END LOOP;

  -- o que saiu do plano sai da projeção (as fases só se nenhuma tarefa as usar)
  DELETE FROM ops_obra_tarefa WHERE obra_id = v_obra.id AND (chave IS NULL OR NOT (chave = ANY (v_chaves)));
  DELETE FROM ops_obra_fase f WHERE f.obra_id = v_obra.id AND NOT EXISTS (SELECT 1 FROM ops_obra_tarefa x WHERE x.fase_id = f.id);

  RETURN jsonb_build_object('obra_id', v_obra.id, 'codigo', v_obra.codigo, 'avisos', to_jsonb(v_avisos));
END $function$;


-- ------------------------------------------------------------------ conferir
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'anew_hierarchy'
                 AND policyname = 'authenticated_update_anew_hierarchy' AND cmd = 'UPDATE' AND roles = '{authenticated}'
                 AND permissive = 'PERMISSIVE' AND with_check IS NULL
                 AND qual LIKE '%''organizations.edit''::text%' AND qual NOT LIKE '%organizations.manage%') THEN
    RAISE EXCEPTION 'CONFERIR: a policy de UPDATE de anew_hierarchy não ficou com organizations.edit';
  END IF;
  IF pg_get_functiondef('public.obra_guardar_negocio(uuid,uuid,jsonb)'::regprocedure) NOT LIKE '%20270105500000%'
     OR pg_get_functiondef('public.obra_guardar_negocio(uuid,uuid,jsonb)'::regprocedure) NOT LIKE '%(negocios.obra.executar): não pode marcar%' THEN
    RAISE EXCEPTION 'CONFERIR: obra_guardar_negocio sem a alteração';
  END IF;
  IF (SELECT count(*) FROM public.anew_permissions WHERE code IN ('hr.pessoas.retribuicao.view', 'hr.pessoas.laborais.edit', 'services.view')
        AND name IN ('Ver retribuição e custos', 'Editar dados laborais, ofícios e papéis', 'Ver Catálogo e custos')) <> 3 THEN
    RAISE EXCEPTION 'CONFERIR: rótulos não aplicados';
  END IF;
END $$;
