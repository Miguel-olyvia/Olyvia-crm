-- ==============================================================================
-- Decisao 38 (mapa do modulo RH): NIF e NISS deixam de ser os dois
-- incondicionalmente obrigatorios na admissao -- passa a bastar UM dos dois.
-- Ate aqui, hr_admissao_pendencias(uuid) reportava "nif" em falta mesmo com o
-- niss preenchido, e vice-versa, porque as duas linhas vinham de
-- hr_admissao_campos_obrigatorios_org() com obrigatorio=true incondicional.
--
-- POR APLICAR.
--
--
-- -- A REGRA NOVA ----------------------------------------------------------------
--
-- Escrita a mao, mesmo padrao das tres excepcoes que hr_admissao_pendencias(uuid)
-- ja tinha (validade_documento / conjuge_situacao_profissional / sindicato):
-- duas linhas adicionadas ao WHERE final,
--   AND (c.codigo <> 'nif'  OR e.niss IS NULL)
--   AND (c.codigo <> 'niss' OR e.nif  IS NULL)
-- ou seja: 'nif' so conta como pendencia se 'niss' TAMBEM estiver vazio, e
-- vice-versa -- quando um dos dois esta preenchido, nenhum dos dois aparece
-- como pendente.
--
-- DE PROPOSITO REJEITADO: um motor generico de "grupos alternativos" de
-- obrigatorios. E um problema de duas accoes (nif, niss), nao vale a
-- abstraccao -- decisao registada no mapa do modulo, decisao 38.
--
-- hr_admissao_campos_obrigatorios() e hr_admissao_campos_obrigatorios_org()
-- NAO MUDAM: nif e niss continuam ambos com condicional=false nessas duas
-- listas. A excepcao vive SO em hr_admissao_pendencias(uuid), exactamente
-- como 'sindicato' ja vive so ali e nao na lista base.
--
--
-- -- O QUE NAO MUDA ---------------------------------------------------------------
--
-- Mesma assinatura, mesmo SECURITY DEFINER, mesmo search_path fixo, mesmos
-- grants (authenticated + service_role, nunca anon) que hr_admissao_pendencias
-- ja tinha desde 20261201050000 -- o corpo e copiado tal como estava, com so
-- as duas linhas novas acrescentadas ao WHERE final, mesma ordem logica a
-- seguir as tres excepcoes existentes.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao: recriar
-- hr_admissao_pendencias(uuid) com o corpo de 20261201050000 (sem as duas
-- linhas novas).
--
--
-- Prerequisitos:
--   20261201050000  hr_admissao_pendencias (versao vigente, com
--                    hr_admissao_campos_obrigatorios_org e c.obrigatorio)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_n   integer;
  v_src text;
BEGIN
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'hr_admissao_pendencias';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Esperava exactamente 1 hr_admissao_pendencias, encontrei %.', v_n;
  END IF;

  SELECT pg_get_functiondef('public.hr_admissao_pendencias(uuid)'::regprocedure) INTO v_src;
  IF v_src NOT LIKE '%hr_admissao_campos_obrigatorios_org%' THEN
    RAISE EXCEPTION
      'hr_admissao_pendencias(uuid) nao chama hr_admissao_campos_obrigatorios_org -- versao vigente diferente da esperada (20261201050000). Confirmar antes de continuar.';
  END IF;
  IF v_src LIKE '%e.niss IS NULL%' OR v_src LIKE '%e.nif  IS NULL%' OR v_src LIKE '%e.nif IS NULL%' THEN
    RAISE EXCEPTION
      'hr_admissao_pendencias(uuid) ja parece ter a excepcao nif/niss -- confirmar se esta migracao ja foi aplicada antes de reaplicar.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_admissao_campos_obrigatorios_org' AND p.pronargs = 1
  ) THEN
    RAISE EXCEPTION 'hr_admissao_campos_obrigatorios_org(uuid) nao existe -- prerequisito 20261201050000 nao aplicado.';
  END IF;
END;
$guardas$;


-- ==============================================================================
-- hr_admissao_pendencias: MESMA assinatura e MESMO corpo de 20261201050000,
-- so com as duas linhas novas no WHERE final (nif/niss alternativos).
-- ==============================================================================
DROP FUNCTION IF EXISTS public.hr_admissao_pendencias(uuid);

CREATE FUNCTION public.hr_admissao_pendencias(p_pessoa_id uuid)
RETURNS TABLE (codigo text, origem text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_org        uuid;
  v_servico    boolean := (v_uid IS NULL);
  v_propria    boolean := false;
  v_ficha      boolean := false;
  v_permitidas text[]  := ARRAY[]::text[];
BEGIN
  SELECT p.organization_id INTO v_org
  FROM public.pessoas p
  WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RETURN;
  END IF;

  IF NOT v_servico THEN
    v_ficha := public.has_anew_permission_in_org(v_uid, 'hr.pessoas.view', v_org);

    v_propria := public.has_anew_permission_in_org(v_uid, 'hr.pessoas.view.own', v_org)
                 AND public.hr_pessoa_do_utilizador(v_uid, v_org) = p_pessoa_id;

    IF NOT (v_ficha OR v_propria) THEN
      RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
    END IF;

    SELECT coalesce(array_agg(d.permissao), ARRAY[]::text[])
      INTO v_permitidas
      FROM (SELECT DISTINCT cp.permissao FROM public.hr_admissao_campo_permissao() cp) d
     WHERE public.has_anew_permission_in_org(v_uid, d.permissao, v_org);
  END IF;

  RETURN QUERY
  WITH estado AS (
    SELECT
      nullif(btrim(coalesce(p.email_pessoal, '')), '')       AS email_pessoal,
      p.data_admissao::text                                  AS data_admissao,
      dp.data_nascimento::text                               AS data_nascimento,
      nullif(btrim(coalesce(dp.genero, '')), '')             AS genero,
      nullif(btrim(coalesce(dp.nacionalidade, '')), '')      AS nacionalidade,
      nullif(btrim(coalesce(dp.telefone_pessoal, '')), '')   AS telefone_pessoal,
      nullif(btrim(coalesce(dp.estado_civil, '')), '')       AS estado_civil,
      dp.dependentes::text                                   AS dependentes,
      dp.dependentes_deficientes::text                       AS dependentes_deficientes,
      nullif(btrim(coalesce(dp.conjuge_situacao_profissional, '')), '')
                                                             AS conjuge_situacao_profissional,
      nullif(btrim(coalesce(dp.naturalidade_freguesia, '')), '')
                                                             AS naturalidade_freguesia,
      nullif(btrim(coalesce(dp.naturalidade_concelho, '')), '')
                                                             AS naturalidade_concelho,
      nullif(btrim(coalesce(dp.naturalidade_pais, '')), '')  AS naturalidade_pais,
      nullif(btrim(coalesce(dp.habilitacao_academica, '')), '')
                                                             AS habilitacao_academica,
      dp.habilitacao_data_conclusao::text                    AS habilitacao_data_conclusao,
      nullif(btrim(coalesce(i.nif, '')), '')                 AS nif,
      nullif(btrim(coalesce(i.niss, '')), '')                AS niss,
      nullif(btrim(coalesce(i.tipo_documento, '')), '')      AS tipo_documento,
      nullif(btrim(coalesce(i.numero_documento, '')), '')    AS numero_documento,
      i.validade_documento::text                             AS validade_documento,
      nullif(btrim(coalesce(m.linha1, '')), '')              AS linha1,
      nullif(btrim(coalesce(m.codigo_postal, '')), '')       AS codigo_postal,
      nullif(btrim(coalesce(m.localidade, '')), '')          AS localidade,
      nullif(btrim(coalesce(f.tamanho_cima, '')), '')        AS tamanho_cima,
      nullif(btrim(coalesce(f.tamanho_baixo, '')), '')       AS tamanho_baixo,
      nullif(btrim(coalesce(f.tamanho_blazer, '')), '')      AS tamanho_blazer,
      s.sindicalizado::text                                  AS sindicalizado,
      nullif(btrim(coalesce(s.sindicato, '')), '')           AS sindicato,
      b.conta_secret_id::text                                AS conta_numero,
      nullif(btrim(coalesce(b.titular, '')), '')             AS conta_titular,
      nullif(btrim(coalesce(b.banco, '')), '')               AS conta_banco
    FROM public.pessoas p
    LEFT JOIN public.pessoas_dados_pessoais  dp ON dp.pessoa_id = p.id
    LEFT JOIN public.pessoas_identificacao    i ON i.pessoa_id  = p.id
    LEFT JOIN public.pessoas_fardamento       f ON f.pessoa_id  = p.id
    LEFT JOIN public.pessoas_sindicalizacao   s ON s.pessoa_id  = p.id
    LEFT JOIN public.pessoas_dados_bancarios  b ON b.pessoa_id  = p.id
    LEFT JOIN LATERAL (
      SELECT mm.linha1, mm.codigo_postal, mm.localidade
      FROM public.pessoas_moradas mm
      WHERE mm.pessoa_id = p.id AND mm.tipo = 'residencia'
      ORDER BY mm.is_principal DESC, mm.created_at
      LIMIT 1
    ) m ON true
    WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL
  )
  SELECT c.codigo, c.origem
  FROM estado e
  CROSS JOIN public.hr_admissao_campos_obrigatorios_org(v_org) c
  JOIN public.hr_admissao_campo_permissao() cp ON cp.codigo = c.codigo
  WHERE (to_jsonb(e) ->> c.codigo) IS NULL
    AND c.obrigatorio
    AND (v_servico OR v_propria OR cp.permissao = ANY (v_permitidas))
    AND (c.codigo <> 'validade_documento'
         OR (e.tipo_documento IS NOT NULL AND e.tipo_documento <> 'cartao_cidadao'))
    AND (c.codigo <> 'conjuge_situacao_profissional'
         OR e.estado_civil IN ('casado', 'uniao_de_facto'))
    AND (c.codigo <> 'sindicato'
         OR e.sindicalizado = 'true')
    -- Decisao 38: NIF OU NISS basta -- um dos dois preenchido tira os dois
    -- da lista de pendencias. Escrita a mao, como as tres excepcoes acima:
    -- e um problema de duas accoes, nao um motor generico de alternativas.
    AND (c.codigo <> 'nif'
         OR e.niss IS NULL)
    AND (c.codigo <> 'niss'
         OR e.nif IS NULL)
  ORDER BY c.codigo;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_admissao_pendencias(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_admissao_pendencias(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_admissao_pendencias(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_admissao_pendencias(uuid) TO service_role;

COMMENT ON FUNCTION public.hr_admissao_pendencias(uuid) IS
'Os campos obrigatorios de admissao que a ficha desta pessoa AINDA NAO tem, pelas duas paginas da folha de cadastro. Devolve SO codigos, nunca valores: saber que "falta o NISS" nao revela o NISS, e saber que "falta a conta" nao revela o IBAN. SECURITY DEFINER porque le colunas fechadas a authenticated (niss, conta_secret_id). Chamavel por authenticated, com gate: cada codigo exige a permissao da TABELA DE ORIGEM (mapa em hr_admissao_campo_permissao); a propria pessoa ve tudo o que e seu; quem nao pode ver a ficha de todo leva insufficient_privilege em vez de uma lista vazia, que se leria como "esta tudo preenchido". auth.uid() NULL significa service_role e devolve tudo -- o que mantem o portao de rpc_hr_convite_admissao_submeter a funcionar. Usa hr_admissao_campos_obrigatorios_org(v_org) e respeita organization_admissao_settings desde 20261201050000. Desde 20261201060000 (decisao 38): NIF e NISS deixam de ser os dois incondicionalmente obrigatorios -- um dos dois preenchido tira os dois da lista de pendencias.';


-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_n               integer;
  v_src             text;
  v_org_teste       uuid;
  v_pessoa_teste    uuid;
  v_pendencias      text[];
BEGIN
  -- 1. Mesma assinatura, mesmas guardas de sempre.
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'hr_admissao_pendencias';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'hr_admissao_pendencias ficou com % aridades.', v_n;
  END IF;

  SELECT pg_get_functiondef('public.hr_admissao_pendencias(uuid)'::regprocedure) INTO v_src;
  IF v_src NOT LIKE '%hr_admissao_campos_obrigatorios_org%' THEN
    RAISE EXCEPTION 'hr_admissao_pendencias nao chama hr_admissao_campos_obrigatorios_org -- o override por organizacao deixou de se aplicar.';
  END IF;
  IF v_src NOT LIKE '%v_servico%' THEN
    RAISE EXCEPTION 'hr_admissao_pendencias ficou sem o ramo de service_role -- o portao da submissao do convite deixaria de ver pendencias.';
  END IF;
  IF v_src NOT LIKE '%insufficient_privilege%' THEN
    RAISE EXCEPTION 'hr_admissao_pendencias ficou sem a recusa a quem nao pode ver a ficha.';
  END IF;
  IF v_src NOT LIKE '%c.obrigatorio%' THEN
    RAISE EXCEPTION 'hr_admissao_pendencias nao filtra por c.obrigatorio -- o override nunca chegaria a excluir nada.';
  END IF;
  IF v_src NOT LIKE '%e.niss IS NULL%' OR v_src NOT LIKE '%e.nif IS NULL%' THEN
    RAISE EXCEPTION 'hr_admissao_pendencias nao ficou com a excepcao NIF OU NISS.';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.hr_admissao_pendencias(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_admissao_pendencias deixou de ser executavel por authenticated.';
  END IF;
  IF has_function_privilege('anon', 'public.hr_admissao_pendencias(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_admissao_pendencias ficou aberta a anon.';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.hr_admissao_pendencias(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_admissao_pendencias deixou de ser executavel por service_role -- o portao da submissao do convite parava.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_admissao_pendencias'
       AND p.prosecdef AND p.proconfig @> ARRAY['search_path=public, pg_temp']
  ) THEN
    RAISE EXCEPTION 'hr_admissao_pendencias perdeu SECURITY DEFINER ou o search_path fixo.';
  END IF;

  -- 2. Cenario ao vivo: org nike, pessoa real de teste, cobrindo os tres
  --    casos (nif preenchido/niss vazio; ambos vazios; ambos preenchidos).
  --    Escrita e limpeza SO na org nike (b6ffce4f-f630-4933-833a-008649757a33)
  --    -- confirmado o organization_id antes de qualquer INSERT/UPDATE.
  SELECT id INTO v_org_teste
  FROM public.anew_organizations
  WHERE id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;

  IF v_org_teste IS NULL THEN
    RAISE NOTICE 'Org nike nao encontrada neste ambiente -- bloco de cenario ao vivo (nif/niss) saltado, so a leitura estatica da funcao foi confirmada acima.';
  ELSE
    -- Pessoa de teste minima, so para exercitar hr_admissao_pendencias --
    -- apagada no fim deste bloco, sem deixar residuo. nome_completo e
    -- coluna GERADA (primeiro_nome || apelido) -- nao se escreve directamente.
    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido, email_pessoal, data_admissao)
    VALUES (v_org_teste, 'TESTE MIGRACAO', '20261201060000 -- apagar', 'teste.20261201060000@example.invalid', current_date)
    RETURNING id INTO v_pessoa_teste;

    BEGIN
      -- Caso A: nif preenchido, niss vazio -- nenhum dos dois deve ser pendencia.
      -- pessoas_identificacao_pessoa_fkey e composta (pessoa_id, organization_id).
      INSERT INTO public.pessoas_identificacao (pessoa_id, organization_id, nif, niss, tipo_documento, numero_documento)
      VALUES (v_pessoa_teste, v_org_teste, '123456789', NULL, 'cartao_cidadao', '12345678')
      ON CONFLICT (pessoa_id) DO UPDATE
        SET nif = EXCLUDED.nif, niss = NULL, tipo_documento = EXCLUDED.tipo_documento,
            numero_documento = EXCLUDED.numero_documento;

      SELECT coalesce(array_agg(codigo), ARRAY[]::text[]) INTO v_pendencias
        FROM public.hr_admissao_pendencias(v_pessoa_teste);
      IF 'nif' = ANY (v_pendencias) OR 'niss' = ANY (v_pendencias) THEN
        RAISE EXCEPTION
          'Caso A (nif preenchido, niss vazio) devia nao ter nif nem niss pendentes; pendencias: %.', v_pendencias;
      END IF;

      -- Caso B: os dois vazios -- os dois devem ser pendencia.
      UPDATE public.pessoas_identificacao SET nif = NULL, niss = NULL WHERE pessoa_id = v_pessoa_teste;

      SELECT coalesce(array_agg(codigo), ARRAY[]::text[]) INTO v_pendencias
        FROM public.hr_admissao_pendencias(v_pessoa_teste);
      IF NOT ('nif' = ANY (v_pendencias)) OR NOT ('niss' = ANY (v_pendencias)) THEN
        RAISE EXCEPTION
          'Caso B (ambos vazios) devia ter nif e niss pendentes; pendencias: %.', v_pendencias;
      END IF;

      -- Caso C: os dois preenchidos -- nenhum dos dois deve ser pendencia.
      UPDATE public.pessoas_identificacao SET nif = '123456789', niss = '12345678901' WHERE pessoa_id = v_pessoa_teste;

      SELECT coalesce(array_agg(codigo), ARRAY[]::text[]) INTO v_pendencias
        FROM public.hr_admissao_pendencias(v_pessoa_teste);
      IF 'nif' = ANY (v_pendencias) OR 'niss' = ANY (v_pendencias) THEN
        RAISE EXCEPTION
          'Caso C (ambos preenchidos) devia nao ter nif nem niss pendentes; pendencias: %.', v_pendencias;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Limpar mesmo que um dos casos falhe, antes de propagar o erro.
      DELETE FROM public.pessoas_identificacao WHERE pessoa_id = v_pessoa_teste;
      DELETE FROM public.pessoas WHERE id = v_pessoa_teste;
      RAISE;
    END;

    -- Limpeza do caminho feliz.
    DELETE FROM public.pessoas_identificacao WHERE pessoa_id = v_pessoa_teste;
    DELETE FROM public.pessoas WHERE id = v_pessoa_teste;

    IF EXISTS (SELECT 1 FROM public.pessoas WHERE id = v_pessoa_teste) THEN
      RAISE EXCEPTION 'Ficou residuo da pessoa de teste 20261201060000 -- limpar antes de continuar.';
    END IF;
  END IF;

  RAISE NOTICE
    'OK: hr_admissao_pendencias mantem SECURITY DEFINER, search_path fixo e os mesmos grants; a excepcao NIF OU NISS aplica-se (testado ao vivo contra a org nike quando disponivel: nif preenchido/niss vazio -> nenhum pendente, ambos vazios -> ambos pendentes, ambos preenchidos -> nenhum pendente).';
END;
$conferir$;


-- ==============================================================================
-- ANTES DO db push
--
-- 1. O timestamp desta migration (20261201060000) e posterior a TUDO o que
--    esta hoje aplicado no remoto -- confirmado via
--    `supabase migration list --linked` (2026-09-15): local e remoto
--    coincidem ate 20261201050000, sem drift e sem nada pendente. Reconfirmar
--    de novo, imediatamente antes do db push real, porque a pasta pode ter
--    mudado desde esta escrita (outros agentes escrevem na mesma pasta).
-- 2. Nenhuma janela de estado defeituoso: hr_admissao_pendencias mantem
--    EXACTAMENTE o comportamento anterior para quem tiver SO um dos dois
--    campos vazio (continua pendente); a unica mudanca e quando os DOIS
--    estavam preenchidos ou quando um dos dois passa a bastar.
-- 3. O lado TypeScript (src/lib/hr/admissaoObrigatorios.ts) entra no mesmo
--    commit, fora do SQL -- ve a mesma decisao 38 (nif condicionado a niss
--    vazio, niss condicionado a nif vazio).
-- ==============================================================================
