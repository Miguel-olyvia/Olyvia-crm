-- ==============================================================================
-- 20270130100000_ativos_codigo_org.sql
--
-- ATIVOS, fase 1, passo F1.0: o código automático passa a ser POR ORGANIZAÇÃO, com o
-- prefixo da própria organização: PREFIXO-CAT-TIPO-AA-NNNN (ex.: NIKE-IT-LAP-26-0001).
-- Desenho fechado: vault/ficheiros/ativos/ativos-plano-fase1-nike.md (secção 2, F1.0) e a
-- versão simples aprovada pelo dono (ativos-plano-fase1-nike-v2.md).
-- Decisão do dono (27/11): não há grupo, raiz nem hierarquia; cada organização tem o seu
-- prefixo e a sua numeração. Não há tabelas, colunas nem CHECKs novas: só funções.
--
-- SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth). NUNCA a principal (tzbfgw...).
--
-- O QUE O ECRÃ TEM DE FAZER (no mesmo envio; nada parte sem ele):
--  * src/components/ativos/lib/errosAtivo.ts: traduzir ATV34 (prefixo inválido: 2 a 4
--    letras, sem números nem acentos). Chave nova ativos.erro.ATV34 em
--    src/translations/ativos.ts (pt e en) e os testes errosAtivo.test.ts e ativos.test.ts.
--  * O formulário de ativo NÃO muda: os códigos novos saem já no formato novo; os códigos
--    antigos (PC-0001, FER-0001, ...) ficam como estão. Se o ecrã mostrar um exemplo do
--    código, passa a mostrar PREFIXO-CAT-TIPO-AA-NNNN.
--  * Definir o prefixo (opcional, fase seguinte do ecrã): rpc_ativos_prefixo_definir(
--    p_organization_id, p_prefixo) devolve {organization_id, prefixo, exemplo}; exige
--    ativos.edit nessa organização (42501 sem ela).
--
-- ORDEM DE APLICAÇÃO
--  1. Testes de texto (src/components/ativos/ativosCodigoOrgMigration.test.ts).
--  2. Confirmar supabase/.temp/project-ref = uetjghdkwbywbftedtth e correr
--     `supabase migration list --linked` IMEDIATAMENTE antes: o `db push` aplica TUDO o que
--     estiver pendente. Empurrar a partir de uma pasta que só tenha o que o remoto já tem
--     mais as migrations novas (o ramo feature/rh-pessoas tem migrations antigas por aplicar).
--  3. Esta é independente das outras três da fase 1 (20270130200000, 20270130300000,
--     20270130400000).
--
-- O QUE FAZ
--  0. Guardas: base certa, nomes novos livres, ativos_proximo_codigo como foi lida a 27/11
--     (assinatura e md5 do corpo), regra do contador (prefixo ^[A-Z]{2,4}$) como lida, metadata
--     das organizações em objeto, ATV34 livre.
--  1. ativos_prefixo_org(p_org): metadata->>'ativos_prefixo_codigo' da PRÓPRIA organização
--     se tiver 2 a 4 letras; senão as 4 primeiras letras do nome dela, sem acentos (só letras);
--     último recurso ATV. Sempre em maiúsculas (a regra do contador exige ^[A-Z]{2,4}$).
--     Lido a 27/11 nesta base: nike NIKE, Grupo BMLar GRUP, BMClean BMCL, BM24 BMMA (os
--     algarismos não contam), BMGest BMGE, Mudelar MUDE. Nenhuma tem prefixo definido.
--  2. ativos_cat_tipo(p_grupo, p_tipo): o meio do código (mapa CAT-TIPO do plano).
--  3. ativos_proximo_codigo: MESMA assinatura; o contador passa a ser (organização, prefixo da
--     organização), partilhado por todos os tipos; o ano (AA) é o de hoje em Lisboa e não
--     reinicia a numeração. A unicidade continua só dentro da organização (ATV32 se esgotar).
--     Chamadores: só ativos_criar_interno (rpc_ativo_criar e rpc_hr_equipamento_atribuir);
--     como a assinatura não muda, nenhum parte. ativos_prefixo deixa de ser chamada e FICA.
--  4. rpc_ativos_prefixo_definir: exige ativos.edit; prefixo inválido dá ATV34; faz merge no
--     metadata (nunca o substitui).
--  5. Direitos: internas para ninguém; a rpc só para authenticated.
--  6. Conferir o estado final.
--
-- NOTA: um prefixo definido igual a um prefixo antigo (PC, FER, INS, ...) partilha a linha do
--  contador já existente: a numeração começa a seguir ao valor que lá está (salta números,
--  nunca repete; o ciclo de unicidade salta códigos ocupados).
--
-- ERROS NOVOS: ATV34 prefixo inválido (RAISE 'ATV34' USING ERRCODE = 'P0001').
--
-- COMO SE REVERTE: sem ficheiro de reversão nesta pasta, de propósito.
-- ==============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ---- 0. Guardas (tudo do catálogo com ::text) ----------------------------------------
DO $guardas$
DECLARE
  v_n integer;
BEGIN
  -- G1 Esta é a base de RH (a nike existe aqui) e quem aplica passa a RLS.
  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.id = 'b6ffce4f-f630-4933-833a-008649757a33') THEN
    RAISE EXCEPTION 'G1: a organização nike não existe nesta base. É a base certa?';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname::text = current_user::text AND (r.rolsuper OR r.rolbypassrls)) THEN
    RAISE EXCEPTION 'G1: o papel que aplica (%) não tem BYPASSRLS.', current_user::text;
  END IF;

  -- G2 Os nomes novos estão livres.
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname::text = 'public'
     AND p.proname::text IN ('ativos_prefixo_org', 'ativos_cat_tipo', 'rpc_ativos_prefixo_definir');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'G2: já existem % função(ões) com nomes desta migration. Investigar.', v_n;
  END IF;

  -- G3 ativos_proximo_codigo: uma só sobrecarga, a assinatura e o corpo lidos a 27/11.
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname::text = 'public' AND p.proname::text = 'ativos_proximo_codigo';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'G3: ativos_proximo_codigo tem % sobrecarga(s) (esperada 1).', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
                  WHERE ns.nspname::text = 'public' AND p.proname::text = 'ativos_proximo_codigo'
                    AND pg_get_function_identity_arguments(p.oid)::text = 'p_org uuid, p_grupo text, p_tipo text'
                    AND md5(p.prosrc::text) = '09e818fee62a2977863749dfecbcdbc1') THEN
    RAISE EXCEPTION 'G3: ativos_proximo_codigo não tem a assinatura ou o corpo lidos a 27/11. Ler a versão mais recente antes de aplicar.';
  END IF;

  -- G4 Dependências: funções chamadas, a regra do contador como lida, a permissão e o metadata.
  IF to_regprocedure('public.ativos_hoje()') IS NULL
     OR to_regprocedure('public.ativos_exigir(uuid, text)') IS NULL
     OR to_regclass('public.ativo_codigo_contador') IS NULL THEN
    RAISE EXCEPTION 'G4: falta ativos_hoje, ativos_exigir ou a tabela ativo_codigo_contador.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c
                  WHERE c.conrelid = to_regclass('public.ativo_codigo_contador')
                    AND c.conname::text = 'ativo_codigo_contador_prefixo' AND c.contype::text = 'c'
                    AND md5(pg_get_constraintdef(c.oid)::text) = '847c5482e04d2258ab1b1640e92f1c57') THEN
    RAISE EXCEPTION 'G4: a regra ativo_codigo_contador_prefixo não está como foi lida a 27/11 (^[A-Z]{2,4}$).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions p WHERE p.code = 'ativos.edit') THEN
    RAISE EXCEPTION 'G4: falta a permissão ativos.edit no catálogo.';
  END IF;
  SELECT count(*) INTO v_n FROM public.anew_organizations o
   WHERE o.metadata IS NOT NULL AND jsonb_typeof(o.metadata)::text <> 'object';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'G4: % organização(ões) com metadata que não é um objeto. O merge do prefixo não se pode fazer.', v_n;
  END IF;

  -- G5 Código de erro novo ainda livre.
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname::text = 'public' AND p.prosrc ~ 'ATV34';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'G5: há % função(ões) que já usam ATV34. Escolher outro.', v_n;
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. Prefixo da organização
-- ==============================================================================
CREATE FUNCTION public.ativos_prefixo_org(p_org uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT coalesce(
    -- 1) definido na própria organização (2 a 4 letras)
    (SELECT upper(btrim(o.metadata ->> 'ativos_prefixo_codigo'))
       FROM public.anew_organizations o
      WHERE o.id = p_org
        AND btrim(o.metadata ->> 'ativos_prefixo_codigo') ~ '^[A-Za-z]{2,4}$'),
    -- 2) as 4 primeiras letras do nome dela, sem acentos (algarismos e pontuação não contam)
    (SELECT x.l
       FROM public.anew_organizations o
       CROSS JOIN LATERAL (
         SELECT upper(left(regexp_replace(
                  translate(o.name,
                            'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
                            'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'),
                  '[^A-Za-z]', '', 'g'), 4)) AS l) x
      WHERE o.id = p_org AND length(x.l) >= 2),
    -- 3) último recurso
    'ATV')
$$;

-- ==============================================================================
-- 2. Meio do código: CAT-TIPO
-- ==============================================================================
CREATE FUNCTION public.ativos_cat_tipo(p_grupo text, p_tipo text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_grupo = 'servico' THEN 'MAQ-EQP'
    WHEN p_grupo = 'pessoa' THEN CASE p_tipo
      WHEN 'portatil' THEN 'IT-LAP' WHEN 'telemovel' THEN 'TEL-TLM' WHEN 'viatura' THEN 'VIA-VIA'
      WHEN 'ferramentas' THEN 'FER-FER' ELSE 'OUT-OUT' END
    WHEN p_grupo = 'estrutura' THEN CASE p_tipo
      WHEN 'eletronica' THEN 'IT-ELE' WHEN 'instalacoes' THEN 'EST-INS' WHEN 'mobiliario' THEN 'EST-MOB'
      ELSE 'EST-OUT' END
    ELSE 'OUT-OUT' END
$$;

-- ==============================================================================
-- 3. Próximo código (mesma assinatura): contador da ORGANIZAÇÃO
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.ativos_proximo_codigo(p_org uuid, p_grupo text, p_tipo text)
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_pref text := public.ativos_prefixo_org(p_org);
  v_meio text := public.ativos_cat_tipo(p_grupo, p_tipo);
  v_aa   text := to_char(public.ativos_hoje(), 'YY');
  v_n    integer;
  v_cod  text;
BEGIN
  FOR i IN 1..50 LOOP
    -- contador da ORGANIZAÇÃO (um só para todos os tipos; não reinicia com o ano)
    INSERT INTO public.ativo_codigo_contador AS c (organization_id, prefixo, ultimo)
    VALUES (p_org, v_pref, 1)
    ON CONFLICT (organization_id, prefixo) DO UPDATE SET ultimo = c.ultimo + 1
    RETURNING c.ultimo INTO v_n;
    -- lpad cortaria números com mais de 4 algarismos: só se preenche abaixo de 10000.
    v_cod := v_pref || '-' || v_meio || '-' || v_aa || '-'
             || CASE WHEN v_n < 10000 THEN lpad(v_n::text, 4, '0') ELSE v_n::text END;
    IF NOT EXISTS (SELECT 1 FROM public.ativo a
                    WHERE a.organization_id = p_org AND a.codigo IS NOT NULL AND lower(a.codigo) = lower(v_cod)) THEN
      RETURN v_cod;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'ATV32' USING ERRCODE = 'P0001', DETAIL = 'Não foi possível gerar um código livre. Escreva o código à mão.';
END;
$$;

-- ==============================================================================
-- 4. RPC: definir o prefixo da organização
-- ==============================================================================
CREATE FUNCTION public.rpc_ativos_prefixo_definir(p_organization_id uuid, p_prefixo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pref text;
BEGIN
  -- permissão ANTES de ler ou escrever o que quer que seja
  PERFORM public.ativos_exigir(p_organization_id, 'ativos.edit');

  IF p_prefixo IS NULL OR btrim(p_prefixo) !~ '^[A-Za-z]{2,4}$' THEN
    RAISE EXCEPTION 'ATV34' USING ERRCODE = 'P0001', DETAIL = 'O prefixo tem de ter 2 a 4 letras, sem números nem acentos.';
  END IF;
  v_pref := upper(btrim(p_prefixo));

  -- merge no metadata: as outras chaves (vat, nif, ...) ficam como estão
  UPDATE public.anew_organizations o
     SET metadata = coalesce(o.metadata, '{}'::jsonb) || jsonb_build_object('ativos_prefixo_codigo', v_pref)
   WHERE o.id = p_organization_id
     AND (o.metadata IS NULL OR jsonb_typeof(o.metadata) = 'object');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATV34' USING ERRCODE = 'P0001', DETAIL = 'Não foi possível guardar o prefixo nesta organização.';
  END IF;

  RETURN jsonb_build_object(
    'organization_id', p_organization_id,
    'prefixo', v_pref,
    'exemplo', v_pref || '-IT-LAP-' || to_char(public.ativos_hoje(), 'YY') || '-0001');
END;
$$;

-- ==============================================================================
-- 5. Direitos: internas para ninguém; rpc só para authenticated
-- ==============================================================================
REVOKE ALL ON FUNCTION public.ativos_prefixo_org(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ativos_cat_tipo(text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ativos_proximo_codigo(uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rpc_ativos_prefixo_definir(uuid, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_ativos_prefixo_definir(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.ativos_prefixo_org(uuid) IS
  'Prefixo do código dos ativos da organização: metadata->>ativos_prefixo_codigo (2 a 4 letras) ou as 4 primeiras letras do nome; ATV em último recurso.';
COMMENT ON FUNCTION public.rpc_ativos_prefixo_definir(uuid, text) IS
  'Define o prefixo do código dos ativos da organização (ativos.edit). ATV34: prefixo inválido.';

-- ==============================================================================
-- 6. Conferir o estado final (catálogo lido com ::text)
-- ==============================================================================
DO $conferir$
DECLARE
  v_f record;
  v_n integer;
BEGIN
  -- C1 As funções existem, com o modo de segurança e o search_path vazio.
  FOR v_f IN SELECT * FROM (VALUES
      ('ativos_prefixo_org', 'p_org uuid', false),
      ('ativos_cat_tipo', 'p_grupo text, p_tipo text', false),
      ('ativos_proximo_codigo', 'p_org uuid, p_grupo text, p_tipo text', false),
      ('rpc_ativos_prefixo_definir', 'p_organization_id uuid, p_prefixo text', true)
    ) AS x(nome, args, definer) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
                    WHERE ns.nspname::text = 'public' AND p.proname::text = v_f.nome
                      AND pg_get_function_identity_arguments(p.oid)::text = v_f.args
                      AND p.prosecdef = v_f.definer
                      AND array_to_string(p.proconfig, ',')::text = 'search_path=""') THEN
      RAISE EXCEPTION 'C1: % não ficou como devia (assinatura, SECURITY DEFINER ou search_path).', v_f.nome;
    END IF;
  END LOOP;

  -- C2 Direitos: anon e PUBLIC sem nada; authenticated só na rpc.
  IF has_function_privilege('anon', 'public.rpc_ativos_prefixo_definir(uuid, text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.rpc_ativos_prefixo_definir(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'C2: direitos errados em rpc_ativos_prefixo_definir.';
  END IF;
  FOR v_f IN SELECT * FROM (VALUES
      ('public.ativos_prefixo_org(uuid)'),
      ('public.ativos_cat_tipo(text, text)'),
      ('public.ativos_proximo_codigo(uuid, text, text)')
    ) AS x(sig) LOOP
    IF has_function_privilege('anon', v_f.sig, 'EXECUTE') OR has_function_privilege('authenticated', v_f.sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'C2: % não pode ter EXECUTE para anon nem authenticated.', v_f.sig;
    END IF;
  END LOOP;

  -- C3 O prefixo de todas as organizações cabe na regra do contador; a nike dá NIKE.
  SELECT count(*) INTO v_n FROM public.anew_organizations o
   WHERE public.ativos_prefixo_org(o.id) !~ '^[A-Z]{2,4}$';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'C3: % organização(ões) com um prefixo fora de ^[A-Z]{2,4}$.', v_n;
  END IF;
  IF public.ativos_prefixo_org('b6ffce4f-f630-4933-833a-008649757a33') <> 'NIKE' THEN
    RAISE EXCEPTION 'C3: o prefixo da nike devia ser NIKE.';
  END IF;

  -- C4 O mapa CAT-TIPO responde ao exemplo do plano.
  IF public.ativos_cat_tipo('pessoa', 'portatil') <> 'IT-LAP'
     OR public.ativos_cat_tipo('servico', NULL) <> 'MAQ-EQP'
     OR public.ativos_cat_tipo('estrutura', 'eletronica') <> 'IT-ELE' THEN
    RAISE EXCEPTION 'C4: o mapa CAT-TIPO não responde como o plano.';
  END IF;
END;
$conferir$;

COMMIT;
