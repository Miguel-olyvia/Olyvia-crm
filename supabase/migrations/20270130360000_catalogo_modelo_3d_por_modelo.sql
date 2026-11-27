-- =============================================================================
-- Catálogo — MODELO 3D POR MODELO (Emylia): cada Modelo do Catálogo (Categoria › Subcategoria › Modelo, ex.: 0001 SMOOTH)
-- passa a poder ter um modelo 3D escolhido, como já têm as categorias e as subcategorias (20270126320000).
-- Vazio (NULL) = herda / automático. Ordem da herança que o browser aplica:
--   produto > modelo (product_models) > subcategoria > categoria > o catálogo adivinha.
--
-- !!! SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth) — NUNCA NA PRINCIPAL; confirmar o project-ref antes do push
-- !!! (supabase/.temp/project-ref tem de dizer uetjghdkwbywbftedtth). A base principal (tzbfgw…) é a de produção
-- !!! real da Mudelar e não foi lida nem medida para esta migration.
--
-- !!! PRECISA DE CÓDIGO NOVO NO BROWSER, que entra JUNTO (mesmo envio). Sem ele a migration não parte nada (a leitura
-- !!! ganha só uma chave nova, sempre null; a escrita só ganha um valor novo de p_alvo), mas o seletor não aparece:
-- !!!   * src/emylia/modelosDados.ts — ModeloGestao ganha `modelo3d: string | null`, lido da chave 'modelo3d' de
-- !!!     cat_ler_modelos_gestao com modelo3dDeLeitura (chave em falta = null).
-- !!!   * src/emylia/modelo3dDados.ts — AlvoModelo3D passa a 'produto' | 'categoria' | 'modelo'; definirModelo3d chama
-- !!!     cat_definir_modelo_3d com p_alvo = 'modelo' e p_id = o id do Modelo (product_models.id).
-- !!!   * src/emylia/GestaoModelos.tsx — em cada linha de Modelo o mesmo seletor das categorias (Modelo3DTexto +
-- !!!     EditarModelo3D de categoriasAcoes.ts, ou o equivalente), com rótulo acessível; recarrega a lista depois de gravar.
-- !!!   * a herança do 3D do produto (Modelo3DFicha / Modelo3DProduto) só considera o modelo quando o browser o ler;
-- !!!     isso é outro passo (não está nesta migration nem no seletor).
-- =============================================================================
--
-- CONTRATO (combinado com o código do browser; os nomes não mudam)
--  1. product_models.modelo_3d text NULL, sem default; CHECK product_models_modelo_3d_check:
--     modelo_3d IS NULL OR modelo_3d ~ '^[a-z0-9_]{1,40}$' (o mesmo de products e product_categories; não é lista fechada).
--  2. cat_definir_modelo_3d(p_org uuid, p_alvo text, p_id uuid, p_modelo text) → jsonb {alvo, id, modelo, anterior}
--     (mesma assinatura, CREATE OR REPLACE). p_alvo ∈ ('produto','categoria','modelo'). NULL ou '' limpa.
--     Ramo 'modelo': fn_cat_exigir(p_org, 'products.edit') (CT001 sem ela, como os outros ramos); o modelo tem de ser de
--     p_org e não apagado (deleted_at IS NULL), senão CT003 «Modelo não encontrado.» (a mesma mensagem e o mesmo código de
--     cat_estado_modelo: apagado e de outra organização respondem igual, sem revelar se existe). Modelos desativados
--     aceitam-se (a gestão mostra-os). Prende a chave de cat_estado_modelo/cat_guardar_modelo
--     ('cat_modelos:' || org || ':' || subcategoria) antes da linha (mesma ordem, sem ciclos).
--     Os ramos 'produto' e 'categoria' ficam iguais, letra por letra.
--     EXECUTE só a authenticated e service_role (como hoje; nada a PUBLIC nem anon).
--  3. cat_ler_modelos_gestao(p_org uuid) → jsonb (mesma assinatura e MESMO tipo devolvido: jsonb; por isso
--     CREATE OR REPLACE e não DROP/CREATE). Cada elemento de 'modelos' ganha a chave 'modelo3d' (text ou null); os outros
--     campos e a ordem ficam iguais: id, nome, numero, ativo, usados, subcategoria{id,nome,sigla,ativo},
--     categoria{id,nome,sigla}, ordenados por categoria, subcategoria, número.
--
-- CORPOS DE PARTIDA (lidos no remoto RH a 27/11 com pg_get_functiondef):
--   cat_definir_modelo_3d   70b9ec82544c84c3b304944a4f933af6  (20270126320000)
--   cat_ler_modelos_gestao  72fd9d316844bf1382cf78acd0146f85  (20270118300000)
-- A guarda do início falha se algum md5 for outro (alguém mudou a função entretanto: rever antes de sobrepor).
--
-- EFEITOS LATERAIS lidos no remoto (27/11): product_models tem 1058 linhas (1034 vivas, uma só organização). ADD COLUMN
-- NULL sem default não reescreve a tabela; o CHECK valida com uma passagem por linhas todas NULL. Triggers de
-- product_models: trg_audit_product_models (fn_generic_entity_audit, linha inteira: a coluna entra sozinha na auditoria),
-- trg_cat_modelo_valida (no UPDATE só recusa mudar organização, subcategoria e número: não reage a modelo_3d) e
-- update_product_models_updated_at (acerta updated_at). Nenhuma vista depende de product_models.
--
-- O QUE NÃO MUDA: nenhum dado (todos os Modelos ficam com modelo_3d NULL), products, product_categories, preços, SKUs.
-- Sem DROP FUNCTION e sem sobrecargas novas.
--
-- REVERSÃO: fora da pasta das migrations, em C:/Users/carva/.claude/jobs/bbc4f3a6/tmp/reverter-modelo3d-modelos.sql
-- (repõe os dois corpos de partida e larga a coluna). Não se aplica por omissão.
--
-- ORDEM: depende só do que já está aplicado na RH (última aplicada lida a 27/11: 20270130350000). `supabase db push`
-- aplica TUDO o que estiver pendente: listar com `supabase migration list --linked` imediatamente antes.
-- =============================================================================

SET lock_timeout = '5s';
SET statement_timeout = '2min';

-- ---- Guarda: os corpos de partida são os que estão na base -----------------------------------------------------
DO $guarda$
DECLARE
  r record;
  v_md5 text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('public.cat_definir_modelo_3d(uuid,text,uuid,text)', '70b9ec82544c84c3b304944a4f933af6'),
      ('public.cat_ler_modelos_gestao(uuid)', '72fd9d316844bf1382cf78acd0146f85')
    ) AS t(assinatura, md5)
  LOOP
    IF to_regprocedure(r.assinatura) IS NULL THEN
      RAISE EXCEPTION '%', format('Guarda: a função %s não existe nesta base (é a base de RH?).', r.assinatura);
    END IF;
    SELECT md5(pg_get_functiondef(to_regprocedure(r.assinatura))) INTO v_md5;
    IF v_md5 IS DISTINCT FROM r.md5 THEN
      RAISE EXCEPTION '%', format('Guarda: %s mudou desde a leitura (md5 %s, esperado %s). Rever antes de sobrepor.',
                                  r.assinatura, v_md5, r.md5);
    END IF;
  END LOOP;

  IF to_regprocedure('public.fn_cat_exigir(uuid,text)') IS NULL
     OR to_regprocedure('public.fn_cat_exigir_uma(uuid,text[])') IS NULL THEN
    RAISE EXCEPTION 'Guarda: faltam fn_cat_exigir ou fn_cat_exigir_uma com os argumentos esperados.';
  END IF;

  IF to_regclass('public.product_models') IS NULL THEN
    RAISE EXCEPTION '%', 'Guarda: a tabela product_models não existe nesta base.';
  END IF;

  -- a coluna e o CHECK não podem existir já com outra forma
  IF EXISTS (SELECT 1 FROM information_schema.columns c
             WHERE c.table_schema = 'public' AND c.table_name = 'product_models' AND c.column_name = 'modelo_3d') THEN
    RAISE EXCEPTION '%', 'Guarda: modelo_3d já existe em product_models (ver o que está na base).';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint co WHERE co.conname = 'product_models_modelo_3d_check') THEN
    RAISE EXCEPTION '%', 'Guarda: já existe um CHECK product_models_modelo_3d_check.';
  END IF;
END
$guarda$;

-- ---- 1. Coluna e CHECK de formato --------------------------------------------------------------------------------
-- num só ALTER: um só pedido de lock; sem default, não reescreve
ALTER TABLE public.product_models
  ADD COLUMN modelo_3d text NULL,
  ADD CONSTRAINT product_models_modelo_3d_check CHECK (modelo_3d IS NULL OR modelo_3d ~ '^[a-z0-9_]{1,40}$');

COMMENT ON COLUMN public.product_models.modelo_3d IS
  'Modelo 3D do Modelo do Catálogo (chave do código, ex.: sanita_suspensa). NULL = herda (subcategoria → categoria → adivinhar). O do produto manda sobre este. Escreve-se por cat_definir_modelo_3d (p_alvo = modelo).';

-- ---- 2. cat_definir_modelo_3d (de 20270126320000; + p_alvo 'modelo') --------------------------------------------
CREATE OR REPLACE FUNCTION public.cat_definir_modelo_3d(p_org uuid, p_alvo text, p_id uuid, p_modelo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c_max_texto constant integer := 200;
  v_alvo text := lower(btrim(coalesce(p_alvo, '')));
  v_modelo text;
  v_anterior text;
  v_sub uuid;
BEGIN
  -- a mesma permissão que cat_guardar_produto_tabelas, cat_guardar_categoria_produto e cat_estado_modelo exigem (CT001 sem ela)
  PERFORM public.fn_cat_exigir(p_org, 'products.edit');

  IF v_alvo NOT IN ('produto', 'categoria', 'modelo') THEN
    RAISE EXCEPTION 'Indique se o modelo 3D é de um produto, de uma categoria ou de um modelo.' USING ERRCODE = 'CT002';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'Falta indicar o produto, a categoria ou o modelo.' USING ERRCODE = 'CT002';
  END IF;
  -- texto absurdo: recusado antes de qualquer trabalho
  IF length(p_modelo) > c_max_texto THEN
    RAISE EXCEPTION 'O modelo 3D não é válido.' USING ERRCODE = 'CT002';
  END IF;

  -- NULL ou '' limpa (volta a herdar); senão a chave do modelo, no formato do CHECK
  v_modelo := nullif(btrim(coalesce(p_modelo, '')), '');
  IF v_modelo IS NOT NULL AND v_modelo !~ '^[a-z0-9_]{1,40}$' THEN
    RAISE EXCEPTION 'O modelo 3D «%» não é válido: só letras minúsculas sem acentos, algarismos e _ (até 40).', v_modelo
      USING ERRCODE = 'CT002';
  END IF;

  IF v_alvo = 'produto' THEN
    -- o produto do Catálogo desta organização (o mesmo filtro da ficha, cat_ler_produto), preso até ao fim
    SELECT p.modelo_3d INTO v_anterior FROM products p
    WHERE p.id = p_id AND p.organization_id = p_org AND p.tipo_catalogo IS NOT NULL AND NOT p.is_deleted
    FOR NO KEY UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE = 'CT003'; END IF;

    UPDATE products p SET modelo_3d = v_modelo
    WHERE p.id = p_id AND p.modelo_3d IS DISTINCT FROM v_modelo;
  ELSIF v_alvo = 'categoria' THEN
    -- a mesma chave e a mesma ordem de cat_guardar_categoria_produto: primeiro a organização, depois a linha
    PERFORM pg_advisory_xact_lock(hashtextextended('cat_categorias_produto:' || p_org::text, 0));
    -- a partilhada (organization_id NULL) recusa-se sem lhe trancar a linha
    IF EXISTS (SELECT 1 FROM product_categories pc
               WHERE pc.id = p_id AND pc.deleted_at IS NULL AND pc.organization_id IS NULL) THEN
      RAISE EXCEPTION 'Categoria partilhada: não se pode alterar aqui.' USING ERRCODE = 'CT002';
    END IF;
    -- só se tranca a linha da própria organização; apagada ou de outra organização = não encontrada
    SELECT pc.modelo_3d INTO v_anterior FROM product_categories pc
    WHERE pc.id = p_id AND pc.deleted_at IS NULL AND pc.organization_id = p_org
    FOR NO KEY UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Categoria não encontrada.' USING ERRCODE = 'CT003'; END IF;

    UPDATE product_categories pc SET modelo_3d = v_modelo
    WHERE pc.id = p_id AND pc.modelo_3d IS DISTINCT FROM v_modelo;
  ELSE
    -- 20270130360000: o Modelo do Catálogo desta organização, vivo (desativado aceita-se); apagado ou de outra
    -- organização = não encontrado (a mesma resposta de cat_estado_modelo)
    SELECT pm.subcategory_id INTO v_sub FROM product_models pm
    WHERE pm.id = p_id AND pm.organization_id = p_org AND pm.deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Modelo não encontrado.' USING ERRCODE = 'CT003'; END IF;
    -- a chave de cat_estado_modelo e cat_guardar_modelo (organização + subcategoria), antes da linha (mesma ordem)
    PERFORM pg_advisory_xact_lock(hashtextextended('cat_modelos:' || p_org::text || ':' || v_sub::text, 0));
    -- de novo com a linha presa: pode ter sido apagado entre as duas leituras
    SELECT pm.modelo_3d INTO v_anterior FROM product_models pm
    WHERE pm.id = p_id AND pm.organization_id = p_org AND pm.deleted_at IS NULL
    FOR NO KEY UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Modelo não encontrado.' USING ERRCODE = 'CT003'; END IF;

    UPDATE product_models pm SET modelo_3d = v_modelo
    WHERE pm.id = p_id AND pm.modelo_3d IS DISTINCT FROM v_modelo;
  END IF;

  RETURN jsonb_build_object('alvo', v_alvo, 'id', p_id, 'modelo', v_modelo, 'anterior', v_anterior);
END $function$;

-- os privilégios ficam como estavam (CREATE OR REPLACE conserva-os); reaplicados para ficar escrito
REVOKE ALL ON FUNCTION public.cat_definir_modelo_3d(uuid,text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_definir_modelo_3d(uuid,text,uuid,text) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_definir_modelo_3d(uuid,text,uuid,text) IS
  'Escolhe (ou limpa, com NULL/'''') o modelo 3D de um produto, de uma categoria/subcategoria ou de um Modelo do Catálogo da organização. p_alvo: produto | categoria | modelo. Devolve {alvo, id, modelo, anterior}. Exige products.edit.';

-- ---- 3. cat_ler_modelos_gestao (de 20270118300000; + 'modelo3d') ------------------------------------------------
-- o tipo devolvido continua jsonb: CREATE OR REPLACE chega (sem DROP)
CREATE OR REPLACE FUNCTION public.cat_ler_modelos_gestao(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.fn_cat_exigir_uma(p_org, ARRAY['products.edit', 'services.view']);
  RETURN (
    WITH uso AS (
      SELECT p.model_id AS id, count(*)::integer AS n FROM products p
      WHERE p.organization_id = p_org AND NOT p.is_deleted AND p.model_id IS NOT NULL
      GROUP BY p.model_id
    )
    SELECT jsonb_build_object('modelos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', pm.id, 'nome', pm.name, 'numero', pm.numero, 'ativo', pm.is_active, 'usados', coalesce(u.n, 0),
               'subcategoria', jsonb_build_object('id', s.id, 'nome', s.name, 'sigla', s.sigla, 'ativo', coalesce(s.is_active, true)),
               'categoria', jsonb_build_object('id', c.id, 'nome', c.name, 'sigla', c.sigla),
               -- 20270130360000: o modelo 3D escolhido no Modelo (NULL = herda)
               'modelo3d', pm.modelo_3d)
             ORDER BY coalesce(c.sort_order, 0), c.name, coalesce(s.sort_order, 0), s.name, pm.numero, pm.id)
      FROM product_models pm
      JOIN product_categories s ON s.id = pm.subcategory_id
      LEFT JOIN product_categories c ON c.id = s.parent_id
      LEFT JOIN uso u ON u.id = pm.id
      WHERE pm.organization_id = p_org AND pm.deleted_at IS NULL), '[]'::jsonb))
  );
END $function$;

REVOKE ALL ON FUNCTION public.cat_ler_modelos_gestao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_ler_modelos_gestao(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_ler_modelos_gestao(uuid) IS
  'Catálogo (20270118300000; modelo3d em 20270130360000): ecrã de gestão dos modelos. Modelos da organização (não apagados, ativos e desativados) com o número do SKU, a subcategoria e a categoria, quantos produtos vivos os usam e o modelo 3D escolhido (modelo3d, NULL = herda). Permissão products.edit ou services.view.';

-- ---- 4. Conferir: falha a migration se alguma coisa não ficou como descrito -----------------------------------
DO $conferir$
DECLARE
  r record;
  v_oid oid;
  v_n integer;
  v_def text;
BEGIN
  -- coluna: text, NULL, sem default
  SELECT count(*)::integer INTO v_n FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'product_models' AND c.column_name = 'modelo_3d'
    AND c.data_type = 'text' AND c.is_nullable = 'YES' AND c.column_default IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '%', 'Conferir: product_models.modelo_3d text NULL sem default não existe.';
  END IF;

  -- CHECK validado, com o formato (::text em contype: é do tipo "char")
  SELECT pg_get_constraintdef(co.oid) INTO v_def FROM pg_constraint co
  WHERE co.conname = 'product_models_modelo_3d_check' AND co.contype::text = 'c' AND co.convalidated
    AND co.conrelid = to_regclass('public.product_models');
  IF v_def IS NULL OR position('modelo_3d' IN v_def) = 0 OR position('[a-z0-9_]{1,40}' IN v_def) = 0 THEN
    RAISE EXCEPTION '%', format('Conferir: CHECK product_models_modelo_3d_check em falta ou diferente (%s).', coalesce(v_def, 'nenhum'));
  END IF;

  -- nenhum dado mudou: todos os Modelos com modelo_3d NULL
  SELECT count(*)::integer INTO v_n FROM public.product_models pm WHERE pm.modelo_3d IS NOT NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION '%', format('Conferir: %s modelo(s) com modelo_3d preenchido (esperado 0).', v_n);
  END IF;

  -- funções: uma só versão por nome, assinatura, resultado, SECURITY DEFINER, search_path e privilégios
  FOR r IN SELECT * FROM (VALUES
      ('cat_definir_modelo_3d',  'p_org uuid, p_alvo text, p_id uuid, p_modelo text'),
      ('cat_ler_modelos_gestao', 'p_org uuid')
    ) AS t(nome, args)
  LOOP
    SELECT count(*)::integer INTO v_n FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname = r.nome;
    IF v_n <> 1 THEN
      RAISE EXCEPTION '%', format('Conferir: %s tem %s versões (esperado 1).', r.nome, v_n);
    END IF;
    v_oid := NULL;
    SELECT p.oid INTO v_oid FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname = r.nome
      AND pg_get_function_identity_arguments(p.oid) = r.args
      AND pg_get_function_result(p.oid) = 'jsonb'
      AND p.prosecdef
      AND p.proconfig::text = '{"search_path=public, pg_temp"}';
    IF v_oid IS NULL THEN
      RAISE EXCEPTION '%', format('Conferir: %s não tem a assinatura (%s) → jsonb, SECURITY DEFINER e search_path esperados.', r.nome, r.args);
    END IF;
    IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_oid, 'EXECUTE')
       OR has_function_privilege('anon', v_oid, 'EXECUTE')
       OR EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) x WHERE p.oid = v_oid AND x.grantee = 0) THEN
      RAISE EXCEPTION '%', format('Conferir: os privilégios de %s divergem (esperado EXECUTE só a authenticated e service_role, nada a anon/PUBLIC).', r.nome);
    END IF;
  END LOOP;

  -- os corpos novos levam mesmo o que se acrescentou
  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure('public.cat_definir_modelo_3d(uuid,text,uuid,text)')
                 AND position('product_models' IN p.prosrc) > 0 AND position('''cat_modelos:''' IN p.prosrc) > 0
                 AND position('''cat_categorias_produto:''' IN p.prosrc) > 0) THEN
    RAISE EXCEPTION '%', 'Conferir: cat_definir_modelo_3d não tem o ramo modelo (ou perdeu o da categoria).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure('public.cat_ler_modelos_gestao(uuid)')
                 AND position('''modelo3d'', pm.modelo_3d' IN p.prosrc) > 0) THEN
    RAISE EXCEPTION '%', 'Conferir: cat_ler_modelos_gestao não devolve modelo3d.';
  END IF;
END
$conferir$;

RESET lock_timeout;
RESET statement_timeout;
