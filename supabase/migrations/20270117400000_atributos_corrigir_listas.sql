-- =============================================================================
-- Atributos da MUDELAR — SEGUNDA migration da conversão de atributos. Corrige as
-- OPÇÕES de quatro atributos para ficarem IGUAIS às da base principal (texto,
-- maiúsculas e acentos tal como lá estão). SÓ SERVE NA BASE DE RH
-- (uetjghdkwbywbftedtth). Não altera a primeira migration
-- (20270117300000_atributos_globais_e_opcoes.sql), que fica como foi aplicada.
-- =============================================================================
--
-- Organização: Mudelar, id fixo 3242e925-da26-459a-8258-be04d904e355, nome
-- 'Mudelar' conferido pela própria migration.
--
-- Origem: grupos e opções da Mudelar na base principal (lidos antes, só leitura:
-- attribute_option_group_values, value_text e display_name literais, e a
-- sort_order de lá). Listas finais (value_text / display_name / sort_order):
--   Tonalidade      BRILHO/Brilho/0, MATE/Mate/1          (passa de 0 para 2)
--   Brilho          NATURAL/Natural/0, POLIDO/Polido/1    (sai Brilhante e Mate)
--   Tipo de grelha  INOX/INOX/0, À COR/À COR/1
--   Textura         PIZARRA/Pizarra/0, LISO/Liso/1, PIEDRA/Piedra/2
--   Cor e Medida    inalteradas (Cor 192 opções, 114 sem hex; Medida sem opções)
-- Total de opções da Mudelar: 201 antes e 201 depois (192 + 2 + 2 + 2 + 3).
--
-- O que faz, SÓ nos grupos de opções destes quatro atributos da Mudelar:
--   * cria o grupo da Tonalidade se faltar (hoje existe, vazio);
--   * renomeia as opções antigas para o texto da principal (UPDATE pelo texto
--     actual: Natural->NATURAL, Polido->POLIDO, Inox->INOX, À cor->À COR,
--     Ardósia->PIZARRA, Liso->LISO, Pedra->PIEDRA), mantendo o id;
--   * insere as que faltam (Tonalidade) e acerta display_name, sort_order,
--     hex_color (NULL) e is_active (true) — ON CONFLICT (group_id, value_text);
--   * apaga do grupo do Brilho o que não está na principal (Brilhante, Mate).
-- Não toca em product_attributes (nomes e códigos dos atributos ficam), nem
-- nos grupos existentes, nem em products, nem noutras organizações.
-- Apagar é seguro: nada tem chave estrangeira para attribute_option_group_values
-- (lido na RH: só a PK, a UNIQUE (group_id, value_text) e a FK para o grupo);
-- product_attribute_values não tem coluna de opção (liga por texto) e está vazia
-- — a guarda exige-o.
--
-- GUARDA: só actua se, cumulativamente:
--   a organização 3242e925-… existir com o nome 'Mudelar' e não estiver apagada;
--   a Mudelar não tiver NENHUM produto (contando os apagados);
--   product_attribute_values estiver vazia na base INTEIRA;
--   a Mudelar tiver exactamente os 6 atributos da primeira migration (medida,
--   cor, tonalidade, tipo_grelha, textura, brilho) e mais nenhum, exactamente
--   201 opções, a Cor com 192, um só grupo em cor/brilho/tipo_grelha/textura
--   (zero ou um na tonalidade), nenhum na medida;
--   e as opções de cada um dos quatro atributos forem OU as da primeira
--   migration OU as finais (qualquer outra lista = mexida à mão: não actua).
-- Na principal falha logo nos produtos (e em product_attribute_values, e nos
-- códigos dos atributos), por isso fica inerte. Se a guarda não passar: RAISE
-- NOTICE com o motivo e termina sem alterar nada.
-- Todas as funções auxiliares são plpgsql (as tabelas só se resolvem ao
-- executar): o CREATE não rebenta numa base onde falte alguma coluna.
--
-- Idempotente: a segunda execução passa a guarda (lista final reconhecida) e
-- altera 0 linhas (UPDATE/INSERT só onde difere; DELETE só do que sobra).
-- Verificação no fim: RAISE EXCEPTION «FALHOU: …» e a migration é desfeita.
-- Auditoria: app.audit_source = 'migration:atributos_corrigir_listas'.
--
-- Teste: supabase/tests/atributos_corrigir_listas.test.sql (BEGIN … ROLLBACK).
-- ATENÇÃO antes do db push: correr o teste contra o remoto ANTES (tem de falhar
-- no passo 1), listar o pendente com `supabase migration list --linked`
-- imediatamente antes, e só então `db push`.
-- =============================================================================

SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Funções auxiliares TEMPORÁRIAS (pg_temp, prefixo atrib2_ para não se
-- cruzarem com as da primeira migration). O teste
-- supabase/tests/atributos_corrigir_listas.test.sql leva uma cópia exacta
-- deste bloco (gerada da mesma fonte).
-- ---------------------------------------------------------------------------

-- Lista final de cada atributo, tal como na principal, e o texto que a opção
-- tinha depois da primeira migration (old_text; NULL = opção nova).
CREATE OR REPLACE FUNCTION pg_temp.atrib2_alvo()
RETURNS TABLE (code text, old_text text, value_text text, display_name text, ordem integer)
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
BEGIN
  RETURN QUERY
  SELECT a.code, a.old_text, a.value_text, a.display_name, a.ordem
    FROM (VALUES
      ('tonalidade'::text,  NULL::text,  'BRILHO'::text,  'Brilho'::text,  0),
      ('tonalidade',        NULL,        'MATE',          'Mate',          1),
      ('brilho',            'Natural',   'NATURAL',       'Natural',       0),
      ('brilho',            'Polido',    'POLIDO',        'Polido',        1),
      ('tipo_grelha',       'Inox',      'INOX',          'INOX',          0),
      ('tipo_grelha',       'À cor',     'À COR',         'À COR',         1),
      ('textura',           'Ardósia',   'PIZARRA',       'Pizarra',       0),
      ('textura',           'Liso',      'LISO',          'Liso',          1),
      ('textura',           'Pedra',     'PIEDRA',        'Piedra',        2)
    ) AS a(code, old_text, value_text, display_name, ordem);
END;
$fn$;

-- Opções de cada atributo depois da primeira migration (o estado de partida).
CREATE OR REPLACE FUNCTION pg_temp.atrib2_antigas(p_code text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
BEGIN
  RETURN CASE p_code
    WHEN 'tonalidade'  THEN ARRAY[]::text[]
    WHEN 'brilho'      THEN ARRAY['Natural', 'Polido', 'Brilhante', 'Mate']
    WHEN 'tipo_grelha' THEN ARRAY['Inox', 'À cor']
    WHEN 'textura'     THEN ARRAY['Ardósia', 'Liso', 'Pedra']
  END;
END;
$fn$;

-- Lista ordenada (C) e unida por '|', para comparar conjuntos de textos.
CREATE OR REPLACE FUNCTION pg_temp.atrib2_assinatura(p_textos text[])
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
BEGIN
  RETURN COALESCE((SELECT string_agg(x, '|' ORDER BY x COLLATE "C") FROM unnest(p_textos) AS x), '');
END;
$fn$;

-- A lista de opções (value_text) de um atributo é a de partida OU a final?
-- Pura (não lê tabelas): o teste prova-a sem escrever nada.
CREATE OR REPLACE FUNCTION pg_temp.atrib2_lista_reconhecida(p_code text, p_textos text[])
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
DECLARE
  v_antigas text[] := pg_temp.atrib2_antigas(p_code);
  v_finais  text[];
BEGIN
  IF v_antigas IS NULL THEN
    RETURN false;
  END IF;
  SELECT COALESCE(array_agg(a.value_text), ARRAY[]::text[]) INTO v_finais
    FROM pg_temp.atrib2_alvo() a WHERE a.code = p_code;
  RETURN pg_temp.atrib2_assinatura(COALESCE(p_textos, ARRAY[]::text[]))
         IN (pg_temp.atrib2_assinatura(v_antigas), pg_temp.atrib2_assinatura(v_finais));
END;
$fn$;

-- Utilizador para created_by (só usado se faltar o grupo da Tonalidade): o
-- membro activo mais antigo da organização, não cliente, utilizador não apagado.
CREATE OR REPLACE FUNCTION pg_temp.atrib2_criador(p_org uuid)
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

-- Guarda dos dados. Devolve NULL se pode actuar; senão, o motivo. Produtos e
-- product_attribute_values primeiro: é aí que a principal pára.
CREATE OR REPLACE FUNCTION pg_temp.atrib2_guarda_dados(p_org uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $fn$
DECLARE
  v_n   bigint;
  v_txt text;
  r     record;
BEGIN
  IF EXISTS (SELECT 1 FROM public.products p WHERE p.organization_id = p_org) THEN
    RETURN 'a organização tem produtos';
  END IF;

  IF EXISTS (SELECT 1 FROM public.product_attribute_values) THEN
    RETURN 'product_attribute_values não está vazia';
  END IF;

  SELECT string_agg(a.code::text, ', ' ORDER BY a.code::text) INTO v_txt
    FROM public.product_attributes a WHERE a.organization_id = p_org;
  IF v_txt IS DISTINCT FROM 'brilho, cor, medida, textura, tipo_grelha, tonalidade' THEN
    RETURN format('os atributos não são os 6 da primeira migration: %s', COALESCE(v_txt, 'nenhum'));
  END IF;

  IF EXISTS (SELECT 1 FROM public.product_attributes a
              WHERE a.organization_id = p_org AND a.deleted_at IS NOT NULL) THEN
    RETURN 'há atributos apagados';
  END IF;

  SELECT count(*) INTO v_n
    FROM public.attribute_option_group_values v
    JOIN public.attribute_option_groups g ON g.id = v.group_id
   WHERE g.organization_id = p_org;
  IF v_n <> 201 THEN
    RETURN format('a organização tem %s opções (esperado 201)', v_n);
  END IF;

  SELECT string_agg(format('%s=%s', s.code, s.n), ', ') INTO v_txt
    FROM (SELECT pa.code::text AS code,
                 (SELECT count(*) FROM public.attribute_option_groups g
                   WHERE g.attribute_id = pa.id) AS n
            FROM public.product_attributes pa
           WHERE pa.organization_id = p_org) s
   WHERE (s.code = 'medida' AND s.n <> 0)
      OR (s.code = 'tonalidade' AND s.n > 1)
      OR (s.code IN ('cor', 'brilho', 'tipo_grelha', 'textura') AND s.n <> 1);
  IF v_txt IS NOT NULL THEN
    RETURN format('grupos de opções fora do esperado: %s', v_txt);
  END IF;

  SELECT count(*) INTO v_n
    FROM public.product_attributes pa
    JOIN public.attribute_option_groups g ON g.attribute_id = pa.id
    JOIN public.attribute_option_group_values v ON v.group_id = g.id
   WHERE pa.organization_id = p_org AND pa.code = 'cor';
  IF v_n <> 192 THEN
    RETURN format('a Cor tem %s opções (esperado 192)', v_n);
  END IF;

  FOR r IN
    SELECT pa.code::text AS code,
           COALESCE(array_agg(v.value_text::text) FILTER (WHERE v.id IS NOT NULL), ARRAY[]::text[]) AS textos
      FROM public.product_attributes pa
      LEFT JOIN public.attribute_option_groups g ON g.attribute_id = pa.id
      LEFT JOIN public.attribute_option_group_values v ON v.group_id = g.id
     WHERE pa.organization_id = p_org
       AND pa.code IN ('tonalidade', 'brilho', 'tipo_grelha', 'textura')
     GROUP BY pa.code
  LOOP
    IF NOT pg_temp.atrib2_lista_reconhecida(r.code, r.textos) THEN
      RETURN format('as opções de %s não são as da primeira migration nem as finais: %s',
                    r.code, array_to_string(r.textos, ', '));
    END IF;
  END LOOP;

  RETURN NULL;
END;
$fn$;

-- Guarda completa: só a Mudelar (id fixo E nome), existente, não apagada, com
-- a guarda dos dados a passar e com um membro para created_by.
CREATE OR REPLACE FUNCTION pg_temp.atrib2_guarda(p_org uuid, p_nome text)
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

  v_motivo := pg_temp.atrib2_guarda_dados(p_org);
  IF v_motivo IS NOT NULL THEN
    RETURN v_motivo;
  END IF;

  IF EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.id = p_org AND o.deleted_at IS NOT NULL) THEN
    RETURN 'a organização está apagada';
  END IF;

  IF pg_temp.atrib2_criador(p_org) IS NULL THEN
    RETURN 'nenhum membro activo da organização para created_by';
  END IF;

  RETURN NULL;
END;
$fn$;

-- Corpo: idempotente por si. Devolve o número de linhas alteradas (grupos
-- criados + opções renomeadas + inseridas/acertadas + apagadas). Só mexe nos
-- grupos dos quatro atributos da organização.
CREATE OR REPLACE FUNCTION pg_temp.atrib2_corpo(p_org uuid, p_user uuid)
RETURNS integer
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_total integer := 0;
  v_n     integer;
BEGIN
  IF p_user IS NULL THEN
    RAISE EXCEPTION 'atrib2_corpo: created_by em falta';
  END IF;

  -- 0. Grupo da Tonalidade, se faltar (nome = nome do atributo, como na 1.ª).
  INSERT INTO public.attribute_option_groups
         (attribute_id, organization_id, name, sort_order, is_active, created_by)
  SELECT pa.id, p_org, pa.label, pa.sort_order, true, p_user
    FROM public.product_attributes pa
   WHERE pa.organization_id = p_org
     AND pa.deleted_at IS NULL
     AND pa.code = 'tonalidade'
     AND NOT EXISTS (SELECT 1 FROM public.attribute_option_groups g
                      WHERE g.attribute_id = pa.id AND g.organization_id = p_org);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  -- 1. Renomear pelo texto actual (mantém o id). Só se o texto novo ainda
  --    não existir no grupo (senão o passo 2 acerta-o e o 3 apaga o antigo).
  UPDATE public.attribute_option_group_values v
     SET value_text   = a.value_text,
         display_name = a.display_name,
         sort_order   = a.ordem,
         hex_color    = NULL,
         is_active    = true
    FROM pg_temp.atrib2_alvo() a,
         (SELECT DISTINCT ON (pa.code) pa.code::text AS code, g.id AS group_id
            FROM public.product_attributes pa
            JOIN public.attribute_option_groups g
              ON g.attribute_id = pa.id AND g.organization_id = p_org
           WHERE pa.organization_id = p_org AND pa.deleted_at IS NULL
             AND pa.code IN ('tonalidade', 'brilho', 'tipo_grelha', 'textura')
           ORDER BY pa.code, g.created_at, g.id) grp
   WHERE grp.code = a.code
     AND v.group_id = grp.group_id
     AND a.old_text IS NOT NULL
     AND v.value_text::text = a.old_text
     AND a.old_text <> a.value_text
     AND NOT EXISTS (SELECT 1 FROM public.attribute_option_group_values v2
                      WHERE v2.group_id = grp.group_id AND v2.value_text::text = a.value_text);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  -- 2. Inserir as que faltam e acertar as que existem (só onde difere).
  INSERT INTO public.attribute_option_group_values AS t
         (group_id, value_text, display_name, hex_color, sort_order, is_active)
  SELECT grp.group_id, a.value_text, a.display_name, NULL, a.ordem, true
    FROM pg_temp.atrib2_alvo() a
    JOIN (SELECT DISTINCT ON (pa.code) pa.code::text AS code, g.id AS group_id
            FROM public.product_attributes pa
            JOIN public.attribute_option_groups g
              ON g.attribute_id = pa.id AND g.organization_id = p_org
           WHERE pa.organization_id = p_org AND pa.deleted_at IS NULL
             AND pa.code IN ('tonalidade', 'brilho', 'tipo_grelha', 'textura')
           ORDER BY pa.code, g.created_at, g.id) grp ON grp.code = a.code
   ORDER BY a.code, a.ordem
  ON CONFLICT (group_id, value_text) DO UPDATE
     SET display_name = EXCLUDED.display_name,
         sort_order   = EXCLUDED.sort_order,
         hex_color    = NULL,
         is_active    = true
   WHERE ROW(t.display_name::text, t.sort_order, t.hex_color::text, t.is_active)
         IS DISTINCT FROM ROW(EXCLUDED.display_name::text, EXCLUDED.sort_order, NULL::text, true);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  -- 3. Apagar, nestes quatro grupos, o que não está na principal
  --    (Brilho: Brilhante e Mate).
  DELETE FROM public.attribute_option_group_values v
   USING (SELECT DISTINCT ON (pa.code) pa.code::text AS code, g.id AS group_id
            FROM public.product_attributes pa
            JOIN public.attribute_option_groups g
              ON g.attribute_id = pa.id AND g.organization_id = p_org
           WHERE pa.organization_id = p_org AND pa.deleted_at IS NULL
             AND pa.code IN ('tonalidade', 'brilho', 'tipo_grelha', 'textura')
           ORDER BY pa.code, g.created_at, g.id) grp
   WHERE v.group_id = grp.group_id
     AND NOT EXISTS (SELECT 1 FROM pg_temp.atrib2_alvo() a
                      WHERE a.code = grp.code AND a.value_text = v.value_text::text);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  RETURN v_total;
END;
$fn$;

-- Verificação: RAISE EXCEPTION «FALHOU: …» se o estado não for o final.
-- A Tonalidade é a primeira a ser conferida.
CREATE OR REPLACE FUNCTION pg_temp.atrib2_verificar(p_org uuid)
RETURNS text
LANGUAGE plpgsql
AS $fn$
DECLARE
  c_total       constant integer := 201;
  c_cor_total   constant integer := 192;
  c_cor_sem_hex constant integer := 114;
  v_n       bigint;
  v_sem_hex bigint;
  v_obtida  text;
  v_espera  text;
  r         record;
BEGIN
  -- Contagens por atributo, pela ordem: Tonalidade, Brilho, Tipo de grelha,
  -- Textura, Cor, Medida.
  FOR r IN
    SELECT e.code, e.n, e.pos,
           COALESCE(pa.label::text, e.code) AS label,
           (SELECT count(v.id)
              FROM public.attribute_option_groups g
              JOIN public.attribute_option_group_values v ON v.group_id = g.id
             WHERE g.attribute_id = pa.id) AS obtido
      FROM (VALUES ('tonalidade', 2, 1), ('brilho', 2, 2), ('tipo_grelha', 2, 3),
                   ('textura', 3, 4), ('cor', c_cor_total, 5), ('medida', 0, 6)) AS e(code, n, pos)
      LEFT JOIN public.product_attributes pa
        ON pa.organization_id = p_org AND pa.code = e.code AND pa.deleted_at IS NULL
     ORDER BY e.pos
  LOOP
    IF COALESCE(r.obtido, 0) <> r.n THEN
      RAISE EXCEPTION 'FALHOU: % tem % opções, esperado %.', r.label, COALESCE(r.obtido, 0), r.n;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_n
    FROM public.product_attributes pa
   WHERE pa.organization_id = p_org AND pa.deleted_at IS NULL;
  IF v_n <> 6 THEN
    RAISE EXCEPTION 'FALHOU: a organização tem % atributos (esperado 6).', v_n;
  END IF;

  SELECT count(*) INTO v_n
    FROM public.attribute_option_groups g WHERE g.organization_id = p_org;
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'FALHOU: a organização tem % grupos de opções (esperado 5).', v_n;
  END IF;

  SELECT count(*), count(*) FILTER (WHERE pa.code = 'cor' AND v.hex_color IS NULL)
    INTO v_n, v_sem_hex
    FROM public.product_attributes pa
    JOIN public.attribute_option_groups g ON g.attribute_id = pa.id
    JOIN public.attribute_option_group_values v ON v.group_id = g.id
   WHERE pa.organization_id = p_org;
  IF v_n <> c_total THEN
    RAISE EXCEPTION 'FALHOU: a organização tem % opções (esperado %).', v_n, c_total;
  END IF;
  IF v_sem_hex <> c_cor_sem_hex THEN
    RAISE EXCEPTION 'FALHOU: % cores sem hex (esperado %).', v_sem_hex, c_cor_sem_hex;
  END IF;

  -- Textos exactos (value_text=display_name#sort_order), activos e sem hex.
  FOR r IN SELECT DISTINCT a.code FROM pg_temp.atrib2_alvo() a ORDER BY a.code
  LOOP
    SELECT string_agg(format('%s=%s#%s', a.value_text, a.display_name, a.ordem), ' | '
                      ORDER BY a.ordem, a.value_text COLLATE "C")
      INTO v_espera
      FROM pg_temp.atrib2_alvo() a WHERE a.code = r.code;

    SELECT string_agg(format('%s=%s#%s%s', v.value_text::text, COALESCE(v.display_name::text, 'NULL'),
                             COALESCE(v.sort_order::text, 'NULL'),
                             CASE WHEN v.hex_color IS NOT NULL OR NOT v.is_active THEN ' (hex/inactiva)' ELSE '' END),
                      ' | ' ORDER BY v.sort_order, v.value_text::text COLLATE "C")
      INTO v_obtida
      FROM public.product_attributes pa
      JOIN public.attribute_option_groups g ON g.attribute_id = pa.id
      JOIN public.attribute_option_group_values v ON v.group_id = g.id
     WHERE pa.organization_id = p_org AND pa.code = r.code;

    IF v_obtida IS DISTINCT FROM v_espera THEN
      RAISE EXCEPTION 'FALHOU: opções de % diferentes da principal: obtido «%», esperado «%».', r.code, v_obtida, v_espera;
    END IF;
  END LOOP;

  RETURN format('OK: Tonalidade=2 (Brilho, Mate), Brilho=2 (Natural, Polido), Tipo de grelha=2 (INOX, À COR), '
                'Textura=3 (Pizarra, Liso, Piedra), Cor=%s (%s sem hex), Medida=0; total %s.',
                c_cor_total, v_sem_hex, c_total);
END;
$fn$;

-- Guarda + corpo + verificação. Devolve o que fez (ou porque não fez).
CREATE OR REPLACE FUNCTION pg_temp.atrib2_executar(p_org uuid, p_nome text)
RETURNS text
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_motivo text;
  v_n      integer;
BEGIN
  v_motivo := pg_temp.atrib2_guarda(p_org, p_nome);
  IF v_motivo IS NOT NULL THEN
    RETURN 'nada feito: ' || v_motivo;
  END IF;

  PERFORM set_config('app.audit_source', 'migration:atributos_corrigir_listas', true);
  v_n := pg_temp.atrib2_corpo(p_org, pg_temp.atrib2_criador(p_org));
  RETURN format('%s linhas alteradas. ', v_n) || pg_temp.atrib2_verificar(p_org);
END;
$fn$;

-- ---------------------------------------------------------------------------
-- Execução: guarda, corpo e verificação. Organização Mudelar (id e nome).
-- ---------------------------------------------------------------------------
DO $mig$
DECLARE
  c_org  constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  c_nome constant text := 'Mudelar';
BEGIN
  RAISE NOTICE 'atributos_corrigir_listas (Mudelar): %', pg_temp.atrib2_executar(c_org, c_nome);
END;
$mig$;
