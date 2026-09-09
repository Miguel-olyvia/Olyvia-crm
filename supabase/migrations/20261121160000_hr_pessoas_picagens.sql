-- ==============================================================================
-- pessoas_picagens: uma linha = UM EVENTO. O instante em que alguem entrou ou
-- saiu.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA, E PORQUE NAO VAI PARA pessoas_horario_realizado --------------
--
-- Uma picagem e um INSTANTE; um realizado e um INTERVALO. E a diferenca nao e
-- filosofica -- e de forma:
--
--   pessoas_horario_realizado tem hora_inicio NOT NULL, hora_fim NOT NULL,
--   CHECK (hora_fim > hora_inicio) e minutos GENERATED ALWAYS.
--
-- Uma entrada as 9:02 SEM SAIDA AINDA nao tem representacao possivel ali -- e e
-- o estado normal de uma picagem durante sete horas por dia. Alem disso o
-- trigger hr_horario_realizado_sem_sobreposicao recusa cruzamentos, enquanto o
-- mundo real das picagens entrega duplicados (o dedo passou duas vezes no
-- leitor), pares invertidos, saidas sem entrada e eventos fora de ordem.
--
-- Forcar isso na tabela do realizado obrigaria a relaxar os CHECKs e o trigger
-- que a ronda 2 escreveu de proposito -- e perder-se-ia a peca que garante que
-- as horas CONTABILIZAVEIS sao coerentes.
--
-- O inverso -- um segundo realizado so para picagens -- parte em dois a
-- contabilidade das horas: a fila de validacao, os minutos gerados, o vinculo,
-- o local e a RLS de ficha-propria passariam a existir em duplicado, e qualquer
-- relatorio de horas teria de somar duas tabelas com regras diferentes.
--
-- A ronda 2 deixou origem='picagem' no dominio de pessoas_horario_realizado e
-- sem escritor. Era o encaixe previsto, e usa-se: as picagens CONSOLIDAM em
-- realizado (20261121190000).
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- momento e o instante em UTC. data_local e hora_local sao GRAVADOS e nao
-- gerados, por duas razoes: uma coluna GENERATED nao pode consultar
-- schedule_settings.timezone de outra tabela, e a data civil de um evento e um
-- SNAPSHOT -- se alguem mudar o fuso da organizacao em Novembro, as picagens de
-- Marco nao podem mudar de dia.
--
-- O LOCAL VIAJA NO EVENTO. E assim que os varios intervalos no mesmo dia em
-- locais diferentes se resolvem sem nada de novo: 9-14 na empresa A e 15-19 na
-- empresa B sao quatro picagens, cada uma com o seu local_id, e a consolidacao
-- produz dois intervalos de realizado.
--
-- SEM updated_at e SEM deleted_at, de proposito: esta tabela e APPEND-ONLY. O
-- que noutras tabelas do modulo e soft delete, aqui e estado='anulada' com
-- autor e motivo, e corrigir e inserir uma linha nova (20261121170000).
--
-- Duas UNIQUEs que fazem trabalho real:
--   (organization_id, dispositivo_id, dispositivo_ref_externa) -- e isto que
--     torna a importacao do relogio idempotente;
--   (pessoa_id, momento, sentido) nas validas -- o dedo que passou duas vezes
--     no mesmo segundo nao entra duas vezes.
-- E um trigger recusa entrada e saida com o MESMO momento: nao ha forma de
-- saber qual veio primeiro, e a UNIQUE por sentido nao apanha esse caso.
--
--
-- -- ESCRITA FECHADA -----------------------------------------------------------
--
-- authenticated tem SELECT e mais nada; tres politicas AS RESTRICTIVE ... false.
-- Picar nao e inserir uma linha: e resolver o fuso da organizacao, datar o
-- evento, validar que o dispositivo pertence a organizacao, deduzir o intervalo
-- planeado e correr a consolidacao. E a correccao tem de inserir a nova e
-- marcar a antiga na MESMA transaccao. Um WITH CHECK nao garante nada disso, e
-- uma politica de UPDATE sem WITH CHECK foi exactamente o buraco por onde
-- schedule_items deixa hoje mudar approval_status.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - A consolidacao, a correccao, as vistas de valor em vigor e as RPCs:
--   20261121170000 e 20261121190000.
-- - A FK composta de realizado_id: a coluna existe aqui e a FK e declarada em
--   20261121180000, porque depende de uma unique que essa migracao acrescenta a
--   pessoas_horario_realizado.
-- - Validar que a coordenada cai dentro do local (geocerca com raio): as
--   colunas ficam a acumular dados, a validacao e ronda propria.
-- - Nao se toca em pessoas_vinculos nem em pessoas_retribuicoes.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP TABLE public.pessoas_picagens;
--   DROP FUNCTION public.hr_picagem_sentidos_no_mesmo_instante();
--
--
-- Prerequisitos:
--   20261120030000  pessoas (unique pessoas_id_org_key)
--   20261120060000  pessoas_vinculos (unique pessoas_vinculos_id_pessoa_org_key)
--   20261120130000  hr_locais_trabalho
--   20261120150000  pessoas_horario_planeado (unique id, pessoa_id, organization_id)
--   20261120040000  hr_satelite_ancora_imutavel()
--   20261121050000  hr_ausencias_pessoa_na_minha_cadeia(uuid, uuid, uuid)
--   20261121150000  hr_picagens_dispositivos
--   20261121140000  hr.assiduidade.* no catalogo
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas nao existe. Aplicar 20261120030000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_horario_planeado_id_pessoa_org_key'
       AND conrelid = to_regclass('public.pessoas_horario_planeado')
  ) THEN
    RAISE EXCEPTION
      'A unique pessoas_horario_planeado_id_pessoa_org_key nao existe; a FK COMPOSTA de planeado_id depende dela. Aplicar 20261120150000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_vinculos_id_pessoa_org_key'
       AND conrelid = to_regclass('public.pessoas_vinculos')
  ) THEN
    RAISE EXCEPTION 'A unique pessoas_vinculos_id_pessoa_org_key nao existe. Aplicar 20261120060000 primeiro.';
  END IF;

  IF to_regclass('public.hr_picagens_dispositivos') IS NULL THEN
    RAISE EXCEPTION 'public.hr_picagens_dispositivos nao existe. Aplicar 20261121150000 primeiro.';
  END IF;

  IF to_regclass('public.hr_locais_trabalho') IS NULL THEN
    RAISE EXCEPTION 'public.hr_locais_trabalho nao existe. Aplicar 20261120130000 primeiro.';
  END IF;

  -- Reaproveitada da ronda de ausencias, por nome E aridade.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_ausencias_pessoa_na_minha_cadeia' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION
      'hr_ausencias_pessoa_na_minha_cadeia(uuid, uuid, uuid) nao existe. Aplicar 20261121050000 primeiro: o ramo de chefia da RLS reaproveita-a e nao se cria uma segunda funcao de cadeia.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_satelite_ancora_imutavel'
  ) THEN
    RAISE EXCEPTION 'hr_satelite_ancora_imutavel() nao existe. Aplicar 20261120040000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.assiduidade.view') THEN
    RAISE EXCEPTION 'hr.assiduidade.view nao esta no catalogo. Aplicar 20261121140000 primeiro.';
  END IF;
END;
$guardas$;

-- ---- A tabela --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pessoas_picagens (
  id                        uuid NOT NULL DEFAULT gen_random_uuid(),
  pessoa_id                 uuid NOT NULL,
  organization_id           uuid NOT NULL,

  momento                   timestamptz NOT NULL,
  -- GRAVADOS, nao gerados. Ver o cabecalho.
  data_local                date NOT NULL,
  hora_local                time NOT NULL,

  sentido                   text NOT NULL,

  local_id                  uuid,
  vinculo_id                uuid,
  planeado_id               uuid,

  origem                    text NOT NULL,
  dispositivo_id            uuid,
  dispositivo_ref_externa   text,

  latitude                  numeric(10,8),
  longitude                 numeric(11,8),
  precisao_metros           integer,

  estado                    text NOT NULL DEFAULT 'valida',

  -- O intervalo de realizado que este evento ajudou a formar. A FK COMPOSTA e
  -- declarada em 20261121180000, que acrescenta a unique de que ela depende.
  realizado_id              uuid,

  -- A cadeia de correccao. Ver 20261121170000.
  corrige_picagem_id        uuid,
  correccao_tipo            text,
  correccao_motivo          text,

  registado_por_anew_user_id uuid,
  registado_por_pessoa_id    uuid,

  anulado_em                timestamptz,
  anulado_por_anew_user_id   uuid,
  anulacao_motivo            text,

  -- SEM updated_at e SEM deleted_at: append-only.
  created_at                timestamptz NOT NULL DEFAULT now(),
  created_by                uuid,

  CONSTRAINT pessoas_picagens_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_picagens_id_org_key UNIQUE (id, organization_id),
  CONSTRAINT pessoas_picagens_id_pessoa_org_key UNIQUE (id, pessoa_id, organization_id),

  CONSTRAINT pessoas_picagens_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id) ON DELETE CASCADE,

  CONSTRAINT pessoas_picagens_local_fkey
    FOREIGN KEY (local_id, organization_id)
    REFERENCES public.hr_locais_trabalho (id, organization_id) ON DELETE NO ACTION,

  CONSTRAINT pessoas_picagens_vinculo_fkey
    FOREIGN KEY (vinculo_id, pessoa_id, organization_id)
    REFERENCES public.pessoas_vinculos (id, pessoa_id, organization_id)
    ON DELETE SET NULL (vinculo_id),

  -- COMPOSTA: sem pessoa_id na chave, uma picagem podia dizer que cumpre o
  -- planeado de OUTRA pessoa da mesma organizacao.
  CONSTRAINT pessoas_picagens_planeado_fkey
    FOREIGN KEY (planeado_id, pessoa_id, organization_id)
    REFERENCES public.pessoas_horario_planeado (id, pessoa_id, organization_id)
    ON DELETE SET NULL (planeado_id),

  CONSTRAINT pessoas_picagens_dispositivo_fkey
    FOREIGN KEY (dispositivo_id, organization_id)
    REFERENCES public.hr_picagens_dispositivos (id, organization_id) ON DELETE NO ACTION,

  -- A correccao aponta a uma picagem DA MESMA PESSOA. A FK composta ja garante
  -- pessoa e organizacao; o trigger de 20261121170000 acrescenta o resto.
  CONSTRAINT pessoas_picagens_corrige_fkey
    FOREIGN KEY (corrige_picagem_id, pessoa_id, organization_id)
    REFERENCES public.pessoas_picagens (id, pessoa_id, organization_id) ON DELETE NO ACTION,

  CONSTRAINT pessoas_picagens_registado_por_fkey
    FOREIGN KEY (registado_por_anew_user_id) REFERENCES public.anew_users (id) ON DELETE NO ACTION,
  CONSTRAINT pessoas_picagens_registado_por_pessoa_fkey
    FOREIGN KEY (registado_por_pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id)
    ON DELETE SET NULL (registado_por_pessoa_id),
  CONSTRAINT pessoas_picagens_anulado_por_fkey
    FOREIGN KEY (anulado_por_anew_user_id) REFERENCES public.anew_users (id) ON DELETE NO ACTION,
  CONSTRAINT pessoas_picagens_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  CONSTRAINT pessoas_picagens_sentido_valido
    CHECK (sentido IN ('entrada','saida')),

  CONSTRAINT pessoas_picagens_origem_valida
    CHECK (origem IN ('dispositivo','app','web','importacao','manual_rh')),

  CONSTRAINT pessoas_picagens_estado_valido
    CHECK (estado IN ('valida','corrigida','anulada')),

  CONSTRAINT pessoas_picagens_correccao_tipo_valido
    CHECK (correccao_tipo IS NULL OR correccao_tipo IN
           ('hora_errada','sentido_errado','local_errado','duplicada','esquecida','outro')),

  -- Corrigir sem dizer porque nao e corrigir.
  CONSTRAINT pessoas_picagens_correccao_com_motivo
    CHECK (corrige_picagem_id IS NULL
           OR (correccao_motivo IS NOT NULL AND btrim(correccao_motivo) <> ''
               AND correccao_tipo IS NOT NULL)),

  -- Coordenadas: as duas ou nenhuma, e nas gamas validas. O mesmo CHECK de
  -- hr_locais_trabalho.
  CONSTRAINT pessoas_picagens_coordenadas_coerentes
    CHECK ((latitude IS NULL) = (longitude IS NULL)),
  CONSTRAINT pessoas_picagens_latitude_valida
    CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  CONSTRAINT pessoas_picagens_longitude_valida
    CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
  CONSTRAINT pessoas_picagens_precisao_valida
    CHECK (precisao_metros IS NULL OR precisao_metros >= 0),

  -- Uma picagem de dispositivo tem de dizer qual.
  CONSTRAINT pessoas_picagens_dispositivo_quando_origem_dispositivo
    CHECK (origem <> 'dispositivo' OR dispositivo_id IS NOT NULL),

  -- Uma referencia externa sem dispositivo nao e idempotente contra nada.
  CONSTRAINT pessoas_picagens_ref_externa_exige_dispositivo
    CHECK (dispositivo_ref_externa IS NULL OR dispositivo_id IS NOT NULL),

  CONSTRAINT pessoas_picagens_anulacao_coerente
    CHECK (
      (anulado_em IS NULL AND anulado_por_anew_user_id IS NULL AND anulacao_motivo IS NULL)
      OR (anulado_em IS NOT NULL AND anulado_por_anew_user_id IS NOT NULL
          AND anulacao_motivo IS NOT NULL AND btrim(anulacao_motivo) <> '')
    ),

  -- estado='anulada' e ter anulado_em sao a mesma coisa dita duas vezes: que
  -- fiquem coerentes.
  CONSTRAINT pessoas_picagens_estado_anulada_coerente
    CHECK ((estado = 'anulada') = (anulado_em IS NOT NULL))
);

-- ---- Indices ---------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_pessoas_picagens_pessoa_dia
  ON public.pessoas_picagens (pessoa_id, data_local, momento)
  WHERE estado <> 'anulada';

CREATE INDEX IF NOT EXISTS idx_pessoas_picagens_org_dia
  ON public.pessoas_picagens (organization_id, data_local)
  WHERE estado <> 'anulada';

CREATE INDEX IF NOT EXISTS idx_pessoas_picagens_local_dia
  ON public.pessoas_picagens (local_id, data_local)
  WHERE local_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pessoas_picagens_realizado
  ON public.pessoas_picagens (realizado_id)
  WHERE realizado_id IS NOT NULL;

-- E ISTO que torna a importacao do relogio de ponto idempotente: o mesmo evento
-- do mesmo dispositivo nao entra duas vezes, e um reenvio do ficheiro nao
-- duplica o dia todo.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pessoas_picagens_ref_externa
  ON public.pessoas_picagens (organization_id, dispositivo_id, dispositivo_ref_externa)
  WHERE dispositivo_ref_externa IS NOT NULL;

-- O dedo que passou duas vezes no leitor no mesmo segundo.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pessoas_picagens_momento_sentido
  ON public.pessoas_picagens (pessoa_id, momento, sentido)
  WHERE estado = 'valida';

COMMENT ON TABLE public.pessoas_picagens IS
'Uma linha = UM EVENTO de picagem: o instante em que alguem entrou ou saiu.

NAO vive em pessoas_horario_realizado porque uma picagem e um INSTANTE e um realizado e um INTERVALO: uma entrada as 9:02 sem saida ainda nao tem representacao possivel numa tabela com hora_fim NOT NULL e CHECK (hora_fim > hora_inicio). E o mundo real das picagens entrega duplicados, pares invertidos e saidas sem entrada, que o trigger de sobreposicao do realizado -- escrito de proposito -- recusa.

As picagens CONSOLIDAM em pessoas_horario_realizado com origem=picagem, que a ronda 2 deixou no dominio sem escritor. Era o encaixe previsto.

O LOCAL VIAJA NO EVENTO: 9-14 na empresa A e 15-19 na empresa B sao quatro picagens e dois intervalos de realizado, cada um com o seu local.

APPEND-ONLY: sem updated_at e sem deleted_at. Anular e um estado com autor e motivo; corrigir e inserir uma linha nova que aponta a errada.';

COMMENT ON COLUMN public.pessoas_picagens.data_local IS
'A data civil a que o evento pertence, GRAVADA e nao gerada. Duas razoes: uma coluna GENERATED nao pode consultar schedule_settings.timezone de outra tabela, e a data civil de um evento e um SNAPSHOT -- mudar o fuso da organizacao em Novembro nao pode mudar de dia as picagens de Marco.';

COMMENT ON COLUMN public.pessoas_picagens.dispositivo_ref_externa IS
'O identificador do evento no relogio de ponto. Com a unique (organization_id, dispositivo_id, dispositivo_ref_externa), e isto que torna a importacao idempotente: reenviar o ficheiro nao duplica o dia.';

COMMENT ON COLUMN public.pessoas_picagens.realizado_id IS
'O intervalo de pessoas_horario_realizado que este evento ajudou a formar. A FK COMPOSTA e declarada em 20261121180000, que acrescenta a unique (id, pessoa_id, organization_id) de que ela depende.';

-- ---- Entrada e saida no mesmo instante -------------------------------------
CREATE OR REPLACE FUNCTION public.hr_picagem_sentidos_no_mesmo_instante()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.estado <> 'valida' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pessoas_picagens p
     WHERE p.pessoa_id = NEW.pessoa_id
       AND p.momento = NEW.momento
       AND p.sentido <> NEW.sentido
       AND p.estado = 'valida'
       AND p.id <> NEW.id
  ) THEN
    RAISE EXCEPTION
      'picagem_sentidos_no_mesmo_instante: ja ha uma picagem valida da mesma pessoa no instante % com o sentido oposto. Nao ha forma de saber qual veio primeiro -- corrigir a hora de uma delas, ou anular a errada.',
      NEW.momento
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_picagem_sentidos_no_mesmo_instante() IS
'Recusa entrada e saida da mesma pessoa no MESMO momento. A unique (pessoa_id, momento, sentido) nao apanha este caso, porque os sentidos sao diferentes -- e um par assim nao tem ordem: nao ha forma de saber qual veio primeiro, e a consolidacao produziria um intervalo de duracao zero ou negativa.

SECURITY DEFINER: sob RLS de invocador nao veria as linhas existentes e aprovaria sempre.';

DROP TRIGGER IF EXISTS trg_pessoas_picagens_sentidos_mesmo_instante ON public.pessoas_picagens;
CREATE TRIGGER trg_pessoas_picagens_sentidos_mesmo_instante
  BEFORE INSERT OR UPDATE ON public.pessoas_picagens
  FOR EACH ROW EXECUTE FUNCTION public.hr_picagem_sentidos_no_mesmo_instante();

DROP TRIGGER IF EXISTS trg_pessoas_picagens_ancora ON public.pessoas_picagens;
CREATE TRIGGER trg_pessoas_picagens_ancora
  BEFORE UPDATE ON public.pessoas_picagens
  FOR EACH ROW EXECUTE FUNCTION public.hr_satelite_ancora_imutavel();

-- ---- Grants: SELECT e mais nada -------------------------------------------
REVOKE ALL ON TABLE public.pessoas_picagens FROM anon;
REVOKE ALL ON TABLE public.pessoas_picagens FROM authenticated;
GRANT SELECT ON TABLE public.pessoas_picagens TO authenticated;
GRANT ALL ON TABLE public.pessoas_picagens TO service_role;

-- ---- RLS -------------------------------------------------------------------
ALTER TABLE public.pessoas_picagens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pessoas_picagens_select ON public.pessoas_picagens;
CREATE POLICY pessoas_picagens_select ON public.pessoas_picagens
  FOR SELECT TO authenticated
  USING (
    (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.assiduidade.view', organization_id))
    OR (
      (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.assiduidade.view.own', organization_id))
      AND pessoa_id = (SELECT public.hr_pessoa_do_utilizador((SELECT auth.uid()), organization_id))
    )
    OR (
      (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.assiduidade.equipa.view', organization_id))
      AND (SELECT public.hr_ausencias_pessoa_na_minha_cadeia((SELECT auth.uid()), pessoa_id, organization_id))
    )
  );

DROP POLICY IF EXISTS pessoas_picagens_block_insert ON public.pessoas_picagens;
CREATE POLICY pessoas_picagens_block_insert ON public.pessoas_picagens
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS pessoas_picagens_block_update ON public.pessoas_picagens;
CREATE POLICY pessoas_picagens_block_update ON public.pessoas_picagens
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS pessoas_picagens_block_delete ON public.pessoas_picagens;
CREATE POLICY pessoas_picagens_block_delete ON public.pessoas_picagens
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON POLICY pessoas_picagens_select ON public.pessoas_picagens IS
'Tres ramos: quem gere assiduidade ve a organizacao (hr.assiduidade.view); quem pica ve o seu (hr.assiduidade.view.own + conta ligada a ficha); a chefia ve a equipa toda a cadeia abaixo (hr.assiduidade.equipa.view). O terceiro reaproveita hr_ausencias_pessoa_na_minha_cadeia da ronda de ausencias -- e generica, e criar uma segunda funcao de cadeia ao lado seria duplicacao.';

COMMENT ON POLICY pessoas_picagens_block_insert ON public.pessoas_picagens IS
'Escrita fechada. Picar nao e inserir uma linha: e resolver o fuso da organizacao, datar o evento, validar que o dispositivo pertence a organizacao, deduzir o intervalo planeado e correr a consolidacao. Entra por rpc_hr_picar (20261121170000).';

COMMENT ON POLICY pessoas_picagens_block_delete ON public.pessoas_picagens IS
'NUNCA se apaga uma picagem. O registo de tempo de trabalho tem de ficar disponivel cinco anos, e por isso nao ha caminho de apagamento nenhum -- nem deleted_at, nem purga automatica. Anula-se (estado=anulada, com autor e motivo) ou corrige-se com uma linha nova.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_rls   boolean;
  v_pol   integer;
  v_restr integer;
  v_qual  text;
BEGIN
  IF to_regclass('public.pessoas_picagens') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_picagens nao ficou criada.';
  END IF;

  SELECT c.relrowsecurity INTO v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'pessoas_picagens';
  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'A tabela ficou sem RLS activo.';
  END IF;

  SELECT count(*) INTO v_pol FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_picagens';
  IF v_pol <> 4 THEN
    RAISE EXCEPTION 'Esperavam-se 4 politicas, encontraram-se %.', v_pol;
  END IF;

  SELECT count(*) INTO v_restr FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_picagens' AND permissive = 'RESTRICTIVE';
  IF v_restr <> 3 THEN
    RAISE EXCEPTION 'Esperavam-se 3 politicas RESTRICTIVE de escrita, encontraram-se %.', v_restr;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name = 'pessoas_picagens'
       AND grantee = 'authenticated' AND privilege_type IN ('INSERT','UPDATE','DELETE')
  ) THEN
    RAISE EXCEPTION 'authenticated tem GRANT de escrita em pessoas_picagens. Esta tabela e SELECT e mais nada.';
  END IF;

  SELECT coalesce(qual,'') INTO v_qual FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_picagens'
     AND policyname = 'pessoas_picagens_select';

  IF v_qual NOT LIKE '%hr_pessoa_do_utilizador%' THEN
    RAISE EXCEPTION 'A politica de SELECT perdeu o ramo de ficha-propria: quem pica nao veria as suas picagens.';
  END IF;
  IF v_qual NOT LIKE '%hr_ausencias_pessoa_na_minha_cadeia%' THEN
    RAISE EXCEPTION 'A politica de SELECT perdeu o ramo da chefia.';
  END IF;
  IF v_qual LIKE '%get_user_visible_org_ids%' THEN
    RAISE EXCEPTION 'A politica usa get_user_visible_org_ids. Em RH isso nunca acontece.';
  END IF;
  IF v_qual ~ 'has_anew_permission\([^_]' THEN
    RAISE EXCEPTION 'A politica usa has_anew_permission (global) em vez de has_anew_permission_in_org.';
  END IF;

  -- Append-only de verdade.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_picagens'
       AND column_name IN ('updated_at','deleted_at')
  ) THEN
    RAISE EXCEPTION
      'pessoas_picagens ganhou updated_at ou deleted_at. E append-only: anular e um estado, corrigir e uma linha nova, e nao ha caminho de apagamento porque o registo tem de durar cinco anos.';
  END IF;

  -- As duas uniques que fazem trabalho real.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_pessoas_picagens_ref_externa'
  ) THEN
    RAISE EXCEPTION 'A unique da referencia externa nao ficou criada; a importacao deixaria de ser idempotente.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_pessoas_picagens_momento_sentido'
  ) THEN
    RAISE EXCEPTION 'A unique (pessoa_id, momento, sentido) nao ficou criada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_picagens_planeado_fkey'
       AND conrelid = to_regclass('public.pessoas_picagens')
       AND cardinality(conkey) = 3
  ) THEN
    RAISE EXCEPTION
      'pessoas_picagens_planeado_fkey nao e a FK composta de 3 colunas. Uma FK simples deixaria uma picagem dizer que cumpre o planeado de outra pessoa.';
  END IF;

  RAISE NOTICE 'Conferido: pessoas_picagens append-only, escrita fechada, tres ramos de leitura.';
END;
$conferir$;
