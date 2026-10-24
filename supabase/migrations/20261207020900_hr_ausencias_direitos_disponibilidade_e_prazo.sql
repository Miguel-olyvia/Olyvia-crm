-- ==============================================================================
-- Tres colunas novas em pessoas_ausencias_direitos: QUANDO o direito fica
-- gozavel, ATE QUANDO tem de ser gozado, e DE ONDE veio o numero.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- Uma linha de direito diz hoje quantos dias ha e a que periodo pertencem, e
-- nao diz duas coisas que a lei impoe a quem entrou a meio do ano:
--
--   1. O direito do ano de admissao SO PODE SER GOZADO apos seis meses de
--      execucao do contrato. Hoje a base deixa marcar ferias no primeiro mes e
--      nao ha nada a dizer que nao se podia.
--   2. Quando esses seis meses caem ja depois de 31 de Dezembro, o direito NAO
--      caduca no fim do ano civil -- transita, e tem de ser gozado ate 30 de
--      Junho do ano seguinte a esse. Hoje o periodo do direito e o unico prazo
--      que existe, e nao sabe distinguir os dois casos.
--
-- Sem estas duas datas, o ecra nao consegue dizer "tem 8 dias, mas so a partir
-- de 15 de Marco, e tem de os gozar ate 30 de Junho" -- e e exactamente essa a
-- frase que falta a quem entra a meio do ano.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Tres colunas, TODAS NULLABLE, e e isso que faz esta migracao nao partir nada:
-- todas as linhas que ja existem ficam com NULL nas tres, e NULL significa
-- exactamente o que significava antes de elas existirem -- sem restricao de
-- data, sem prazo alem do periodo, e numero posto a mao.
--
--   disponivel_a_partir_de  date  -- NULL = gozavel desde o inicio do periodo
--   prazo_limite_gozo       date  -- NULL = caduca no fim do periodo, como ate aqui
--   regra_calculo           text  -- NULL = entrada manual, como hoje
--
-- regra_calculo e um CHECK fechado e nao texto livre, com um unico valor por
-- agora ('admissao_proporcional'). E a marca de que o numero veio de
-- hr_ausencias_calcular_direito_admissao() e nao de alguem a escreve-lo. A
-- distincao interessa: um numero recalculavel pode ser reposto quando a data de
-- admissao e corrigida; um numero posto a mao nunca deve ser reescrito por uma
-- rotina.
--
-- Nao se confunda com origem, que ja existe: origem diz de QUE AUTORIDADE vem o
-- direito (legal / contrato / manual / importacao) e regra_calculo diz por QUE
-- CONTA se chegou ao numero. Uma linha calculada a partir da admissao e
-- origem='legal' E regra_calculo='admissao_proporcional' -- as duas coisas.
--
-- Um CHECK de coerencia, e so um: prazo_limite_gozo, quando existe, tem de ser
-- posterior ao periodo_inicio. Nao se exige que seja posterior ao periodo_fim,
-- nem que disponivel_a_partir_de caia dentro do periodo -- os dois seriam
-- verdade no caso normal e falsos no caso que justifica as colunas (o direito
-- que transita, e cujo prazo esta FORA do ano civil da admissao).
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Nao ha preenchimento retroactivo de nenhuma linha existente. Quem quiser as
--   datas nas fichas antigas chama a funcao de 20261201290000 e escreve-as; esta
--   migracao nao adivinha admissoes.
-- - Nao ha trigger a IMPOR disponivel_a_partir_de na marcacao de ferias. Isso e
--   uma recusa de pedido, e uma recusa exige decisao de produto sobre o que
--   acontece a quem ja marcou. As colunas existem primeiro; a guarda, se vier,
--   vem depois e por cima delas.
-- - Nao se toca em hr_ausencias_saldo() nem em v_hr_ausencias_saldos.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   ALTER TABLE public.pessoas_ausencias_direitos
--     DROP COLUMN disponivel_a_partir_de,
--     DROP COLUMN prazo_limite_gozo,
--     DROP COLUMN regra_calculo;
--
--
-- Prerequisitos:
--   20261121030000  pessoas_ausencias_direitos
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas_ausencias_direitos') IS NULL THEN
    RAISE EXCEPTION
      'public.pessoas_ausencias_direitos nao existe. Aplicar 20261121030000 primeiro.';
  END IF;

  -- "Ja aplicada": as tres colunas juntas. Meia aplicacao nao existe -- o
  -- ALTER TABLE abaixo e uma so instrucao.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_ausencias_direitos'
       AND column_name = 'regra_calculo'
  ) THEN
    RAISE NOTICE 'Ja aplicada: pessoas_ausencias_direitos ja tem regra_calculo. A migracao segue por ser idempotente.';
  END IF;
END;
$guardas$;

-- ---- As colunas ------------------------------------------------------------
ALTER TABLE public.pessoas_ausencias_direitos
  ADD COLUMN IF NOT EXISTS disponivel_a_partir_de date,
  ADD COLUMN IF NOT EXISTS prazo_limite_gozo      date,
  ADD COLUMN IF NOT EXISTS regra_calculo          text;

-- CHECK fechado, e nao texto livre: regra_calculo e lido por codigo que decide
-- se pode ou nao recalcular a linha. Um valor com um erro de escrita passaria a
-- ser tratado como "posto a mao" e a linha deixava de ser reposta em silencio.
DO $checks$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_ausencias_direitos_regra_calculo_valida'
       AND conrelid = to_regclass('public.pessoas_ausencias_direitos')
  ) THEN
    ALTER TABLE public.pessoas_ausencias_direitos
      ADD CONSTRAINT pessoas_ausencias_direitos_regra_calculo_valida
      CHECK (regra_calculo IS NULL OR regra_calculo IN ('admissao_proporcional'));
  END IF;

  -- So esta coerencia, e deliberadamente so esta. Ver o cabecalho: exigir que o
  -- prazo caia depois do periodo_fim rejeitaria precisamente o caso que as
  -- colunas existem para representar.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_ausencias_direitos_prazo_depois_do_inicio'
       AND conrelid = to_regclass('public.pessoas_ausencias_direitos')
  ) THEN
    ALTER TABLE public.pessoas_ausencias_direitos
      ADD CONSTRAINT pessoas_ausencias_direitos_prazo_depois_do_inicio
      CHECK (prazo_limite_gozo IS NULL OR prazo_limite_gozo > periodo_inicio);
  END IF;
END;
$checks$;

COMMENT ON COLUMN public.pessoas_ausencias_direitos.disponivel_a_partir_de IS
'A data a partir da qual estes dias podem SER GOZADOS. NULL = gozaveis desde o inicio do periodo, que e o comportamento de todas as linhas anteriores a esta coluna.

Existe por causa dos seis meses de execucao do contrato que a lei exige antes do gozo do direito do ano de admissao. NAO ha, nesta ronda, trigger a recusar um pedido marcado antes desta data: a coluna informa o ecra, a recusa e uma decisao de produto por tomar.';

COMMENT ON COLUMN public.pessoas_ausencias_direitos.prazo_limite_gozo IS
'A data limite de gozo quando o direito TRANSITA para o ano seguinte. NULL = caduca no fim do periodo, como ate aqui.

So fica preenchida quando os seis meses caem depois de 31 de Dezembro do ano de admissao -- caso em que o direito nao morre com o ano civil e tem de ser gozado ate 30 de Junho do ano civil subsequente AO ANO DA ADMISSAO (admissao+1), por forca do artigo 239.o/2 do Codigo do Trabalho. Admissao em 2026 da 30/06/2027 -- nunca 30/06/2028.';

COMMENT ON COLUMN public.pessoas_ausencias_direitos.regra_calculo IS
'Por que CONTA se chegou a dias_direito. NULL = entrada manual, como todas as linhas anteriores. admissao_proporcional = veio de hr_ausencias_calcular_direito_admissao().

Nao se confunde com origem, que diz de que AUTORIDADE vem o direito. Uma linha calculada a partir da admissao e origem=legal E regra_calculo=admissao_proporcional. A distincao decide se uma rotina pode repor o numero quando a data de admissao e corrigida: um numero posto a mao nunca se reescreve.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_n         integer;
  v_nullable  integer;
  v_bloqueado boolean;
  v_org_id    uuid;
  v_pessoa_id uuid;
  v_tipo_id   uuid;
  v_direito   uuid;
BEGIN
  SELECT count(*) INTO v_n
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'pessoas_ausencias_direitos'
     AND column_name IN ('disponivel_a_partir_de','prazo_limite_gozo','regra_calculo');

  IF v_n <> 3 THEN
    RAISE EXCEPTION 'Esperavam-se as 3 colunas novas em pessoas_ausencias_direitos, encontraram-se %.', v_n;
  END IF;

  -- TODAS nullable: e o que garante que as linhas ja existentes continuam
  -- validas. Uma delas NOT NULL teria feito o ALTER TABLE falhar, ou -- pior --
  -- passar com um DEFAULT inventado.
  SELECT count(*) INTO v_nullable
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'pessoas_ausencias_direitos'
     AND column_name IN ('disponivel_a_partir_de','prazo_limite_gozo','regra_calculo')
     AND is_nullable = 'YES';

  IF v_nullable <> 3 THEN
    RAISE EXCEPTION
      'Alguma das 3 colunas novas nao ficou nullable. As linhas de direito ja existentes nao tem estas datas e tem de continuar validas.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_ausencias_direitos_regra_calculo_valida'
       AND conrelid = to_regclass('public.pessoas_ausencias_direitos')
  ) THEN
    RAISE EXCEPTION 'O CHECK de regra_calculo nao ficou criado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_ausencias_direitos_prazo_depois_do_inicio'
       AND conrelid = to_regclass('public.pessoas_ausencias_direitos')
  ) THEN
    RAISE EXCEPTION 'O CHECK de coerencia do prazo nao ficou criado.';
  END IF;

  -- ---- Exercicio vivo, com dados descartaveis revertidos por ROLLBACK da
  -- subtransaccao (nao por DELETE manual).
  BEGIN
    INSERT INTO public.anew_organizations (name)
    VALUES ('__conferir_20261201270000__')
    RETURNING id INTO v_org_id;

    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido)
    VALUES (v_org_id, 'Conferir', 'Direitos')
    RETURNING id INTO v_pessoa_id;

    INSERT INTO public.hr_ausencias_tipos (organization_id, codigo, nome, categoria)
    VALUES (v_org_id, 'FER', 'Ferias', 'ferias')
    RETURNING id INTO v_tipo_id;

    -- Caso 1: uma linha SEM nenhuma das colunas novas continua a entrar. E a
    -- prova de que esta migracao nao parte o caminho de escrita existente.
    INSERT INTO public.pessoas_ausencias_direitos
      (pessoa_id, organization_id, tipo_id, periodo_inicio, periodo_fim, dias_direito)
    VALUES
      (v_pessoa_id, v_org_id, v_tipo_id, DATE '2026-01-01', DATE '2026-12-31', 22)
    RETURNING id INTO v_direito;

    IF (SELECT regra_calculo FROM public.pessoas_ausencias_direitos WHERE id = v_direito) IS NOT NULL THEN
      RAISE EXCEPTION 'regra_calculo nasceu com valor numa linha que nao o pediu -- alguem lhe pos um DEFAULT.';
    END IF;

    -- Caso 2: o caso que justifica as colunas -- direito de admissao a meio do
    -- ano, gozavel so a partir de Marco, com prazo FORA do ano civil e portanto
    -- DEPOIS do periodo_fim que uma leitura apressada teria imposto.
    INSERT INTO public.pessoas_ausencias_direitos
      (pessoa_id, organization_id, tipo_id, periodo_inicio, periodo_fim, dias_direito,
       origem, disponivel_a_partir_de, prazo_limite_gozo, regra_calculo)
    VALUES
      (v_pessoa_id, v_org_id, v_tipo_id, DATE '2026-09-15', DATE '2027-06-30', 8,
       'legal', DATE '2027-03-15', DATE '2027-06-30', 'admissao_proporcional');

    -- Caso 3: um valor de regra_calculo fora do catalogo tem de ser RECUSADO.
    -- Sem o CHECK, um erro de escrita passava a significar "posto a mao" e a
    -- linha deixava de poder ser reposta, em silencio.
    v_bloqueado := false;
    BEGIN
      INSERT INTO public.pessoas_ausencias_direitos
        (pessoa_id, organization_id, tipo_id, periodo_inicio, periodo_fim, dias_direito, regra_calculo)
      VALUES
        (v_pessoa_id, v_org_id, v_tipo_id, DATE '2029-01-01', DATE '2029-12-31', 22, 'admissao proporcional');

      RAISE EXCEPTION 'pessoas_ausencias_direitos aceitou um regra_calculo fora do catalogo.';
    EXCEPTION
      WHEN check_violation THEN
        v_bloqueado := true;
    END;
    IF NOT v_bloqueado THEN
      RAISE EXCEPTION 'O CHECK de regra_calculo nao disparou como esperado (caso 3).';
    END IF;

    -- Caso 4: um prazo ANTERIOR ao inicio do periodo nao faz sentido nenhum e
    -- tem de ser recusado.
    v_bloqueado := false;
    BEGIN
      INSERT INTO public.pessoas_ausencias_direitos
        (pessoa_id, organization_id, tipo_id, periodo_inicio, periodo_fim, dias_direito, prazo_limite_gozo)
      VALUES
        (v_pessoa_id, v_org_id, v_tipo_id, DATE '2030-01-01', DATE '2030-12-31', 22, DATE '2029-06-30');

      RAISE EXCEPTION 'pessoas_ausencias_direitos aceitou um prazo de gozo anterior ao inicio do periodo.';
    EXCEPTION
      WHEN check_violation THEN
        v_bloqueado := true;
    END;
    IF NOT v_bloqueado THEN
      RAISE EXCEPTION 'O CHECK de coerencia do prazo nao disparou como esperado (caso 4).';
    END IF;

    -- Sucesso: levanta sempre, com ERRCODE proprio -- nunca P0001, que e o
    -- SQLSTATE de qualquer RAISE EXCEPTION simples, incluindo os dos casos
    -- acima. O ROLLBACK desta subtransaccao desfaz tudo.
    RAISE EXCEPTION 'conferir_20261201270000_ok' USING ERRCODE = 'CF010';
  EXCEPTION
    WHEN SQLSTATE 'CF010' THEN
      RAISE NOTICE 'OK: as tres colunas aceitam NULL, aceitam o caso da admissao a meio do ano com prazo fora do ano civil, e recusam regra_calculo fora do catalogo e prazo anterior ao periodo -- exercitado com dados descartaveis revertidos por ROLLBACK.';
    WHEN OTHERS THEN
      RAISE;
  END;

  RAISE NOTICE 'Conferido: pessoas_ausencias_direitos com disponivel_a_partir_de, prazo_limite_gozo e regra_calculo, todas nullable e com os dois CHECKs.';
END;
$conferir$;
