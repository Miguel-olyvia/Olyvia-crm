-- ==============================================================================
-- v_hr_ausencias_direito_completo: o direito, o saldo e o subsidio numa linha.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- Depois de 20261201270000 e 20261201280000, o que uma pessoa tem direito vive
-- em tres sitios: a linha de direito (dias, e as duas datas novas), o contador
-- calculado (v_hr_ausencias_saldos) e o subsidio (pessoas_ausencias_subsidios).
--
-- O ecra precisa dos tres ao mesmo tempo, e a alternativa a esta vista e cada
-- ecra fazer os seus tres pedidos e juntar-los em JavaScript -- com a chave de
-- juncao (pessoa, organizacao, tipo, periodo_inicio) escrita a mao em cada um.
-- Escrita a mao quatro vezes, uma delas fica com tres colunas em vez de quatro,
-- e mistura o direito de uma pessoa com o saldo de outra.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Uma vista, e nada mais. Nao ha tabela nova, nao ha coluna nova, e -- isto e o
-- importante -- NAO SE TOCA em hr_ausencias_saldo() nem em v_hr_ausencias_saldos.
-- O saldo continua calculado no sitio onde ja estava calculado; esta vista
-- limita-se a junta-lo ao direito e ao subsidio.
--
-- Parte-se de pessoas_ausencias_direitos e nao da uniao das origens, ao
-- contrario de v_hr_ausencias_saldos: aqui a unidade e O DIREITO. Um periodo com
-- gozo e sem direito nenhum nao tem "direito completo" para mostrar -- aparece
-- em v_hr_ausencias_saldos, que e a vista que existe para o apanhar.
--
-- LEFT JOIN nos dois lados, e deliberado: ha direitos sem um unico dia gozado (e
-- o saldo vem por LATERAL de qualquer forma), e ha direitos sem subsidio nenhum
-- -- a maioria, porque so os de ferias tem. Um INNER JOIN no subsidio escondia
-- todos os direitos que nao sao de ferias.
--
-- disponivel_para_gozo_agora e a coluna calculada que poupa a cada ecra repetir
-- a mesma comparacao: disponivel_a_partir_de IS NULL OR <= CURRENT_DATE. NULL
-- significa "sem restricao", que e o que significa em todas as linhas anteriores
-- a 20261201270000.
--
-- security_invoker=true, como v_hr_ausencias_saldos: sem isso a vista corre com
-- os direitos do dono e torna-se uma porta lateral para os direitos, os saldos e
-- agora tambem os MONTANTES de pessoas de outras organizacoes. A RLS das tabelas
-- por baixo e que decide quem ve o que, e nao ha uma linha de codigo aqui a
-- tomar essa decisao.
--
-- LISTA DE COLUNAS EXPLICITA e nunca SELECT *: uma vista com SELECT * arrasta-se
-- para migracoes que nao lhe tocam -- uma coluna nova na tabela obriga a mexer
-- na vista, e largar uma coluna rebenta a meio de um push.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Nao ha filtro por deleted_at do subsidio dentro do agregado que nao seja o
--   obvio: os subsidios apagados nao entram. Os direitos apagados tambem nao.
-- - Nao se agrega por pessoa nem por ano: uma linha = um direito. Quem quiser o
--   total do ano soma-o em cima disto.
-- - Nao ha coluna de "quanto falta pagar" -- e montante_devido - montante_pago,
--   e uma subtraccao nao precisa de ficar gravada num sitio a mais.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP VIEW public.v_hr_ausencias_direito_completo;
--
--
-- Prerequisitos:
--   20261201270000  as tres colunas novas em pessoas_ausencias_direitos
--   20261201280000  pessoas_ausencias_subsidios
--   20261121100000  v_hr_ausencias_saldos
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_ausencias_direitos'
       AND column_name = 'disponivel_a_partir_de'
  ) THEN
    RAISE EXCEPTION
      'pessoas_ausencias_direitos nao tem disponivel_a_partir_de. Aplicar 20261201270000 primeiro -- a vista mostra essas colunas e sem elas nao compila.';
  END IF;

  IF to_regclass('public.pessoas_ausencias_subsidios') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_ausencias_subsidios nao existe. Aplicar 20261201280000 primeiro.';
  END IF;

  IF to_regclass('public.v_hr_ausencias_saldos') IS NULL THEN
    RAISE EXCEPTION 'A vista v_hr_ausencias_saldos nao existe. Aplicar 20261121100000 primeiro.';
  END IF;

  IF to_regclass('public.v_hr_ausencias_direito_completo') IS NOT NULL THEN
    RAISE NOTICE 'Ja aplicada: v_hr_ausencias_direito_completo ja existe. CREATE OR REPLACE abaixo repoe-a.';
  END IF;
END;
$guardas$;

-- ---- A vista ---------------------------------------------------------------
-- CREATE OR REPLACE e nao DROP + CREATE: um DROP perderia security_invoker, os
-- GRANT e os comentarios se algum deles nao fosse reaplicado a mao logo a
-- seguir, e e assim que uma vista volta a correr com os direitos do dono.
CREATE OR REPLACE VIEW public.v_hr_ausencias_direito_completo
WITH (security_invoker = true) AS
SELECT
  d.id                       AS direito_id,
  d.pessoa_id,
  d.organization_id,
  d.tipo_id,
  d.vinculo_id,
  d.periodo_inicio,
  d.periodo_fim,
  d.dias_direito,
  d.minutos_direito,
  d.origem,

  -- As tres de 20261201270000.
  d.disponivel_a_partir_de,
  d.prazo_limite_gozo,
  d.regra_calculo,

  -- A pergunta que cada ecra faria a mao, feita uma vez. NULL = sem restricao,
  -- que e o que significa em todas as linhas anteriores a 20261201270000.
  (d.disponivel_a_partir_de IS NULL OR d.disponivel_a_partir_de <= CURRENT_DATE)
                             AS disponivel_para_gozo_agora,

  -- O contador, tal como v_hr_ausencias_saldos o calcula. Nao se recalcula nada
  -- aqui, e nao se toca em hr_ausencias_saldo().
  s.adquiridos,
  s.ajustes,
  s.utilizados,
  s.pendentes,
  s.disponiveis,

  -- O subsidio. NULL quando nao ha -- que e a maioria dos direitos, porque so
  -- os de ferias tem subsidio.
  sub.id                     AS subsidio_id,
  sub.base_calculo           AS subsidio_base_calculo,
  sub.montante_devido        AS subsidio_montante_devido,
  sub.montante_pago          AS subsidio_montante_pago,
  sub.regime_pagamento       AS subsidio_regime_pagamento,
  sub.proporcional           AS subsidio_proporcional,
  sub.pago_em                AS subsidio_pago_em,
  sub.lancamento_id          AS subsidio_lancamento_id,

  d.notas,
  d.created_at,
  d.updated_at
FROM public.pessoas_ausencias_direitos d
LEFT JOIN public.v_hr_ausencias_saldos s
       ON s.pessoa_id       = d.pessoa_id
      AND s.organization_id = d.organization_id
      AND s.tipo_id         = d.tipo_id
      AND s.periodo_inicio  = d.periodo_inicio
-- O indice unico parcial uq_pessoas_ausencias_subsidios_direito garante que
-- este LEFT JOIN nunca duplica a linha do direito: ha no maximo um subsidio
-- vivo por direito. Sem esse indice, isto teria de ser um agregado.
LEFT JOIN public.pessoas_ausencias_subsidios sub
       ON sub.direito_id      = d.id
      AND sub.pessoa_id       = d.pessoa_id
      AND sub.organization_id = d.organization_id
      AND sub.deleted_at IS NULL
WHERE d.deleted_at IS NULL;

REVOKE ALL ON public.v_hr_ausencias_direito_completo FROM anon;
GRANT SELECT ON public.v_hr_ausencias_direito_completo TO authenticated;
GRANT SELECT ON public.v_hr_ausencias_direito_completo TO service_role;

COMMENT ON VIEW public.v_hr_ausencias_direito_completo IS
'O direito de ausencia com o saldo calculado e o subsidio ao lado, uma linha por direito. Existe para o ecra nao ter de fazer tres pedidos e junta-los a mao pela chave (pessoa, organizacao, tipo, periodo_inicio) -- escrita a mao em varios sitios, um deles fica com tres colunas em vez de quatro e mistura o direito de uma pessoa com o saldo de outra.

NAO TOCA em hr_ausencias_saldo() nem em v_hr_ausencias_saldos: o saldo continua calculado onde sempre esteve, e esta vista so o traz.

Parte dos DIREITOS e nao da uniao das origens, ao contrario de v_hr_ausencias_saldos: aqui a unidade e o direito, e um periodo com gozo e sem direito nenhum nao tem direito completo para mostrar -- esse caso e o que v_hr_ausencias_saldos existe para apanhar.

LEFT JOIN no subsidio: so os direitos de ferias tem subsidio, e um INNER JOIN escondia todos os outros. Nunca duplica, porque ha no maximo um subsidio vivo por direito (uq_pessoas_ausencias_subsidios_direito).

security_invoker=true: sem isso corria com os direitos do dono e era uma porta lateral para os direitos, os saldos e os MONTANTES de pessoas de outras organizacoes. Lista de colunas explicita e nunca SELECT *: uma coluna nova na tabela nao obriga a mexer aqui, e largar uma nao rebenta a meio de um push.';

COMMENT ON COLUMN public.v_hr_ausencias_direito_completo.disponivel_para_gozo_agora IS
'disponivel_a_partir_de IS NULL OR <= CURRENT_DATE. NULL na coluna de origem significa "sem restricao", que e o que significa em todas as linhas anteriores a 20261201270000 -- por isso NULL da true, e nao false.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_kind      char;
  v_opts      text;
  v_org_id    uuid;
  v_pessoa_id uuid;
  v_tipo_id   uuid;
  v_dir_a     uuid;
  v_dir_b     uuid;
  v_conta     integer;
  r           record;
BEGIN
  IF to_regclass('public.v_hr_ausencias_direito_completo') IS NULL THEN
    RAISE EXCEPTION 'A vista v_hr_ausencias_direito_completo nao ficou criada.';
  END IF;

  SELECT c.relkind, coalesce(array_to_string(c.reloptions, ','), '')
    INTO v_kind, v_opts
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'v_hr_ausencias_direito_completo';

  IF v_kind <> 'v' THEN
    RAISE EXCEPTION 'v_hr_ausencias_direito_completo nao e uma vista (relkind "%").', v_kind;
  END IF;

  IF v_opts NOT LIKE '%security_invoker=true%' THEN
    RAISE EXCEPTION
      'v_hr_ausencias_direito_completo ficou sem security_invoker=true. Assim corre com os direitos do dono e e uma porta lateral para os direitos, saldos e montantes de outras organizacoes. Opcoes actuais: "%"', v_opts;
  END IF;

  IF has_table_privilege('anon', 'public.v_hr_ausencias_direito_completo', 'SELECT') THEN
    RAISE EXCEPTION 'anon consegue ler v_hr_ausencias_direito_completo. O REVOKE nao pegou.';
  END IF;

  -- As tres colunas novas e a calculada tem mesmo de estar la.
  IF (
    SELECT count(*) FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'v_hr_ausencias_direito_completo'
       AND column_name IN ('disponivel_a_partir_de','prazo_limite_gozo','regra_calculo',
                           'disponivel_para_gozo_agora','subsidio_montante_devido',
                           'subsidio_montante_pago','disponiveis')
  ) <> 7 THEN
    RAISE EXCEPTION 'A vista nao tem as colunas de disponibilidade, prazo, regra, saldo e subsidio todas.';
  END IF;

  -- E o saldo NAO pode ter ganho uma coluna materializada pelo caminho.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name LIKE 'pessoas_ausencias%'
       AND column_name IN ('dias_disponiveis','saldo','saldo_dias','dias_saldo')
  ) THEN
    RAISE EXCEPTION
      'Alguma tabela de ausencias ganhou uma coluna de saldo materializado. O saldo e calculado.';
  END IF;

  -- ---- Exercicio vivo, revertido por ROLLBACK da subtransaccao.
  BEGIN
    INSERT INTO public.anew_organizations (name)
    VALUES ('__conferir_20261201320000__') RETURNING id INTO v_org_id;

    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido)
    VALUES (v_org_id, 'Conferir', 'Completo') RETURNING id INTO v_pessoa_id;

    INSERT INTO public.hr_ausencias_tipos (organization_id, codigo, nome, categoria)
    VALUES (v_org_id, 'FER', 'Ferias', 'ferias') RETURNING id INTO v_tipo_id;

    -- Direito A: com subsidio, gozavel so a partir do futuro.
    INSERT INTO public.pessoas_ausencias_direitos
      (pessoa_id, organization_id, tipo_id, periodo_inicio, periodo_fim, dias_direito,
       origem, disponivel_a_partir_de, prazo_limite_gozo, regra_calculo)
    VALUES
      (v_pessoa_id, v_org_id, v_tipo_id, DATE '2030-09-15', DATE '2032-06-30', 8,
       'legal', DATE '2031-03-15', DATE '2032-06-30', 'admissao_proporcional')
    RETURNING id INTO v_dir_a;

    INSERT INTO public.pessoas_ausencias_subsidios
      (pessoa_id, organization_id, direito_id, base_calculo, montante_devido, montante_pago,
       regime_pagamento, proporcional)
    VALUES
      (v_pessoa_id, v_org_id, v_dir_a, 1000.00, 400.00, 150.00, 'duodecimos', true);

    -- Direito B: SEM subsidio nenhum e SEM datas -- o caso da maioria.
    INSERT INTO public.pessoas_ausencias_direitos
      (pessoa_id, organization_id, tipo_id, periodo_inicio, periodo_fim, dias_direito)
    VALUES
      (v_pessoa_id, v_org_id, v_tipo_id, DATE '2033-01-01', DATE '2033-12-31', 22)
    RETURNING id INTO v_dir_b;

    -- Caso 1: os DOIS direitos aparecem, e cada um uma so vez. Um INNER JOIN no
    -- subsidio teria escondido o B; um join mal fechado teria duplicado o A.
    SELECT count(*) INTO v_conta
      FROM public.v_hr_ausencias_direito_completo
     WHERE pessoa_id = v_pessoa_id;
    IF v_conta <> 2 THEN
      RAISE EXCEPTION
        'A vista devolveu % linhas para dois direitos. Ou o LEFT JOIN do subsidio escondeu o direito sem subsidio, ou duplicou o que tem.', v_conta;
    END IF;

    -- Caso 2: o direito A traz o subsidio, e a coluna calculada diz que AINDA
    -- nao e gozavel -- a data de disponibilidade esta no futuro.
    SELECT * INTO r FROM public.v_hr_ausencias_direito_completo WHERE direito_id = v_dir_a;
    IF r.subsidio_montante_devido <> 400.00 OR r.subsidio_montante_pago <> 150.00 THEN
      RAISE EXCEPTION 'O subsidio do direito A nao chegou a vista (devido %, pago %).',
        r.subsidio_montante_devido, r.subsidio_montante_pago;
    END IF;
    IF r.disponivel_para_gozo_agora IS DISTINCT FROM false THEN
      RAISE EXCEPTION
        'O direito A fica gozavel a 15/03/2031 e a vista diz que ja e gozavel agora.';
    END IF;

    -- Caso 3: o direito B nao traz subsidio, e SEM restricao de data a coluna
    -- calculada tem de dar TRUE -- NULL significa "sem restricao", nao "nunca".
    SELECT * INTO r FROM public.v_hr_ausencias_direito_completo WHERE direito_id = v_dir_b;
    IF r.subsidio_id IS NOT NULL THEN
      RAISE EXCEPTION 'O direito B nao tem subsidio e a vista inventou-lhe um.';
    END IF;
    IF r.disponivel_para_gozo_agora IS DISTINCT FROM true THEN
      RAISE EXCEPTION
        'O direito B nao tem disponivel_a_partir_de e a vista diz que nao e gozavel. NULL significa sem restricao, e e o que significa em todas as linhas anteriores a 20261201270000.';
    END IF;

    -- Caso 4: o saldo veio do contador e nao de uma coluna. 22 dias de direito,
    -- nada gozado -> 22 adquiridos e 22 disponiveis.
    IF r.adquiridos <> 22 OR r.disponiveis <> 22 THEN
      RAISE EXCEPTION
        'O saldo do direito B saiu % adquiridos e % disponiveis, e devia ser 22 e 22 -- a juncao a v_hr_ausencias_saldos nao esta a bater pela chave certa.',
        r.adquiridos, r.disponiveis;
    END IF;

    -- Caso 5: um direito APAGADO nao aparece.
    UPDATE public.pessoas_ausencias_direitos SET deleted_at = now() WHERE id = v_dir_b;
    IF EXISTS (SELECT 1 FROM public.v_hr_ausencias_direito_completo WHERE direito_id = v_dir_b) THEN
      RAISE EXCEPTION 'Um direito com deleted_at continua a aparecer na vista.';
    END IF;

    RAISE EXCEPTION 'conferir_20261201320000_ok' USING ERRCODE = 'CF014';
  EXCEPTION
    WHEN SQLSTATE 'CF014' THEN
      RAISE NOTICE 'OK: a vista traz direito, saldo calculado e subsidio numa linha, nao duplica nem esconde direitos sem subsidio, trata NULL de disponibilidade como sem restricao, e esconde os direitos apagados -- exercitado com dados descartaveis revertidos por ROLLBACK.';
    WHEN OTHERS THEN
      RAISE;
  END;

  RAISE NOTICE 'Conferido: v_hr_ausencias_direito_completo com security_invoker=true, fechada a anon, e com as colunas de direito, saldo e subsidio.';
END;
$conferir$;
