-- ==============================================================================
-- Remove por inteiro os dispositivos de picagem: a tabela, as colunas que lhe
-- apontam, e a RPC de picar volta a dez argumentos.
--
-- POR APLICAR. UNICA MIGRACAO DESTRUTIVA DESTA RONDA.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- A 20261121150000 criou hr_picagens_dispositivos a prever quiosques, leitores
-- e relogios de ponto. O utilizador, a olhar para o ecra, foi directo: "nao
-- existem dispositivos proprios, logo tira, incluindo da bd". Nao ha hardware
-- nenhum, e a tabela, as colunas e a RPC ficam a modelar um caso que nao existe.
--
--
-- -- O QUE ESTA MIGRACAO APAGA, PALAVRA POR PALAVRA -----------------------------
--
-- 1. A funcao public.rpc_hr_picar(uuid,uuid,text,timestamptz,uuid,uuid,numeric,
--    numeric,integer,text,uuid,text) -- DROP e CREATE de novo com DEZ
--    argumentos (sem _dispositivo_id e sem _dispositivo_ref_externa). Um
--    CREATE OR REPLACE com menos argumentos criaria uma SEGUNDA funcao com o
--    mesmo nome e deixaria o PostgREST sem saber qual escolher -- e a mesma
--    classe de acidente que ja parou o botao de resolver submissoes nesta obra.
--    Por isso: DROP FUNCTION da assinatura de doze primeiro, CREATE FUNCTION da
--    de dez a seguir, com os mesmos REVOKE/GRANT reaplicados.
-- 2. Duas colunas de public.pessoas_picagens: dispositivo_id e
--    dispositivo_ref_externa. Antes de as tirar, saem por esta ordem exacta:
--      - a vista public.v_hr_picagens_em_vigor (20261121170000), que faz
--        SELECT p.* e por isso depende das duas colunas -- e a dependencia
--        que o primeiro db push nao tinha mapeado (ERRO 2BP01). Larga-se e
--        recria-se logo a seguir ao DROP COLUMN, com lista de colunas
--        explicita e o mesmo GRANT/REVOKE/COMMENT/security_invoker de
--        sempre. Confirmado em pg_depend que nada mais depende desta vista;
--      - o indice unico parcial uq_pessoas_picagens_ref_externa
--        (organization_id, dispositivo_id, dispositivo_ref_externa);
--      - as constraints pessoas_picagens_dispositivo_fkey,
--        pessoas_picagens_dispositivo_quando_origem_dispositivo e
--        pessoas_picagens_ref_externa_exige_dispositivo;
--      - o CHECK pessoas_picagens_origem_valida, substituido por um sem o
--        valor 'dispositivo' (fica app / web / importacao / manual_rh), so
--        depois de a guarda abaixo confirmar zero linhas com esse valor.
-- 3. A tabela public.hr_picagens_dispositivos inteira, SEM CASCADE de
--    proposito: se ficar alguma dependencia por mapear, o DROP falha com erro
--    em vez de arrastar em silencio o que ninguem viu. Com ela caem as suas
--    quatro politicas RLS, o trigger trg_hr_picagens_dispositivos_updated_at,
--    os GRANTs a authenticated e a service_role, e as suas proprias
--    constraints (incluindo a FK para hr_locais_trabalho -- os locais em si
--    NAO sao afectados, so a tabela que lhes apontava).
--
-- APAGA DADOS? Sim, em teoria: as linhas de hr_picagens_dispositivos e os
-- valores das duas colunas de pessoas_picagens. Confirmado por leitura que a
-- 20261121150000 e a 20261121160000 sao "POR APLICAR" e este ramo nao tem
-- utilizacao real -- por isso a guarda abaixo CONTA em vez de assumir, e o
-- numero fica no output do push.
--
--
-- -- A COLUNA SAI, NAO FICA SEM CHAVE ESTRANGEIRA --------------------------------
--
-- Um uuid que ninguem consegue resolver nao e dado, e lixo que a proxima
-- pessoa tenta interpretar. dispositivo_ref_externa so existia por causa de
-- dispositivo_id -- o proprio CHECK pessoas_picagens_ref_externa_exige_
-- dispositivo o dizia -- por isso as duas saem juntas.
--
-- CUSTO ASSUMIDO: a importacao de picagens (hr.assiduidade.importar, sem ecra
-- nesta ronda) perde a chave de idempotencia que a unique de dispositivo_ref_
-- externa lhe dava. Se a importacao voltar a ser construida, traz a sua
-- propria coluna de referencia nessa altura. Isto fica em POR DECIDIR, nao se
-- resolve aqui.
--
--
-- -- O QUE FICA DE FORA ---------------------------------------------------------
--
-- - As permissoes hr.assiduidade.dispositivos.view/.edit: ficam no catalogo
--   ate a migracao seguinte (20261122040000), porque enquanto esta migracao
--   corre a tabela ainda existe e o codigo ainda e a autoridade que a RLS
--   consultava.
-- - hr_locais_trabalho e o resto do modulo de assiduidade: intactos.
-- - Nao se toca em pessoas_vinculos nem em pessoas_retribuicoes.
--
--
-- -- COMO SE REVERTE -------------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao, e so faz sentido
-- ate a proxima migracao (20261122040000) apagar os codigos de permissao:
--   -- recriar a tabela: reaplicar o corpo de 20261121150000;
--   ALTER TABLE public.pessoas_picagens
--     ADD COLUMN dispositivo_id uuid,
--     ADD COLUMN dispositivo_ref_externa text;
--   ALTER TABLE public.pessoas_picagens
--     ADD CONSTRAINT pessoas_picagens_dispositivo_fkey
--       FOREIGN KEY (dispositivo_id, organization_id)
--       REFERENCES public.hr_picagens_dispositivos (id, organization_id) ON DELETE NO ACTION;
--   -- e reaplicar os dois CHECKs e o indice unico parcial de 20261121160000,
--   -- e o DROP FUNCTION / CREATE FUNCTION de rpc_hr_picar com os doze
--   -- argumentos originais, e o DROP VIEW / CREATE OR REPLACE VIEW de
--   -- v_hr_picagens_em_vigor com o SELECT p.* original de 20261121170000.
--
--
-- Prerequisitos:
--   20261121150000  hr_picagens_dispositivos
--   20261121160000  pessoas_picagens
--   20261121170000  rpc_hr_picar (assinatura de doze argumentos)
-- ==============================================================================

-- ---- Guardas e contagem ------------------------------------------------------
DO $guardas$
DECLARE
  v_tabela_existe   boolean;
  v_linhas_disp     bigint := 0;
  v_linhas_com_disp bigint := 0;
  v_linhas_origem   bigint := 0;
  v_funcao_antiga   integer;
BEGIN
  v_tabela_existe := to_regclass('public.hr_picagens_dispositivos') IS NOT NULL;

  IF to_regclass('public.pessoas_picagens') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_picagens nao existe. Estado da base inesperado.';
  END IF;

  IF NOT v_tabela_existe THEN
    RAISE EXCEPTION
      'public.hr_picagens_dispositivos ja nao existe. Confirmar se esta migracao ja foi aplicada antes de a repetir.';
  END IF;

  SELECT count(*) INTO v_linhas_disp FROM public.hr_picagens_dispositivos;

  SELECT count(*) INTO v_linhas_com_disp
    FROM public.pessoas_picagens WHERE dispositivo_id IS NOT NULL;

  SELECT count(*) INTO v_linhas_origem
    FROM public.pessoas_picagens WHERE origem = 'dispositivo';

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_picar' AND p.pronargs = 12
  ) THEN
    RAISE EXCEPTION
      'rpc_hr_picar com 12 argumentos nao existe. Aplicar 20261121170000 primeiro, ou a assinatura ja mudou por outra via.';
  END IF;

  SELECT count(*) INTO v_funcao_antiga
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_picar';

  IF v_funcao_antiga <> 1 THEN
    RAISE EXCEPTION
      'Esperava-se exactamente 1 funcao rpc_hr_picar antes desta migracao, encontraram-se %. Investigar antes de continuar -- criar uma segunda assinatura ao lado e o erro que esta migracao existe para evitar.',
      v_funcao_antiga;
  END IF;

  RAISE NOTICE
    'Guardas passadas. A apagar: % linha(s) em hr_picagens_dispositivos, % linha(s) de pessoas_picagens com dispositivo_id preenchido, % linha(s) de pessoas_picagens com origem=dispositivo (esperado zero -- e o valor sai do CHECK a seguir).',
    v_linhas_disp, v_linhas_com_disp, v_linhas_origem;

  IF v_linhas_origem > 0 THEN
    RAISE EXCEPTION
      'Ha % linha(s) de pessoas_picagens com origem=dispositivo. O CHECK novo nao aceita esse valor e esta migracao nao teria como as corrigir sozinha -- decidir manualmente o que lhes acontece antes de reaplicar.',
      v_linhas_origem;
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. rpc_hr_picar: DROP da assinatura de doze, CREATE da assinatura de dez.
-- ==============================================================================
DROP FUNCTION IF EXISTS public.rpc_hr_picar(
  uuid, uuid, text, timestamptz, uuid, uuid, numeric, numeric, integer, text, uuid, text
);

CREATE FUNCTION public.rpc_hr_picar(
  _organization_id uuid,
  _pessoa_id uuid,
  _sentido text,
  _momento timestamptz DEFAULT now(),
  _local_id uuid DEFAULT NULL,
  _latitude numeric DEFAULT NULL,
  _longitude numeric DEFAULT NULL,
  _precisao_metros integer DEFAULT NULL,
  _origem text DEFAULT 'web',
  _vinculo_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth      uuid := auth.uid();
  v_anew      uuid;
  v_eu        uuid;
  v_tz        text;
  v_data      date;
  v_hora      time;
  v_planeado  uuid;
  v_id        uuid;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'picagem_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  IF _sentido NOT IN ('entrada','saida') THEN
    RAISE EXCEPTION 'picagem_sentido_invalido: o sentido e entrada ou saida (recebido "%").', _sentido
      USING ERRCODE = '23514';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;
  v_eu := public.hr_pessoa_do_utilizador(v_auth, _organization_id);

  -- Picar o proprio cartao e uma permissao; picar por outro e outra. E a razao
  -- de hr.assiduidade.picar existir: ate agora o unico caminho exigia
  -- hr.pessoas.horario_realizado.edit, que serve para escrever as horas de
  -- qualquer pessoa.
  IF v_eu IS NOT NULL AND v_eu = _pessoa_id THEN
    IF NOT public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.picar', _organization_id) THEN
      RAISE EXCEPTION 'picagem_sem_permissao: falta hr.assiduidade.picar nesta organizacao.' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.picar.outros', _organization_id) THEN
      RAISE EXCEPTION
        'picagem_sem_permissao: picar na ficha de outra pessoa exige hr.assiduidade.picar.outros nesta organizacao.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pessoas p
     WHERE p.id = _pessoa_id AND p.organization_id = _organization_id AND p.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'picagem_pessoa_invalida: a pessoa nao existe nesta organizacao.' USING ERRCODE = '23503';
  END IF;

  -- O fuso da organizacao, resolvido UMA VEZ e gravado. Ver o cabecalho de
  -- 20261121160000 sobre porque data_local nao e uma coluna gerada.
  SELECT s.timezone INTO v_tz
    FROM public.schedule_settings s
   WHERE s.organization_id = _organization_id
   LIMIT 1;

  v_tz := coalesce(nullif(btrim(v_tz), ''), 'Europe/Lisbon');

  v_data := (_momento AT TIME ZONE v_tz)::date;
  v_hora := (_momento AT TIME ZONE v_tz)::time;

  -- O intervalo planeado que contem esta hora, se houver. E uma ligacao, nao um
  -- calculo: nulo e normal (horas extraordinarias, turno trocado, pessoa sem
  -- horario registado).
  SELECT hp.id INTO v_planeado
    FROM public.pessoas_horario_planeado hp
   WHERE hp.pessoa_id = _pessoa_id
     AND hp.organization_id = _organization_id
     AND hp.deleted_at IS NULL
     AND v_hora >= hp.hora_inicio AND v_hora < hp.hora_fim
   ORDER BY hp.hora_inicio
   LIMIT 1;

  INSERT INTO public.pessoas_picagens (
    pessoa_id, organization_id, momento, data_local, hora_local, sentido,
    local_id, vinculo_id, planeado_id, origem,
    latitude, longitude, precisao_metros,
    registado_por_anew_user_id, registado_por_pessoa_id, created_by
  ) VALUES (
    _pessoa_id, _organization_id, _momento, v_data, v_hora, _sentido,
    _local_id, _vinculo_id, v_planeado, coalesce(_origem, 'web'),
    _latitude, _longitude, _precisao_metros,
    v_anew, v_eu, v_anew
  )
  RETURNING id INTO v_id;

  PERFORM public.hr_picagens_consolidar(_pessoa_id, _organization_id, v_data);

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_picar(uuid, uuid, text, timestamptz, uuid, numeric, numeric, integer, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_picar(uuid, uuid, text, timestamptz, uuid, numeric, numeric, integer, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_picar(uuid, uuid, text, timestamptz, uuid, numeric, numeric, integer, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_picar(uuid, uuid, text, timestamptz, uuid, numeric, numeric, integer, text, uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_picar(uuid, uuid, text, timestamptz, uuid, numeric, numeric, integer, text, uuid) IS
'O UNICO caminho para registar uma picagem. Verifica a permissao (picar o proprio cartao e uma, picar por outro e outra), resolve o fuso da organizacao e GRAVA a data e a hora civis, liga ao intervalo planeado que contem a hora, e corre a consolidacao do dia.

DEZ argumentos desde 20261122030000: nao existem dispositivos proprios, e os dois argumentos de dispositivo (_dispositivo_id, _dispositivo_ref_externa) saem com eles. NAO valida geocercas: as coordenadas gravam-se e a validacao de que caem dentro do local e ronda propria.';

-- ==============================================================================
-- 2. pessoas_picagens perde as duas colunas de dispositivo, por esta ordem.
-- ==============================================================================
-- A vista v_hr_picagens_em_vigor (20261121170000) faz SELECT p.* e por isso
-- depende das duas colunas que aqui saem -- e a dependencia que o primeiro
-- db push nao tinha mapeado, e que fez o DROP COLUMN falhar com 2BP01.
-- Nada depende desta vista (confirmado em pg_depend antes de escrever esta
-- migracao): larga-se e recria-se a seguir, sem as colunas de dispositivo e
-- com tudo o resto -- GRANT, REVOKE, COMMENT, security_invoker -- reaplicado
-- palavra por palavra.
DROP VIEW IF EXISTS public.v_hr_picagens_em_vigor;

DROP INDEX IF EXISTS public.uq_pessoas_picagens_ref_externa;

ALTER TABLE public.pessoas_picagens
  DROP CONSTRAINT IF EXISTS pessoas_picagens_dispositivo_fkey,
  DROP CONSTRAINT IF EXISTS pessoas_picagens_dispositivo_quando_origem_dispositivo,
  DROP CONSTRAINT IF EXISTS pessoas_picagens_ref_externa_exige_dispositivo;

ALTER TABLE public.pessoas_picagens
  DROP CONSTRAINT IF EXISTS pessoas_picagens_origem_valida;

ALTER TABLE public.pessoas_picagens
  ADD CONSTRAINT pessoas_picagens_origem_valida
    CHECK (origem IN ('app','web','importacao','manual_rh'));

ALTER TABLE public.pessoas_picagens
  DROP COLUMN IF EXISTS dispositivo_id,
  DROP COLUMN IF EXISTS dispositivo_ref_externa;

-- ==============================================================================
-- 2b. v_hr_picagens_em_vigor, recriada sem as colunas de dispositivo.
-- ==============================================================================
-- Mesma logica de 20261121170000 (a cabeca da cadeia: valida e que ninguem
-- corrige), so que a lista de colunas passa a ser explicita -- SELECT p.* ja
-- nao pode ser, ou a proxima coluna que a tabela ganhar volta a arrastar a
-- vista para uma migracao que nao lhe toca.
CREATE VIEW public.v_hr_picagens_em_vigor
WITH (security_invoker = true) AS
SELECT p.id, p.pessoa_id, p.organization_id,
       p.momento, p.data_local, p.hora_local, p.sentido,
       p.local_id, p.vinculo_id, p.planeado_id,
       p.origem,
       p.latitude, p.longitude, p.precisao_metros,
       p.estado,
       p.realizado_id,
       p.corrige_picagem_id, p.correccao_tipo, p.correccao_motivo,
       p.registado_por_anew_user_id, p.registado_por_pessoa_id,
       p.anulado_em, p.anulado_por_anew_user_id, p.anulacao_motivo,
       p.created_at, p.created_by
  FROM public.pessoas_picagens p
 WHERE p.estado = 'valida'
   AND NOT EXISTS (
     SELECT 1 FROM public.pessoas_picagens c
      WHERE c.corrige_picagem_id = p.id
        AND c.estado <> 'anulada'
   );

REVOKE ALL ON public.v_hr_picagens_em_vigor FROM anon;
GRANT SELECT ON public.v_hr_picagens_em_vigor TO authenticated;
GRANT SELECT ON public.v_hr_picagens_em_vigor TO service_role;

COMMENT ON VIEW public.v_hr_picagens_em_vigor IS
'As picagens que CONTAM: validas e que ninguem corrige. E um anti-join e nao um WITH RECURSIVE, porque o indice uq_picagem_um_corrector_vivo mantem a cadeia linear.

Tres correccoes empilhadas dao tres linhas na tabela -- duas em corrigida e uma em valida -- e esta vista devolve uma. A auditoria ve as tres subindo corrige_picagem_id.

security_invoker = true e OBRIGATORIO: sem isso a vista corre com os direitos do dono e vira porta lateral para as horas de outras organizacoes.

RECRIADA em 20261122030000 com lista de colunas explicita, sem dispositivo_id e dispositivo_ref_externa: as duas saem da tabela nesta mesma migracao, e um SELECT p.* teria arrastado a vista para dentro de um DROP COLUMN que nao lhe pertence.';

-- ==============================================================================
-- 3. A tabela dos dispositivos, sem CASCADE.
-- ==============================================================================
DROP TABLE public.hr_picagens_dispositivos;

-- ---- Conferir ----------------------------------------------------------------
DO $conferir$
DECLARE
  v_funcao_nova   integer;
  v_funcao_velha  integer;
  v_colunas       integer;
  v_check         text;
  v_opts          text;
  v_vista_colunas integer;
BEGIN
  IF to_regclass('public.hr_picagens_dispositivos') IS NOT NULL THEN
    RAISE EXCEPTION 'public.hr_picagens_dispositivos ainda existe.';
  END IF;

  SELECT count(*) INTO v_funcao_nova
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_picar' AND p.pronargs = 10;
  IF v_funcao_nova <> 1 THEN
    RAISE EXCEPTION 'rpc_hr_picar com 10 argumentos nao ficou criada (encontraram-se %).', v_funcao_nova;
  END IF;

  SELECT count(*) INTO v_funcao_velha
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_picar' AND p.pronargs = 12;
  IF v_funcao_velha <> 0 THEN
    RAISE EXCEPTION
      'A assinatura de 12 argumentos de rpc_hr_picar ainda existe -- ficaram DUAS funcoes com o mesmo nome, o PostgREST nao vai saber qual escolher.';
  END IF;

  SELECT count(*) INTO v_colunas
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'pessoas_picagens'
     AND column_name IN ('dispositivo_id','dispositivo_ref_externa');
  IF v_colunas <> 0 THEN
    RAISE EXCEPTION 'pessoas_picagens ainda tem coluna(s) de dispositivo.';
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_check
    FROM pg_constraint
   WHERE conname = 'pessoas_picagens_origem_valida'
     AND conrelid = to_regclass('public.pessoas_picagens');
  IF v_check IS NULL THEN
    RAISE EXCEPTION 'pessoas_picagens_origem_valida nao ficou recriada.';
  END IF;
  IF v_check LIKE '%dispositivo%' THEN
    RAISE EXCEPTION 'pessoas_picagens_origem_valida ainda aceita o valor dispositivo.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'uq_pessoas_picagens_ref_externa'
  ) THEN
    RAISE EXCEPTION 'uq_pessoas_picagens_ref_externa ainda existe.';
  END IF;

  -- A vista tem de ter sobrevivido ao DROP COLUMN -- e a dependencia que o
  -- primeiro db push nao tinha mapeado -- sem a coluna que saiu, e sem perder
  -- o security_invoker de que depende para nao furar a RLS.
  IF to_regclass('public.v_hr_picagens_em_vigor') IS NULL THEN
    RAISE EXCEPTION
      'v_hr_picagens_em_vigor nao ficou recriada. Sem ela, a consolidacao (20261121190000) e a fila de desvios (20261121250000) ficam sem o valor em vigor das picagens.';
  END IF;

  SELECT count(*) INTO v_vista_colunas
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'v_hr_picagens_em_vigor'
     AND column_name IN ('dispositivo_id','dispositivo_ref_externa');
  IF v_vista_colunas <> 0 THEN
    RAISE EXCEPTION 'v_hr_picagens_em_vigor recriada ainda expoe coluna(s) de dispositivo.';
  END IF;

  SELECT coalesce(array_to_string(c.reloptions, ','), '') INTO v_opts
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'v_hr_picagens_em_vigor';
  IF v_opts NOT LIKE '%security_invoker=true%' THEN
    RAISE EXCEPTION
      'v_hr_picagens_em_vigor recriada ficou sem security_invoker=true. Assim corre com os direitos do dono e vira porta lateral para as horas de outras organizacoes. Opcoes: "%"', v_opts;
  END IF;

  IF has_table_privilege('anon', 'public.v_hr_picagens_em_vigor', 'SELECT') THEN
    RAISE EXCEPTION 'anon consegue ler v_hr_picagens_em_vigor recriada. O REVOKE nao pegou.';
  END IF;

  RAISE NOTICE
    'Conferido: hr_picagens_dispositivos removida, rpc_hr_picar com 10 argumentos, pessoas_picagens e v_hr_picagens_em_vigor sem colunas de dispositivo, vista com security_invoker.';
END;
$conferir$;
