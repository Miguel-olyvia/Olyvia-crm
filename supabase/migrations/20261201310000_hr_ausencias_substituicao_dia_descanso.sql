-- ==============================================================================
-- O dia de descanso a meio da semana, e o sabado ou domingo que o substitui.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- A expansao de um pedido de ferias, em rpc_hr_ausencia_pedir (20261121110000),
-- decide o que conta como dia util com UMA pergunta: e fim de semana ou feriado?
-- Essa pergunta esta certa para quem descansa ao sabado e ao domingo, que e a
-- maioria -- e esta errada para toda a gente que nao descansa.
--
-- Quem folga a quarta-feira e trabalha ao sabado ve hoje a quarta-feira
-- descontada como dia de ferias (e um dia da semana, logo conta) e o sabado
-- oferecido (e fim de semana, logo nao conta). Perde um dia de ferias por
-- semana, em silencio, e o contador de saldo nunca da sinal de nada.
--
--
-- -- A REGRA, JA DECIDIDA ------------------------------------------------------
--
-- Quando um dia D de um pedido de ferias e um DIA DE DESCANSO DA PROPRIA PESSOA
-- e cai a meio da semana:
--
--   - o substituto e o SABADO OU DOMINGO nao feriado da MESMA SEMANA, dentro do
--     periodo pedido (data_inicio a data_fim do pedido), E QUE SEJA UM DIA EM
--     QUE A PESSOA REALMENTE TRABALHA. Sabado primeiro;
--   - se nao houver nenhum disponivel DENTRO do periodo pedido, o dia de
--     descanso simplesmente NAO CONTA como dia util de ferias. Nao se vai buscar
--     substituto fora do pedido nem a outra semana.
--
-- O substituto ter de ser dia de trabalho nao e um detalhe: quem folga a quarta
-- E ao sabado (e trabalha ao domingo) veria a quarta trocada pelo sabado, que
-- tambem e folga -- um dia de descanso trocado por outro dia de descanso, com as
-- ferias a continuarem a ser descontadas num dia nao trabalhado. Se nem sabado
-- nem domingo servirem, o dia nao conta, como quando nao ha candidato nenhum.
--
-- SEMANA E A SEMANA ISO (segunda a domingo), que e a que o modulo ja usa: a
-- expansao existente testa extract(isodow) IN (6,7) para decidir o fim de
-- semana, e uma segunda nocao de semana ao lado dessa so podia divergir.
--
-- QUEM E DIA DE DESCANSO: pessoas_horario_planeado -- a fonte que 20261120150000
-- criou, com a convencao dia_semana 0=domingo -- respeitando a REGRA DE
-- PRECEDENCIA escrita no COMMENT dessa tabela:
--
--   - se houver alguma linha viva com data = D, o dia e definido SO por essas
--     linhas e as regras recorrentes sao IGNORADAS nesse dia. E dia de descanso
--     se e so se nenhuma dessas linhas for de trabalho (nao_trabalha=false);
--   - so quando nao ha excepcao nenhuma para o dia e que se olha para a regra
--     recorrente: e descanso o dia da semana sem nenhuma regra viva de trabalho
--     cuja janela de validade cubra a data.
--
-- Ler so as regras recorrentes daria a resposta errada exactamente nos dias em
-- que alguem tratou de declarar o contrario a mao.
--
--
-- -- A ESCOLHA DE DESENHO: CAMADA POR CIMA, E NAO ALTERACAO DAS RPCs ----------
--
-- A regra podia entrar de duas maneiras, e a escolha e a parte desta migracao
-- que mais interessa explicar.
--
-- A expansao de calendario existe hoje em QUATRO copias quase literais: duas
-- dentro de rpc_hr_ausencia_pedir (a que conta e a que insere), uma em
-- rpc_hr_ausencia_pedir_alteracao (so conta) e uma em
-- hr_ausencias_efectivar_substituicao (conta e insere) -- as duas ultimas de
-- 20261201020000, cujo proprio comentario avisa que "os dois tem de continuar a
-- concordar".
--
-- Meter a regra nova nessas quatro copias obrigava a reescrever tres RPCs
-- grandes por inteiro, a mao, sem poder correr nenhuma antes de as aplicar. A
-- probabilidade de um erro de transcricao em codigo que decide ferias aprovadas
-- e maior do que o que a alteracao comprava.
--
-- Por isso a regra entra como CAMADA: um trigger BEFORE INSERT em
-- pessoas_ausencias_dias, que e o unico sitio por onde TODAS as quatro copias
-- passam para criar um dia. Nenhuma RPC e tocada. O trigger:
--
--   - se o dia nao e de descanso a meio da semana, devolve NEW e nao faz nada.
--     Para quem descansa ao fim de semana -- a maioria -- e um no-op completo, e
--     e isso que mantem o comportamento actual intacto;
--   - se e, e ha sabado/domingo livre na mesma semana dentro do pedido,
--     REESCREVE NEW.data para esse dia (e marca e_fim_semana);
--   - se e, e nao ha, devolve NULL -- e a linha nao chega a existir.
--
-- O QUE ESTA CAMADA NAO ALCANCA, E FICA DITO: dias_solicitados e GRAVADO no
-- pedido pela RPC, com a contagem antiga. Quando ha substituto, o total nao muda
-- (um dia entra, um dia sai) e dias_solicitados continua certo. Quando NAO ha
-- substituto, a linha desaparece e dias_solicitados fica um dia acima do que foi
-- efectivamente marcado. O saldo NAO e afectado -- hr_ausencias_saldo() soma
-- pessoas_ausencias_dias e nao dias_solicitados -- mas o numero mostrado no
-- pedido fica alto. Fecha-se quando as quatro copias da expansao forem
-- unificadas numa funcao so; ate la, e uma diferenca de apresentacao e nao de
-- contador.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - So se aplica a tipos de categoria 'ferias' que EXCLUEM o fim de semana. Um
--   tipo com inclui_fim_de_semana=true ja conta sabados e domingos, e substituir
--   um dia por outro que ja conta seria contar duas vezes.
-- - Se a pessoa nao tem NENHUMA regra de horario viva, o trigger nao faz nada.
--   Sem horario nao se sabe quais sao os dias de descanso, e tratar "nao sei"
--   como "descansa todos os dias" apagaria o pedido inteiro. E a diferenca entre
--   nao ter informacao e ter a informacao de que nao trabalha.
-- - Nao se toca em rpc_hr_ausencia_pedir, rpc_hr_ausencia_pedir_alteracao,
--   hr_ausencias_efectivar_substituicao, hr_ausencias_saldo() nem na vista de
--   saldos.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP TRIGGER trg_pessoas_ausencias_dias_art238_substituicao ON public.pessoas_ausencias_dias;
--   DROP FUNCTION public.hr_ausencias_substituir_dia_descanso();
--   DROP FUNCTION public.hr_ausencias_dia_de_descanso(uuid, uuid, date);
--
--
-- Prerequisitos:
--   20261120150000  pessoas_horario_planeado (dia_semana 0=domingo, nao_trabalha)
--   20261121080000  pessoas_ausencias_dias
--   20261121060000  pessoas_ausencias_pedidos (data_inicio, data_fim)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas_horario_planeado') IS NULL THEN
    RAISE EXCEPTION
      'public.pessoas_horario_planeado nao existe. Aplicar 20261120150000 primeiro -- e a unica fonte que diz quais sao os dias de descanso de cada pessoa.';
  END IF;
  IF to_regclass('public.pessoas_ausencias_dias') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_ausencias_dias nao existe. Aplicar 20261121080000 primeiro.';
  END IF;
  IF to_regclass('public.pessoas_ausencias_pedidos') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_ausencias_pedidos nao existe. Aplicar 20261121060000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_horario_planeado'
       AND column_name = 'nao_trabalha'
  ) THEN
    RAISE EXCEPTION
      'pessoas_horario_planeado nao tem nao_trabalha. E a coluna que distingue uma folga declarada de uma linha de trabalho, e sem ela a deteccao do dia de descanso fica errada.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_ausencias_substituir_dia_descanso'
  ) THEN
    RAISE NOTICE 'Ja aplicada: hr_ausencias_substituir_dia_descanso ja existe. CREATE OR REPLACE abaixo repoe-a.';
  END IF;
END;
$guardas$;

-- ---- Quem descansa quando --------------------------------------------------
-- Funcao propria, e nao um EXISTS enterrado no trigger, porque esta pergunta --
-- "esta pessoa descansa neste dia?" -- vai ser precisa outra vez (no mapa de
-- assiduidade, no ecra de marcacao) e nao deve ser respondida por duas contas
-- diferentes.
CREATE OR REPLACE FUNCTION public.hr_ausencias_dia_de_descanso(
  _pessoa_id uuid,
  _organization_id uuid,
  _data date
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT
    CASE
      -- PRECEDENCIA DA EXCEPCAO POR DATA, a regra escrita no COMMENT da tabela
      -- pessoas_horario_planeado (20261120150000): se existir qualquer linha
      -- viva com data = D, esse dia e definido EXCLUSIVAMENTE por essas linhas e
      -- as regras recorrentes sao IGNORADAS nesse dia. Uma excepcao SUBSTITUI o
      -- dia inteiro, nao se acrescenta ao padrao -- e por isso esta pergunta vem
      -- primeiro, antes de se olhar sequer para dia_semana.
      WHEN EXISTS (
        SELECT 1 FROM public.pessoas_horario_planeado h
         WHERE h.pessoa_id = _pessoa_id
           AND h.organization_id = _organization_id
           AND h.deleted_at IS NULL
           AND h.data = _data
      ) THEN NOT EXISTS (
        -- Ha excepcao: o dia e de descanso SE E SO SE nenhuma dessas linhas for
        -- de trabalho. Uma linha = um intervalo, logo podem ser varias no mesmo
        -- dia; basta uma com nao_trabalha=false para o dia ser de trabalho.
        SELECT 1 FROM public.pessoas_horario_planeado h
         WHERE h.pessoa_id = _pessoa_id
           AND h.organization_id = _organization_id
           AND h.deleted_at IS NULL
           AND h.data = _data
           AND h.nao_trabalha = false
      )
      -- Sem NENHUMA regra de horario viva nao se sabe nada, e "nao sei" nao e
      -- "descansa". Devolver true aqui apagaria pedidos inteiros de quem ainda
      -- nao tem horario carregado.
      WHEN NOT EXISTS (
        SELECT 1 FROM public.pessoas_horario_planeado h
         WHERE h.pessoa_id = _pessoa_id
           AND h.organization_id = _organization_id
           AND h.deleted_at IS NULL
           AND h.dia_semana IS NOT NULL
      ) THEN false
      ELSE NOT EXISTS (
        SELECT 1 FROM public.pessoas_horario_planeado h
         WHERE h.pessoa_id = _pessoa_id
           AND h.organization_id = _organization_id
           AND h.deleted_at IS NULL
           -- dia_semana 0=domingo, a convencao de 20261120150000, que e
           -- exactamente a de EXTRACT(dow).
           AND h.dia_semana = EXTRACT(dow FROM _data)::smallint
           AND h.nao_trabalha = false
           AND (h.valido_de  IS NULL OR h.valido_de  <= _data)
           AND (h.valido_ate IS NULL OR h.valido_ate >= _data)
      )
    END
$$;

-- SEM GRANT A authenticated, e de proposito. A funcao e SECURITY DEFINER e le o
-- horario de QUALQUER pessoa de QUALQUER organizacao sem verificar pertenca:
-- concedida a authenticated ficava exposta como RPC do PostgREST e bastava saber
-- dois UUIDs para perguntar pelo horario de quem quer que seja. Quem a chama e o
-- trigger abaixo, que tambem e SECURITY DEFINER e corre como dono -- nao precisa
-- de grant nenhum. Se algum dia for precisa directamente do lado do cliente,
-- isso e uma decisao a parte e leva a sua propria guarda de permissao; nao se
-- repoe este grant.
REVOKE ALL ON FUNCTION public.hr_ausencias_dia_de_descanso(uuid, uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_ausencias_dia_de_descanso(uuid, uuid, date) FROM anon;
REVOKE ALL ON FUNCTION public.hr_ausencias_dia_de_descanso(uuid, uuid, date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hr_ausencias_dia_de_descanso(uuid, uuid, date) TO service_role;

COMMENT ON FUNCTION public.hr_ausencias_dia_de_descanso(uuid, uuid, date) IS
'Diz se uma pessoa descansa num dado dia, segundo pessoas_horario_planeado.

PRECEDENCIA DA EXCEPCAO POR DATA, como manda o COMMENT da propria tabela (20261120150000): se houver alguma linha viva com data = D, o dia e definido SO por essas linhas e as regras recorrentes sao ignoradas nesse dia -- e de descanso se e so se nenhuma dessas linhas for de trabalho. Sem excepcao nenhuma para o dia, cai na regra recorrente: um dia da semana sem nenhuma regra viva de trabalho (nao_trabalha=false) cuja janela de validade cubra a data.

Devolve FALSE quando a pessoa nao tem regra nenhuma viva. "Nao sei" nao e "descansa" -- tratar a ausencia de horario como descanso permanente apagaria pedidos inteiros de quem ainda nao tem horario carregado.

dia_semana usa a convencao 0=domingo de 20261120150000, que coincide com EXTRACT(dow). Nao confundir com EXTRACT(isodow), que a expansao de ausencias usa para o fim de semana e onde domingo e 7.

SECURITY DEFINER: e chamada de dentro de um trigger que corre para qualquer escritor, e sob RLS de invocador quem nao ve o horario da pessoa receberia "nao tem horario" -- e a resposta errada seria silenciosa. E PRECISAMENTE por ser DEFINER e nao verificar pertenca a organizacao que NAO tem grant a authenticated: exposta como RPC, respondia sobre o horario de qualquer pessoa de qualquer organizacao a quem soubesse os UUIDs.';

-- ---- A substituicao --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_ausencias_substituir_dia_descanso()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_categoria  text;
  v_inclui_fds boolean;
  v_isodow     integer;
  v_ped_ini    date;
  v_ped_fim    date;
  v_sabado     date;
  v_domingo    date;
  v_sub        date;
BEGIN
  -- Ja e fim de semana: nada a substituir. Tambem apanha o caso de uma linha
  -- gerada por esta propria funcao, se alguma vez for reinserida.
  IF NEW.e_fim_semana THEN
    RETURN NEW;
  END IF;

  v_isodow := EXTRACT(isodow FROM NEW.data)::integer;
  IF v_isodow >= 6 THEN
    RETURN NEW;
  END IF;

  SELECT t.categoria, t.inclui_fim_de_semana INTO v_categoria, v_inclui_fds
    FROM public.hr_ausencias_tipos t
   WHERE t.id = NEW.tipo_id AND t.organization_id = NEW.organization_id;

  -- So ferias, e so nos tipos que EXCLUEM o fim de semana. Num tipo que ja
  -- conta sabados e domingos, substituir um dia por outro que ja conta seria
  -- contar o mesmo dia duas vezes.
  IF coalesce(v_categoria, '') <> 'ferias' OR coalesce(v_inclui_fds, false) = true THEN
    RETURN NEW;
  END IF;

  IF NOT public.hr_ausencias_dia_de_descanso(NEW.pessoa_id, NEW.organization_id, NEW.data) THEN
    RETURN NEW;
  END IF;

  -- A partir daqui: dia de descanso da propria pessoa, a meio da semana, num
  -- pedido de ferias. O dia nao e um dia util e nao pode ser descontado como tal.
  SELECT p.data_inicio, p.data_fim INTO v_ped_ini, v_ped_fim
    FROM public.pessoas_ausencias_pedidos p
   WHERE p.id = NEW.pedido_id;

  IF v_ped_ini IS NULL THEN
    -- Sem pedido nao ha periodo onde procurar substituto. Nao se inventa um.
    RETURN NULL;
  END IF;

  -- Sabado e domingo da MESMA semana ISO.
  v_sabado  := NEW.data + (6 - v_isodow);
  v_domingo := NEW.data + (7 - v_isodow);

  SELECT c.d INTO v_sub
    FROM (VALUES (v_sabado), (v_domingo)) AS c(d)
   WHERE c.d BETWEEN v_ped_ini AND v_ped_fim
     -- DIA EM QUE A PESSOA REALMENTE TRABALHA. Sem isto, quem folga a quarta E
     -- ao sabado (e trabalha ao domingo) via a quarta trocada pelo sabado, que
     -- tambem e folga: um dia de descanso substituido por outro dia de
     -- descanso, e as ferias continuavam a ser descontadas num dia nao
     -- trabalhado. Se nem sabado nem domingo servirem, o dia nao conta -- o
     -- mesmo desfecho de quando nao ha candidato nenhum.
     AND NOT public.hr_ausencias_dia_de_descanso(NEW.pessoa_id, NEW.organization_id, c.d)
     -- Nao feriado: um feriado ja nao era dia util, e nao pode servir de
     -- substituto de outro dia que tambem nao era.
     AND NOT EXISTS (
       SELECT 1 FROM public.schedule_holidays sh
        WHERE sh.organization_id = NEW.organization_id
          AND (
            (coalesce(sh.is_recurring, false) = false AND sh.holiday_date = c.d)
            OR (coalesce(sh.is_recurring, false) = true
                AND to_char(sh.holiday_date, 'MM-DD') = to_char(c.d, 'MM-DD'))
          )
     )
     -- Nao ocupado ja por este pedido: a unique (pedido_id, data) recusaria, e
     -- recusar um pedido inteiro por causa disto seria pior do que nao contar.
     AND NOT EXISTS (
       SELECT 1 FROM public.pessoas_ausencias_dias x
        WHERE x.pedido_id = NEW.pedido_id AND x.data = c.d
     )
     -- Nem ocupado por outro pedido vivo da mesma pessoa: o trigger de
     -- nao-sobreposicao recusaria a linha e levava o pedido todo com ela.
     AND NOT EXISTS (
       SELECT 1 FROM public.pessoas_ausencias_dias y
        WHERE y.pessoa_id = NEW.pessoa_id
          AND y.organization_id = NEW.organization_id
          AND y.data = c.d
          AND y.estado IN ('pendente','aprovado')
     )
   ORDER BY c.d
   LIMIT 1;

  IF v_sub IS NULL THEN
    -- Nao ha substituto DENTRO do periodo pedido. O dia de descanso nao conta,
    -- e nao se vai buscar um dia fora do pedido nem a outra semana.
    RETURN NULL;
  END IF;

  NEW.data         := v_sub;
  NEW.e_fim_semana := true;
  NEW.e_feriado    := false;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_ausencias_substituir_dia_descanso() IS
'Troca um dia de descanso da propria pessoa, caido a meio da semana dentro de um pedido de ferias, pelo sabado ou domingo nao feriado da MESMA semana ISO que esteja dentro do periodo pedido E EM QUE A PESSOA REALMENTE TRABALHE. Sabado primeiro. Sem substituto disponivel dentro do pedido, devolve NULL e o dia simplesmente nao conta -- nao se procura fora do pedido nem noutra semana.

O candidato tem de ser dia de trabalho da pessoa: quem folga a quarta E ao sabado veria a quarta trocada pelo sabado, que tambem e folga, e continuaria a descontar ferias num dia nao trabalhado.

E uma CAMADA e nao uma alteracao as RPCs, e isso e deliberado: a expansao de calendario existe em quatro copias quase literais (duas em rpc_hr_ausencia_pedir, uma em rpc_hr_ausencia_pedir_alteracao, uma em hr_ausencias_efectivar_substituicao) e todas passam por este INSERT. Reescrever tres RPCs grandes a mao, sem as poder correr antes, arriscava mais do que comprava.

NO-OP COMPLETO para quem descansa ao sabado e ao domingo, que e a maioria: nenhum dia da semana e dia de descanso, e a funcao devolve NEW na primeira pergunta. O comportamento actual fica intacto.

LACUNA ASSUMIDA: dias_solicitados e gravado pela RPC com a contagem antiga. Com substituto o total nao muda; sem substituto fica um dia acima do marcado. O SALDO nao e afectado -- soma-se pessoas_ausencias_dias, nao dias_solicitados. Fecha quando as quatro copias da expansao forem unificadas.

SECURITY DEFINER: le horario, tipos, feriados e dias de outros pedidos, e sob RLS de invocador qualquer uma dessas leituras vazia daria a resposta errada em silencio.';

-- O nome comeca por "art238" de proposito: triggers do mesmo momento correm por
-- ordem alfabetica, e este tem de correr ANTES de
-- trg_pessoas_ausencias_dias_sem_sobreposicao (que valida a data final) e antes
-- de trg_pessoas_ausencias_dias_tecto_gozo_civil (que conta pelo ano da data
-- final). "art238" < "sem_sobreposicao" < "tecto_gozo_civil".
DROP TRIGGER IF EXISTS trg_pessoas_ausencias_dias_art238_substituicao ON public.pessoas_ausencias_dias;
CREATE TRIGGER trg_pessoas_ausencias_dias_art238_substituicao
  BEFORE INSERT ON public.pessoas_ausencias_dias
  FOR EACH ROW EXECUTE FUNCTION public.hr_ausencias_substituir_dia_descanso();

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_sec       boolean;
  v_path      text;
  v_ordem     text[];
  v_org_id    uuid;
  v_pessoa_q  uuid;  -- folga a quarta-feira; trabalha ao sabado
  v_pessoa_n  uuid;  -- horario normal, descansa ao fim de semana
  v_pessoa_s  uuid;  -- folga a quarta E ao sabado; trabalha ao domingo
  v_pessoa_t  uuid;  -- folga a quarta, ao sabado E ao domingo
  v_tipo_id   uuid;
  v_pedido    uuid;
  v_n         smallint;
  v_data      date;
  v_conta     integer;
BEGIN
  SELECT p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '')
    INTO v_sec, v_path
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'hr_ausencias_substituir_dia_descanso';

  IF v_sec IS NULL THEN
    RAISE EXCEPTION 'hr_ausencias_substituir_dia_descanso nao ficou criada.';
  END IF;
  IF v_sec IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'hr_ausencias_substituir_dia_descanso nao e SECURITY DEFINER.';
  END IF;
  IF v_path NOT LIKE '%search_path%' THEN
    RAISE EXCEPTION 'hr_ausencias_substituir_dia_descanso ficou sem search_path fixo.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_ausencias_dia_de_descanso'
       AND p.pronargs = 3 AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'hr_ausencias_dia_de_descanso(uuid, uuid, date) nao ficou criada como SECURITY DEFINER.';
  END IF;

  -- NAO pode estar exposta como RPC do PostgREST. E SECURITY DEFINER e nao
  -- verifica pertenca a organizacao: com EXECUTE a authenticated, qualquer
  -- utilizador com sessao perguntava pelo horario de qualquer pessoa de
  -- qualquer organizacao sabendo dois UUIDs.
  IF has_function_privilege('authenticated', 'public.hr_ausencias_dia_de_descanso(uuid, uuid, date)', 'EXECUTE') THEN
    RAISE EXCEPTION
      'authenticated consegue executar hr_ausencias_dia_de_descanso. E SECURITY DEFINER sem guarda de organizacao -- exposta como RPC, responde sobre o horario de qualquer pessoa de qualquer organizacao. O REVOKE nao pegou.';
  END IF;
  IF has_function_privilege('anon', 'public.hr_ausencias_dia_de_descanso(uuid, uuid, date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon consegue executar hr_ausencias_dia_de_descanso. O REVOKE nao pegou.';
  END IF;

  -- A ORDEM dos triggers BEFORE em pessoas_ausencias_dias. Se a substituicao
  -- correr DEPOIS da nao-sobreposicao, a validacao olha para a data errada.
  SELECT array_agg(tgname ORDER BY tgname) INTO v_ordem
    FROM pg_trigger
   WHERE tgrelid = to_regclass('public.pessoas_ausencias_dias')
     AND NOT tgisinternal
     AND (tgtype & 2) <> 0 AND (tgtype & 4) <> 0;

  IF v_ordem[1] <> 'trg_pessoas_ausencias_dias_art238_substituicao' THEN
    RAISE EXCEPTION
      'O trigger da substituicao nao e o primeiro dos BEFORE INSERT de pessoas_ausencias_dias (ordem actual: %). Correndo depois, a nao-sobreposicao e o tecto validariam a data ANTIGA.',
      array_to_string(v_ordem, ', ');
  END IF;

  -- ---- Exercicio vivo, revertido por ROLLBACK da subtransaccao.
  BEGIN
    INSERT INTO public.anew_organizations (name)
    VALUES ('__conferir_20261201310000__') RETURNING id INTO v_org_id;

    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido)
    VALUES (v_org_id, 'Folga', 'AQuarta') RETURNING id INTO v_pessoa_q;
    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido)
    VALUES (v_org_id, 'Horario', 'Normal') RETURNING id INTO v_pessoa_n;
    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido)
    VALUES (v_org_id, 'Folga', 'AQuartaESabado') RETURNING id INTO v_pessoa_s;
    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido)
    VALUES (v_org_id, 'Folga', 'AQuartaEFimDeSemana') RETURNING id INTO v_pessoa_t;

    INSERT INTO public.hr_ausencias_tipos
      (organization_id, codigo, nome, categoria, exige_aprovacao_chefia, exige_aprovacao_rh)
    VALUES (v_org_id, 'FER', 'Ferias', 'ferias', false, false)
    RETURNING id INTO v_tipo_id;

    -- Horario da pessoa Q: trabalha segunda(1), terca(2), quinta(4), sexta(5) e
    -- SABADO(6). Folga a quarta(3) e ao domingo(0). Convencao 0=domingo.
    --
    -- valido_de = CURRENT_DATE e OBRIGATORIO e nao decorativo: o guarda de
    -- historico de 20261130190000 recusa uma regra recorrente cujo valido_de
    -- seja omisso ou anterior a hoje, porque ela fabricaria cobertura de dias ja
    -- decorridos. As datas do fixture estao em 2030, bem depois de hoje.
    FOREACH v_n IN ARRAY ARRAY[1,2,4,5,6]::smallint[] LOOP
      INSERT INTO public.pessoas_horario_planeado
        (pessoa_id, organization_id, dia_semana, hora_inicio, hora_fim, valido_de)
      VALUES (v_pessoa_q, v_org_id, v_n, '09:00'::time, '17:00'::time, CURRENT_DATE);
    END LOOP;

    -- Horario da pessoa N: segunda a sexta. Descansa ao fim de semana, como a
    -- maioria -- e para ela o trigger tem de ser um no-op completo.
    FOREACH v_n IN ARRAY ARRAY[1,2,3,4,5]::smallint[] LOOP
      INSERT INTO public.pessoas_horario_planeado
        (pessoa_id, organization_id, dia_semana, hora_inicio, hora_fim, valido_de)
      VALUES (v_pessoa_n, v_org_id, v_n, '09:00'::time, '17:00'::time, CURRENT_DATE);
    END LOOP;

    -- Horario da pessoa S: trabalha segunda(1), terca(2), quinta(4), sexta(5) e
    -- DOMINGO(0). Folga a quarta(3) e ao SABADO(6). E o caso que prova que o
    -- substituto tem de ser um dia trabalhado: o sabado nao serve, o domingo sim.
    FOREACH v_n IN ARRAY ARRAY[0,1,2,4,5]::smallint[] LOOP
      INSERT INTO public.pessoas_horario_planeado
        (pessoa_id, organization_id, dia_semana, hora_inicio, hora_fim, valido_de)
      VALUES (v_pessoa_s, v_org_id, v_n, '09:00'::time, '17:00'::time, CURRENT_DATE);
    END LOOP;

    -- Horario da pessoa T: so segunda(1), terca(2), quinta(4) e sexta(5). Folga
    -- a quarta E ao fim de semana inteiro -- nenhum candidato serve de
    -- substituto, e o dia de descanso tem de simplesmente nao contar.
    FOREACH v_n IN ARRAY ARRAY[1,2,4,5]::smallint[] LOOP
      INSERT INTO public.pessoas_horario_planeado
        (pessoa_id, organization_id, dia_semana, hora_inicio, hora_fim, valido_de)
      VALUES (v_pessoa_t, v_org_id, v_n, '09:00'::time, '17:00'::time, CURRENT_DATE);
    END LOOP;

    -- 2030-06-03 e uma SEGUNDA-feira; 2030-06-05 quarta; 2030-06-08 sabado;
    -- 2030-06-09 domingo. Conferido pelo proprio Postgres logo abaixo, para que
    -- este comentario nao seja uma suposicao.
    IF EXTRACT(isodow FROM DATE '2030-06-03') <> 1 THEN
      RAISE EXCEPTION '2030-06-03 nao e segunda-feira; o fixture assume que e.';
    END IF;

    -- Caso 1: a pessoa Q descansa a quarta e nao descansa a terca.
    IF NOT public.hr_ausencias_dia_de_descanso(v_pessoa_q, v_org_id, DATE '2030-06-05') THEN
      RAISE EXCEPTION 'hr_ausencias_dia_de_descanso nao reconheceu a quarta-feira como folga da pessoa Q.';
    END IF;
    IF public.hr_ausencias_dia_de_descanso(v_pessoa_q, v_org_id, DATE '2030-06-04') THEN
      RAISE EXCEPTION 'hr_ausencias_dia_de_descanso deu a terca-feira como folga da pessoa Q, e ela trabalha.';
    END IF;

    -- Caso 2: a pessoa SEM horario nenhum nao e dada como descansando sempre.
    IF public.hr_ausencias_dia_de_descanso(gen_random_uuid(), v_org_id, DATE '2030-06-05') THEN
      RAISE EXCEPTION
        'hr_ausencias_dia_de_descanso deu descanso a uma pessoa sem horario nenhum. "Nao sei" nao e "descansa" -- assim apagava-se o pedido inteiro de quem ainda nao tem horario carregado.';
    END IF;

    -- Caso 2b: A PRECEDENCIA DA EXCEPCAO POR DATA. 2030-06-11 e terca (a pessoa
    -- Q trabalha) e 2030-06-12 e quarta (a pessoa Q folga). Duas excepcoes
    -- pontuais invertem os dois dias, e a funcao tem de seguir a excepcao e
    -- ignorar a regra recorrente nesses dias -- a regra escrita no COMMENT de
    -- pessoas_horario_planeado (20261120150000).
    IF EXTRACT(isodow FROM DATE '2030-06-11') <> 2 OR EXTRACT(isodow FROM DATE '2030-06-12') <> 3 THEN
      RAISE EXCEPTION '11 e 12 de Junho de 2030 nao sao terca e quarta; o fixture assume que sao.';
    END IF;

    -- Uma folga declarada a mao numa terca-feira de trabalho.
    INSERT INTO public.pessoas_horario_planeado
      (pessoa_id, organization_id, data, nao_trabalha)
    VALUES (v_pessoa_q, v_org_id, DATE '2030-06-11', true);

    -- E um turno declarado a mao na quarta-feira que normalmente e folga.
    INSERT INTO public.pessoas_horario_planeado
      (pessoa_id, organization_id, data, hora_inicio, hora_fim)
    VALUES (v_pessoa_q, v_org_id, DATE '2030-06-12', '09:00'::time, '17:00'::time);

    IF NOT public.hr_ausencias_dia_de_descanso(v_pessoa_q, v_org_id, DATE '2030-06-11') THEN
      RAISE EXCEPTION
        'A terca 11/06, com excepcao pontual de nao_trabalha=true, devia ser dia de descanso. A funcao esta a ler so a regra recorrente e a ignorar a excepcao por data.';
    END IF;
    IF public.hr_ausencias_dia_de_descanso(v_pessoa_q, v_org_id, DATE '2030-06-12') THEN
      RAISE EXCEPTION
        'A quarta 12/06, com excepcao pontual de TRABALHO, foi dada como dia de descanso. A excepcao por data substitui o dia inteiro e as regras recorrentes sao ignoradas nesse dia.';
    END IF;

    -- Caso 3: pedido de ferias da pessoa Q, segunda 03 a domingo 09. A quarta
    -- (dia de descanso) tem de sair da data 05 para o SABADO 08.
    INSERT INTO public.pessoas_ausencias_pedidos
      (organization_id, pessoa_id, tipo_id, data_inicio, data_fim, dias_solicitados,
       estado, periodo_inicio, periodo_fim)
    VALUES
      (v_org_id, v_pessoa_q, v_tipo_id, DATE '2030-06-03', DATE '2030-06-09', 5,
       'aprovado', DATE '2030-01-01', DATE '2030-12-31')
    RETURNING id INTO v_pedido;

    v_data := DATE '2030-06-03';
    WHILE v_data <= DATE '2030-06-07' LOOP
      INSERT INTO public.pessoas_ausencias_dias
        (pedido_id, pessoa_id, organization_id, tipo_id, data, fraccao_dia,
         conta_saldo, e_feriado, e_fim_semana, periodo_inicio, estado)
      VALUES
        (v_pedido, v_pessoa_q, v_org_id, v_tipo_id, v_data, 1.00,
         true, false, false, DATE '2030-01-01', 'aprovado');
      v_data := v_data + 1;
    END LOOP;

    IF EXISTS (SELECT 1 FROM public.pessoas_ausencias_dias WHERE pedido_id = v_pedido AND data = DATE '2030-06-05') THEN
      RAISE EXCEPTION
        'A quarta-feira 05/06 ficou como dia de ferias da pessoa Q, que folga a quarta -- a substituicao nao correu.';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.pessoas_ausencias_dias
       WHERE pedido_id = v_pedido AND data = DATE '2030-06-08' AND e_fim_semana = true
    ) THEN
      RAISE EXCEPTION
        'O sabado 08/06 nao ficou marcado como o substituto da quarta-feira de folga.';
    END IF;

    SELECT count(*) INTO v_conta FROM public.pessoas_ausencias_dias WHERE pedido_id = v_pedido;
    IF v_conta <> 5 THEN
      RAISE EXCEPTION
        'O pedido da pessoa Q devia ficar com 5 dias (seg, ter, qui, sex e o sabado substituto), e ficou com %.', v_conta;
    END IF;

    -- Caso 4: o mesmo pedido, mas SEM o fim de semana dentro do periodo -- de
    -- segunda 03 a sexta 07. Sem substituto disponivel, a quarta nao conta e o
    -- pedido fica com 4 dias, nao com 5.
    INSERT INTO public.pessoas_ausencias_pedidos
      (organization_id, pessoa_id, tipo_id, data_inicio, data_fim, dias_solicitados,
       estado, periodo_inicio, periodo_fim)
    VALUES
      (v_org_id, v_pessoa_q, v_tipo_id, DATE '2030-07-01', DATE '2030-07-05', 5,
       'aprovado', DATE '2030-01-01', DATE '2030-12-31')
    RETURNING id INTO v_pedido;

    IF EXTRACT(isodow FROM DATE '2030-07-01') <> 1 THEN
      RAISE EXCEPTION '2030-07-01 nao e segunda-feira; o fixture assume que e.';
    END IF;

    v_data := DATE '2030-07-01';
    WHILE v_data <= DATE '2030-07-05' LOOP
      INSERT INTO public.pessoas_ausencias_dias
        (pedido_id, pessoa_id, organization_id, tipo_id, data, fraccao_dia,
         conta_saldo, e_feriado, e_fim_semana, periodo_inicio, estado)
      VALUES
        (v_pedido, v_pessoa_q, v_org_id, v_tipo_id, v_data, 1.00,
         true, false, false, DATE '2030-01-01', 'aprovado');
      v_data := v_data + 1;
    END LOOP;

    SELECT count(*) INTO v_conta FROM public.pessoas_ausencias_dias WHERE pedido_id = v_pedido;
    IF v_conta <> 4 THEN
      RAISE EXCEPTION
        'Sem sabado nem domingo dentro do periodo pedido, a quarta de folga devia simplesmente nao contar e o pedido ficar com 4 dias. Ficou com % -- ou foi buscar substituto fora do periodo, ou descontou a folga como ferias.', v_conta;
    END IF;

    -- Caso 5: o NO-OP. A pessoa N, de horario normal, marca a mesma semana de
    -- segunda a sexta e tem de ficar com os 5 dias intactos, nas datas
    -- originais. E esta a verificacao que prova que a maioria nao foi afectada.
    INSERT INTO public.pessoas_ausencias_pedidos
      (organization_id, pessoa_id, tipo_id, data_inicio, data_fim, dias_solicitados,
       estado, periodo_inicio, periodo_fim)
    VALUES
      (v_org_id, v_pessoa_n, v_tipo_id, DATE '2030-07-01', DATE '2030-07-05', 5,
       'aprovado', DATE '2030-01-01', DATE '2030-12-31')
    RETURNING id INTO v_pedido;

    v_data := DATE '2030-07-01';
    WHILE v_data <= DATE '2030-07-05' LOOP
      INSERT INTO public.pessoas_ausencias_dias
        (pedido_id, pessoa_id, organization_id, tipo_id, data, fraccao_dia,
         conta_saldo, e_feriado, e_fim_semana, periodo_inicio, estado)
      VALUES
        (v_pedido, v_pessoa_n, v_org_id, v_tipo_id, v_data, 1.00,
         true, false, false, DATE '2030-01-01', 'aprovado');
      v_data := v_data + 1;
    END LOOP;

    SELECT count(*) INTO v_conta
      FROM public.pessoas_ausencias_dias
     WHERE pedido_id = v_pedido AND data BETWEEN DATE '2030-07-01' AND DATE '2030-07-05';
    IF v_conta <> 5 THEN
      RAISE EXCEPTION
        'A pessoa de horario normal perdeu ou mudou dias (% em vez de 5). O trigger tinha de ser um no-op completo para quem descansa ao fim de semana.', v_conta;
    END IF;

    -- Caso 6: o substituto tem de ser um dia TRABALHADO. A pessoa S folga a
    -- quarta E ao sabado, e trabalha ao domingo. A quarta 05 nao pode ir parar
    -- ao sabado 08 (que tambem e folga dela) -- tem de ir para o DOMINGO 09.
    -- Sem esta condicao trocava-se um dia de descanso por outro dia de
    -- descanso, e as ferias continuavam a ser descontadas num dia nao
    -- trabalhado.
    INSERT INTO public.pessoas_ausencias_pedidos
      (organization_id, pessoa_id, tipo_id, data_inicio, data_fim, dias_solicitados,
       estado, periodo_inicio, periodo_fim)
    VALUES
      (v_org_id, v_pessoa_s, v_tipo_id, DATE '2030-06-03', DATE '2030-06-09', 5,
       'aprovado', DATE '2030-01-01', DATE '2030-12-31')
    RETURNING id INTO v_pedido;

    v_data := DATE '2030-06-03';
    WHILE v_data <= DATE '2030-06-07' LOOP
      INSERT INTO public.pessoas_ausencias_dias
        (pedido_id, pessoa_id, organization_id, tipo_id, data, fraccao_dia,
         conta_saldo, e_feriado, e_fim_semana, periodo_inicio, estado)
      VALUES
        (v_pedido, v_pessoa_s, v_org_id, v_tipo_id, v_data, 1.00,
         true, false, false, DATE '2030-01-01', 'aprovado');
      v_data := v_data + 1;
    END LOOP;

    IF EXISTS (SELECT 1 FROM public.pessoas_ausencias_dias WHERE pedido_id = v_pedido AND data = DATE '2030-06-08') THEN
      RAISE EXCEPTION
        'A quarta de folga da pessoa S foi parar ao sabado 08/06, que tambem e dia de descanso dela -- trocou-se um dia nao trabalhado por outro dia nao trabalhado.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.pessoas_ausencias_dias
       WHERE pedido_id = v_pedido AND data = DATE '2030-06-09' AND e_fim_semana = true
    ) THEN
      RAISE EXCEPTION
        'A quarta de folga da pessoa S devia passar para o DOMINGO 09/06, que e o unico dia de fim de semana em que ela trabalha.';
    END IF;

    SELECT count(*) INTO v_conta FROM public.pessoas_ausencias_dias WHERE pedido_id = v_pedido;
    IF v_conta <> 5 THEN
      RAISE EXCEPTION 'O pedido da pessoa S devia ficar com 5 dias (seg, ter, qui, sex e o domingo substituto), e ficou com %.', v_conta;
    END IF;

    -- Caso 7: nem sabado nem domingo servem. A pessoa T folga a quarta e o fim
    -- de semana inteiro: nao ha substituto possivel e a quarta simplesmente nao
    -- conta -- o mesmo desfecho do caso 4, mas por falta de dia TRABALHADO e
    -- nao por falta de dia dentro do periodo.
    INSERT INTO public.pessoas_ausencias_pedidos
      (organization_id, pessoa_id, tipo_id, data_inicio, data_fim, dias_solicitados,
       estado, periodo_inicio, periodo_fim)
    VALUES
      (v_org_id, v_pessoa_t, v_tipo_id, DATE '2030-06-03', DATE '2030-06-09', 5,
       'aprovado', DATE '2030-01-01', DATE '2030-12-31')
    RETURNING id INTO v_pedido;

    v_data := DATE '2030-06-03';
    WHILE v_data <= DATE '2030-06-07' LOOP
      INSERT INTO public.pessoas_ausencias_dias
        (pedido_id, pessoa_id, organization_id, tipo_id, data, fraccao_dia,
         conta_saldo, e_feriado, e_fim_semana, periodo_inicio, estado)
      VALUES
        (v_pedido, v_pessoa_t, v_org_id, v_tipo_id, v_data, 1.00,
         true, false, false, DATE '2030-01-01', 'aprovado');
      v_data := v_data + 1;
    END LOOP;

    SELECT count(*) INTO v_conta FROM public.pessoas_ausencias_dias WHERE pedido_id = v_pedido;
    IF v_conta <> 4 THEN
      RAISE EXCEPTION
        'A pessoa T folga a quarta e o fim de semana inteiro: sem nenhum sabado ou domingo trabalhado, a quarta devia nao contar e o pedido ficar com 4 dias. Ficou com % -- o substituto escolhido e outro dia de descanso.', v_conta;
    END IF;

    RAISE EXCEPTION 'conferir_20261201310000_ok' USING ERRCODE = 'CF013';
  EXCEPTION
    WHEN SQLSTATE 'CF013' THEN
      RAISE NOTICE 'OK: a quarta-feira de folga passa para o sabado da mesma semana quando ele esta dentro do pedido e e dia trabalhado, passa para o domingo quando o sabado tambem e folga, nao conta quando nenhum dos dois serve, as excepcoes por data mandam sobre as regras recorrentes, e quem tem horario normal (ou nao tem horario nenhum) nao e tocado -- exercitado com dados descartaveis revertidos por ROLLBACK.';
    WHEN OTHERS THEN
      RAISE;
  END;

  RAISE NOTICE 'Conferido: hr_ausencias_dia_de_descanso e a camada de substituicao, em BEFORE INSERT e antes dos restantes triggers de pessoas_ausencias_dias.';
END;
$conferir$;
