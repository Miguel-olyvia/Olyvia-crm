-- =============================================================================
-- Catálogo — separar «Cor» de «Acabamento» nas cores da MUDELAR (C1: estrutura e movimentos).
-- Base de RH (uetjghdkwbywbftedtth). DADOS: 3 atributos novos, 3 grupos novos, 170 opções e 6 887 valores de produto
-- que mudam de atributo NA PRÓPRIA LINHA. Sem DDL, sem DROP, sem DELETE, sem escrever em products (o SKU não muda).
--
-- !!! SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth). Os ids das opções, dos atributos e dos grupos foram lidos só na RH a
-- !!! 25/11/2026. Na base principal (Mudelar de produção, clientes reais) estes ids não existem e a migration sai com
-- !!! RAISE NOTICE sem escrever nada. Antes do `db push`, confirmar o projeto ligado (supabase/.temp/project-ref).
--
-- !!! MIGRATION E CÓDIGO ENTRAM JUNTOS. O código do 3D lê os atributos de cor pelo NOME e tem de entrar no mesmo envio:
-- !!!   * src/emylia/planta3d/previaProduto3d.ts — fotoDosAtributos (foto da textura: hoje «Cor do corpo» > «Cor da
-- !!!     frente» > «Cor») tem de passar a ler também «Acabamento do corpo», «Acabamento da frente» e «Acabamento da cor»;
-- !!!     corDosAtributos (hex só do atributo de código `cor`) tem de ler o hex de «Acabamento da cor» quando não há «Cor».
-- !!!   * src/emylia/planta3d/zonasGlb.ts — papelDe / aparenciaDaZona: «Acabamento do corpo» → corpo, «Acabamento da
-- !!!     frente» → frente, «Acabamento da cor» → geral.
-- !!! Sem isto, depois desta migration a textura do Artisan, do Oak e do Denver (frente e corpo dos móveis) e o dourado /
-- !!! cobre / níquel das torneiras perdem-se no 3D: em 3 410 produtos deixa de haver qualquer atributo de cor.
--
-- !!! IMPORTAÇÕES: uma importação nova do Excel do catálogo volta a pôr a coluna «Cor» do fornecedor no atributo «Cor»
-- !!! (madeiras, decors e metais incluídos). Esta migration não muda a importação; o mapeamento tem de ser revisto à parte.
-- =============================================================================
--
-- Plano fechado: vault/ficheiros/produtos-servicos/separar-cor-acabamento-plano.md (caminho B, decisões do dono).
--
-- O que faz (organização Mudelar 3242e925-…, atributos e grupos com ids fixos):
--   1. Cria 3 atributos (lista, com hex e foto, entram no SKU) logo a seguir à cor que acompanham:
--        «Acabamento da cor»    acabamento_cor    sku_ordem 2  (sort_order 3)
--        «Acabamento do corpo»  acabamento_corpo  sku_ordem 4  (sort_order 12)
--        «Acabamento da frente» acabamento_frente sku_ordem 6  (sort_order 13)
--      e um grupo de opções para cada um. Os outros 17 atributos da Mudelar mudam só de sku_ordem: Cor fica 1, Cor do
--      corpo 2→3, Cor da frente 3→5, os restantes +3 (Tonalidade 7 … Acabamento 19, Aplicação 20). A ordem entre eles
--      não muda.
--   2. MOVE (UPDATE group_id; não copia) 170 opções: 144 da «Cor» (madeiras, pedras, padrões, decors, efeitos, estilos e
--      TODOS os 17 metais) → «Acabamento da cor»; 14 da «Cor do corpo» → «Acabamento do corpo»; 12 da «Cor da frente» →
--      «Acabamento da frente». Mantêm id, value_text, display_name, sigla, hex_color (as sem hex ficam sem hex: Artisan,
--      Oak, Denver…), foto_path, sort_order e is_active. O trigger da sigla é BEFORE INSERT: um UPDATE não a recalcula.
--   3. MOVE (UPDATE attribute_id, na própria linha) os 6 887 valores de produto dessas opções (Cor 1 234, Cor do corpo
--      2 175, Cor da frente 3 478) em 4 712 produtos. Nenhum valor fica vazio, nada se apaga; UNIQUE(product_id,
--      attribute_id) respeitado (os atributos de destino são novos). 3 410 produtos ficam só com o acabamento.
--   4. Confirma (não reescreve) que o SKU recalculado de TODOS os produtos com SKU gerado continua igual ao guardado.
--
-- NÃO mexe: «Todo Branco», «Todo Branco Lacado» (âmbito), cores de dois tons (DUAS_CORES), as 10 DUVIDA, as cores com
-- código no nome (ficam em «Cor» com o código), as cores puras, o atributo «Acabamento» existente (CROMO na Cor e
-- «Cromado» no Acabamento NÃO se juntam), products, preços, paletas, famílias.
--
-- Âmbito (inerte, RAISE NOTICE e sai): a organização Mudelar não existe nesta base, ou nenhum dos 3 atributos de cor
-- (ids fixos) existe nela. Falha (RAISE EXCEPTION, nada fica): só parte dos atributos de origem existe; estado a meio
-- (algum atributo, grupo ou opção já no destino sem estar tudo); um código acabamento_* ocupado por outro atributo; o
-- estado lido não é o do plano (contagens abaixo); colisão de valor ou de sigla no destino (nunca se inventa sigla).
-- Idempotente: com os 3 atributos, os 3 grupos e as 170 opções já no destino, sai por NOTICE «já aplicada».
--
-- Números lidos no remoto a 25/11/2026 (guardas): 30 010 produtos (0 apagados), 29 639 com SKU gerado, 30 010 SKUs
-- distintos, 95 711 valores de produto; opções 237 / 33 / 31; valores 16 958 / 10 980 / 10 981; 27 939 produtos com
-- algum atributo de cor; 0 valores órfãos; 0 linhas destes atributos em category_attributes,
-- category_attribute_palettes, product_attribute_value_prices, product_attribute_price_ranges, product_family_axes e
-- product_config_slots.
--
-- Ordem e outras migrations:
--   * As listas da Cozinha (vault/ficheiros/produtos-servicos/listas-cozinha-plano.md) copiam 22 valores do grupo «Cor»
--     e acrescentam Tea/Joplim à «Cor», 4 paletas e 696 preços de `cor`. Se correrem ANTES desta, esta FALHA nas guardas
--     (239 opções na «Cor» em vez de 237; preços e paletas de `cor` em vez de 0) — não estraga nada, recusa. Se
--     correrem DEPOIS (a ordem prevista), esta não as impede, mas 10 dos 22 valores da Cozinha (8 «Carvalho…/Branco…
--     - E0xx», Merino, GoldHudson) e Ouro / Cobre / Prata / Oak dos espelhos já não estão na «Cor»: a guarda 3 dessa
--     migration tem de ser revista antes de a escrever.
--   * C2 (marcar metais e ligar o aspeto) vem depois e cita os ids fixos desta.
--
-- Efeitos laterais: triggers de auditoria (uma linha por atributo, grupo, opção e valor mexidos, com
-- app.audit_source = 'migration:separar_cor_acabamento'); updated_at nas linhas mexidas. Duração medida da
-- verificação do SKU (uma passagem pelos 30 010 produtos, num SELECT só de leitura): ~46 s; statement_timeout 10 min.
-- ATENÇÃO antes do db push: `supabase db push` aplica TUDO o que estiver pendente; listar com
-- `supabase migration list --linked` imediatamente antes.
-- =============================================================================

SET lock_timeout = '5s';
SET statement_timeout = '10min';

DO $mig$
DECLARE
  c_org        constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  c_fonte      constant text := 'migration:separar_cor_acabamento';
  -- origem (lidos)
  c_a_cor      constant uuid := '98b65c86-5545-43cf-b8b1-e2d2f302ad91';
  c_a_corpo    constant uuid := 'cfc181eb-ec45-478b-a76d-c256e0000eb3';
  c_a_frente   constant uuid := 'f1e37039-87fc-44b6-b0d2-138beb38332e';
  c_g_cor      constant uuid := 'e3f956bb-e5b8-465b-8d8d-a54167e7a60d';
  c_g_corpo    constant uuid := 'e4cb2dec-31ec-4548-9abb-17d94b9011db';
  c_g_frente   constant uuid := '3140a383-4aa6-48f6-9d5e-d3381d30968b';
  -- destino (ids fixos desta migration; a C2 e o código citam-nos)
  c_n_cor      constant uuid := 'c9e95561-0976-4b8b-9c3b-3c2dda8eafd0';
  c_n_corpo    constant uuid := 'bbe6e07c-3ec9-4d7c-8166-d225b0fcd2db';
  c_n_frente   constant uuid := 'e6b72f24-ad45-498a-838b-a2b004b90569';
  c_ng_cor     constant uuid := 'd5667f24-0b2b-420c-a37f-faea74dd6684';
  c_ng_corpo   constant uuid := '965103d5-f16d-4e0a-bddc-08f065b7fc13';
  c_ng_frente  constant uuid := 'a0dca4ad-ff59-4a9b-a03e-ceb28cd52fcb';
  -- números lidos a 25/11/2026
  c_opcoes     constant integer := 170;
  c_valores    constant integer := 6887;
  c_produtos   constant integer := 30010;
  c_gerados    constant integer := 29639;
  c_pav_total  constant integer := 95711;
  c_prod_mex   constant integer := 4712;
  c_sem_cor    constant integer := 3410;
  c_com_cor    constant integer := 27939;
  v_n bigint; v_m bigint; v_k bigint; v_d bigint; v_txt text; v_criador uuid;
BEGIN
  -- ─── 0. Âmbito (inerte) ───────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM anew_organizations o WHERE o.id = c_org AND o.name = 'Mudelar' AND o.deleted_at IS NULL) THEN
    RAISE NOTICE 'separar_cor_acabamento: a organização Mudelar (%) não existe nesta base — nada a fazer.', c_org;
    RETURN;
  END IF;
  SELECT count(*) INTO v_n FROM product_attributes a
  JOIN (VALUES (c_a_cor, 'cor'), (c_a_corpo, 'cor_corpo'), (c_a_frente, 'cor_frente')) AS e(id, code) ON e.id = a.id
  WHERE a.organization_id = c_org AND a.deleted_at IS NULL AND a.code = e.code;
  IF v_n = 0 THEN
    RAISE NOTICE 'separar_cor_acabamento: os atributos Cor / Cor do corpo / Cor da frente lidos na base de RH não existem aqui — nada a fazer.';
    RETURN;
  END IF;
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'separar_cor_acabamento: só % dos 3 atributos de cor de origem existem (ids e códigos lidos na RH). Rever antes de aplicar.', v_n;
  END IF;

  -- os mesmos locks de quem cria atributos (cat_guardar_atributo, depois a ordem do SKU) e de quem cria opções
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_guardar_atributo:' || c_org::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_sku_config:' || c_org::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_sigla_opc:' || g.g::text, 0))
  FROM (SELECT x AS g FROM unnest(ARRAY[c_g_cor, c_g_corpo, c_g_frente, c_ng_cor, c_ng_corpo, c_ng_frente]) AS x ORDER BY x) g;

  -- ─── 1. O que se move ─────────────────────────────────────────────────────────────
  DROP TABLE IF EXISTS pg_temp._sep_par, pg_temp._sep_mov, pg_temp._sep_ordem, pg_temp._sep_opc_antes,
    pg_temp._sep_pav_antes, pg_temp._sep_attr_antes, pg_temp._sep_prod_antes, pg_temp._sep_sku;
  -- origem → destino
  CREATE TEMP TABLE _sep_par (origem text PRIMARY KEY, a_src uuid NOT NULL, g_src uuid NOT NULL, a_novo uuid NOT NULL,
    g_novo uuid NOT NULL, code_novo text NOT NULL, label_novo text NOT NULL, sku_ordem_novo integer NOT NULL,
    sort_novo integer NOT NULL, n_opc_src integer NOT NULL, n_mov integer NOT NULL, n_val_src integer NOT NULL,
    n_val_mov integer NOT NULL) ON COMMIT DROP;
  INSERT INTO _sep_par VALUES
    ('cor',        c_a_cor,    c_g_cor,    c_n_cor,    c_ng_cor,    'acabamento_cor',    'Acabamento da cor',    2,  3, 237, 144, 16958, 1234),
    ('cor_corpo',  c_a_corpo,  c_g_corpo,  c_n_corpo,  c_ng_corpo,  'acabamento_corpo',  'Acabamento do corpo',  4, 12,  33,  14, 10980, 2175),
    ('cor_frente', c_a_frente, c_g_frente, c_n_frente, c_ng_frente, 'acabamento_frente', 'Acabamento da frente', 6, 13,  31,  12, 10981, 3478);

  -- as 170 opções (id, atributo de origem, value_text exacto), da tabela do plano
  CREATE TEMP TABLE _sep_mov (id uuid PRIMARY KEY, origem text NOT NULL, value_text text NOT NULL) ON COMMIT DROP;
  INSERT INTO _sep_mov (id, origem, value_text) VALUES
    ('2a3311ab-dce1-4eae-8d3c-a00a900dbaee', 'cor', 'Abeto'),
    ('01412cf2-7331-4b45-962d-adb97d84c829', 'cor', 'Alerce'),
    ('72170970-38c7-4c0b-8bba-8e1c647a5a0f', 'cor', 'BAOBAB'),
    ('b56127c8-1ee5-4bca-b20a-7ac1143d3c9a', 'cor', 'Carvalho'),
    ('e8c68db9-6226-4059-b5cb-9d94dbad2dc8', 'cor', 'Carvalho Areia - E088'),
    ('1758fb01-eadb-4aac-a580-4a16fb8344c5', 'cor', 'Carvalho Cinza'),
    ('d77542f4-660a-4d86-9e12-af617afe3d58', 'cor', 'Carvalho Cinza - E065'),
    ('534d8758-ed84-4259-bc82-c6f99d243845', 'cor', 'Carvalho Escuro - E011'),
    ('36e79dbd-db6f-408c-a17d-2bae56824bfe', 'cor', 'carvalho Escuro veio forte - E035'),
    ('421d5f26-b199-493e-910d-046f46e72506', 'cor', 'Carvalho Mel - E017'),
    ('1d049bf9-51fe-4792-b740-2afc8323d0c8', 'cor', 'Carvalho Natural - E077'),
    ('e011b31f-43fe-4632-81a4-a0aae1cbfe63', 'cor', 'Cipres'),
    ('deeaa242-5cd0-44e2-8fb4-99f9323626f3', 'cor', 'ÉBANO'),
    ('0f7b79cb-a512-4cbc-a7d9-0e423864463f', 'cor', 'Fresno'),
    ('bd88ff93-f179-47ee-b61b-bcb89b2f78de', 'cor', 'Fresno Suécia'),
    ('6677b0e5-5aee-4355-a68d-9813c0e1c04c', 'cor', 'GoldHudson Oak K529'),
    ('3f14e281-e967-47f5-9c6c-ed6df914d1d3', 'cor', 'MADERA COLOR'),
    ('2fa4ae64-3ed5-4f29-b450-23e6fdc349a5', 'cor', 'MADERA RECICLADA'),
    ('6bee3928-1e09-4bac-99e4-46822290b80b', 'cor', 'Merino Laminates 10544 Canadian Walnut Suede'),
    ('9567545f-39a3-46a7-bc5e-6d15f6b7b48b', 'cor', 'Nogal'),
    ('06adc455-c5ef-4801-bad7-67963e6831d3', 'cor', 'Nogueira'),
    ('c13bdcaf-2c97-4aba-aa00-0ade119a7c17', 'cor', 'Oak'),
    ('6a6244f5-1f2c-4c1f-9cf5-0ebd6d5f4a47', 'cor', 'Olmo California'),
    ('71c4cbb7-4bdf-4973-981f-5a0158e5bb42', 'cor', 'Olmo Canada'),
    ('851ffbef-1382-4c09-8990-e9162a100f63', 'cor', 'PINO BLANCO'),
    ('324b9bef-90ec-4efd-909b-fc270f3808c9', 'cor', 'PINO FLANDES'),
    ('38cb62b7-e686-4af5-862f-7485a3b8f5ea', 'cor', 'PINO NATURAL'),
    ('293ef956-ae02-457f-afc3-96808d6b806e', 'cor', 'Roble'),
    ('ba2392cf-7d86-41fd-bee5-941f12c6e09a', 'cor', 'ROBLE AHUMADO'),
    ('ce4bc372-d13b-47d6-81b1-334b88317d5c', 'cor', 'Roble América'),
    ('2c879595-da89-438f-9b6b-c56ceffb7eb8', 'cor', 'ROBLE MOKA'),
    ('45bd4302-0a58-406e-837e-5164c1606569', 'cor', 'Roble Noruega'),
    ('faf93e12-a114-41b7-babc-3a9fc24979f2', 'cor', 'Roble Tibet'),
    ('3ebcf83a-f5c0-4799-a47b-59de6143bb86', 'cor', 'Wengue'),
    ('86e7c243-aae2-49bf-a3db-ced0c8fd519c', 'cor', 'ARENISCA'),
    ('41d3b850-573e-499b-9cc9-35f74c8ffb13', 'cor', 'AZURITA'),
    ('2dbbcf10-8931-42b9-a6ec-8609f5930f44', 'cor', 'CUARZO GRIS'),
    ('166eeb01-45cb-4682-a2d5-a9e7b63615fa', 'cor', 'EMPERADOR CLARO'),
    ('e3ee8a47-8fce-4d6c-88fe-91ad007e438c', 'cor', 'ESQUISTO'),
    ('c12ddf4e-c620-4c81-a48b-37b7268bec3d', 'cor', 'GRANITO BLANCO'),
    ('522b0216-a4d9-4f1b-84c1-af2bd253b6b8', 'cor', 'JASPE'),
    ('3c755c20-41e3-420f-a537-929d175143a1', 'cor', 'JASPE GRIS'),
    ('b8d5305b-ac26-4f3d-8f06-cf4df3fd3572', 'cor', 'MÁRMOL BLANCO'),
    ('646b9cda-9eb2-4563-bb3d-d3d51814eeb1', 'cor', 'MÁRMOL BLANCO ORO'),
    ('3b4a24f6-e047-4f47-901c-bfa98e1946dd', 'cor', 'MÁRMOL CREMA'),
    ('c8df655b-b167-4abe-b656-3a4e4cc65e47', 'cor', 'MÁRMOL NEGRO'),
    ('97730c3d-cd58-4eae-b1e8-05ac5e3bd867', 'cor', 'MÁRMOL ORO ROSA'),
    ('172a0fbc-db17-4032-88c5-152a3fe71390', 'cor', 'MÁRMOL ÓXIDO'),
    ('c781cb2f-8da0-43ab-b9a1-1c4b05964301', 'cor', 'MARMOL VETEADO'),
    ('5f23a6d5-26ee-4296-b8d7-19cf74ded928', 'cor', 'Marquina'),
    ('33029c8b-1b39-4436-a5c9-098454c94ae6', 'cor', 'MARRÓN EMPERADOR'),
    ('d2c29e6d-65e9-4f25-84bb-6355df528a00', 'cor', 'MOSCATO CREMA'),
    ('391375be-3712-47ad-9be9-53e782f9239e', 'cor', 'PATAGONIA'),
    ('daaffb3f-7846-4b77-b60f-47019025273a', 'cor', 'QUARZO'),
    ('acb4191e-aa55-4ed6-b055-dc8986dd990a', 'cor', 'RAIN FOREST BROWN'),
    ('c29a84ef-4318-48a1-b2c7-f8050993be3d', 'cor', 'SODALITA'),
    ('090842d9-7534-47f2-b637-093c85bb919e', 'cor', 'TERRAZO BEIGE'),
    ('4775d61a-b2c3-4214-b2bc-ab4df553d102', 'cor', 'TERRAZO GRIS'),
    ('0d0cfdab-d365-4af5-a64d-6058ae1583f7', 'cor', 'TERRAZO NEGRO'),
    ('d3cc04d3-3fc0-4d71-ac3f-c31d9ff1cbaa', 'cor', 'TRAVERTINO MARRÓN'),
    ('9a382704-d8d6-47e4-b60d-180605c8ef4c', 'cor', 'TRAVERTINO VERDE'),
    ('79654bfc-a7dd-46f2-93b5-f2a6e0fdcc4f', 'cor', 'Cairo'),
    ('4a50d031-5643-445e-8d45-dafad05d50b4', 'cor', 'Denver'),
    ('0402ba98-82d3-4e0d-8d38-5e7665144331', 'cor', 'Elite Claro'),
    ('936809d2-d087-4565-9593-da216b323728', 'cor', 'Elite Escuro'),
    ('c055d0d9-02ce-405e-9557-43f47be3746d', 'cor', 'Nairobi'),
    ('1917c171-aecb-4eca-9e50-aab094dbf591', 'cor', 'Nature'),
    ('fd03c233-7275-48b9-9325-8683f25e31e1', 'cor', 'Newman'),
    ('c5bc0570-0542-4a1c-aff0-c4e93ec2ea27', 'cor', 'NORDIC'),
    ('dc57b8cc-79ff-4e8b-b828-7235140c95f9', 'cor', 'OASIS MARRÓN CLARO'),
    ('0cc6df90-5c70-4e34-84ba-1e297deea5ca', 'cor', 'OASIS MARRÓN OSCURO'),
    ('14fdf406-1383-4b0f-b754-63c705d899dc', 'cor', 'Rustik'),
    ('e1cb8f52-78d8-4edb-850f-a26b99e07943', 'cor', 'Branco Creme Veio Suave - E061'),
    ('d9403f65-d574-4688-a20d-5b6f9b5430ac', 'cor', 'Branco Mate'),
    ('277b6f50-c145-4868-8bb1-df43d69aad3d', 'cor', 'Branco Textura Suave - E012'),
    ('3fb947ad-6515-438e-b7d7-801428878506', 'cor', 'MARMOLADO BLANCO'),
    ('b3cf96ac-e1d0-464f-93d5-cb9a27fc91bf', 'cor', 'MARMOLADO GRIS'),
    ('2feeecb1-c854-405d-961c-b71a1a93408d', 'cor', 'MARMOLADO PASTEL'),
    ('f53902b7-2411-4b8e-bfae-b0802dbd4911', 'cor', 'ÓXIDO'),
    ('b2989fd1-764e-4276-afc4-18f6b368d18b', 'cor', 'Decapé'),
    ('ffca7fce-6c6b-4c67-b273-704f45facfa7', 'cor', 'PATINA BLANCO'),
    ('4af199a4-9631-40fc-8bff-aa5b975913e8', 'cor', 'RÚSTICO'),
    ('c105dc31-75bc-4818-986e-be031289762c', 'cor', 'RÚSTICO AZUL'),
    ('fa533d88-7b0e-48f9-90fc-8cacda1ea57a', 'cor', 'RÚSTICO BLANCO'),
    ('cf82bb94-1949-47ab-b577-f6dcb88e90d2', 'cor', 'RÚSTICO NATURAL'),
    ('0812dcd2-7974-46c4-8b04-a776ee083a8d', 'cor', 'VINTAGE'),
    ('dd732d44-c82b-4871-a712-2be7eaf8aaf3', 'cor', 'VINTAGE BLANCO'),
    ('2daa0c7f-b115-42c3-996b-c0ec3df172af', 'cor', 'ACERO'),
    ('29e54cd9-b847-440b-a3c2-161f1f554a0c', 'cor', 'ACERO RAYADO'),
    ('9883ef45-572c-4667-88a5-41f0a677bc22', 'cor', 'Cobre'),
    ('5737c950-c2d5-40e0-aaac-22892877aee4', 'cor', 'Copper'),
    ('682a598c-8d24-4670-a153-672dbddf0563', 'cor', 'CROMO'),
    ('7557779a-d6c5-4ede-9be4-badaadef3c80', 'cor', 'Dourado'),
    ('c67bb86a-5190-45a2-9792-437b68abf60c', 'cor', 'Gold'),
    ('42303e1b-88c9-4058-91a2-6ed834b15487', 'cor', 'Gun Metal'),
    ('dab1fa15-4660-4ebd-b7ea-f00c702b6db6', 'cor', 'Inox'),
    ('07397ff8-7edd-4431-898d-fc28266bc027', 'cor', 'NIQUEL'),
    ('6d3b3bcc-c9dd-4c58-bcaa-89772537bb1a', 'cor', 'ORO'),
    ('cb297d5a-7a4e-4710-953c-d7984f3a51d8', 'cor', 'Ouro'),
    ('3d3561b6-dec8-4990-800c-73981b4e2cf3', 'cor', 'Prata'),
    ('755b76fa-ffde-43ab-8586-38561423ef48', 'cor', 'Rosa Gold'),
    ('7a2d4b61-14eb-4d66-be53-8b6ed6e17b98', 'cor', 'ROSA GOLD ESCOVADO'),
    ('d0668aa1-22fa-4516-b4b8-ce3b2521560e', 'cor', 'Silver'),
    ('740084cc-68f7-4d96-8774-de63dbaeffcb', 'cor', 'TITANIO'),
    ('621b0506-76d4-4970-aeb0-e9b81aec4c4a', 'cor', 'ACUARELA'),
    ('970bc71d-a3e3-4495-b4ae-520a6040deab', 'cor', 'ACUARELA 02'),
    ('f023d80d-7a4e-4ee8-b3d9-1eafcde63b34', 'cor', 'ACUARELA 03'),
    ('bfa92025-2ab2-4eb1-9e78-b1b108edb5e5', 'cor', 'ACUARELA 04'),
    ('43dd297b-47d6-48c9-8d9f-28b2ab9ca9ac', 'cor', 'Cemento'),
    ('11e32d75-0df9-4bca-bd0c-c1095dac5e25', 'cor', 'CEMENTO 01'),
    ('8e0cadfe-8dc2-4eb6-80e9-1bf2985d4953', 'cor', 'CEMENTO 02'),
    ('c86e983b-1cfc-460d-a91b-d45928bebc97', 'cor', 'CEMENTO 03'),
    ('6b748c0b-6729-4f3e-a331-42138e694e80', 'cor', 'CEMENTO 04'),
    ('a6126c25-35fb-4392-9423-a26b61ce9b2c', 'cor', 'CEMENTO 05'),
    ('6b63c62c-1318-4bcc-9078-14566cde4ad2', 'cor', 'CEMENTO 06'),
    ('02a1d9f2-60f3-44ac-8eeb-a7eccea5019a', 'cor', 'CEMENTO 07'),
    ('f083cd1d-448d-465a-bdd0-9384110c59d7', 'cor', 'CEMENTO 08'),
    ('6e1ef0df-0704-4923-8b9c-bc4644a1401a', 'cor', 'CÍRCULOS'),
    ('7e5f4f51-1985-4a18-9f3d-7ee08f42d7ec', 'cor', 'FLORES'),
    ('98a19127-fadf-4847-8576-59f795879981', 'cor', 'GEOMÉTRICO 02'),
    ('65599134-d993-4d03-99ea-e8bbe87df892', 'cor', 'GEOMÉTRICO 03'),
    ('ce5d894a-e677-42e3-8498-b363e01377a9', 'cor', 'GEOMÉTRICOS 01'),
    ('4a7c5ec5-a622-43c5-ba0f-1bf3d9adbfc1', 'cor', 'GOTAS'),
    ('b426b54b-d05c-4eae-b5c6-53dce168122f', 'cor', 'HIDRÁULICO BN'),
    ('858d3b5b-ddcb-443b-993b-c87a2a788eac', 'cor', 'HIDRÁULICO COLOR'),
    ('561cc166-2bb5-4bc7-9dba-0e8c610c1f4e', 'cor', 'HOJAS 01'),
    ('59217564-6f94-4213-bece-fe9a1e560614', 'cor', 'HOJAS 02'),
    ('b6ecc4e8-33c9-41b5-9147-c7d429d0196e', 'cor', 'HOJAS 03'),
    ('c8e8a87a-4adb-43e7-8e2d-74eb8a1e858e', 'cor', 'Icement'),
    ('7dc8ce5b-3d90-4ac5-885c-e359972c3630', 'cor', 'MICROCEMENTO'),
    ('b183a214-d9df-4483-b675-bc567fc1b311', 'cor', 'MOSAICO 01 BN'),
    ('f94eb19a-cf65-4397-ac09-09062c81ae5b', 'cor', 'MOSAICO 01 COLOR'),
    ('9f3137d2-b364-4890-9eff-9273c6c5fb05', 'cor', 'MOSAICO 02 BN'),
    ('475dfff1-cb3f-4659-8f4c-88144666a99c', 'cor', 'MOSAICO 02 COLOR'),
    ('c43e10bf-b732-44ae-b69b-c5e636dd7462', 'cor', 'OLIVO 01'),
    ('32f2c709-504e-4f2c-8fb6-c70046b5c32d', 'cor', 'OLIVO 02'),
    ('111fa9bd-c7ae-44fa-af3f-b0a8382e03e7', 'cor', 'PUNTOS'),
    ('2e6ccd2d-98a7-4db4-83a1-6f3c4bd8e0b0', 'cor', 'RIBONS'),
    ('dc77d1ee-faf7-41e2-9688-8dc29f4cc8d3', 'cor', 'TESEL BLANCO'),
    ('ba48e775-5f4a-4aaa-9a9a-2843b9d2afb0', 'cor', 'Tesel Blanco 72'),
    ('6ec2e324-8461-4c5d-a68d-07ef53eb856c', 'cor', 'ZEN 01'),
    ('2c4fb65a-0b86-4d1e-adeb-fb11fbf87664', 'cor', 'ZEN 02'),
    ('3e428afc-95d4-4caf-9e63-41e35594d2e7', 'cor', 'ZEN 03'),
    ('e12964b2-e428-49e5-88de-2a9d65931481', 'cor', 'ZEN 04'),
    ('8ff15d73-aeaf-4960-ad46-17200c1cc3fb', 'cor_corpo', 'Oak'),
    ('ef08cd5d-23e9-4f8e-b157-aa0fdc60392c', 'cor_corpo', 'Olmo California'),
    ('c46ca612-7690-47c0-88a7-2c13f864f146', 'cor_corpo', 'Roble Noruega'),
    ('9b3bb5d6-e0d4-45e0-85a3-656bb2679221', 'cor_corpo', 'Artisan'),
    ('e5174f11-90a1-4d7a-bc26-6d02fd6d3367', 'cor_corpo', 'Denver'),
    ('4d0e680a-ff10-4c69-9dff-ab6ba4f9f312', 'cor_corpo', 'Elite Claro'),
    ('bb8d3e7c-1015-4b68-b6e9-cd0d7512a7aa', 'cor_corpo', 'Elite Oscuro'),
    ('efb64b29-1d7f-42ce-a87f-d31dfebf2e5e', 'cor_corpo', 'Halifax'),
    ('42030041-cb4c-4385-87df-df4d4c5a74ff', 'cor_corpo', 'Joplim'),
    ('978650bb-7997-4346-a3a7-4aa1eff5dbd4', 'cor_corpo', 'Lincoln'),
    ('65ec298f-a6d6-4120-b90b-408f5dbfb5a6', 'cor_corpo', 'Tea'),
    ('65533ffb-de7e-46d1-8407-5e59f87c31c0', 'cor_corpo', 'Cobre'),
    ('399b0d2c-0097-4e94-831e-3c35888e39da', 'cor_corpo', 'Ouro'),
    ('b22520ff-6d94-40bc-8725-5ee0e3267ce5', 'cor_corpo', 'Prata'),
    ('f6fb206f-7e00-4873-b6ec-4f87619d86f2', 'cor_frente', 'Oak'),
    ('6c5f2c16-1420-4a62-9d8f-8199cc149364', 'cor_frente', 'Artisan'),
    ('526d7afb-cddc-421f-b2ce-2a889a876041', 'cor_frente', 'Denver'),
    ('b6dc495b-8cd8-43a0-a653-de2a1e9f2e13', 'cor_frente', 'Elite Claro'),
    ('c0619f63-e191-4531-8246-86b7b57f1e56', 'cor_frente', 'Elite Oscuro'),
    ('2e5946bf-788a-4a20-9881-fa790b9a5626', 'cor_frente', 'Halifax'),
    ('d780a3c6-785f-44f1-8a08-9184001497b3', 'cor_frente', 'Joplim'),
    ('7ebcbab0-3342-4288-b309-3e9b834eb8ca', 'cor_frente', 'Lincoln'),
    ('c9c13660-5836-45aa-bdb7-ffd543183c98', 'cor_frente', 'Tea'),
    ('4113c84e-f784-43be-9b44-20e7dd3828f5', 'cor_frente', 'Cobre'),
    ('3e13871d-a6a6-464b-a2df-49a31cf3c4c7', 'cor_frente', 'Ouro'),
    ('310ed225-fa87-41bf-ba37-75ba2a967a20', 'cor_frente', 'Prata');
  SELECT count(*), count(DISTINCT (m.origem, m.value_text)) INTO v_n, v_m FROM _sep_mov m;
  SELECT count(*) INTO v_k FROM _sep_par p
  WHERE p.n_mov <> (SELECT count(*) FROM _sep_mov m WHERE m.origem = p.origem);
  IF v_n <> c_opcoes OR v_m <> c_opcoes OR v_k > 0 THEN
    RAISE EXCEPTION 'separar_cor_acabamento: a lista tem % opções (% distintas por atributo; esperadas % = 144 + 14 + 12) e % atributos com contagem errada.', v_n, v_m, c_opcoes, v_k;
  END IF;

  -- sku_ordem: os 17 atributos que já existem (antes → depois) e os 3 novos
  CREATE TEMP TABLE _sep_ordem (id uuid PRIMARY KEY, code text NOT NULL, antes integer, depois integer NOT NULL) ON COMMIT DROP;
  INSERT INTO _sep_ordem (id, code, antes, depois) VALUES
    ('98b65c86-5545-43cf-b8b1-e2d2f302ad91', 'cor',               1,    1),
    (c_n_cor,                                'acabamento_cor',    NULL, 2),
    ('cfc181eb-ec45-478b-a76d-c256e0000eb3', 'cor_corpo',         2,    3),
    (c_n_corpo,                              'acabamento_corpo',  NULL, 4),
    ('f1e37039-87fc-44b6-b0d2-138beb38332e', 'cor_frente',        3,    5),
    (c_n_frente,                             'acabamento_frente', NULL, 6),
    ('af171aa4-98a6-41b8-804c-470570d8ce0e', 'tonalidade',        4,    7),
    ('02d4fda4-32f4-44a9-a20e-f432e488e1c0', 'textura',           5,    8),
    ('e4c4f069-107b-46c9-b030-2e4b91b87d75', 'veta',              6,    9),
    ('81e1a781-e3a3-4fec-aff3-940f3eb19e25', 'puxador',           7,   10),
    ('b69a89e3-655f-4b95-82e0-fb19b2ace19f', 'posicao_puxador',   8,   11),
    ('164541f4-21d7-4fc0-883d-056da7618167', 'lado',              9,   12),
    ('8c2361bb-146b-4643-8091-f212de868c6f', 'medida',           10,   13),
    ('f8caabe2-8622-4457-90a8-47f28c6bd9d8', 'brilho',           11,   14),
    ('e4367ab0-9817-4474-a8e8-81665fad8a2a', 'tipo_grelha',      12,   15),
    ('1e938087-56c8-44cb-b3d2-e33072ed2e17', 'largura',          13,   16),
    ('8b7069e7-c828-4f0c-be84-afc8159cbc25', 'capacidade',       14,   17),
    ('767c604b-934a-442a-8e6f-af0d3fc397a1', 'gas',              15,   18),
    ('d3a0a0e9-53a2-406c-b2d9-6c8be05c2aa1', 'acabamento',       16,   19),
    ('03441566-7ed7-4816-8a42-44a293a83259', 'aplicacao',        17,   20);

  -- ─── 2. Já aplicada? A meio? ──────────────────────────────────────────────────────
  SELECT count(*) INTO v_n FROM product_attributes a JOIN _sep_par p ON p.a_novo = a.id;
  SELECT count(*) INTO v_m FROM attribute_option_groups g JOIN _sep_par p ON p.g_novo = g.id;
  SELECT count(*) INTO v_k FROM attribute_option_group_values o JOIN _sep_mov m ON m.id = o.id
  JOIN _sep_par p ON p.origem = m.origem AND p.g_novo = o.group_id;
  IF v_n = 3 AND v_m = 3 AND v_k = c_opcoes THEN
    RAISE NOTICE 'separar_cor_acabamento: já aplicada (3 atributos, 3 grupos e % opções no destino) — nada a fazer.', c_opcoes;
    RETURN;
  END IF;
  IF v_n > 0 OR v_m > 0 OR v_k > 0 THEN
    RAISE EXCEPTION 'separar_cor_acabamento: estado a meio (% de 3 atributos novos, % de 3 grupos novos, % de % opções no destino). Não se completa às cegas: rever.', v_n, v_m, v_k, c_opcoes;
  END IF;
  SELECT string_agg(a.code || ' (' || a.id::text || ')', '; ') INTO v_txt FROM product_attributes a
  WHERE a.organization_id = c_org AND a.code IN ('acabamento_cor', 'acabamento_corpo', 'acabamento_frente');
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'separar_cor_acabamento: código já usado por outro atributo da Mudelar: %.', v_txt;
  END IF;

  -- ─── 3. Guardas ANTES (o estado tem de ser o lido) ────────────────────────────────
  -- G0: os 17 atributos da Mudelar, não apagados, com o código e o sku_ordem lidos, e nenhum outro
  SELECT count(*) INTO v_n FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL;
  SELECT count(*) INTO v_m FROM _sep_ordem o JOIN product_attributes a ON a.id = o.id
  WHERE o.antes IS NOT NULL AND a.organization_id = c_org AND a.deleted_at IS NULL AND a.code = o.code AND a.sku_ordem = o.antes;
  IF v_n <> 17 OR v_m <> 17 THEN
    RAISE EXCEPTION 'G0: % atributos na Mudelar (esperados 17) e % com o código e o sku_ordem lidos (esperados 17).', v_n, v_m;
  END IF;
  -- os atributos de origem: lista, com hex e foto, no SKU (os novos ficam iguais nisto)
  SELECT count(*) INTO v_n FROM _sep_par p JOIN product_attributes a ON a.id = p.a_src
  WHERE a.type::text = 'select' AND a.value_type = 'list' AND a.has_hex_color IS TRUE AND a.has_photo AND a.sku_entra
    AND NOT a.is_measurement AND a.created_by IS NOT NULL;
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'G0: % dos 3 atributos de origem são listas com hex, foto e SKU (esperados 3).', v_n;
  END IF;

  -- G1: os grupos de origem são os grupos em uso, ativos, da Mudelar, únicos do atributo, com 237 / 33 / 31 opções;
  -- as 170 estão lá com o texto esperado
  SELECT count(*) INTO v_n FROM _sep_par p JOIN attribute_option_groups g ON g.id = p.g_src
  WHERE g.attribute_id = p.a_src AND g.organization_id = c_org AND g.is_active
    AND public.fn_cat_grupo_do_atributo(p.a_src, c_org) = p.g_src
    AND (SELECT count(*) FROM attribute_option_groups g2 WHERE g2.attribute_id = p.a_src) = 1
    AND (SELECT count(*) FROM attribute_option_group_values o WHERE o.group_id = p.g_src) = p.n_opc_src;
  IF v_n <> 3 THEN
    SELECT string_agg(p.origem || ': ' || (SELECT count(*) FROM attribute_option_group_values o WHERE o.group_id = p.g_src)::text
                      || ' opções em ' || (SELECT count(*) FROM attribute_option_groups g2 WHERE g2.attribute_id = p.a_src)::text
                      || ' grupo(s)', '; ') INTO v_txt FROM _sep_par p;
    RAISE EXCEPTION 'G1: os grupos de origem não são os lidos (esperado um só grupo em uso com 237 / 33 / 31 opções): %.', v_txt;
  END IF;
  SELECT count(*) INTO v_n FROM _sep_mov m JOIN _sep_par p ON p.origem = m.origem
  JOIN attribute_option_group_values o ON o.id = m.id AND o.group_id = p.g_src AND o.value_text::text = m.value_text;
  IF v_n <> c_opcoes THEN
    SELECT string_agg(m.origem || ':' || m.value_text || ' (' || m.id::text || ')', '; ') INTO v_txt FROM _sep_mov m
    JOIN _sep_par p ON p.origem = m.origem
    WHERE NOT EXISTS (SELECT 1 FROM attribute_option_group_values o WHERE o.id = m.id AND o.group_id = p.g_src AND o.value_text::text = m.value_text);
    RAISE EXCEPTION 'G1: só % das % opções estão no grupo de origem com o texto esperado. Em falta: %.', v_n, c_opcoes, left(v_txt, 1500);
  END IF;

  -- G2: produtos e valores
  SELECT count(*), count(*) FILTER (WHERE p.sku_gerado), count(*) FILTER (WHERE p.is_deleted), count(DISTINCT p.sku)
    INTO v_n, v_m, v_k, v_d FROM products p WHERE p.organization_id = c_org;
  IF v_n <> c_produtos OR v_m <> c_gerados OR v_k <> 0 OR v_d <> c_produtos THEN
    RAISE EXCEPTION 'G2: % produtos na Mudelar (esperados %), % com SKU gerado (esperados %), % apagados (esperados 0), % SKUs distintos (esperados %).',
      v_n, c_produtos, v_m, c_gerados, v_k, v_d, c_produtos;
  END IF;
  SELECT count(*) INTO v_n FROM product_attribute_values v JOIN products p ON p.id = v.product_id AND p.organization_id = c_org;
  IF v_n <> c_pav_total THEN
    RAISE EXCEPTION 'G2: % valores de produto na Mudelar (esperados %).', v_n, c_pav_total;
  END IF;
  SELECT count(*) INTO v_n FROM _sep_par p
  WHERE p.n_val_src <> (SELECT count(*) FROM product_attribute_values v JOIN products pr ON pr.id = v.product_id AND pr.organization_id = c_org
                         WHERE v.attribute_id = p.a_src)
     OR p.n_val_mov <> (SELECT count(*) FROM product_attribute_values v JOIN products pr ON pr.id = v.product_id AND pr.organization_id = c_org
                         JOIN _sep_mov m ON m.origem = p.origem AND m.value_text = v.value_text
                         WHERE v.attribute_id = p.a_src);
  IF v_n > 0 THEN
    SELECT string_agg(p.origem || ': ' || (SELECT count(*) FROM product_attribute_values v JOIN products pr ON pr.id = v.product_id AND pr.organization_id = c_org
                                              WHERE v.attribute_id = p.a_src)::text || ' valores, '
                      || (SELECT count(*) FROM product_attribute_values v JOIN products pr ON pr.id = v.product_id AND pr.organization_id = c_org
                          JOIN _sep_mov m ON m.origem = p.origem AND m.value_text = v.value_text WHERE v.attribute_id = p.a_src)::text
                      || ' a mover', '; ') INTO v_txt FROM _sep_par p;
    RAISE EXCEPTION 'G2: valores por atributo diferentes dos lidos (esperados 16958/1234, 10980/2175, 10981/3478): %.', v_txt;
  END IF;
  SELECT count(DISTINCT v.product_id) INTO v_n FROM product_attribute_values v JOIN products pr ON pr.id = v.product_id AND pr.organization_id = c_org
  WHERE v.attribute_id IN (c_a_cor, c_a_corpo, c_a_frente);
  IF v_n <> c_com_cor THEN
    RAISE EXCEPTION 'G2: % produtos com algum atributo de cor (esperados %).', v_n, c_com_cor;
  END IF;
  -- 0 valores órfãos (valor de cor sem opção no grupo do seu atributo)
  SELECT count(*) INTO v_n FROM product_attribute_values v
  JOIN products pr ON pr.id = v.product_id AND pr.organization_id = c_org
  JOIN _sep_par p ON p.a_src = v.attribute_id
  WHERE NOT EXISTS (SELECT 1 FROM attribute_option_group_values o WHERE o.group_id = p.g_src AND o.value_text::text = v.value_text);
  IF v_n > 0 THEN RAISE EXCEPTION 'G2: % valores de cor sem opção no grupo do atributo (esperados 0).', v_n; END IF;
  -- nada mais aponta para os atributos de origem (preços, paletas, categorias, famílias, slots): o plano leu 0 em todas
  SELECT (SELECT count(*) FROM category_attributes x WHERE x.attribute_id IN (c_a_cor, c_a_corpo, c_a_frente))
       + (SELECT count(*) FROM category_attribute_palettes x WHERE x.attribute_id IN (c_a_cor, c_a_corpo, c_a_frente))
       + (SELECT count(*) FROM product_attribute_value_prices x WHERE x.attribute_id IN (c_a_cor, c_a_corpo, c_a_frente))
       + (SELECT count(*) FROM product_attribute_price_ranges x WHERE x.attribute_id IN (c_a_cor, c_a_corpo, c_a_frente))
       + (SELECT count(*) FROM product_family_axes x WHERE x.attribute_id IN (c_a_cor, c_a_corpo, c_a_frente))
       + (SELECT count(*) FROM product_config_slots x WHERE x.attribute_id IN (c_a_cor, c_a_corpo, c_a_frente))
    INTO v_n;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'G2: % linhas de preços, paletas, categorias, famílias ou slots apontam para Cor / Cor do corpo / Cor da frente (esperadas 0). Uma migration que as criou (por exemplo as listas da Cozinha) correu antes desta: rever a ordem.', v_n;
  END IF;

  -- G3: sem colisões de valor nem de sigla dentro de cada destino (nunca se inventa nem se funde sigla)
  SELECT count(*) INTO v_n FROM (
    SELECT p.g_novo, o.value_text FROM _sep_mov m JOIN _sep_par p ON p.origem = m.origem JOIN attribute_option_group_values o ON o.id = m.id
    GROUP BY 1, 2 HAVING count(*) > 1) z;
  SELECT count(*) INTO v_m FROM (
    SELECT p.g_novo, o.sigla FROM _sep_mov m JOIN _sep_par p ON p.origem = m.origem JOIN attribute_option_group_values o ON o.id = m.id
    WHERE o.sigla IS NOT NULL GROUP BY 1, 2 HAVING count(*) > 1) z;
  SELECT count(*) INTO v_k FROM attribute_option_group_values o JOIN _sep_par p ON p.g_novo = o.group_id;
  IF v_n > 0 OR v_m > 0 OR v_k > 0 THEN
    RAISE EXCEPTION 'G3: % valores e % siglas repetidos no destino, % opções já nos grupos novos (esperados 0). A migration não inventa siglas: rever.', v_n, v_m, v_k;
  END IF;

  -- ─── 4. Fotografia antes ──────────────────────────────────────────────────────────
  CREATE TEMP TABLE _sep_opc_antes ON COMMIT DROP AS
  SELECT o.id, o.group_id, o.value_text, o.display_name, o.hex_color, o.foto_path, o.sigla, o.sort_order, o.is_active
  FROM attribute_option_group_values o WHERE o.group_id IN (c_g_cor, c_g_corpo, c_g_frente);
  CREATE TEMP TABLE _sep_pav_antes ON COMMIT DROP AS
  SELECT v.id, v.product_id, v.attribute_id, v.value_text, p.a_novo AS a_destino   -- a_destino NULL = fica
  FROM product_attribute_values v
  JOIN products pr ON pr.id = v.product_id AND pr.organization_id = c_org
  JOIN _sep_par p0 ON p0.a_src = v.attribute_id
  LEFT JOIN _sep_mov m ON m.origem = p0.origem AND m.value_text = v.value_text
  LEFT JOIN _sep_par p ON p.origem = m.origem;
  CREATE TEMP TABLE _sep_attr_antes ON COMMIT DROP AS
  SELECT a.id, to_jsonb(a) - 'sku_ordem' - 'updated_at' AS j FROM product_attributes a WHERE a.organization_id = c_org;
  CREATE TEMP TABLE _sep_prod_antes ON COMMIT DROP AS
  SELECT p.id, p.sku, p.sku_gerado FROM products p WHERE p.organization_id = c_org;

  -- created_by é NOT NULL e a migration corre sem sessão: o mesmo criador da «Cor»
  SELECT a.created_by INTO v_criador FROM product_attributes a WHERE a.id = c_a_cor;

  PERFORM set_config('app.audit_source', c_fonte, true);

  -- ─── 5. Atributos e grupos novos; ordem do SKU ────────────────────────────────────
  INSERT INTO product_attributes (id, organization_id, code, label, type, value_type, sku_entra, sku_ordem, sort_order,
    has_hex_color, has_photo, is_measurement, is_filterable, is_required, is_variant_attribute, is_variant_option,
    pricing_type, valorization_type, created_by)
  SELECT p.a_novo, c_org, p.code_novo, p.label_novo, 'select'::attribute_type, 'list', true, p.sku_ordem_novo, p.sort_novo,
    true, true, false, false, false, false, false, 'none', 'none', v_criador
  FROM _sep_par p ORDER BY p.sku_ordem_novo;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 3 THEN RAISE EXCEPTION 'separar_cor_acabamento: % atributos criados em vez de 3.', v_n; END IF;

  INSERT INTO attribute_option_groups (id, attribute_id, organization_id, name, is_active, sort_order, created_by)
  SELECT p.g_novo, p.a_novo, c_org, p.label_novo, true, 0, g.created_by
  FROM _sep_par p JOIN attribute_option_groups g ON g.id = p.g_src;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 3 THEN RAISE EXCEPTION 'separar_cor_acabamento: % grupos criados em vez de 3.', v_n; END IF;

  UPDATE product_attributes a SET sku_ordem = o.depois
  FROM _sep_ordem o
  WHERE a.id = o.id AND o.antes IS NOT NULL AND a.organization_id = c_org AND a.sku_ordem = o.antes AND o.depois <> o.antes;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 16 THEN RAISE EXCEPTION 'separar_cor_acabamento: % atributos renumerados em vez de 16.', v_n; END IF;

  -- ─── 6. Mover as 170 opções (a mesma linha: id, sigla, hex e foto ficam) ──────────
  UPDATE attribute_option_group_values o SET group_id = p.g_novo
  FROM _sep_mov m JOIN _sep_par p ON p.origem = m.origem
  WHERE o.id = m.id AND o.group_id = p.g_src AND o.value_text::text = m.value_text;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_opcoes THEN RAISE EXCEPTION 'separar_cor_acabamento: % opções movidas em vez de %.', v_n, c_opcoes; END IF;

  -- ─── 7. Mover os 6 887 valores de produto (a mesma linha: só muda attribute_id) ───
  UPDATE product_attribute_values v SET attribute_id = b.a_destino
  FROM _sep_pav_antes b
  WHERE v.id = b.id AND b.a_destino IS NOT NULL AND v.attribute_id = b.attribute_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_valores THEN RAISE EXCEPTION 'separar_cor_acabamento: % valores movidos em vez de %.', v_n, c_valores; END IF;

  -- ─── 8. Conferir (cada contagem é do que está ERRADO; tem de dar 0) ───────────────
  -- G4: opções por grupo e as 301 iguais ao que eram (nas 170 só o grupo mudou; nas 131 nada)
  SELECT count(*) INTO v_n FROM (VALUES (c_g_cor, 93), (c_g_corpo, 19), (c_g_frente, 19), (c_ng_cor, 144), (c_ng_corpo, 14), (c_ng_frente, 12)) AS e(g, n)
  WHERE e.n <> (SELECT count(*) FROM attribute_option_group_values o WHERE o.group_id = e.g);
  IF v_n > 0 THEN RAISE EXCEPTION 'G4: % grupos sem o nº de opções esperado (93/19/19/144/14/12).', v_n; END IF;
  SELECT count(*) INTO v_n FROM _sep_opc_antes a
  LEFT JOIN _sep_mov m ON m.id = a.id
  LEFT JOIN _sep_par p ON p.origem = m.origem
  LEFT JOIN attribute_option_group_values o ON o.id = a.id
  WHERE o.id IS NULL OR o.group_id <> coalesce(p.g_novo, a.group_id) OR o.value_text <> a.value_text
     OR o.display_name IS DISTINCT FROM a.display_name OR o.hex_color IS DISTINCT FROM a.hex_color
     OR o.foto_path IS DISTINCT FROM a.foto_path OR o.sigla IS DISTINCT FROM a.sigla
     OR o.sort_order IS DISTINCT FROM a.sort_order OR o.is_active <> a.is_active;
  IF v_n > 0 THEN RAISE EXCEPTION 'G4: % das 301 opções de cor não ficaram como previsto.', v_n; END IF;

  -- G5: valores por atributo; cada linha igual (só attribute_id nas 6 887); totais; produtos mexidos e sem cor
  SELECT count(*) INTO v_n FROM (VALUES (c_a_cor, 15724), (c_a_corpo, 8805), (c_a_frente, 7503), (c_n_cor, 1234), (c_n_corpo, 2175), (c_n_frente, 3478)) AS e(a, n)
  WHERE e.n <> (SELECT count(*) FROM product_attribute_values v JOIN products pr ON pr.id = v.product_id AND pr.organization_id = c_org WHERE v.attribute_id = e.a);
  IF v_n > 0 THEN RAISE EXCEPTION 'G5: % atributos sem o nº de valores esperado (15724/8805/7503/1234/2175/3478).', v_n; END IF;
  SELECT count(*) INTO v_n FROM _sep_pav_antes b
  LEFT JOIN product_attribute_values v ON v.id = b.id
  WHERE v.id IS NULL OR v.product_id <> b.product_id OR v.value_text IS DISTINCT FROM b.value_text
     OR v.attribute_id <> coalesce(b.a_destino, b.attribute_id);
  IF v_n > 0 THEN RAISE EXCEPTION 'G5: % valores de cor não ficaram como previsto (linha, produto, texto ou atributo).', v_n; END IF;
  SELECT count(*) INTO v_n FROM product_attribute_values v JOIN products pr ON pr.id = v.product_id AND pr.organization_id = c_org;
  SELECT count(*) INTO v_m FROM products p WHERE p.organization_id = c_org;
  IF v_n <> c_pav_total OR v_m <> c_produtos THEN
    RAISE EXCEPTION 'G5: % valores (esperados %) e % produtos (esperados %) no fim.', v_n, c_pav_total, v_m, c_produtos;
  END IF;
  SELECT count(DISTINCT b.product_id) INTO v_n FROM _sep_pav_antes b WHERE b.a_destino IS NOT NULL;
  SELECT count(DISTINCT b.product_id) INTO v_m FROM _sep_pav_antes b
  WHERE b.a_destino IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = b.product_id AND v.attribute_id IN (c_a_cor, c_a_corpo, c_a_frente));
  IF v_n <> c_prod_mex OR v_m <> c_sem_cor THEN
    RAISE EXCEPTION 'G5: % produtos mexidos (esperados %) e % ficaram sem atributo de cor (esperados %).', v_n, c_prod_mex, v_m, c_sem_cor;
  END IF;

  -- G6: o grupo em uso de cada atributo é o esperado; 0 valores órfãos nos 6 atributos
  SELECT count(*) INTO v_n FROM _sep_par p
  WHERE public.fn_cat_grupo_do_atributo(p.a_novo, c_org) IS DISTINCT FROM p.g_novo
     OR public.fn_cat_grupo_do_atributo(p.a_src, c_org) IS DISTINCT FROM p.g_src;
  IF v_n > 0 THEN RAISE EXCEPTION 'G6: % atributos com outro grupo em uso.', v_n; END IF;
  SELECT count(*) INTO v_n FROM product_attribute_values v
  JOIN products pr ON pr.id = v.product_id AND pr.organization_id = c_org
  JOIN (SELECT a_src AS a, g_src AS g FROM _sep_par UNION ALL SELECT a_novo, g_novo FROM _sep_par) x ON x.a = v.attribute_id
  WHERE NOT EXISTS (SELECT 1 FROM attribute_option_group_values o WHERE o.group_id = x.g AND o.value_text::text = v.value_text);
  IF v_n > 0 THEN RAISE EXCEPTION 'G6: % valores sem opção no grupo do seu atributo.', v_n; END IF;

  -- G8: sku_ordem dos 20 atributos como no plano, ordem efetiva do SKU igual, nada mais mexido nos 17, os 3 novos certos
  SELECT count(*) INTO v_n FROM _sep_ordem o LEFT JOIN product_attributes a ON a.id = o.id AND a.organization_id = c_org AND a.deleted_at IS NULL
  WHERE a.id IS NULL OR a.sku_ordem IS DISTINCT FROM o.depois OR a.code <> o.code;
  SELECT count(*) INTO v_m FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL;
  IF v_n > 0 OR v_m <> 20 THEN RAISE EXCEPTION 'G8: % atributos fora da ordem do plano; % atributos na Mudelar (esperados 20).', v_n, v_m; END IF;
  SELECT string_agg(a.code, ',' ORDER BY a.sku_ordem NULLS LAST, coalesce(a.sort_order, 0), a.label, a.id) INTO v_txt
  FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL;
  IF v_txt IS DISTINCT FROM (SELECT string_agg(o.code, ',' ORDER BY o.depois) FROM _sep_ordem o) THEN
    RAISE EXCEPTION 'G8: a ordem efetiva do SKU não é a do plano: %.', v_txt;
  END IF;
  SELECT count(*) INTO v_n FROM _sep_attr_antes b LEFT JOIN product_attributes a ON a.id = b.id
  WHERE a.id IS NULL OR (to_jsonb(a) - 'sku_ordem' - 'updated_at') <> b.j;
  IF v_n > 0 THEN RAISE EXCEPTION 'G8: % atributos da Mudelar mudaram além do sku_ordem.', v_n; END IF;
  SELECT count(*) INTO v_n FROM product_attributes a JOIN _sep_par p ON p.a_novo = a.id
  WHERE a.organization_id = c_org AND a.code = p.code_novo AND a.label = p.label_novo AND a.type::text = 'select' AND a.value_type = 'list'
    AND a.sku_entra AND a.has_hex_color IS TRUE AND a.has_photo AND NOT a.is_measurement AND a.deleted_at IS NULL
    AND a.sku_ordem = p.sku_ordem_novo AND a.sort_order = p.sort_novo;
  IF v_n <> 3 THEN RAISE EXCEPTION 'G8: só % dos 3 atributos novos ficaram como previsto.', v_n; END IF;

  -- G7: o SKU recalculado (regra de cat_gerar_sku_produto, com a ordem e os atributos novos) de cada produto com SKU
  -- gerado é o SKU guardado; products não foi escrito; os SKUs continuam todos distintos
  CREATE TEMP TABLE _sep_sku ON COMMIT DROP AS
  WITH ga AS (
    SELECT a.id AS aid, a.is_measurement AS med, public.fn_cat_grupo_do_atributo(a.id, c_org) AS gid
    FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL
  ), pv AS (
    SELECT v.product_id, jsonb_agg(jsonb_build_object('atributo', v.attribute_id, 'sigla', o.sigla,
             'medida', (CASE WHEN ga.med THEN public.fn_cat_medida_ler(v.value_json, v.unit) END))) AS vals
    FROM product_attribute_values v
    JOIN products pr ON pr.id = v.product_id AND pr.organization_id = c_org
    JOIN ga ON ga.aid = v.attribute_id
    LEFT JOIN attribute_option_group_values o ON NOT ga.med AND o.group_id = ga.gid AND o.value_text = v.value_text
    GROUP BY v.product_id
  )
  SELECT p.id, p.sku, p.sku_gerado,
         (CASE WHEN (z.pt ->> 'prefixo') IS NULL OR z.n IS NULL THEN NULL
               ELSE concat_ws('-', z.pt ->> 'prefixo', lpad(z.n::text, 4, '0'), z.pt ->> 'resto') END) AS cand
  FROM products p
  LEFT JOIN pv ON pv.product_id = p.id
  CROSS JOIN LATERAL (SELECT public.fn_cat_sku_partes(c_org, p.category_id, p.subcategory_id, coalesce(pv.vals, '[]'::jsonb)) AS pt,
                             public.fn_cat_modelo_numero(c_org, p.subcategory_id, p.model_id) AS n) z
  WHERE p.organization_id = c_org AND p.sku_gerado;
  SELECT count(*), count(*) FILTER (WHERE s.cand IS DISTINCT FROM s.sku) INTO v_n, v_m FROM _sep_sku s;
  IF v_n <> c_gerados OR v_m > 0 THEN
    SELECT string_agg(s.sku || ' → ' || coalesce(s.cand, '(sem SKU)'), '; ') INTO v_txt
    FROM (SELECT x.sku, x.cand FROM _sep_sku x WHERE x.cand IS DISTINCT FROM x.sku ORDER BY x.sku LIMIT 10) s;
    RAISE EXCEPTION 'G7: % produtos com SKU gerado (esperados %); % mudariam de referência (esperados 0): %.', v_n, c_gerados, v_m, coalesce(v_txt, '-');
  END IF;
  SELECT count(*) INTO v_n FROM _sep_prod_antes b LEFT JOIN products p ON p.id = b.id
  WHERE p.id IS NULL OR p.sku <> b.sku OR p.sku_gerado <> b.sku_gerado;
  SELECT count(*) - count(DISTINCT p.sku) INTO v_m FROM products p WHERE p.organization_id = c_org;
  IF v_n > 0 OR v_m <> 0 THEN
    RAISE EXCEPTION 'G7: % produtos com SKU diferente do de antes e % SKUs repetidos na Mudelar (esperados 0 e 0).', v_n, v_m;
  END IF;

  RAISE NOTICE 'separar_cor_acabamento: 3 atributos e 3 grupos criados; % opções e % valores (em % produtos) movidos; % produtos ficam só com o acabamento; 0 referências mudam. Conferido.',
    c_opcoes, c_valores, c_prod_mex, c_sem_cor;
END $mig$;

RESET statement_timeout;
RESET lock_timeout;
