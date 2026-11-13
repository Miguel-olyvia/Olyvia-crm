-- =============================================================================
-- Atributos globais e opções da MUDELAR — PRIMEIRA migration da conversão de
-- atributos (passos 1 e 2 do plano). SÓ SERVE NA BASE DE RH (uetjghdkwbywbftedtth),
-- enquanto a Mudelar lá não tiver nenhum atributo.
-- =============================================================================
--
-- Organização: Mudelar, id fixo 3242e925-da26-459a-8258-be04d904e355, com o nome
-- confirmado ('Mudelar') pela própria migration. Se o id não existir com esse
-- nome, não faz nada.
--
-- Origem das opções: a CONFIGURAÇÃO de atributos da Mudelar na base principal
-- (grupos e opções lidos antes, só leitura; aqui vão escritos à mão numa tabela
-- VALUES). Nenhum produto fica ligado a estes atributos por esta migration: os
-- produtos que os vão usar são da Mudelar, e hoje a RH só tem produtos na nike
-- (a Mudelar tem 0), por isso nenhum produto tem estes atributos ainda.
--
-- O que faz (só INSERT; não apaga, não actualiza linhas existentes, não toca
-- em products nem em product_attribute_values):
--   * 6 atributos GLOBAIS da Mudelar em product_attributes
--     (chave única real: organization_id + code):
--       medida       Medida          value_type json, is_measurement, measurement_type 'dimensoes', unit 'cm'
--       cor          Cor             value_type list, has_hex_color
--       tonalidade   Tonalidade      value_type list (sem opções por agora)
--       tipo_grelha  Tipo de grelha  value_type list
--       textura      Textura         value_type list
--       brilho       Brilho          value_type list
--     pricing_type e valorization_type 'none'; type (enum) 'select' nas listas, 'text' na Medida.
--   * Um grupo de opções por atributo de lista em attribute_option_groups
--     (organization_id = Mudelar; liga-se ao atributo por attribute_id; nome do
--     grupo = nome do atributo; a Tonalidade fica com o grupo vazio; a Medida
--     não tem grupo).
--   * As opções em attribute_option_group_values (chave única: group_id + value_text),
--     com value_text = display_name = nome da opção:
--       Cor            192 (114 sem hex): todas as cores de todos os grupos de cor da
--                      principal, sem repetir o mesmo nome (minúsculas, sem acentos, espaços
--                      colapsados). Precedência: Cor Móveis, Cozinha, Cor Móveis Frentes
--                      (cópia), atributo «Cor» (base de duche e grupos de teste). Nomes tal
--                      como vêm (só trim e espaços colapsados). Hex em #RRGGBB maiúsculas
--                      ou NULL; hex repetido entre opções diferentes é aceite.
--       Brilho         Natural, Polido, Brilhante, Mate
--       Tipo de grelha Inox, À cor
--       Textura        Ardósia, Liso, Pedra
--
-- GUARDA (risco R1): quando o ramo for juntado ao main, esta migration corre
-- também na base principal, onde a Mudelar (o mesmo id) já tem atributos, grupos
-- e opções, tem produtos reais, e product_attribute_values tem linhas. Só
-- actua se, cumulativamente:
--   a organização 3242e925-… existir com o nome 'Mudelar' (e não apagada);
--   a Mudelar não tiver NENHUM produto (contando os apagados);
--   a Mudelar não tiver NENHUM atributo, NENHUM grupo e NENHUMA opção — basta
--   um só, mesmo que fosse só parte dos atributos, para não actuar;
--   product_attribute_values estiver vazia na base INTEIRA.
-- Na principal falham três destas condições, cada uma por si (produtos,
-- atributos, product_attribute_values), por isso fica inerte. Na RH, hoje, a
-- Mudelar tem 0 produtos e 0 atributos.
-- Todas as funções auxiliares são plpgsql: as tabelas e colunas só se resolvem
-- ao executar, por isso o CREATE não rebenta numa base onde falte uma coluna,
-- e a guarda pára antes das leituras que dependem dela.
-- Se a guarda não passar: RAISE NOTICE com o motivo e termina SEM alterar
-- nada (não falha, para não bloquear o push noutras bases).
--
-- created_by: product_attributes.created_by é NOT NULL (chave para anew_users).
-- Usa-se o membro activo mais antigo da Mudelar (anew_memberships, status
-- 'active', sem end_date, não cliente, utilizador não apagado). Lido na RH: há
-- 22 membros assim.
-- Auditoria: os gatilhos de auditoria engolem os próprios erros; marca-se
-- app.audit_source = 'migration:atributos_globais_e_opcoes' (local à transacção).
--
-- Idempotente: ON CONFLICT DO NOTHING nas chaves únicas reais e NOT EXISTS no
-- grupo; e uma segunda execução nem passa a guarda.
-- Verificação no fim: se, depois de actuar, os números não baterem, RAISE
-- EXCEPTION «FALHOU: …» e a migration é desfeita.
--
-- Teste: supabase/tests/atributos_globais_e_opcoes.test.sql (BEGIN … ROLLBACK).
-- ATENÇÃO antes do db push: `supabase db push` aplica TUDO o que estiver pendente;
-- listar com `supabase migration list --linked` imediatamente antes.
-- =============================================================================

SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Funções auxiliares TEMPORÁRIAS (pg_temp): desaparecem no fim da sessão e não
-- ficam no esquema. O teste supabase/tests/atributos_globais_e_opcoes.test.sql
-- leva uma cópia exacta deste bloco (gerada da mesma fonte).
-- ---------------------------------------------------------------------------

-- Todas as funções são plpgsql de propósito: o plpgsql só confere a sintaxe
-- ao criar, e as tabelas e colunas só são resolvidas ao executar. Assim, numa
-- base onde falte alguma coluna (a principal), o CREATE não rebenta e a guarda
-- pára antes de chegar às leituras que precisam dela.

-- Utilizador que fica em created_by (product_attributes.created_by é NOT NULL
-- com chave para anew_users): o membro mais antigo da organização com a
-- relação activa (status 'active', sem end_date), que não é cliente e cujo
-- utilizador existe e não está apagado.
CREATE OR REPLACE FUNCTION pg_temp.atrib_criador(p_org uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $fn$
BEGIN
  RETURN (
    SELECT m.user_id
      FROM public.anew_memberships m
      JOIN public.anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL
     WHERE m.organization_id = p_org
       AND m.status = 'active'
       AND m.end_date IS NULL
       AND COALESCE(m.role_is_client, false) = false
     ORDER BY m.created_at, m.user_id
     LIMIT 1
  );
END;
$fn$;

-- Guarda dos dados (risco R1). Devolve NULL se pode actuar; senão, o motivo.
-- A organização não pode ter NENHUM produto (contando os apagados), NENHUM
-- atributo, grupo nem opção (basta um para não actuar); e
-- product_attribute_values tem de estar vazia em TODA a base.
CREATE OR REPLACE FUNCTION pg_temp.atrib_guarda_dados(p_org uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $fn$
DECLARE
  v_n bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM public.products p WHERE p.organization_id = p_org) THEN
    RETURN 'a organização já tem produtos';
  END IF;

  SELECT count(*) INTO v_n FROM public.product_attributes a WHERE a.organization_id = p_org;
  IF v_n > 0 THEN
    RETURN format('a organização já tem %s atributos', v_n);
  END IF;

  SELECT count(*) INTO v_n FROM public.attribute_option_groups g WHERE g.organization_id = p_org;
  IF v_n > 0 THEN
    RETURN format('a organização já tem %s grupos de opções', v_n);
  END IF;

  SELECT count(*) INTO v_n
    FROM public.attribute_option_group_values v
    JOIN public.attribute_option_groups g ON g.id = v.group_id
   WHERE g.organization_id = p_org;
  IF v_n > 0 THEN
    RETURN format('a organização já tem %s opções', v_n);
  END IF;

  IF EXISTS (SELECT 1 FROM public.product_attribute_values) THEN
    RETURN 'product_attribute_values não está vazia (não é a base de RH no estado esperado)';
  END IF;

  RETURN NULL;
END;
$fn$;

-- Guarda completa. Só actua na Mudelar (id fixo E nome 'Mudelar', os dois
-- passados e conferidos contra as constantes e contra a tabela), não apagada,
-- e com a guarda dos dados a passar. A leitura de deleted_at e a escolha do
-- created_by vêm depois da guarda dos dados.
CREATE OR REPLACE FUNCTION pg_temp.atrib_guarda(p_org uuid, p_nome text)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $fn$
DECLARE
  c_mudelar      constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  c_mudelar_nome constant text := 'Mudelar';
  v_motivo text;
BEGIN
  IF p_org IS DISTINCT FROM c_mudelar OR p_nome IS DISTINCT FROM c_mudelar_nome THEN
    RETURN format('só actua na Mudelar (%s, «%s»); pedido: %s, «%s»', c_mudelar, c_mudelar_nome, p_org, p_nome);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.id = p_org AND o.name = p_nome) THEN
    RETURN format('a organização %s com o nome «%s» não existe nesta base', p_org, p_nome);
  END IF;

  v_motivo := pg_temp.atrib_guarda_dados(p_org);
  IF v_motivo IS NOT NULL THEN
    RETURN v_motivo;
  END IF;

  IF EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.id = p_org AND o.deleted_at IS NOT NULL) THEN
    RETURN 'a organização está apagada';
  END IF;

  IF pg_temp.atrib_criador(p_org) IS NULL THEN
    RETURN 'nenhum membro activo da organização para created_by';
  END IF;

  RETURN NULL;
END;
$fn$;

-- Corpo: idempotente por si (ON CONFLICT pelas chaves únicas reais e NOT
-- EXISTS no grupo). Devolve o número de linhas inseridas. Só insere: não
-- altera linhas existentes e não toca em products.
CREATE OR REPLACE FUNCTION pg_temp.atrib_corpo(p_org uuid, p_user uuid)
RETURNS integer
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_total integer := 0;
  v_n     integer;
BEGIN
  IF p_user IS NULL THEN
    RAISE EXCEPTION 'atrib_corpo: created_by em falta';
  END IF;

  -- 1. Os 6 atributos globais. Chave única real: (organization_id, code).
  INSERT INTO public.product_attributes
         (organization_id, code, label, type, value_type, has_hex_color,
          is_measurement, measurement_type, unit, pricing_type, valorization_type,
          is_variant_option, is_variant_attribute, sort_order, created_by)
  SELECT p_org, a.code, a.label, a.tipo::public.attribute_type, a.value_type, a.tem_hex,
         a.e_medida, a.measurement_type, a.unit, 'none', 'none',
         false, false, a.ordem, p_user
    FROM (VALUES
      ('medida',      'Medida',         'text',   'json', false, true,  'dimensoes'::text, 'cm'::text, 1),
      ('cor',         'Cor',            'select', 'list', true,  false, NULL,              NULL,       2),
      ('tonalidade',  'Tonalidade',     'select', 'list', false, false, NULL,              NULL,       3),
      ('tipo_grelha', 'Tipo de grelha', 'select', 'list', false, false, NULL,              NULL,       4),
      ('textura',     'Textura',        'select', 'list', false, false, NULL,              NULL,       5),
      ('brilho',      'Brilho',         'select', 'list', false, false, NULL,              NULL,       6)
    ) AS a(code, label, tipo, value_type, tem_hex, e_medida, measurement_type, unit, ordem)
  ON CONFLICT (organization_id, code) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  -- 2. Um grupo por atributo de lista (nome = nome do atributo). A Medida não
  --    tem grupo. A Tonalidade fica com o grupo vazio. Não há chave única no
  --    grupo: a idempotência é por NOT EXISTS (um grupo por atributo).
  INSERT INTO public.attribute_option_groups
         (attribute_id, organization_id, name, sort_order, is_active, created_by)
  SELECT pa.id, p_org, pa.label, pa.sort_order, true, p_user
    FROM public.product_attributes pa
   WHERE pa.organization_id = p_org
     AND pa.deleted_at IS NULL
     AND pa.code IN ('cor', 'tonalidade', 'tipo_grelha', 'textura', 'brilho')
     AND NOT EXISTS (SELECT 1 FROM public.attribute_option_groups g
                      WHERE g.attribute_id = pa.id AND g.organization_id = p_org);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  -- 3. As opções. Chave única real: (group_id, value_text).
  --    value_text = display_name = nome da opção (convenção da principal:
  --    resolve_product_attribute_options liga a opção pelo texto).
  WITH grp AS (
    SELECT DISTINCT ON (pa.code) pa.code, g.id AS group_id
      FROM public.product_attributes pa
      JOIN public.attribute_option_groups g
        ON g.attribute_id = pa.id AND g.organization_id = p_org
     WHERE pa.organization_id = p_org AND pa.deleted_at IS NULL
     ORDER BY pa.code, g.created_at, g.id
  ),
  -- Cores da principal: todas as linhas de todos os grupos de cor.
  -- origem: 1 Cor Móveis; 2 Cor de Móveis de Cozinha; 3 Cor Móveis Frentes
  -- (cópia); 4 atributo «Cor» (sub 1 cores base de duche, 2 verde,
  -- 3 vermelho, 4 verde alface). hex tal como vem (minúsculas ou NULL).
  cor_origem (origem, sub, ordem, nome, hex) AS (
    VALUES
      (1, 1,   1, 'Branco', '#fcfcfc'),
      (1, 1,   1, 'Oak', '#aa8888'),
      (1, 1,   2, 'Newman', '#b5b5b5'),
      (1, 1,   3, 'Nogal', '#725f5f'),
      (1, 1,   4, 'Azabache', '#696969'),
      (1, 1,   5, 'Denver', '#b09696'),
      (1, 1,   6, 'Camel', '#e4b681'),
      (1, 1,   7, 'Verde Água', '#c9e4d8'),
      (1, 1,   8, 'Creme', '#f7eed4'),
      (1, 1,   9, 'Cinza Claro', '#dedede'),
      (1, 1,  10, 'Azul Mar', '#5358ee'),
      (1, 1,  11, 'Cinza Médio', '#a3a3a3'),
      (1, 1,  12, 'Antracite', '#645e5e'),
      (1, 1,  13, 'Preto', '#151414'),
      (1, 1,  14, 'Prata', '#c2c2c2'),
      (1, 1,  15, 'Ouro', '#eae78a'),
      (1, 1,  16, 'Cobre', '#ffba6b'),
      (1, 1,  17, 'Azeitona', '#4b6d22'),
      (1, 1,  18, 'Chocolate', '#613b0f'),
      (1, 1,  19, 'Azul Escuro', '#1f349e'),
      (1, 1,  20, 'Rosa', '#ee68af'),
      (1, 1,  21, 'Vermelho', '#fe1616'),
      (1, 1,  22, 'Carvalho', '#d9bf9b'),
      (1, 1,  23, 'Carvalho Cinza', '#c3b7b7'),
      (1, 1,  24, 'Wengue', '#836d6d'),
      (1, 1,  25, 'Nogueira', '#d19d7b'),
      (1, 1,  26, 'Roble Tibet', '#d7a064'),
      (1, 1,  27, 'Roble Noruega', '#d7a064'),
      (1, 1,  28, 'Roble América', '#bc8e5c'),
      (1, 1,  29, 'Fresno Suécia', '#d7a064'),
      (1, 1,  30, 'Olmo Canada', '#d7a064'),
      (1, 1,  31, 'Olmo California', '#af875a'),
      (1, 1,  32, 'Branco Mate', '#f8f7f7'),
      (1, 1,  33, 'Capuccino', '#a18468'),
      (1, 1,  34, 'Gris Stone', '#a49898'),
      (1, 1,  35, 'Verde Trébol', '#377653'),
      (1, 1,  36, 'Verde Boreal', '#2c6b0b'),
      (1, 1,  37, 'Azul Brisa', '#0d659b'),
      (1, 1,  38, 'Gris Marengo', '#564e4e'),
      (1, 1,  39, 'Bege', '#dec9c9'),
      (1, 1,  40, 'Cinza 7035', '#dad8d8'),
      (1, 1,  41, 'Hotelã', '#abe8d1'),
      (1, 1,  42, 'Moka', '#dcb384'),
      (1, 1,  43, 'Oceano', '#1b0b93'),
      (1, 1,  44, 'Cairo', '#7e7272'),
      (1, 1,  45, 'Nairobi', '#c69a5d'),
      (1, 1,  46, 'Rustik', '#af7e55'),
      (1, 1,  47, 'Decapé', '#f0e3c7'),
      (1, 1,  47, 'Nature', '#edd3b6'),
      (1, 1,  49, 'Gold', '#e8a85e'),
      (1, 1,  50, 'Icement', '#c7c7c7'),
      (1, 1,  51, 'Marquina', '#454040'),
      (1, 1,  52, 'Elite Claro', '#b98888'),
      (1, 1,  53, 'Elite Escuro', '#8f6161'),
      (1, 1,  54, 'Tesel Blanco 72', NULL),
      (2, 1,   0, 'Branco', '#ffffff'),
      (2, 1,   1, 'Cinza Claro - T009', '#e3e3e3'),
      (2, 1,   2, 'Cinza - T008', '#c4c4c4'),
      (2, 1,   3, 'Antracite - T002', '#7d7d7d'),
      (2, 1,   4, 'Negro - T006', '#0f0f0f'),
      (2, 1,   5, 'Creme - T012', '#f2e9ca'),
      (2, 1,   6, 'Bege - T021', '#f8f3bf'),
      (2, 1,   7, 'Moka - T016', '#ddcd92'),
      (2, 1,   8, 'Castanho -T000', '#906e31'),
      (2, 1,   9, 'Bordeux - T007', '#913030'),
      (2, 1,  10, 'Carvalho Natural - E077', '#dbca8f'),
      (2, 1,  11, 'Carvalho Areia - E088', '#e1cc93'),
      (2, 1,  12, 'Branco Creme Veio Suave - E061', '#f7eded'),
      (2, 1,  13, 'Branco Textura Suave - E012', '#fffafa'),
      (2, 1,  14, 'Carvalho Mel - E017', '#ddba5a'),
      (2, 1,  15, 'Carvalho Escuro - E011', '#845615'),
      (2, 1,  16, 'Carvalho Cinza - E065', '#707070'),
      (2, 1,  17, 'carvalho Escuro veio forte - E035', '#934115'),
      (2, 1,  18, 'Merino Laminates 10544 Canadian Walnut Suede', '#746363'),
      (2, 1,  19, 'Verde Escuro - Smoke Green K521', '#0e673e'),
      (2, 1,  20, 'GoldHudson Oak K529', '#f0d675'),
      (2, 1,  21, 'Alby Blue SU 5994', '#5662bd'),
      (3, 1,   1, 'Branco', '#fcfcfc'),
      (3, 1,   1, 'Oak', '#aa8888'),
      (3, 1,   2, 'Newman', '#b5b5b5'),
      (3, 1,   3, 'Nogal', '#725f5f'),
      (3, 1,   4, 'Azabache', '#696969'),
      (3, 1,   5, 'Denver', '#b09696'),
      (3, 1,   6, 'Camel', '#e4b681'),
      (3, 1,   7, 'Verde Água', '#c9e4d8'),
      (3, 1,   8, 'Creme', '#f7eed4'),
      (3, 1,   9, 'Cinza Claro', '#dedede'),
      (3, 1,  10, 'Azul Mar', '#5358ee'),
      (3, 1,  11, 'Cinza Médio', '#a3a3a3'),
      (3, 1,  12, 'Antracite', '#645e5e'),
      (3, 1,  13, 'Preto', '#151414'),
      (3, 1,  14, 'Prata', '#c2c2c2'),
      (3, 1,  15, 'Ouro', '#eae78a'),
      (3, 1,  16, 'Cobre', '#ffba6b'),
      (3, 1,  17, 'Azeitona', '#4b6d22'),
      (3, 1,  18, 'Chocolate', '#613b0f'),
      (3, 1,  19, 'Azul Escuro', '#1f349e'),
      (3, 1,  20, 'Rosa', '#ee68af'),
      (3, 1,  21, 'Vermelho', '#fe1616'),
      (3, 1,  22, 'Carvalho', '#d9bf9b'),
      (3, 1,  23, 'Carvalho Cinza', '#c3b7b7'),
      (3, 1,  24, 'Wengue', '#836d6d'),
      (3, 1,  25, 'Nogueira', '#d19d7b'),
      (3, 1,  26, 'Roble Tibet', '#d7a064'),
      (3, 1,  27, 'Roble Noruega', '#d7a064'),
      (3, 1,  28, 'Roble América', '#bc8e5c'),
      (3, 1,  29, 'Fresno Suécia', '#d7a064'),
      (3, 1,  30, 'Olmo Canada', '#d7a064'),
      (3, 1,  31, 'Olmo California', '#af875a'),
      (3, 1,  32, 'Branco Mate', '#f8f7f7'),
      (3, 1,  33, 'Capuccino', '#a18468'),
      (3, 1,  34, 'Gris Stone', '#a49898'),
      (3, 1,  35, 'Verde Trébol', '#377653'),
      (3, 1,  36, 'Verde Boreal', '#2c6b0b'),
      (3, 1,  37, 'Azul Brisa', '#0d659b'),
      (3, 1,  38, 'Gris Marengo', '#564e4e'),
      (3, 1,  39, 'Bege', '#dec9c9'),
      (3, 1,  40, 'Cinza 7035', '#dad8d8'),
      (3, 1,  41, 'Hotelã', '#abe8d1'),
      (3, 1,  42, 'Moka', '#dcb384'),
      (3, 1,  43, 'Oceano', '#1b0b93'),
      (3, 1,  44, 'Cairo', '#7e7272'),
      (3, 1,  45, 'Nairobi', '#c69a5d'),
      (3, 1,  46, 'Rustik', '#af7e55'),
      (3, 1,  47, 'Decapé', '#f0e3c7'),
      (3, 1,  47, 'Nature', '#edd3b6'),
      (3, 1,  49, 'Gold', '#e8a85e'),
      (3, 1,  50, 'Icement', '#c7c7c7'),
      (3, 1,  51, 'Marquina', '#454040'),
      (3, 1,  52, 'Elite Claro', '#c69f9f'),
      (3, 1,  53, 'Elite Escuro', '#775a5a'),
      (3, 1,  54, 'TESEL BLANCO', NULL),
      (4, 1,   1, 'NEGRO', NULL),
      (4, 1,   2, 'BLANCO', NULL),
      (4, 1,   3, 'ORO', NULL),
      (4, 1,   4, 'NIQUEL', NULL),
      (4, 1,   5, 'COBRE', NULL),
      (4, 1,   6, 'TITANIO', NULL),
      (4, 1,   7, 'GRIS 7035', NULL),
      (4, 1,   8, 'GRIS', NULL),
      (4, 1,   9, 'GRIS MEDIO', NULL),
      (4, 1,  10, 'ANTRACITA', NULL),
      (4, 1,  11, 'CREMA', NULL),
      (4, 1,  12, 'BEIG', NULL),
      (4, 1,  13, 'ARENA', NULL),
      (4, 1,  14, 'MOKA', NULL),
      (4, 1,  15, 'TOPO', NULL),
      (4, 1,  16, 'CHOCOLATE', NULL),
      (4, 1,  17, 'ROSA', NULL),
      (4, 1,  18, 'CORAL', NULL),
      (4, 1,  19, 'TERRACOTA', NULL),
      (4, 1,  20, 'TURQUESA', NULL),
      (4, 1,  21, 'OLIVA', NULL),
      (4, 1,  22, 'OCEANO', NULL),
      (4, 1,  23, 'PINO FLANDES', NULL),
      (4, 1,  24, 'PINO BLANCO', NULL),
      (4, 1,  25, 'PATINA BLANCO', NULL),
      (4, 1,  26, 'VINTAGE BLANCO', NULL),
      (4, 1,  27, 'RÚSTICO BLANCO', NULL),
      (4, 1,  28, 'RÚSTICO', NULL),
      (4, 1,  29, 'ROBLE AHUMADO', NULL),
      (4, 1,  30, 'PINO NATURAL', NULL),
      (4, 1,  31, 'RÚSTICO AZUL', NULL),
      (4, 1,  32, 'ROBLE MOKA', NULL),
      (4, 1,  33, 'RÚSTICO NATURAL', NULL),
      (4, 1,  34, 'CÁUCASO', NULL),
      (4, 1,  35, 'MADERA RECICLADA', NULL),
      (4, 1,  36, 'MÁRMOL BLANCO', NULL),
      (4, 1,  37, 'MÁRMOL CREMA', NULL),
      (4, 1,  38, 'MÁRMOL NEGRO', NULL),
      (4, 1,  39, 'MARQUINA', NULL),
      (4, 1,  40, 'MÁRMOL ORO ROSA', NULL),
      (4, 1,  41, 'MÁRMOL BLANCO ORO', NULL),
      (4, 1,  42, 'MOSCATO CREMA', NULL),
      (4, 1,  43, 'TRAVERTINO MARRÓN', NULL),
      (4, 1,  44, 'TRAVERTINO VERDE', NULL),
      (4, 1,  45, 'MÁRMOL ÓXIDO', NULL),
      (4, 1,  46, 'MARRÓN EMPERADOR', NULL),
      (4, 1,  47, 'RAIN FOREST BROWN', NULL),
      (4, 1,  48, 'EMPERADOR CLARO', NULL),
      (4, 1,  49, 'GRANITO BLANCO', NULL),
      (4, 1,  50, 'OASIS MARRÓN CLARO', NULL),
      (4, 1,  51, 'OASIS MARRÓN OSCURO', NULL),
      (4, 1,  52, 'TERRAZO GRIS', NULL),
      (4, 1,  53, 'TERRAZO BEIGE', NULL),
      (4, 1,  54, 'TERRAZO NEGRO', NULL),
      (4, 1,  55, 'JASPE', NULL),
      (4, 1,  56, 'ARENISCA', NULL),
      (4, 1,  57, 'QUARZO', NULL),
      (4, 1,  58, 'MARMOL VETEADO', NULL),
      (4, 1,  59, 'SODALITA', NULL),
      (4, 1,  60, 'AZURITA', NULL),
      (4, 1,  61, 'ESQUISTO', NULL),
      (4, 1,  62, 'CUARZO GRIS', NULL),
      (4, 1,  63, 'PATAGONIA', NULL),
      (4, 1,  64, 'JASPE GRIS', NULL),
      (4, 1,  65, 'MARMOLADO PASTEL', NULL),
      (4, 1,  66, 'MARMOLADO BLANCO', NULL),
      (4, 1,  67, 'MARMOLADO GRIS', NULL),
      (4, 1,  68, 'DECAPÉ', NULL),
      (4, 1,  69, 'NATURE', NULL),
      (4, 1,  70, 'GOLD', NULL),
      (4, 1,  71, 'VINTAGE', NULL),
      (4, 1,  72, 'CENIZA', NULL),
      (4, 1,  73, 'NOGAL', NULL),
      (4, 1,  74, 'RUSTIK', NULL),
      (4, 1,  75, 'RIBONS', NULL),
      (4, 1,  76, 'BAOBAB', NULL),
      (4, 1,  77, 'OLIVO 01', NULL),
      (4, 1,  78, 'OLIVO 02', NULL),
      (4, 1,  79, 'ÉBANO', NULL),
      (4, 1,  80, 'CEMENTO 01', NULL),
      (4, 1,  81, 'CEMENTO 02', NULL),
      (4, 1,  82, 'CEMENTO 03', NULL),
      (4, 1,  83, 'CEMENTO 04', NULL),
      (4, 1,  84, 'CEMENTO 05', NULL),
      (4, 1,  85, 'CEMENTO 06', NULL),
      (4, 1,  86, 'CEMENTO 07', NULL),
      (4, 1,  87, 'CEMENTO 08', NULL),
      (4, 1,  88, 'MICROCEMENTO', NULL),
      (4, 1,  89, 'ICEMENT', NULL),
      (4, 1,  90, 'ACERO RAYADO', NULL),
      (4, 1,  91, 'ACERO', NULL),
      (4, 1,  92, 'ÓXIDO', NULL),
      (4, 1,  93, 'HOJAS 01', NULL),
      (4, 1,  94, 'HOJAS 02', NULL),
      (4, 1,  95, 'CÉSPED', NULL),
      (4, 1,  96, 'HOJAS 03', NULL),
      (4, 1,  97, 'FLORES', NULL),
      (4, 1,  98, 'NAIROBI', NULL),
      (4, 1,  99, 'CALMA', NULL),
      (4, 1, 100, 'MAR', NULL),
      (4, 1, 101, 'PISCINA', NULL),
      (4, 1, 102, 'GOTAS', NULL),
      (4, 1, 103, 'OLA', NULL),
      (4, 1, 104, 'ZEN 01', NULL),
      (4, 1, 105, 'ZEN 02', NULL),
      (4, 1, 106, 'ZEN 03', NULL),
      (4, 1, 107, 'ZEN 04', NULL),
      (4, 1, 108, 'ACUARELA', NULL),
      (4, 1, 109, 'ACUARELA 02', NULL),
      (4, 1, 110, 'ACUARELA 03', NULL),
      (4, 1, 111, 'ACUARELA 04', NULL),
      (4, 1, 112, 'CÍRCULOS', NULL),
      (4, 1, 113, 'NORDIC', NULL),
      (4, 1, 114, 'PUNTOS', NULL),
      (4, 1, 115, 'MADERA COLOR', NULL),
      (4, 1, 116, 'MOSAICO 01 COLOR', NULL),
      (4, 1, 117, 'MOSAICO 02 COLOR', NULL),
      (4, 1, 118, 'HIDRÁULICO COLOR', NULL),
      (4, 1, 119, 'GEOMÉTRICOS 01', NULL),
      (4, 1, 120, 'GEOMÉTRICO 02', NULL),
      (4, 1, 121, 'MOSAICO 01 BN', NULL),
      (4, 1, 122, 'MOSAICO 02 BN', NULL),
      (4, 1, 123, 'HIDRÁULICO BN', NULL),
      (4, 1, 124, 'CROMO', NULL),
      (4, 1, 124, 'GEOMÉTRICO 03', NULL),
      (4, 2,   0, 'verde normal', '#20d71d'),
      (4, 2,   1, 'verde claro', '#8ee19c'),
      (4, 3,   0, 'vermelho', '#d82c3d'),
      (4, 4,   0, 'verde normal', '#20d71d'),
      (4, 4,   1, 'verde claro', '#8ee19c'),
      (4, 4,   2, 'verde', '#16e9c6')
  ),
  cor_norm AS (
    SELECT c.origem, c.sub, c.ordem,
           regexp_replace(btrim(c.nome), '\s+', ' ', 'g') AS nome,
           CASE WHEN upper(btrim(c.hex)) ~ '^#[0-9A-F]{6}$' THEN upper(btrim(c.hex)) END AS hex
      FROM cor_origem c
  ),
  cor_chave AS (
    SELECT n.*,
           lower(translate(n.nome,
             'áàâãäåéèêëíìîïóòôõöúùûüçñýÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ',
             'aaaaaaeeeeiiiiooooouuuucnyAAAAAAEEEEIIIIOOOOOUUUUCNY')) AS chave
      FROM cor_norm n
  ),
  -- Mesmo nome normalizado = uma só opção; fica a de maior precedência.
  cor_fica AS (
    SELECT DISTINCT ON (k.chave) k.*
      FROM cor_chave k
     ORDER BY k.chave, k.origem, k.sub, k.ordem, k.nome COLLATE "C"
  ),
  -- Se a que fica não tem hex, herda o da primeira repetida (por precedência) que o tenha.
  cor_final AS (
    SELECT f.origem, f.sub, f.ordem, f.nome,
           COALESCE(f.hex,
             (SELECT k2.hex FROM cor_chave k2
               WHERE k2.chave = f.chave AND k2.hex IS NOT NULL
               ORDER BY k2.origem, k2.sub, k2.ordem, k2.nome COLLATE "C"
               LIMIT 1)) AS hex
      FROM cor_fica f
  ),
  opcoes (code, nome, hex, ordem) AS (
    SELECT 'cor'::text, cf.nome, cf.hex,
           (row_number() OVER (ORDER BY cf.origem, cf.sub, cf.ordem, cf.nome COLLATE "C"))::integer
      FROM cor_final cf
    UNION ALL
    SELECT s.code, s.nome, NULL::text, s.ordem
      FROM (VALUES
        ('brilho',      'Natural',   1),
        ('brilho',      'Polido',    2),
        ('brilho',      'Brilhante', 3),
        ('brilho',      'Mate',      4),
        ('tipo_grelha', 'Inox',      1),
        ('tipo_grelha', 'À cor',     2),
        ('textura',     'Ardósia',   1),
        ('textura',     'Liso',      2),
        ('textura',     'Pedra',     3)
      ) AS s(code, nome, ordem)
  )
  INSERT INTO public.attribute_option_group_values
         (group_id, value_text, display_name, hex_color, sort_order, is_active)
  SELECT grp.group_id, o.nome, o.nome, o.hex, o.ordem, true
    FROM opcoes o
    JOIN grp ON grp.code = o.code
   ORDER BY o.code, o.ordem
  ON CONFLICT (group_id, value_text) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  RETURN v_total;
END;
$fn$;

-- Verificação: RAISE EXCEPTION «FALHOU: …» se os números não baterem.
CREATE OR REPLACE FUNCTION pg_temp.atrib_verificar(p_org uuid)
RETURNS text
LANGUAGE plpgsql
AS $fn$
DECLARE
  c_cor_total   constant integer := 192;
  c_cor_sem_hex constant integer := 114;
  -- Cores que ficam por origem (opcoes-finais.csv): Cor Móveis, Cozinha,
  -- Frentes (cópia), base de duche, grupos de teste. A soma tem de dar o total.
  c_cor_por_origem constant integer[] := ARRAY[55, 21, 1, 112, 3];
  v_n         bigint;
  v_txt       text;
  v_hex_mau   bigint;
  v_hex_fora  bigint;
  v_espacos   bigint;
  v_sem_hex   bigint;
BEGIN
  IF (SELECT sum(x) FROM unnest(c_cor_por_origem) AS x) <> c_cor_total THEN
    RAISE EXCEPTION 'FALHOU: a soma das cores por origem não dá o total (% contra %).', (SELECT sum(x) FROM unnest(c_cor_por_origem) AS x), c_cor_total;
  END IF;

  SELECT count(*) INTO v_n
    FROM public.product_attributes pa
   WHERE pa.organization_id = p_org AND pa.deleted_at IS NULL
     AND pa.code IN ('medida', 'cor', 'tonalidade', 'tipo_grelha', 'textura', 'brilho');
  IF v_n <> 6 THEN
    RAISE EXCEPTION 'FALHOU: a organização tem % dos 6 atributos globais (esperado 6).', v_n;
  END IF;

  SELECT string_agg(pa.code, ', ' ORDER BY pa.code) INTO v_txt
    FROM public.product_attributes pa
   WHERE pa.organization_id = p_org AND pa.deleted_at IS NULL
     AND (
          (pa.code = 'cor' AND NOT (COALESCE(pa.has_hex_color, false) AND NOT pa.is_measurement AND pa.value_type = 'list'))
       OR (pa.code = 'medida' AND NOT (pa.is_measurement AND NOT COALESCE(pa.has_hex_color, false)
                                       AND pa.value_type = 'json'
                                       AND pa.measurement_type IS NOT DISTINCT FROM 'dimensoes'
                                       AND pa.unit IS NOT DISTINCT FROM 'cm'))
       OR (pa.code IN ('tonalidade', 'tipo_grelha', 'textura', 'brilho')
           AND NOT (pa.value_type = 'list' AND NOT COALESCE(pa.has_hex_color, false) AND NOT pa.is_measurement))
       OR pa.pricing_type IS DISTINCT FROM 'none'
       OR pa.valorization_type <> 'none'
     );
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: atributos com marcas erradas (has_hex_color, is_measurement, value_type ou preço): %', v_txt;
  END IF;

  SELECT string_agg(format('%s tem %s grupos', s.code, s.n), ', ') INTO v_txt
    FROM (SELECT pa.code, count(g.id) AS n
            FROM public.product_attributes pa
            LEFT JOIN public.attribute_option_groups g ON g.attribute_id = pa.id
           WHERE pa.organization_id = p_org AND pa.deleted_at IS NULL
           GROUP BY pa.code) s
   WHERE (s.code = 'medida' AND s.n <> 0) OR (s.code <> 'medida' AND s.n <> 1);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: grupos de opções errados: %', v_txt;
  END IF;

  WITH esperado (code, n) AS (
    VALUES ('cor', c_cor_total), ('brilho', 4), ('tipo_grelha', 2),
           ('textura', 3), ('tonalidade', 0), ('medida', 0)
  ),
  obtido AS (
    SELECT pa.code, count(v.id) AS n
      FROM public.product_attributes pa
      LEFT JOIN public.attribute_option_groups g ON g.attribute_id = pa.id
      LEFT JOIN public.attribute_option_group_values v ON v.group_id = g.id
     WHERE pa.organization_id = p_org AND pa.deleted_at IS NULL
     GROUP BY pa.code
  )
  SELECT string_agg(format('%s=%s (esperado %s)', e.code, COALESCE(r.n, 0), e.n), ', ') INTO v_txt
    FROM esperado e LEFT JOIN obtido r USING (code)
   WHERE COALESCE(r.n, 0) <> e.n;
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: contagens de opções erradas: %', v_txt;
  END IF;

  -- Regras das opções, numa só leitura.
  SELECT count(*) FILTER (WHERE o.hex_color IS NOT NULL AND o.hex_color !~ '^#[0-9A-F]{6}$'),
         count(*) FILTER (WHERE o.code <> 'cor' AND o.hex_color IS NOT NULL),
         count(*) FILTER (WHERE o.value_text <> btrim(o.value_text) OR o.value_text ~ '\s\s'
                             OR o.display_name IS DISTINCT FROM o.value_text),
         count(*) FILTER (WHERE o.code = 'cor' AND o.hex_color IS NULL)
    INTO v_hex_mau, v_hex_fora, v_espacos, v_sem_hex
    FROM (SELECT pa.code, v.value_text::text AS value_text, v.display_name::text AS display_name, v.hex_color::text AS hex_color
            FROM public.product_attributes pa
            JOIN public.attribute_option_groups g ON g.attribute_id = pa.id
            JOIN public.attribute_option_group_values v ON v.group_id = g.id
           WHERE pa.organization_id = p_org AND pa.deleted_at IS NULL) o;
  IF v_hex_mau > 0 THEN
    RAISE EXCEPTION 'FALHOU: % opções com hex fora do formato #RRGGBB em maiúsculas.', v_hex_mau;
  END IF;
  IF v_hex_fora > 0 THEN
    RAISE EXCEPTION 'FALHOU: % opções com hex fora do atributo Cor.', v_hex_fora;
  END IF;
  IF v_espacos > 0 THEN
    RAISE EXCEPTION 'FALHOU: % opções com espaços a mais ou display_name diferente do nome.', v_espacos;
  END IF;
  IF v_sem_hex <> c_cor_sem_hex THEN
    RAISE EXCEPTION 'FALHOU: % cores sem hex (esperado %).', v_sem_hex, c_cor_sem_hex;
  END IF;

  SELECT string_agg(format('%s: %s', s.code, s.chave), ', ') INTO v_txt
    FROM (SELECT pa.code,
                 lower(translate(regexp_replace(btrim(v.value_text), '\s+', ' ', 'g'),
                   'áàâãäåéèêëíìîïóòôõöúùûüçñýÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ',
                   'aaaaaaeeeeiiiiooooouuuucnyAAAAAAEEEEIIIIOOOOOUUUUCNY')) AS chave
            FROM public.product_attributes pa
            JOIN public.attribute_option_groups g ON g.attribute_id = pa.id
            JOIN public.attribute_option_group_values v ON v.group_id = g.id
           WHERE pa.organization_id = p_org AND pa.deleted_at IS NULL) s
   GROUP BY s.code, s.chave
  HAVING count(*) > 1;
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: nomes repetidos (normalizados) no mesmo atributo: %', v_txt;
  END IF;

  RETURN format('OK: 6 atributos; Cor=%s opções (%s sem hex, %s com hex), Brilho=4, Tipo de grelha=2, Textura=3, Tonalidade=0, Medida=0.',
                c_cor_total, v_sem_hex, c_cor_total - v_sem_hex);
END;
$fn$;

-- Guarda + corpo + verificação. Devolve o que fez (ou porque não fez).
CREATE OR REPLACE FUNCTION pg_temp.atrib_executar(p_org uuid, p_nome text)
RETURNS text
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_motivo text;
  v_n      integer;
BEGIN
  v_motivo := pg_temp.atrib_guarda(p_org, p_nome);
  IF v_motivo IS NOT NULL THEN
    RETURN 'nada feito: ' || v_motivo;
  END IF;

  PERFORM set_config('app.audit_source', 'migration:atributos_globais_e_opcoes', true);
  v_n := pg_temp.atrib_corpo(p_org, pg_temp.atrib_criador(p_org));
  RETURN format('%s linhas inseridas. ', v_n) || pg_temp.atrib_verificar(p_org);
END;
$fn$;

-- ---------------------------------------------------------------------------
-- Execução: guarda, corpo e verificação. Organização Mudelar (id fixo e nome confirmado).
-- ---------------------------------------------------------------------------
DO $mig$
DECLARE
  c_org  constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  c_nome constant text := 'Mudelar';
BEGIN
  RAISE NOTICE 'atributos_globais_e_opcoes (Mudelar): %', pg_temp.atrib_executar(c_org, c_nome);
END;
$mig$;
