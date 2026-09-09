-- ==============================================================================
-- pessoas_horario_planeado: horario por DIA, com VARIOS intervalos, cada um
-- com o seu LOCAL.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- O requisito, nas palavras do utilizador, e repetido duas vezes:
--
--   "o objetivo e por cada pessoa puder ter onde cada um trabalha durante o
--    dia, ou seja neste dia ela fez das 9 as 14 naquela empresa e so das 15 as
--    19 naquilo"
--
--   "as senhoras da limpeza nao teem horas fixas por semana e sim por exemplo
--    na segunda das 3 as 6, terca das 7 as 9"
--
-- Isto elimina, de forma definitiva, o modelo que seria natural escrever:
-- um horario semanal fixo, com uma hora de entrada e uma de saida por pessoa.
-- pessoas_vinculos.horas_semanais diz QUANTAS horas; nao diz nem pode dizer
-- QUANDO nem ONDE.
--
-- Tres coisas tem de ser possiveis ao mesmo tempo:
--   1. Horas diferentes em dias diferentes (segunda das 3 as 6, terca das 7 as 9)
--   2. VARIOS intervalos no MESMO dia
--   3. Cada intervalo com o SEU proprio local, diferente dos outros do dia
--
--
-- -- A REGRA NOVA: UMA LINHA = UM INTERVALO ------------------------------------
--
-- Nao uma linha por pessoa, nem uma linha por dia: uma linha por INTERVALO.
-- Dois intervalos no mesmo dia em locais diferentes sao duas linhas, cada uma
-- com o seu local_id, hora_inicio, hora_fim e ordem. E isto, e so isto, que
-- responde a "das 9 as 14 naquela empresa e das 15 as 19 naquilo".
--
--
-- -- PLANEADO E REALIZADO SAO DUAS TABELAS, NAO UMA COM FLAG ------------------
--
-- Decisao explicita, e a pergunta foi feita. O realizado e 20261120160000.
-- Quatro razoes, cada uma suficiente por si:
--
-- 1. CICLO DE VIDA DIFERENTE. O planeado e autorado por RH, tem janela de
--    validade e e editado ate ficar certo. O realizado e o registo de um
--    intervalo que ACONTECEU numa data concreta: nasce uma vez, e validado ou
--    rejeitado, e altera-lo depois e um acto que tem de ficar auditavel.
--
-- 2. PERMISSAO DIFERENTE. Quem planeia horarios nao e necessariamente quem
--    confirma horas trabalhadas -- e a confirmacao de horas e a base de um
--    pagamento. Numa tabela unica as duas coisas partilhavam
--    hr.pessoas.horario.edit e nao havia como separa-las.
--
-- 3. UMA FLAG "e_planeado" ENVENENAVA TODAS AS QUERIES. Cada leitura de "o que
--    esta planeado" e de "o que foi feito" passaria a depender de nao esquecer
--    um filtro. Duas tabelas tornam o esquecimento impossivel.
--
-- 4. AS PICAGENS TEM DE TER UM DESTINO CLARO ANTES DE EXISTIREM. Elas escrevem
--    em pessoas_horario_realizado e nunca aqui. Deixar isso ambiguo agora era
--    garantir que a primeira implementacao escrevia no sitio errado.
--
--
-- -- SEMANAS SEM PADRAO: REGRA RECORRENTE OU EXCEPCAO POR DATA ----------------
--
-- Uma so tabela, com uma chave alternativa. Cada linha e OU uma regra
-- recorrente (dia_semana preenchido, data nula) OU uma excepcao pontual (data
-- preenchida, dia_semana nulo). Nunca as duas -- ha um CHECK a impor o ou
-- exclusivo, porque uma linha com as duas nao teria significado definido.
--
-- REGRA DE PRECEDENCIA, e e o leitor que a implementa, nao a base:
--   Se existir QUALQUER linha viva com data = D para a pessoa, essa data e
--   definida EXCLUSIVAMENTE por essas linhas, e as regras recorrentes sao
--   ignoradas nesse dia.
-- Nao e "as excepcoes acrescentam-se ao padrao". Uma excepcao SUBSTITUI o dia
-- inteiro. Sem isto, marcar um dia diferente obrigaria a apagar as recorrentes.
--
-- Um dia de folga que anula o padrao e uma linha com data = D e
-- nao_trabalha = true, com horas e local nulos.
--
-- NAO se constroi rotacao semana A / semana B. Com excepcoes por data e sem
-- padrao obrigatorio, o caso das senhoras da limpeza esta coberto sem esse
-- mecanismo, e um mecanismo de rotacao mal especificado e pior do que nenhum.
--
--
-- -- TURNOS QUE ATRAVESSAM A MEIA-NOITE ---------------------------------------
--
-- Representam-se como DUAS linhas, em dois dias: 22:00-24:00 num dia e
-- 00:00-06:00 no seguinte. Nao se inventa uma coluna atravessa_meia_noite
-- nesta ronda. O CHECK hora_fim > hora_inicio impede a alternativa (uma linha
-- 22:00-06:00), de proposito: uma linha dessas quebraria toda a aritmetica de
-- horas e toda a verificacao de sobreposicao, em silencio.
--
--
-- -- NAO-SOBREPOSICAO POR TRIGGER, NAO POR EXCLUDE ----------------------------
--
-- btree_gist NAO esta instalado (confirmado em 20261120060000 linhas 51-55) e
-- esta ronda nao instala extensoes numa base partilhada por organizacoes com
-- dados reais. Logo, nao ha constraint EXCLUDE possivel e a verificacao e um
-- trigger, no molde exacto de hr_retribuicoes_sem_sobreposicao.
--
-- SECURITY DEFINER pelo motivo ja documentado em 20261120060000 linha 411: sob
-- RLS de invocador, quem tem horario.edit sem horario.view nao veria as linhas
-- existentes e a verificacao sairia vazia. Uma verificacao que so ve metade
-- das linhas nao e uma verificacao. Com SET search_path -- sem isso, uma
-- funcao DEFINER e um vector de escalada.
--
-- Nao ha aqui um equivalente ao indice unico parcial que serve de camada 1 nas
-- retribuicoes: nao existe "o intervalo em aberto" de que so possa haver um.
-- Fica so o trigger, com a janela de corrida teorica que ele tem entre duas
-- transaccoes simultaneas -- e a alternativa (nenhuma verificacao) e pior.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - PICAGENS: nada. Nem relogio de ponto, nem dispositivos, nem ingestao.
--   Esta tabela e o PLANEADO; as picagens escreverao no realizado.
-- - Ausencias, ferias e feriados: nem tabela, nem ligacao a schedule_holidays,
--   nem a resource_time_off. Um dia de folga aqui e uma linha nao_trabalha,
--   que e outra coisa: e o horario a dizer que nao ha turno, nao uma ausencia
--   justificada.
-- - Rotacao semana A / semana B: nao.
-- - Turnos a atravessar a meia-noite numa linha: nao.
-- - AGENDAMENTO: nao se toca em resource_availability_rules,
--   schedule_resources, schedule_items, resource_time_off nem em
--   get_resource_available_slots. A convencao de dia_semana (0=domingo)
--   E DELIBERADAMENTE a mesma de resource_availability_rules.day_of_week, para
--   que uma ponte futura entre os dois nao precise de traducao -- mas ponte
--   nenhuma e construida agora, e nao ha FK entre as duas tabelas.
-- - Nao se instala extensao nenhuma.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao, e SO depois de
-- reverter 20261120160000, que lhe pendura a FK planeado_id:
--   DROP TABLE IF EXISTS public.pessoas_horario_planeado;
--   DROP FUNCTION IF EXISTS public.hr_horario_planeado_sem_sobreposicao();
--
--
-- Prerequisitos:
--   20261120010000  has_anew_permission_in_org
--   20261120030000  pessoas (e a unique pessoas_id_org_key)
--   20261120040000  hr_satelite_ancora_imutavel()
--   20261120060000  pessoas_vinculos (e a unique pessoas_vinculos_id_pessoa_org_key)
--   20261120090000  hr_pessoa_do_utilizador() -- o ramo de ficha-propria
--   20261120120000  hr.pessoas.horario.view / .edit no catalogo
--   20261120130000  hr_locais_trabalho (e a unique hr_locais_trabalho_id_org_key)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
-- to_regclass e nao o cast literal ::regclass: o cast e resolvido no
-- PLANEAMENTO do bloco e lanca 42P01 quando a tabela ainda nao existe.
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas nao existe. Aplicar 20261120030000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_id_org_key' AND conrelid = to_regclass('public.pessoas')
  ) THEN
    RAISE EXCEPTION
      'A unique pessoas_id_org_key nao existe; a FK composta desta tabela depende dela.';
  END IF;

  IF to_regclass('public.pessoas_vinculos') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_vinculos nao existe. Aplicar 20261120060000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_vinculos_id_pessoa_org_key'
       AND conrelid = to_regclass('public.pessoas_vinculos')
  ) THEN
    RAISE EXCEPTION
      'A unique pessoas_vinculos_id_pessoa_org_key nao existe; a FK composta de vinculo_id depende dela.';
  END IF;

  IF to_regclass('public.hr_locais_trabalho') IS NULL THEN
    RAISE EXCEPTION
      'public.hr_locais_trabalho nao existe. Aplicar 20261120130000 primeiro -- e ela que da um destino ao local_id de cada intervalo, que e o requisito central desta ronda.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'hr_locais_trabalho_id_org_key'
       AND conrelid = to_regclass('public.hr_locais_trabalho')
  ) THEN
    RAISE EXCEPTION
      'A unique hr_locais_trabalho_id_org_key nao existe; a FK composta de local_id depende dela.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'has_anew_permission_in_org' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION
      'public.has_anew_permission_in_org(uuid,text,uuid) nao existe. Aplicar 20261120010000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_pessoa_do_utilizador' AND p.pronargs = 2
  ) THEN
    RAISE EXCEPTION
      'public.hr_pessoa_do_utilizador(uuid,uuid) nao existe. Aplicar 20261120090000 primeiro -- o ramo de ficha-propria da politica de SELECT depende dela.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_satelite_ancora_imutavel'
  ) THEN
    RAISE EXCEPTION 'public.hr_satelite_ancora_imutavel() nao existe. Aplicar 20261120040000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.horario.view') THEN
    RAISE EXCEPTION
      'A permissao hr.pessoas.horario.view nao esta no catalogo. Aplicar 20261120120000 primeiro -- sem ela a tabela fica invisivel para todos, em silencio.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.horario.edit') THEN
    RAISE EXCEPTION 'A permissao hr.pessoas.horario.edit nao esta no catalogo. Aplicar 20261120120000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.view.own') THEN
    RAISE EXCEPTION 'A permissao hr.pessoas.view.own nao esta no catalogo. Aplicar 20261120020000 primeiro.';
  END IF;

  -- Colisao de nome.
  IF to_regclass('public.pessoas_horario_planeado') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = 'pessoas_horario_planeado_id_pessoa_org_key'
         AND conrelid = to_regclass('public.pessoas_horario_planeado')
    ) THEN
      RAISE EXCEPTION
        'Ja existe public.pessoas_horario_planeado mas sem a constraint pessoas_horario_planeado_id_pessoa_org_key. Nao e a tabela desta migracao -- colisao de nome. Investigar.';
    END IF;
    RAISE NOTICE 'public.pessoas_horario_planeado ja existe com a unique esperada; idempotente daqui para a frente.';
  END IF;
END;
$guardas$;

-- ---- A tabela --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pessoas_horario_planeado (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  pessoa_id        uuid NOT NULL,
  organization_id  uuid NOT NULL,
  vinculo_id       uuid,

  -- O ONDE de cada intervalo. Nulo = usa pessoas.local_id (o local
  -- predefinido da pessoa, 20261120170000).
  local_id         uuid,

  -- Chave temporal alternativa: OU dia_semana (regra recorrente) OU data
  -- (excepcao pontual). Nunca as duas -- ver o CHECK do ou-exclusivo.
  dia_semana       smallint,
  data             date,

  hora_inicio      time,
  hora_fim         time,
  nao_trabalha     boolean NOT NULL DEFAULT false,
  ordem            smallint NOT NULL DEFAULT 1,

  -- Janela de validade da regra recorrente. Sem sentido numa excepcao por
  -- data, e ha um CHECK a impedi-lo.
  valido_de        date,
  valido_ate       date,

  notas            text,

  deleted_at       timestamptz,
  deleted_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid,
  updated_by       uuid,

  CONSTRAINT pessoas_horario_planeado_pkey PRIMARY KEY (id),

  -- Duas uniques, e as duas sao precisas:
  --   (id, organization_id)             para FKs futuras org-scoped
  --   (id, pessoa_id, organization_id)  alvo da FK planeado_id de
  --                                     pessoas_horario_realizado (20261120160000)
  CONSTRAINT pessoas_horario_planeado_id_org_key UNIQUE (id, organization_id),
  CONSTRAINT pessoas_horario_planeado_id_pessoa_org_key UNIQUE (id, pessoa_id, organization_id),

  CONSTRAINT pessoas_horario_planeado_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id) ON DELETE CASCADE,

  -- FK COMPOSTA de proposito, igual ao padrao de pessoas_retribuicoes: uma FK
  -- simples so contra pessoas_vinculos(id) nao impediria este horario apontar
  -- para o vinculo de OUTRA pessoa da mesma organizacao.
  CONSTRAINT pessoas_horario_planeado_vinculo_fkey
    FOREIGN KEY (vinculo_id, pessoa_id, organization_id)
    REFERENCES public.pessoas_vinculos (id, pessoa_id, organization_id)
    ON DELETE SET NULL (vinculo_id),

  -- ON DELETE NO ACTION e NAO SET NULL, pelo motivo ja documentado em
  -- 20261120030000 linhas 194-203: num FK composto o SET NULL classico poe a
  -- NULL TODAS as colunas da chave, incluindo organization_id, que e NOT NULL
  -- -- o apagamento rebentaria com uma violacao de NOT NULL. Na pratica nao
  -- incomoda: o DELETE de hr_locais_trabalho esta bloqueado por politica
  -- restritiva e os locais desactivam-se, nao se apagam.
  CONSTRAINT pessoas_horario_planeado_local_fkey
    FOREIGN KEY (local_id, organization_id)
    REFERENCES public.hr_locais_trabalho (id, organization_id) ON DELETE NO ACTION,

  CONSTRAINT pessoas_horario_planeado_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_horario_planeado_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_horario_planeado_deleted_by_fkey
    FOREIGN KEY (deleted_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  -- Exactamente uma das duas chaves temporais. Uma linha com as duas, ou com
  -- nenhuma, nao teria significado definido.
  CONSTRAINT pessoas_horario_planeado_recorrente_ou_data
    CHECK ((dia_semana IS NULL) <> (data IS NULL)),

  -- 0 = domingo .. 6 = sabado, a mesma convencao de
  -- resource_availability_rules.day_of_week (baseline, CHECK 0..6).
  CONSTRAINT pessoas_horario_planeado_dia_semana_valido
    CHECK (dia_semana IS NULL OR (dia_semana >= 0 AND dia_semana <= 6)),

  -- Janela de validade so nas regras recorrentes: uma excepcao para o dia 3 de
  -- Marco nao tem "valida de" nenhum -- ela E a data.
  CONSTRAINT pessoas_horario_planeado_validade_so_recorrente
    CHECK (data IS NULL OR (valido_de IS NULL AND valido_ate IS NULL)),
  CONSTRAINT pessoas_horario_planeado_validade_coerente
    CHECK (valido_ate IS NULL OR valido_de IS NULL OR valido_ate >= valido_de),

  -- Um intervalo de trabalho tem de ter as duas horas; um dia de folga nao tem
  -- horas nem local nenhum.
  CONSTRAINT pessoas_horario_planeado_horas_presentes
    CHECK (nao_trabalha OR (hora_inicio IS NOT NULL AND hora_fim IS NOT NULL)),
  CONSTRAINT pessoas_horario_planeado_folga_sem_horas
    CHECK (
      nao_trabalha = false
      OR (hora_inicio IS NULL AND hora_fim IS NULL AND local_id IS NULL)
    ),

  -- Turnos a atravessar a meia-noite representam-se como DUAS linhas, em dois
  -- dias. Ver o cabecalho: uma linha 22:00-06:00 quebraria em silencio toda a
  -- aritmetica de horas e a verificacao de sobreposicao.
  CONSTRAINT pessoas_horario_planeado_fim_depois_inicio
    CHECK (hora_fim IS NULL OR hora_inicio IS NULL OR hora_fim > hora_inicio),

  CONSTRAINT pessoas_horario_planeado_ordem_valida
    CHECK (ordem >= 1 AND ordem <= 12)
);

COMMENT ON TABLE public.pessoas_horario_planeado IS
'Horario PLANEADO. UMA LINHA = UM INTERVALO, nao um dia e nao uma pessoa: "das 9 as 14 na empresa X e das 15 as 19 na loja Y" sao DUAS linhas no mesmo dia, cada uma com o seu local_id. Cada linha e OU uma regra recorrente (dia_semana) OU uma excepcao pontual (data), nunca as duas.

REGRA DE PRECEDENCIA, implementada pelo LEITOR e nao pela base: se existir qualquer linha viva com data = D para a pessoa, essa data e definida EXCLUSIVAMENTE por essas linhas e as regras recorrentes sao IGNORADAS nesse dia. Uma excepcao SUBSTITUI o dia inteiro, nao se acrescenta ao padrao. Um dia de folga que anula o padrao e uma linha com data = D e nao_trabalha = true.

TURNOS QUE ATRAVESSAM A MEIA-NOITE: duas linhas, em dois dias (22:00-24:00 e 00:00-06:00). Nao ha coluna atravessa_meia_noite e o CHECK hora_fim > hora_inicio impede a alternativa de proposito.

NAO E o tempo realizado: isso e pessoas_horario_realizado, e as picagens escrevem la e nunca aqui.';

COMMENT ON COLUMN public.pessoas_horario_planeado.dia_semana IS
'0 = domingo .. 6 = sabado. E DELIBERADAMENTE a mesma convencao de resource_availability_rules.day_of_week, para que uma ponte futura entre RH e o agendamento nao precise de traducao. Nao ha FK nem ponte nenhuma hoje. Preenchido = regra recorrente; nulo = a linha e uma excepcao por data.';

COMMENT ON COLUMN public.pessoas_horario_planeado.data IS
'Excepcao pontual. Preenchida, esta linha define aquele dia e as regras recorrentes sao ignoradas nesse dia -- ver a regra de precedencia no COMMENT da tabela.';

COMMENT ON COLUMN public.pessoas_horario_planeado.local_id IS
'ONDE este intervalo e trabalhado. Nulo = usa o local predefinido da pessoa (pessoas.local_id). E esta coluna, por intervalo e nao por pessoa, que permite dois locais diferentes no mesmo dia -- o requisito central desta ronda.';

COMMENT ON COLUMN public.pessoas_horario_planeado.nao_trabalha IS
'true = nao ha turno neste dia. NAO e uma ausencia justificada nem ferias (isso nao existe nesta ronda): e o horario a dizer que nao ha trabalho previsto. Uma linha destas com data preenchida anula o padrao recorrente desse dia.';

COMMENT ON COLUMN public.pessoas_horario_planeado.ordem IS
'Ordem do intervalo dentro do dia (1 = o primeiro). E so apresentacao: a verdade das horas esta em hora_inicio/hora_fim, e a nao-sobreposicao nao depende desta coluna.';

COMMENT ON COLUMN public.pessoas_horario_planeado.valido_de IS
'Janela de validade da regra recorrente. Nula = sem inicio declarado. So faz sentido em linhas com dia_semana; um CHECK impede-a nas excepcoes por data.';

COMMENT ON CONSTRAINT pessoas_horario_planeado_id_pessoa_org_key ON public.pessoas_horario_planeado IS
'Alvo da FK COMPOSTA (planeado_id, pessoa_id, organization_id) de pessoas_horario_realizado. Sem esta unique, um intervalo realizado poderia dizer que cumpre o planeado de OUTRA pessoa.';

-- ---- Indices ---------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_pessoas_horario_planeado_pessoa_dia
  ON public.pessoas_horario_planeado (pessoa_id, dia_semana)
  WHERE deleted_at IS NULL AND dia_semana IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pessoas_horario_planeado_pessoa_data
  ON public.pessoas_horario_planeado (pessoa_id, data)
  WHERE deleted_at IS NULL AND data IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pessoas_horario_planeado_organization_id
  ON public.pessoas_horario_planeado (organization_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pessoas_horario_planeado_local
  ON public.pessoas_horario_planeado (local_id)
  WHERE local_id IS NOT NULL;

-- ---- Nao-sobreposicao ------------------------------------------------------
-- SECURITY DEFINER de proposito, e com SET search_path. Ver o cabecalho: sob
-- RLS de invocador, quem tem horario.edit sem horario.view nao veria as linhas
-- existentes e a verificacao sairia vazia.
--
-- NOTA para quem revir: nao se usa "timerange" porque NAO EXISTE tipo
-- timerange no PostgreSQL. A sobreposicao de horas e a comparacao explicita
-- (a.inicio < b.fim AND b.inicio < a.fim), que para intervalos semi-abertos
-- e exactamente equivalente e nao depende de extensao nenhuma.
CREATE OR REPLACE FUNCTION public.hr_horario_planeado_sem_sobreposicao()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_conflito record;
BEGIN
  -- Uma linha marcada como apagada nao ocupa tempo nenhum.
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT h.id, h.hora_inicio, h.hora_fim, h.nao_trabalha
    INTO v_conflito
    FROM public.pessoas_horario_planeado h
   WHERE h.pessoa_id = NEW.pessoa_id
     AND h.deleted_at IS NULL
     AND h.id <> NEW.id
     -- Mesma chave temporal. Numa regra recorrente exige-se tambem que as
     -- janelas de validade se cruzem: duas regras para a mesma segunda-feira,
     -- uma valida em Janeiro e outra em Marco, nao colidem.
     AND (
       (NEW.data IS NOT NULL AND h.data = NEW.data)
       OR (
         NEW.dia_semana IS NOT NULL
         AND h.dia_semana = NEW.dia_semana
         AND daterange(h.valido_de, h.valido_ate, '[]')
             && daterange(NEW.valido_de, NEW.valido_ate, '[]')
       )
     )
     AND (
       -- Uma folga e EXCLUSIVA no dia: um dia tem linhas de trabalho ou uma
       -- linha de folga, nunca as duas. Dizer "nao trabalha" e ao mesmo tempo
       -- "trabalha das 9 as 14" e uma contradicao, nao um dado.
       NEW.nao_trabalha
       OR h.nao_trabalha
       -- Sobreposicao de horas, por comparacao explicita.
       OR (NEW.hora_inicio < h.hora_fim AND h.hora_inicio < NEW.hora_fim)
     )
   LIMIT 1;

  IF v_conflito.id IS NOT NULL THEN
    IF NEW.nao_trabalha OR v_conflito.nao_trabalha THEN
      RAISE EXCEPTION
        'horario_folga_e_trabalho: a linha % ja define este dia para esta pessoa. Um dia tem intervalos de trabalho OU uma linha de folga (nao_trabalha), nunca as duas.',
        v_conflito.id;
    ELSE
      RAISE EXCEPTION
        'horario_sobreposto: o intervalo % a % cruza-se com o intervalo % (% a %) da mesma pessoa no mesmo dia. Dois locais no mesmo dia sao possiveis, mas nao a mesma hora -- ninguem esta em dois sitios ao mesmo tempo.',
        NEW.hora_inicio, NEW.hora_fim,
        v_conflito.id, v_conflito.hora_inicio, v_conflito.hora_fim;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_horario_planeado_sem_sobreposicao() IS
'Impede dois intervalos planeados vivos da mesma pessoa a sobreporem-se no mesmo dia (mesma data, ou mesmo dia_semana com janelas de validade que se cruzam), e impede uma folga coexistir com trabalho no mesmo dia. Dois LOCAIS diferentes no mesmo dia sao permitidos e sao o requisito -- o que nao se permite e a mesma HORA duas vezes. Existe como trigger porque btree_gist nao esta instalado e nao ha constraint EXCLUDE possivel. SECURITY DEFINER: sob RLS de invocador, quem tem horario.edit sem horario.view nao veria as linhas existentes e a verificacao seria vazia.';

DROP TRIGGER IF EXISTS trg_pessoas_horario_planeado_sem_sobreposicao ON public.pessoas_horario_planeado;
CREATE TRIGGER trg_pessoas_horario_planeado_sem_sobreposicao
  BEFORE INSERT OR UPDATE ON public.pessoas_horario_planeado
  FOR EACH ROW EXECUTE FUNCTION public.hr_horario_planeado_sem_sobreposicao();

-- ---- Triggers de padrao ----------------------------------------------------
DROP TRIGGER IF EXISTS trg_pessoas_horario_planeado_updated_at ON public.pessoas_horario_planeado;
CREATE TRIGGER trg_pessoas_horario_planeado_updated_at
  BEFORE UPDATE ON public.pessoas_horario_planeado
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_pessoas_horario_planeado_ancora ON public.pessoas_horario_planeado;
CREATE TRIGGER trg_pessoas_horario_planeado_ancora
  BEFORE UPDATE ON public.pessoas_horario_planeado
  FOR EACH ROW EXECUTE FUNCTION public.hr_satelite_ancora_imutavel();

-- ---- Grants ----------------------------------------------------------------
REVOKE ALL ON TABLE public.pessoas_horario_planeado FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pessoas_horario_planeado TO authenticated;
GRANT ALL ON TABLE public.pessoas_horario_planeado TO service_role;

-- ---- RLS -------------------------------------------------------------------
ALTER TABLE public.pessoas_horario_planeado ENABLE ROW LEVEL SECURITY;

-- O ramo de ficha-propria esta aqui DESDE O INICIO, no molde de
-- 20261120090000 linha 357 -- nao se repete o padrao da ronda 1, em que as
-- politicas nasceram sem ele e foi preciso uma migracao a corrigi-las.
DROP POLICY IF EXISTS pessoas_horario_planeado_select ON public.pessoas_horario_planeado;
CREATE POLICY pessoas_horario_planeado_select ON public.pessoas_horario_planeado
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.horario.view', organization_id))
      OR (
        (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.view.own', organization_id))
        AND pessoa_id = (SELECT public.hr_pessoa_do_utilizador((SELECT auth.uid()), organization_id))
      )
    )
  );

-- SEM ramo de ficha-propria, de proposito: ninguem escreve o proprio horario.
DROP POLICY IF EXISTS pessoas_horario_planeado_insert ON public.pessoas_horario_planeado;
CREATE POLICY pessoas_horario_planeado_insert ON public.pessoas_horario_planeado
  FOR INSERT TO authenticated
  WITH CHECK (
    deleted_at IS NULL
    AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.horario.edit', organization_id))
  );

DROP POLICY IF EXISTS pessoas_horario_planeado_update ON public.pessoas_horario_planeado;
CREATE POLICY pessoas_horario_planeado_update ON public.pessoas_horario_planeado
  FOR UPDATE TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.horario.edit', organization_id)))
  WITH CHECK ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.horario.edit', organization_id)));

DROP POLICY IF EXISTS pessoas_horario_planeado_block_delete ON public.pessoas_horario_planeado;
CREATE POLICY pessoas_horario_planeado_block_delete ON public.pessoas_horario_planeado
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON POLICY pessoas_horario_planeado_select ON public.pessoas_horario_planeado IS
'Ve o horario planeado quem tem hr.pessoas.horario.view NAQUELA organizacao; e cada um ve o SEU proprio horario se tiver hr.pessoas.view.own e a conta estiver ligada a uma pessoa nessa organizacao. AVISO: quem so tem view.own ve o horario mas nao ve o NOME do local, porque hr_locais_trabalho exige hr.locais.view -- decisao de produto por tomar, registada no vault.';

COMMENT ON POLICY pessoas_horario_planeado_insert ON public.pessoas_horario_planeado IS
'SEM ramo de ficha-propria, de proposito: ver o proprio horario nao da para o escrever. Um trabalhador a escrever o seu proprio horario planeado seria ele a definir o que lhe e devido.';

COMMENT ON POLICY pessoas_horario_planeado_update ON public.pessoas_horario_planeado IS
'USING e WITH CHECK ambos escritos: sem o WITH CHECK, um UPDATE poderia mover a linha para uma organizacao onde quem escreve nao tem permissao nenhuma. O USING nao exige deleted_at IS NULL, para se poder marcar e desmarcar o soft delete.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_rls       boolean;
  v_politicas integer;
BEGIN
  IF to_regclass('public.pessoas_horario_planeado') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_horario_planeado nao ficou criada.';
  END IF;

  SELECT c.relrowsecurity INTO v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'pessoas_horario_planeado';

  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'public.pessoas_horario_planeado ficou sem RLS activo.';
  END IF;

  SELECT count(*) INTO v_politicas FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_horario_planeado';

  IF v_politicas <> 4 THEN
    RAISE EXCEPTION
      'Esperavam-se 4 politicas em pessoas_horario_planeado, encontraram-se %.', v_politicas;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'pessoas_horario_planeado'
       AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) LIKE '%get_user_visible_org_ids%'
  ) THEN
    RAISE EXCEPTION
      'Alguma politica de pessoas_horario_planeado usa get_user_visible_org_ids. Em RH isso nunca acontece.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'pessoas_horario_planeado'
       AND policyname = 'pessoas_horario_planeado_update'
       AND (qual IS NULL OR with_check IS NULL)
  ) THEN
    RAISE EXCEPTION
      'A politica de UPDATE nao tem USING e WITH CHECK ambos escritos.';
  END IF;

  -- O ramo de ficha-propria tem de estar no SELECT desde o inicio.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'pessoas_horario_planeado'
       AND policyname = 'pessoas_horario_planeado_select'
       AND coalesce(qual, '') LIKE '%hr_pessoa_do_utilizador%'
  ) THEN
    RAISE EXCEPTION
      'A politica de SELECT nao tem o ramo de ficha-propria. O trabalhador nao veria o seu proprio horario.';
  END IF;

  -- E NAO pode estar no INSERT.
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'pessoas_horario_planeado'
       AND policyname = 'pessoas_horario_planeado_insert'
       AND coalesce(with_check, '') LIKE '%hr_pessoa_do_utilizador%'
  ) THEN
    RAISE EXCEPTION
      'A politica de INSERT ganhou um ramo de ficha-propria. Ninguem escreve o proprio horario.';
  END IF;

  -- As duas uniques.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_horario_planeado_id_pessoa_org_key'
       AND conrelid = to_regclass('public.pessoas_horario_planeado')
  ) THEN
    RAISE EXCEPTION
      'A unique (id, pessoa_id, organization_id) nao ficou criada; a FK planeado_id de 20261120160000 depende dela e vai falhar.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_horario_planeado_id_org_key'
       AND conrelid = to_regclass('public.pessoas_horario_planeado')
  ) THEN
    RAISE EXCEPTION 'A unique (id, organization_id) nao ficou criada.';
  END IF;

  -- A FK do local tem de ser COMPOSTA. Uma FK simples deixaria um horario
  -- apontar para um local de outra organizacao.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_horario_planeado_local_fkey'
       AND conrelid = to_regclass('public.pessoas_horario_planeado')
       AND cardinality(conkey) = 2
  ) THEN
    RAISE EXCEPTION
      'pessoas_horario_planeado_local_fkey nao e a FK composta (local_id, organization_id) esperada. Uma FK simples deixaria um horario apontar para um local de outra organizacao.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_horario_planeado_vinculo_fkey'
       AND conrelid = to_regclass('public.pessoas_horario_planeado')
       AND cardinality(conkey) = 3
  ) THEN
    RAISE EXCEPTION
      'pessoas_horario_planeado_vinculo_fkey nao e a FK composta (vinculo_id, pessoa_id, organization_id) esperada.';
  END IF;

  -- O ou-exclusivo da chave temporal e a razao pela qual uma linha tem sempre
  -- significado definido.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_horario_planeado_recorrente_ou_data'
       AND conrelid = to_regclass('public.pessoas_horario_planeado')
  ) THEN
    RAISE EXCEPTION
      'O CHECK do ou-exclusivo entre dia_semana e data nao ficou criado; podiam existir linhas com as duas ou com nenhuma.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = to_regclass('public.pessoas_horario_planeado')
       AND tgname = 'trg_pessoas_horario_planeado_sem_sobreposicao'
  ) THEN
    RAISE EXCEPTION 'O trigger de nao-sobreposicao nao ficou criado.';
  END IF;

  -- Uma funcao DEFINER sem search_path fixo e um vector de escalada.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'hr_horario_planeado_sem_sobreposicao'
       AND p.prosecdef
       AND array_to_string(coalesce(p.proconfig, ARRAY[]::text[]), ',') LIKE '%search_path%'
  ) THEN
    RAISE EXCEPTION
      'hr_horario_planeado_sem_sobreposicao nao e SECURITY DEFINER com search_path fixo. Sem search_path fixo, uma funcao definer e um vector de escalada.';
  END IF;

  RAISE NOTICE
    'OK: pessoas_horario_planeado criada. Uma linha = um intervalo; varios intervalos por dia, cada um com o seu local; regra recorrente OU excepcao por data; nao-sobreposicao por trigger definer; RLS activo com 4 politicas e ficha-propria so na leitura.';
END;
$conferir$;
