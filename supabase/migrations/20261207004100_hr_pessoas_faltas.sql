-- ==============================================================================
-- pessoas_faltas: a falta, com o PERIODO explicito. Marcada, nunca inferida.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- Uma falta nao e um booleano de dia. O caso concreto: horario das 9 as 18,
-- faltou so a manha. Um "faltou = true" no dia perde a informacao que interessa
-- -- quantas horas, e quais.
--
-- E ha um segundo problema, pior: a tentacao de DETECTAR a falta comparando
-- planeado com realizado. Um desvio pode ser uma picagem esquecida, e
-- transformar automaticamente picagem esquecida em falta injustificada e a
-- coisa que mais rapido faz perder a confianca no modulo.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Uma linha = um PERIODO em falta, com hora_inicio e hora_fim NOT NULL,
-- ancorado ao intervalo planeado por planeado_id. O caso do utilizador fica:
-- data = 2026-03-04, planeado_id = o intervalo 9-18, hora_inicio = 09:00,
-- hora_fim = 13:00, minutos gerados = 240.
--
-- Uma falta do dia inteiro e a MESMA coisa com 09:00-18:00. NAO ha caminho
-- especial para o dia completo, porque foi a inferencia que se excluiu: se quem
-- gere a assiduidade clicar "dia todo", a UI copia as horas do planeado e
-- grava-as. A base recebe sempre um periodo.
--
-- justificacao_estado e o ponto central: a AUSENCIA de justificacao e um VALOR,
-- nao um NULL.
--   sem_justificacao    -- marcou-se a falta e nao ha papel
--   pendente_documento  -- a pessoa disse que traz o atestado
--   justificada
--   recusada            -- o papel veio e nao serve, com motivo obrigatorio
-- Um NULL ali significaria "nao sabemos se sabemos", e e exactamente a
-- ambiguidade que da disputas laborais.
--
-- remunerada e desconta_saldo sao decisoes de RH e nao derivadas do motivo: a
-- mesma doenca pode ser remunerada num contrato e nao noutro.
--
-- A FALTA E MARCADA, NAO DETECTADA. A vista v_hr_assiduidade_desvios
-- (20261121250000) PROPOE os periodos descobertos, com as horas ja calculadas
-- para o formulario abrir preenchido -- e nada escreve aqui sem uma decisao
-- humana com hr.assiduidade.faltas.edit.
--
--
-- -- TRES NAO-SOBREPOSICOES, E UMA E DE GENERO NOVO ---------------------------
--
-- 1. realizado x realizado -- JA EXISTE (ronda 2), e mais estrita que a do
--    planeado, e nao se toca.
-- 2. falta x falta -- hr_faltas_sem_sobreposicao(), novo. Faltar duas vezes a
--    mesma hora e contar o mesmo prejuizo duas vezes.
-- 3. falta x realizado -- hr_falta_nao_cruza_realizado(), novo, e e o que
--    impede a incoerencia que interessa: nao se pode estar em falta as 10:30 e
--    ter uma picagem consolidada as 10:30. Corre nos DOIS SENTIDOS, com trigger
--    em cada tabela, porque a ordem de chegada nao e previsivel -- as vezes
--    marca-se a falta e so depois aparece a picagem esquecida.
--
-- A comparacao e SEMI-ABERTA (< e nao <=) de proposito, e vai ficar dito em
-- COMMENT ON FUNCTION para ninguem "endurecer" o operador: 09:00-14:00 na
-- empresa A e 14:00-19:00 na empresa B e CONTIGUIDADE, nao cruzamento, e e o
-- caso real das senhoras da limpeza.
--
-- btree_gist nao esta instalado: a comparacao e explicita, no molde de
-- hr_horario_realizado_sem_sobreposicao. Fica assumida por escrito a MESMA
-- janela de corrida que a ronda 2 assumiu: duas transaccoes concorrentes podem
-- passar as duas, porque o trigger le antes de a outra ter escrito.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - As justificacoes e o ficheiro: 20261121210000 e 20261121220000.
-- - A guarda contra faltas sobre ausencias aprovadas, e a FK de
--   ausencia_dia_id: 20261121230000, que depende da ronda 3.
-- - Calculo de horas extraordinarias, banco de horas, tolerancias, e qualquer
--   ligacao a pessoas_retribuicoes.
-- - Nao se toca em pessoas_vinculos nem em pessoas_retribuicoes.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP TRIGGER trg_pessoas_horario_realizado_nao_cruza_falta ON public.pessoas_horario_realizado;
--   DROP FUNCTION public.rpc_hr_falta_anular(uuid, text);
--   DROP FUNCTION public.rpc_hr_falta_corrigir(uuid, time, time, text, text);
--   DROP FUNCTION public.rpc_hr_falta_marcar(uuid, uuid, date, time, time, text, uuid, boolean, boolean);
--   DROP TABLE public.pessoas_faltas;
--   DROP FUNCTION public.hr_falta_nao_cruza_realizado();
--   DROP FUNCTION public.hr_faltas_sem_sobreposicao();
--
--
-- Prerequisitos:
--   20261120030000  pessoas (unique pessoas_id_org_key)
--   20261120150000  pessoas_horario_planeado (unique id, pessoa_id, organization_id)
--   20261120160000  pessoas_horario_realizado
--   20261120130000  hr_locais_trabalho
--   20261121050000  hr_ausencias_pessoa_na_minha_cadeia(uuid, uuid, uuid)
--   20261121140000  hr.assiduidade.faltas.* no catalogo
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
    RAISE EXCEPTION 'A unique pessoas_horario_planeado_id_pessoa_org_key nao existe. Aplicar 20261120150000 primeiro.';
  END IF;

  IF to_regclass('public.pessoas_horario_realizado') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_horario_realizado nao existe. Aplicar 20261120160000 primeiro.';
  END IF;

  -- O trigger da ronda 2 tem de estar de pe: e a peca 1 das tres
  -- nao-sobreposicoes, e esta migracao nao a recria.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = to_regclass('public.pessoas_horario_realizado')
       AND tgname = 'trg_pessoas_horario_realizado_sem_sobreposicao' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION
      'O trigger de nao-sobreposicao do realizado (ronda 2) nao existe. E a primeira das tres verificacoes e esta migracao NAO a recria -- investigar.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_ausencias_pessoa_na_minha_cadeia' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION 'hr_ausencias_pessoa_na_minha_cadeia(uuid, uuid, uuid) nao existe. Aplicar 20261121050000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.assiduidade.faltas.view') THEN
    RAISE EXCEPTION 'hr.assiduidade.faltas.view nao esta no catalogo. Aplicar 20261121140000 primeiro.';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'btree_gist') THEN
    RAISE NOTICE
      'btree_gist esta instalado. As nao-sobreposicoes desta migracao continuam a ser por trigger; um EXCLUDE passa a ser possivel e e melhoria para outra ronda.';
  END IF;
END;
$guardas$;

-- ---- A tabela --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pessoas_faltas (
  id                        uuid NOT NULL DEFAULT gen_random_uuid(),
  pessoa_id                 uuid NOT NULL,
  organization_id           uuid NOT NULL,

  data                      date NOT NULL,
  planeado_id               uuid,
  vinculo_id                uuid,
  local_id                  uuid,

  hora_inicio               time NOT NULL,
  hora_fim                  time NOT NULL,

  -- Copia literal da expressao do realizado, para os minutos das duas tabelas
  -- serem comparaveis sem conversao.
  minutos                   integer GENERATED ALWAYS AS
                              ((EXTRACT(epoch FROM (hora_fim - hora_inicio)) / 60)::integer) STORED,

  motivo_codigo             text NOT NULL,

  -- A ausencia de justificacao e um VALOR, nao um NULL.
  justificacao_estado       text NOT NULL DEFAULT 'sem_justificacao',
  justificada               boolean GENERATED ALWAYS AS
                              (justificacao_estado = 'justificada') STORED,

  -- Decisoes de RH, nao derivadas do motivo.
  remunerada                boolean NOT NULL DEFAULT false,
  desconta_saldo            boolean NOT NULL DEFAULT false,

  justificacao_decidida_por uuid,
  justificacao_decidida_em  timestamptz,
  justificacao_motivo       text,

  -- A ligacao a ausencia aprovada que cobre o dia. A FK COMPOSTA e declarada em
  -- 20261121230000, que depende da ronda 3.
  ausencia_dia_id           uuid,

  corrige_falta_id          uuid,
  correccao_motivo          text,

  estado                    text NOT NULL DEFAULT 'activa',
  anulado_em                timestamptz,
  anulado_por_anew_user_id  uuid,
  anulacao_motivo           text,

  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  created_by                uuid,
  updated_by                uuid,
  -- SEM deleted_at: anular e um estado com autor e motivo, e nao ha caminho de
  -- apagamento porque o registo tem de durar cinco anos.

  CONSTRAINT pessoas_faltas_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_faltas_id_org_key UNIQUE (id, organization_id),
  CONSTRAINT pessoas_faltas_id_pessoa_org_key UNIQUE (id, pessoa_id, organization_id),

  CONSTRAINT pessoas_faltas_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id) ON DELETE CASCADE,

  CONSTRAINT pessoas_faltas_planeado_fkey
    FOREIGN KEY (planeado_id, pessoa_id, organization_id)
    REFERENCES public.pessoas_horario_planeado (id, pessoa_id, organization_id)
    ON DELETE SET NULL (planeado_id),

  CONSTRAINT pessoas_faltas_vinculo_fkey
    FOREIGN KEY (vinculo_id, pessoa_id, organization_id)
    REFERENCES public.pessoas_vinculos (id, pessoa_id, organization_id)
    ON DELETE SET NULL (vinculo_id),

  CONSTRAINT pessoas_faltas_local_fkey
    FOREIGN KEY (local_id, organization_id)
    REFERENCES public.hr_locais_trabalho (id, organization_id) ON DELETE NO ACTION,

  CONSTRAINT pessoas_faltas_corrige_fkey
    FOREIGN KEY (corrige_falta_id, pessoa_id, organization_id)
    REFERENCES public.pessoas_faltas (id, pessoa_id, organization_id) ON DELETE NO ACTION,

  CONSTRAINT pessoas_faltas_justificacao_decidida_por_fkey
    FOREIGN KEY (justificacao_decidida_por) REFERENCES public.anew_users (id) ON DELETE NO ACTION,
  CONSTRAINT pessoas_faltas_anulado_por_fkey
    FOREIGN KEY (anulado_por_anew_user_id) REFERENCES public.anew_users (id) ON DELETE NO ACTION,
  CONSTRAINT pessoas_faltas_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_faltas_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  -- A mesma regra da meia-noite do planeado e do realizado: duas linhas, em
  -- duas datas.
  CONSTRAINT pessoas_faltas_fim_depois_inicio
    CHECK (hora_fim > hora_inicio),

  CONSTRAINT pessoas_faltas_motivo_codigo_valido
    CHECK (motivo_codigo IN ('doenca','assuntos_pessoais','atraso','saida_antecipada',
                             'ausencia_nao_comunicada','greve','formacao','luto','outro')),

  CONSTRAINT pessoas_faltas_justificacao_estado_valido
    CHECK (justificacao_estado IN ('sem_justificacao','pendente_documento','justificada','recusada')),

  -- Recusar uma justificacao sem dizer porque e o que gera a disputa.
  CONSTRAINT pessoas_faltas_recusa_com_motivo
    CHECK (justificacao_estado <> 'recusada'
           OR (justificacao_motivo IS NOT NULL AND btrim(justificacao_motivo) <> '')),

  -- Uma decisao de justificacao sem autor e sem data nao e uma decisao.
  CONSTRAINT pessoas_faltas_decisao_coerente
    CHECK (justificacao_estado NOT IN ('justificada','recusada')
           OR (justificacao_decidida_por IS NOT NULL AND justificacao_decidida_em IS NOT NULL)),

  CONSTRAINT pessoas_faltas_estado_valido
    CHECK (estado IN ('activa','corrigida','anulada')),

  CONSTRAINT pessoas_faltas_correccao_com_motivo
    CHECK (corrige_falta_id IS NULL
           OR (correccao_motivo IS NOT NULL AND btrim(correccao_motivo) <> '')),

  CONSTRAINT pessoas_faltas_anulacao_coerente
    CHECK (
      (anulado_em IS NULL AND anulado_por_anew_user_id IS NULL AND anulacao_motivo IS NULL)
      OR (anulado_em IS NOT NULL AND anulado_por_anew_user_id IS NOT NULL
          AND anulacao_motivo IS NOT NULL AND btrim(anulacao_motivo) <> '')
    ),

  CONSTRAINT pessoas_faltas_estado_anulada_coerente
    CHECK ((estado = 'anulada') = (anulado_em IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_pessoas_faltas_pessoa_data
  ON public.pessoas_faltas (pessoa_id, data) WHERE estado = 'activa';

CREATE INDEX IF NOT EXISTS idx_pessoas_faltas_org_data
  ON public.pessoas_faltas (organization_id, data) WHERE estado = 'activa';

-- A fila de trabalho de quem gere assiduidade: as faltas por justificar.
CREATE INDEX IF NOT EXISTS idx_pessoas_faltas_por_justificar
  ON public.pessoas_faltas (organization_id, data)
  WHERE justificacao_estado IN ('sem_justificacao','pendente_documento') AND estado = 'activa';

CREATE INDEX IF NOT EXISTS idx_pessoas_faltas_planeado
  ON public.pessoas_faltas (planeado_id) WHERE planeado_id IS NOT NULL;

-- A cadeia linear, como nas picagens e no realizado.
CREATE UNIQUE INDEX IF NOT EXISTS uq_falta_um_corrector_vivo
  ON public.pessoas_faltas (corrige_falta_id)
  WHERE corrige_falta_id IS NOT NULL AND estado <> 'anulada';

COMMENT ON TABLE public.pessoas_faltas IS
'Uma linha = um PERIODO em falta, com hora_inicio e hora_fim NOT NULL. Nunca um booleano de dia: horario das 9 as 18 e faltou so a manha da uma linha 09:00-13:00, 240 minutos. Uma falta do dia inteiro e a MESMA coisa com 09:00-18:00 -- nao ha caminho especial para o dia completo, porque foi a inferencia que se excluiu.

A FALTA E MARCADA, NAO DETECTADA. A vista v_hr_assiduidade_desvios propoe os periodos descobertos entre planeado e realizado, com as horas ja calculadas para o formulario abrir preenchido, e nada escreve aqui sem uma decisao humana com hr.assiduidade.faltas.edit: um desvio pode ser uma picagem esquecida, e transformar picagem esquecida em falta injustificada e a coisa que mais rapido faz perder a confianca no modulo.

SEM deleted_at: anular e um estado com autor e motivo, e corrigir e uma linha nova. O registo de tempo de trabalho tem de ficar disponivel cinco anos.';

COMMENT ON COLUMN public.pessoas_faltas.justificacao_estado IS
'A AUSENCIA de justificacao e um VALOR, nao um NULL: sem_justificacao (marcou-se e nao ha papel), pendente_documento (a pessoa disse que traz o atestado), justificada, recusada (o papel veio e nao serve, com motivo obrigatorio). Um NULL ali significaria "nao sabemos se sabemos", e e exactamente a ambiguidade que da disputas laborais.';

COMMENT ON COLUMN public.pessoas_faltas.remunerada IS
'Decisao de RH, NAO derivada do motivo: a mesma doenca pode ser remunerada num contrato e nao noutro. Derivar isto do motivo_codigo seria escrever regra de convencao colectiva na base.';

COMMENT ON COLUMN public.pessoas_faltas.ausencia_dia_id IS
'O dia de ausencia aprovada que passou a cobrir esta falta -- o caso do atestado que chega na quinta-feira. A FK COMPOSTA e declarada em 20261121230000, que depende da ronda 3 existir.';

-- ---- falta x falta ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_faltas_sem_sobreposicao()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_conflito record;
BEGIN
  IF NEW.estado IN ('corrigida','anulada') THEN
    RETURN NEW;
  END IF;

  SELECT f.id, f.hora_inicio, f.hora_fim
    INTO v_conflito
    FROM public.pessoas_faltas f
   WHERE f.pessoa_id = NEW.pessoa_id
     AND f.data = NEW.data
     AND f.id <> NEW.id
     AND f.estado = 'activa'
     -- Comparacao SEMI-ABERTA: 09:00-14:00 e 14:00-19:00 e contiguidade, nao
     -- cruzamento. Ver o COMMENT.
     AND NEW.hora_inicio < f.hora_fim
     AND f.hora_inicio < NEW.hora_fim
   LIMIT 1;

  IF v_conflito.id IS NOT NULL THEN
    RAISE EXCEPTION
      'falta_sobreposta: o periodo % a % de % cruza-se com a falta % (% a %) da mesma pessoa no mesmo dia. Faltar duas vezes a mesma hora e contar o mesmo prejuizo duas vezes -- corrigir uma das faltas, ou anular a errada.',
      NEW.hora_inicio, NEW.hora_fim, NEW.data,
      v_conflito.id, v_conflito.hora_inicio, v_conflito.hora_fim
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_faltas_sem_sobreposicao() IS
'Impede duas faltas activas da mesma pessoa a sobreporem-se no mesmo dia. Faltar duas vezes a mesma hora e contar o mesmo prejuizo duas vezes. Linhas corrigidas e anuladas estao isentas.

A comparacao e SEMI-ABERTA (< e nao <=) DE PROPOSITO: 09:00-14:00 e 14:00-19:00 e CONTIGUIDADE, nao cruzamento. Nao endurecer o operador -- partiria o caso real de quem trabalha em dois locais no mesmo dia, com mudanca de local no mesmo minuto.

SECURITY DEFINER: sob RLS de invocador nao veria as linhas existentes e aprovaria sempre.

JANELA DE CORRIDA ASSUMIDA, a mesma da ronda 2: duas transaccoes concorrentes podem passar as duas. Sem btree_gist nao ha EXCLUDE, e trancar a linha da pessoa custa mais do que o defeito.';

DROP TRIGGER IF EXISTS trg_pessoas_faltas_sem_sobreposicao ON public.pessoas_faltas;
CREATE TRIGGER trg_pessoas_faltas_sem_sobreposicao
  BEFORE INSERT OR UPDATE ON public.pessoas_faltas
  FOR EACH ROW EXECUTE FUNCTION public.hr_faltas_sem_sobreposicao();

-- ---- falta x realizado, nos dois sentidos ----------------------------------
CREATE OR REPLACE FUNCTION public.hr_falta_nao_cruza_realizado()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_pessoa    uuid;
  v_data      date;
  v_ini       time;
  v_fim       time;
  v_conflito  record;
BEGIN
  IF TG_TABLE_NAME = 'pessoas_faltas' THEN
    IF NEW.estado <> 'activa' THEN
      RETURN NEW;
    END IF;

    v_pessoa := NEW.pessoa_id; v_data := NEW.data;
    v_ini := NEW.hora_inicio;  v_fim := NEW.hora_fim;

    SELECT h.id, h.hora_inicio, h.hora_fim
      INTO v_conflito
      FROM public.pessoas_horario_realizado h
     WHERE h.pessoa_id = v_pessoa
       AND h.data = v_data
       AND h.deleted_at IS NULL
       AND h.estado <> 'rejeitado'
       AND v_ini < h.hora_fim AND h.hora_inicio < v_fim
     LIMIT 1;

    IF v_conflito.id IS NOT NULL THEN
      RAISE EXCEPTION
        'falta_cruza_realizado: o periodo em falta % a % de % cruza-se com o intervalo trabalhado % (% a %). Nao se esta em falta e a trabalhar a mesma hora -- corrigir a falta, ou rejeitar o registo de horas errado (rpc_hr_realizado_corrigir).',
        v_ini, v_fim, v_data, v_conflito.id, v_conflito.hora_inicio, v_conflito.hora_fim
        USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
  END IF;

  -- pessoas_horario_realizado: o sentido inverso.
  IF NEW.deleted_at IS NOT NULL OR NEW.estado = 'rejeitado' THEN
    RETURN NEW;
  END IF;

  SELECT f.id, f.hora_inicio, f.hora_fim
    INTO v_conflito
    FROM public.pessoas_faltas f
   WHERE f.pessoa_id = NEW.pessoa_id
     AND f.data = NEW.data
     AND f.estado = 'activa'
     AND NEW.hora_inicio < f.hora_fim AND f.hora_inicio < NEW.hora_fim
   LIMIT 1;

  IF v_conflito.id IS NOT NULL THEN
    RAISE EXCEPTION
      'realizado_cruza_falta: o intervalo trabalhado % a % de % cruza-se com a falta % (% a %) da mesma pessoa. A picagem esquecida apareceu depois de a falta ter sido marcada: corrigir ou anular a falta (rpc_hr_falta_corrigir / rpc_hr_falta_anular) antes de registar estas horas.',
      NEW.hora_inicio, NEW.hora_fim, NEW.data,
      v_conflito.id, v_conflito.hora_inicio, v_conflito.hora_fim
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_falta_nao_cruza_realizado() IS
'Impede que uma pessoa esteja em falta e a trabalhar a mesma hora. Corre nos DOIS SENTIDOS -- trigger em pessoas_faltas e trigger em pessoas_horario_realizado -- porque a ordem de chegada nao e previsivel: as vezes marca-se a falta e so depois aparece a picagem esquecida.

O caminho de saida e sempre corrigir (a falta ou o registo de horas), nunca relaxar a regra.

Comparacao SEMI-ABERTA, pela mesma razao de hr_faltas_sem_sobreposicao. SECURITY DEFINER pela mesma razao de sempre neste modulo.';

DROP TRIGGER IF EXISTS trg_pessoas_faltas_nao_cruza_realizado ON public.pessoas_faltas;
CREATE TRIGGER trg_pessoas_faltas_nao_cruza_realizado
  BEFORE INSERT OR UPDATE ON public.pessoas_faltas
  FOR EACH ROW EXECUTE FUNCTION public.hr_falta_nao_cruza_realizado();

DROP TRIGGER IF EXISTS trg_pessoas_horario_realizado_nao_cruza_falta ON public.pessoas_horario_realizado;
CREATE TRIGGER trg_pessoas_horario_realizado_nao_cruza_falta
  BEFORE INSERT OR UPDATE ON public.pessoas_horario_realizado
  FOR EACH ROW EXECUTE FUNCTION public.hr_falta_nao_cruza_realizado();

-- ---- Triggers de padrao ----------------------------------------------------
DROP TRIGGER IF EXISTS trg_pessoas_faltas_updated_at ON public.pessoas_faltas;
CREATE TRIGGER trg_pessoas_faltas_updated_at
  BEFORE UPDATE ON public.pessoas_faltas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_pessoas_faltas_ancora ON public.pessoas_faltas;
CREATE TRIGGER trg_pessoas_faltas_ancora
  BEFORE UPDATE ON public.pessoas_faltas
  FOR EACH ROW EXECUTE FUNCTION public.hr_satelite_ancora_imutavel();

-- ---- Grants: SELECT e mais nada -------------------------------------------
REVOKE ALL ON TABLE public.pessoas_faltas FROM anon;
REVOKE ALL ON TABLE public.pessoas_faltas FROM authenticated;
GRANT SELECT ON TABLE public.pessoas_faltas TO authenticated;
GRANT ALL ON TABLE public.pessoas_faltas TO service_role;

-- ---- RLS -------------------------------------------------------------------
ALTER TABLE public.pessoas_faltas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pessoas_faltas_select ON public.pessoas_faltas;
CREATE POLICY pessoas_faltas_select ON public.pessoas_faltas
  FOR SELECT TO authenticated
  USING (
    (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.assiduidade.faltas.view', organization_id))
    OR (
      (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.assiduidade.view.own', organization_id))
      AND pessoa_id = (SELECT public.hr_pessoa_do_utilizador((SELECT auth.uid()), organization_id))
    )
    OR (
      (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.assiduidade.equipa.view', organization_id))
      AND (SELECT public.hr_ausencias_pessoa_na_minha_cadeia((SELECT auth.uid()), pessoa_id, organization_id))
    )
  );

DROP POLICY IF EXISTS pessoas_faltas_block_insert ON public.pessoas_faltas;
CREATE POLICY pessoas_faltas_block_insert ON public.pessoas_faltas
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS pessoas_faltas_block_update ON public.pessoas_faltas;
CREATE POLICY pessoas_faltas_block_update ON public.pessoas_faltas
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS pessoas_faltas_block_delete ON public.pessoas_faltas;
CREATE POLICY pessoas_faltas_block_delete ON public.pessoas_faltas
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON POLICY pessoas_faltas_select ON public.pessoas_faltas IS
'Tres ramos: hr.assiduidade.faltas.view para a organizacao; a propria pessoa por hr.assiduidade.view.own; a chefia pela cadeia com hr.assiduidade.equipa.view. Que o trabalhador veja as faltas que lhe foram marcadas e deliberado -- e a base de poder contesta-las. A JUSTIFICACAO nao se le aqui: vive noutra tabela, com permissao propria.';

COMMENT ON POLICY pessoas_faltas_block_insert ON public.pessoas_faltas IS
'Escrita fechada. Marcar uma falta corre os dois triggers de coerencia (falta x falta e falta x realizado) e, a partir de 20261121230000, a guarda contra ausencias aprovadas; corrigir insere a nova e marca a antiga na mesma transaccao. Nada disso cabe num WITH CHECK.';

-- ==============================================================================
-- As RPCs
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_falta_marcar(
  _organization_id uuid,
  _pessoa_id uuid,
  _data date,
  _hora_inicio time,
  _hora_fim time,
  _motivo_codigo text,
  _planeado_id uuid DEFAULT NULL,
  _remunerada boolean DEFAULT false,
  _desconta_saldo boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_anew uuid;
  v_id   uuid;
  v_pl   uuid := _planeado_id;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'falta_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.faltas.edit', _organization_id) THEN
    RAISE EXCEPTION
      'falta_sem_permissao: marcar uma falta exige hr.assiduidade.faltas.edit nesta organizacao.'
      USING ERRCODE = '42501';
  END IF;

  IF _hora_fim <= _hora_inicio THEN
    RAISE EXCEPTION
      'falta_horas_invalidas: a hora de fim tem de ser posterior a de inicio. Uma falta que atravesse a meia-noite sao DUAS linhas, em duas datas.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pessoas p
     WHERE p.id = _pessoa_id AND p.organization_id = _organization_id AND p.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'falta_pessoa_invalida: a pessoa nao existe nesta organizacao.' USING ERRCODE = '23503';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;

  -- Ancorar ao intervalo planeado que contem o periodo, quando nao foi dado.
  IF v_pl IS NULL THEN
    SELECT hp.id INTO v_pl
      FROM public.pessoas_horario_planeado hp
     WHERE hp.pessoa_id = _pessoa_id AND hp.organization_id = _organization_id
       AND hp.deleted_at IS NULL
       AND _hora_inicio < hp.hora_fim AND hp.hora_inicio < _hora_fim
     ORDER BY hp.hora_inicio
     LIMIT 1;
  END IF;

  INSERT INTO public.pessoas_faltas (
    pessoa_id, organization_id, data, planeado_id,
    hora_inicio, hora_fim, motivo_codigo,
    remunerada, desconta_saldo, created_by
  ) VALUES (
    _pessoa_id, _organization_id, _data, v_pl,
    _hora_inicio, _hora_fim, _motivo_codigo,
    coalesce(_remunerada, false), coalesce(_desconta_saldo, false), v_anew
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_falta_marcar(uuid, uuid, date, time, time, text, uuid, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_falta_marcar(uuid, uuid, date, time, time, text, uuid, boolean, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_falta_marcar(uuid, uuid, date, time, time, text, uuid, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_falta_marcar(uuid, uuid, date, time, time, text, uuid, boolean, boolean) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_falta_marcar(uuid, uuid, date, time, time, text, uuid, boolean, boolean) IS
'Marca uma falta, com o periodo explicito. Exige hr.assiduidade.faltas.edit. A falta nasce em justificacao_estado=sem_justificacao, que e um VALOR e nao um NULL.

Nao ha caminho de "dia todo": quem marca passa as horas, e a UI copia-as do planeado quando o utilizador escolhe o dia inteiro. Foi a inferencia que se excluiu.';

CREATE OR REPLACE FUNCTION public.rpc_hr_falta_corrigir(
  _falta_id uuid,
  _hora_inicio time,
  _hora_fim time,
  _motivo_codigo text,
  _motivo text
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_anew uuid;
  v_old  public.pessoas_faltas;
  v_new  uuid;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'falta_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  IF _motivo IS NULL OR btrim(_motivo) = '' THEN
    RAISE EXCEPTION 'falta_correccao_sem_motivo: corrigir uma falta exige motivo escrito.' USING ERRCODE = '23514';
  END IF;

  SELECT f.* INTO v_old FROM public.pessoas_faltas f WHERE f.id = _falta_id;
  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'falta_inexistente: a falta % nao existe.', _falta_id USING ERRCODE = '23503';
  END IF;

  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.corrigir', v_old.organization_id) THEN
    RAISE EXCEPTION
      'falta_sem_permissao: corrigir uma falta ja registada exige hr.assiduidade.corrigir. Marcar faltas (hr.assiduidade.faltas.edit) e outra autoridade.'
      USING ERRCODE = '42501';
  END IF;

  IF v_old.estado <> 'activa' THEN
    RAISE EXCEPTION
      'falta_nao_corrigivel: a falta % esta em "%" e so se corrige uma falta activa.', _falta_id, v_old.estado
      USING ERRCODE = '23514';
  END IF;

  IF _hora_fim <= _hora_inicio THEN
    RAISE EXCEPTION 'falta_horas_invalidas: a hora de fim tem de ser posterior a de inicio.' USING ERRCODE = '23514';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;

  -- A antiga sai de circulacao PRIMEIRO: senao a nova cruza-se com ela e o
  -- trigger de sobreposicao recusa-a.
  UPDATE public.pessoas_faltas SET estado = 'corrigida', updated_by = v_anew WHERE id = _falta_id;

  INSERT INTO public.pessoas_faltas (
    pessoa_id, organization_id, data, planeado_id, vinculo_id, local_id,
    hora_inicio, hora_fim, motivo_codigo,
    remunerada, desconta_saldo,
    corrige_falta_id, correccao_motivo, created_by
  ) VALUES (
    v_old.pessoa_id, v_old.organization_id, v_old.data, v_old.planeado_id, v_old.vinculo_id, v_old.local_id,
    _hora_inicio, _hora_fim, coalesce(_motivo_codigo, v_old.motivo_codigo),
    v_old.remunerada, v_old.desconta_saldo,
    _falta_id, btrim(_motivo), v_anew
  )
  RETURNING id INTO v_new;

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_falta_corrigir(uuid, time, time, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_falta_corrigir(uuid, time, time, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_falta_corrigir(uuid, time, time, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_falta_corrigir(uuid, time, time, text, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_falta_corrigir(uuid, time, time, text, text) IS
'Corrige uma falta: marca a antiga como corrigida e insere a nova com corrige_falta_id, na MESMA transaccao. Exige hr.assiduidade.corrigir e motivo escrito.

A ordem importa: a antiga sai de circulacao PRIMEIRO, senao a nova cruza-se com ela e o trigger de nao-sobreposicao recusa-a.';

CREATE OR REPLACE FUNCTION public.rpc_hr_falta_anular(
  _falta_id uuid,
  _motivo text
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_anew uuid;
  v_old  public.pessoas_faltas;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'falta_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  IF _motivo IS NULL OR btrim(_motivo) = '' THEN
    RAISE EXCEPTION 'falta_anulacao_sem_motivo: anular uma falta exige motivo escrito.' USING ERRCODE = '23514';
  END IF;

  SELECT f.* INTO v_old FROM public.pessoas_faltas f WHERE f.id = _falta_id;
  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'falta_inexistente: a falta % nao existe.', _falta_id USING ERRCODE = '23503';
  END IF;

  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.corrigir', v_old.organization_id) THEN
    RAISE EXCEPTION
      'falta_sem_permissao: anular uma falta exige hr.assiduidade.corrigir nesta organizacao.'
      USING ERRCODE = '42501';
  END IF;

  IF v_old.estado = 'anulada' THEN
    RAISE EXCEPTION 'falta_ja_anulada: a falta % ja foi anulada em %.', _falta_id, v_old.anulado_em
      USING ERRCODE = '23514';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;

  UPDATE public.pessoas_faltas
     SET estado = 'anulada',
         anulado_em = now(),
         anulado_por_anew_user_id = v_anew,
         anulacao_motivo = btrim(_motivo),
         updated_by = v_anew
   WHERE id = _falta_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_falta_anular(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_falta_anular(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_falta_anular(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_falta_anular(uuid, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_falta_anular(uuid, text) IS
'Anula uma falta, com autor e motivo. Nao apaga: a linha fica legivel cinco anos, e e o rasto de que houve uma falta marcada e de que foi desfeita.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_rls    boolean;
  v_pol    integer;
  v_restr  integer;
  v_qual   text;
  v_gerada text;
BEGIN
  IF to_regclass('public.pessoas_faltas') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_faltas nao ficou criada.';
  END IF;

  SELECT c.relrowsecurity INTO v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'pessoas_faltas';
  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'A tabela ficou sem RLS activo.';
  END IF;

  SELECT count(*) INTO v_pol FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_faltas';
  IF v_pol <> 4 THEN
    RAISE EXCEPTION 'Esperavam-se 4 politicas, encontraram-se %.', v_pol;
  END IF;

  SELECT count(*) INTO v_restr FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_faltas' AND permissive = 'RESTRICTIVE';
  IF v_restr <> 3 THEN
    RAISE EXCEPTION 'Esperavam-se 3 politicas RESTRICTIVE de escrita, encontraram-se %.', v_restr;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name = 'pessoas_faltas'
       AND grantee = 'authenticated' AND privilege_type IN ('INSERT','UPDATE','DELETE')
  ) THEN
    RAISE EXCEPTION 'authenticated tem GRANT de escrita em pessoas_faltas. Esta tabela e SELECT e mais nada.';
  END IF;

  SELECT coalesce(qual,'') INTO v_qual FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_faltas'
     AND policyname = 'pessoas_faltas_select';

  IF v_qual NOT LIKE '%hr_pessoa_do_utilizador%' THEN
    RAISE EXCEPTION 'A politica de SELECT perdeu o ramo de ficha-propria: o trabalhador nao veria as faltas que lhe foram marcadas.';
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

  -- minutos e justificada tem de ser GERADAS.
  SELECT is_generated INTO v_gerada FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'pessoas_faltas' AND column_name = 'minutos';
  IF v_gerada IS DISTINCT FROM 'ALWAYS' THEN
    RAISE EXCEPTION
      'pessoas_faltas.minutos nao e GENERATED ALWAYS (e "%"). Escrivel, seria uma segunda fonte de verdade sobre a duracao da falta.', coalesce(v_gerada,'ausente');
  END IF;

  SELECT is_generated INTO v_gerada FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'pessoas_faltas' AND column_name = 'justificada';
  IF v_gerada IS DISTINCT FROM 'ALWAYS' THEN
    RAISE EXCEPTION
      'pessoas_faltas.justificada nao e GENERATED ALWAYS. Escrivel, podia dizer justificada com justificacao_estado=recusada.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_faltas' AND column_name = 'deleted_at'
  ) THEN
    RAISE EXCEPTION
      'pessoas_faltas ganhou deleted_at. Anular e um estado com autor e motivo; o registo tem de durar cinco anos.';
  END IF;

  -- Os TRES triggers de coerencia, incluindo o do sentido inverso.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid = to_regclass('public.pessoas_faltas')
      AND tgname = 'trg_pessoas_faltas_sem_sobreposicao' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'O trigger falta x falta nao ficou criado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid = to_regclass('public.pessoas_faltas')
      AND tgname = 'trg_pessoas_faltas_nao_cruza_realizado' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'O trigger falta x realizado nao ficou criado em pessoas_faltas.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid = to_regclass('public.pessoas_horario_realizado')
      AND tgname = 'trg_pessoas_horario_realizado_nao_cruza_falta' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION
      'O trigger do SENTIDO INVERSO nao ficou criado em pessoas_horario_realizado. Sem ele, uma picagem que aparece depois da falta passava sem ninguem notar.';
  END IF;

  RAISE NOTICE 'Conferido: pessoas_faltas com periodo explicito, tres triggers de coerencia e escrita fechada.';
END;
$conferir$;
