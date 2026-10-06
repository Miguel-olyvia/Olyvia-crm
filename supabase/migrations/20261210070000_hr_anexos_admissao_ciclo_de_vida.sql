-- ==============================================================================
-- Anexos da admissao (3/4): o ciclo de vida dos ficheiros (promover, transferir,
-- limpar) e a redefinicao de submeter e criar.
--
-- POR APLICAR.
--
-- PRECISA DE CODIGO NOVO. A submissao do convite passa a promover os ficheiros
-- (quem os carrega e a Edge Function convite-admissao nova), a limpeza so tem
-- efeito com a Edge Function convite-admissao-limpeza (apaga os objectos do
-- Storage) e a ficha so mostra o resultado com hr-anexo-url e o ecra novos.
-- Sem o codigo novo esta migration e inofensiva (nao ha anexos para promover,
-- transferir ou limpar), mas nada fica a funcionar. Publicar na ordem: db push,
-- Edge Functions (convite-admissao, convite-admissao-limpeza, hr-anexo-url,
-- validate-upload), ecra.
--
--
-- -- O QUE FAZ ------------------------------------------------------------------
--
-- 1. hr_convite_anexos_promover(convite) -- INTERNA, sem GRANT a ninguem.
--    Corre dentro de submeter, como dono. Ligado passa a promovido (o convite_id
--    fica como historico); pendentes do convite passam a apagado
--    (upload_abandonado); a fotografia promovida vai para pessoas.fotografia_anexo_id
--    (pelo trigger de integridade); o cartao de cidadao e o comprovativo de IBAN
--    promovidos ficam auditados (anexo_cartao_cidadao e anexo_comprovativo_iban,
--    accao alterar, origem service_role, como o NISS no convite). NUNCA parte a
--    admissao: corre numa SUBTRANSACCAO (EXCEPTION WHEN OTHERS). Falhas possiveis
--    ha (o trigger da fotografia, o CHECK da auditoria que uma migration futura
--    pode reescrever sem os anexos): em falha desfaz o que fez, deixa os anexos em
--    `ligado` (invisiveis, ligados ao convite ja usado), regista um RAISE WARNING
--    (convite e SQLSTATE, nunca dados da pessoa) e devolve 0. A limpeza diaria
--    volta a tentar (passo d de hr_convite_anexos_limpar).
-- 2. hr_convite_anexos_transferir(pessoa, org, convite_novo, herdar) -- INTERNA.
--    Quando se substitui um convite, os ficheiros ligados do convite antigo mais
--    recente passam para o novo SE a regra do rascunho o permitir (mesmo email, e
--    o convite antigo nao acabou ha mais de 7 dias); tudo o resto activo fica
--    apagado (substituido). Assim os ficheiros nunca vao parar a outra caixa de
--    correio.
-- 3. hr_convite_anexos_limpar(tolerancia, limite),
--    hr_convite_anexos_objecto_removido(ids) e hr_convite_anexos_limpeza_estado()
--    -- so service_role. Marcam e devolvem o que a Edge Function
--    convite-admissao-limpeza apaga do Storage. Ficheiros so se apagam pela API do
--    Storage: a base MARCA, a Edge APAGA. O criterio e o MESMO de
--    hr_convites_admissao_limpar (7 dias depois de expirar ou revogar); essa funcao
--    nao se mexe.
--
--    INTERFACE PARA A EDGE DE LIMPEZA (muda face ao desenho anterior):
--    a) limpar devolve {anexo_id, bucket, caminho, caminho_quarentena,
--       caminhos_finais, tentativas}. bucket/caminho: o objecto da linha, quando a
--       linha esta apagada e o objecto por remover (senao nulos). caminho_quarentena:
--       a copia da quarentena por remover, em hr-documentos-quarantine (nulo se nao
--       ha, ou se e o mesmo objecto que caminho). caminhos_finais: para linhas
--       apagadas que nunca foram ligadas, os tres caminhos finais possiveis em
--       hr-documentos. Linhas LIGADAS ou PROMOVIDAS tambem vem (so com
--       caminho_quarentena) quando a copia da quarentena ficou por apagar.
--       tentativas conta as voltas em que a linha foi devolvida.
--    b) A Edge remove TUDO o que a linha traz (os que nao existem sao inofensivos) e
--       so passa a objecto_removido os ids em que TODAS as remocoes tiveram
--       sucesso; um id marca o que for aplicavel nos dois campos
--       (objecto_removido_em e quarentena_removida_em).
--    c) hr_convite_anexos_limpeza_estado() devolve jsonb {por_remover,
--       por_remover_antigos, quarentena_por_remover, promocoes_pendentes,
--       max_tentativas, job_agendado}: a Edge le-a no fim da volta e da o alarme
--       (captureError e resposta nao 2xx) se por_remover_antigos > 0 ou
--       promocoes_pendentes > 0, ou se falhar alguma remocao. Antes o alerta nao
--       existia: a Edge respondia sempre 200.
--    d) A ordem e por tentativas e cada volta incrementa limpeza_tentativas das
--       linhas que devolve: linhas que falham sempre ficam para o fim e nao
--       impedem as novas. Codigos de erro novos: nenhum (so devolvem dados).
--    e) Passo (d) de limpar: volta a promover anexos em `ligado` de convites JA
--       usados (promocao que falhou dentro de submeter).
-- 4. rpc_hr_convite_admissao_submeter: copia da versao de 20261210040000 (o BIC)
--    com TRES mudancas e mais nenhuma: guarda o id do convite que consome, e
--    promove os anexos imediatamente antes do RETURN, na mesma transaccao.
--    Qualquer RAISE anterior desfaz tudo, e os ficheiros continuam ligados ao
--    convite (e ao rascunho). Os anexos nao entram em p_dados, nao criam
--    pendencia e nao travam a submissao, e uma falha da promocao NAO desfaz a
--    admissao (a promocao tem a sua propria subtransaccao). A copia herda do BIC
--    (040000) o tratamento do swift no ramo do IBAN: BIC em branco nunca apaga o
--    da ficha, e um swift legado que nao e um BIC passa a NULL.
-- 5. rpc_hr_convite_admissao_criar: copia da versao de 20261210030000 com a
--    heranca dos ficheiros acrescentada. O fim de vida do convite antigo calcula-se
--    ANTES de o revogar (depois, revoked_at seria agora e a regra dos 7 dias
--    passaria sempre).
--
--
-- -- A LER COM ATENCAO ANTES DO PUSH -------------------------------------------
--
-- a) submeter e criar partem das versoes MAIS RECENTES por nome: submeter da
--    20261210040000, criar da 20261210030000. Confirmar com pg_get_functiondef no
--    remoto que nenhum outro ramo as redefiniu depois (a lista de migrations
--    remota, imediatamente antes do push).
-- b) Retencao dos anexos promovidos depois da saida da pessoa: FORA desta migration.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito (uma reversao na pasta e
-- aplicada pelo db push). A mao: repor submeter a partir de 20261210040000 e criar
-- a partir de 20261210030000; largar as quatro funcoes hr_convite_anexos_*.
--
-- Prerequisitos:
--   20261210030000  rpc_hr_convite_admissao_criar (5 argumentos)
--   20261210040000  rpc_hr_convite_admissao_submeter (com o BIC, HRA18)
--   20261210050000  pessoas_anexos (com caminho_quarentena, quarentena_removida_em e
--                   limpeza_tentativas), fotografia na ficha, auditoria de 10 valores
--   20261210060000  RPCs de anexos do convite
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas_anexos') IS NULL THEN
    RAISE EXCEPTION 'pessoas_anexos nao existe. Aplicar 20261210050000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_anexos'
       AND column_name IN ('caminho_quarentena', 'quarentena_removida_em', 'limpeza_tentativas')
     HAVING count(*) = 3
  ) THEN
    RAISE EXCEPTION 'pessoas_anexos nao tem caminho_quarentena, quarentena_removida_em e limpeza_tentativas. Aplicar 20261210050000 (esta revisao) primeiro.';
  END IF;

  IF to_regprocedure('public.hr_convite_anexos_motivo(timestamptz, timestamptz, timestamptz, integer)') IS NULL THEN
    RAISE EXCEPTION 'hr_convite_anexos_motivo nao existe. Aplicar 20261210060000 primeiro.';
  END IF;

  -- A versao vigente de submeter tem de ser a do BIC: e dela que esta migration parte.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_convite_admissao_submeter'
       AND p.pronargs = 5 AND p.prosrc LIKE '%HRA18%' AND p.prosrc LIKE '%HRA17%'
  ) THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_submeter (5 argumentos, com HRA17 e HRA18) nao existe. Aplicar 20261210040000 primeiro.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_convite_admissao_submeter'
       AND p.prosrc LIKE '%hr_convite_anexos_promover%'
  ) THEN
    RAISE NOTICE 'submeter ja promove os anexos; esta migration volta a escreve-la, sem diferenca.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_convite_admissao_criar'
       AND p.pronargs = 5 AND p.prosrc LIKE '%rascunho%'
  ) THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_criar (5 argumentos, com a heranca do rascunho) nao existe. Aplicar 20261210030000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_registar_acesso_sensivel' AND p.pronargs = 4
  ) THEN
    RAISE EXCEPTION 'hr_registar_acesso_sensivel(uuid, uuid, text, text) nao existe.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. hr_convite_anexos_promover (interna)
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
'INTERNA: sem GRANT a ninguem, so corre dentro de rpc_hr_convite_admissao_submeter (como dono) e na limpeza (hr_convite_anexos_limpar, passo d). Promove os anexos ligados do convite (convite_id fica como historico), abandona os pendentes, aponta a ficha para a fotografia e audita o cartao de cidadao e o comprovativo de IBAN (origem service_role). NUNCA parte a admissao: corre numa subtransaccao (EXCEPTION WHEN OTHERS); em qualquer falha desfaz o que tinha feito, deixa os anexos em ligado, regista um RAISE WARNING com o convite e o SQLSTATE (nunca dados da pessoa) e devolve 0. Idempotente: a limpeza volta a tenta-la. Devolve quantos promoveu. Desde 20261210070000.';

-- ==============================================================================
-- 2. hr_convite_anexos_transferir (interna)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_convite_anexos_transferir(
  p_pessoa_id    uuid,
  p_org          uuid,
  p_convite_novo uuid,
  p_herdar       boolean
)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_herdeiro uuid;
  v_n        integer := 0;
BEGIN
  -- O convite novo tem de ser desta pessoa e organizacao.
  IF NOT EXISTS (
    SELECT 1 FROM public.pessoas_convites_admissao c
     WHERE c.id = p_convite_novo
       AND c.pessoa_id = p_pessoa_id
       AND c.organization_id = p_org
  ) THEN
    RETURN 0;
  END IF;

  -- Herda so se a regra do rascunho o permitir (quem chama decide, com o mesmo
  -- email e o fim de vida de 7 dias). Herdam os LIGADOS do convite nao usado
  -- mais recente que tem anexos activos; os caminhos nao mudam.
  IF p_herdar THEN
    SELECT c.id
      INTO v_herdeiro
      FROM public.pessoas_convites_admissao c
     WHERE c.pessoa_id = p_pessoa_id
       AND c.organization_id = p_org
       AND c.used_at IS NULL
       AND c.id <> p_convite_novo
       AND EXISTS (SELECT 1 FROM public.pessoas_anexos a
                    WHERE a.convite_id = c.id AND a.estado IN ('pendente', 'ligado'))
     ORDER BY c.created_at DESC
     LIMIT 1;

    IF v_herdeiro IS NOT NULL THEN
      UPDATE public.pessoas_anexos
         SET convite_id = p_convite_novo
       WHERE convite_id = v_herdeiro
         AND estado = 'ligado';
      GET DIAGNOSTICS v_n = ROW_COUNT;
    END IF;
  END IF;

  -- Tudo o resto que ficou activo nos convites antigos nao usados (pendentes,
  -- ligados de convites mais antigos, ou todos se nao ha heranca) e substituido.
  UPDATE public.pessoas_anexos a
     SET estado         = 'apagado',
         apagado_em     = now(),
         apagado_motivo = 'substituido'
    FROM public.pessoas_convites_admissao c
   WHERE a.convite_id = c.id
     AND c.pessoa_id = p_pessoa_id
     AND c.organization_id = p_org
     AND c.used_at IS NULL
     AND c.id <> p_convite_novo
     AND a.estado IN ('pendente', 'ligado');

  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_convite_anexos_transferir(uuid, uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_convite_anexos_transferir(uuid, uuid, uuid, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.hr_convite_anexos_transferir(uuid, uuid, uuid, boolean) FROM authenticated;
REVOKE ALL ON FUNCTION public.hr_convite_anexos_transferir(uuid, uuid, uuid, boolean) FROM service_role;

COMMENT ON FUNCTION public.hr_convite_anexos_transferir(uuid, uuid, uuid, boolean) IS
'INTERNA: sem GRANT a ninguem, so corre dentro de rpc_hr_convite_admissao_criar (como dono). Quando se substitui um convite: com p_herdar, os anexos LIGADOS do convite nao usado mais recente (com anexos activos) passam para o convite novo (os caminhos nao mudam); tudo o resto activo nos convites antigos nao usados fica apagado (substituido). Devolve quantos passou. Desde 20261210070000.';

-- ==============================================================================
-- 3. hr_convite_anexos_limpar e hr_convite_anexos_objecto_removido
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_convite_anexos_limpar(
  p_dias_tolerancia integer DEFAULT 7,
  p_limite          integer DEFAULT 200
)
RETURNS TABLE (
  anexo_id           uuid,
  bucket             text,
  caminho            text,
  caminho_quarentena text,
  caminhos_finais    text[],
  tentativas         integer
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
#variable_conflict use_column
DECLARE
  -- O URL de upload assinado vale 2 horas. Ate 3 horas depois de criada, uma
  -- linha ainda pode receber o objecto: nao se lhe apaga o objecto antes disso.
  c_pendente_max constant interval := interval '3 hours';
  v_tolerancia   interval := make_interval(days => greatest(coalesce(p_dias_tolerancia, 7), 0));
  v_limite       integer  := least(greatest(coalesce(p_limite, 200), 1), 1000);
  v_convite      uuid;
BEGIN
  -- (a) Convites nao usados que expiraram ou foram revogados ha mais de a
  --     tolerancia (o MESMO criterio de hr_convites_admissao_limpar): os anexos
  --     activos passam a apagado. Nao toca em mais nada nos convites.
  UPDATE public.pessoas_anexos a
     SET estado         = 'apagado',
         apagado_em     = now(),
         apagado_motivo = CASE WHEN c.revoked_at IS NOT NULL
                               THEN 'convite_revogado' ELSE 'convite_expirado' END
    FROM public.pessoas_convites_admissao c
   WHERE a.convite_id = c.id
     AND a.estado IN ('pendente', 'ligado')
     AND c.used_at IS NULL
     AND (c.valid_until < now() - v_tolerancia
          OR (c.revoked_at IS NOT NULL AND c.revoked_at < now() - v_tolerancia));

  -- (b) Pendentes que nunca foram confirmados.
  UPDATE public.pessoas_anexos
     SET estado         = 'apagado',
         apagado_em     = now(),
         apagado_motivo = 'upload_abandonado'
   WHERE estado = 'pendente'
     AND criado_em < now() - c_pendente_max;

  -- (c) O que a Edge Function tem de apagar do Storage. A regra das 3 horas
  --     aplica-se a TODAS as linhas devolvidas: o mesmo URL assinado pode ser
  --     reutilizado ate expirar, por isso um objecto carregado depois de a
  --     linha ser marcada apagada e removido na volta seguinte.
  --
  --     Uma linha entra no lote por UM de dois motivos (ou os dois):
  --       1. esta apagada e o seu objecto ainda nao foi removido
  --          (objecto_removido_em nulo): bucket e caminho dizem onde esta;
  --       2. tem a copia da quarentena por remover (caminho_quarentena preenchido,
  --          quarentena_removida_em nulo) e ja nao esta pendente -- ligada,
  --          promovida ou apagada. Apanha o que a Edge nao conseguiu apagar logo
  --          a seguir a ligar e fecha o URL de upload reutilizavel.
  --     Para as linhas apagadas que NUNCA foram ligadas, caminhos_finais traz os
  --     tres caminhos finais possiveis (pdf, png, jpg) em hr-documentos: a Edge
  --     pode ter copiado o ficheiro para la e morrer antes de ligar, e a linha so
  --     conhece o caminho da quarentena. Remover um caminho que nao existe e inofensivo.
  --
  --     A ordem e por limpeza_tentativas (as linhas que falham sempre ficam para o
  --     fim) e o lote incrementa limpeza_tentativas das linhas que devolve: 200
  --     linhas teimosas nao bloqueiam as seguintes. FOR UPDATE SKIP LOCKED: duas
  --     voltas em simultaneo nao devolvem as mesmas linhas.
  RETURN QUERY
  WITH escolhidas AS (
    SELECT a.id
      FROM public.pessoas_anexos a
     WHERE a.criado_em < now() - c_pendente_max
       AND (
             (a.estado = 'apagado' AND a.objecto_removido_em IS NULL)
          OR (a.estado <> 'pendente' AND a.caminho_quarentena IS NOT NULL AND a.quarentena_removida_em IS NULL)
       )
     ORDER BY a.limpeza_tentativas, coalesce(a.apagado_em, a.criado_em), a.id
     LIMIT v_limite
     FOR UPDATE OF a SKIP LOCKED
  ),
  marcadas AS (
    UPDATE public.pessoas_anexos a
       SET limpeza_tentativas = a.limpeza_tentativas + 1
      FROM escolhidas e
     WHERE a.id = e.id
    RETURNING a.id, a.estado, a.bucket, a.caminho, a.caminho_quarentena,
              a.quarentena_removida_em, a.objecto_removido_em, a.ligado_em,
              a.organization_id, a.pessoa_id, a.limpeza_tentativas
  )
  SELECT m.id,
         CASE WHEN m.estado = 'apagado' AND m.objecto_removido_em IS NULL THEN m.bucket END,
         CASE WHEN m.estado = 'apagado' AND m.objecto_removido_em IS NULL THEN m.caminho END,
         -- Quando o objecto da linha ja E a copia da quarentena (apagado sem nunca
         -- ligar), nao se repete no segundo campo.
         CASE WHEN m.caminho_quarentena IS NOT NULL
                   AND m.quarentena_removida_em IS NULL
                   AND NOT (m.estado = 'apagado' AND m.objecto_removido_em IS NULL
                            AND m.caminho = m.caminho_quarentena)
              THEN m.caminho_quarentena END,
         CASE WHEN m.estado = 'apagado' AND m.objecto_removido_em IS NULL AND m.ligado_em IS NULL
              THEN ARRAY[
                     m.organization_id::text || '/' || m.pessoa_id::text || '/admissao/' || m.id::text || '.pdf',
                     m.organization_id::text || '/' || m.pessoa_id::text || '/admissao/' || m.id::text || '.png',
                     m.organization_id::text || '/' || m.pessoa_id::text || '/admissao/' || m.id::text || '.jpg'
                   ]
         END,
         m.limpeza_tentativas
    FROM marcadas m
   ORDER BY m.limpeza_tentativas, m.id;

  -- (d) Promocoes que falharam. hr_convite_anexos_promover nunca parte a admissao:
  --     em falha deixa os anexos em `ligado`, ligados a um convite JA USADO (uma
  --     ligacao nova num convite usado e recusada, por isso so isto os produz).
  --     Volta a tenta-los; e idempotente e, se continuar a falhar, so regista outro
  --     aviso. No maximo 50 convites por volta.
  FOR v_convite IN
    SELECT DISTINCT a.convite_id
      FROM public.pessoas_anexos a
      JOIN public.pessoas_convites_admissao c ON c.id = a.convite_id
     WHERE a.estado = 'ligado'
       AND c.used_at IS NOT NULL
     LIMIT 50
  LOOP
    PERFORM public.hr_convite_anexos_promover(v_convite);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_convite_anexos_limpar(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_convite_anexos_limpar(integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.hr_convite_anexos_limpar(integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hr_convite_anexos_limpar(integer, integer) TO service_role;

COMMENT ON FUNCTION public.hr_convite_anexos_limpar(integer, integer) IS
'Marca como apagados os anexos de convites nao usados que expiraram ou foram revogados ha mais de p_dias_tolerancia dias (7 por omissao, o mesmo criterio de hr_convites_admissao_limpar) e os pendentes com mais de 3 horas, volta a promover os anexos ligados de convites ja usados (promocao que falhou) e devolve ate p_limite linhas (200 por omissao, tecto 1000) com objectos ainda por sair do Storage: {anexo_id, bucket, caminho, caminho_quarentena, caminhos_finais, tentativas}. bucket e caminho: o objecto da linha, so se a linha esta apagada e o objecto por remover (senao nulos). caminho_quarentena: a copia da quarentena por remover (nulo se nao ha, ou se e o mesmo objecto que caminho). caminhos_finais: para linhas apagadas que nunca foram ligadas, os tres caminhos finais possiveis (pdf, png, jpg) em hr-documentos; nulo nas outras. tentativas: quantas vezes a limpeza devolveu a linha (ja incluindo esta). So devolve linhas criadas ha mais de 3 horas (o URL de upload assinado vale 2 h). Ordena por tentativas, para as linhas que falham sempre nao bloquearem as novas. Nao mexe nos rascunhos. A Edge Function convite-admissao-limpeza apaga TUDO o que vem em cada linha pela API do Storage e chama hr_convite_anexos_objecto_removido so com os ids em que tudo foi apagado. SO service_role. Desde 20261210070000.';

CREATE OR REPLACE FUNCTION public.hr_convite_anexos_objecto_removido(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_n integer := 0;
BEGIN
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RETURN 0;
  END IF;

  -- So se marca o que ja nao pode receber um objecto. O objecto da linha
  -- (objecto_removido_em): uma linha apagada que foi ligada (o objecto final nao
  -- tem URL de upload) ou criada ha mais de 3 horas. A copia da quarentena
  -- (quarentena_removida_em): so passadas 3 horas desde que a linha foi criada,
  -- porque o URL de upload assinado vale 2 h e o mesmo URL pode voltar a pousar
  -- um objecto no caminho depois de apagado. As linhas que ainda nao cumprem
  -- ficam por marcar e voltam na proxima volta de hr_convite_anexos_limpar. Um
  -- mesmo id marca o que for aplicavel nos dois campos.
  UPDATE public.pessoas_anexos a
     SET objecto_removido_em = CASE
           WHEN a.estado = 'apagado' AND a.objecto_removido_em IS NULL
                AND (a.ligado_em IS NOT NULL OR a.criado_em < now() - interval '3 hours')
           THEN now() ELSE a.objecto_removido_em END,
         quarentena_removida_em = CASE
           WHEN a.caminho_quarentena IS NOT NULL AND a.quarentena_removida_em IS NULL
                AND a.estado <> 'pendente' AND a.criado_em < now() - interval '3 hours'
           THEN now() ELSE a.quarentena_removida_em END
   WHERE a.id = ANY (p_ids)
     AND (
           (a.estado = 'apagado' AND a.objecto_removido_em IS NULL
            AND (a.ligado_em IS NOT NULL OR a.criado_em < now() - interval '3 hours'))
        OR (a.caminho_quarentena IS NOT NULL AND a.quarentena_removida_em IS NULL
            AND a.estado <> 'pendente' AND a.criado_em < now() - interval '3 hours')
         );

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_convite_anexos_objecto_removido(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_convite_anexos_objecto_removido(uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.hr_convite_anexos_objecto_removido(uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hr_convite_anexos_objecto_removido(uuid[]) TO service_role;

COMMENT ON FUNCTION public.hr_convite_anexos_objecto_removido(uuid[]) IS
'Regista que a Edge Function removeu o que hr_convite_anexos_limpar lhe devolveu para estes ids: marca objecto_removido_em nas linhas apagadas que foram ligadas ou criadas ha mais de 3 horas, e quarentena_removida_em nas linhas (nao pendentes) com caminho_quarentena criadas ha mais de 3 horas (as outras podem ainda receber um objecto e voltam na proxima volta). A Edge so deve passar os ids em que TODOS os objectos da linha foram removidos. Devolve quantas linhas marcou. SO service_role. Desde 20261210070000.';

-- ==============================================================================
-- 3b. hr_convite_anexos_limpeza_estado: o que a limpeza deixa por fazer
--     A Edge convite-admissao-limpeza responde sempre 200 e o pg_cron nao le a
--     resposta: sem isto, uma limpeza que falha todos os dias (segredo errado,
--     Storage a recusar, linhas teimosas) nao avisa ninguem e os documentos de
--     identificacao ficam no Storage. Esta funcao e o que a Edge le no fim de cada
--     volta para dar o alarme (captureError, resposta nao 2xx), e o que se
--     consulta para saber se o job existe. Nao escreve nada.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_convite_anexos_limpeza_estado()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_pendente_max constant interval := interval '3 hours';
  c_atraso       constant interval := interval '2 days';
  v_agendado        boolean := false;
  v_por_remover     integer;
  v_antigos         integer;
  v_quarentena      integer;
  v_promocoes       integer;
  v_max_tentativas  integer;
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE a.apagado_em < now() - c_atraso),
         coalesce(max(a.limpeza_tentativas), 0)
    INTO v_por_remover, v_antigos, v_max_tentativas
    FROM public.pessoas_anexos a
   WHERE a.estado = 'apagado'
     AND a.objecto_removido_em IS NULL
     AND a.criado_em < now() - c_pendente_max;

  SELECT count(*) INTO v_quarentena
    FROM public.pessoas_anexos a
   WHERE a.estado <> 'pendente'
     AND a.caminho_quarentena IS NOT NULL
     AND a.quarentena_removida_em IS NULL
     AND a.criado_em < now() - c_pendente_max;

  SELECT count(DISTINCT a.convite_id) INTO v_promocoes
    FROM public.pessoas_anexos a
    JOIN public.pessoas_convites_admissao c ON c.id = a.convite_id
   WHERE a.estado = 'ligado' AND c.used_at IS NOT NULL;

  -- cron.job so existe com pg_cron; dinamico para a funcao compilar sem ele.
  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM cron.job WHERE jobname = $1)'
      INTO v_agendado USING 'hr-convite-anexos-limpar';
  END IF;

  RETURN jsonb_build_object(
    'por_remover', v_por_remover,
    'por_remover_antigos', v_antigos,
    'quarentena_por_remover', v_quarentena,
    'promocoes_pendentes', v_promocoes,
    'max_tentativas', v_max_tentativas,
    'job_agendado', v_agendado
  );
END;
$$;

REVOKE ALL ON FUNCTION public.hr_convite_anexos_limpeza_estado() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_convite_anexos_limpeza_estado() FROM anon;
REVOKE ALL ON FUNCTION public.hr_convite_anexos_limpeza_estado() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hr_convite_anexos_limpeza_estado() TO service_role;

COMMENT ON FUNCTION public.hr_convite_anexos_limpeza_estado() IS
'O que a limpeza dos anexos deixa por fazer, em jsonb: por_remover (linhas apagadas com o objecto por remover, criadas ha mais de 3 h), por_remover_antigos (as que estao apagadas ha mais de 2 dias: a limpeza esta a falhar), quarentena_por_remover (copias da quarentena por apagar, linhas nao pendentes com mais de 3 h), promocoes_pendentes (convites ja usados com anexos ainda em ligado: a promocao falhou), max_tentativas (o maior limpeza_tentativas das por remover) e job_agendado (existe o job pg_cron hr-convite-anexos-limpar). Nao escreve nada. A Edge convite-admissao-limpeza le-a no fim de cada volta e da o alarme se por_remover_antigos > 0 ou promocoes_pendentes > 0. SO service_role. Desde 20261210070000.';

-- ==============================================================================
-- 4. rpc_hr_convite_admissao_submeter: promove os anexos
--    Corpo de 20261210040000 (o BIC) COPIADO por inteiro. Mudancas (e mais
--    nenhuma): v_convite_id no DECLARE; o UPDATE de consumo passa a devolver
--    tambem o id do convite; PERFORM hr_convite_anexos_promover imediatamente
--    antes do RETURN.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_convite_admissao_submeter(
  p_token_hash      text,
  p_dados           jsonb,
  p_assinatura_nome text,
  p_ip              inet,
  p_user_agent      text
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_tecto constant integer := 10;
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
  v_lido       record;
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
  IF jsonb_typeof(p_dados) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pessoas_convites_admissao
     WHERE token_hash = p_token_hash AND attempts >= c_tecto
  ) THEN
    RAISE EXCEPTION 'convite_bloqueado' USING ERRCODE = 'HRA05';
  END IF;

  UPDATE public.pessoas_convites_admissao
     SET used_at = now(),
         assinatura_nome = p_assinatura_nome,
         assinatura_ip = p_ip,
         assinatura_user_agent = p_user_agent,
         rascunho = NULL,
         -- Convite consumido: a ultima recusa (campos e fichas em conflito)
         -- deixa de fazer falta e nao fica guardada.
         ultima_recusa_codigo = NULL,
         ultima_recusa_em = NULL,
         ultima_recusa_campos = NULL,
         ultima_recusa_conflitos = NULL
   WHERE token_hash = p_token_hash
     AND used_at IS NULL
     AND revoked_at IS NULL
     AND valid_until > now()
  RETURNING id, pessoa_id, organization_id INTO v_convite_id, v_pessoa_id, v_org;

  IF NOT FOUND THEN
    -- Dar o motivo exacto em vez de um convite_invalido para tudo.
    SELECT c.used_at, c.revoked_at, c.valid_until INTO v_lido
      FROM public.pessoas_convites_admissao c
     WHERE c.token_hash = p_token_hash;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'convite_invalido' USING ERRCODE = 'HRA01';
    ELSIF v_lido.used_at IS NOT NULL THEN
      RAISE EXCEPTION 'convite_ja_usado' USING ERRCODE = 'HRA02';
    ELSIF v_lido.revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'convite_revogado' USING ERRCODE = 'HRA03';
    ELSIF v_lido.valid_until <= now() THEN
      RAISE EXCEPTION 'convite_expirado' USING ERRCODE = 'HRA04';
    END IF;
    RAISE EXCEPTION 'convite_invalido' USING ERRCODE = 'HRA01';
  END IF;

  -- NIF e NISS pelo digito de controlo, ANTES dos duplicados e de qualquer
  -- escrita. Substitui a antiga regex de formato.
  v_nif  := public.hr_json_texto(p_dados, 'nif');
  v_niss := public.hr_json_texto(p_dados, 'niss');

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
    coalesce(public.hr_json_texto(p_dados, 'niss'), i.niss),
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

  IF p_dados ?| ARRAY[
       'tipo_documento','numero_documento','validade_documento','nif','niss',
       'carta_conducao_numero','carta_conducao_categorias','carta_conducao_validade'
     ] THEN
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
      niss = CASE WHEN p_dados ? 'niss'
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

  v_conta_num := public.hr_json_texto(p_dados, 'iban');
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

REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text) IS
'Submissao final do convite de admissao. SO service_role. Corpo de 20261202080000 com: codigos de erro com SQLSTATE proprio HRA* (a MESSAGE e o codigo); motivo exacto quando o convite nao se consome (convite_invalido, _ja_usado, _revogado, _expirado); NIF e NISS validados pelo digito de controlo logo a seguir ao consumo; duplicados com os pessoa_id no DETAIL (so a Edge Function o le); portao so pelos campos de origem pessoa e posicao convite, com os codigos em falta no DETAIL de admissao_incompleta (ver 20261210030000). Desde 20261210040000 valida o BIC (conta_swift) com bic_invalido, SQLSTATE HRA18, e grava-o mesmo sem IBAN. Desde 20261210070000 promove os anexos ligados ao convite (hr_convite_anexos_promover) imediatamente antes do RETURN, na mesma transaccao; os anexos nao entram em p_dados, nao criam pendencia e nao travam a submissao. Tudo ou nada para os dados: qualquer RAISE desfaz o consumo do convite, as escritas e o segredo criado no Vault; a promocao dos anexos e a excepcao, corre numa subtransaccao propria e, se falhar, a admissao segue com os anexos em ligado (a limpeza volta a tentar). Desde 20261210040000 o BIC em branco nunca apaga o da ficha e um swift legado invalido passa a NULL.';

-- ==============================================================================
-- 5. rpc_hr_convite_admissao_criar: a heranca dos ficheiros
--    Corpo de 20261210030000 COPIADO por inteiro, MESMA assinatura (cinco
--    argumentos) e MESMOS grants. Mudancas (e mais nenhuma): v_herda_anexos no
--    DECLARE; o calculo da heranca ANTES de revogar o convite antigo; e a
--    chamada a hr_convite_anexos_transferir depois do INSERT. Heranca do
--    rascunho, recusa do actor sem permissao e o resto ficam iguais.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_convite_admissao_criar(
  p_pessoa_id   uuid,
  p_token_hash  text,
  p_valid_until timestamptz,
  p_email       text,
  p_actor       uuid
)
RETURNS TABLE (convite_id uuid, rascunho_herdado boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_heranca constant interval := interval '7 days';
  v_org       uuid;
  v_anew      uuid;
  v_id        uuid;
  v_antigo    record;
  v_rascunho  jsonb;
  v_herda_anexos boolean;
BEGIN
  SELECT p.organization_id INTO v_org
  FROM public.pessoas p
  WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'pessoa_nao_encontrada' USING ERRCODE = 'HRA30';
  END IF;

  -- A Edge Function ja verificou a permissao (e a unica que chama esta RPC, com
  -- a chave de servico); a base verifica-a outra vez sobre o p_actor.
  IF p_actor IS NULL
     OR NOT public.has_anew_permission_in_org(p_actor, 'hr.pessoas.convite.enviar', v_org) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  IF p_valid_until <= now() THEN
    RAISE EXCEPTION 'validade_invalida' USING ERRCODE = '22023';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = p_actor LIMIT 1;

  -- HERANCA DO RASCUNHO. O convite mais recente desta pessoa que ainda tem
  -- rascunho e nunca foi usado (vivo, revogado, ou expirado ainda nao
  -- limpo). So passa para o novo se o email de destino for o mesmo e se nao
  -- passaram mais de 7 dias sobre o fim de vida desse convite; com outro email
  -- o rascunho descarta-se, para nao ir parar a outra caixa de correio.
  SELECT c.rascunho, c.email_destino,
         least(coalesce(c.revoked_at, 'infinity'::timestamptz), c.valid_until) AS fim_de_vida
    INTO v_antigo
    FROM public.pessoas_convites_admissao c
   WHERE c.pessoa_id = p_pessoa_id
     AND c.organization_id = v_org
     AND c.used_at IS NULL
     AND c.rascunho IS NOT NULL
   ORDER BY c.created_at DESC
   LIMIT 1;

  IF v_antigo.rascunho IS NOT NULL
     AND lower(v_antigo.email_destino) = lower(p_email)
     AND v_antigo.fim_de_vida >= now() - c_heranca THEN
    v_rascunho := v_antigo.rascunho;
  END IF;

  -- HERANCA DOS FICHEIROS. A mesma regra do rascunho, calculada ANTES de revogar
  -- o convite antigo (depois, revoked_at seria agora e a regra dos 7 dias passaria
  -- sempre): olha para o convite nao usado mais recente que ainda tem anexos
  -- pendentes ou ligados; herda-os se o email de destino e o mesmo e o fim de vida
  -- desse convite nao foi ha mais de 7 dias. Com outro email os ficheiros nao
  -- vao para outra caixa de correio: ficam apagados (substituido).
  SELECT (lower(m.email_destino) = lower(p_email) AND m.fim_de_vida >= now() - c_heranca)
    INTO v_herda_anexos
    FROM (SELECT c.email_destino,
                 least(coalesce(c.revoked_at, 'infinity'::timestamptz), c.valid_until) AS fim_de_vida
            FROM public.pessoas_convites_admissao c
           WHERE c.pessoa_id = p_pessoa_id
             AND c.organization_id = v_org
             AND c.used_at IS NULL
             AND EXISTS (SELECT 1 FROM public.pessoas_anexos a
                          WHERE a.convite_id = c.id AND a.estado IN ('pendente', 'ligado'))
           ORDER BY c.created_at DESC
           LIMIT 1) m;

  -- So pode haver um convite vivo por pessoa (o indice unico parcial da
  -- tabela ja o garante); revogar explicitamente o anterior torna a intencao
  -- clara em vez de depender so do indice para rejeitar o INSERT.
  UPDATE public.pessoas_convites_admissao
     SET revoked_at = now()
   WHERE pessoa_id = p_pessoa_id
     AND organization_id = v_org
     AND used_at IS NULL
     AND revoked_at IS NULL;

  -- Mover, nao copiar: nenhum convite anterior nao usado fica com rascunho.
  UPDATE public.pessoas_convites_admissao
     SET rascunho = NULL
   WHERE pessoa_id = p_pessoa_id
     AND organization_id = v_org
     AND used_at IS NULL
     AND rascunho IS NOT NULL;

  INSERT INTO public.pessoas_convites_admissao
    (pessoa_id, organization_id, token_hash, email_destino, valid_until, created_by, rascunho)
  VALUES
    (p_pessoa_id, v_org, p_token_hash, p_email, p_valid_until, v_anew, v_rascunho)
  RETURNING id INTO v_id;

  PERFORM public.hr_convite_anexos_transferir(p_pessoa_id, v_org, v_id, coalesce(v_herda_anexos, false));

  RETURN QUERY SELECT v_id, (v_rascunho IS NOT NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text, uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text, uuid) IS
'Cria um convite de admissao. SO service_role: chamada pela Edge Function convite-admissao, que valida o JWT, verifica hr.pessoas.convite.enviar e passa em p_actor o id de auth.users do utilizador (a base volta a verificar a permissao de p_actor: null ou sem permissao da insufficient_privilege 42501). Revoga o convite vivo anterior e insere o novo. Desde 20261210030000 o novo convite HERDA o rascunho do anterior (move, nao copia) quando o email de destino e o mesmo e o anterior nao acabou ha mais de 7 dias; com outro email o rascunho antigo e descartado. Desde 20261210070000 aplica a MESMA regra aos ficheiros anexados (hr_convite_anexos_transferir): os ligados passam para o convite novo se a regra permitir; senao ficam apagados (substituido). Devolve uma linha (convite_id, rascunho_herdado): com rascunho_herdado a Edge nao deve mostrar o link ao RH. Erros: pessoa_nao_encontrada (HRA30), insufficient_privilege (42501), validade_invalida (22023). p_token_hash e o SHA-256 do codigo gerado fora da base; o codigo em claro nunca chega aqui. Fechada a authenticated porque, com a heranca, o hash escolhido pelo chamador dava acesso ao rascunho de outra pessoa.';

-- ==============================================================================
-- Conferir (estrutura)
-- ==============================================================================
DO $conferir$
DECLARE
  v_corpo text;
  v_n     integer;
BEGIN
  -- 1. Cada funcao existe uma so vez (uma segunda candidata deixa o PostgREST sem saber qual escolher).
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname IN ('rpc_hr_convite_admissao_submeter', 'rpc_hr_convite_admissao_criar',
                       'hr_convite_anexos_promover', 'hr_convite_anexos_transferir',
                       'hr_convite_anexos_limpar', 'hr_convite_anexos_objecto_removido',
                       'hr_convite_anexos_limpeza_estado');
  IF v_n <> 7 THEN
    RAISE EXCEPTION 'Esperavam-se 7 funcoes (uma de cada); ha %.', v_n;
  END IF;

  IF has_function_privilege('anon', 'public.hr_convite_anexos_limpeza_estado()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.hr_convite_anexos_limpeza_estado()', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.hr_convite_anexos_limpeza_estado()', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_convite_anexos_limpeza_estado tem de ser so service_role.';
  END IF;

  -- A promocao tem a sua subtransaccao: nunca parte a admissao.
  SELECT p.prosrc INTO v_corpo
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'hr_convite_anexos_promover';
  IF v_corpo NOT LIKE '%EXCEPTION WHEN OTHERS%' THEN
    RAISE EXCEPTION 'hr_convite_anexos_promover devia isolar a promocao numa subtransaccao (EXCEPTION WHEN OTHERS).';
  END IF;

  -- limpar devolve as seis colunas da interface (caminho_quarentena incluido).
  IF pg_get_function_result('public.hr_convite_anexos_limpar(integer, integer)'::regprocedure) NOT LIKE '%caminho_quarentena text%'
     OR pg_get_function_result('public.hr_convite_anexos_limpar(integer, integer)'::regprocedure) NOT LIKE '%caminhos_finais text[]%'
     OR pg_get_function_result('public.hr_convite_anexos_limpar(integer, integer)'::regprocedure) NOT LIKE '%tentativas integer%' THEN
    RAISE EXCEPTION 'hr_convite_anexos_limpar devia devolver caminho_quarentena, caminhos_finais e tentativas.';
  END IF;

  -- 2. Privilegios.
  IF has_function_privilege('anon', 'public.hr_convite_anexos_promover(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.hr_convite_anexos_promover(uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.hr_convite_anexos_promover(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_convite_anexos_promover e interna: ninguem a pode executar por fora.';
  END IF;
  IF has_function_privilege('anon', 'public.hr_convite_anexos_transferir(uuid, uuid, uuid, boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.hr_convite_anexos_transferir(uuid, uuid, uuid, boolean)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.hr_convite_anexos_transferir(uuid, uuid, uuid, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_convite_anexos_transferir e interna: ninguem a pode executar por fora.';
  END IF;
  IF has_function_privilege('anon', 'public.hr_convite_anexos_limpar(integer, integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.hr_convite_anexos_limpar(integer, integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.hr_convite_anexos_limpar(integer, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_convite_anexos_limpar tem de ser so service_role.';
  END IF;
  IF has_function_privilege('anon', 'public.hr_convite_anexos_objecto_removido(uuid[])', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.hr_convite_anexos_objecto_removido(uuid[])', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.hr_convite_anexos_objecto_removido(uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_convite_anexos_objecto_removido tem de ser so service_role.';
  END IF;
  IF has_function_privilege('anon', 'public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'submeter tem de ser so service_role.';
  END IF;
  IF has_function_privilege('anon', 'public.rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text, uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text, uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'criar tem de ser so service_role.';
  END IF;

  -- 3. Os corpos nao perderam nada e levam o que se acrescentou.
  SELECT p.prosrc INTO v_corpo
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'rpc_hr_convite_admissao_submeter' AND p.pronargs = 5;
  IF v_corpo NOT LIKE '%hr_convite_anexos_promover%' OR v_corpo NOT LIKE '%HRA17%'
     OR v_corpo NOT LIKE '%HRA18%' OR v_corpo NOT LIKE '%hr_nif_valido%'
     OR v_corpo NOT LIKE '%hr_bic_valido%' THEN
    RAISE EXCEPTION 'submeter perdeu algo da versao do BIC ou nao promove os anexos.';
  END IF;

  SELECT p.prosrc INTO v_corpo
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'rpc_hr_convite_admissao_criar' AND p.pronargs = 5;
  IF v_corpo NOT LIKE '%hr_convite_anexos_transferir%' OR v_corpo NOT LIKE '%v_antigo%'
     OR v_corpo NOT LIKE '%hr.pessoas.convite.enviar%' OR v_corpo LIKE '%auth.uid()%' THEN
    RAISE EXCEPTION 'criar perdeu algo da versao anterior ou nao transfere os anexos.';
  END IF;

  -- 4. submeter EXECUTADA com um token inexistente: tem de dar HRA01 (prova
  --    que o corpo corre, nao so que foi escrito). Nao escreve nada.
  BEGIN
    PERFORM public.rpc_hr_convite_admissao_submeter(
      'conferir-anexos-token-inexistente', '{}'::jsonb, NULL::text, NULL::inet, NULL::text);
    RAISE EXCEPTION 'submeter devia ter recusado um token inexistente.';
  EXCEPTION
    WHEN SQLSTATE 'HRA01' THEN
      NULL; -- esperado
  END;

  -- 5. Promover e transferir executadas sem nada para fazer.
  IF public.hr_convite_anexos_promover('00000000-0000-0000-0000-000000000000'::uuid) <> 0 THEN
    RAISE EXCEPTION 'promover de um convite inexistente devia devolver 0.';
  END IF;
  IF public.hr_convite_anexos_transferir('00000000-0000-0000-0000-000000000000'::uuid,
       '00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, true) <> 0 THEN
    RAISE EXCEPTION 'transferir de um convite inexistente devia devolver 0.';
  END IF;

  RAISE NOTICE 'OK: promover e transferir internas, limpar e objecto_removido so service_role, submeter (BIC mais promocao) e criar (heranca do rascunho mais dos ficheiros) com os mesmos grants, submeter executada (HRA01).';
END;
$conferir$;

-- ==============================================================================
-- Conferir (ao vivo, so na organizacao nike): percorre promover, transferir e
-- limpar com dados de teste e DESFAZ tudo com a sentinela HR900.
-- ==============================================================================
DO $conferir_vivo$
DECLARE
  v_org_nike  uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
  v_uid       uuid;
  v_p         uuid;
  v_q         uuid;
  v_r         uuid;
  v_c         uuid;
  v_c2        uuid;
  v_c3        uuid;
  v_foto      uuid;
  v_cartao    uuid;
  v_iban      uuid;
  v_pend      uuid;
  v_n         integer;
  v_estado    text;
  v_motivo    text;
  v_convite   uuid;
  v_ligado    uuid;
  v_velho     uuid;
  v_novo      uuid;
  v_lim       integer;
  v_promovido uuid;
  v_c4        uuid;
  v_retry     uuid;
  v_linha     record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations WHERE id = v_org_nike) THEN
    RAISE NOTICE 'Org nike nao encontrada neste ambiente -- o conferir ao vivo do ciclo de vida dos anexos foi saltado.';
    RETURN;
  END IF;

  BEGIN
    -- Escritas SO na nike.
    -- ---- promover -----------------------------------------------------------
    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido)
    VALUES (v_org_nike, 'TESTE MIGRACAO', '20261210070000 Q -- apagar') RETURNING id INTO v_q;
    INSERT INTO public.pessoas_convites_admissao (pessoa_id, organization_id, token_hash, email_destino, valid_until)
    VALUES (v_q, v_org_nike, encode(sha256(convert_to('conferir-70-q', 'UTF8')), 'hex'),'q.20261210070000@example.invalid', now() + interval '1 day')
    RETURNING id INTO v_c;

    INSERT INTO public.pessoas_anexos (organization_id, pessoa_id, convite_id, tipo, estado, bucket, caminho,
                                       nome_original, mime_type, tamanho_bytes, hash_sha256, ligado_em)
    VALUES (v_org_nike, v_q, v_c, 'fotografia', 'ligado', 'hr-documentos', 'teste-70/q-foto.png',
            'foto.png', 'image/png', 100, repeat('1', 64), now()) RETURNING id INTO v_foto;
    INSERT INTO public.pessoas_anexos (organization_id, pessoa_id, convite_id, tipo, estado, bucket, caminho,
                                       nome_original, mime_type, tamanho_bytes, hash_sha256, ligado_em)
    VALUES (v_org_nike, v_q, v_c, 'cartao_cidadao', 'ligado', 'hr-documentos', 'teste-70/q-cartao.pdf',
            'cartao.pdf', 'application/pdf', 100, repeat('2', 64), now()) RETURNING id INTO v_cartao;
    INSERT INTO public.pessoas_anexos (organization_id, pessoa_id, convite_id, tipo, estado, bucket, caminho,
                                       nome_original, mime_type, tamanho_bytes, hash_sha256, ligado_em)
    VALUES (v_org_nike, v_q, v_c, 'comprovativo_iban', 'ligado', 'hr-documentos', 'teste-70/q-iban.pdf',
            'iban.pdf', 'application/pdf', 100, repeat('3', 64), now()) RETURNING id INTO v_iban;
    INSERT INTO public.pessoas_anexos (organization_id, pessoa_id, convite_id, tipo, caminho, nome_original)
    VALUES (v_org_nike, v_q, v_c, 'cartao_cidadao', 'teste-70/q-pendente.pdf', 'pendente.pdf')
    RETURNING id INTO v_pend;

    v_n := public.hr_convite_anexos_promover(v_c);
    IF v_n <> 3 THEN
      RAISE EXCEPTION 'promover devia devolver 3; devolveu %.', v_n USING ERRCODE = 'HR961';
    END IF;
    SELECT count(*) INTO v_n FROM public.pessoas_anexos WHERE convite_id = v_c AND estado = 'promovido' AND promovido_em IS NOT NULL;
    IF v_n <> 3 THEN
      RAISE EXCEPTION 'os tres ligados deviam estar promovidos; ha %.', v_n USING ERRCODE = 'HR961';
    END IF;
    SELECT estado, apagado_motivo INTO v_estado, v_motivo FROM public.pessoas_anexos WHERE id = v_pend;
    IF v_estado <> 'apagado' OR v_motivo <> 'upload_abandonado' THEN
      RAISE EXCEPTION 'o pendente devia ficar apagado (upload_abandonado); esta % (%).', v_estado, v_motivo USING ERRCODE = 'HR961';
    END IF;
    IF (SELECT fotografia_anexo_id FROM public.pessoas WHERE id = v_q) IS DISTINCT FROM v_foto THEN
      RAISE EXCEPTION 'a ficha devia apontar para a fotografia promovida.' USING ERRCODE = 'HR961';
    END IF;
    SELECT count(*) INTO v_n FROM public.pessoas_acessos_sensiveis
     WHERE pessoa_id = v_q AND campo IN ('anexo_cartao_cidadao', 'anexo_comprovativo_iban')
       AND accao = 'alterar' AND origem = 'service_role';
    IF v_n <> 2 THEN
      RAISE EXCEPTION 'devia haver 2 registos de auditoria (cartao e comprovativo); ha %.', v_n USING ERRCODE = 'HR961';
    END IF;
    IF EXISTS (SELECT 1 FROM public.pessoas_acessos_sensiveis WHERE pessoa_id = v_q AND campo = 'fotografia') THEN
      RAISE EXCEPTION 'a fotografia nunca se audita.' USING ERRCODE = 'HR961';
    END IF;
    IF public.hr_convite_anexos_promover(v_c) <> 0 THEN
      RAISE EXCEPTION 'promover uma segunda vez devia devolver 0.' USING ERRCODE = 'HR961';
    END IF;

    -- ---- transferir (via criar, com um utilizador real da nike) ------------
    SELECT au.auth_user_id INTO v_uid
      FROM public.anew_memberships am
      JOIN public.anew_users au ON au.id = am.user_id
      JOIN public.anew_roles ar ON ar.id = am.role_id AND ar.code = 'super_admin'
     WHERE am.organization_id = v_org_nike AND am.status = 'active' AND au.auth_user_id IS NOT NULL
     ORDER BY au.auth_user_id
     LIMIT 1;

    IF v_uid IS NULL THEN
      RAISE NOTICE 'CONFERIR transferir saltado: nao ha super_admin com membership activo na nike.';
    ELSE
      INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido)
      VALUES (v_org_nike, 'TESTE MIGRACAO', '20261210070000 P -- apagar') RETURNING id INTO v_p;
      INSERT INTO public.pessoas_convites_admissao (pessoa_id, organization_id, token_hash, email_destino, valid_until)
      VALUES (v_p, v_org_nike, encode(sha256(convert_to('conferir-70-p1', 'UTF8')), 'hex'),'p.20261210070000@example.invalid', now() + interval '1 day')
      RETURNING id INTO v_velho;
      INSERT INTO public.pessoas_anexos (organization_id, pessoa_id, convite_id, tipo, estado, bucket, caminho,
                                         nome_original, mime_type, tamanho_bytes, hash_sha256, ligado_em)
      VALUES (v_org_nike, v_p, v_velho, 'cartao_cidadao', 'ligado', 'hr-documentos', 'teste-70/p-cartao.pdf',
              'cartao.pdf', 'application/pdf', 100, repeat('4', 64), now()) RETURNING id INTO v_ligado;
      INSERT INTO public.pessoas_anexos (organization_id, pessoa_id, convite_id, tipo, caminho, nome_original)
      VALUES (v_org_nike, v_p, v_velho, 'comprovativo_iban', 'teste-70/p-pendente.pdf', 'pendente.pdf')
      RETURNING id INTO v_pend;

      BEGIN
        -- Mesmo email: os ligados passam para o convite novo; o pendente fica apagado.
        SELECT r.convite_id INTO v_novo
          FROM public.rpc_hr_convite_admissao_criar(
                 v_p, encode(sha256(convert_to('conferir-70-p2', 'UTF8')), 'hex'), now() + interval '1 day', 'p.20261210070000@example.invalid', v_uid) r;
        SELECT convite_id, estado INTO v_convite, v_estado FROM public.pessoas_anexos WHERE id = v_ligado;
        IF v_convite IS DISTINCT FROM v_novo OR v_estado <> 'ligado' THEN
          RAISE EXCEPTION 'com o mesmo email o ligado devia passar para o convite novo (esta em %, estado %).', v_convite, v_estado
            USING ERRCODE = 'HR961';
        END IF;
        SELECT estado, apagado_motivo INTO v_estado, v_motivo FROM public.pessoas_anexos WHERE id = v_pend;
        IF v_estado <> 'apagado' OR v_motivo <> 'substituido' THEN
          RAISE EXCEPTION 'o pendente devia ficar apagado (substituido); esta % (%).', v_estado, v_motivo USING ERRCODE = 'HR961';
        END IF;

        -- Outro email: os ficheiros nao vao para outra caixa de correio.
        SELECT r.convite_id INTO v_c3
          FROM public.rpc_hr_convite_admissao_criar(
                 v_p, encode(sha256(convert_to('conferir-70-p3', 'UTF8')), 'hex'), now() + interval '1 day', 'outro.20261210070000@example.invalid', v_uid) r;
        SELECT convite_id, estado, apagado_motivo INTO v_convite, v_estado, v_motivo FROM public.pessoas_anexos WHERE id = v_ligado;
        IF v_estado <> 'apagado' OR v_motivo <> 'substituido' THEN
          RAISE EXCEPTION 'com outro email o ligado devia ficar apagado (substituido); esta % (%).', v_estado, v_motivo
            USING ERRCODE = 'HR961';
        END IF;
      EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'CONFERIR transferir saltado: o super_admin escolhido nao pode enviar convites (%).', SQLERRM;
      END;
    END IF;

    -- ---- limpar + objecto_removido ------------------------------------------
    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido)
    VALUES (v_org_nike, 'TESTE MIGRACAO', '20261210070000 R -- apagar') RETURNING id INTO v_r;
    INSERT INTO public.pessoas_convites_admissao (pessoa_id, organization_id, token_hash, email_destino, valid_until)
    VALUES (v_r, v_org_nike, encode(sha256(convert_to('conferir-70-r', 'UTF8')), 'hex'),'r.20261210070000@example.invalid', now() - interval '8 days')
    RETURNING id INTO v_c2;

    INSERT INTO public.pessoas_anexos (organization_id, pessoa_id, convite_id, tipo, estado, bucket, caminho,
                                       caminho_quarentena,
                                       nome_original, mime_type, tamanho_bytes, hash_sha256, ligado_em, criado_em)
    VALUES (v_org_nike, v_r, v_c2, 'cartao_cidadao', 'ligado', 'hr-documentos', 'teste-70/r-ligado.pdf',
            'admissao/teste-70/r-ligado-q.pdf',
            'ligado.pdf', 'application/pdf', 100, repeat('5', 64), now() - interval '8 days', now() - interval '8 days')
    RETURNING id INTO v_ligado;
    INSERT INTO public.pessoas_anexos (organization_id, pessoa_id, convite_id, tipo, caminho, nome_original, criado_em)
    VALUES (v_org_nike, v_r, v_c2, 'comprovativo_iban', 'teste-70/r-velho.pdf', 'velho.pdf', now() - interval '8 days')
    RETURNING id INTO v_velho;
    INSERT INTO public.pessoas_anexos (organization_id, pessoa_id, convite_id, tipo, caminho, nome_original)
    VALUES (v_org_nike, v_r, v_c2, 'fotografia', 'teste-70/r-fresco.png', 'fresco.png')
    RETURNING id INTO v_novo;

    -- Um promovido ANTIGO com a copia da quarentena por apagar (o caso que perdia
    -- o cartao de cidadao na quarentena).
    INSERT INTO public.pessoas_anexos (organization_id, pessoa_id, tipo, estado, bucket, caminho,
                                       caminho_quarentena,
                                       nome_original, mime_type, tamanho_bytes, hash_sha256, promovido_em, criado_em)
    VALUES (v_org_nike, v_r, 'cartao_cidadao', 'promovido', 'hr-documentos', 'teste-70/r-promovido.pdf',
            'admissao/teste-70/r-promovido-q.pdf',
            'promovido.pdf', 'application/pdf', 100, repeat('6', 64), now() - interval '8 days', now() - interval '8 days')
    RETURNING id INTO v_promovido;

    -- limite 1000 (o tecto): a funcao corre sobre a tabela inteira, e o resultado
    -- que interessa aqui e o das linhas de teste.
    SELECT count(*) INTO v_n
      FROM public.hr_convite_anexos_limpar(7, 1000) l
     WHERE l.anexo_id IN (v_ligado, v_velho, v_novo, v_promovido);
    IF v_n <> 3 THEN
      RAISE EXCEPTION 'limpar devia devolver 3 das 4 linhas de teste (o fresco fica de fora pela regra das 3 horas); devolveu %.', v_n
        USING ERRCODE = 'HR961';
    END IF;

    -- A forma de cada linha devolvida (a segunda volta mostra tentativas = 2).
    SELECT l.bucket, l.caminho, l.caminho_quarentena, l.caminhos_finais, l.tentativas INTO v_linha
      FROM public.hr_convite_anexos_limpar(7, 1000) l WHERE l.anexo_id = v_ligado;
    IF v_linha.bucket IS DISTINCT FROM 'hr-documentos' OR v_linha.caminho IS DISTINCT FROM 'teste-70/r-ligado.pdf'
       OR v_linha.caminho_quarentena IS DISTINCT FROM 'admissao/teste-70/r-ligado-q.pdf'
       OR v_linha.caminhos_finais IS NOT NULL OR v_linha.tentativas <> 2 THEN
      RAISE EXCEPTION 'o ligado de um convite expirado devia vir com o objecto final, a quarentena, sem caminhos_finais e tentativas = 2; veio %.', to_jsonb(v_linha)
        USING ERRCODE = 'HR961';
    END IF;

    SELECT l.bucket, l.caminho, l.caminho_quarentena, l.caminhos_finais INTO v_linha
      FROM public.hr_convite_anexos_limpar(7, 1000) l WHERE l.anexo_id = v_velho;
    IF v_linha.bucket IS DISTINCT FROM 'hr-documentos-quarantine' OR v_linha.caminho IS DISTINCT FROM 'teste-70/r-velho.pdf'
       OR v_linha.caminho_quarentena IS NOT NULL OR coalesce(cardinality(v_linha.caminhos_finais), 0) <> 3 THEN
      RAISE EXCEPTION 'o pendente abandonado devia vir com o objecto da quarentena e os 3 caminhos finais possiveis; veio %.', to_jsonb(v_linha)
        USING ERRCODE = 'HR961';
    END IF;

    SELECT l.bucket, l.caminho, l.caminho_quarentena, l.caminhos_finais INTO v_linha
      FROM public.hr_convite_anexos_limpar(7, 1000) l WHERE l.anexo_id = v_promovido;
    IF v_linha.bucket IS NOT NULL OR v_linha.caminho IS NOT NULL
       OR v_linha.caminho_quarentena IS DISTINCT FROM 'admissao/teste-70/r-promovido-q.pdf' THEN
      RAISE EXCEPTION 'o promovido antigo so devia trazer a copia da quarentena; veio %.', to_jsonb(v_linha)
        USING ERRCODE = 'HR961';
    END IF;
    SELECT apagado_motivo INTO v_motivo FROM public.pessoas_anexos WHERE id = v_ligado;
    IF v_motivo IS DISTINCT FROM 'convite_expirado' THEN
      RAISE EXCEPTION 'o ligado de um convite expirado ha 8 dias devia ficar convite_expirado; ficou %.', v_motivo USING ERRCODE = 'HR961';
    END IF;
    IF (SELECT estado FROM public.pessoas_anexos WHERE id = v_novo) <> 'apagado' THEN
      RAISE EXCEPTION 'o fresco tambem pertence a um convite expirado: devia estar apagado (so nao se devolve).' USING ERRCODE = 'HR961';
    END IF;

    v_lim := public.hr_convite_anexos_objecto_removido(ARRAY[v_ligado, v_velho, v_novo, v_promovido]);
    IF v_lim <> 3 THEN
      RAISE EXCEPTION 'objecto_removido devia marcar 3 linhas (o fresco volta na proxima volta); marcou %.', v_lim USING ERRCODE = 'HR961';
    END IF;
    IF public.hr_convite_anexos_objecto_removido(ARRAY[v_ligado, v_velho, v_novo, v_promovido]) <> 0 THEN
      RAISE EXCEPTION 'marcar duas vezes devia devolver 0.' USING ERRCODE = 'HR961';
    END IF;

    -- O ligado marcou os dois campos; o promovido SO a quarentena (o objecto final
    -- e um ficheiro vivo da ficha e nunca se marca como removido); o fresco nada.
    IF EXISTS (SELECT 1 FROM public.pessoas_anexos WHERE id = v_ligado
                  AND (objecto_removido_em IS NULL OR quarentena_removida_em IS NULL)) THEN
      RAISE EXCEPTION 'o ligado de um convite expirado devia ficar com o objecto e a quarentena removidos.' USING ERRCODE = 'HR961';
    END IF;
    IF EXISTS (SELECT 1 FROM public.pessoas_anexos WHERE id = v_promovido
                  AND (objecto_removido_em IS NOT NULL OR quarentena_removida_em IS NULL)) THEN
      RAISE EXCEPTION 'o promovido devia ficar so com a quarentena removida.' USING ERRCODE = 'HR961';
    END IF;
    IF EXISTS (SELECT 1 FROM public.pessoas_anexos WHERE id = v_novo
                  AND (objecto_removido_em IS NOT NULL OR quarentena_removida_em IS NOT NULL)) THEN
      RAISE EXCEPTION 'o fresco nao devia ficar marcado.' USING ERRCODE = 'HR961';
    END IF;

    -- Depois de marcadas, as linhas deixam de voltar.
    SELECT count(*) INTO v_n
      FROM public.hr_convite_anexos_limpar(7, 1000) l
     WHERE l.anexo_id IN (v_ligado, v_velho, v_promovido);
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'as linhas marcadas nao deviam voltar na limpeza; voltaram %.', v_n USING ERRCODE = 'HR961';
    END IF;

    -- A promocao que falhou volta a tentar-se: um anexo LIGADO de um convite JA
    -- USADO passa a promovido na proxima volta.
    INSERT INTO public.pessoas_convites_admissao (pessoa_id, organization_id, token_hash, email_destino, valid_until, used_at)
    VALUES (v_r, v_org_nike, encode(sha256(convert_to('conferir-70-s', 'UTF8')), 'hex'),'s.20261210070000@example.invalid', now() + interval '1 day', now())
    RETURNING id INTO v_c4;
    INSERT INTO public.pessoas_anexos (organization_id, pessoa_id, convite_id, tipo, estado, bucket, caminho,
                                       nome_original, mime_type, tamanho_bytes, hash_sha256, ligado_em)
    VALUES (v_org_nike, v_r, v_c4, 'comprovativo_iban', 'ligado', 'hr-documentos', 'teste-70/s-iban.pdf',
            'iban.pdf', 'application/pdf', 100, repeat('7', 64), now())
    RETURNING id INTO v_retry;
    IF (public.hr_convite_anexos_limpeza_estado()->>'promocoes_pendentes')::integer < 1 THEN
      RAISE EXCEPTION 'limpeza_estado devia contar a promocao pendente.' USING ERRCODE = 'HR961';
    END IF;
    PERFORM 1 FROM public.hr_convite_anexos_limpar(7, 1000);
    IF (SELECT estado FROM public.pessoas_anexos WHERE id = v_retry) <> 'promovido' THEN
      RAISE EXCEPTION 'a limpeza devia voltar a promover o anexo ligado de um convite ja usado.' USING ERRCODE = 'HR961';
    END IF;

    -- limpeza_estado devolve as chaves da interface.
    IF NOT (public.hr_convite_anexos_limpeza_estado() ?& ARRAY['por_remover', 'por_remover_antigos',
            'quarentena_por_remover', 'promocoes_pendentes', 'max_tentativas', 'job_agendado']) THEN
      RAISE EXCEPTION 'limpeza_estado perdeu uma chave da interface.' USING ERRCODE = 'HR961';
    END IF;

    RAISE EXCEPTION 'teste_hr_anexos_ciclo_20261210070000_ok' USING ERRCODE = 'HR900';
  EXCEPTION
    WHEN SQLSTATE 'HR900' THEN
      NULL; -- sucesso: tudo desfeito pela subtransaccao.
    WHEN OTHERS THEN
      RAISE EXCEPTION 'O conferir ao vivo do ciclo de vida dos anexos falhou -- SQLSTATE %: %', SQLSTATE, SQLERRM;
  END;

  RAISE NOTICE 'CONFERIR AO VIVO (nike): promover (ligados, pendente, fotografia, auditoria), transferir pelo email, limpar com a regra das 3 horas, a copia da quarentena de ligados e promovidos, objecto_removido, a promocao repetida e limpeza_estado. Tudo desfeito.';
END;
$conferir_vivo$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. PRECISA DE CODIGO NOVO: ver o cabecalho. Ordem: db push (as quatro
--    migrations), Edge Functions, ecra.
--
-- 2. Listar o pendente imediatamente antes do push (supabase migration list
--    --linked): o push aplica TUDO o que estiver na pasta, por ordem. Esta
--    migration redefine submeter e criar: confirmar com pg_get_functiondef no
--    remoto que as versoes vigentes sao as das migrations 20261210040000 e
--    20261210030000 (outros ramos podem te-las redefinido).
--
-- 3. Submeter e criar sao do caminho de admissao da Mudelar: a redefinicao nao
--    muda o comportamento sem anexos (promover e transferir nao encontram
--    ficheiros e devolvem 0), mas e codigo partilhado. Dizer ao utilizador o
--    que muda para a Mudelar (nada, sem anexos) e esperar autorizacao.
--
-- 4. Depois do push NAO se volta atras para demonstrar um vermelho.
-- ==============================================================================
