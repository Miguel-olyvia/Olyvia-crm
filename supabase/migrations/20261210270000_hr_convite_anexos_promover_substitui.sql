-- ==============================================================================
-- Anexos pelo RH (3/3): quando a pessoa submete o convite, o ficheiro do convite
-- SUBSTITUI o que o RH ja tinha anexado do mesmo tipo (decisao D1-A).
--
-- POR APLICAR.
--
-- PRECISA DE CODIGO NOVO. So faz sentido com os anexos do RH (20261210250000 e
-- 20261210260000) e, portanto, com a Edge Function hr-anexo-rh e o ecra novo;
-- publicar tudo junto: db push, deploy de hr-anexo-rh, ecra. Sozinha, esta
-- migration nao muda nada enquanto nao houver anexos do RH: o bloco novo so
-- encontra promovidos ja existentes quando o convite traz ficheiros do mesmo tipo.
--
--
-- -- O PROBLEMA -----------------------------------------------------------------
--
-- Os limites por pessoa sao 1 fotografia, 1 comprovativo de IBAN e 2 cartoes de
-- cidadao. Se o RH ja anexou a fotografia e a pessoa submete o convite com outra,
-- hr_convite_anexos_promover promovia os dois e a ficha ficava acima do limite
-- (e o avatar a apontar para o ultimo).
--
--
-- -- O QUE FAZ ------------------------------------------------------------------
--
-- Redefine hr_convite_anexos_promover(uuid) a partir da versao MAIS RECENTE, a de
-- 20261210070000 (nenhuma outra migration a redefine: confirmado por leitura no
-- repositorio e na copia renumerada do branch). E a copia integral com UMA mudanca:
-- antes de promover os ligados do convite, por cada tipo que o convite traz, os
-- promovidos ja existentes da pessoa que passariam o limite (os MAIS ANTIGOS
-- primeiro) passam a apagado, motivo 'substituido', apagado_por NULL (foi o
-- sistema, nao um utilizador). O mais recente ganha: os limites 1, 1 e 2 ficam
-- sempre verdadeiros e o avatar e sempre o ultimo.
--
-- Mantem a subtransaccao EXCEPTION WHEN OTHERS: nunca parte a admissao. Em falha,
-- tudo o que esta funcao fez (incluindo as substituicoes) desfaz-se e os anexos
-- ficam em ligado; a limpeza diaria volta a tentar (passo d de
-- hr_convite_anexos_limpar). Os objectos dos substituidos saem do Storage pela
-- limpeza existente (linha apagada com objecto_removido_em nulo).
--
-- O bloco novo comeca por bloquear a pessoa (FOR NO KEY UPDATE), na mesma ordem das
-- RPCs do RH (pessoa, anexo, substituto): sem isso, uma submissao do convite e uma
-- reserva ou promocao do RH sobre a mesma ficha corriam em paralelo (as duas liam os
-- mesmos promovidos e nao se viam) e podiam bloquear-se uma a outra em ordens
-- trocadas. O que fica apagado perde nome_original (passa a 'apagado') e hash_sha256
-- (NULL), como no remover do RH; ficam apagado_em e o motivo.
--
-- O bloco novo esta delimitado pelas marcas D1-A: o teste de texto confirma que o
-- resto do corpo e IGUAL ao de 20261210070000.
--
--
-- -- A LER COM ATENCAO ANTES DO PUSH -------------------------------------------
--
-- a) hr_convite_anexos_promover e codigo partilhado com a admissao da Mudelar
--    (corre dentro de rpc_hr_convite_admissao_submeter). Sem anexos do RH, o
--    bloco novo nao encontra nada para substituir e o comportamento e o de antes.
--    Dizer ao utilizador o que muda para a Mudelar (nada, sem anexos do RH) e
--    esperar autorizacao antes de publicar.
-- b) E uma funcao INTERNA: sem EXECUTE para ninguem, tal como em 20261210070000.
-- c) A promocao repetida pela limpeza (passo d) tambem substitui: se o RH anexou
--    uma fotografia nova entretanto, a do convite que ficou por promover e a que
--    a substitui. E raro (so acontece se a promocao falhou) e e o mesmo criterio.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito (uma reversao na pasta e
-- aplicada pelo db push). A mao: repor hr_convite_anexos_promover com a definicao de
-- 20261210070000.
--
-- Prerequisitos:
--   20261210070000  hr_convite_anexos_promover (a versao de que esta parte)
--   20261210250000  pessoas_anexos.origem e apagado_por
--   20261210260000  os anexos do RH (a razao de ser desta migration)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_anexos' AND column_name = 'origem'
  ) THEN
    RAISE EXCEPTION 'pessoas_anexos.origem nao existe. Aplicar 20261210250000 primeiro.';
  END IF;

  -- A versao vigente tem de ser a de 20261210070000: e dela que esta migration parte.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_convite_anexos_promover' AND p.pronargs = 1
       AND p.prosrc LIKE '%upload_abandonado%'
       AND p.prosrc LIKE '%EXCEPTION WHEN OTHERS%'
       AND p.prosrc LIKE '%anexo_comprovativo_iban%'
  ) THEN
    RAISE EXCEPTION 'hr_convite_anexos_promover(uuid) com a subtransaccao de 20261210070000 nao existe. Aplicar 20261210070000 primeiro.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_convite_anexos_promover' AND p.pronargs = 1
       AND p.prosrc LIKE '%substituido%'
  ) THEN
    RAISE NOTICE 'hr_convite_anexos_promover ja substitui os anexos do RH; esta migration volta a escreve-la, sem diferenca.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. hr_convite_anexos_promover (interna) -- a versao de 20261210070000 mais o
--    bloco D1-A
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_convite_anexos_promover(p_convite_id uuid)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_org     uuid;
  v_pessoa  uuid;
  v_n       integer := 0;
  v_foto    uuid;
  v_cartao  boolean := false;
  v_iban    boolean := false;
BEGIN
  SELECT c.organization_id, c.pessoa_id
    INTO v_org, v_pessoa
    FROM public.pessoas_convites_admissao c
   WHERE c.id = p_convite_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- O que ficou a meio (URL emitido, nunca confirmado) nao entra na ficha.
  UPDATE public.pessoas_anexos
     SET estado         = 'apagado',
         apagado_em     = now(),
         apagado_motivo = 'upload_abandonado'
   WHERE convite_id = p_convite_id
     AND estado = 'pendente';

  -- >>> D1-A inicio
  -- O mais recente ganha. Por cada tipo que o convite traz, os promovidos ja
  -- existentes da pessoa (do RH ou de um convite anterior) que passariam o limite
  -- (fotografia 1, comprovativo 1, cartao 2) passam a apagado, substituido, os mais
  -- antigos primeiro. apagado_por fica NULL: foi o sistema. Um tipo que o convite
  -- nao traz nao se toca. O avatar passa para a fotografia nova mais abaixo.
  DECLARE
    v_tipo        text;
    v_novos       integer;
    v_limite      integer;
    v_existentes  integer;
    v_excesso     integer;
  BEGIN
    -- A pessoa primeiro, como reservar, promover e remover do RH (pessoa, anexo,
    -- substituto): serializa esta promocao com as do RH sobre a mesma ficha, e os
    -- promovidos que se contam abaixo ja nao mudam por baixo. FOR NO KEY UPDATE (e
    -- nao FOR UPDATE) para nao travar quem insere linhas que apontam para a pessoa.
    PERFORM 1 FROM public.pessoas WHERE id = v_pessoa FOR NO KEY UPDATE;

    FOR v_tipo, v_novos IN
      SELECT a.tipo, count(*)::integer
        FROM public.pessoas_anexos a
       WHERE a.convite_id = p_convite_id
         AND a.estado = 'ligado'
       GROUP BY a.tipo
    LOOP
      v_limite := CASE v_tipo
        WHEN 'cartao_cidadao'     THEN 2
        WHEN 'comprovativo_iban'  THEN 1
        WHEN 'fotografia'         THEN 1
      END;

      SELECT count(*) INTO v_existentes
        FROM public.pessoas_anexos x
       WHERE x.pessoa_id = v_pessoa
         AND x.organization_id = v_org
         AND x.tipo = v_tipo
         AND x.estado = 'promovido';

      v_excesso := v_existentes + v_novos - v_limite;

      IF v_excesso > 0 THEN
        UPDATE public.pessoas_anexos
           SET estado         = 'apagado',
               apagado_em     = now(),
               apagado_motivo = 'substituido',
               nome_original  = 'apagado',
               hash_sha256    = NULL
         WHERE id IN (
           SELECT x.id
             FROM public.pessoas_anexos x
            WHERE x.pessoa_id = v_pessoa
              AND x.organization_id = v_org
              AND x.tipo = v_tipo
              AND x.estado = 'promovido'
            ORDER BY coalesce(x.promovido_em, x.criado_em), x.id
            LIMIT v_excesso
         );
      END IF;
    END LOOP;
  END;
  -- <<< D1-A fim

  -- Os ligados passam a fazer parte da ficha. O convite_id fica: e o historico.
  WITH promovidos AS (
    UPDATE public.pessoas_anexos
       SET estado       = 'promovido',
           promovido_em = now()
     WHERE convite_id = p_convite_id
       AND estado = 'ligado'
    RETURNING id, tipo
  )
  SELECT count(*),
         (array_agg(id) FILTER (WHERE tipo = 'fotografia'))[1],
         coalesce(bool_or(tipo = 'cartao_cidadao'), false),
         coalesce(bool_or(tipo = 'comprovativo_iban'), false)
    INTO v_n, v_foto, v_cartao, v_iban
    FROM promovidos;

  -- A fotografia passa pelo trigger de integridade (so aceita uma fotografia
  -- promovida desta pessoa e organizacao).
  IF v_foto IS NOT NULL THEN
    UPDATE public.pessoas
       SET fotografia_anexo_id = v_foto
     WHERE id = v_pessoa
       AND organization_id = v_org;
  END IF;

  -- O cartao e o comprovativo ficam auditados, como o NISS no convite (origem
  -- service_role). A fotografia nunca se audita.
  IF v_cartao THEN
    PERFORM public.hr_registar_acesso_sensivel(v_pessoa, v_org, 'anexo_cartao_cidadao', 'alterar');
  END IF;
  IF v_iban THEN
    PERFORM public.hr_registar_acesso_sensivel(v_pessoa, v_org, 'anexo_comprovativo_iban', 'alterar');
  END IF;

  RETURN v_n;
EXCEPTION WHEN OTHERS THEN
  -- A promocao corre dentro de submeter, na mesma transaccao: sem este bloco, uma
  -- falha aqui (o trigger da fotografia, o CHECK da auditoria que uma migration
  -- futura pode reescrever sem os anexos) desfazia a admissao INTEIRA (NIF, NISS,
  -- IBAN, assinatura) por causa de ficheiros. O bloco e uma subtransaccao: o que a
  -- promocao tinha feito ate ao erro desfaz-se, os anexos ficam em `ligado` (ligados
  -- ao convite ja usado, invisiveis na ficha) e a admissao segue. So se regista o
  -- convite e o erro; nunca dados da pessoa. A promocao volta a tentar-se na
  -- limpeza diaria (hr_convite_anexos_limpar, passo d), que e idempotente.
  RAISE WARNING 'hr_convite_anexos_promover falhou para o convite % (SQLSTATE %): %', p_convite_id, SQLSTATE, SQLERRM;
  RETURN 0;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_convite_anexos_promover(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_convite_anexos_promover(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.hr_convite_anexos_promover(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.hr_convite_anexos_promover(uuid) FROM service_role;

COMMENT ON FUNCTION public.hr_convite_anexos_promover(uuid) IS
'INTERNA: sem EXECUTE para ninguem, so corre dentro de rpc_hr_convite_admissao_submeter (como dono) e na limpeza (hr_convite_anexos_limpar, passo d). Promove os anexos ligados do convite (convite_id fica como historico), abandona os pendentes, aponta a ficha para a fotografia e audita o cartao de cidadao e o comprovativo de IBAN (origem service_role). ANTES de promover, o ficheiro do convite SUBSTITUI o que ja estava promovido do mesmo tipo (do RH ou de um convite anterior) quando passaria o limite (fotografia 1, comprovativo 1, cartao 2): os mais antigos ficam apagados, motivo substituido, apagado_por NULL, nome_original apagado e hash NULL; antes disso bloqueia a pessoa (FOR NO KEY UPDATE) na ordem das RPCs do RH. NUNCA parte a admissao: corre numa subtransaccao (EXCEPTION WHEN OTHERS); em qualquer falha desfaz o que tinha feito, deixa os anexos em ligado, regista um RAISE WARNING com o convite e o SQLSTATE (nunca dados da pessoa) e devolve 0. Idempotente: a limpeza volta a tenta-la. Devolve quantos promoveu. Desde 20261210070000; substituicao desde 20261210270000.';

-- ==============================================================================
-- Conferir (estrutura)
-- ==============================================================================
DO $conferir$
DECLARE
  v_corpo text;
  v_n     integer;
BEGIN
  -- Uma so funcao (uma segunda candidata deixa a chamada ambigua).
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'hr_convite_anexos_promover';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Esperava-se 1 funcao hr_convite_anexos_promover; ha %.', v_n;
  END IF;

  SELECT p.prosrc INTO v_corpo
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'hr_convite_anexos_promover';

  -- A promocao tem a sua subtransaccao: nunca parte a admissao.
  IF v_corpo NOT LIKE '%EXCEPTION WHEN OTHERS%' THEN
    RAISE EXCEPTION 'hr_convite_anexos_promover devia isolar a promocao numa subtransaccao (EXCEPTION WHEN OTHERS).';
  END IF;

  -- Levou o bloco novo e nao perdeu nada da versao anterior.
  IF v_corpo NOT LIKE '%substituido%' OR v_corpo NOT LIKE '%upload_abandonado%'
     OR v_corpo NOT LIKE '%fotografia_anexo_id%' OR v_corpo NOT LIKE '%anexo_cartao_cidadao%'
     OR v_corpo NOT LIKE '%anexo_comprovativo_iban%' OR v_corpo NOT LIKE '%hr_registar_acesso_sensivel%' THEN
    RAISE EXCEPTION 'hr_convite_anexos_promover perdeu algo da versao anterior ou nao substitui os anexos do RH.';
  END IF;

  -- Interna: ninguem a pode executar por fora.
  IF has_function_privilege('anon', 'public.hr_convite_anexos_promover(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.hr_convite_anexos_promover(uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.hr_convite_anexos_promover(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_convite_anexos_promover e interna: ninguem a pode executar por fora.';
  END IF;

  -- Executada com um convite inexistente: nao faz nada.
  IF public.hr_convite_anexos_promover('00000000-0000-0000-0000-000000000000'::uuid) <> 0 THEN
    RAISE EXCEPTION 'promover de um convite inexistente devia devolver 0.';
  END IF;

  RAISE NOTICE 'OK: hr_convite_anexos_promover com a substituicao do RH, a subtransaccao mantida e sem EXECUTE para ninguem.';
END;
$conferir$;

-- ==============================================================================
-- Conferir (ao vivo, so na organizacao nike): uma pessoa com anexos do RH e um
-- convite que traz outros do mesmo tipo; DESFAZ tudo com a sentinela HR900.
-- ==============================================================================
DO $conferir_vivo$
DECLARE
  v_org_nike  uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
  v_cargo     uuid;
  v_nome      text;
  v_hash      text;
  v_pessoa    uuid;
  v_convite   uuid;
  v_foto_rh   uuid;
  v_cartao1   uuid;
  v_cartao2   uuid;
  v_foto_conv uuid;
  v_cartao3   uuid;
  v_iban      uuid;
  v_n         integer;
  v_estado    text;
  v_motivo    text;
  v_por       uuid;
  v_avatar    uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations WHERE id = v_org_nike) THEN
    RAISE NOTICE 'Org nike nao encontrada neste ambiente -- o conferir ao vivo da substituicao do convite foi saltado.';
    RETURN;
  END IF;

  BEGIN
    -- Escritas SO na nike (organization_id confirmado acima).
    -- O trigger de cargos (20261210110000, HRC08) recusa uma ficha sem cargo: fabrica-se
    -- primeiro um cargo activo de teste na nike, com nome unico (hr_cargo_nome_chave,
    -- 20261210160000). Desfeito com tudo o resto pela sentinela HR900.
    INSERT INTO public.hr_cargos (organization_id, nome, salario_base, periodicidade)
    VALUES (v_org_nike, 'TESTE MIGRACAO cargo 20261210270000 ' || gen_random_uuid()::text, 0, 'mensal')
    RETURNING id INTO v_cargo;

    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido, cargo_id, data_admissao)
    VALUES (v_org_nike, 'TESTE MIGRACAO', '20261210270000 -- apagar', v_cargo, current_date)
    RETURNING id INTO v_pessoa;

    -- O que o RH ja tinha anexado: uma fotografia (o avatar) e dois cartoes. Os
    -- caminhos sao ficticios (nao ha objectos de Storage neste teste).
    INSERT INTO public.pessoas_anexos
      (organization_id, pessoa_id, tipo, estado, bucket, caminho, nome_original,
       mime_type, tamanho_bytes, hash_sha256, ligado_em, promovido_em, criado_em, origem, carregado_por)
    VALUES
      (v_org_nike, v_pessoa, 'fotografia', 'promovido', 'hr-documentos', 'teste-20261210270000/rh-foto.png', 'foto.png',
       'image/png', 100, repeat('1', 64), now(), now(), now() - interval '3 days', 'rh', gen_random_uuid())
    RETURNING id INTO v_foto_rh;
    INSERT INTO public.pessoas_anexos
      (organization_id, pessoa_id, tipo, estado, bucket, caminho, nome_original,
       mime_type, tamanho_bytes, hash_sha256, ligado_em, promovido_em, criado_em, origem, carregado_por)
    VALUES
      (v_org_nike, v_pessoa, 'cartao_cidadao', 'promovido', 'hr-documentos', 'teste-20261210270000/rh-cartao1.pdf', 'c1.pdf',
       'application/pdf', 100, repeat('2', 64), now(), now() - interval '3 days', now() - interval '3 days', 'rh', gen_random_uuid())
    RETURNING id INTO v_cartao1;
    INSERT INTO public.pessoas_anexos
      (organization_id, pessoa_id, tipo, estado, bucket, caminho, nome_original,
       mime_type, tamanho_bytes, hash_sha256, ligado_em, promovido_em, criado_em, origem, carregado_por)
    VALUES
      (v_org_nike, v_pessoa, 'cartao_cidadao', 'promovido', 'hr-documentos', 'teste-20261210270000/rh-cartao2.pdf', 'c2.pdf',
       'application/pdf', 100, repeat('3', 64), now(), now() - interval '2 days', now() - interval '2 days', 'rh', gen_random_uuid())
    RETURNING id INTO v_cartao2;
    UPDATE public.pessoas SET fotografia_anexo_id = v_foto_rh WHERE id = v_pessoa;

    -- O convite traz uma fotografia, um cartao e um comprovativo (todos ligados).
    INSERT INTO public.pessoas_convites_admissao (pessoa_id, organization_id, token_hash, email_destino, valid_until)
    VALUES (v_pessoa, v_org_nike, encode(sha256(convert_to('conferir-270-a', 'UTF8')), 'hex'),
            'a.20261210270000@example.invalid', now() + interval '1 day')
    RETURNING id INTO v_convite;
    INSERT INTO public.pessoas_anexos
      (organization_id, pessoa_id, convite_id, tipo, estado, bucket, caminho, nome_original,
       mime_type, tamanho_bytes, hash_sha256, ligado_em)
    VALUES
      (v_org_nike, v_pessoa, v_convite, 'fotografia', 'ligado', 'hr-documentos', 'teste-20261210270000/c-foto.png', 'foto2.png',
       'image/png', 100, repeat('4', 64), now())
    RETURNING id INTO v_foto_conv;
    INSERT INTO public.pessoas_anexos
      (organization_id, pessoa_id, convite_id, tipo, estado, bucket, caminho, nome_original,
       mime_type, tamanho_bytes, hash_sha256, ligado_em)
    VALUES
      (v_org_nike, v_pessoa, v_convite, 'cartao_cidadao', 'ligado', 'hr-documentos', 'teste-20261210270000/c-cartao.pdf', 'c3.pdf',
       'application/pdf', 100, repeat('5', 64), now())
    RETURNING id INTO v_cartao3;
    INSERT INTO public.pessoas_anexos
      (organization_id, pessoa_id, convite_id, tipo, estado, bucket, caminho, nome_original,
       mime_type, tamanho_bytes, hash_sha256, ligado_em)
    VALUES
      (v_org_nike, v_pessoa, v_convite, 'comprovativo_iban', 'ligado', 'hr-documentos', 'teste-20261210270000/c-iban.pdf', 'iban.pdf',
       'application/pdf', 100, repeat('6', 64), now())
    RETURNING id INTO v_iban;

    v_n := public.hr_convite_anexos_promover(v_convite);
    IF v_n <> 3 THEN
      RAISE EXCEPTION 'promover devia devolver 3 (os tres ligados do convite); devolveu %.', v_n USING ERRCODE = 'HR961';
    END IF;

    -- A fotografia do RH foi substituida pela do convite, pelo sistema.
    SELECT estado, apagado_motivo, apagado_por INTO v_estado, v_motivo, v_por
      FROM public.pessoas_anexos WHERE id = v_foto_rh;
    IF v_estado <> 'apagado' OR v_motivo <> 'substituido' OR v_por IS NOT NULL THEN
      RAISE EXCEPTION 'a fotografia do RH devia ficar apagada (substituido) com apagado_por NULL; esta % (%).', v_estado, v_motivo
        USING ERRCODE = 'HR961';
    END IF;
    SELECT nome_original, hash_sha256 INTO v_nome, v_hash FROM public.pessoas_anexos WHERE id = v_foto_rh;
    IF v_nome IS DISTINCT FROM 'apagado' OR v_hash IS NOT NULL THEN
      RAISE EXCEPTION 'a fotografia substituida devia perder nome e hash; ficou % / %.', v_nome, v_hash USING ERRCODE = 'HR961';
    END IF;
    SELECT fotografia_anexo_id INTO v_avatar FROM public.pessoas WHERE id = v_pessoa;
    IF v_avatar IS DISTINCT FROM v_foto_conv THEN
      RAISE EXCEPTION 'o avatar devia apontar para a fotografia do convite.' USING ERRCODE = 'HR961';
    END IF;
    SELECT count(*) INTO v_n FROM public.pessoas_anexos
     WHERE pessoa_id = v_pessoa AND tipo = 'fotografia' AND estado = 'promovido';
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'devia haver exactamente 1 fotografia promovida; ha %.', v_n USING ERRCODE = 'HR961';
    END IF;

    -- Dois cartoes no maximo: o mais antigo saiu, o mais recente do RH ficou.
    SELECT estado, apagado_motivo, nome_original INTO v_estado, v_motivo, v_nome
      FROM public.pessoas_anexos WHERE id = v_cartao1;
    IF v_estado <> 'apagado' OR v_motivo <> 'substituido' OR v_nome IS DISTINCT FROM 'apagado' THEN
      RAISE EXCEPTION 'o cartao mais antigo do RH devia ficar apagado (substituido); esta % (%).', v_estado, v_motivo
        USING ERRCODE = 'HR961';
    END IF;
    SELECT count(*) INTO v_n FROM public.pessoas_anexos
     WHERE pessoa_id = v_pessoa AND tipo = 'cartao_cidadao' AND estado = 'promovido'
       AND id IN (v_cartao2, v_cartao3);
    IF v_n <> 2 THEN
      RAISE EXCEPTION 'o cartao mais recente do RH e o do convite deviam ficar promovidos; ficaram %.', v_n USING ERRCODE = 'HR961';
    END IF;

    -- O comprovativo nao tinha nenhum: nada foi substituido.
    IF (SELECT estado FROM public.pessoas_anexos WHERE id = v_iban) <> 'promovido' THEN
      RAISE EXCEPTION 'o comprovativo do convite devia ficar promovido.' USING ERRCODE = 'HR961';
    END IF;

    -- Repetir nao faz nada (idempotente).
    IF public.hr_convite_anexos_promover(v_convite) <> 0 THEN
      RAISE EXCEPTION 'promover uma segunda vez devia devolver 0.' USING ERRCODE = 'HR961';
    END IF;

    RAISE EXCEPTION 'teste_hr_convite_anexos_promover_substitui_20261210270000_ok' USING ERRCODE = 'HR900';
  EXCEPTION
    WHEN SQLSTATE 'HR900' THEN
      NULL; -- sucesso: tudo desfeito pela subtransaccao.
    WHEN OTHERS THEN
      RAISE EXCEPTION 'O conferir ao vivo da substituicao do convite falhou -- SQLSTATE %: %', SQLSTATE, SQLERRM;
  END;

  RAISE NOTICE 'CONFERIR AO VIVO (nike): o convite substitui a fotografia do RH (avatar para a nova), o cartao mais antigo cai para ficarem dois, o comprovativo sem anexo previo entra, e repetir nao faz nada. Tudo desfeito.';
END;
$conferir_vivo$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. PRECISA DE CODIGO NOVO: ver o cabecalho. Ordem: db push das tres migrations,
--    deploy de hr-anexo-rh, ecra.
--
-- 2. Listar o que esta pendente IMEDIATAMENTE antes do push
--    (supabase migration list --linked): o push aplica TUDO o que estiver na
--    pasta, por ordem. Confirmar com pg_get_functiondef no remoto que a versao
--    vigente de hr_convite_anexos_promover e a de 20261210070000 (a guarda da
--    migration tambem o exige).
--
-- 3. hr_convite_anexos_promover e codigo partilhado com a admissao da Mudelar: sem
--    anexos do RH nada muda para ela, mas e codigo partilhado. Dizer ao utilizador
--    o que muda para a Mudelar (nada, sem anexos do RH) e esperar autorizacao.
--
-- 4. Depois do push NAO se volta atras para demonstrar um vermelho.
-- ==============================================================================
