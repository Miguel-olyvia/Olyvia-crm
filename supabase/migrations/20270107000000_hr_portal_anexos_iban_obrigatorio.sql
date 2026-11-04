-- ==============================================================================
-- 20270107000000_hr_portal_anexos_iban_obrigatorio.sql   (carimbo PROVISORIO)
--
-- RH, portal de admissao: o comprovativo de IBAN passa a ser OBRIGATORIO quando
-- a pessoa indicou um IBAN, e as 4 RPCs de anexos passam a exigir a sessao OTP
-- e o estado do processo. Cartao de cidadao e fotografia ficam FECHADOS.
--
-- Base: RH (uetjghdkwbywbftedtth), a partir do worktree rh-pessoas (confirmar
-- supabase/.temp/project-ref). NUNCA a principal, NUNCA a Mudelar.
-- Plano: plano-iban-anexos.md (job bbc4f3a6), seccoes 1 e 2.
--
--
-- !!! PRECISA DE CODIGO NOVO NO MESMO ENVIO -- NAO APLICAR SOZINHA !!! ----------
--
--  1. Edge convite-admissao NOVA (so no projecto RH): sessao lida antes dos
--     anexos; p_sessao_hash nas 4 chamadas de accoesAnexos.ts; sai o 410 dos
--     anexos; codigos novos anexos_em_falta (409), anexo_tipo_bloqueado (409),
--     anexo_conteudo_recusado (422); HRA86 traduzido para anexos_em_falta.
--  2. Ecra novo do portal (ConviteAnexosCard no PortalFormulario, linha do
--     comprovativo com "Obrigatorio", resumo de falta antes de submeter).
--
--  O QUE PARTE NO INTERVALO ENTRE O db push E O DEPLOY DA EDGE E DO ECRA:
--  o submeter passa a recusar (HRA86 anexos_em_falta) quem indicou IBAN e nao
--  tem comprovativo ligado, e o portal continua a responder 410 a todas as
--  accoes de anexos ate a Edge nova estar publicada. Ou seja: QUEM INDICOU
--  IBAN NAO CONSEGUE SUBMETER ate a Edge e o ecra novos estarem publicados.
--  As 4 RPCs antigas deixam de existir no push; a Edge publicada nao as chama
--  (responde 410 antes), por isso nada mais parte.
--  Ordem: testes na nike (transaccao desfeita) ANTES do push -> migration list
--  --linked -> db push --linked -> deploy da Edge so no projecto RH -> ecra.
--
--
-- -- O QUE MUDA ----------------------------------------------------------------
--
--  Novas (internas, sem EXECUTE para nenhum papel, nao SECURITY DEFINER: so
--  correm dentro das RPCs SECURITY DEFINER, como hr_convite_sessao_exigir):
--   hr_convite_anexos_abrir(p_token_hash text, p_sessao_hash text,
--     p_exigir_sessao boolean, OUT o_id uuid, OUT o_organization_id uuid,
--     OUT o_pessoa_id uuid, OUT o_estado text, OUT o_devolucao jsonb)
--     convite FOR UPDATE; HRA31; HRA02 (encerrado ou usado), HRA03, HRA04,
--     HRA05; sessao (HRA51/52/53) salvo p_exigir_sessao = false explicito;
--     HRA38 fora de em_preenchimento e devolvida.
--   hr_convite_comprovativo_iban_em_falta(p_convite_id uuid, p_estado text)
--     RETURNS boolean. A REGRA UNICA (submeter, reservar/contexto/ligar,
--     leitura do portal). Sem IBAN (iban_segredo_id nulo) = false. Em
--     devolvida, se o RH devolveu o campo iban ou o documento
--     comprovativo_iban: exige um comprovativo 'ligado' deste convite e
--     organizacao com ligado_em posterior ao ultimo evento 'devolvido'. Nos
--     outros casos aceita 'ligado' ou 'promovido' deste convite e organizacao.
--     DESVIO AO PLANO: recebe o estado. O submeter avalia-a DEPOIS do UPDATE de
--     used_at, e o trigger hr_convite_admissao_used_at_transitorio ja passou o
--     processo a 'submetida' nesse momento; lida da tabela, a regra perdia o
--     ramo 'devolvida'. Quem chama passa o estado lido com FOR UPDATE.
--
--  As 4 RPCs (DROP da assinatura antiga e CREATE da nova, na mesma migration;
--  so service_role; SECURITY DEFINER; search_path vazio):
--   rpc_hr_convite_anexo_reservar(text, text, text, text, bigint, text, inet)
--   rpc_hr_convite_anexo_contexto(text, text, uuid)
--   rpc_hr_convite_anexo_ligar(text, text, uuid, text, text, bigint, text)
--   rpc_hr_convite_anexo_descartar(text, text, uuid, text)
--   p_sessao_hash e o 2.o argumento; os outros nomes nao mudam.
--   Convite morto, sessao e estado passam a RAISE (HRA31, HRA02-05, HRA51-53,
--   HRA38); as recusas de negocio dos ficheiros continuam em jsonb {erro}.
--   Tipos: fora dos 3 conhecidos = {erro: anexo_tipo_invalido} (como antes);
--   cartao_cidadao e fotografia = {erro: anexo_tipo_bloqueado}; em devolvida
--   o comprovativo_iban so passa se estiver em devolucao.documentos ou se a
--   regra disser que falta, senao {erro: anexo_tipo_bloqueado}. A porta de
--   tipo corre em reservar, contexto e ligar.
--   descartar: removido_pela_pessoa abre com sessao e estado; os motivos
--   internos (formato_invalido, demasiado_grande, upload_abandonado) NAO abrem
--   (so trancam o convite pelo token), como hoje. DESVIO: o descartar NAO
--   aplica a porta de tipo -- num processo em devolvida os pendentes/ligados
--   so podem ser posteriores a devolucao (a submissao promove ou apaga todos),
--   e a pessoa tem de poder remover o comprovativo novo que enviou.
--   Todas as leituras de pessoas_anexos filtram tambem por organization_id.
--
--  Largadas: rpc_hr_convite_anexos_listar(text) (sem chamadores na Edge nem no
--  src; o portal_ler ja lista com sessao) e hr_convite_anexos_motivo (sem uso
--  depois disto; a migration procura-a no prosrc de public antes do DROP).
--
--  rpc_hr_convite_admissao_submeter(text, text, jsonb, text, inet, text):
--  CREATE OR REPLACE com a MESMA assinatura e o MESMO search_path do corpo em
--  vigor (20261231810000). UMA so diferenca: logo a seguir ao portao HRA17,
--    se a regra diz que falta -> RAISE 'anexos_em_falta' HRA86,
--    DETAIL 'comprovativo_iban'.
--  O bloco de conferir prova-o: tira o bloco novo do prosrc novo e compara o
--  md5 com o do prosrc lido na base antes da substituicao.
--
--  rpc_hr_convite_admissao_portal_ler(text, text): CREATE OR REPLACE, mesma
--  assinatura e search_path. Acrescenta, e so acrescenta (o conferir prova-o
--  da mesma forma): tamanho_bytes e mime_type em cada anexo;
--  anexos_obrigatorios (['comprovativo_iban'] quando ha IBAN e o comprovativo
--  e exigido neste estado); anexos_em_falta (a regra); documentos_editaveis
--  passa a so ter comprovativo_iban (e em devolvida ganha-o quando a regra o
--  exige). anexos_em_falta e um ACRESCENTO ao plano: o ecra precisa de saber
--  separadamente "e obrigatorio" (rotulo) e "ainda falta" (resumo).
--
--
-- -- CODIGOS ---------------------------------------------------------------------
--   novo: HRA86 anexos_em_falta (submeter). Primeiro livre lido no repositorio
--   (HRA65-HRA85 ocupados por 20270104500000 e 20270104800000); a guarda G8
--   confirma no prosrc de public que HRA86 nao esta em uso.
--   reutilizados: HRA02-05, HRA31, HRA38, HRA51-53.
--   jsonb (sem SQLSTATE): anexo_tipo_bloqueado (novo), anexo_tipo_invalido,
--   anexo_* de sempre.
--
--
-- -- [CONFIRMAR] ANTES DO PUSH (nao lido no remoto quando isto foi escrito) -----
--   a) Os corpos em vigor do submeter e do portal_ler sao os de 20261231810000 e
--      20270103200000. Se nao forem, o conferir (C6/C7) falha e nada fica.
--   b) As 4 RPCs antigas sao as de 20261210060000 (G1 procura
--      hr_convite_anexos_motivo e a ausencia de sessao no prosrc).
--   c) rpc_hr_admissao_devolver nao existe no repositorio: hoje nada escreve
--      'devolvida' nem o evento 'devolvido'. O ramo devolvida da regra segue o
--      formato de devolucao lido nas RPCs (campos objecto, documentos lista).
--   d) Contagem por organizacao de processos em em_preenchimento/devolvida com
--      iban_segredo_id preenchido: POR LER (sao esses que passam a precisar de
--      comprovativo).
--   e) proconfig de SET search_path = '' aceite como search_path="" ou
--      search_path= (C3/C4 aceitam as duas formas).
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--  Sem ficheiro de reversao nesta pasta, de proposito. Reverter = nova migration
--  que recria as 4 RPCs antigas, listar e motivo a partir de 20261210060000,
--  larga as novas e as duas internas, e repoe o submeter e o portal_ler dos
--  corpos guardados (pg_get_functiondef antes deste push) -- com a Edge
--  antiga (410) publicada antes.
-- ==============================================================================

SET LOCAL lock_timeout = '5s';

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_n     bigint;
  v_src   text;
  v_nome  text;
  v_sig   text;
  v_lidos text[];
BEGIN
  -- G1. As 4 RPCs antigas, listar e motivo existem, sem sessao (20261210060000).
  FOREACH v_sig IN ARRAY ARRAY[
    'public.rpc_hr_convite_anexo_reservar(text, text, text, bigint, text, inet)',
    'public.rpc_hr_convite_anexo_contexto(text, uuid)',
    'public.rpc_hr_convite_anexo_ligar(text, uuid, text, text, bigint, text)',
    'public.rpc_hr_convite_anexo_descartar(text, uuid, text)',
    'public.rpc_hr_convite_anexos_listar(text)'
  ] LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE EXCEPTION 'G1: falta %.', v_sig;
    END IF;
    SELECT p.prosrc INTO v_src FROM pg_proc p WHERE p.oid = to_regprocedure(v_sig);
    IF strpos(v_src, 'hr_convite_anexos_motivo') = 0 OR strpos(v_src, 'hr_convite_sessao_exigir') > 0 THEN
      RAISE EXCEPTION 'G1: % nao e a versao de 20261210060000. Reler antes de aplicar.', v_sig;
    END IF;
  END LOOP;
  IF to_regprocedure('public.hr_convite_anexos_motivo(timestamptz, timestamptz, timestamptz, integer)') IS NULL THEN
    RAISE EXCEPTION 'G1: falta hr_convite_anexos_motivo.';
  END IF;

  -- G2. Uma so funcao por nome hoje; as novas ainda nao existem.
  FOREACH v_nome IN ARRAY ARRAY['rpc_hr_convite_anexo_reservar', 'rpc_hr_convite_anexo_contexto',
                                'rpc_hr_convite_anexo_ligar', 'rpc_hr_convite_anexo_descartar',
                                'rpc_hr_convite_anexos_listar', 'hr_convite_anexos_motivo',
                                'rpc_hr_convite_admissao_submeter', 'rpc_hr_convite_admissao_portal_ler'] LOOP
    SELECT count(*) INTO v_n
      FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public' AND p.proname = v_nome;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'G2: esperava 1 funcao public.% e ha %.', v_nome, v_n;
    END IF;
  END LOOP;
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname IN ('hr_convite_anexos_abrir', 'hr_convite_comprovativo_iban_em_falta');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'G2: ja existe hr_convite_anexos_abrir ou hr_convite_comprovativo_iban_em_falta.';
  END IF;

  -- G3. Nenhum objecto depende das funcoes que se largam (DROP sem CASCADE).
  SELECT count(*) INTO v_n
    FROM pg_depend d
   WHERE d.refclassid = 'pg_catalog.pg_proc'::regclass
     AND d.refobjid IN (
       to_regprocedure('public.rpc_hr_convite_anexo_reservar(text, text, text, bigint, text, inet)')::oid,
       to_regprocedure('public.rpc_hr_convite_anexo_contexto(text, uuid)')::oid,
       to_regprocedure('public.rpc_hr_convite_anexo_ligar(text, uuid, text, text, bigint, text)')::oid,
       to_regprocedure('public.rpc_hr_convite_anexo_descartar(text, uuid, text)')::oid,
       to_regprocedure('public.rpc_hr_convite_anexos_listar(text)')::oid,
       to_regprocedure('public.hr_convite_anexos_motivo(timestamptz, timestamptz, timestamptz, integer)')::oid);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'G3: ha % dependencias das funcoes a largar em pg_depend.', v_n;
  END IF;

  -- G4. O submeter em vigor: assinatura, ancora do portao HRA17, promocao, sem a
  --     regra nova. Guarda-se o md5 do prosrc (sem \r) para o conferir C6.
  IF to_regprocedure('public.rpc_hr_convite_admissao_submeter(text, text, jsonb, text, inet, text)') IS NULL THEN
    RAISE EXCEPTION 'G4: falta rpc_hr_convite_admissao_submeter(text, text, jsonb, text, inet, text).';
  END IF;
  SELECT replace(p.prosrc, E'\r', '') INTO v_src
    FROM pg_proc p WHERE p.oid = to_regprocedure('public.rpc_hr_convite_admissao_submeter(text, text, jsonb, text, inet, text)');
  IF strpos(v_src, 'RAISE EXCEPTION ''admissao_incompleta'' USING ERRCODE = ''HRA17''') = 0
     OR strpos(v_src, 'PERFORM public.hr_convite_anexos_promover(v_convite_id);') = 0
     OR strpos(v_src, 'hr_convite_sessao_exigir') = 0
     OR strpos(v_src, 'anexos_em_falta') > 0 THEN
    RAISE EXCEPTION 'G4: o submeter em vigor nao e o de 20261231810000 (portao HRA17, promocao, sessao) ou ja tem a regra.';
  END IF;
  PERFORM set_config('hr_iban.md5_submeter', md5(v_src), false);

  -- G5. O portal_ler em vigor (20270103200000), sem os acrescentos.
  IF to_regprocedure('public.rpc_hr_convite_admissao_portal_ler(text, text)') IS NULL THEN
    RAISE EXCEPTION 'G5: falta rpc_hr_convite_admissao_portal_ler(text, text).';
  END IF;
  SELECT replace(p.prosrc, E'\r', '') INTO v_src
    FROM pg_proc p WHERE p.oid = to_regprocedure('public.rpc_hr_convite_admissao_portal_ler(text, text)');
  IF strpos(v_src, 'v_email_f') = 0 OR strpos(v_src, 'anexos_obrigatorios') > 0 THEN
    RAISE EXCEPTION 'G5: o portal_ler em vigor nao e o de 20270103200000 ou ja tem anexos_obrigatorios.';
  END IF;
  PERFORM set_config('hr_iban.md5_portal_ler', md5(v_src), false);

  -- G6. A sessao, com a assinatura e o retorno que o abrir usa.
  IF to_regprocedure('public.hr_convite_sessao_exigir(uuid, text)') IS NULL
     OR pg_get_function_result('public.hr_convite_sessao_exigir(uuid, text)'::regprocedure) IS DISTINCT FROM 'void' THEN
    RAISE EXCEPTION 'G6: hr_convite_sessao_exigir(uuid, text) RETURNS void nao existe.';
  END IF;

  -- G7. Colunas e CHECKs que a regra e as RPCs leem.
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = 'public.pessoas_anexos'::regclass AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname::text IN ('convite_id', 'organization_id', 'tipo', 'estado', 'ligado_em',
                             'tamanho_bytes', 'mime_type', 'caminho_quarentena', 'criado_em');
  IF v_n <> 9 THEN
    RAISE EXCEPTION 'G7: faltam colunas em pessoas_anexos (encontradas % de 9).', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = 'public.pessoas_convites_admissao'::regclass AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname::text IN ('iban_segredo_id', 'devolucao', 'estado', 'portal_encerrado_em',
                             'used_at', 'revoked_at', 'valid_until', 'attempts', 'token_hash');
  IF v_n <> 9 THEN
    RAISE EXCEPTION 'G7: faltam colunas em pessoas_convites_admissao (encontradas % de 9).', v_n;
  END IF;
  SELECT array_agg(DISTINCT m[1] ORDER BY m[1]) INTO v_lidos
    FROM pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g') AS m
   WHERE c.conrelid = 'public.pessoas_anexos'::regclass
     AND c.conname::text = 'pessoas_anexos_tipo_valido' AND c.contype::text = 'c';
  IF v_lidos IS DISTINCT FROM ARRAY['cartao_cidadao', 'comprovativo_iban', 'fotografia', 'outro'] THEN
    RAISE EXCEPTION 'G7: pessoas_anexos_tipo_valido tem valores inesperados: %', coalesce(array_to_string(v_lidos, ','), '(ausente)');
  END IF;
  SELECT array_agg(DISTINCT m[1]) INTO v_lidos
    FROM pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g') AS m
   WHERE c.conrelid = 'public.pessoas_convites_admissao_eventos'::regclass
     AND c.conname::text = 'pessoas_convites_admissao_eventos_acao_valida' AND c.contype::text = 'c';
  IF v_lidos IS NULL OR NOT (v_lidos @> ARRAY['devolvido']) THEN
    RAISE EXCEPTION 'G7: o CHECK das accoes dos eventos nao tem devolvido.';
  END IF;

  -- G8. HRA86 esta livre em todo o prosrc de public.
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND strpos(p.prosrc, 'HRA86') > 0;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'G8: HRA86 ja e usado por % funcao(oes). Escolher outro codigo.', v_n;
  END IF;
END;
$guardas$;


-- ==============================================================================
-- 1. A regra unica: falta o comprovativo de IBAN?
-- ==============================================================================
CREATE FUNCTION public.hr_convite_comprovativo_iban_em_falta(p_convite_id uuid, p_estado text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_c        record;
  v_estado   text;
  v_dev_iban boolean;
  v_ultimo   timestamptz;
BEGIN
  SELECT c.id, c.organization_id, c.estado, c.iban_segredo_id, c.devolucao
    INTO v_c
    FROM public.pessoas_convites_admissao c
   WHERE c.id = p_convite_id;
  IF NOT FOUND OR v_c.iban_segredo_id IS NULL THEN
    RETURN false;
  END IF;

  -- O estado vem de quem chama (lido com FOR UPDATE antes de qualquer escrita):
  -- no submeter o trigger de used_at ja mudou o estado da linha.
  v_estado := coalesce(p_estado, v_c.estado);

  IF v_estado = 'devolvida' THEN
    v_dev_iban := coalesce(
         (jsonb_typeof(v_c.devolucao -> 'campos') = 'object'
          AND (v_c.devolucao -> 'campos') ? 'iban')
      OR (jsonb_typeof(v_c.devolucao -> 'documentos') = 'array'
          AND (v_c.devolucao -> 'documentos') ? 'comprovativo_iban'),
      false);

    IF v_dev_iban THEN
      SELECT max(e.criado_em) INTO v_ultimo
        FROM public.pessoas_convites_admissao_eventos e
       WHERE e.convite_id = v_c.id
         AND e.organization_id = v_c.organization_id
         AND e.acao = 'devolvido';

      -- So conta um comprovativo enviado DEPOIS da devolucao.
      RETURN NOT EXISTS (
        SELECT 1
          FROM public.pessoas_anexos a
         WHERE a.convite_id = v_c.id
           AND a.organization_id = v_c.organization_id
           AND a.tipo = 'comprovativo_iban'
           AND a.estado = 'ligado'
           AND (v_ultimo IS NULL OR a.ligado_em > v_ultimo));
    END IF;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1
      FROM public.pessoas_anexos a
     WHERE a.convite_id = v_c.id
       AND a.organization_id = v_c.organization_id
       AND a.tipo = 'comprovativo_iban'
       AND a.estado IN ('ligado', 'promovido'));
END;
$$;

REVOKE ALL ON FUNCTION public.hr_convite_comprovativo_iban_em_falta(uuid, text) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.hr_convite_comprovativo_iban_em_falta(uuid, text) IS
'INTERNA, sem EXECUTE para nenhum papel. A regra unica do comprovativo de IBAN do portal de admissao (submeter, reservar/contexto/ligar, portal_ler). Sem IBAN no processo (iban_segredo_id nulo): false. Em devolvida, quando o RH devolveu o campo iban ou o documento comprovativo_iban: true se nao ha comprovativo ligado deste convite e organizacao com ligado_em posterior ao ultimo evento devolvido. Nos outros casos: true se nao ha comprovativo ligado ou promovido deste convite e organizacao. p_estado e o estado lido por quem chama (com FOR UPDATE); nulo = o da linha. Desde 20270107000000.';


-- ==============================================================================
-- 2. O abrir comum das RPCs de anexos
-- ==============================================================================
CREATE FUNCTION public.hr_convite_anexos_abrir(
  p_token_hash        text,
  p_sessao_hash       text,
  p_exigir_sessao     boolean,
  OUT o_id              uuid,
  OUT o_organization_id uuid,
  OUT o_pessoa_id       uuid,
  OUT o_estado          text,
  OUT o_devolucao       jsonb
)
RETURNS record
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
  c_tecto constant integer := 10;
  v_c     record;
BEGIN
  SELECT c.id, c.organization_id, c.pessoa_id, c.estado, c.devolucao, c.valid_until,
         c.used_at, c.revoked_at, c.portal_encerrado_em, c.attempts
    INTO v_c
    FROM public.pessoas_convites_admissao c
   WHERE c.token_hash = p_token_hash
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  IF v_c.portal_encerrado_em IS NOT NULL OR v_c.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'convite_ja_usado' USING ERRCODE = 'HRA02';
  ELSIF v_c.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'convite_revogado' USING ERRCODE = 'HRA03';
  ELSIF v_c.valid_until <= now() THEN
    RAISE EXCEPTION 'convite_expirado' USING ERRCODE = 'HRA04';
  ELSIF v_c.attempts >= c_tecto THEN
    RAISE EXCEPTION 'convite_bloqueado' USING ERRCODE = 'HRA05';
  END IF;

  -- So um false explicito dispensa a sessao (nulo exige-a).
  IF p_exigir_sessao IS DISTINCT FROM false THEN
    PERFORM public.hr_convite_sessao_exigir(v_c.id, p_sessao_hash);
  END IF;

  IF v_c.estado NOT IN ('em_preenchimento', 'devolvida') THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;

  o_id              := v_c.id;
  o_organization_id := v_c.organization_id;
  o_pessoa_id       := v_c.pessoa_id;
  o_estado          := v_c.estado;
  o_devolucao       := v_c.devolucao;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_convite_anexos_abrir(text, text, boolean) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.hr_convite_anexos_abrir(text, text, boolean) IS
'INTERNA, sem EXECUTE para nenhum papel: so a chamam as RPCs de anexos do convite. Tranca o processo pelo token (FOR UPDATE); nao encontrado HRA31; encerrado ou usado HRA02, revogado HRA03, expirado HRA04, bloqueado HRA05; sessao OTP por hr_convite_sessao_exigir (HRA51/52/53) salvo p_exigir_sessao = false; estado fora de em_preenchimento e devolvida HRA38. Devolve id, organizacao, pessoa, estado e devolucao. Desde 20270107000000.';


-- ==============================================================================
-- 3. As 4 RPCs: larga-se a assinatura antiga e cria-se a nova, aqui
-- ==============================================================================
DROP FUNCTION public.rpc_hr_convite_anexo_reservar(text, text, text, bigint, text, inet);
DROP FUNCTION public.rpc_hr_convite_anexo_contexto(text, uuid);
DROP FUNCTION public.rpc_hr_convite_anexo_ligar(text, uuid, text, text, bigint, text);
DROP FUNCTION public.rpc_hr_convite_anexo_descartar(text, uuid, text);

-- ---- 3.1 reservar ------------------------------------------------------------
CREATE FUNCTION public.rpc_hr_convite_anexo_reservar(
  p_token_hash        text,
  p_sessao_hash       text,
  p_tipo              text,
  p_nome_original     text,
  p_tamanho_declarado bigint,
  p_mime_declarado    text,
  p_ip                inet
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_max_activos    constant integer := 4;
  c_max_reservas   constant integer := 12;
  c_max_bytes      constant bigint  := 10485760;
  c_max_bytes_foto constant bigint  := 5242880;
  v_c           record;
  v_docs_dev    jsonb;
  v_limite_tipo integer;
  v_activos     integer;
  v_do_tipo     integer;
  v_reservas    integer;
  v_ext         text;
  v_nome        text;
  v_id          uuid := gen_random_uuid();
  v_caminho     text;
BEGIN
  -- Portal, sessao e estado ANTES de ler qualquer anexo. O convite fica
  -- trancado ate ao fim: duas reservas em simultaneo nao passam as duas.
  SELECT a.o_id, a.o_organization_id, a.o_pessoa_id, a.o_estado, a.o_devolucao
    INTO v_c
    FROM public.hr_convite_anexos_abrir(p_token_hash, p_sessao_hash, true) AS a;

  IF p_tipo IS NULL OR p_tipo NOT IN ('cartao_cidadao', 'comprovativo_iban', 'fotografia') THEN
    RETURN jsonb_build_object('erro', 'anexo_tipo_invalido');
  END IF;

  -- Nesta fase so o comprovativo de IBAN esta aberto. Em devolvida, so se o RH
  -- o pediu ou se a regra o exige.
  v_docs_dev := CASE WHEN jsonb_typeof(v_c.o_devolucao -> 'documentos') = 'array'
                     THEN v_c.o_devolucao -> 'documentos' ELSE '[]'::jsonb END;
  IF p_tipo <> 'comprovativo_iban'
     OR (v_c.o_estado = 'devolvida'
         AND NOT (v_docs_dev ? p_tipo)
         AND NOT public.hr_convite_comprovativo_iban_em_falta(v_c.o_id, v_c.o_estado)) THEN
    RETURN jsonb_build_object('erro', 'anexo_tipo_bloqueado');
  END IF;

  IF p_mime_declarado IS NULL
     OR p_mime_declarado NOT IN ('application/pdf', 'image/png', 'image/jpeg') THEN
    RETURN jsonb_build_object('erro', 'anexo_formato_invalido');
  END IF;

  IF p_tipo = 'fotografia' AND p_mime_declarado NOT IN ('image/png', 'image/jpeg') THEN
    RETURN jsonb_build_object('erro', 'anexo_fotografia_formato');
  END IF;

  IF p_tamanho_declarado IS NULL OR p_tamanho_declarado <= 0 THEN
    RETURN jsonb_build_object('erro', 'anexo_vazio');
  END IF;

  IF p_tipo = 'fotografia' THEN
    IF p_tamanho_declarado > c_max_bytes_foto THEN
      RETURN jsonb_build_object('erro', 'anexo_fotografia_demasiado_grande');
    END IF;
  ELSIF p_tamanho_declarado > c_max_bytes THEN
    RETURN jsonb_build_object('erro', 'anexo_demasiado_grande');
  END IF;

  v_limite_tipo := CASE p_tipo
    WHEN 'cartao_cidadao'     THEN 2
    WHEN 'comprovativo_iban'  THEN 1
    WHEN 'fotografia'         THEN 1
  END;

  SELECT count(*),
         count(*) FILTER (WHERE a.tipo = p_tipo)
    INTO v_activos, v_do_tipo
    FROM public.pessoas_anexos a
   WHERE a.convite_id = v_c.o_id
     AND a.organization_id = v_c.o_organization_id
     AND a.estado IN ('pendente', 'ligado');

  IF v_activos >= c_max_activos THEN
    RETURN jsonb_build_object('erro', 'anexo_maximo_ficheiros');
  END IF;
  IF v_do_tipo >= v_limite_tipo THEN
    RETURN jsonb_build_object('erro', 'anexo_tipo_cheio');
  END IF;

  -- Os apagados tambem contam: sem isto, carregar e remover em ciclo enchia o Storage.
  SELECT count(*) INTO v_reservas
    FROM public.pessoas_anexos a
   WHERE a.convite_id = v_c.o_id
     AND a.organization_id = v_c.o_organization_id;
  IF v_reservas >= c_max_reservas THEN
    RETURN jsonb_build_object('erro', 'anexo_limite_convite');
  END IF;

  v_ext := CASE p_mime_declarado
    WHEN 'application/pdf' THEN 'pdf'
    WHEN 'image/png'       THEN 'png'
    ELSE 'jpg'
  END;

  -- So o nome para mostrar; o ficheiro nunca se guarda com este nome.
  v_nome := left(btrim(regexp_replace(coalesce(p_nome_original, ''), '[[:cntrl:]]', '', 'g')), 200);
  IF v_nome = '' THEN
    v_nome := 'ficheiro';
  END IF;

  v_caminho := 'admissao/' || v_c.o_id::text || '/' || v_id::text || '.' || v_ext;

  INSERT INTO public.pessoas_anexos (
    id, organization_id, pessoa_id, convite_id, tipo, estado, bucket,
    caminho, caminho_quarentena, nome_original, upload_ip
  ) VALUES (
    v_id, v_c.o_organization_id, v_c.o_pessoa_id, v_c.o_id, p_tipo, 'pendente',
    'hr-documentos-quarantine', v_caminho, v_caminho, v_nome, p_ip
  );

  RETURN jsonb_build_object('anexo_id', v_id, 'caminho', v_caminho);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_convite_anexo_reservar(text, text, text, text, bigint, text, inet) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_anexo_reservar(text, text, text, text, bigint, text, inet) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_convite_anexo_reservar(text, text, text, text, bigint, text, inet) IS
'Portal de admissao: reserva um anexo. SO service_role (Edge convite-admissao). Abre por hr_convite_anexos_abrir (HRA31, HRA02-05, sessao HRA51-53, estado HRA38). Tipos: desconhecido anexo_tipo_invalido; cartao_cidadao e fotografia anexo_tipo_bloqueado (fechados); em devolvida o comprovativo_iban so passa se estiver em devolucao.documentos ou se hr_convite_comprovativo_iban_em_falta o exigir. Depois formato, tamanho e limites (4 activos, comprovativo 1, 12 reservas). Devolve {anexo_id, caminho} ou {erro}; nunca organizacao nem pessoa. Desde 20270107000000 (antes sem sessao, 20261210060000).';

-- ---- 3.2 contexto ------------------------------------------------------------
CREATE FUNCTION public.rpc_hr_convite_anexo_contexto(
  p_token_hash  text,
  p_sessao_hash text,
  p_anexo_id    uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_c        record;
  v_anexo    record;
  v_docs_dev jsonb;
BEGIN
  SELECT a.o_id, a.o_organization_id, a.o_estado, a.o_devolucao
    INTO v_c
    FROM public.hr_convite_anexos_abrir(p_token_hash, p_sessao_hash, true) AS a;

  -- Um anexo de OUTRO convite e um anexo inexistente: nao se distingue.
  SELECT a.id, a.tipo, a.estado, a.caminho, a.organization_id, a.pessoa_id
    INTO v_anexo
    FROM public.pessoas_anexos a
   WHERE a.id = p_anexo_id
     AND a.convite_id = v_c.o_id
     AND a.organization_id = v_c.o_organization_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('erro', 'anexo_nao_encontrado');
  END IF;

  IF v_anexo.estado <> 'pendente' THEN
    RETURN jsonb_build_object('erro', 'anexo_estado_invalido');
  END IF;

  v_docs_dev := CASE WHEN jsonb_typeof(v_c.o_devolucao -> 'documentos') = 'array'
                     THEN v_c.o_devolucao -> 'documentos' ELSE '[]'::jsonb END;
  IF v_anexo.tipo <> 'comprovativo_iban'
     OR (v_c.o_estado = 'devolvida'
         AND NOT (v_docs_dev ? v_anexo.tipo)
         AND NOT public.hr_convite_comprovativo_iban_em_falta(v_c.o_id, v_c.o_estado)) THEN
    RETURN jsonb_build_object('erro', 'anexo_tipo_bloqueado');
  END IF;

  -- Uso interno da Edge: organizacao e pessoa servem para o caminho final e
  -- nunca se reenviam ao browser.
  RETURN jsonb_build_object(
    'anexo_id', v_anexo.id,
    'tipo', v_anexo.tipo,
    'estado', v_anexo.estado,
    'caminho', v_anexo.caminho,
    'organization_id', v_anexo.organization_id,
    'pessoa_id', v_anexo.pessoa_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_convite_anexo_contexto(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_anexo_contexto(text, text, uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_convite_anexo_contexto(text, text, uuid) IS
'Portal de admissao: contexto de um anexo pendente para a Edge o confirmar ({anexo_id, tipo, estado, caminho, organization_id, pessoa_id}). SO service_role; uso interno da Edge. Abre por hr_convite_anexos_abrir (sessao e estado). Anexo de outro convite ou organizacao: anexo_nao_encontrado; nao pendente: anexo_estado_invalido; tipo fechado ou nao pedido em devolvida: anexo_tipo_bloqueado. Desde 20270107000000.';

-- ---- 3.3 ligar ---------------------------------------------------------------
CREATE FUNCTION public.rpc_hr_convite_anexo_ligar(
  p_token_hash    text,
  p_sessao_hash   text,
  p_anexo_id      uuid,
  p_caminho_final text,
  p_mime          text,
  p_tamanho       bigint,
  p_hash          text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_max_activos    constant integer := 4;
  c_max_bytes      constant bigint  := 10485760;
  c_max_bytes_foto constant bigint  := 5242880;
  v_c           record;
  v_anexo       record;
  v_docs_dev    jsonb;
  v_limite_tipo integer;
  v_activos     integer;
  v_do_tipo     integer;
  v_ext         text;
  v_esperado    text;
BEGIN
  -- O convite trancado primeiro: ligar e submeter ficam em fila. Depois de
  -- submeter o estado ja nao e editavel (HRA38) e a Edge desfaz a copia.
  SELECT a.o_id, a.o_organization_id, a.o_estado, a.o_devolucao
    INTO v_c
    FROM public.hr_convite_anexos_abrir(p_token_hash, p_sessao_hash, true) AS a;

  SELECT a.id, a.tipo, a.estado, a.nome_original, a.organization_id, a.pessoa_id
    INTO v_anexo
    FROM public.pessoas_anexos a
   WHERE a.id = p_anexo_id
     AND a.convite_id = v_c.o_id
     AND a.organization_id = v_c.o_organization_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('erro', 'anexo_nao_encontrado');
  END IF;

  IF v_anexo.estado <> 'pendente' THEN
    RETURN jsonb_build_object('erro', 'anexo_estado_invalido');
  END IF;

  -- Repete a porta de tipo: o RH pode ter devolvido outra lista entre reservar e ligar.
  v_docs_dev := CASE WHEN jsonb_typeof(v_c.o_devolucao -> 'documentos') = 'array'
                     THEN v_c.o_devolucao -> 'documentos' ELSE '[]'::jsonb END;
  IF v_anexo.tipo <> 'comprovativo_iban'
     OR (v_c.o_estado = 'devolvida'
         AND NOT (v_docs_dev ? v_anexo.tipo)
         AND NOT public.hr_convite_comprovativo_iban_em_falta(v_c.o_id, v_c.o_estado)) THEN
    RETURN jsonb_build_object('erro', 'anexo_tipo_bloqueado');
  END IF;

  -- Daqui para baixo, o tipo e o tamanho sao os REAIS (lidos dos bytes pela Edge).
  IF p_mime IS NULL OR p_mime NOT IN ('application/pdf', 'image/png', 'image/jpeg') THEN
    RETURN jsonb_build_object('erro', 'anexo_formato_invalido');
  END IF;

  IF v_anexo.tipo = 'fotografia' AND p_mime NOT IN ('image/png', 'image/jpeg') THEN
    RETURN jsonb_build_object('erro', 'anexo_fotografia_formato');
  END IF;

  IF p_tamanho IS NULL OR p_tamanho <= 0 THEN
    RETURN jsonb_build_object('erro', 'anexo_vazio');
  END IF;

  IF v_anexo.tipo = 'fotografia' THEN
    IF p_tamanho > c_max_bytes_foto THEN
      RETURN jsonb_build_object('erro', 'anexo_fotografia_demasiado_grande');
    END IF;
  ELSIF p_tamanho > c_max_bytes THEN
    RETURN jsonb_build_object('erro', 'anexo_demasiado_grande');
  END IF;

  IF p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('erro', 'anexo_falha_envio');
  END IF;

  v_limite_tipo := CASE v_anexo.tipo
    WHEN 'cartao_cidadao'     THEN 2
    WHEN 'comprovativo_iban'  THEN 1
    WHEN 'fotografia'         THEN 1
  END;

  -- O anexo que se liga ja conta como activo: so recusa acima do limite.
  SELECT count(*),
         count(*) FILTER (WHERE a.tipo = v_anexo.tipo)
    INTO v_activos, v_do_tipo
    FROM public.pessoas_anexos a
   WHERE a.convite_id = v_c.o_id
     AND a.organization_id = v_c.o_organization_id
     AND a.estado IN ('pendente', 'ligado');

  IF v_activos > c_max_activos THEN
    RETURN jsonb_build_object('erro', 'anexo_maximo_ficheiros');
  END IF;
  IF v_do_tipo > v_limite_tipo THEN
    RETURN jsonb_build_object('erro', 'anexo_tipo_cheio');
  END IF;

  v_ext := CASE p_mime
    WHEN 'application/pdf' THEN 'pdf'
    WHEN 'image/png'       THEN 'png'
    ELSE 'jpg'
  END;

  -- O caminho final e o unico possivel, construido dos valores da propria linha.
  v_esperado := v_anexo.organization_id::text || '/' || v_anexo.pessoa_id::text
             || '/admissao/' || v_anexo.id::text || '.' || v_ext;
  IF p_caminho_final IS DISTINCT FROM v_esperado THEN
    RETURN jsonb_build_object('erro', 'anexo_falha_envio');
  END IF;

  UPDATE public.pessoas_anexos
     SET estado        = 'ligado',
         bucket        = 'hr-documentos',
         caminho       = p_caminho_final,
         mime_type     = p_mime,
         tamanho_bytes = p_tamanho,
         hash_sha256   = p_hash,
         ligado_em     = now()
   WHERE id = v_anexo.id;

  RETURN jsonb_build_object('ok', true, 'anexo', jsonb_build_object(
      'id', v_anexo.id,
      'tipo', v_anexo.tipo,
      'nome_original', v_anexo.nome_original,
      'tamanho_bytes', p_tamanho,
      'mime_type', p_mime
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_convite_anexo_ligar(text, text, uuid, text, text, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_anexo_ligar(text, text, uuid, text, text, bigint, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_convite_anexo_ligar(text, text, uuid, text, text, bigint, text) IS
'Portal de admissao: liga um anexo pendente depois de a Edge verificar os bytes. SO service_role. Abre por hr_convite_anexos_abrir (convite FOR UPDATE, sessao, estado: fecha a corrida com o submeter). Repete a porta de tipo (anexo_tipo_bloqueado), formato, tamanho e limites com os valores REAIS, exige o caminho final exacto <org>/<pessoa>/admissao/<anexo_id>.<ext> e passa a ligado. Devolve {ok, anexo:{id, tipo, nome_original, tamanho_bytes, mime_type}} ou {erro}. Desde 20270107000000.';

-- ---- 3.4 descartar -----------------------------------------------------------
CREATE FUNCTION public.rpc_hr_convite_anexo_descartar(
  p_token_hash  text,
  p_sessao_hash text,
  p_anexo_id    uuid,
  p_motivo      text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_conv_id uuid;
  v_org     uuid;
  v_c       record;
  v_anexo   record;
BEGIN
  IF p_motivo IS NULL
     OR p_motivo NOT IN ('removido_pela_pessoa', 'formato_invalido', 'demasiado_grande', 'upload_abandonado') THEN
    RETURN jsonb_build_object('erro', 'pedido_invalido');
  END IF;

  IF p_motivo = 'removido_pela_pessoa' THEN
    -- A pessoa: portal vivo, sessao e estado editavel.
    SELECT a.o_id, a.o_organization_id
      INTO v_c
      FROM public.hr_convite_anexos_abrir(p_token_hash, p_sessao_hash, true) AS a;
    v_conv_id := v_c.o_id;
    v_org     := v_c.o_organization_id;
  ELSE
    -- A Edge a desfazer o proprio trabalho: tem de funcionar num convite que
    -- acabou de morrer ou de ser submetido. So tranca o convite pelo token.
    SELECT c.id, c.organization_id
      INTO v_conv_id, v_org
      FROM public.pessoas_convites_admissao c
     WHERE c.token_hash = p_token_hash
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
    END IF;
  END IF;

  SELECT a.id, a.estado, a.bucket, a.caminho, a.caminho_quarentena
    INTO v_anexo
    FROM public.pessoas_anexos a
   WHERE a.id = p_anexo_id
     AND a.convite_id = v_conv_id
     AND a.organization_id = v_org
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('erro', 'anexo_nao_encontrado');
  END IF;

  -- Um anexo ja promovido faz parte da ficha: nunca se apaga por aqui.
  IF v_anexo.estado = 'promovido' THEN
    RETURN jsonb_build_object('erro', 'anexo_estado_invalido');
  END IF;

  IF v_anexo.estado = 'apagado' THEN
    IF p_motivo = 'removido_pela_pessoa' THEN
      RETURN jsonb_build_object('erro', 'anexo_estado_invalido');
    END IF;
    -- Idempotente para a Edge: repetir o descarte devolve onde esta o objecto.
    RETURN jsonb_build_object('ok', true, 'bucket', v_anexo.bucket, 'caminho', v_anexo.caminho,
                              'caminho_quarentena', v_anexo.caminho_quarentena);
  END IF;

  UPDATE public.pessoas_anexos
     SET estado         = 'apagado',
         apagado_em     = now(),
         apagado_motivo = p_motivo
   WHERE id = v_anexo.id;

  RETURN jsonb_build_object('ok', true, 'bucket', v_anexo.bucket, 'caminho', v_anexo.caminho,
                            'caminho_quarentena', v_anexo.caminho_quarentena);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_convite_anexo_descartar(text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_anexo_descartar(text, text, uuid, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_convite_anexo_descartar(text, text, uuid, text) IS
'Portal de admissao: marca um anexo do convite como apagado e devolve {ok, bucket, caminho, caminho_quarentena} para a Edge remover os objectos. SO service_role. removido_pela_pessoa abre por hr_convite_anexos_abrir (portal vivo, sessao, estado editavel); os motivos internos formato_invalido, demasiado_grande e upload_abandonado (a Edge a desfazer o proprio trabalho; o browser nunca escolhe o motivo) so trancam o convite pelo token (HRA31 se nao existe). Sem porta de tipo: a pessoa pode sempre remover o que enviou. Nunca apaga um promovido. Desde 20270107000000.';


-- ==============================================================================
-- 4. Largar o que ficou sem uso
-- ==============================================================================
DROP FUNCTION public.rpc_hr_convite_anexos_listar(text);

DO $motivo$
DECLARE
  v_quem text;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_quem
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname <> 'hr_convite_anexos_motivo'
     AND strpos(p.prosrc, 'hr_convite_anexos_motivo') > 0;
  IF v_quem IS NOT NULL THEN
    RAISE EXCEPTION 'hr_convite_anexos_motivo ainda e usada por: %', v_quem;
  END IF;
END;
$motivo$;

DROP FUNCTION public.hr_convite_anexos_motivo(timestamptz, timestamptz, timestamptz, integer);


-- ==============================================================================
-- 5. Submeter: o corpo em vigor (20261231810000) mais a recusa anexos_em_falta
--    logo a seguir ao portao HRA17. Mesma assinatura, mesmo search_path.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_convite_admissao_submeter(
  p_token_hash      text,
  p_sessao_hash     text,
  p_dados           jsonb,
  p_assinatura_nome text,
  p_ip              inet,
  p_user_agent      text
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_tecto constant integer := 10;
  c_assinatura_max constant integer := 200;
  -- Nunca em texto: o NISS e o IBAN so chegam pelo Vault.
  c_proibidas constant text[] := ARRAY['niss', 'iban', 'conta_numero'];
  v_c          record;
  v_campos     jsonb;
  v_bloqueadas text;
  v_assinatura text;
  v_pessoa_id  uuid;
  v_convite_id uuid;
  v_org        uuid;
  v_nif        text;
  v_niss       text;
  v_linha1     text;
  v_pais       text;
  v_principal  boolean;
  v_conta_num  text;
  v_conta_tit  text;
  v_conta_bco  text;
  v_conta_bic  text;
  v_conta_lin  record;
  v_secret_id  uuid;
  v_faltam     text[];
  v_dup_nome1     text;
  v_dup_apelido   text;
  v_dup_nascim    date;
  v_dup_nif       text;
  v_dup_niss      text;
  v_dup_tipo      text;
  v_dup_numero    text;
  v_dup_email     text;
  v_ids_nif       text;
  v_ids_niss      text;
BEGIN
  -- ---- Prefixo: nada se escreve antes disto ----------------------------------
  SELECT c.id, c.estado, c.valid_until, c.used_at, c.revoked_at, c.portal_encerrado_em,
         c.attempts, c.devolucao, c.niss_segredo_id, c.iban_segredo_id
    INTO v_c
    FROM public.pessoas_convites_admissao c
   WHERE c.token_hash = p_token_hash
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  IF v_c.portal_encerrado_em IS NOT NULL OR v_c.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'convite_ja_usado' USING ERRCODE = 'HRA02';
  ELSIF v_c.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'convite_revogado' USING ERRCODE = 'HRA03';
  ELSIF v_c.valid_until <= now() THEN
    RAISE EXCEPTION 'convite_expirado' USING ERRCODE = 'HRA04';
  ELSIF v_c.attempts >= c_tecto THEN
    RAISE EXCEPTION 'convite_bloqueado' USING ERRCODE = 'HRA05';
  END IF;

  -- O link sozinho nao submete.
  PERFORM public.hr_convite_sessao_exigir(v_c.id, p_sessao_hash);

  IF v_c.estado NOT IN ('em_preenchimento', 'devolvida') THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;

  IF jsonb_typeof(p_dados) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_dados) AS k(chave) WHERE k.chave = ANY (c_proibidas)) THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;

  v_assinatura := nullif(btrim(coalesce(p_assinatura_nome, '')), '');
  IF v_assinatura IS NULL OR length(v_assinatura) > c_assinatura_max THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;

  -- Em devolvida so se submete o que o RH devolveu.
  IF v_c.estado = 'devolvida' THEN
    v_campos := CASE WHEN jsonb_typeof(v_c.devolucao -> 'campos') = 'object'
                     THEN v_c.devolucao -> 'campos' ELSE '{}'::jsonb END;

    SELECT string_agg(k.chave, ',' ORDER BY k.chave)
      INTO v_bloqueadas
      FROM jsonb_object_keys(p_dados) AS k(chave)
      LEFT JOIN (VALUES
          ('morada_linha1',        'linha1'),
          ('morada_linha2',        'linha2'),
          ('morada_codigo_postal', 'codigo_postal'),
          ('morada_localidade',    'localidade'),
          ('morada_distrito',      'distrito'),
          ('morada_pais',          'pais'),
          ('conta_swift',          'conta_bic')
        ) AS m(portal, ficha)
        ON k.chave IN (m.portal, m.ficha)
     WHERE NOT (v_campos ? k.chave)
       AND NOT (m.portal IS NOT NULL AND (v_campos ? m.portal OR v_campos ? m.ficha));

    IF v_bloqueadas IS NOT NULL THEN
      RAISE EXCEPTION 'campo_bloqueado' USING ERRCODE = 'HRA47', DETAIL = v_bloqueadas;
    END IF;
  END IF;

  -- NISS e IBAN: so do Vault (staging gravado por sensiveis_gravar, ja sem
  -- espacos e com o IBAN em maiusculas). Nulos se nao houver segredo.
  IF v_c.niss_segredo_id IS NOT NULL THEN
    SELECT s.decrypted_secret INTO v_niss
      FROM vault.decrypted_secrets s WHERE s.id = v_c.niss_segredo_id;
  END IF;
  IF v_c.iban_segredo_id IS NOT NULL THEN
    SELECT s.decrypted_secret INTO v_conta_num
      FROM vault.decrypted_secrets s WHERE s.id = v_c.iban_segredo_id;
  END IF;
  v_niss      := nullif(btrim(v_niss), '');
  v_conta_num := nullif(btrim(v_conta_num), '');

  -- ---- Corpo do submeter vivo (27/10), com as substituicoes do cabecalho -----
  UPDATE public.pessoas_convites_admissao
     SET used_at = now(),
         submetido_em = now(),
         assinatura_nome = v_assinatura,
         assinatura_ip = p_ip,
         assinatura_user_agent = p_user_agent,
         rascunho = NULL,
         -- Convite consumido: a ultima recusa (campos e fichas em conflito)
         -- deixa de fazer falta e nao fica guardada.
         ultima_recusa_codigo = NULL,
         ultima_recusa_em = NULL,
         ultima_recusa_campos = NULL,
         ultima_recusa_conflitos = NULL
   WHERE id = v_c.id
  RETURNING id, pessoa_id, organization_id INTO v_convite_id, v_pessoa_id, v_org;

  -- NIF e NISS pelo digito de controlo, ANTES dos duplicados e de qualquer
  -- escrita na ficha. O NISS vem do Vault; valida-se na mesma, por defesa.
  v_nif := public.hr_json_texto(p_dados, 'nif');

  IF v_nif IS NOT NULL AND NOT public.hr_nif_valido(v_nif) THEN
    RAISE EXCEPTION 'nif_invalido' USING ERRCODE = 'HRA11';
  END IF;
  IF v_niss IS NOT NULL AND NOT public.hr_niss_valido(v_niss) THEN
    RAISE EXCEPTION 'niss_invalido' USING ERRCODE = 'HRA12';
  END IF;

  SELECT
    p.primeiro_nome,
    p.apelido,
    coalesce(public.hr_json_texto(p_dados, 'email_pessoal'), p.email_pessoal),
    coalesce(public.hr_json_texto(p_dados, 'nif'), i.nif),
    coalesce(v_niss, i.niss),
    coalesce(public.hr_json_texto(p_dados, 'tipo_documento'), i.tipo_documento),
    coalesce(public.hr_json_texto(p_dados, 'numero_documento'), i.numero_documento),
    coalesce(public.hr_json_texto(p_dados, 'data_nascimento')::date, dp.data_nascimento)
    INTO v_dup_nome1, v_dup_apelido, v_dup_email, v_dup_nif, v_dup_niss,
         v_dup_tipo, v_dup_numero, v_dup_nascim
  FROM public.pessoas p
  LEFT JOIN public.pessoas_identificacao i ON i.pessoa_id = p.id
  LEFT JOIN public.pessoas_dados_pessoais dp ON dp.pessoa_id = p.id
  WHERE p.id = v_pessoa_id;

  -- Os pessoa_id em conflito ficam no DETAIL: so a Edge Function o le e NUNCA
  -- sai para o publico.
  SELECT
    string_agg(DISTINCT cand.pessoa_id::text, ',') FILTER (WHERE cand.campo_coincidente = 'nif'),
    string_agg(DISTINCT cand.pessoa_id::text, ',') FILTER (WHERE cand.campo_coincidente = 'niss')
    INTO v_ids_nif, v_ids_niss
  FROM public.hr_pessoa_duplicados_candidatos(
    v_org, v_dup_nif, v_dup_niss, v_dup_email, v_dup_tipo, v_dup_numero,
    v_dup_nome1, v_dup_apelido, v_dup_nascim, v_pessoa_id
  ) AS cand
  WHERE cand.forca = 'travao';

  IF v_ids_nif IS NOT NULL THEN
    RAISE EXCEPTION 'nif_ja_existe' USING ERRCODE = 'HRA13', DETAIL = v_ids_nif;
  END IF;
  IF v_ids_niss IS NOT NULL THEN
    RAISE EXCEPTION 'niss_ja_existe' USING ERRCODE = 'HRA14', DETAIL = v_ids_niss;
  END IF;

  PERFORM set_config('hr.origem_escrita', 'convite', true);

  IF p_dados ? 'email_pessoal' THEN
    UPDATE public.pessoas
       SET email_pessoal = public.hr_json_texto(p_dados, 'email_pessoal')
     WHERE id = v_pessoa_id;
  END IF;

  IF p_dados ?| ARRAY[
       'data_nascimento','genero','nacionalidade','telefone_pessoal','estado_civil',
       'dependentes','naturalidade_freguesia','naturalidade_concelho','naturalidade_pais',
       'conjuge_situacao_profissional','dependentes_deficientes',
       'habilitacao_academica','habilitacao_data_conclusao'
     ] THEN
    INSERT INTO public.pessoas_dados_pessoais (
      pessoa_id, organization_id,
      data_nascimento, genero, nacionalidade, estado_civil, dependentes,
      telefone_pessoal, naturalidade_freguesia, naturalidade_concelho, naturalidade_pais,
      conjuge_situacao_profissional, dependentes_deficientes,
      habilitacao_academica, habilitacao_data_conclusao
    ) VALUES (
      v_pessoa_id, v_org,
      public.hr_json_texto(p_dados, 'data_nascimento')::date,
      public.hr_json_texto(p_dados, 'genero'),
      upper(public.hr_json_texto(p_dados, 'nacionalidade')),
      public.hr_json_texto(p_dados, 'estado_civil'),
      public.hr_json_texto(p_dados, 'dependentes')::smallint,
      public.hr_json_texto(p_dados, 'telefone_pessoal'),
      public.hr_json_texto(p_dados, 'naturalidade_freguesia'),
      public.hr_json_texto(p_dados, 'naturalidade_concelho'),
      upper(public.hr_json_texto(p_dados, 'naturalidade_pais')),
      public.hr_json_texto(p_dados, 'conjuge_situacao_profissional'),
      public.hr_json_texto(p_dados, 'dependentes_deficientes')::smallint,
      public.hr_json_texto(p_dados, 'habilitacao_academica'),
      public.hr_json_texto(p_dados, 'habilitacao_data_conclusao')::date
    )
    ON CONFLICT (pessoa_id) DO UPDATE SET
      data_nascimento = CASE WHEN p_dados ? 'data_nascimento'
        THEN EXCLUDED.data_nascimento ELSE pessoas_dados_pessoais.data_nascimento END,
      genero = CASE WHEN p_dados ? 'genero'
        THEN EXCLUDED.genero ELSE pessoas_dados_pessoais.genero END,
      nacionalidade = CASE WHEN p_dados ? 'nacionalidade'
        THEN EXCLUDED.nacionalidade ELSE pessoas_dados_pessoais.nacionalidade END,
      estado_civil = CASE WHEN p_dados ? 'estado_civil'
        THEN EXCLUDED.estado_civil ELSE pessoas_dados_pessoais.estado_civil END,
      dependentes = CASE WHEN p_dados ? 'dependentes'
        THEN EXCLUDED.dependentes ELSE pessoas_dados_pessoais.dependentes END,
      telefone_pessoal = CASE WHEN p_dados ? 'telefone_pessoal'
        THEN EXCLUDED.telefone_pessoal ELSE pessoas_dados_pessoais.telefone_pessoal END,
      naturalidade_freguesia = CASE WHEN p_dados ? 'naturalidade_freguesia'
        THEN EXCLUDED.naturalidade_freguesia ELSE pessoas_dados_pessoais.naturalidade_freguesia END,
      naturalidade_concelho = CASE WHEN p_dados ? 'naturalidade_concelho'
        THEN EXCLUDED.naturalidade_concelho ELSE pessoas_dados_pessoais.naturalidade_concelho END,
      naturalidade_pais = CASE WHEN p_dados ? 'naturalidade_pais'
        THEN EXCLUDED.naturalidade_pais ELSE pessoas_dados_pessoais.naturalidade_pais END,
      conjuge_situacao_profissional = CASE WHEN p_dados ? 'conjuge_situacao_profissional'
        THEN EXCLUDED.conjuge_situacao_profissional ELSE pessoas_dados_pessoais.conjuge_situacao_profissional END,
      dependentes_deficientes = CASE WHEN p_dados ? 'dependentes_deficientes'
        THEN EXCLUDED.dependentes_deficientes ELSE pessoas_dados_pessoais.dependentes_deficientes END,
      habilitacao_academica = CASE WHEN p_dados ? 'habilitacao_academica'
        THEN EXCLUDED.habilitacao_academica ELSE pessoas_dados_pessoais.habilitacao_academica END,
      habilitacao_data_conclusao = CASE WHEN p_dados ? 'habilitacao_data_conclusao'
        THEN EXCLUDED.habilitacao_data_conclusao ELSE pessoas_dados_pessoais.habilitacao_data_conclusao END,
      updated_at = now();
  END IF;

  -- O NISS ja nao vem em p_dados: a identificacao entra tambem quando so ha
  -- NISS no Vault.
  IF p_dados ?| ARRAY[
       'tipo_documento','numero_documento','validade_documento','nif',
       'carta_conducao_numero','carta_conducao_categorias','carta_conducao_validade'
     ] OR v_niss IS NOT NULL THEN
    INSERT INTO public.pessoas_identificacao (
      pessoa_id, organization_id,
      tipo_documento, numero_documento, validade_documento, nif, niss,
      carta_conducao_numero, carta_conducao_categorias, carta_conducao_validade
    ) VALUES (
      v_pessoa_id, v_org,
      public.hr_json_texto(p_dados, 'tipo_documento'),
      public.hr_json_texto(p_dados, 'numero_documento'),
      public.hr_json_texto(p_dados, 'validade_documento')::date,
      public.hr_json_texto(p_dados, 'nif'),
      v_niss,
      public.hr_json_texto(p_dados, 'carta_conducao_numero'),
      public.hr_json_texto(p_dados, 'carta_conducao_categorias'),
      public.hr_json_texto(p_dados, 'carta_conducao_validade')::date
    )
    ON CONFLICT (pessoa_id) DO UPDATE SET
      tipo_documento = CASE WHEN p_dados ? 'tipo_documento'
        THEN EXCLUDED.tipo_documento ELSE pessoas_identificacao.tipo_documento END,
      numero_documento = CASE WHEN p_dados ? 'numero_documento'
        THEN EXCLUDED.numero_documento ELSE pessoas_identificacao.numero_documento END,
      validade_documento = CASE WHEN p_dados ? 'validade_documento'
        THEN EXCLUDED.validade_documento ELSE pessoas_identificacao.validade_documento END,
      nif = CASE WHEN p_dados ? 'nif'
        THEN EXCLUDED.nif ELSE pessoas_identificacao.nif END,
      niss = CASE WHEN v_niss IS NOT NULL
        THEN EXCLUDED.niss ELSE pessoas_identificacao.niss END,
      carta_conducao_numero = CASE WHEN p_dados ? 'carta_conducao_numero'
        THEN EXCLUDED.carta_conducao_numero ELSE pessoas_identificacao.carta_conducao_numero END,
      carta_conducao_categorias = CASE WHEN p_dados ? 'carta_conducao_categorias'
        THEN EXCLUDED.carta_conducao_categorias ELSE pessoas_identificacao.carta_conducao_categorias END,
      carta_conducao_validade = CASE WHEN p_dados ? 'carta_conducao_validade'
        THEN EXCLUDED.carta_conducao_validade ELSE pessoas_identificacao.carta_conducao_validade END,
      updated_at = now();
  END IF;

  IF v_niss IS NOT NULL THEN
    PERFORM public.hr_registar_acesso_sensivel(v_pessoa_id, v_org, 'niss', 'alterar');
  END IF;

  v_linha1 := public.hr_json_texto(p_dados, 'morada_linha1');
  v_pais   := upper(public.hr_json_texto(p_dados, 'morada_pais'));

  IF v_pais IS NOT NULL AND v_pais !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'pais_invalido' USING ERRCODE = 'HRA15';
  END IF;

  IF p_dados ?| ARRAY[
       'morada_linha1','morada_linha2','morada_codigo_postal',
       'morada_localidade','morada_distrito','morada_pais'
     ] THEN
    UPDATE public.pessoas_moradas
       SET linha1 = CASE WHEN v_linha1 IS NOT NULL THEN v_linha1 ELSE pessoas_moradas.linha1 END,
           linha2 = CASE WHEN p_dados ? 'morada_linha2'
             THEN public.hr_json_texto(p_dados, 'morada_linha2') ELSE pessoas_moradas.linha2 END,
           codigo_postal = CASE WHEN p_dados ? 'morada_codigo_postal'
             THEN public.hr_json_texto(p_dados, 'morada_codigo_postal') ELSE pessoas_moradas.codigo_postal END,
           localidade = CASE WHEN p_dados ? 'morada_localidade'
             THEN public.hr_json_texto(p_dados, 'morada_localidade') ELSE pessoas_moradas.localidade END,
           distrito = CASE WHEN p_dados ? 'morada_distrito'
             THEN public.hr_json_texto(p_dados, 'morada_distrito') ELSE pessoas_moradas.distrito END,
           pais = CASE WHEN v_pais IS NOT NULL THEN v_pais ELSE pessoas_moradas.pais END,
           updated_at = now()
     WHERE pessoa_id = v_pessoa_id AND organization_id = v_org AND tipo = 'residencia';

    IF NOT FOUND AND v_linha1 IS NOT NULL THEN
      SELECT NOT EXISTS (
        SELECT 1 FROM public.pessoas_moradas
         WHERE pessoa_id = v_pessoa_id AND is_principal
      ) INTO v_principal;

      INSERT INTO public.pessoas_moradas (
        pessoa_id, organization_id, tipo, linha1, linha2,
        codigo_postal, localidade, distrito, pais, is_principal
      ) VALUES (
        v_pessoa_id, v_org, 'residencia',
        v_linha1,
        public.hr_json_texto(p_dados, 'morada_linha2'),
        public.hr_json_texto(p_dados, 'morada_codigo_postal'),
        public.hr_json_texto(p_dados, 'morada_localidade'),
        public.hr_json_texto(p_dados, 'morada_distrito'),
        coalesce(v_pais, 'PT'),
        v_principal
      );
    END IF;
  END IF;

  -- ---- pessoas_fardamento --------------------------------------------------
  IF p_dados ?| ARRAY[
       'tamanho_cima','tamanho_cima_detalhe','tamanho_baixo','tamanho_baixo_detalhe',
       'tamanho_calcado','tamanho_calcado_detalhe'
     ] THEN
    INSERT INTO public.pessoas_fardamento (
      pessoa_id, organization_id,
      tamanho_cima, tamanho_cima_detalhe, tamanho_baixo, tamanho_baixo_detalhe,
      tamanho_calcado, tamanho_calcado_detalhe
    ) VALUES (
      v_pessoa_id, v_org,
      public.hr_json_texto(p_dados, 'tamanho_cima'),
      public.hr_json_texto(p_dados, 'tamanho_cima_detalhe'),
      public.hr_json_texto(p_dados, 'tamanho_baixo'),
      public.hr_json_texto(p_dados, 'tamanho_baixo_detalhe'),
      public.hr_json_texto(p_dados, 'tamanho_calcado'),
      public.hr_json_texto(p_dados, 'tamanho_calcado_detalhe')
    )
    ON CONFLICT (pessoa_id, organization_id) DO UPDATE SET
      tamanho_cima = CASE WHEN p_dados ? 'tamanho_cima'
        THEN EXCLUDED.tamanho_cima ELSE pessoas_fardamento.tamanho_cima END,
      tamanho_cima_detalhe = CASE WHEN p_dados ? 'tamanho_cima_detalhe'
        THEN EXCLUDED.tamanho_cima_detalhe ELSE pessoas_fardamento.tamanho_cima_detalhe END,
      tamanho_baixo = CASE WHEN p_dados ? 'tamanho_baixo'
        THEN EXCLUDED.tamanho_baixo ELSE pessoas_fardamento.tamanho_baixo END,
      tamanho_baixo_detalhe = CASE WHEN p_dados ? 'tamanho_baixo_detalhe'
        THEN EXCLUDED.tamanho_baixo_detalhe ELSE pessoas_fardamento.tamanho_baixo_detalhe END,
      tamanho_calcado = CASE WHEN p_dados ? 'tamanho_calcado'
        THEN EXCLUDED.tamanho_calcado ELSE pessoas_fardamento.tamanho_calcado END,
      tamanho_calcado_detalhe = CASE WHEN p_dados ? 'tamanho_calcado_detalhe'
        THEN EXCLUDED.tamanho_calcado_detalhe ELSE pessoas_fardamento.tamanho_calcado_detalhe END,
      updated_at = now();
  END IF;

  -- Filiacao sindical deixou de se escrever por aqui (20261202080000).

  -- O IBAN vem do Vault (v_conta_num, lido no prefixo).
  v_conta_tit := public.hr_json_texto(p_dados, 'conta_titular');
  v_conta_bco := public.hr_json_texto(p_dados, 'conta_banco');
  -- O BIC (coluna swift) viaja como conta_swift. Maiusculas e sem espacos, como o IBAN.
  v_conta_bic := nullif(upper(regexp_replace(coalesce(public.hr_json_texto(p_dados, 'conta_swift'), ''), '[[:space:]]', '', 'g')), '');

  IF v_conta_num IS NOT NULL THEN
    v_conta_num := upper(regexp_replace(v_conta_num, '[[:space:]]', '', 'g'));

    IF NOT public.hr_iban_valido(v_conta_num) THEN
      RAISE EXCEPTION 'iban_invalido' USING ERRCODE = 'HRA16';
    END IF;
  END IF;

  -- O BIC valida-se mesmo sem IBAN: a pessoa pode dar um e deixar o outro para a ficha.
  IF v_conta_bic IS NOT NULL AND NOT public.hr_bic_valido(v_conta_bic) THEN
    RAISE EXCEPTION 'bic_invalido' USING ERRCODE = 'HRA18';
  END IF;

  -- O portao: so trava o que a PESSOA tem de preencher no convite (origem
  -- pessoa, posicao convite). Os de posicao ficha NUNCA travam o convite.
  SELECT array_agg(pend.codigo ORDER BY pend.codigo)
    INTO v_faltam
    FROM public.hr_admissao_pendencias(v_pessoa_id) AS pend
   WHERE pend.origem = 'pessoa'
     AND pend.posicao = 'convite'
     AND NOT (pend.codigo = 'conta_numero'  AND v_conta_num IS NOT NULL)
     AND NOT (pend.codigo = 'conta_titular' AND v_conta_num IS NOT NULL AND v_conta_tit IS NOT NULL)
     AND NOT (pend.codigo = 'conta_banco'   AND v_conta_num IS NOT NULL AND v_conta_bco IS NOT NULL)
     AND NOT (pend.codigo = 'conta_bic'     AND v_conta_bic IS NOT NULL);

  IF v_faltam IS NOT NULL AND array_length(v_faltam, 1) > 0 THEN
    RAISE EXCEPTION 'admissao_incompleta' USING ERRCODE = 'HRA17', DETAIL = array_to_string(v_faltam, ',');
  END IF;

  -- >>> anexos_em_falta (20270107000000): com IBAN indicado, o comprovativo de
  --     IBAN tem de estar ligado. Regra unica em hr_convite_comprovativo_iban_em_falta,
  --     com o estado lido no prefixo (o trigger de used_at ja o mudou na linha).
  IF public.hr_convite_comprovativo_iban_em_falta(v_c.id, v_c.estado) THEN
    RAISE EXCEPTION 'anexos_em_falta' USING ERRCODE = 'HRA86', DETAIL = 'comprovativo_iban';
  END IF;
  -- <<< anexos_em_falta

  IF v_conta_num IS NOT NULL THEN
    SELECT b.id, b.conta_secret_id INTO v_conta_lin
    FROM public.pessoas_dados_bancarios b
    WHERE b.pessoa_id = v_pessoa_id;

    IF v_conta_lin.id IS NOT NULL AND v_conta_lin.conta_secret_id IS NOT NULL THEN
      PERFORM vault.update_secret(v_conta_lin.conta_secret_id, v_conta_num);
      v_secret_id := v_conta_lin.conta_secret_id;
    ELSE
      v_secret_id := vault.create_secret(
        v_conta_num,
        'hr_conta:' || v_pessoa_id::text || ':' || gen_random_uuid()::text,
        'Conta bancaria de RH da pessoa ' || v_pessoa_id::text || ' (via convite de admissao)'
      );
    END IF;

    INSERT INTO public.pessoas_dados_bancarios (
      pessoa_id, organization_id, titular, banco, agencia, formato_conta,
      conta_secret_id, conta_ultimos4, conta_pais, swift, is_principal
    ) VALUES (
      v_pessoa_id, v_org,
      v_conta_tit,
      v_conta_bco,
      public.hr_json_texto(p_dados, 'conta_agencia'),
      'iban',
      v_secret_id, right(v_conta_num, 4), left(v_conta_num, 2),
      v_conta_bic, true
    )
    ON CONFLICT (pessoa_id) DO UPDATE SET
      titular = CASE WHEN v_conta_tit IS NOT NULL
        THEN EXCLUDED.titular ELSE pessoas_dados_bancarios.titular END,
      banco = CASE WHEN v_conta_bco IS NOT NULL
        THEN EXCLUDED.banco ELSE pessoas_dados_bancarios.banco END,
      agencia = CASE WHEN p_dados ? 'conta_agencia'
        THEN EXCLUDED.agencia ELSE pessoas_dados_bancarios.agencia END,
      formato_conta = EXCLUDED.formato_conta,
      conta_secret_id = EXCLUDED.conta_secret_id,
      conta_ultimos4 = EXCLUDED.conta_ultimos4,
      conta_pais = EXCLUDED.conta_pais,
      -- Um BIC dado grava-se; um BIC em branco NUNCA apaga o que ja esta na ficha
      -- (igual ao ramo so-BIC, que so corre com BIC preenchido); e um swift legado
      -- que nao e um BIC (o CHECK antigo aceitava ABCD1234) passa a NULL em vez de
      -- fazer este UPDATE falhar com 23514 contra o CHECK NOT VALID.
      swift = CASE
        WHEN v_conta_bic IS NOT NULL THEN EXCLUDED.swift
        WHEN public.hr_bic_valido(pessoas_dados_bancarios.swift) THEN pessoas_dados_bancarios.swift
        ELSE NULL END,
      updated_at = now();

    PERFORM public.hr_registar_acesso_sensivel(v_pessoa_id, v_org, 'conta_bancaria', 'alterar');
  END IF;

  -- So o BIC, sem IBAN. O BIC identifica o banco e nao a conta: nao e sensivel,
  -- por isso nao leva segredo no Vault nem auditoria de acesso. conta_secret_id e
  -- conta_ultimos4 ficam NULL (o CHECK de segredo e mascara aceita os dois a NULL) e
  -- a pendencia conta_numero continua.
  IF v_conta_num IS NULL AND v_conta_bic IS NOT NULL THEN
    INSERT INTO public.pessoas_dados_bancarios (
      pessoa_id, organization_id, swift, is_principal
    ) VALUES (
      v_pessoa_id, v_org, v_conta_bic, true
    )
    ON CONFLICT (pessoa_id) DO UPDATE SET
      swift = EXCLUDED.swift,
      updated_at = now();
  END IF;

  -- Os ficheiros ligados ao convite passam a fazer parte da ficha, NA MESMA
  -- transaccao: qualquer RAISE acima desfaz tudo e os ficheiros continuam
  -- ligados ao convite (e ao rascunho). A propria promover isola a promocao
  -- numa subtransaccao: uma falha dela nunca desfaz a admissao.
  PERFORM public.hr_convite_anexos_promover(v_convite_id);

  RETURN v_pessoa_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_submeter(text, text, jsonb, text, inet, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_admissao_submeter(text, text, jsonb, text, inet, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_convite_admissao_submeter(text, text, jsonb, text, inet, text) IS
'Portal de admissao: submete o formulario, escreve na ficha e promove os anexos ligados (o trigger used_at_transitorio passa o processo a submetida e fecha o portal). So service_role (a Edge convite-admissao). Exige sessao OTP valida (HRA51/52/53); estados aceites em_preenchimento e devolvida (HRA38); em devolvida so as chaves devolvidas (HRA47). NISS e IBAN lidos SO do Vault; niss, iban ou conta_numero em p_dados sao recusados (HRA10). Assinatura obrigatoria, ate 200 caracteres (HRA10). Com IBAN indicado, sem comprovativo de IBAN valido (hr_convite_comprovativo_iban_em_falta) recusa com anexos_em_falta (HRA86, DETAIL comprovativo_iban), logo a seguir ao portao HRA17. Devolve o id da pessoa. Desde 20261231810000; anexos_em_falta desde 20270107000000.';


-- ==============================================================================
-- 6. Portal (leitura): o corpo em vigor (20270103200000) mais tamanho_bytes e
--    mime_type nos anexos, anexos_obrigatorios, anexos_em_falta, e
--    documentos_editaveis so com o comprovativo de IBAN. So acrescentos.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_convite_admissao_portal_ler(p_token_hash text, p_sessao_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c_tecto constant integer := 10;
  -- Copia da lista branca de hr_convite_rascunho_valido (20261210420000); o
  -- bloco de conferir compara-a, chave a chave, com o comportamento da funcao.
  c_chaves constant text[] := ARRAY[
    'assinatura_nome', 'carta_conducao_categorias', 'carta_conducao_numero',
    'carta_conducao_validade', 'codigo_postal', 'conjuge_situacao_profissional',
    'conta_banco', 'conta_bic', 'conta_formato', 'conta_swift', 'conta_titular',
    'data_nascimento', 'dependentes', 'dependentes_deficientes', 'distrito',
    'email_pessoal', 'estado_civil', 'genero', 'habilitacao_academica',
    'habilitacao_data_conclusao', 'linha1', 'linha2', 'localidade',
    'morada_codigo_postal', 'morada_distrito', 'morada_linha1', 'morada_linha2',
    'morada_localidade', 'morada_pais', 'nacionalidade', 'naturalidade_concelho',
    'naturalidade_freguesia', 'naturalidade_pais', 'nif', 'numero_documento',
    'pais', 'tamanho_baixo', 'tamanho_baixo_detalhe', 'tamanho_calcado',
    'tamanho_calcado_detalhe', 'tamanho_cima', 'tamanho_cima_detalhe',
    'telefone_pessoal', 'tipo_documento', 'validade_documento'];
  c_tipos constant text[] := ARRAY['cartao_cidadao', 'comprovativo_iban', 'fotografia'];
  v_c          record;
  v_niss4      text;
  v_iban4      text;
  v_campos_dev jsonb;
  v_docs_dev   jsonb;
  v_editaveis  jsonb;
  v_docs       jsonb;
  v_obrig      jsonb;
  v_anexos     jsonb;
  v_rasc       jsonb;
  v_email_f    text;
  v_tel_f      text;
  v_iban_obrig  boolean;
  v_iban_falta  boolean;
BEGIN
  SELECT c.id, c.organization_id, c.pessoa_id, c.estado, c.valid_until, c.used_at, c.revoked_at,
         c.portal_encerrado_em, c.attempts, c.rascunho, c.devolucao, c.rejeicao_mensagem,
         c.niss_segredo_id, c.iban_segredo_id
    INTO v_c
    FROM public.pessoas_convites_admissao c
   WHERE c.token_hash = p_token_hash
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  IF v_c.portal_encerrado_em IS NOT NULL OR v_c.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'convite_ja_usado' USING ERRCODE = 'HRA02';
  ELSIF v_c.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'convite_revogado' USING ERRCODE = 'HRA03';
  ELSIF v_c.valid_until <= now() THEN
    RAISE EXCEPTION 'convite_expirado' USING ERRCODE = 'HRA04';
  ELSIF v_c.attempts >= c_tecto THEN
    RAISE EXCEPTION 'convite_bloqueado' USING ERRCODE = 'HRA05';
  END IF;

  PERFORM public.hr_convite_sessao_exigir(v_c.id, p_sessao_hash);

  -- As mascaras calculam-se aqui, a partir do Vault; o valor nunca sai.
  IF v_c.niss_segredo_id IS NOT NULL THEN
    SELECT right(s.decrypted_secret, 4) INTO v_niss4 FROM vault.decrypted_secrets s WHERE s.id = v_c.niss_segredo_id;
  END IF;
  IF v_c.iban_segredo_id IS NOT NULL THEN
    SELECT right(s.decrypted_secret, 4) INTO v_iban4 FROM vault.decrypted_secrets s WHERE s.id = v_c.iban_segredo_id;
  END IF;

  v_campos_dev := CASE WHEN jsonb_typeof(v_c.devolucao -> 'campos') = 'object'
                       THEN v_c.devolucao -> 'campos' ELSE '{}'::jsonb END;
  v_docs_dev   := CASE WHEN jsonb_typeof(v_c.devolucao -> 'documentos') = 'array'
                       THEN v_c.devolucao -> 'documentos' ELSE '[]'::jsonb END;

  IF v_c.estado = 'em_preenchimento' THEN
    v_editaveis := to_jsonb(c_chaves || ARRAY['niss', 'iban']);
    v_docs      := to_jsonb(c_tipos);
  ELSIF v_c.estado = 'devolvida' THEN
    SELECT coalesce(jsonb_agg(k.chave ORDER BY k.chave), '[]'::jsonb) INTO v_editaveis
      FROM jsonb_object_keys(v_campos_dev) AS k(chave);
    SELECT coalesce(jsonb_agg(d.tipo ORDER BY d.tipo), '[]'::jsonb) INTO v_docs
      FROM jsonb_array_elements_text(v_docs_dev) AS d(tipo)
     WHERE d.tipo = ANY (c_tipos);
  ELSE
    v_editaveis := '[]'::jsonb;
    v_docs      := '[]'::jsonb;
  END IF;

  -- >>> anexos_iban (20270107000000): so o comprovativo de IBAN esta aberto nesta
  --     fase; e obrigatorio quando ha IBAN, pela mesma regra da submissao.
  SELECT coalesce(jsonb_agg(d.tipo ORDER BY d.tipo), '[]'::jsonb) INTO v_docs
    FROM jsonb_array_elements_text(v_docs) AS d(tipo)
   WHERE d.tipo = 'comprovativo_iban';
  v_iban_falta := v_c.estado IN ('em_preenchimento', 'devolvida')
                  AND public.hr_convite_comprovativo_iban_em_falta(v_c.id, v_c.estado);
  v_iban_obrig := v_c.iban_segredo_id IS NOT NULL
                  AND (v_c.estado = 'em_preenchimento'
                       OR (v_c.estado = 'devolvida'
                           AND (v_iban_falta
                                OR v_campos_dev ? 'iban'
                                OR v_docs_dev ? 'comprovativo_iban')));
  IF v_iban_falta AND NOT (v_docs ? 'comprovativo_iban') THEN
    v_docs := v_docs || '["comprovativo_iban"]'::jsonb;
  END IF;
  -- <<< anexos_iban

  SELECT coalesce(jsonb_agg(o.codigo ORDER BY o.codigo), '[]'::jsonb) INTO v_obrig
    FROM public.hr_admissao_campos_obrigatorios_org(v_c.organization_id) o
   WHERE o.origem = 'pessoa' AND o.posicao = 'convite';

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'tipo', a.tipo, 'nome', a.nome_original,
                                               'estado', a.estado, 'tamanho_bytes', a.tamanho_bytes, 'mime_type', a.mime_type) ORDER BY a.criado_em, a.id), '[]'::jsonb)
    INTO v_anexos
    FROM public.pessoas_anexos a
   WHERE a.convite_id = v_c.id
     AND a.organization_id = v_c.organization_id
     AND a.estado IN ('pendente', 'ligado');

  -- O e-mail e o telefone pessoais que o RH ja pos na ficha: valor por omissao enquanto a pessoa preenche (so quando o
  -- rascunho ainda nao tem um valor para eles). Nada se grava no rascunho.
  v_rasc := coalesce(v_c.rascunho, '{}'::jsonb);
  IF v_c.estado IN ('convidada', 'em_preenchimento') THEN
    SELECT nullif(btrim(p.email_pessoal), '') INTO v_email_f
      FROM public.pessoas p
     WHERE p.id = v_c.pessoa_id AND p.organization_id = v_c.organization_id AND p.deleted_at IS NULL;
    SELECT nullif(btrim(d.telefone_pessoal), '') INTO v_tel_f
      FROM public.pessoas_dados_pessoais d
     WHERE d.pessoa_id = v_c.pessoa_id AND d.organization_id = v_c.organization_id;
    IF v_email_f IS NOT NULL AND nullif(btrim(coalesce(v_rasc ->> 'email_pessoal', '')), '') IS NULL THEN
      v_rasc := v_rasc || jsonb_build_object('email_pessoal', v_email_f);
    END IF;
    IF v_tel_f IS NOT NULL AND nullif(btrim(coalesce(v_rasc ->> 'telefone_pessoal', '')), '') IS NULL THEN
      v_rasc := v_rasc || jsonb_build_object('telefone_pessoal', v_tel_f);
    END IF;
  END IF;

  -- Nunca o motivo interno, o email, o token, a sessao nem o OTP.
  RETURN jsonb_build_object(
    'estado',               v_c.estado,
    'rascunho',             v_rasc,
    'campos_obrigatorios',  v_obrig,
    'campos_editaveis',     v_editaveis,
    'documentos_editaveis', v_docs,
    'niss_ultimos4',        v_niss4,
    'iban_ultimos4',        v_iban4,
    'devolucao',            CASE WHEN v_c.devolucao IS NULL THEN NULL
                                 ELSE jsonb_build_object('campos', v_campos_dev,
                                                         'documentos', v_docs_dev,
                                                         'observacao', v_c.devolucao -> 'observacao') END,
    'anexos',               v_anexos,
    'anexos_obrigatorios',  CASE WHEN v_iban_obrig THEN '["comprovativo_iban"]'::jsonb ELSE '[]'::jsonb END,
    'anexos_em_falta',      CASE WHEN v_iban_falta THEN '["comprovativo_iban"]'::jsonb ELSE '[]'::jsonb END,
    'rejeicao_mensagem',    CASE WHEN v_c.estado = 'rejeitada' THEN v_c.rejeicao_mensagem END);
END;
$function$;

COMMENT ON FUNCTION public.rpc_hr_convite_admissao_portal_ler(text, text) IS
'Portal de admissao: leitura do processo com sessao OTP. So service_role. Devolve estado, rascunho (com o e-mail e o telefone da ficha por omissao), campos_obrigatorios, campos_editaveis, documentos_editaveis (nesta fase so comprovativo_iban; em devolvida tambem quando a regra o exige), mascaras do NISS e do IBAN, devolucao, anexos pendentes e ligados {id, tipo, nome, estado, tamanho_bytes, mime_type}, anexos_obrigatorios e anexos_em_falta (hr_convite_comprovativo_iban_em_falta) e a mensagem de rejeicao. Acrescentos de anexos desde 20270107000000.';


-- ==============================================================================
-- Conferir: se algo nao bater, a migration inteira falha
-- ==============================================================================
DO $conferir$
DECLARE
  -- O que esta migration acrescentou ao submeter e ao portal_ler (texto exacto).
  c_bloco_sub constant text := $bloco$
  -- >>> anexos_em_falta (20270107000000): com IBAN indicado, o comprovativo de
  --     IBAN tem de estar ligado. Regra unica em hr_convite_comprovativo_iban_em_falta,
  --     com o estado lido no prefixo (o trigger de used_at ja o mudou na linha).
  IF public.hr_convite_comprovativo_iban_em_falta(v_c.id, v_c.estado) THEN
    RAISE EXCEPTION 'anexos_em_falta' USING ERRCODE = 'HRA86', DETAIL = 'comprovativo_iban';
  END IF;
  -- <<< anexos_em_falta
$bloco$;
  c_p1 constant text := $p1$  v_iban_obrig  boolean;
  v_iban_falta  boolean;
$p1$;
  c_p2 constant text := $p2$, 'tamanho_bytes', a.tamanho_bytes, 'mime_type', a.mime_type$p2$;
  c_p3 constant text := $p3$
  -- >>> anexos_iban (20270107000000): so o comprovativo de IBAN esta aberto nesta
  --     fase; e obrigatorio quando ha IBAN, pela mesma regra da submissao.
  SELECT coalesce(jsonb_agg(d.tipo ORDER BY d.tipo), '[]'::jsonb) INTO v_docs
    FROM jsonb_array_elements_text(v_docs) AS d(tipo)
   WHERE d.tipo = 'comprovativo_iban';
  v_iban_falta := v_c.estado IN ('em_preenchimento', 'devolvida')
                  AND public.hr_convite_comprovativo_iban_em_falta(v_c.id, v_c.estado);
  v_iban_obrig := v_c.iban_segredo_id IS NOT NULL
                  AND (v_c.estado = 'em_preenchimento'
                       OR (v_c.estado = 'devolvida'
                           AND (v_iban_falta
                                OR v_campos_dev ? 'iban'
                                OR v_docs_dev ? 'comprovativo_iban')));
  IF v_iban_falta AND NOT (v_docs ? 'comprovativo_iban') THEN
    v_docs := v_docs || '["comprovativo_iban"]'::jsonb;
  END IF;
  -- <<< anexos_iban
$p3$;
  c_p4 constant text := $p4$
    'anexos_obrigatorios',  CASE WHEN v_iban_obrig THEN '["comprovativo_iban"]'::jsonb ELSE '[]'::jsonb END,
    'anexos_em_falta',      CASE WHEN v_iban_falta THEN '["comprovativo_iban"]'::jsonb ELSE '[]'::jsonb END,$p4$;
  v_alvo    oid;
  v_rotulo  text;
  v_tipo    text;
  v_secdef  boolean;
  v_vol     text;
  v_cfg     text[];
  v_acl     aclitem[];
  v_dono    oid;
  v_outros  text[];
  v_src     text;
  v_bloco   text;
  v_n       bigint;
  v_nome    text;
BEGIN
  -- C1. As assinaturas antigas e as funcoes largadas sairam; as novas existem.
  IF to_regprocedure('public.rpc_hr_convite_anexo_reservar(text, text, text, bigint, text, inet)') IS NOT NULL
     OR to_regprocedure('public.rpc_hr_convite_anexo_contexto(text, uuid)') IS NOT NULL
     OR to_regprocedure('public.rpc_hr_convite_anexo_ligar(text, uuid, text, text, bigint, text)') IS NOT NULL
     OR to_regprocedure('public.rpc_hr_convite_anexo_descartar(text, uuid, text)') IS NOT NULL THEN
    RAISE EXCEPTION 'C1: uma assinatura antiga das RPCs de anexos continua a existir.';
  END IF;
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname IN ('rpc_hr_convite_anexos_listar', 'hr_convite_anexos_motivo');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'C1: rpc_hr_convite_anexos_listar ou hr_convite_anexos_motivo continua a existir.';
  END IF;

  -- C2. Uma so funcao por nome (o PostgREST nao pode escolher entre duas).
  FOREACH v_nome IN ARRAY ARRAY['rpc_hr_convite_anexo_reservar', 'rpc_hr_convite_anexo_contexto',
                                'rpc_hr_convite_anexo_ligar', 'rpc_hr_convite_anexo_descartar',
                                'hr_convite_anexos_abrir', 'hr_convite_comprovativo_iban_em_falta',
                                'rpc_hr_convite_admissao_submeter', 'rpc_hr_convite_admissao_portal_ler'] LOOP
    SELECT count(*) INTO v_n
      FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public' AND p.proname = v_nome;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'C2: ficaram % funcoes public.%.', v_n, v_nome;
    END IF;
  END LOOP;

  -- C3. Assinaturas exactas, SECURITY DEFINER, search_path e EXECUTE so de
  --     service_role (rpc); internas sem definer e sem EXECUTE para ninguem.
  FOR v_alvo, v_rotulo, v_tipo IN
    SELECT to_regprocedure(x.s)::oid, x.s, x.t FROM (VALUES
      ('public.rpc_hr_convite_anexo_reservar(text, text, text, text, bigint, text, inet)', 'rpc_vazio'),
      ('public.rpc_hr_convite_anexo_contexto(text, text, uuid)', 'rpc_vazio'),
      ('public.rpc_hr_convite_anexo_ligar(text, text, uuid, text, text, bigint, text)', 'rpc_vazio'),
      ('public.rpc_hr_convite_anexo_descartar(text, text, uuid, text)', 'rpc_vazio'),
      ('public.rpc_hr_convite_admissao_submeter(text, text, jsonb, text, inet, text)', 'rpc_public'),
      ('public.rpc_hr_convite_admissao_portal_ler(text, text)', 'rpc_public'),
      ('public.hr_convite_anexos_abrir(text, text, boolean)', 'interna'),
      ('public.hr_convite_comprovativo_iban_em_falta(uuid, text)', 'interna')
    ) AS x(s, t)
  LOOP
    IF v_alvo IS NULL THEN
      RAISE EXCEPTION 'C3: % nao existe com esta assinatura.', v_rotulo;
    END IF;
    SELECT p.prosecdef, p.provolatile::text, p.proconfig, p.proacl, p.proowner
      INTO v_secdef, v_vol, v_cfg, v_acl, v_dono
      FROM pg_proc p WHERE p.oid = v_alvo;

    IF v_tipo = 'rpc_vazio' OR v_tipo = 'interna' THEN
      IF NOT (coalesce(v_cfg, '{}'::text[]) && ARRAY['search_path=""', 'search_path=']::text[]) THEN
        RAISE EXCEPTION 'C3 %: search_path nao ficou vazio (proconfig %).', v_rotulo, coalesce(array_to_string(v_cfg, ';'), 'vazio');
      END IF;
    ELSE
      IF NOT ('search_path=public, pg_temp' = ANY (coalesce(v_cfg, '{}'::text[]))) THEN
        RAISE EXCEPTION 'C3 %: search_path nao ficou public, pg_temp (proconfig %).', v_rotulo, coalesce(array_to_string(v_cfg, ';'), 'vazio');
      END IF;
    END IF;

    IF v_tipo = 'interna' THEN
      IF v_secdef IS DISTINCT FROM false THEN
        RAISE EXCEPTION 'C3 %: a interna nao devia ser SECURITY DEFINER.', v_rotulo;
      END IF;
      IF v_acl IS NULL THEN
        RAISE EXCEPTION 'C3 %: proacl nulo (= EXECUTE para PUBLIC).', v_rotulo;
      END IF;
      SELECT array_agg(DISTINCT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END)
        INTO v_outros
        FROM aclexplode(v_acl) AS a
       WHERE a.grantee <> v_dono AND a.privilege_type = 'EXECUTE';
      IF v_outros IS NOT NULL THEN
        RAISE EXCEPTION 'C3 %: a interna tem EXECUTE para: %.', v_rotulo, array_to_string(v_outros, ',');
      END IF;
    ELSE
      IF v_secdef IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'C3 %: nao ficou SECURITY DEFINER.', v_rotulo;
      END IF;
      IF v_vol IS DISTINCT FROM 'v' THEN
        RAISE EXCEPTION 'C3 %: nao ficou VOLATILE (provolatile %).', v_rotulo, v_vol;
      END IF;
      SELECT array_agg(DISTINCT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END)
        INTO v_outros
        FROM aclexplode(v_acl) AS a
       WHERE a.grantee <> v_dono AND a.privilege_type = 'EXECUTE';
      IF v_outros IS DISTINCT FROM ARRAY['service_role']::text[] THEN
        RAISE EXCEPTION 'C3 %: EXECUTE devia ser so de service_role, e de: %.', v_rotulo, coalesce(array_to_string(v_outros, ','), 'ninguem (proacl nulo = PUBLIC)');
      END IF;
    END IF;

    IF has_function_privilege('anon', v_alvo, 'EXECUTE')
       OR has_function_privilege('authenticated', v_alvo, 'EXECUTE') THEN
      RAISE EXCEPTION 'C3 %: anon ou authenticated executam a funcao.', v_rotulo;
    END IF;
  END LOOP;

  -- C4. As 4 RPCs abrem pelo abrir (sessao); o descartar nao abre nos motivos internos.
  FOREACH v_nome IN ARRAY ARRAY['rpc_hr_convite_anexo_reservar', 'rpc_hr_convite_anexo_contexto',
                                'rpc_hr_convite_anexo_ligar', 'rpc_hr_convite_anexo_descartar'] LOOP
    SELECT p.prosrc INTO v_src
      FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public' AND p.proname = v_nome;
    IF strpos(v_src, 'public.hr_convite_anexos_abrir(p_token_hash, p_sessao_hash, true)') = 0 THEN
      RAISE EXCEPTION 'C4: % nao abre por hr_convite_anexos_abrir com sessao.', v_nome;
    END IF;
  END LOOP;

  -- C5. hr_convite_sessao_exigir continua sem EXECUTE para ninguem alem do dono.
  v_alvo := to_regprocedure('public.hr_convite_sessao_exigir(uuid, text)');
  IF has_function_privilege('service_role', v_alvo, 'EXECUTE')
     OR has_function_privilege('anon', v_alvo, 'EXECUTE')
     OR has_function_privilege('authenticated', v_alvo, 'EXECUTE') THEN
    RAISE EXCEPTION 'C5: hr_convite_sessao_exigir ganhou EXECUTE para service_role, anon ou authenticated.';
  END IF;

  -- C6. O submeter novo e o em vigor mais EXACTAMENTE o bloco anexos_em_falta.
  SELECT replace(p.prosrc, E'\r', '') INTO v_src
    FROM pg_proc p WHERE p.oid = to_regprocedure('public.rpc_hr_convite_admissao_submeter(text, text, jsonb, text, inet, text)');
  v_bloco := replace(c_bloco_sub, E'\r', '');
  IF strpos(v_src, v_bloco) = 0 THEN
    RAISE EXCEPTION 'C6: o bloco anexos_em_falta nao esta no submeter novo.';
  END IF;
  IF strpos(v_src, v_bloco) < strpos(v_src, '''admissao_incompleta'' USING ERRCODE = ''HRA17''') THEN
    RAISE EXCEPTION 'C6: o bloco anexos_em_falta ficou antes do portao HRA17.';
  END IF;
  IF md5(replace(v_src, v_bloco, '')) IS DISTINCT FROM nullif(current_setting('hr_iban.md5_submeter', true), '') THEN
    RAISE EXCEPTION 'C6: o submeter novo nao e o em vigor mais o bloco anexos_em_falta (o corpo remoto difere de 20261231810000). Reler e refazer a copia.';
  END IF;

  -- C7. O portal_ler novo e o em vigor mais EXACTAMENTE os quatro acrescentos.
  SELECT replace(p.prosrc, E'\r', '') INTO v_src
    FROM pg_proc p WHERE p.oid = to_regprocedure('public.rpc_hr_convite_admissao_portal_ler(text, text)');
  IF strpos(v_src, replace(c_p1, E'\r', '')) = 0 OR strpos(v_src, replace(c_p2, E'\r', '')) = 0
     OR strpos(v_src, replace(c_p3, E'\r', '')) = 0 OR strpos(v_src, replace(c_p4, E'\r', '')) = 0 THEN
    RAISE EXCEPTION 'C7: falta um dos acrescentos no portal_ler novo.';
  END IF;
  v_src := replace(v_src, replace(c_p1, E'\r', ''), '');
  v_src := replace(v_src, replace(c_p2, E'\r', ''), '');
  v_src := replace(v_src, replace(c_p3, E'\r', ''), '');
  v_src := replace(v_src, replace(c_p4, E'\r', ''), '');
  IF md5(v_src) IS DISTINCT FROM nullif(current_setting('hr_iban.md5_portal_ler', true), '') THEN
    RAISE EXCEPTION 'C7: o portal_ler novo nao e o em vigor mais os acrescentos (o corpo remoto difere de 20270103200000). Reler e refazer a copia.';
  END IF;

  -- C8. A regra corre e, para um processo que nao existe, nao exige nada.
  IF public.hr_convite_comprovativo_iban_em_falta(gen_random_uuid(), 'em_preenchimento') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'C8: a regra devia dar false para um processo inexistente.';
  END IF;

  PERFORM set_config('hr_iban.md5_submeter', '', false);
  PERFORM set_config('hr_iban.md5_portal_ler', '', false);
END;
$conferir$;

NOTIFY pgrst, 'reload schema';
