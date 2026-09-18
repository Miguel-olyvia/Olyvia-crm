-- ==============================================================================
-- hr_ausencias_calcular_direito_admissao(): os dias de ferias de quem entrou a
-- meio do ano, e as duas datas que os acompanham.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- 20261121030000 escreveu, com todas as letras, que nao havia calculo
-- automatico: "a acumulacao mensal proporcional a admissao exige decisoes de
-- produto que nao estao tomadas". Estao tomadas agora, e sao tres.
--
-- Sem esta funcao, o direito de quem entra a meio do ano e uma conta feita a mao
-- numa folha de calculo e copiada para a base -- e as duas datas que a
-- acompanham (a partir de quando pode gozar, ate quando tem de gozar) nao sao
-- calculadas por ninguem.
--
--
-- -- AS TRES DECISOES, E A QUE MAIS CUSTA -------------------------------------
--
-- 1. DOIS DIAS POR MES COMPLETO, COM O TECTO DE 20. LEAST(20, 2 * meses).
--
-- 2. UM MES CONTA-SE COMPLETO MESMO QUE A ADMISSAO CAIA A MEIO DELE. E esta a
--    que mais custa, e por isso fica escrita aqui em vez de viver numa formula:
--    quem entra a 15 de Setembro conta SETEMBRO, e nao so a partir de Outubro.
--    Setembro + Outubro + Novembro + Dezembro = 4 meses = 8 dias.
--
--    A conta faz-se por diferenca de MESES DE CALENDARIO -- (ano*12 + mes) do
--    fim menos (ano*12 + mes) do inicio, mais um -- e NAO por AGE() nem por
--    divisao de dias. AGE('2026-12-31', '2026-09-15') da "3 mons 16 days", e
--    EXTRACT(month) disso da 3. Seria o resultado errado, e errado em silencio:
--    um dia de ferias a menos por cada admissao a meio do mes, que ninguem
--    encontra a olhar para o ecra.
--
-- 3. OS SEIS MESES CONTAM-SE DA ADMISSAO, EM MESES DE CALENDARIO --
--    data_admissao + interval '6 months'. Nao 180 dias. Para 31 de Agosto o
--    Postgres devolve 28 (ou 29) de Fevereiro, que e o que se quer: o ultimo dia
--    do mes, nao um dia do mes seguinte.
--
-- E daqui saem as duas datas:
--
--   disponivel_a_partir_de = data_admissao + 6 meses
--   prazo_limite_gozo      = 30 de Junho do ANO CIVIL SUBSEQUENTE ao ano da
--                            admissao (ano da admissao + 1, que e o ano em que
--                            se completam os seis meses), MAS SO quando os seis
--                            meses caem depois de 31 de Dezembro do ano da
--                            admissao. Caso contrario NULL -- o direito caduca
--                            no fim do ano civil, como sempre caducou.
--                            Art. 239.o/2 do CT: "ate 30 de Junho do ano civil
--                            subsequente". Admissao em 2026 da 30/06/2027 --
--                            nunca 30/06/2028.
--   periodo_inicio         = data_admissao
--   periodo_fim            = prazo_limite_gozo, ou 31 de Dezembro do ano da
--                            admissao quando nao ha prazo
--
-- Admissao a 15/09/2026: 4 meses, 8 dias, gozavel a partir de 15/03/2027, que e
-- depois de 31/12/2026 -- logo prazo 30/06/2027 e periodo 15/09/2026 a
-- 30/06/2027. Admissao a 15/01/2026: 12 meses, 20 dias (o tecto), gozavel a
-- partir de 15/07/2026, que ainda e dentro do ano -- logo sem prazo, periodo
-- 15/01/2026 a 31/12/2026.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - A funcao NAO escreve nada. Devolve uma linha; quem a chama e que decide se
--   insere um direito, e com que origem. Uma funcao que calculasse E escrevesse
--   nao poderia ser usada para mostrar o numero antes de o gravar.
-- - Nao ha suspensao do contrato, nem contagem de faltas, nem cessacao a meio.
--   Entra uma data de admissao e sai o direito do ano de admissao.
-- - Nao se toca em hr_ausencias_saldo(), em v_hr_ausencias_saldos, nem em
--   nenhuma linha ja existente de pessoas_ausencias_direitos.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP FUNCTION public.hr_ausencias_calcular_direito_admissao(date);
--
--
-- Prerequisitos:
--   20261201270000  as colunas disponivel_a_partir_de / prazo_limite_gozo /
--                   regra_calculo em pessoas_ausencias_direitos
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_ausencias_direitos'
       AND column_name = 'prazo_limite_gozo'
  ) THEN
    RAISE EXCEPTION
      'pessoas_ausencias_direitos nao tem prazo_limite_gozo. Aplicar 20261201270000 primeiro -- esta funcao existe para preencher essas colunas, e sem elas o resultado nao tem onde ser gravado.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_ausencias_calcular_direito_admissao'
  ) THEN
    RAISE NOTICE 'Ja aplicada: hr_ausencias_calcular_direito_admissao ja existe. CREATE OR REPLACE abaixo repoe-a.';
  END IF;
END;
$guardas$;

-- ---- A funcao --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_ausencias_calcular_direito_admissao(
  _data_admissao date
)
RETURNS TABLE (
  dias_direito           numeric,
  disponivel_a_partir_de date,
  prazo_limite_gozo      date,
  periodo_inicio         date,
  periodo_fim            date
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path TO 'public'
AS $$
  WITH base AS (
    SELECT
      _data_admissao AS admissao,
      make_date(EXTRACT(year FROM _data_admissao)::int, 12, 31) AS fim_ano_civil,
      (_data_admissao + interval '6 months')::date              AS disponivel
  ),
  conta AS (
    SELECT
      b.*,
      -- Meses de CALENDARIO, mais um. A admissao a meio do mes conta esse mes
      -- inteiro -- ver a decisao 2 no cabecalho. AGE() daria um a menos.
      (
        (EXTRACT(year FROM b.fim_ano_civil)::int * 12 + EXTRACT(month FROM b.fim_ano_civil)::int)
        - (EXTRACT(year FROM b.admissao)::int * 12 + EXTRACT(month FROM b.admissao)::int)
        + 1
      ) AS meses_completos,
      CASE
        WHEN b.disponivel > b.fim_ano_civil
          -- +1 e nao +2: art. 239.o/2 do CT da "30 de Junho do ano civil
          -- subsequente" ao da admissao. Admissao em 2026 -> 30/06/2027.
          THEN make_date(EXTRACT(year FROM b.admissao)::int + 1, 6, 30)
        ELSE NULL
      END AS prazo
    FROM base b
  )
  SELECT
    LEAST(20, 2 * c.meses_completos)::numeric AS dias_direito,
    c.disponivel                              AS disponivel_a_partir_de,
    c.prazo                                   AS prazo_limite_gozo,
    c.admissao                                AS periodo_inicio,
    coalesce(c.prazo, c.fim_ano_civil)        AS periodo_fim
  FROM conta c
  WHERE _data_admissao IS NOT NULL
$$;

REVOKE ALL ON FUNCTION public.hr_ausencias_calcular_direito_admissao(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_ausencias_calcular_direito_admissao(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_ausencias_calcular_direito_admissao(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_ausencias_calcular_direito_admissao(date) TO service_role;

COMMENT ON FUNCTION public.hr_ausencias_calcular_direito_admissao(date) IS
'O direito de ferias do ANO DE ADMISSAO: dois dias por mes completo, com tecto de 20, mais as duas datas que o acompanham (a partir de quando pode ser gozado, e ate quando, quando transita).

UM MES CONTA-SE COMPLETO MESMO QUE A ADMISSAO CAIA A MEIO DELE: quem entra a 15 de Setembro conta Setembro. A conta faz-se por diferenca de meses de calendario, e NAO por AGE() -- AGE(31/12, 15/09) daria 3 meses e a resposta certa e 4. O erro seria de um dia de ferias por cada admissao a meio do mes, e silencioso.

prazo_limite_gozo so existe quando os seis meses caem DEPOIS de 31 de Dezembro do ano da admissao: nesse caso o direito nao caduca com o ano civil, transita, e tem de ser gozado ate 30 DE JUNHO DO ANO CIVIL SUBSEQUENTE AO ANO DA ADMISSAO -- ano da admissao + 1, que e o ano em que se completam os seis meses. Admissao a 15/09/2026 da prazo 30/06/2027, e nunca 30/06/2028. E a data do art. 239.o/2 do CT, "ate 30 de Junho do ano civil subsequente", sem margem para ler "+2". Caso contrario e NULL e tudo se passa como sempre.

NAO ESCREVE NADA. Devolve uma linha; quem chama decide se a grava, e com que origem. Uma funcao que calculasse e escrevesse nao serviria para mostrar o numero antes de o gravar.

SECURITY INVOKER e sem acesso a tabela nenhuma: e aritmetica de datas, nao ha linhas para esconder nem para expor.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_vol char;
  v_sec boolean;
  r     record;
BEGIN
  SELECT p.provolatile, p.prosecdef INTO v_vol, v_sec
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'hr_ausencias_calcular_direito_admissao'
     AND p.pronargs = 1;

  IF v_vol IS NULL THEN
    RAISE EXCEPTION 'hr_ausencias_calcular_direito_admissao(date) nao ficou criada.';
  END IF;
  IF v_vol <> 's' THEN
    RAISE EXCEPTION 'hr_ausencias_calcular_direito_admissao nao e STABLE (volatilidade "%").', v_vol;
  END IF;
  IF v_sec IS DISTINCT FROM false THEN
    RAISE EXCEPTION
      'hr_ausencias_calcular_direito_admissao ficou SECURITY DEFINER. Nao le tabela nenhuma; DEFINER aqui so acrescentaria superficie sem comprar nada.';
  END IF;
  IF has_function_privilege('anon', 'public.hr_ausencias_calcular_direito_admissao(date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon consegue executar hr_ausencias_calcular_direito_admissao. O REVOKE nao pegou.';
  END IF;

  -- ---- O teste concreto que a decisao 2 exige. Nao precisa de dados nem de
  -- subtransaccao: a funcao nao le nem escreve nada.

  -- Caso 1: 15 de Setembro. E ESTE o caso que distingue a convencao escolhida
  -- de AGE(): tem de dar 4 meses = 8 dias, nunca 3 meses = 6 dias.
  SELECT * INTO r FROM public.hr_ausencias_calcular_direito_admissao(DATE '2026-09-15');
  IF r.dias_direito <> 8 THEN
    RAISE EXCEPTION
      'Admissao a 15/09/2026 devia dar 8 dias (Set+Out+Nov+Dez = 4 meses x 2), e deu %. A conta esta a descartar o mes da admissao -- e o erro de AGE().',
      r.dias_direito;
  END IF;
  IF r.disponivel_a_partir_de <> DATE '2027-03-15' THEN
    RAISE EXCEPTION 'Admissao a 15/09/2026 devia ficar gozavel a 15/03/2027, e ficou a %.', r.disponivel_a_partir_de;
  END IF;
  IF r.prazo_limite_gozo <> DATE '2027-06-30' THEN
    RAISE EXCEPTION
      'Admissao a 15/09/2026: os seis meses caem em 2027, depois do fim do ano civil, logo o direito TRANSITA e o prazo devia ser 30/06/2027 -- 30 de Junho do ano civil SUBSEQUENTE ao da admissao (art. 239.o/2), e nao 30/06/2028. Ficou %.',
      r.prazo_limite_gozo;
  END IF;
  IF r.periodo_inicio <> DATE '2026-09-15' OR r.periodo_fim <> DATE '2027-06-30' THEN
    RAISE EXCEPTION 'Admissao a 15/09/2026: periodo devia ser 15/09/2026 a 30/06/2027, e saiu % a %.', r.periodo_inicio, r.periodo_fim;
  END IF;

  -- Caso 2: 1 de Setembro, o mesmo mes mas no primeiro dia. Tem de dar o MESMO
  -- numero de dias que o caso 1 -- se der 8 num e 6 no outro, a convencao nao
  -- ficou implementada, ficou meia implementada.
  SELECT * INTO r FROM public.hr_ausencias_calcular_direito_admissao(DATE '2026-09-01');
  IF r.dias_direito <> 8 THEN
    RAISE EXCEPTION 'Admissao a 01/09/2026 devia dar os mesmos 8 dias da admissao a 15/09/2026, e deu %.', r.dias_direito;
  END IF;

  -- Caso 3: 15 de Janeiro. 12 meses x 2 = 24, cortado pelo TECTO de 20. Os seis
  -- meses caem em Julho, dentro do ano: sem prazo, e periodo a fechar em 31/12.
  SELECT * INTO r FROM public.hr_ausencias_calcular_direito_admissao(DATE '2026-01-15');
  IF r.dias_direito <> 20 THEN
    RAISE EXCEPTION 'Admissao a 15/01/2026 devia dar 20 dias (o tecto, e nao 24), e deu %.', r.dias_direito;
  END IF;
  IF r.prazo_limite_gozo IS NOT NULL THEN
    RAISE EXCEPTION
      'Admissao a 15/01/2026: os seis meses caem em 15/07/2026, dentro do ano civil -- o direito NAO transita e o prazo devia ser NULL. Ficou %.',
      r.prazo_limite_gozo;
  END IF;
  IF r.periodo_fim <> DATE '2026-12-31' THEN
    RAISE EXCEPTION 'Admissao a 15/01/2026: sem prazo, o periodo devia fechar a 31/12/2026, e fechou a %.', r.periodo_fim;
  END IF;

  -- Caso 4: 1 de Dezembro, o extremo. Um unico mes = 2 dias, e os seis meses
  -- caem em Junho do ano seguinte -- logo transita.
  SELECT * INTO r FROM public.hr_ausencias_calcular_direito_admissao(DATE '2026-12-01');
  IF r.dias_direito <> 2 THEN
    RAISE EXCEPTION 'Admissao a 01/12/2026 devia dar 2 dias (so Dezembro), e deu %.', r.dias_direito;
  END IF;
  IF r.prazo_limite_gozo <> DATE '2027-06-30' THEN
    RAISE EXCEPTION 'Admissao a 01/12/2026 devia transitar com prazo 30/06/2027 (ano civil subsequente ao da admissao), e ficou %.', r.prazo_limite_gozo;
  END IF;

  -- Caso 5: 1 de Julho. Os seis meses caem exactamente a 01/01/2027, DEPOIS de
  -- 31/12 -- e a fronteira, e transita. O mes a seguir (Junho) e o que nao
  -- transita, e esta no caso 6.
  SELECT * INTO r FROM public.hr_ausencias_calcular_direito_admissao(DATE '2026-07-01');
  IF r.prazo_limite_gozo <> DATE '2027-06-30' THEN
    RAISE EXCEPTION
      'Admissao a 01/07/2026: os seis meses caem a 01/01/2027, ja fora do ano civil, e o direito devia transitar com prazo 30/06/2027. Prazo ficou %.',
      r.prazo_limite_gozo;
  END IF;

  -- Caso 6: 30 de Junho. Os seis meses caem a 30/12/2026, AINDA dentro do ano
  -- -- nao transita. Os casos 5 e 6 juntos provam que a fronteira esta no sitio
  -- certo, e nao um mes ao lado.
  SELECT * INTO r FROM public.hr_ausencias_calcular_direito_admissao(DATE '2026-06-30');
  IF r.prazo_limite_gozo IS NOT NULL THEN
    RAISE EXCEPTION
      'Admissao a 30/06/2026: os seis meses caem a 30/12/2026, ainda dentro do ano civil -- nao devia transitar. Prazo ficou %.',
      r.prazo_limite_gozo;
  END IF;

  -- Caso 7: uma admissao nula nao devolve linha nenhuma, em vez de devolver
  -- uma linha de NULLs que quem chama gravaria sem dar por isso.
  IF EXISTS (SELECT 1 FROM public.hr_ausencias_calcular_direito_admissao(NULL)) THEN
    RAISE EXCEPTION 'hr_ausencias_calcular_direito_admissao(NULL) devolveu uma linha. Devia devolver o conjunto vazio.';
  END IF;

  RAISE NOTICE 'Conferido: 15/Set da 8 dias (4 meses, nao 3), o tecto de 20 corta, e a fronteira do prazo de gozo esta entre 30/Jun e 01/Jul.';
END;
$conferir$;
