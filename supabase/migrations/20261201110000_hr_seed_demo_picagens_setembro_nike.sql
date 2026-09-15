-- ==============================================================================
-- DADOS DE DEMONSTRACAO -- NAO E UMA MIGRACAO DE ESQUEMA.
--
-- Gera picagens de teste para as pessoas da organizacao nike
-- (b6ffce4f-f630-4933-833a-008649757a33), de 1 a 15 de Setembro de 2026, para
-- servirem de dados de exemplo no relatorio mensal de assiduidade. Nao cria
-- nem altera nenhuma tabela, funcao, politica ou constraint -- so escreve
-- linhas de negocio, e so na organizacao nike.
--
--
-- -- INSERT DIRECTO, DE PROPOSITO -----------------------------------------------
--
-- Pedido explicito: e dado de teste, sem exigencia de parecer que foi um
-- login real a picar. Em vez de simular a identidade de alguem para passar
-- por rpc_hr_picar (tentado em rondas anteriores desta migracao, sem
-- sucesso -- ver o historico do ficheiro), esta versao insere directamente
-- em pessoas_picagens (linhas de negocio, sem RLS a contornar aqui: e o
-- dono da migracao a escrever, o mesmo nivel de acesso que qualquer CREATE
-- TABLE desta sessao ja usa) e chama hr_picagens_consolidar(pessoa,
-- organizacao, dia) a seguir -- uma funcao pura, sem auth.uid() nenhum
-- (20261121190000) -- para preencher pessoas_horario_realizado, que e a
-- tabela que o relatorio mensal realmente le.
--
-- -- COBERTURA E DESVIO, E PORQUE SAO DETERMINISTICOS ---------------------------
--
-- random() puro tornaria esta migracao diferente a cada aplicacao (e
-- impossivel de re-auditar depois de aplicada). Em vez disso usa-se
-- hashtext(...) sobre o id da pessoa e a data -- uma funcao pura, sem estado:
-- a mesma pessoa e o mesmo dia produzem sempre o mesmo resultado.
--
--   1. Por PESSOA, hashtext(pessoa_id) fixa uma "taxa de cobertura" entre 15%
--      e 95% dos dias planeados que tem entre 1 e 15 de Setembro -- e isto que
--      da a variedade pedida: algumas pessoas quase todos os dias, outras so
--      uns poucos.
--   2. Por PESSOA+DIA, um segundo hash decide se aquele dia entra, comparado
--      contra a taxa de cobertura da pessoa.
--   3. Por PESSOA+DIA+INTERVALO, dois hashes independentes (entrada e saida)
--      decidem, com 25% de probabilidade cada, se ha desvio -- entre 15 e 90
--      minutos, para mais ou para menos (outro hash decide o sinal). A maioria
--      dos dias escolhidos bate certo com o planeado; uma parte real nao bate.
--
--
-- -- O QUE CONTA COMO "DIA PLANEADO" --------------------------------------------
--
-- Reaproveita-se a MESMA resolucao da vista de desvios (hr_assiduidade_desvios,
-- 20261121250000): uma linha com data = dia (excepcao pontual) SUBSTITUI as
-- regras recorrentes desse dia; senao, uma linha com dia_semana =
-- extract(dow FROM dia) dentro de [valido_de, valido_ate], desde que nao_
-- trabalha = false e as duas horas estejam preenchidas. Isto ja cobre folgas e
-- descanso semanal: um dia com nao_trabalha = true, ou sem nenhuma linha
-- aplicavel, simplesmente nao aparece como planeado e por isso nunca recebe
-- picagem. Nao existe tabela de feriados nesta base (confirmado por grep antes
-- de escrever esta migracao) -- por isso feriado, aqui, e o que a pessoa ja
-- tem registado como nao_trabalha ou sem horario nesse dia.
--
-- Um dia com AUSENCIA APROVADA (pessoas_ausencias_dias.estado = 'aprovado')
-- e saltado antes mesmo de olhar ao planeado -- mesma condicao que
-- hr_assiduidade_desvios usa para nao tratar ferias deferidas como desvio.
--
-- Pessoas com varios intervalos no mesmo dia (turno partido, dois locais)
-- recebem um par entrada/saida POR INTERVALO -- a escolha do dia e por
-- pessoa+dia, o desvio e por pessoa+dia+intervalo.
--
--
-- -- ALCANCE ----------------------------------------------------------------
--
-- - So a organizacao nike: toda a query de pessoas, vinculos, ausencias e
--   horario planeado tem organization_id = nike fixo, e a propria RPC recusa
--   qualquer escrita fora da organizacao passada (confirma pessoa contra
--   organization_id antes de inserir).
-- - So 1 a 15 de Setembro de 2026 (o "hoje" deste pedido).
-- - _origem := 'importacao' -- dados gerados em lote, nao um toque real no
--   relogio de ponto; e o valor que o dominio ja preve exactamente para isto,
--   em vez de fingir 'web' (picagem feita pela propria pessoa no navegador).
-- - Nao cria, altera nem apaga tabelas, funcoes, politicas ou constraints.
-- - Nao ha ficheiro de reversao: para desfazer, apagar por pessoa/periodo as
--   linhas de pessoas_picagens com origem = 'importacao' e data_local no intervalo,
--   e re-consolidar (rpc_hr_picagens_consolidar_dia) os dias afectados.
--
--
-- Prerequisitos:
--   20261121190000  hr_picagens_consolidar (funcao pura, sem auth.uid())
--   20261121160000  pessoas_picagens
--   20261120150000  pessoas_horario_planeado
--   20261120060000  pessoas_vinculos
--   20261121080000  pessoas_ausencias_dias
--   20261121250000  hr_assiduidade_desvios (fonte da logica de resolucao do dia)
-- ==============================================================================

DO $seed$
DECLARE
  v_org_nike      CONSTANT uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  v_data_ini      CONSTANT date := '2026-09-01';
  v_data_fim      CONSTANT date := '2026-09-15';

  v_tz            text;

  v_pessoa        record;
  v_plan          record;
  v_dia           date;
  v_cobertura_pct integer;
  v_dia_hash      integer;
  v_dev_in_pct    integer;
  v_dev_out_pct   integer;
  v_dev_in        integer;
  v_dev_out       integer;
  v_mom_in        timestamptz;
  v_mom_out       timestamptz;
  v_dia_contado   boolean;

  v_pessoas_count  integer := 0;
  v_dias_count     integer := 0;
  v_picagens_count integer := 0;
BEGIN
  -- ---- Guardas ---------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_picagens_consolidar' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION
      'public.hr_picagens_consolidar(uuid,uuid,date) nao existe. A definicao vigente pode ter mudado depois de 20261121190000 -- confirmar antes de continuar.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations WHERE id = v_org_nike) THEN
    RAISE EXCEPTION 'A organizacao nike (%) nao existe neste ambiente. Confirmar o id antes de gerar dados de demonstracao.', v_org_nike;
  END IF;

  SELECT coalesce(nullif(btrim(s.timezone), ''), 'Europe/Lisbon') INTO v_tz
    FROM public.schedule_settings s
   WHERE s.organization_id = v_org_nike
   LIMIT 1;
  v_tz := coalesce(v_tz, 'Europe/Lisbon');

  -- ---- INSERT directo, sem simular identidade nenhuma -------------------------
  -- Pedido explicito: sao dados de teste, o unico requisito e ficarem na
  -- base -- sem exigencia de parecerem picagens feitas por um login real.
  -- INSERT directo em pessoas_picagens (dono da migracao, sem RLS a
  -- contornar -- e a mesma via com que qualquer CREATE TABLE desta sessao
  -- ja escreve), seguido de hr_picagens_consolidar (funcao pura, sem
  -- auth.uid() nenhum) para preencher pessoas_horario_realizado, que e o
  -- que o relatorio mensal realmente le.
  FOR v_pessoa IN
      SELECT DISTINCT p.id AS pessoa_id
        FROM public.pessoas p
        JOIN public.pessoas_vinculos v
          ON v.pessoa_id = p.id AND v.organization_id = p.organization_id
       WHERE p.organization_id = v_org_nike
         AND p.deleted_at IS NULL
         AND v.deleted_at IS NULL
         AND v.data_inicio <= v_data_fim
         AND (v.data_fim IS NULL OR v.data_fim >= v_data_ini)
    LOOP
      v_pessoas_count := v_pessoas_count + 1;

      -- Taxa de cobertura desta pessoa: 15..95%, fixa por hash do id. O cast
      -- para bigint ANTES do abs() evita o unico valor onde abs(integer)
      -- rebentaria por overflow (hashtext podia devolver -2147483648).
      v_cobertura_pct := 15 + (abs(hashtext(v_pessoa.pessoa_id::text || '|cobertura')::bigint) % 81)::integer;

      v_dia := v_data_ini;
      WHILE v_dia <= v_data_fim LOOP
        v_dia_contado := false;

        -- Ausencia aprovada nesse dia: nao se pica, mesma condicao usada em
        -- hr_assiduidade_desvios para ferias deferidas.
        IF EXISTS (
          SELECT 1 FROM public.pessoas_ausencias_dias a
           WHERE a.pessoa_id = v_pessoa.pessoa_id
             AND a.organization_id = v_org_nike
             AND a.data = v_dia
             AND a.estado = 'aprovado'
        ) THEN
          v_dia := v_dia + 1;
          CONTINUE;
        END IF;

        -- Se o dia, na escala 0..99 desta pessoa+dia, cair fora da taxa de
        -- cobertura, salta-se o dia inteiro (todos os intervalos dele).
        v_dia_hash := (abs(hashtext(v_pessoa.pessoa_id::text || '|dia|' || v_dia::text)::bigint) % 100)::integer;
        IF v_dia_hash >= v_cobertura_pct THEN
          v_dia := v_dia + 1;
          CONTINUE;
        END IF;

        -- Resolucao do planeado do dia: excepcao por data substitui a regra
        -- recorrente desse dia -- mesma logica de hr_assiduidade_desvios
        -- (20261121250000), reaproveitada aqui em vez de reinventada.
        FOR v_plan IN
          SELECT hp.id AS planeado_id, hp.hora_inicio, hp.hora_fim, hp.local_id, hp.vinculo_id
            FROM public.pessoas_horario_planeado hp
           WHERE hp.pessoa_id = v_pessoa.pessoa_id
             AND hp.organization_id = v_org_nike
             AND hp.deleted_at IS NULL
             AND hp.nao_trabalha = false
             AND hp.hora_inicio IS NOT NULL AND hp.hora_fim IS NOT NULL
             AND hp.data = v_dia

          UNION ALL

          SELECT hp.id, hp.hora_inicio, hp.hora_fim, hp.local_id, hp.vinculo_id
            FROM public.pessoas_horario_planeado hp
           WHERE hp.pessoa_id = v_pessoa.pessoa_id
             AND hp.organization_id = v_org_nike
             AND hp.deleted_at IS NULL
             AND hp.nao_trabalha = false
             AND hp.hora_inicio IS NOT NULL AND hp.hora_fim IS NOT NULL
             AND hp.dia_semana = extract(dow FROM v_dia)::smallint
             AND (hp.valido_de IS NULL OR v_dia >= hp.valido_de)
             AND (hp.valido_ate IS NULL OR v_dia <= hp.valido_ate)
             AND NOT EXISTS (
               SELECT 1 FROM public.pessoas_horario_planeado ex
                WHERE ex.pessoa_id = hp.pessoa_id
                  AND ex.organization_id = hp.organization_id
                  AND ex.data = v_dia
                  AND ex.deleted_at IS NULL
             )
        LOOP
          -- Desvio na entrada: 25% de hipotese, 15..90 minutos, sinal por hash.
          v_dev_in := 0;
          v_dev_in_pct := (abs(hashtext(v_pessoa.pessoa_id::text || '|devin|' || v_dia::text || '|' || v_plan.planeado_id::text)::bigint) % 100)::integer;
          IF v_dev_in_pct < 25 THEN
            v_dev_in := 15 + (abs(hashtext(v_pessoa.pessoa_id::text || '|magin|' || v_dia::text || '|' || v_plan.planeado_id::text)::bigint) % 76)::integer;
            IF (abs(hashtext(v_pessoa.pessoa_id::text || '|signin|' || v_dia::text || '|' || v_plan.planeado_id::text)::bigint) % 2) = 0 THEN
              v_dev_in := -v_dev_in;
            END IF;
          END IF;

          -- Desvio na saida: independente do da entrada, mesma forma.
          v_dev_out := 0;
          v_dev_out_pct := (abs(hashtext(v_pessoa.pessoa_id::text || '|devout|' || v_dia::text || '|' || v_plan.planeado_id::text)::bigint) % 100)::integer;
          IF v_dev_out_pct < 25 THEN
            v_dev_out := 15 + (abs(hashtext(v_pessoa.pessoa_id::text || '|magout|' || v_dia::text || '|' || v_plan.planeado_id::text)::bigint) % 76)::integer;
            IF (abs(hashtext(v_pessoa.pessoa_id::text || '|signout|' || v_dia::text || '|' || v_plan.planeado_id::text)::bigint) % 2) = 0 THEN
              v_dev_out := -v_dev_out;
            END IF;
          END IF;

          -- O momento e a hora planeada + desvio, interpretada no fuso da
          -- organizacao -- o inverso exacto do que rpc_hr_picar faz para obter
          -- data_local/hora_local a partir de _momento.
          v_mom_in  := ((v_dia::timestamp + v_plan.hora_inicio) + (v_dev_in  * interval '1 minute')) AT TIME ZONE v_tz;
          v_mom_out := ((v_dia::timestamp + v_plan.hora_fim)    + (v_dev_out * interval '1 minute')) AT TIME ZONE v_tz;

          -- Protecao minima: nunca gerar uma saida antes ou igual a entrada.
          -- Um desvio negativo grande na saida podia cruzar com um positivo
          -- grande na entrada -- nesse caso, encurta-se em vez de inverter.
          IF v_mom_out <= v_mom_in THEN
            v_mom_out := v_mom_in + interval '30 minutes';
          END IF;

          -- ON CONFLICT DO NOTHING: dado de teste, um par ocasional que
          -- coincida com outro (ex. dois planeados do mesmo dia a gerar o
          -- mesmo instante) so significa uma linha a menos, nunca um erro a
          -- parar a geracao toda.
          INSERT INTO public.pessoas_picagens (
            pessoa_id, organization_id, momento, data_local, hora_local,
            sentido, local_id, vinculo_id, planeado_id, origem, estado
          ) VALUES (
            v_pessoa.pessoa_id, v_org_nike, v_mom_in,
            (v_mom_in AT TIME ZONE v_tz)::date, (v_mom_in AT TIME ZONE v_tz)::time,
            'entrada', v_plan.local_id, v_plan.vinculo_id, v_plan.planeado_id,
            'importacao', 'valida'
          )
          ON CONFLICT (pessoa_id, momento, sentido) WHERE estado = 'valida' DO NOTHING;
          INSERT INTO public.pessoas_picagens (
            pessoa_id, organization_id, momento, data_local, hora_local,
            sentido, local_id, vinculo_id, planeado_id, origem, estado
          ) VALUES (
            v_pessoa.pessoa_id, v_org_nike, v_mom_out,
            (v_mom_out AT TIME ZONE v_tz)::date, (v_mom_out AT TIME ZONE v_tz)::time,
            'saida', v_plan.local_id, v_plan.vinculo_id, v_plan.planeado_id,
            'importacao', 'valida'
          )
          ON CONFLICT (pessoa_id, momento, sentido) WHERE estado = 'valida' DO NOTHING;

          v_picagens_count := v_picagens_count + 2;
          IF NOT v_dia_contado THEN
            v_dias_count := v_dias_count + 1;
            v_dia_contado := true;
          END IF;
        END LOOP;

        -- Consolida so se este dia recebeu picagens -- hr_picagens_consolidar
        -- e idempotente e barata (RETURN 0 sem eventos), mas nao vale a pena
        -- chama-la para dias saltados por ausencia/cobertura.
        IF v_dia_contado THEN
          PERFORM public.hr_picagens_consolidar(v_pessoa.pessoa_id, v_org_nike, v_dia);
        END IF;

        v_dia := v_dia + 1;
      END LOOP;
    END LOOP;

  RAISE NOTICE
    'Dados de demonstracao gerados na organizacao nike, 1-15 de Setembro de 2026: % pessoas com vinculo activo, % pares pessoa+dia com picagem, % picagens (entradas+saidas), origem ''importacao'', consolidadas em pessoas_horario_realizado.',
    v_pessoas_count, v_dias_count, v_picagens_count;
END;
$seed$;
