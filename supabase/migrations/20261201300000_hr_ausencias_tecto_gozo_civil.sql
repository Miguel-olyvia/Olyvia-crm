-- ==============================================================================
-- O TECTO de 30 dias uteis de ferias gozadas no mesmo ano civil.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- 20261121120000 pos o PISO: nao se pode deixar o trabalhador com menos de 20
-- dias uteis gozaveis. Falta o TECTO do outro lado: nao se podem gozar mais de
-- 30 dias uteis de ferias no mesmo ano civil, por mais direito acumulado que
-- exista.
--
-- O caso que o torna real e o do direito que TRANSITA (20261201270000): quem
-- entrou em Setembro de 2026 chega a 2027 com o direito de 2026 ainda por gozar
-- (ate 30 de Junho de 2027, art. 239.o/2) E com o direito inteiro de 2027.
-- Somados passam facilmente dos 30 dias, e hoje nao ha nada na base a impedir
-- que sejam todos marcados no mesmo ano civil.
--
-- Sao DOIS anos civis de direito a coexistir, no maximo, e nao tres: o prazo de
-- gozo do direito transitado e 30 de Junho do ano civil SUBSEQUENTE ao da
-- admissao (20261201290000), logo o direito de 2026 morre a 30/06/2027 e nunca
-- chega a encontrar-se com o de 2028. Dois anos bastam para passar dos 30.
--
--
-- -- A REGRA NOVA: TRIGGER, E RECUSA -------------------------------------------
--
-- hr_ausencias_tecto_gozo_civil(), BEFORE INSERT OR UPDATE em
-- pessoas_ausencias_dias. RAISE EXCEPTION -- recusa, nao avisa. Mesmo molde de
-- hr_ausencias_minimo_legal_ferias, e pelas mesmas razoes: um CHECK ve a linha e
-- isto e um agregado sobre o ano civil inteiro; e uma regra que se contorna com
-- um insert directo do service_role nao e uma regra.
--
-- Tres coisas que o distinguem do piso, e que sao o cerne desta migracao:
--
-- 1. CONTA-SE PELA DATA DO DIA GOZADO, nao pelo periodo_inicio do direito. E
--    precisamente a diferenca que faz o tecto existir: o direito de 2026
--    gozado em 2027 conta para o ano civil de 2027. Contar por periodo_inicio
--    espalharia a soma por varios periodos diferentes e o tecto nunca disparava.
--
-- 2. SOMA-SE DE QUALQUER ORIGEM DE DIREITO. A soma atravessa periodos e
--    atravessa tipos -- todos os tipos de categoria 'ferias' da organizacao.
--    Um tecto por tipo seria contornado dividindo o gozo por dois tipos de
--    ferias.
--
-- 3. O TECTO E UM MAXIMO QUE UM IRCT PODE ALARGAR, NUNCA ENCOLHER. Ao contrario
--    do minimo de 20 -- que e um PISO e por isso esta escrito na funcao, para
--    que ninguem o baixe -- este e um TECTO, e um instrumento de regulamentacao
--    colectiva pode subi-lo. Daqui a coluna
--    hr_ausencias_tipos.tecto_gozo_civil_dias, smallint NULL, com
--    CHECK (IS NULL OR >= 30): configuravel para CIMA e so para cima. NULL = os
--    30 da lei.
--
--    E o tecto aplicavel e o MAIOR declarado entre os tipos de ferias ACTIVOS da
--    organizacao, nao o do tipo da linha que entra. Tem de ser assim porque a
--    soma (decisao 2) ja atravessa todos esses tipos: comparar uma soma que
--    atravessa tipos com um limite que nao atravessa fazia o desfecho depender
--    da ORDEM DE INSERCAO. Com FER-A a 30 e FER-B a 32, "30 de A e depois 2 de
--    B" passava e "2 de B e depois 30 de A" era recusado ao 31.o -- os mesmos
--    32 dias no fim, dois resultados diferentes.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Dias PENDENTES nao contam para o tecto. Contam para o saldo disponivel (e
--   deliberado, ver 20261121100000), e nao para o tecto: recusar por causa de
--   pedidos que ainda podem ser recusados fecharia a porta a quem tem direito.
--   O momento em que o tecto morde e a APROVACAO, e o trigger e BEFORE UPDATE
--   precisamente para a apanhar -- o estado do dia e espelhado do pedido por
--   UPDATE, e e esse UPDATE que passa por aqui.
-- - Nao se toca em hr_ausencias_minimo_legal_ferias() nem nas RPCs de ajuste.
-- - Nao ha aviso antecipado na marcacao: quem marca 40 dias so descobre na
--   aprovacao. Um aviso cedo e util e e trabalho de ecra, nao de base.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP TRIGGER trg_pessoas_ausencias_dias_tecto_gozo_civil ON public.pessoas_ausencias_dias;
--   DROP FUNCTION public.hr_ausencias_tecto_gozo_civil();
--   ALTER TABLE public.hr_ausencias_tipos DROP COLUMN tecto_gozo_civil_dias;
--
--
-- Prerequisitos:
--   20261121020000  hr_ausencias_tipos
--   20261121080000  pessoas_ausencias_dias
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.hr_ausencias_tipos') IS NULL THEN
    RAISE EXCEPTION 'public.hr_ausencias_tipos nao existe. Aplicar 20261121020000 primeiro.';
  END IF;
  IF to_regclass('public.pessoas_ausencias_dias') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_ausencias_dias nao existe. Aplicar 20261121080000 primeiro.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'hr_ausencias_tipos'
       AND column_name = 'tecto_gozo_civil_dias'
  ) THEN
    RAISE NOTICE 'Ja aplicada: hr_ausencias_tipos ja tem tecto_gozo_civil_dias. A migracao segue por ser idempotente.';
  END IF;
END;
$guardas$;

-- ---- A coluna do tecto -----------------------------------------------------
ALTER TABLE public.hr_ausencias_tipos
  ADD COLUMN IF NOT EXISTS tecto_gozo_civil_dias smallint;

DO $checks$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'hr_ausencias_tipos_tecto_nunca_encolhe'
       AND conrelid = to_regclass('public.hr_ausencias_tipos')
  ) THEN
    -- >= 30 e nao > 0: um IRCT pode ALARGAR o tecto legal, nunca encolhe-lo.
    -- Sem este CHECK, a coluna configuravel seria a porta para o BAIXAR, que e
    -- exactamente o que o cabecalho de 20261121120000 recusou fazer ao piso.
    ALTER TABLE public.hr_ausencias_tipos
      ADD CONSTRAINT hr_ausencias_tipos_tecto_nunca_encolhe
      CHECK (tecto_gozo_civil_dias IS NULL OR tecto_gozo_civil_dias >= 30);
  END IF;
END;
$checks$;

COMMENT ON COLUMN public.hr_ausencias_tipos.tecto_gozo_civil_dias IS
'O maximo de dias uteis de ferias que podem ser GOZADOS no mesmo ano civil. NULL = os 30 da lei.

CHECK (IS NULL OR >= 30): configuravel para CIMA e so para cima, porque um instrumento de regulamentacao colectiva pode alargar um tecto e nao pode encolhe-lo. E o espelho invertido do minimo de 20 dias, que por ser um PISO esta escrito dentro da funcao para que ninguem o baixe.';

-- ---- A guarda do tecto -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_ausencias_tecto_gozo_civil()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_categoria text;
  v_tecto     smallint;
  v_ano       integer;
  v_soma      numeric(12,2);
  v_aplicavel integer;
BEGIN
  -- Um dia pendente, recusado ou cancelado nao foi gozado. O tecto morde na
  -- APROVACAO, e o estado chega aqui por UPDATE espelhado do pedido.
  IF NEW.estado <> 'aprovado' THEN
    RETURN NEW;
  END IF;

  SELECT t.categoria INTO v_categoria
    FROM public.hr_ausencias_tipos t
   WHERE t.id = NEW.tipo_id AND t.organization_id = NEW.organization_id;

  -- So ferias. Doenca, parentalidade e compensacao nao tem tecto de gozo anual,
  -- e aplicar-lhes um seria inventar uma regra que a lei nao tem.
  IF coalesce(v_categoria, '') <> 'ferias' THEN
    RETURN NEW;
  END IF;

  -- O TECTO APLICAVEL E O MAIOR DA ORGANIZACAO, e nao o do tipo da linha que
  -- esta a entrar. A soma atravessa todos os tipos de ferias (decisao 2), por
  -- isso o limite com que ela e comparada tem de atravessar os mesmos tipos --
  -- senao o resultado depende da ORDEM DE INSERCAO e nao do estado final. Com
  -- FER-A a 30 e FER-B a 32, ler so o tipo da linha corrente fazia passar "30
  -- de A e depois 2 de B" e recusar "2 de B e depois 30 de A" ao 31.o dia, com
  -- os mesmos 32 dias no fim.
  SELECT max(coalesce(t.tecto_gozo_civil_dias, 30))
    INTO v_tecto
    FROM public.hr_ausencias_tipos t
   WHERE t.organization_id = NEW.organization_id
     AND t.categoria = 'ferias'
     AND t.activo = true
     AND t.deleted_at IS NULL;

  v_aplicavel := coalesce(v_tecto, 30);
  v_ano := EXTRACT(year FROM NEW.data)::integer;

  -- Pela DATA DO DIA GOZADO e nao pelo periodo do direito, e por TODOS os tipos
  -- de ferias da organizacao. Ver as decisoes 1 e 2 no cabecalho: e isto que faz
  -- o direito de 2026 gozado em 2027 contar para 2027, e que impede contornar o
  -- tecto dividindo o gozo por dois tipos de ferias.
  SELECT coalesce(sum(x.fraccao_dia), 0)
    INTO v_soma
    FROM public.pessoas_ausencias_dias x
    JOIN public.hr_ausencias_tipos t
      ON t.id = x.tipo_id AND t.organization_id = x.organization_id
   WHERE x.pessoa_id = NEW.pessoa_id
     AND x.organization_id = NEW.organization_id
     AND t.categoria = 'ferias'
     AND x.estado = 'aprovado'
     AND EXTRACT(year FROM x.data)::integer = v_ano
     AND x.id <> NEW.id;

  v_soma := v_soma + NEW.fraccao_dia;

  IF v_soma > v_aplicavel THEN
    RAISE EXCEPTION
      'ferias_tecto_gozo_civil: esta aprovacao poria % dias de ferias gozados em %, e o maximo no mesmo ano civil e % dias uteis. Os dias contam-se pela DATA em que sao gozados, nao pelo ano do direito -- direito transitado de anos anteriores gozado em % conta para %. Adiar parte dos dias para o ano seguinte, ou rever o tecto do tipo se um IRCT o alargar.',
      to_char(v_soma, 'FM990.00'), v_ano, v_aplicavel, v_ano, v_ano
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_ausencias_tecto_gozo_civil() IS
'Recusa a aprovacao de um dia de ferias que faca a pessoa passar dos 30 dias uteis gozados no MESMO ANO CIVIL (ou do tecto maior que o tipo declarar em tecto_gozo_civil_dias).

Conta pela DATA DO DIA GOZADO e nao pelo periodo_inicio do direito -- e essa a diferenca que faz o tecto existir: direito de 2026 transitado e gozado em 2027 conta para 2027. Contar por periodo espalharia a soma por varios periodos e o tecto nunca disparava.

Soma TODOS os tipos de categoria ferias da organizacao, nao so o do dia que entra: um tecto por tipo seria contornado dividindo o gozo por dois tipos de ferias.

E o TECTO com que essa soma e comparada atravessa os mesmos tipos: e o MAIOR tecto_gozo_civil_dias (ou 30, quando nenhum tipo declara um) entre os tipos de ferias activos da organizacao, e NAO o do tipo da linha que esta a entrar. Ler so o tipo da linha fazia o desfecho depender da ORDEM DE INSERCAO: com FER-A a 30 e FER-B a 32, "30 de A e depois 2 de B" passava e "2 de B e depois 30 de A" era recusado ao 31.o, com os mesmos 32 dias no fim.

Dias PENDENTES nao contam -- recusar por causa de pedidos que ainda podem ser recusados fecharia a porta a quem tem direito. Por isso e BEFORE INSERT OR UPDATE: o estado do dia e espelhado do pedido por UPDATE, e e esse UPDATE que traz a aprovacao.

SECURITY DEFINER: sob RLS de invocador nao veria os dias ja aprovados e o agregado sairia baixo por defeito -- a falha silenciosa que deixa passar exactamente o que se quer travar.';

-- O nome comeca por "tecto" de proposito: triggers com o mesmo momento correm
-- por ordem alfabetica do nome, e este tem de correr DEPOIS de
-- trg_pessoas_ausencias_dias_art238_substituicao (20261201310000), que pode
-- mudar NEW.data e portanto o ano civil em que o dia cai.
DROP TRIGGER IF EXISTS trg_pessoas_ausencias_dias_tecto_gozo_civil ON public.pessoas_ausencias_dias;
CREATE TRIGGER trg_pessoas_ausencias_dias_tecto_gozo_civil
  BEFORE INSERT OR UPDATE ON public.pessoas_ausencias_dias
  FOR EACH ROW EXECUTE FUNCTION public.hr_ausencias_tecto_gozo_civil();

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_sec       boolean;
  v_path      text;
  v_tg        integer;
  v_bloqueado boolean;
  v_org_id    uuid;
  v_pessoa_id uuid;
  v_tipo_a    uuid;
  v_tipo_b    uuid;
  v_pedido    uuid;
  v_dia       date;
  v_n         integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'hr_ausencias_tipos'
       AND column_name = 'tecto_gozo_civil_dias' AND is_nullable = 'YES'
  ) THEN
    RAISE EXCEPTION 'tecto_gozo_civil_dias nao ficou criada, ou nao ficou nullable.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'hr_ausencias_tipos_tecto_nunca_encolhe'
       AND conrelid = to_regclass('public.hr_ausencias_tipos')
  ) THEN
    RAISE EXCEPTION 'O CHECK que impede encolher o tecto nao ficou criado.';
  END IF;

  SELECT p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '')
    INTO v_sec, v_path
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'hr_ausencias_tecto_gozo_civil';

  IF v_sec IS NULL THEN
    RAISE EXCEPTION 'hr_ausencias_tecto_gozo_civil nao ficou criada.';
  END IF;
  IF v_sec IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'hr_ausencias_tecto_gozo_civil nao e SECURITY DEFINER. Sob RLS de invocador o agregado sairia baixo por defeito e deixava passar o que se quer travar.';
  END IF;
  IF v_path NOT LIKE '%search_path%' THEN
    RAISE EXCEPTION 'hr_ausencias_tecto_gozo_civil ficou sem search_path fixo.';
  END IF;

  -- BEFORE INSERT **e** UPDATE: sem o UPDATE, a aprovacao (que chega por
  -- espelho do estado do pedido) escapava a guarda por completo.
  SELECT count(*) INTO v_tg
    FROM pg_trigger
   WHERE tgrelid = to_regclass('public.pessoas_ausencias_dias')
     AND tgname = 'trg_pessoas_ausencias_dias_tecto_gozo_civil'
     AND NOT tgisinternal
     -- tgtype: bit 2 = BEFORE, bit 4 = INSERT, bit 16 = UPDATE
     AND (tgtype & 4) <> 0
     AND (tgtype & 16) <> 0;

  IF v_tg <> 1 THEN
    RAISE EXCEPTION
      'O trigger do tecto nao esta em BEFORE INSERT OR UPDATE. Sem o UPDATE, a aprovacao de um dia pendente escapava a guarda.';
  END IF;

  -- ---- Exercicio vivo, revertido por ROLLBACK da subtransaccao.
  BEGIN
    INSERT INTO public.anew_organizations (name)
    VALUES ('__conferir_20261201300000__') RETURNING id INTO v_org_id;

    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido)
    VALUES (v_org_id, 'Conferir', 'Tecto') RETURNING id INTO v_pessoa_id;

    -- DOIS tipos de ferias: e o que prova a decisao 2 -- a soma atravessa tipos.
    -- inclui_fim_de_semana=true para que o fixture possa usar dias seguidos sem
    -- depender do calendario; inclui_feriados pela mesma razao.
    INSERT INTO public.hr_ausencias_tipos
      (organization_id, codigo, nome, categoria, exige_aprovacao_chefia, exige_aprovacao_rh,
       inclui_fim_de_semana, inclui_feriados)
    VALUES (v_org_id, 'FER-A', 'Ferias A', 'ferias', false, false, true, true)
    RETURNING id INTO v_tipo_a;

    INSERT INTO public.hr_ausencias_tipos
      (organization_id, codigo, nome, categoria, exige_aprovacao_chefia, exige_aprovacao_rh,
       inclui_fim_de_semana, inclui_feriados)
    VALUES (v_org_id, 'FER-B', 'Ferias B', 'ferias', false, false, true, true)
    RETURNING id INTO v_tipo_b;

    -- Caso 1: baixar o tecto abaixo de 30 tem de ser recusado. E a razao de ser
    -- do CHECK: a coluna existe para ALARGAR.
    v_bloqueado := false;
    BEGIN
      UPDATE public.hr_ausencias_tipos SET tecto_gozo_civil_dias = 22 WHERE id = v_tipo_a;
      RAISE EXCEPTION 'hr_ausencias_tipos aceitou um tecto de 22 dias -- a coluna virou a porta para BAIXAR o tecto legal.';
    EXCEPTION
      WHEN check_violation THEN v_bloqueado := true;
    END;
    IF NOT v_bloqueado THEN
      RAISE EXCEPTION 'O CHECK do tecto nao disparou como esperado (caso 1).';
    END IF;

    -- NOTA: nenhum dos dois tipos declara tecto por enquanto -- o tecto
    -- aplicavel a organizacao e o de 30 da lei. FER-B so e alargado para 32
    -- depois do caso 3, para que o caso 4 possa mostrar que e o MAIOR tecto DA
    -- ORGANIZACAO que manda, e nao o do tipo da linha que entra.

    -- O pedido-suporte das linhas de dia. As linhas entram directamente, sem
    -- passar pela RPC: o que se exercita aqui e o TRIGGER, nao o caminho de
    -- marcacao. dias_solicitados leva um valor coerente com o que se insere.
    INSERT INTO public.pessoas_ausencias_pedidos
      (organization_id, pessoa_id, tipo_id, data_inicio, data_fim, dias_solicitados,
       estado, periodo_inicio, periodo_fim)
    VALUES
      (v_org_id, v_pessoa_id, v_tipo_a, DATE '2030-02-01', DATE '2030-03-31', 31,
       'aprovado', DATE '2030-01-01', DATE '2030-12-31')
    RETURNING id INTO v_pedido;

    -- Caso 2: 30 dias de FER-A entram todos (o tecto por omissao e 30, e o
    -- trigger recusa acima de 30, nao a 30).
    PERFORM set_config('hr_ausencias.rpc', 'on', true);
    v_dia := DATE '2030-02-01';
    FOR v_n IN 1..30 LOOP
      INSERT INTO public.pessoas_ausencias_dias
        (pedido_id, pessoa_id, organization_id, tipo_id, data, fraccao_dia,
         conta_saldo, e_feriado, e_fim_semana, periodo_inicio, estado)
      VALUES
        (v_pedido, v_pessoa_id, v_org_id, v_tipo_a, v_dia, 1.00,
         true, false, false, DATE '2030-01-01', 'aprovado');
      v_dia := v_dia + 1;
    END LOOP;

    -- Caso 3: o dia 31 tem de ser recusado. Neste momento NENHUM tipo da
    -- organizacao declara tecto, logo o aplicavel e o de 30 da lei.
    v_bloqueado := false;
    BEGIN
      PERFORM set_config('hr_ausencias.rpc', 'on', true);
      INSERT INTO public.pessoas_ausencias_dias
        (pedido_id, pessoa_id, organization_id, tipo_id, data, fraccao_dia,
         conta_saldo, e_feriado, e_fim_semana, periodo_inicio, estado)
      VALUES
        (v_pedido, v_pessoa_id, v_org_id, v_tipo_a, v_dia, 1.00,
         true, false, false, DATE '2030-01-01', 'aprovado');
      RAISE EXCEPTION 'pessoas_ausencias_dias aceitou o 31.o dia de ferias no mesmo ano civil.';
    EXCEPTION
      WHEN SQLSTATE '23514' THEN v_bloqueado := true;
    END;
    IF NOT v_bloqueado THEN
      RAISE EXCEPTION 'O tecto de 30 dias nao disparou como esperado (caso 3).';
    END IF;

    -- Agora sim, o IRCT alarga o tecto -- mas so no tipo FER-B.
    UPDATE public.hr_ausencias_tipos SET tecto_gozo_civil_dias = 32 WHERE id = v_tipo_b;

    -- Caso 4: o MESMO 31.o dia, no MESMO tipo FER-A que nao declara tecto
    -- nenhum, passa a entrar -- porque o tecto aplicavel e o MAIOR da
    -- organizacao (32, de FER-B) e nao o do tipo da linha que entra. E esta a
    -- verificacao que prende a correccao: com o tecto lido so de NEW.tipo_id,
    -- este dia era recusado e o desfecho passava a depender da ORDEM em que os
    -- pedidos foram inseridos, em vez do estado final.
    PERFORM set_config('hr_ausencias.rpc', 'on', true);
    INSERT INTO public.pessoas_ausencias_dias
      (pedido_id, pessoa_id, organization_id, tipo_id, data, fraccao_dia,
       conta_saldo, e_feriado, e_fim_semana, periodo_inicio, estado)
    VALUES
      (v_pedido, v_pessoa_id, v_org_id, v_tipo_a, v_dia, 1.00,
       true, false, false, DATE '2030-01-01', 'aprovado');
    v_dia := v_dia + 1;

    -- E o 32.o, esse em FER-B. A soma chega ao tecto alargado e para.
    PERFORM set_config('hr_ausencias.rpc', 'on', true);
    INSERT INTO public.pessoas_ausencias_dias
      (pedido_id, pessoa_id, organization_id, tipo_id, data, fraccao_dia,
       conta_saldo, e_feriado, e_fim_semana, periodo_inicio, estado)
    VALUES
      (v_pedido, v_pessoa_id, v_org_id, v_tipo_b, v_dia, 1.00,
       true, false, false, DATE '2030-01-01', 'aprovado');
    v_dia := v_dia + 1;

    -- Caso 5: agora sao 32 dias gozados no ano, e o tecto da organizacao e 32.
    -- O 33.o tem de ser recusado -- e a prova de que a soma atravessou os dois
    -- tipos: olhando so para FER-B seriam 2 dias, muito longe de 32.
    v_bloqueado := false;
    BEGIN
      PERFORM set_config('hr_ausencias.rpc', 'on', true);
      INSERT INTO public.pessoas_ausencias_dias
        (pedido_id, pessoa_id, organization_id, tipo_id, data, fraccao_dia,
         conta_saldo, e_feriado, e_fim_semana, periodo_inicio, estado)
      VALUES
        (v_pedido, v_pessoa_id, v_org_id, v_tipo_b, v_dia, 1.00,
         true, false, false, DATE '2030-01-01', 'aprovado');
      RAISE EXCEPTION
        'pessoas_ausencias_dias aceitou o 33.o dia de ferias do ano civil num segundo tipo -- a soma nao esta a atravessar tipos, e bastaria um segundo tipo de ferias para contornar o tecto.';
    EXCEPTION
      WHEN SQLSTATE '23514' THEN v_bloqueado := true;
    END;
    IF NOT v_bloqueado THEN
      RAISE EXCEPTION 'O tecto nao disparou ao atravessar tipos (caso 5).';
    END IF;

    -- Caso 6: o MESMO dia, mas no ANO CIVIL seguinte, entra sem problema. E a
    -- decisao 1 ao contrario: a soma e por ano da DATA gozada, e 2031 comeca do
    -- zero mesmo com o periodo do direito a ser o de 2030.
    PERFORM set_config('hr_ausencias.rpc', 'on', true);
    INSERT INTO public.pessoas_ausencias_pedidos
      (organization_id, pessoa_id, tipo_id, data_inicio, data_fim, dias_solicitados,
       estado, periodo_inicio, periodo_fim)
    VALUES
      (v_org_id, v_pessoa_id, v_tipo_a, DATE '2031-02-01', DATE '2031-02-01', 1,
       'aprovado', DATE '2030-01-01', DATE '2030-12-31')
    RETURNING id INTO v_pedido;

    PERFORM set_config('hr_ausencias.rpc', 'on', true);
    INSERT INTO public.pessoas_ausencias_dias
      (pedido_id, pessoa_id, organization_id, tipo_id, data, fraccao_dia,
       conta_saldo, e_feriado, e_fim_semana, periodo_inicio, estado)
    VALUES
      (v_pedido, v_pessoa_id, v_org_id, v_tipo_a, DATE '2031-02-01', 1.00,
       true, false, false, DATE '2030-01-01', 'aprovado');

    RAISE EXCEPTION 'conferir_20261201300000_ok' USING ERRCODE = 'CF012';
  EXCEPTION
    WHEN SQLSTATE 'CF012' THEN
      RAISE NOTICE 'OK: 30 dias de ferias entram, o 31.o e recusado enquanto nenhum tipo declara tecto, a soma atravessa tipos de ferias, o tecto alargado por um IRCT num so tipo passa a valer para toda a organizacao (o 31.o dia no tipo sem override entra), o 33.o e recusado, baixar o tecto e recusado, e o ano civil seguinte comeca do zero -- exercitado com dados descartaveis revertidos por ROLLBACK.';
    WHEN OTHERS THEN
      RAISE;
  END;

  RAISE NOTICE 'Conferido: tecto_gozo_civil_dias com o CHECK de >= 30, e o trigger do tecto em BEFORE INSERT OR UPDATE.';
END;
$conferir$;
