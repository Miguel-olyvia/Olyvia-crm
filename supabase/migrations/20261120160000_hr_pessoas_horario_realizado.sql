-- ==============================================================================
-- pessoas_horario_realizado: o tempo que foi EFECTIVAMENTE trabalhado, por
-- intervalo, por data, por local.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- 20261120150000 guarda o que esta PREVISTO. Falta onde guardar o que
-- ACONTECEU -- e sao coisas diferentes: quem devia entrar as 9 e entrou as 9h20
-- tem um planeado e um realizado que nao coincidem, e e essa diferenca que
-- interessa a quem paga e a quem e pago.
--
-- Esta tabela existe AGORA, antes das picagens, exactamente para que as
-- picagens tenham um destino definido quando forem construidas. A alternativa
-- -- construir as picagens e decidir na altura onde escrevem -- e como se
-- inventa uma segunda tabela de horas a viver ao lado da primeira.
--
--
-- -- PORQUE E UMA TABELA SEPARADA DO PLANEADO ---------------------------------
--
-- A justificacao completa esta no cabecalho de 20261120150000. Em resumo:
-- ciclo de vida diferente (o planeado edita-se ate ficar certo, o realizado
-- nasce uma vez e alterar-se e auditavel), permissao diferente (quem planeia
-- turnos nao e quem confirma horas, e confirmar horas sustenta um pagamento),
-- e uma flag "e_planeado" numa tabela unica envenenaria todas as queries com
-- um filtro que alguem ia esquecer.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Uma linha = um intervalo efectivamente trabalhado, numa data, num local.
-- Aqui NAO ha dia_semana nem regra recorrente: o realizado e sempre uma data
-- concreta. Um dia com trabalho em dois sitios sao duas linhas, cada uma com o
-- seu local_id -- o mesmo desenho do planeado, e pela mesma razao.
--
-- minutos e uma coluna GERADA a partir das horas. Nao e um campo que alguem
-- preenche: um total de minutos escrito a mao ao lado das horas de que devia
-- resultar divergiria na primeira correccao, e passaria a ser a fonte de
-- verdade errada de que se pagam salarios.
--
-- planeado_id liga este intervalo a linha de planeado que ele cumpre, quando
-- ha. Nulo e normal: horas extraordinarias, um turno trocado a ultima hora, ou
-- simplesmente uma pessoa sem horario planeado registado.
--
-- origem: manual / picagem / importacao. 'picagem' EXISTE NO DOMINIO e nada a
-- escreve -- as picagens nao se constroem nesta ronda. O valor esta la para
-- que a ingestao futura nao precise de uma migracao de dominio.
--
-- estado: registado / validado / rejeitado, com dois CHECKs a manter a
-- coerencia -- validado exige quem e quando, rejeitado exige motivo. Um estado
-- de validacao sem autor e sem data e uma aprovacao sem responsavel.
--
--
-- -- A PERMISSAO DE VALIDAR NAO E UMA GUARDA, E TEM DE FICAR ESCRITO ----------
--
-- hr.pessoas.horario_realizado.validar existe no catalogo (20261120120000) e
-- NAO E VERIFICADA POR NADA. Nao ha politica que a consulte e nao ha RPC de
-- validacao -- ela nao se constroi nesta ronda.
--
-- Consequencia pratica, e nao esta escondida: passar uma linha a
-- estado='validado' exige hr.pessoas.horario_realizado.EDIT na RLS, e mais
-- nada. Quem tem .edit valida. Quem tem .validar e nao tem .edit nao valida
-- nada.
--
-- Isto e uma lacuna assumida, nao um esquecimento. Poe-se a permissao no
-- dominio agora para nao haver uma segunda migracao de catalogo depois, e
-- quem construir a RPC de validacao tem de ligar as duas coisas -- passando a
-- verificacao de estado para a RPC e fechando a escrita directa da coluna
-- estado. Ate la, nao confundir a permissao com um controlo activo.
--
--
-- -- NAO SE ESTA EM DOIS SITIOS AO MESMO TEMPO --------------------------------
--
-- O trigger de nao-sobreposicao e mais estrito do que o do planeado num ponto:
-- dois intervalos realizados vivos da mesma pessoa na mesma data nao se podem
-- sobrepor MESMO EM LOCAIS DIFERENTES. Dois locais no mesmo dia sao o
-- requisito; dois locais a mesma hora sao um erro de registo ou uma tentativa
-- de contar as mesmas horas duas vezes.
--
-- Linhas com estado='rejeitado' estao ISENTAS da verificacao, de proposito:
-- uma linha rejeitada e um registo errado que se guarda para haver rasto, e ela
-- nao deve impedir o registo da versao correcta a mesma hora.
--
-- SECURITY DEFINER com SET search_path, pelo mesmo motivo de sempre: sob RLS
-- de invocador, quem tem edit sem view nao veria as linhas existentes.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - PICAGENS: nada. Nem relogio de ponto, nem dispositivos, nem terminais, nem
--   ingestao automatica, nem app de marcacao. Existe o valor 'picagem' na
--   coluna origem, e e so isso.
-- - RPC de validacao: nao. Ver acima -- e a lacuna assumida desta ronda.
-- - Aritmetica de horas extraordinarias, bancos de horas, tolerancias de
--   entrada, arredondamentos: nada. Esta tabela guarda intervalos; nao os
--   interpreta.
-- - Comparacao automatica entre planeado e realizado: nao ha vista nem funcao.
--   planeado_id e uma ligacao, nao um calculo.
-- - Ausencias, ferias e feriados: fora.
-- - Salarios: fora. Nada aqui gera pagamento.
-- - Nao se toca em nada do agendamento (schedule_*).
-- - Nao se instala extensao nenhuma.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP TABLE IF EXISTS public.pessoas_horario_realizado;
--   DROP FUNCTION IF EXISTS public.hr_horario_realizado_sem_sobreposicao();
-- Isto apaga registos de horas trabalhadas, que podem sustentar pagamentos.
-- Exportar antes.
--
--
-- Prerequisitos:
--   20261120010000  has_anew_permission_in_org
--   20261120030000  pessoas (unique pessoas_id_org_key)
--   20261120040000  hr_satelite_ancora_imutavel()
--   20261120060000  pessoas_vinculos (unique pessoas_vinculos_id_pessoa_org_key)
--   20261120090000  hr_pessoa_do_utilizador()
--   20261120120000  hr.pessoas.horario_realizado.view / .edit no catalogo
--   20261120130000  hr_locais_trabalho (unique hr_locais_trabalho_id_org_key)
--   20261120150000  pessoas_horario_planeado (unique
--                   pessoas_horario_planeado_id_pessoa_org_key) -- OBRIGATORIA:
--                   e o alvo da FK planeado_id
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas nao existe. Aplicar 20261120030000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_id_org_key' AND conrelid = to_regclass('public.pessoas')
  ) THEN
    RAISE EXCEPTION 'A unique pessoas_id_org_key nao existe; a FK composta desta tabela depende dela.';
  END IF;

  IF to_regclass('public.pessoas_horario_planeado') IS NULL THEN
    RAISE EXCEPTION
      'public.pessoas_horario_planeado nao existe. Aplicar 20261120150000 primeiro -- e o alvo da FK planeado_id.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_horario_planeado_id_pessoa_org_key'
       AND conrelid = to_regclass('public.pessoas_horario_planeado')
  ) THEN
    RAISE EXCEPTION
      'A unique pessoas_horario_planeado_id_pessoa_org_key nao existe; a FK COMPOSTA de planeado_id depende dela. Sem ela, um intervalo realizado poderia dizer que cumpre o planeado de OUTRA pessoa.';
  END IF;

  IF to_regclass('public.pessoas_vinculos') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_vinculos nao existe. Aplicar 20261120060000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_vinculos_id_pessoa_org_key'
       AND conrelid = to_regclass('public.pessoas_vinculos')
  ) THEN
    RAISE EXCEPTION 'A unique pessoas_vinculos_id_pessoa_org_key nao existe.';
  END IF;

  IF to_regclass('public.hr_locais_trabalho') IS NULL THEN
    RAISE EXCEPTION 'public.hr_locais_trabalho nao existe. Aplicar 20261120130000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'hr_locais_trabalho_id_org_key'
       AND conrelid = to_regclass('public.hr_locais_trabalho')
  ) THEN
    RAISE EXCEPTION 'A unique hr_locais_trabalho_id_org_key nao existe.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'has_anew_permission_in_org' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION 'public.has_anew_permission_in_org(uuid,text,uuid) nao existe. Aplicar 20261120010000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_pessoa_do_utilizador' AND p.pronargs = 2
  ) THEN
    RAISE EXCEPTION 'public.hr_pessoa_do_utilizador(uuid,uuid) nao existe. Aplicar 20261120090000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_satelite_ancora_imutavel'
  ) THEN
    RAISE EXCEPTION 'public.hr_satelite_ancora_imutavel() nao existe. Aplicar 20261120040000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.horario_realizado.view'
  ) THEN
    RAISE EXCEPTION
      'A permissao hr.pessoas.horario_realizado.view nao esta no catalogo. Aplicar 20261120120000 primeiro -- sem ela a tabela fica invisivel para todos, em silencio.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.horario_realizado.edit'
  ) THEN
    RAISE EXCEPTION 'A permissao hr.pessoas.horario_realizado.edit nao esta no catalogo. Aplicar 20261120120000 primeiro.';
  END IF;

  -- Colisao de nome.
  IF to_regclass('public.pessoas_horario_realizado') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = 'pessoas_horario_realizado_id_org_key'
         AND conrelid = to_regclass('public.pessoas_horario_realizado')
    ) THEN
      RAISE EXCEPTION
        'Ja existe public.pessoas_horario_realizado mas sem a constraint pessoas_horario_realizado_id_org_key. Nao e a tabela desta migracao -- colisao de nome. Investigar.';
    END IF;
    RAISE NOTICE 'public.pessoas_horario_realizado ja existe com a unique esperada; idempotente daqui para a frente.';
  END IF;
END;
$guardas$;

-- ---- A tabela --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pessoas_horario_realizado (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  pessoa_id        uuid NOT NULL,
  organization_id  uuid NOT NULL,
  vinculo_id       uuid,
  local_id         uuid,

  -- A linha de planeado que este intervalo cumpre, quando ha. Nulo e normal.
  planeado_id      uuid,

  -- Sem dia_semana: o realizado e sempre uma data concreta.
  data             date NOT NULL,
  hora_inicio      time NOT NULL,
  hora_fim         time NOT NULL,

  -- GERADA, e nao um campo a preencher: um total escrito a mao ao lado das
  -- horas de que devia resultar divergiria na primeira correccao e passaria a
  -- ser a fonte de verdade errada de que se pagam salarios.
  minutos          integer GENERATED ALWAYS AS
                     ((EXTRACT(epoch FROM (hora_fim - hora_inicio)) / 60)::integer) STORED,

  origem           text NOT NULL DEFAULT 'manual',
  estado           text NOT NULL DEFAULT 'registado',
  validado_por     uuid,
  validado_em      timestamptz,
  motivo_rejeicao  text,
  notas            text,

  deleted_at       timestamptz,
  deleted_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid,
  updated_by       uuid,

  CONSTRAINT pessoas_horario_realizado_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_horario_realizado_id_org_key UNIQUE (id, organization_id),

  CONSTRAINT pessoas_horario_realizado_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id) ON DELETE CASCADE,

  CONSTRAINT pessoas_horario_realizado_vinculo_fkey
    FOREIGN KEY (vinculo_id, pessoa_id, organization_id)
    REFERENCES public.pessoas_vinculos (id, pessoa_id, organization_id)
    ON DELETE SET NULL (vinculo_id),

  -- FK COMPOSTA: sem pessoa_id na chave, um intervalo realizado podia dizer
  -- que cumpre o planeado de OUTRA pessoa da mesma organizacao.
  CONSTRAINT pessoas_horario_realizado_planeado_fkey
    FOREIGN KEY (planeado_id, pessoa_id, organization_id)
    REFERENCES public.pessoas_horario_planeado (id, pessoa_id, organization_id)
    ON DELETE SET NULL (planeado_id),

  -- NO ACTION e nao SET NULL, pelo motivo de 20261120030000 linhas 194-203.
  CONSTRAINT pessoas_horario_realizado_local_fkey
    FOREIGN KEY (local_id, organization_id)
    REFERENCES public.hr_locais_trabalho (id, organization_id) ON DELETE NO ACTION,

  CONSTRAINT pessoas_horario_realizado_validado_por_fkey
    FOREIGN KEY (validado_por) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_horario_realizado_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_horario_realizado_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_horario_realizado_deleted_by_fkey
    FOREIGN KEY (deleted_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  -- Mesma regra da meia-noite do planeado: duas linhas, em dois dias.
  CONSTRAINT pessoas_horario_realizado_fim_depois_inicio
    CHECK (hora_fim > hora_inicio),

  CONSTRAINT pessoas_horario_realizado_origem_valida
    CHECK (origem IN ('manual','picagem','importacao')),
  CONSTRAINT pessoas_horario_realizado_estado_valido
    CHECK (estado IN ('registado','validado','rejeitado')),

  -- Uma aprovacao sem autor e sem data nao e uma aprovacao. E o inverso
  -- tambem: nao ha validado_por preenchido num estado que nao e validado.
  CONSTRAINT pessoas_horario_realizado_validacao_coerente
    CHECK ((estado = 'validado') = (validado_por IS NOT NULL AND validado_em IS NOT NULL)),

  CONSTRAINT pessoas_horario_realizado_rejeicao_com_motivo
    CHECK (estado <> 'rejeitado' OR motivo_rejeicao IS NOT NULL)
);

COMMENT ON TABLE public.pessoas_horario_realizado IS
'Tempo EFECTIVAMENTE trabalhado: uma linha = um intervalo, numa data, num local. Sem dia_semana e sem regras recorrentes -- o realizado e sempre uma data concreta. Um dia com trabalho em dois sitios sao duas linhas, cada uma com o seu local_id.

E ESTA a tabela onde as picagens vao escrever quando existirem. Elas NAO existem nesta ronda: o valor origem=picagem esta no dominio e nada o escreve.

Nao interpreta nada: nao calcula horas extraordinarias, nem banco de horas, nem tolerancias, nem arredondamentos, e nao compara automaticamente com o planeado. planeado_id e uma ligacao, nao um calculo.';

COMMENT ON COLUMN public.pessoas_horario_realizado.minutos IS
'GERADA a partir de hora_fim - hora_inicio. Nao se escreve: um total de minutos preenchido a mao divergiria das horas na primeira correccao e passaria a ser a fonte de verdade errada de que se pagam salarios.';

COMMENT ON COLUMN public.pessoas_horario_realizado.origem IS
'manual / picagem / importacao. ATENCAO: o valor picagem esta no dominio mas NADA o escreve hoje -- as picagens (relogio de ponto, dispositivos, ingestao) nao se constroem nesta ronda. O valor existe para que a ingestao futura nao precise de uma migracao de dominio.';

COMMENT ON COLUMN public.pessoas_horario_realizado.estado IS
'registado / validado / rejeitado. AVISO: passar a validado exige hr.pessoas.horario_realizado.EDIT na RLS, e mais nada. A permissao hr.pessoas.horario_realizado.validar existe no catalogo mas NAO E VERIFICADA POR NADA -- nao ha politica nem RPC que a consulte, porque a RPC de validacao nao se constroi nesta ronda. Lacuna assumida, nao esquecimento: quem construir a RPC tem de fechar a escrita directa desta coluna e passar a verificacao para la.';

COMMENT ON COLUMN public.pessoas_horario_realizado.planeado_id IS
'A linha de pessoas_horario_planeado que este intervalo cumpre, quando ha. Nulo e normal: horas extraordinarias, turno trocado a ultima hora, ou pessoa sem horario planeado registado. FK COMPOSTA com pessoa_id -- sem isso, um realizado podia dizer que cumpre o planeado de outra pessoa.';

COMMENT ON COLUMN public.pessoas_horario_realizado.motivo_rejeicao IS
'Obrigatorio quando estado=rejeitado, por CHECK. Uma rejeicao sem motivo nao diz a quem trabalhou o que corrigir.';

-- ---- Indices ---------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_pessoas_horario_realizado_pessoa_data
  ON public.pessoas_horario_realizado (pessoa_id, data DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pessoas_horario_realizado_org_data
  ON public.pessoas_horario_realizado (organization_id, data)
  WHERE deleted_at IS NULL;

-- Horas por local: e a pergunta que o requisito original torna possivel
-- ("quantas horas se fizeram naquela empresa este mes").
CREATE INDEX IF NOT EXISTS idx_pessoas_horario_realizado_local_data
  ON public.pessoas_horario_realizado (local_id, data)
  WHERE local_id IS NOT NULL;

-- A fila de espera de quem valida.
CREATE INDEX IF NOT EXISTS idx_pessoas_horario_realizado_por_validar
  ON public.pessoas_horario_realizado (organization_id, data)
  WHERE estado = 'registado' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pessoas_horario_realizado_planeado
  ON public.pessoas_horario_realizado (planeado_id)
  WHERE planeado_id IS NOT NULL;

-- ---- Nao-sobreposicao ------------------------------------------------------
-- Mais estrito do que no planeado: dois intervalos realizados da mesma pessoa
-- na mesma data nao se sobrepoem MESMO EM LOCAIS DIFERENTES. Dois locais no
-- mesmo dia sao o requisito; dois locais a mesma hora sao um erro de registo
-- ou uma tentativa de contar as mesmas horas duas vezes.
CREATE OR REPLACE FUNCTION public.hr_horario_realizado_sem_sobreposicao()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_conflito record;
BEGIN
  -- Uma linha apagada nao ocupa tempo nenhum.
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Uma linha rejeitada e um registo errado que se guarda para haver rasto:
  -- nao ocupa o tempo e nao impede o registo da versao correcta a mesma hora.
  IF NEW.estado = 'rejeitado' THEN
    RETURN NEW;
  END IF;

  SELECT h.id, h.hora_inicio, h.hora_fim, h.local_id
    INTO v_conflito
    FROM public.pessoas_horario_realizado h
   WHERE h.pessoa_id = NEW.pessoa_id
     AND h.deleted_at IS NULL
     AND h.estado <> 'rejeitado'
     AND h.id <> NEW.id
     AND h.data = NEW.data
     -- Comparacao explicita, e nao um range: nao existe tipo timerange no
     -- PostgreSQL, e para intervalos semi-abertos isto e equivalente.
     AND NEW.hora_inicio < h.hora_fim
     AND h.hora_inicio < NEW.hora_fim
   LIMIT 1;

  IF v_conflito.id IS NOT NULL THEN
    RAISE EXCEPTION
      'realizado_sobreposto: o intervalo % a % de % cruza-se com o intervalo % (% a %) da mesma pessoa no mesmo dia. Trabalhar em dois locais no mesmo dia e permitido; a mesma hora nao -- ninguem esta em dois sitios ao mesmo tempo. Corrigir as horas, ou rejeitar o registo errado (estado=rejeitado, que fica isento desta verificacao).',
      NEW.hora_inicio, NEW.hora_fim, NEW.data,
      v_conflito.id, v_conflito.hora_inicio, v_conflito.hora_fim;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_horario_realizado_sem_sobreposicao() IS
'Impede dois intervalos realizados vivos da mesma pessoa a sobreporem-se na mesma data, MESMO em locais diferentes -- ninguem esta em dois sitios ao mesmo tempo, e contar as mesmas horas duas vezes seria pagar duas vezes. Linhas com estado=rejeitado estao isentas de proposito: uma linha rejeitada guarda-se para haver rasto e nao deve impedir a versao correcta. SECURITY DEFINER: sob RLS de invocador, quem tem edit sem view nao veria as linhas existentes e a verificacao seria vazia.';

DROP TRIGGER IF EXISTS trg_pessoas_horario_realizado_sem_sobreposicao ON public.pessoas_horario_realizado;
CREATE TRIGGER trg_pessoas_horario_realizado_sem_sobreposicao
  BEFORE INSERT OR UPDATE ON public.pessoas_horario_realizado
  FOR EACH ROW EXECUTE FUNCTION public.hr_horario_realizado_sem_sobreposicao();

-- ---- Triggers de padrao ----------------------------------------------------
DROP TRIGGER IF EXISTS trg_pessoas_horario_realizado_updated_at ON public.pessoas_horario_realizado;
CREATE TRIGGER trg_pessoas_horario_realizado_updated_at
  BEFORE UPDATE ON public.pessoas_horario_realizado
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_pessoas_horario_realizado_ancora ON public.pessoas_horario_realizado;
CREATE TRIGGER trg_pessoas_horario_realizado_ancora
  BEFORE UPDATE ON public.pessoas_horario_realizado
  FOR EACH ROW EXECUTE FUNCTION public.hr_satelite_ancora_imutavel();

-- ---- Grants ----------------------------------------------------------------
REVOKE ALL ON TABLE public.pessoas_horario_realizado FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pessoas_horario_realizado TO authenticated;
GRANT ALL ON TABLE public.pessoas_horario_realizado TO service_role;

-- ---- RLS -------------------------------------------------------------------
ALTER TABLE public.pessoas_horario_realizado ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pessoas_horario_realizado_select ON public.pessoas_horario_realizado;
CREATE POLICY pessoas_horario_realizado_select ON public.pessoas_horario_realizado
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.horario_realizado.view', organization_id))
      OR (
        (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.view.own', organization_id))
        AND pessoa_id = (SELECT public.hr_pessoa_do_utilizador((SELECT auth.uid()), organization_id))
      )
    )
  );

-- SEM ramo de ficha-propria: um trabalhador nao registra as suas proprias
-- horas por escrita directa. Quando as picagens existirem, elas escreverao por
-- RPC ou por service_role, nao por esta politica.
DROP POLICY IF EXISTS pessoas_horario_realizado_insert ON public.pessoas_horario_realizado;
CREATE POLICY pessoas_horario_realizado_insert ON public.pessoas_horario_realizado
  FOR INSERT TO authenticated
  WITH CHECK (
    deleted_at IS NULL
    AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.horario_realizado.edit', organization_id))
  );

DROP POLICY IF EXISTS pessoas_horario_realizado_update ON public.pessoas_horario_realizado;
CREATE POLICY pessoas_horario_realizado_update ON public.pessoas_horario_realizado
  FOR UPDATE TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.horario_realizado.edit', organization_id)))
  WITH CHECK ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.horario_realizado.edit', organization_id)));

DROP POLICY IF EXISTS pessoas_horario_realizado_block_delete ON public.pessoas_horario_realizado;
CREATE POLICY pessoas_horario_realizado_block_delete ON public.pessoas_horario_realizado
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON POLICY pessoas_horario_realizado_select ON public.pessoas_horario_realizado IS
'Ve as horas realizadas quem tem hr.pessoas.horario_realizado.view NAQUELA organizacao; e cada um ve as SUAS se tiver hr.pessoas.view.own e a conta estiver ligada a uma pessoa nessa organizacao. Que o trabalhador veja as horas que lhe foram registadas e deliberado -- e a base de poder contesta-las.';

COMMENT ON POLICY pessoas_horario_realizado_update ON public.pessoas_horario_realizado IS
'Exige hr.pessoas.horario_realizado.edit, com USING e WITH CHECK ambos escritos. ATENCAO: e ESTA politica que hoje autoriza passar uma linha a estado=validado. hr.pessoas.horario_realizado.validar existe no catalogo e NAO e verificada aqui nem em lado nenhum -- a RPC de validacao nao existe. Quem a construir tem de fechar a escrita directa da coluna estado.';

COMMENT ON POLICY pessoas_horario_realizado_block_delete ON public.pessoas_horario_realizado IS
'Nao se apagam horas trabalhadas: podem sustentar um pagamento. Marca-se deleted_at, ou rejeita-se (estado=rejeitado, que fica com o motivo).';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_rls       boolean;
  v_politicas integer;
  v_gerada    text;
BEGIN
  IF to_regclass('public.pessoas_horario_realizado') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_horario_realizado nao ficou criada.';
  END IF;

  SELECT c.relrowsecurity INTO v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'pessoas_horario_realizado';

  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'public.pessoas_horario_realizado ficou sem RLS activo.';
  END IF;

  SELECT count(*) INTO v_politicas FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_horario_realizado';

  IF v_politicas <> 4 THEN
    RAISE EXCEPTION
      'Esperavam-se 4 politicas em pessoas_horario_realizado, encontraram-se %.', v_politicas;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'pessoas_horario_realizado'
       AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) LIKE '%get_user_visible_org_ids%'
  ) THEN
    RAISE EXCEPTION
      'Alguma politica de pessoas_horario_realizado usa get_user_visible_org_ids. Em RH isso nunca acontece.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'pessoas_horario_realizado'
       AND policyname = 'pessoas_horario_realizado_update'
       AND (qual IS NULL OR with_check IS NULL)
  ) THEN
    RAISE EXCEPTION 'A politica de UPDATE nao tem USING e WITH CHECK ambos escritos.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'pessoas_horario_realizado'
       AND policyname = 'pessoas_horario_realizado_select'
       AND coalesce(qual, '') LIKE '%hr_pessoa_do_utilizador%'
  ) THEN
    RAISE EXCEPTION
      'A politica de SELECT nao tem o ramo de ficha-propria. O trabalhador nao veria as horas que lhe foram registadas, e nao podia contesta-las.';
  END IF;

  -- minutos tem de ser GERADA. Se alguem a tornar escrivel, passa a haver duas
  -- fontes de verdade sobre a duracao.
  SELECT is_generated INTO v_gerada
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'pessoas_horario_realizado'
     AND column_name = 'minutos';

  IF v_gerada IS DISTINCT FROM 'ALWAYS' THEN
    RAISE EXCEPTION
      'A coluna minutos nao e GENERATED ALWAYS (e "%"). Escrivel, seria uma segunda fonte de verdade sobre a duracao.', coalesce(v_gerada, 'ausente');
  END IF;

  -- A FK do planeado tem de ser COMPOSTA de 3 colunas.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_horario_realizado_planeado_fkey'
       AND conrelid = to_regclass('public.pessoas_horario_realizado')
       AND cardinality(conkey) = 3
  ) THEN
    RAISE EXCEPTION
      'pessoas_horario_realizado_planeado_fkey nao e a FK composta (planeado_id, pessoa_id, organization_id) esperada. Uma FK simples deixaria um realizado dizer que cumpre o planeado de outra pessoa.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_horario_realizado_local_fkey'
       AND conrelid = to_regclass('public.pessoas_horario_realizado')
       AND cardinality(conkey) = 2
  ) THEN
    RAISE EXCEPTION
      'pessoas_horario_realizado_local_fkey nao e a FK composta (local_id, organization_id) esperada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_horario_realizado_validacao_coerente'
       AND conrelid = to_regclass('public.pessoas_horario_realizado')
  ) THEN
    RAISE EXCEPTION
      'O CHECK de coerencia da validacao nao ficou criado; podia haver linhas validadas sem quem nem quando.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = to_regclass('public.pessoas_horario_realizado')
       AND tgname = 'trg_pessoas_horario_realizado_sem_sobreposicao'
  ) THEN
    RAISE EXCEPTION 'O trigger de nao-sobreposicao nao ficou criado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'hr_horario_realizado_sem_sobreposicao'
       AND p.prosecdef
       AND array_to_string(coalesce(p.proconfig, ARRAY[]::text[]), ',') LIKE '%search_path%'
  ) THEN
    RAISE EXCEPTION
      'hr_horario_realizado_sem_sobreposicao nao e SECURITY DEFINER com search_path fixo. Sem search_path fixo, uma funcao definer e um vector de escalada.';
  END IF;

  RAISE NOTICE
    'OK: pessoas_horario_realizado criada. Uma linha = um intervalo trabalhado numa data e num local; minutos gerada; sem sobreposicao mesmo entre locais diferentes; RLS activo com 4 politicas e ficha-propria na leitura. NOTA: hr.pessoas.horario_realizado.validar continua sem ser verificada por nada -- lacuna assumida, a RPC de validacao nao foi construida.';
END;
$conferir$;
