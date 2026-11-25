-- =============================================================================
-- Catálogo — separar «Cor» de «Acabamento» na MUDELAR (C2: ligar o aspeto e marcar os metais).
-- Base de RH (uetjghdkwbywbftedtth). DADOS: 3 atributos (has_aspect) e 23 opções (is_metal, superficie). Sem DDL, sem
-- funções novas (por isso sem REVOKE/GRANT), sem INSERT, sem DELETE, sem tocar em products nem em valores de produto.
--
-- !!! SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth). Os ids foram lidos só na RH a 25/11/2026. Na base principal (Mudelar
-- !!! de produção, clientes reais) os atributos novos da C1 não existem e a migration sai com RAISE NOTICE sem escrever
-- !!! nada. Antes do `db push`, confirmar o projeto ligado (supabase/.temp/project-ref).
--
-- NÃO DEPENDE DE CÓDIGO NOVO: o 3D (previaProduto3d.ts / zonasGlb.ts) e o ecrã de gestão dos atributos da migration A
-- (20270126400000) já leem 'tem_aspeto', 'metal' e 'superficie' pelas três leituras cat_ler_atributos*. Esta migration
-- só preenche os dados. Também se podiam pôr à mão no ecrã (cat_definir_aspeto_atributo / cat_aspeto_opcao), mas essas
-- RPCs exigem utilizador com products.edit e a migration corre sem sessão: escreve directamente nas tabelas, com ids fixos.
-- =============================================================================
--
-- Plano: vault/ficheiros/produtos-servicos/separar-cor-acabamento-plano.md (classe METAL) e a C1 (20270126430000).
--
-- O que faz (organização Mudelar 3242e925-…):
--   1. has_aspect = true nos 3 atributos criados pela C1: «Acabamento da cor» (acabamento_cor), «Acabamento do corpo»
--      (acabamento_corpo), «Acabamento da frente» (acabamento_frente). O atributo «Acabamento» original (acabamento,
--      d3a0a0e9-…) NÃO liga e tem de continuar false.
--   2. is_metal = true e superficie por omissão nas 23 opções METAL que a C1 moveu (17 no grupo de «Acabamento da cor»,
--      3 no de «Acabamento do corpo», 3 no de «Acabamento da frente»):
--        polida    — CROMO (1)
--        mate      — ROSA GOLD ESCOVADO, Gun Metal (2)
--        acetinada — os outros 20 (ACERO, ACERO RAYADO, Cobre ×3, Copper, Dourado, Gold, Inox, NIQUEL, ORO, Ouro ×3,
--                    Prata ×3, Rosa Gold, Silver, TITANIO)
--      Nenhuma outra opção é tocada (as 147 não metal dos 3 grupos ficam com is_metal false e superficie NULL).
--
-- Lido no remoto RH a 25/11/2026 (só SELECT): 6 organizações; os 4 atributos acima vivos, lista, não medida, com
-- has_aspect false; grupos em uso d5667f24 (144 opções) / 965103d5 (14) / a0dca4ad (12); as 23 opções nos grupos novos
-- com o value_text esperado, todas ativas, is_metal false e superficie NULL; 0 atributos com has_aspect e 0 opções
-- com is_metal ou superficie em toda a base.
--
-- Âmbito (inerte, RAISE NOTICE e sai): a organização Mudelar não existe nesta base, ou nenhum dos 3 atributos novos
-- existe nela (a C1 não correu). Falha (RAISE EXCEPTION, nada fica): só parte dos 3 atributos existe; um atributo não é
-- o lido (código, nome, medida, grupo em uso); alguma das 23 opções não está no grupo esperado com o texto esperado;
-- o «Acabamento» original tem has_aspect; estado a meio (parte ligada / parte marcada); uma opção não metal dos 3 grupos
-- já tem aspeto. Idempotente: com tudo já no estado final sai por NOTICE «já aplicada».
--
-- Efeitos laterais: triggers de auditoria (3 + 23 linhas, app.audit_source = 'migration:aspeto_metais_mudelar') e
-- updated_at nas linhas mexidas. trg_validate_attribute_measurement_color corre no UPDATE dos atributos e não recusa
-- (não são medida). O SKU não muda (a sigla não se toca; o aspeto não entra no SKU).
--
-- ORDEM: depois da A (20270126400000) e da C1 (20270126430000), ambas aplicadas na RH a 25/11. `supabase db push`
-- aplica TUDO o que estiver pendente (a 25/11 também 20270126330000 e 20270126420000 estavam por aplicar no remoto):
-- listar com `supabase migration list --linked` imediatamente antes.
-- =============================================================================

SET lock_timeout = '5s';
SET statement_timeout = '2min';

DO $mig$
DECLARE
  c_org        constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  c_fonte      constant text := 'migration:aspeto_metais_mudelar';
  -- atributos e grupos criados pela C1 (ids fixos)
  c_n_cor      constant uuid := 'c9e95561-0976-4b8b-9c3b-3c2dda8eafd0';
  c_n_corpo    constant uuid := 'bbe6e07c-3ec9-4d7c-8166-d225b0fcd2db';
  c_n_frente   constant uuid := 'e6b72f24-ad45-498a-838b-a2b004b90569';
  c_ng_cor     constant uuid := 'd5667f24-0b2b-420c-a37f-faea74dd6684';
  c_ng_corpo   constant uuid := '965103d5-f16d-4e0a-bddc-08f065b7fc13';
  c_ng_frente  constant uuid := 'a0dca4ad-ff59-4a9b-a03e-ceb28cd52fcb';
  -- o «Acabamento» original: não liga
  c_acabamento constant uuid := 'd3a0a0e9-53a2-406c-b2d9-6c8be05c2aa1';
  c_metais     constant integer := 23;
  v_n bigint; v_m bigint; v_k bigint; v_fora_atr bigint; v_fora_opc bigint; v_txt text;
BEGIN
  -- ─── 0. Âmbito (inerte) ───────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM anew_organizations o WHERE o.id = c_org AND o.name = 'Mudelar' AND o.deleted_at IS NULL) THEN
    RAISE NOTICE 'aspeto_metais_mudelar: a organização Mudelar (%) não existe nesta base — nada a fazer.', c_org;
    RETURN;
  END IF;
  SELECT count(*) INTO v_n FROM product_attributes a
  WHERE a.id IN (c_n_cor, c_n_corpo, c_n_frente) AND a.organization_id = c_org AND a.deleted_at IS NULL;
  IF v_n = 0 THEN
    RAISE NOTICE 'aspeto_metais_mudelar: os atributos de acabamento da C1 não existem aqui — nada a fazer.';
    RETURN;
  END IF;
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'aspeto_metais_mudelar: só % dos 3 atributos de acabamento da C1 existem. Rever antes de aplicar.', v_n;
  END IF;

  -- os mesmos atributos que cat_definir_aspeto_atributo e cat_aspeto_opcao prendem, por ordem fixa
  PERFORM 1 FROM product_attributes a
  WHERE a.id IN (c_n_cor, c_n_corpo, c_n_frente, c_acabamento) ORDER BY a.id FOR NO KEY UPDATE;

  -- ─── 1. O que se marca ────────────────────────────────────────────────────────────
  DROP TABLE IF EXISTS pg_temp._c2_atr, pg_temp._c2_metal, pg_temp._c2_antes;
  CREATE TEMP TABLE _c2_atr (id uuid PRIMARY KEY, code text NOT NULL, label text NOT NULL, grupo uuid NOT NULL) ON COMMIT DROP;
  INSERT INTO _c2_atr VALUES
    (c_n_cor,    'acabamento_cor',    'Acabamento da cor',    c_ng_cor),
    (c_n_corpo,  'acabamento_corpo',  'Acabamento do corpo',  c_ng_corpo),
    (c_n_frente, 'acabamento_frente', 'Acabamento da frente', c_ng_frente);

  -- as 23 opções METAL (id, grupo, value_text exacto, superfície por omissão), da tabela do plano
  CREATE TEMP TABLE _c2_metal (id uuid PRIMARY KEY, grupo uuid NOT NULL, value_text text NOT NULL, superficie text NOT NULL) ON COMMIT DROP;
  INSERT INTO _c2_metal (id, grupo, value_text, superficie) VALUES
    ('2daa0c7f-b115-42c3-996b-c0ec3df172af', c_ng_cor,    'ACERO',              'acetinada'),
    ('29e54cd9-b847-440b-a3c2-161f1f554a0c', c_ng_cor,    'ACERO RAYADO',       'acetinada'),
    ('9883ef45-572c-4667-88a5-41f0a677bc22', c_ng_cor,    'Cobre',              'acetinada'),
    ('5737c950-c2d5-40e0-aaac-22892877aee4', c_ng_cor,    'Copper',             'acetinada'),
    ('682a598c-8d24-4670-a153-672dbddf0563', c_ng_cor,    'CROMO',              'polida'),
    ('7557779a-d6c5-4ede-9be4-badaadef3c80', c_ng_cor,    'Dourado',            'acetinada'),
    ('c67bb86a-5190-45a2-9792-437b68abf60c', c_ng_cor,    'Gold',               'acetinada'),
    ('42303e1b-88c9-4058-91a2-6ed834b15487', c_ng_cor,    'Gun Metal',          'mate'),
    ('dab1fa15-4660-4ebd-b7ea-f00c702b6db6', c_ng_cor,    'Inox',               'acetinada'),
    ('07397ff8-7edd-4431-898d-fc28266bc027', c_ng_cor,    'NIQUEL',             'acetinada'),
    ('6d3b3bcc-c9dd-4c58-bcaa-89772537bb1a', c_ng_cor,    'ORO',                'acetinada'),
    ('cb297d5a-7a4e-4710-953c-d7984f3a51d8', c_ng_cor,    'Ouro',               'acetinada'),
    ('3d3561b6-dec8-4990-800c-73981b4e2cf3', c_ng_cor,    'Prata',              'acetinada'),
    ('755b76fa-ffde-43ab-8586-38561423ef48', c_ng_cor,    'Rosa Gold',          'acetinada'),
    ('7a2d4b61-14eb-4d66-be53-8b6ed6e17b98', c_ng_cor,    'ROSA GOLD ESCOVADO', 'mate'),
    ('d0668aa1-22fa-4516-b4b8-ce3b2521560e', c_ng_cor,    'Silver',             'acetinada'),
    ('740084cc-68f7-4d96-8774-de63dbaeffcb', c_ng_cor,    'TITANIO',            'acetinada'),
    ('65533ffb-de7e-46d1-8407-5e59f87c31c0', c_ng_corpo,  'Cobre',              'acetinada'),
    ('399b0d2c-0097-4e94-831e-3c35888e39da', c_ng_corpo,  'Ouro',               'acetinada'),
    ('b22520ff-6d94-40bc-8725-5ee0e3267ce5', c_ng_corpo,  'Prata',              'acetinada'),
    ('4113c84e-f784-43be-9b44-20e7dd3828f5', c_ng_frente, 'Cobre',              'acetinada'),
    ('3e13871d-a6a6-464b-a2df-49a31cf3c4c7', c_ng_frente, 'Ouro',               'acetinada'),
    ('310ed225-fa87-41bf-ba37-75ba2a967a20', c_ng_frente, 'Prata',              'acetinada');
  SELECT count(DISTINCT m.id), count(DISTINCT (m.grupo, m.value_text)),
         count(*) FILTER (WHERE m.superficie = 'polida') * 100 + count(*) FILTER (WHERE m.superficie = 'mate')
    INTO v_n, v_m, v_k FROM _c2_metal m;
  IF v_n <> c_metais OR v_m <> c_metais OR v_k <> 102 THEN
    RAISE EXCEPTION 'aspeto_metais_mudelar: a lista tem % ids distintos e % pares grupo/texto (esperados % e %) e o código de superfícies % (esperado 102 = 1 polida, 2 mate).',
      v_n, v_m, c_metais, c_metais, v_k;
  END IF;

  -- ─── 2. Guardas: o estado é o lido ────────────────────────────────────────────────
  -- G0: os 3 atributos novos são os da C1 (lista, não medida, código e nome, grupo em uso) e o original existe, sem aspeto
  SELECT count(*) INTO v_n FROM _c2_atr e JOIN product_attributes a ON a.id = e.id
  WHERE a.organization_id = c_org AND a.deleted_at IS NULL AND a.code = e.code AND a.label = e.label
    AND NOT a.is_measurement AND a.value_type = 'list'
    AND public.fn_cat_grupo_do_atributo(a.id, c_org) = e.grupo;
  IF v_n <> 3 THEN
    SELECT string_agg(e.code || ': ' || coalesce(a.code, '(sem linha)') || ' / ' || coalesce(a.label, '-') || ' / medida '
                      || coalesce(a.is_measurement::text, '-') || ' / grupo '
                      || coalesce(public.fn_cat_grupo_do_atributo(a.id, c_org)::text, '-'), '; ')
      INTO v_txt FROM _c2_atr e LEFT JOIN product_attributes a ON a.id = e.id;
    RAISE EXCEPTION 'G0: só % dos 3 atributos de acabamento são os da C1 (código, nome, lista, grupo em uso): %.', v_n, v_txt;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM product_attributes a WHERE a.id = c_acabamento AND a.organization_id = c_org
                 AND a.code = 'acabamento' AND a.deleted_at IS NULL AND NOT a.has_aspect) THEN
    RAISE EXCEPTION 'G0: o atributo «Acabamento» original (%) não existe na Mudelar ou já tem has_aspect (esperado false). Rever.', c_acabamento;
  END IF;

  -- G1: as 23 opções estão no grupo esperado, com o texto esperado
  SELECT count(*) INTO v_n FROM _c2_metal m
  JOIN attribute_option_group_values o ON o.id = m.id AND o.group_id = m.grupo AND o.value_text::text = m.value_text;
  IF v_n <> c_metais THEN
    SELECT string_agg(m.value_text || ' (' || m.id::text || ')', '; ') INTO v_txt FROM _c2_metal m
    WHERE NOT EXISTS (SELECT 1 FROM attribute_option_group_values o WHERE o.id = m.id AND o.group_id = m.grupo AND o.value_text::text = m.value_text);
    RAISE EXCEPTION 'G1: só % das % opções metal estão no grupo novo com o texto esperado. Em falta: %.', v_n, c_metais, v_txt;
  END IF;

  -- G2: nenhuma opção NÃO metal dos 3 grupos novos tem aspeto
  SELECT count(*) INTO v_n FROM attribute_option_group_values o
  WHERE o.group_id IN (c_ng_cor, c_ng_corpo, c_ng_frente)
    AND NOT EXISTS (SELECT 1 FROM _c2_metal m WHERE m.id = o.id)
    AND (o.is_metal OR o.superficie IS NOT NULL);
  IF v_n > 0 THEN
    RAISE EXCEPTION 'G2: % opções não metal dos grupos de acabamento já têm is_metal ou superficie (esperado 0). Rever.', v_n;
  END IF;

  -- G3: já aplicada? a meio?
  SELECT count(*) INTO v_n FROM product_attributes a WHERE a.id IN (c_n_cor, c_n_corpo, c_n_frente) AND a.has_aspect;
  SELECT count(*) INTO v_m FROM _c2_metal m JOIN attribute_option_group_values o ON o.id = m.id
  WHERE o.is_metal AND o.superficie IS NOT DISTINCT FROM m.superficie;
  SELECT count(*) INTO v_k FROM _c2_metal m JOIN attribute_option_group_values o ON o.id = m.id
  WHERE NOT o.is_metal AND o.superficie IS NULL;
  IF v_n = 3 AND v_m = c_metais THEN
    RAISE NOTICE 'aspeto_metais_mudelar: já aplicada (3 atributos com aspeto e % metais marcados) — nada a fazer.', c_metais;
    RETURN;
  END IF;
  IF v_n <> 0 OR v_k <> c_metais THEN
    RAISE EXCEPTION 'aspeto_metais_mudelar: estado a meio (% de 3 atributos com aspeto, % de % metais já no estado final, % de % por marcar). Não se completa às cegas: rever.',
      v_n, v_m, c_metais, v_k, c_metais;
  END IF;

  -- ─── 3. Fotografia antes ──────────────────────────────────────────────────────────
  -- o que está FORA do âmbito desta migration (toda a base): tem de ficar igual
  SELECT count(*) INTO v_fora_atr FROM product_attributes a
  WHERE a.has_aspect AND a.id NOT IN (c_n_cor, c_n_corpo, c_n_frente);
  SELECT count(*) INTO v_fora_opc FROM attribute_option_group_values o
  WHERE (o.is_metal OR o.superficie IS NOT NULL) AND NOT EXISTS (SELECT 1 FROM _c2_metal m WHERE m.id = o.id);
  CREATE TEMP TABLE _c2_antes ON COMMIT DROP AS
  SELECT o.id, to_jsonb(o) - 'is_metal' - 'superficie' - 'updated_at' AS j
  FROM attribute_option_group_values o WHERE o.id IN (SELECT m.id FROM _c2_metal m);

  PERFORM set_config('app.audit_source', c_fonte, true);

  -- ─── 4. Escrever ──────────────────────────────────────────────────────────────────
  UPDATE product_attributes a SET has_aspect = true
  WHERE a.id IN (c_n_cor, c_n_corpo, c_n_frente) AND a.organization_id = c_org AND NOT a.has_aspect AND NOT a.is_measurement;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 3 THEN RAISE EXCEPTION 'aspeto_metais_mudelar: % atributos ligados em vez de 3.', v_n; END IF;

  UPDATE attribute_option_group_values o SET is_metal = true, superficie = m.superficie
  FROM _c2_metal m
  WHERE o.id = m.id AND o.group_id = m.grupo AND o.value_text::text = m.value_text
    AND NOT o.is_metal AND o.superficie IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_metais THEN RAISE EXCEPTION 'aspeto_metais_mudelar: % opções marcadas em vez de %.', v_n, c_metais; END IF;

  -- ─── 5. Conferir ──────────────────────────────────────────────────────────────────
  -- C1: os 3 atributos com aspeto; o original não; na Mudelar, só estes 3 com aspeto
  SELECT count(*) INTO v_n FROM product_attributes a WHERE a.id IN (c_n_cor, c_n_corpo, c_n_frente) AND a.has_aspect;
  SELECT count(*) INTO v_m FROM product_attributes a WHERE a.id = c_acabamento AND a.has_aspect;
  SELECT count(*) INTO v_k FROM product_attributes a WHERE a.organization_id = c_org AND a.has_aspect;
  IF v_n <> 3 OR v_m <> 0 OR v_k <> 3 THEN
    RAISE EXCEPTION 'C1: % de 3 atributos de acabamento com aspeto; «Acabamento» original com aspeto: %; % atributos da Mudelar com aspeto (esperados 3, 0 e 3).', v_n, v_m, v_k;
  END IF;

  -- C2: as 23 marcadas com a superfície certa (20 acetinada, 1 polida, 2 mate), distintas
  SELECT count(DISTINCT o.id), count(DISTINCT o.id) FILTER (WHERE o.superficie = 'acetinada'),
         count(DISTINCT o.id) FILTER (WHERE o.superficie = 'polida') * 100 + count(DISTINCT o.id) FILTER (WHERE o.superficie = 'mate')
    INTO v_n, v_m, v_k
  FROM _c2_metal m JOIN attribute_option_group_values o ON o.id = m.id
  WHERE o.is_metal AND o.superficie = m.superficie AND o.group_id = m.grupo;
  IF v_n <> c_metais OR v_m <> 20 OR v_k <> 102 THEN
    RAISE EXCEPTION 'C2: % de % metais marcados; % acetinada (esperadas 20); código polida×100+mate % (esperado 102).', v_n, c_metais, v_m, v_k;
  END IF;

  -- C3: nos 3 grupos, só as 23 têm aspeto; o resto das 23 linhas ficou igual
  SELECT count(*) INTO v_n FROM attribute_option_group_values o
  WHERE o.group_id IN (c_ng_cor, c_ng_corpo, c_ng_frente) AND (o.is_metal OR o.superficie IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM _c2_metal m WHERE m.id = o.id);
  SELECT count(*) INTO v_m FROM _c2_antes b LEFT JOIN attribute_option_group_values o ON o.id = b.id
  WHERE o.id IS NULL OR (to_jsonb(o) - 'is_metal' - 'superficie' - 'updated_at') <> b.j;
  IF v_n > 0 OR v_m > 0 THEN
    RAISE EXCEPTION 'C3: % opções não metal com aspeto nos grupos de acabamento e % opções metal mudadas além do aspeto (esperados 0 e 0).', v_n, v_m;
  END IF;

  -- C4: fora do âmbito (toda a base), nada mudou
  SELECT count(*) INTO v_n FROM product_attributes a
  WHERE a.has_aspect AND a.id NOT IN (c_n_cor, c_n_corpo, c_n_frente);
  SELECT count(*) INTO v_m FROM attribute_option_group_values o
  WHERE (o.is_metal OR o.superficie IS NOT NULL) AND NOT EXISTS (SELECT 1 FROM _c2_metal m WHERE m.id = o.id);
  IF v_n <> v_fora_atr OR v_m <> v_fora_opc THEN
    RAISE EXCEPTION 'C4: fora do âmbito, % atributos com aspeto (antes %) e % opções com aspeto (antes %).', v_n, v_fora_atr, v_m, v_fora_opc;
  END IF;

  RAISE NOTICE 'aspeto_metais_mudelar: 3 atributos com aspeto; % metais marcados (20 acetinada, 1 polida, 2 mate). Conferido.', c_metais;
END $mig$;

RESET statement_timeout;
RESET lock_timeout;
