-- =============================================================================
-- Catálogo — COR: preenche o hex (#RRGGBB) de 74 opções de cor da MUDELAR que hoje não têm hex.
-- Base de RH (uetjghdkwbywbftedtth). SÓ DADOS: um UPDATE a attribute_option_group_values.hex_color.
-- NÃO precisa de código novo (o ecrã já mostra a amostra de cor quando a opção tem hex). Sem DDL, sem DROP, sem
-- tocar em product_attribute_values, produtos, preços, SKUs nem noutras colunas das opções.
-- =============================================================================
--
-- O que faz: as opções dos atributos Cor, Cor da frente e Cor do corpo da Mudelar que não têm hex (179 lidas no
-- remoto a 24/11, de 237 + 31 + 33 opções; as outras 122 já têm hex) aparecem sem amostra de cor. Esta migration
-- preenche 74 delas: as propostas de confiança ALTA (13) e MÉDIA (61) que o dono aprovou («sim»). As 105 restantes
-- (confiança BAIXA e as excluídas) NÃO se tocam e ficam por decidir.
--
-- Origem das propostas: vault/ficheiros/produtos-servicos/cores-sem-hex.md (propostas.json do mesmo trabalho:
-- opcao_id, grupo, atributo, nome, hex proposto e razão). O hex é #RRGGBB em maiúsculas, o mesmo formato das 122
-- opções que já tinham (lido no remoto a 24/11: 122 com hex, todas ^#[0-9A-F]{6}$; a coluna é varchar sem CHECK de
-- formato; o único CHECK da tabela é o da sigla).
--
-- O que NÃO muda: os 122 hex que já existem (a migration só escreve onde hex_color é NULL ou vazio, e confere no fim
-- que os 122 estão iguais); os nomes, siglas, ordem e estado das opções; as 105 sem proposta aprovada.
--
-- Só toca opções da Mudelar (organização 3242e925-…), ativas, no grupo de um dos três atributos de cor, com hex
-- vazio. O UPDATE leva esse filtro.
--
-- Efeitos laterais lidos no remoto (triggers de attribute_option_group_values):
--   * update_attribute_option_group_values_updated_at (BEFORE UPDATE): põe updated_at = now() nas 74 linhas.
--   * trg_audit_attribute_option_group_values (AFTER, fn_audit_attribute_option_group_values): uma linha por opção
--     mudada em entity_audit_log (campo hex_color, antes e depois), com app.audit_source = 'migration:cores_sem_hex_mudelar'.
--     Fica auditado linha a linha de propósito (são só 74 e dá para ver o que mudou em cada uma).
--   * trg_cat_sigla_opcao é BEFORE INSERT (não reage a UPDATE); os RI_ConstraintTrigger só validam o group_id (não muda).
--
-- GUARDA (inerte: RAISE NOTICE e sai sem escrever nada) se: a organização 3242e925-… não existir com o nome
-- 'Mudelar' nesta base; ou nenhuma das 74 opções estiver elegível (já aplicada, ou já preenchidas à mão: não se
-- sobrepõe nada).
-- Falha (RAISE EXCEPTION, nada fica) se: o estado lido não for o esperado (as opções com hex não forem as 122 lidas, só
-- algumas das 74 estiverem elegíveis, uma das 74 não existir, não for da Mudelar, não estiver ativa ou estiver
-- noutro atributo); o nº de linhas atualizadas não for 74; alguma das 122 mudar de valor; alguma das 74 não ficar
-- com o hex proposto; qualquer outra coluna das 74 mudar; ou a transação escrever noutras linhas da tabela.
--
-- Idempotente: a segunda execução não encontra nenhuma opção com hex vazio entre as 74 e sai por NOTICE.
--
-- ORDEM: independente de todas as outras migrations (não depende de nada novo).
-- ATENÇÃO antes do db push: `supabase db push` aplica TUDO o que estiver pendente; listar com
-- `supabase migration list --linked` imediatamente antes.
-- =============================================================================

SET lock_timeout = '5s';
SET statement_timeout = '2min';

DO $mig$
DECLARE
  c_org           constant uuid    := '3242e925-da26-459a-8258-be04d904e355';
  c_fonte         constant text    := 'migration:cores_sem_hex_mudelar';
  c_esperado      constant integer := 74;
  c_ja            constant integer := 122;
  c_ja_md5        constant text    := 'b7784a7940c1c66ab1069a99f3cc6ebe';
  v_n             bigint;
  v_m             bigint;
  v_txt           text;
  v_xid           text;
BEGIN
  -- ─── 0. Guarda (inerte) ───────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM anew_organizations o WHERE o.id = c_org AND o.name = 'Mudelar' AND o.deleted_at IS NULL) THEN
    RAISE NOTICE 'cores_sem_hex_mudelar: a organização Mudelar (%) não existe nesta base — nada a fazer.', c_org;
    RETURN;
  END IF;

  -- ─── 1. As 74 propostas aprovadas (opcao_id, hex #RRGGBB, nome só para as mensagens) ───────
  DROP TABLE IF EXISTS pg_temp._cores_hex, pg_temp._cores_ja, pg_temp._cores_antes;
  CREATE TEMP TABLE _cores_hex (id uuid PRIMARY KEY, hex text NOT NULL, nome text NOT NULL) ON COMMIT DROP;
  INSERT INTO _cores_hex (id, hex, nome) VALUES
    ('0234100d-b5b1-4203-a96d-378735427336', '#3F4245', 'Grafite'),
    ('061c3b44-129e-46d2-bc18-85e03401136c', '#DAD8D8', 'GRIS 7035'),
    ('071cad4c-0ab6-44d6-9be5-01cf8de27f6a', '#645E5E', 'ANTRACITA'),
    ('07397ff8-7edd-4431-898d-fc28266bc027', '#AEB2B5', 'NIQUEL'),
    ('07d24083-b70d-4ee0-84b2-8f74782dcee0', '#D8C3A0', 'ARENA'),
    ('090842d9-7534-47f2-b637-093c85bb919e', '#DEC9C9', 'TERRAZO BEIGE'),
    ('099bfabe-21fc-4290-9ab5-f80a8061bdc6', '#CDB4E3', 'Violeta Pastel'),
    ('0a7a7292-564b-4d33-8b61-1499e59f4bf4', '#8B7E74', 'Taupe'),
    ('0b3d0c1c-ed0a-4627-86fa-caa30600595b', '#1F4FB4', 'Cobalto'),
    ('0d0cfdab-d365-4af5-a64d-6058ae1583f7', '#151414', 'TERRAZO NEGRO'),
    ('0f2279b1-9c69-4953-812f-b1d089480ec8', '#FCFCFC', 'Todo Branco'),
    ('177f516f-3482-4e7a-8cc4-c23201b5e5ff', '#151414', 'NEGRO'),
    ('1e4d5321-1758-4d28-8dd5-46d990e476a6', '#EBE7E0', 'Perla'),
    ('25f3106e-fac3-48db-90f9-4681df874da4', '#FCFCFC', 'White'),
    ('293ef956-ae02-457f-afc3-96808d6b806e', '#D9BF9B', 'Roble'),
    ('29fa73f6-38ce-46cc-b9d8-903d01f2f00e', '#4B6D22', 'OLIVA'),
    ('2daa0c7f-b115-42c3-996b-c0ec3df172af', '#A9AEB3', 'ACERO'),
    ('2dbbcf10-8931-42b9-a6ec-8609f5930f44', '#A3A3A3', 'CUARZO GRIS'),
    ('35190541-180e-4dd7-8627-c73250a094ec', '#E3CB8C', 'Amarillo Arena'),
    ('36400a63-e9f5-4b38-93d0-aedc4e7c091b', '#6E6E6E', 'Cinza Escuro'),
    ('3b4a24f6-e047-4f47-901c-bfa98e1946dd', '#F7EED4', 'MÁRMOL CREMA'),
    ('3c755c20-41e3-420f-a537-929d175143a1', '#A3A3A3', 'JASPE GRIS'),
    ('3fb947ad-6515-438e-b7d7-801428878506', '#FCFCFC', 'MARMOLADO BLANCO'),
    ('42303e1b-88c9-4058-91a2-6ed834b15487', '#4A4F55', 'Gun Metal'),
    ('4775d61a-b2c3-4214-b2bc-ab4df553d102', '#A3A3A3', 'TERRAZO GRIS'),
    ('4edbbc5f-14a3-4797-9033-ce93798d4a8f', '#3563E9', 'Blue'),
    ('4fecdd4f-9c37-492b-ab05-2680613e586d', '#FCFCFC', 'Todo Branco'),
    ('511e3309-4989-45b6-9aec-123c9e14908e', '#F27C6B', 'CORAL'),
    ('528c2ba7-884b-4691-aa43-15b41c9fb65e', '#8FC7EA', 'Celeste'),
    ('5737c950-c2d5-40e0-aaac-22892877aee4', '#FFBA6B', 'Copper'),
    ('579ddfa7-f39d-4de2-94f9-051cf6210b4c', '#7A7F85', 'Plomo'),
    ('5cc96345-df07-43ae-b3f8-c3481d3e666b', '#FCFCFC', 'Todo Branco Lacado'),
    ('5d110e7a-0ab6-470a-bb87-2c77309ad611', '#A3A3A3', 'GRIS MEDIO'),
    ('682a598c-8d24-4670-a153-672dbddf0563', '#CFD3D6', 'CROMO'),
    ('6bfdc892-91c5-48f7-82a0-6ee2a2c036a1', '#B48DB5', 'Malva'),
    ('6d3b3bcc-c9dd-4c58-bcaa-89772537bb1a', '#EAE78A', 'ORO'),
    ('70633e51-ae6b-4163-a517-1715f1bc44bb', '#A7E3DD', 'Turquesa Pastel'),
    ('70f37d3a-6567-44fd-8a6a-1dfbc913eadb', '#7B4B2A', 'Castanho'),
    ('72fd17a3-094c-4441-afaf-7f5254d46205', '#3AA57F', 'Jade'),
    ('740084cc-68f7-4d96-8774-de63dbaeffcb', '#878B91', 'TITANIO'),
    ('7514b73c-8afc-42fe-8bb5-81022d199171', '#F7EED4', 'CREMA'),
    ('7557779a-d6c5-4ede-9be4-badaadef3c80', '#EAE78A', 'Dourado'),
    ('755b76fa-ffde-43ab-8586-38561423ef48', '#E0A898', 'Rosa Gold'),
    ('76d700ac-3c53-4675-85f0-dd6e4ed6e837', '#3B3C8F', 'Índigo'),
    ('7eb75e9b-0573-4aa4-b851-2ca20d98d330', '#C96B4B', 'TERRACOTA'),
    ('8b8a923e-2347-4904-932b-8ff93eeb2825', '#A8E0C5', 'Menta'),
    ('8f4a723d-7437-4826-b8f8-946ca1de7894', '#DEC9C9', 'BEIG'),
    ('9402d79a-afa8-420b-9e1b-e28f63b1fe8b', '#FCFCFC', 'Todo Branco Lacado'),
    ('9614c6a9-558e-4fbc-ba20-4ea7cd55049e', '#A3A3A3', 'Cinza'),
    ('985aa911-291f-43a6-ab5f-8b61182ced3b', '#9E9A94', 'Gris Guijarro'),
    ('9a382704-d8d6-47e4-b60d-180605c8ef4c', '#3E8E41', 'TRAVERTINO VERDE'),
    ('a3217521-bd1d-49e9-8d0e-3403f2ee9bfa', '#FCFCFC', 'BLANCO'),
    ('a4ad580f-568b-4e5d-8334-dace5c93c2e0', '#F5F0E1', 'Blanco Crema'),
    ('a92fb4b6-22e6-40bd-911c-4e046824f5d7', '#151414', 'Black'),
    ('b3cf96ac-e1d0-464f-93d5-cb9a27fc91bf', '#A3A3A3', 'MARMOLADO GRIS'),
    ('b8d5305b-ac26-4f3d-8f06-cf4df3fd3572', '#FCFCFC', 'MÁRMOL BLANCO'),
    ('bb8d3e7c-1015-4b68-b6e9-cd0d7512a7aa', '#8F6161', 'Elite Oscuro'),
    ('c0619f63-e191-4531-8246-86b7b57f1e56', '#8F6161', 'Elite Oscuro'),
    ('c12ddf4e-c620-4c81-a48b-37b7268bec3d', '#FCFCFC', 'GRANITO BLANCO'),
    ('c8df655b-b167-4abe-b656-3a4e4cc65e47', '#151414', 'MÁRMOL NEGRO'),
    ('d0668aa1-22fa-4516-b4b8-ce3b2521560e', '#C2C2C2', 'Silver'),
    ('d3cc04d3-3fc0-4d71-ac3f-c31d9ff1cbaa', '#7B4B2A', 'TRAVERTINO MARRÓN'),
    ('dab1fa15-4660-4ebd-b7ea-f00c702b6db6', '#BFC3C7', 'Inox'),
    ('dbfd0bfb-a575-42bc-a603-af8f839d3339', '#8B7E74', 'TOPO'),
    ('deeaa242-5cd0-44e2-8fb4-99f9323626f3', '#2B2523', 'ÉBANO'),
    ('e61ecd86-0050-41c5-aa73-d1433b71ecd7', '#8FA882', 'Verde Reseda'),
    ('e82b1d56-c7fa-43ef-a2e6-bea22d23b04e', '#FCFCFC', 'White'),
    ('eba7402a-e43f-463d-a859-1695544e12f9', '#A85F3B', 'Siena'),
    ('ef429d90-4f1d-4b40-9201-6058cf6c2dde', '#1B2A5E', 'Navy'),
    ('f3ec0edd-8c06-46d9-8d59-69ec046d59ee', '#A3A3A3', 'GRIS'),
    ('f7a9e8c0-ce24-4970-8a4a-e6b7dab6c942', '#30C5BF', 'TURQUESA'),
    ('f7b7fc5a-53c6-4112-ad7b-37c409320e0b', '#9CAF88', 'Sage'),
    ('fd4a9515-2e8c-44f9-9fa5-179ac0971c29', '#151414', 'Black'),
    ('fd8638b6-64a6-4b8f-870a-0766569b2d54', '#F5F0DC', 'Marfil');
  SELECT count(*) INTO v_n FROM _cores_hex;
  SELECT count(*) INTO v_m FROM _cores_hex h WHERE h.hex !~ '^#[0-9A-F]{6}$';
  IF v_n <> c_esperado OR v_m > 0 THEN
    RAISE EXCEPTION 'cores_sem_hex_mudelar: a lista tem % propostas (esperadas %) e % com hex fora do formato #RRGGBB.', v_n, c_esperado, v_m;
  END IF;

  -- ─── 2. O estado lido: as opções que já têm hex (todas as organizações) ──────────
  CREATE TEMP TABLE _cores_ja ON COMMIT DROP AS
  SELECT v.id, v.hex_color AS hex
  FROM attribute_option_group_values v
  WHERE v.hex_color IS NOT NULL AND v.hex_color <> '';
  SELECT count(*) INTO v_n FROM _cores_ja;

  -- as 74: existem, são da Mudelar, ativas, no grupo de um dos atributos de cor e com hex vazio?
  SELECT count(*) INTO v_m
  FROM _cores_hex h
  JOIN attribute_option_group_values v ON v.id = h.id
  JOIN attribute_option_groups g ON g.id = v.group_id AND g.organization_id = c_org
  JOIN product_attributes a ON a.id = g.attribute_id AND a.organization_id = c_org
  WHERE v.is_active AND (v.hex_color IS NULL OR v.hex_color = '')
    AND a.label IN ('Cor', 'Cor da frente', 'Cor do corpo') AND coalesce(a.has_hex_color, false);
  IF v_m = 0 THEN
    RAISE NOTICE 'cores_sem_hex_mudelar: nenhuma das % opções está elegível (hex já preenchido) — já aplicada, nada a fazer.', c_esperado;
    RETURN;
  END IF;
  IF v_m <> c_esperado THEN
    SELECT string_agg(h.nome || ' (' || h.id::text || ')', '; ') INTO v_txt
    FROM _cores_hex h
    WHERE NOT EXISTS (
      SELECT 1 FROM attribute_option_group_values v
      JOIN attribute_option_groups g ON g.id = v.group_id AND g.organization_id = c_org
      JOIN product_attributes a ON a.id = g.attribute_id AND a.organization_id = c_org
      WHERE v.id = h.id AND v.is_active AND (v.hex_color IS NULL OR v.hex_color = '')
        AND a.label IN ('Cor', 'Cor da frente', 'Cor do corpo') AND coalesce(a.has_hex_color, false));
    RAISE EXCEPTION 'cores_sem_hex_mudelar: só % das % opções estão elegíveis; as outras mudaram desde a leitura: %. Rever antes de aplicar.',
      v_m, c_esperado, left(v_txt, 1500);
  END IF;
  SELECT md5(string_agg(j.id::text || ':' || j.hex, ',' ORDER BY j.id)) INTO v_txt FROM _cores_ja j;
  IF v_n <> c_ja OR v_txt IS DISTINCT FROM c_ja_md5 THEN
    RAISE EXCEPTION 'cores_sem_hex_mudelar: % opções com hex (esperadas %, md5 %): o estado não é o lido. Rever antes de aplicar.',
      v_n, c_ja, v_txt;
  END IF;

  -- o estado das 74 antes (para conferir que só o hex_color mudou)
  CREATE TEMP TABLE _cores_antes ON COMMIT DROP AS
  SELECT v.id, v.group_id, v.value_text, v.display_name, v.sigla, v.sort_order, v.is_active
  FROM attribute_option_group_values v JOIN _cores_hex h ON h.id = v.id;

  v_xid := (txid_current() % 4294967296)::text;
  PERFORM set_config('app.audit_source', c_fonte, true);

  -- ─── 3. Gravar (só onde o hex está vazio, só na Mudelar) ─────────────────────────
  UPDATE attribute_option_group_values v
  SET hex_color = h.hex
  FROM _cores_hex h, attribute_option_groups g
  WHERE v.id = h.id
    AND g.id = v.group_id AND g.organization_id = c_org
    AND v.is_active
    AND (v.hex_color IS NULL OR v.hex_color = '');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_esperado THEN
    RAISE EXCEPTION 'cores_sem_hex_mudelar: % opções atualizadas em vez de %.', v_n, c_esperado;
  END IF;

  -- ─── 4. Conferir (cada contagem é do que está ERRADO; tem de dar 0) ───────────
  -- as 122 que já tinham hex ficam iguais
  SELECT count(*) INTO v_n
  FROM _cores_ja j LEFT JOIN attribute_option_group_values v ON v.id = j.id
  WHERE v.hex_color IS DISTINCT FROM j.hex;
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % das % opções que já tinham hex mudaram de valor.', v_n, c_ja; END IF;

  -- as 74 ficam com o hex proposto
  SELECT count(*) INTO v_n
  FROM _cores_hex h LEFT JOIN attribute_option_group_values v ON v.id = h.id
  WHERE v.hex_color IS DISTINCT FROM h.hex;
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % das % opções não ficaram com o hex proposto.', v_n, c_esperado; END IF;

  -- nada mais mudou nas 74 (grupo, valor, nome, sigla, ordem, estado)
  SELECT count(*) INTO v_n
  FROM _cores_antes a LEFT JOIN attribute_option_group_values v ON v.id = a.id
  WHERE v.id IS NULL OR v.group_id <> a.group_id OR v.value_text <> a.value_text
     OR v.display_name IS DISTINCT FROM a.display_name OR v.sigla IS DISTINCT FROM a.sigla
     OR v.sort_order IS DISTINCT FROM a.sort_order OR v.is_active <> a.is_active;
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % das % opções mudaram noutra coluna além do hex.', v_n, c_esperado; END IF;

  -- total de opções com hex: as 122 + as 74; e nenhuma outra linha da tabela escrita nesta transação
  SELECT count(*) INTO v_n FROM attribute_option_group_values v WHERE v.hex_color IS NOT NULL AND v.hex_color <> '';
  IF v_n <> c_ja + c_esperado THEN
    RAISE EXCEPTION 'Conferir: % opções com hex no fim (esperadas % + % = %).', v_n, c_ja, c_esperado, c_ja + c_esperado;
  END IF;
  SELECT count(*) INTO v_n FROM attribute_option_group_values v
  WHERE v.xmin::text = v_xid AND NOT EXISTS (SELECT 1 FROM _cores_hex h WHERE h.id = v.id);
  SELECT count(*) INTO v_m FROM attribute_option_group_values v
  JOIN attribute_option_groups g ON g.id = v.group_id
  WHERE v.xmin::text = v_xid AND g.organization_id IS DISTINCT FROM c_org;
  IF v_n > 0 OR v_m > 0 THEN
    RAISE EXCEPTION 'Conferir: % opções fora da lista e % de outra organização escritas nesta transação.', v_n, v_m;
  END IF;

  -- a auditoria linha a linha (o trigger engole os próprios erros: aqui só se avisa, não se falha)
  SELECT count(*) INTO v_n FROM entity_audit_log e
  WHERE e.organization_id = c_org AND e.source = c_fonte AND e.table_name = 'attribute_option_group_values' AND e.operation = 'UPDATE';
  IF v_n <> c_esperado THEN
    RAISE WARNING 'cores_sem_hex_mudelar: % linhas de auditoria em vez de % (o trigger engole o erro); os hex ficaram gravados.', v_n, c_esperado;
  END IF;

  RAISE NOTICE 'cores_sem_hex_mudelar: % opções de cor da Mudelar com hex preenchido; as % que já tinham ficaram iguais. Conferido.',
    c_esperado, c_ja;
END $mig$;

RESET statement_timeout;
RESET lock_timeout;
