-- 20270112150000 obra_ler_sem_custos (correções do bloco A da auditoria de permissões, A3)
-- obra_ler_negocios deixava passar:
--   1. na leitura completa (pessoas.view), os custos da obra a quem não vê custos (fn_quote_custos_pode: quotes.view_costs ou
--      quotes.manage): real.custoReal/m, realFases (custos e margens), ec/ecsAjuste (custo e custo das linhas), mats/encomendado.preco,
--      enquanto neg_ler_negocios do mesmo utilizador os devolve a null;
--   2. na leitura completa, o €/h de cada pessoa (exec.ch, exec.envios[].ch; vem do salário) a quem não tem hr.pessoas.retribuicao.view;
--   3. na leitura reduzida (só executar), ecsAjuste e chat.
-- Correção: 1 -> fn_obra_emylia_sem_custos (custos/margens a null, preços de venda ficam); 2 -> fn_obra_emylia_sem_ch; 3 -> juntar
-- ecsAjuste e chat a fn_obra_emylia_sem_valores/fn_obra_emylia_repor_valores. obra_guardar_negocio repõe da base, em cada caso, o que a
-- leitura tirou (fn_obra_emylia_repor_custos / fn_obra_emylia_repor_tarefas / fn_obra_emylia_repor_valores), antes das regras de
-- execução e do €/h do servidor (fn_obra_emylia_ch_servidor): quem grava sem ver não apaga os dados.
-- Partiu das definições vivas no ramo RH (uetjghdkwbywbftedtth); aborta se alguma mudou entretanto. Sem tabelas nem colunas novas.

DO $g$ BEGIN
  IF md5(pg_get_functiondef('public.obra_ler_negocios(uuid)'::regprocedure)) <> '46c5f49080da9b0c68c5e2a6c959a189' THEN
    RAISE EXCEPTION 'obra_ler_negocios mudou desde a leitura; rever antes de aplicar';
  END IF;
  IF md5(pg_get_functiondef('public.obra_guardar_negocio(uuid,uuid,jsonb)'::regprocedure)) <> '88b15db7120cd045e4f08586cedfa22c' THEN
    RAISE EXCEPTION 'obra_guardar_negocio mudou desde a leitura; rever antes de aplicar';
  END IF;
  IF md5(pg_get_functiondef('public.fn_obra_emylia_sem_valores(jsonb)'::regprocedure)) <> 'f992116f5bbd4848dc90a271d421628c' THEN
    RAISE EXCEPTION 'fn_obra_emylia_sem_valores mudou desde a leitura; rever antes de aplicar';
  END IF;
  IF md5(pg_get_functiondef('public.fn_obra_emylia_repor_valores(jsonb,jsonb)'::regprocedure)) <> 'd70187f0b7e07a973f2d33add46174e9' THEN
    RAISE EXCEPTION 'fn_obra_emylia_repor_valores mudou desde a leitura; rever antes de aplicar';
  END IF;
END $g$;

-- ------------------------------------------------------------------ ajudantes (sem SECURITY DEFINER, só para as funções da obra)
-- Põe a null as chaves `ks` que existem no objeto (não acrescenta chaves).
CREATE OR REPLACE FUNCTION public.fn_obra_json_anular(o jsonb, ks text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb := o; k text;
BEGIN
  IF jsonb_typeof(o) IS DISTINCT FROM 'object' THEN RETURN o; END IF;
  FOREACH k IN ARRAY ks LOOP
    IF r ? k THEN r := r || jsonb_build_object(k, NULL); END IF;
  END LOOP;
  RETURN r;
END $function$;

-- Repõe de `a` (a base) as chaves `ks` que em `d` (o que chegou) vêm a null ou não vêm, quando a base as tem com valor.
CREATE OR REPLACE FUNCTION public.fn_obra_json_repor(a jsonb, d jsonb, ks text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb := d; k text;
BEGIN
  IF jsonb_typeof(a) IS DISTINCT FROM 'object' OR jsonb_typeof(d) IS DISTINCT FROM 'object' THEN RETURN d; END IF;
  FOREACH k IN ARRAY ks LOOP
    IF a ? k AND jsonb_typeof(a->k) IS DISTINCT FROM 'null' AND (NOT r ? k OR jsonb_typeof(r->k) = 'null') THEN
      r := r || jsonb_build_object(k, a->k);
    END IF;
  END LOOP;
  RETURN r;
END $function$;

-- Uma encomenda de cliente (ec ou um elemento de ecsAjuste) sem o custo: o custo total e o custo de cada linha. O valor e os preços
-- (o que está na proposta) ficam.
CREATE OR REPLACE FUNCTION public.fn_obra_ec_sem_custos(e jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb;
BEGIN
  IF jsonb_typeof(e) IS DISTINCT FROM 'object' THEN RETURN e; END IF;
  r := public.fn_obra_json_anular(e, ARRAY['custo']);
  IF jsonb_typeof(r->'linhas') = 'array' THEN
    r := jsonb_set(r, '{linhas}', (SELECT coalesce(jsonb_agg(public.fn_obra_json_anular(x, ARRAY['custo']) ORDER BY i), '[]'::jsonb)
                                   FROM jsonb_array_elements(r->'linhas') WITH ORDINALITY y(x, i)));
  END IF;
  RETURN r;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_obra_ec_repor_custos(a jsonb, d jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb; j int; la jsonb; ld jsonb;
BEGIN
  IF jsonb_typeof(a) IS DISTINCT FROM 'object' OR jsonb_typeof(d) IS DISTINCT FROM 'object' THEN RETURN d; END IF;
  r := public.fn_obra_json_repor(a, d, ARRAY['custo']);
  IF jsonb_typeof(a->'linhas') = 'array' AND jsonb_typeof(r->'linhas') = 'array' THEN
    FOR j IN 0 .. least(jsonb_array_length(a->'linhas'), jsonb_array_length(r->'linhas')) - 1 LOOP
      la := a->'linhas'->j; ld := r->'linhas'->j;
      CONTINUE WHEN jsonb_typeof(la) IS DISTINCT FROM 'object' OR jsonb_typeof(ld) IS DISTINCT FROM 'object' OR (la->'n') IS DISTINCT FROM (ld->'n');
      r := jsonb_set(r, ARRAY['linhas', j::text], public.fn_obra_json_repor(la, ld, ARRAY['custo']));
    END LOOP;
  END IF;
  RETURN r;
END $function$;

-- As tarefas do plano sem o €/h de cada pessoa (exec.ch e exec.envios[].ch): sai do salário (fn_rh_custo_hora_pessoa).
CREATE OR REPLACE FUNCTION public.fn_obra_emylia_sem_ch(e jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb := e;
BEGIN
  IF jsonb_typeof(e) IS DISTINCT FROM 'object' THEN RETURN e; END IF;
  IF jsonb_typeof(r->'plano') = 'object' AND jsonb_typeof(r->'plano'->'tasks') = 'array' THEN
    r := jsonb_set(r, '{plano,tasks}', (
      SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(t) = 'object' AND jsonb_typeof(t->'exec') = 'object' THEN
               jsonb_set(t, '{exec}', CASE WHEN jsonb_typeof(t->'exec'->'envios') = 'array'
                 THEN jsonb_set((t->'exec') - 'ch', '{envios}', (SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(x) = 'object' THEN x - 'ch' ELSE x END ORDER BY j), '[]'::jsonb)
                                                                FROM jsonb_array_elements(t->'exec'->'envios') WITH ORDINALITY z(x, j)))
                 ELSE (t->'exec') - 'ch' END)
             ELSE t END ORDER BY i), '[]'::jsonb)
      FROM jsonb_array_elements(r->'plano'->'tasks') WITH ORDINALITY y(t, i)));
  END IF;
  RETURN r;
END $function$;

-- Repõe nas tarefas o que fn_obra_tarefa_sem_valores tira (preço dos materiais, €/h), tarefa a tarefa pelo índice e pelo nome
-- (o mesmo laço de fn_obra_emylia_repor_valores).
CREATE OR REPLACE FUNCTION public.fn_obra_emylia_repor_tarefas(p_base jsonb, p_novo jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE d jsonb := p_novo; i int; ta jsonb; td jsonb;
BEGIN
  IF jsonb_typeof(p_base) IS DISTINCT FROM 'object' OR jsonb_typeof(p_novo) IS DISTINCT FROM 'object' THEN RETURN p_novo; END IF;
  IF jsonb_typeof(p_base->'plano') = 'object' AND jsonb_typeof(p_base->'plano'->'tasks') = 'array'
     AND jsonb_typeof(d->'plano') = 'object' AND jsonb_typeof(d->'plano'->'tasks') = 'array' THEN
    FOR i IN 0 .. least(jsonb_array_length(p_base->'plano'->'tasks'), jsonb_array_length(d->'plano'->'tasks')) - 1 LOOP
      ta := p_base->'plano'->'tasks'->i; td := d->'plano'->'tasks'->i;
      CONTINUE WHEN jsonb_typeof(ta) IS DISTINCT FROM 'object' OR jsonb_typeof(td) IS DISTINCT FROM 'object' OR (ta->'nome') IS DISTINCT FROM (td->'nome');
      d := jsonb_set(d, ARRAY['plano', 'tasks', i::text], public.fn_obra_tarefa_repor_valores(ta, td));
    END LOOP;
  END IF;
  RETURN d;
END $function$;

-- O estado da Emylia para quem não vê custos (fn_quote_custos_pode), como neg_ler_negocios/fn_neg_ler_orcamento: os custos e as
-- margens a null, os preços de venda ficam. real: custoReal, m; realFases: custoPrev, custoReal e, por fase, prev.custo, real.custo,
-- margemPrev, margemReal; ec e ecsAjuste: custo e linhas[].custo; tarefas: preço dos materiais e €/h (fn_obra_tarefa_sem_valores).
CREATE OR REPLACE FUNCTION public.fn_obra_emylia_sem_custos(e jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb;
BEGIN
  IF jsonb_typeof(e) IS DISTINCT FROM 'object' THEN RETURN e; END IF;
  r := e;
  IF jsonb_typeof(r->'real') = 'object' THEN
    r := jsonb_set(r, '{real}', public.fn_obra_json_anular(r->'real', ARRAY['custoReal', 'm']));
  END IF;
  IF jsonb_typeof(r->'realFases') = 'object' THEN
    r := jsonb_set(r, '{realFases}', public.fn_obra_json_anular(r->'realFases', ARRAY['custoPrev', 'custoReal']));
    IF jsonb_typeof(r->'realFases'->'fases') = 'array' THEN
      r := jsonb_set(r, '{realFases,fases}', (
        SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(f) = 'object' THEN
                 public.fn_obra_json_anular(f, ARRAY['margemPrev', 'margemReal'])
                 || CASE WHEN jsonb_typeof(f->'prev') = 'object' THEN jsonb_build_object('prev', public.fn_obra_json_anular(f->'prev', ARRAY['custo'])) ELSE '{}'::jsonb END
                 || CASE WHEN jsonb_typeof(f->'real') = 'object' THEN jsonb_build_object('real', public.fn_obra_json_anular(f->'real', ARRAY['custo'])) ELSE '{}'::jsonb END
               ELSE f END ORDER BY i), '[]'::jsonb)
        FROM jsonb_array_elements(r->'realFases'->'fases') WITH ORDINALITY y(f, i)));
    END IF;
  END IF;
  IF jsonb_typeof(r->'ec') = 'object' THEN
    r := jsonb_set(r, '{ec}', public.fn_obra_ec_sem_custos(r->'ec'));
  END IF;
  IF jsonb_typeof(r->'ecsAjuste') = 'array' THEN
    r := jsonb_set(r, '{ecsAjuste}', (SELECT coalesce(jsonb_agg(public.fn_obra_ec_sem_custos(x) ORDER BY i), '[]'::jsonb)
                                      FROM jsonb_array_elements(r->'ecsAjuste') WITH ORDINALITY y(x, i)));
  END IF;
  IF jsonb_typeof(r->'plano') = 'object' AND jsonb_typeof(r->'plano'->'tasks') = 'array' THEN
    r := jsonb_set(r, '{plano,tasks}', (SELECT coalesce(jsonb_agg(public.fn_obra_tarefa_sem_valores(t) ORDER BY i), '[]'::jsonb)
                                         FROM jsonb_array_elements(r->'plano'->'tasks') WITH ORDINALITY y(t, i)));
  END IF;
  RETURN r;
END $function$;

-- Ao gravar, quem não vê custos repõe da base o que fn_obra_emylia_sem_custos tirou, quando chega a null ou não chega (o resto, o que
-- quem planeia mudou, passa como vem). As fases da realFases pelo índice e pelo n; as ecsAjuste pelo n (EC-…-A<k>); as linhas pelo
-- índice e pelo n; as tarefas pelo índice e pelo nome.
CREATE OR REPLACE FUNCTION public.fn_obra_emylia_repor_custos(p_base jsonb, p_novo jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE d jsonb := p_novo; i int; fa jsonb; fd jsonb; x jsonb; a jsonb;
BEGIN
  IF jsonb_typeof(p_base) IS DISTINCT FROM 'object' OR jsonb_typeof(p_novo) IS DISTINCT FROM 'object' THEN RETURN p_novo; END IF;
  IF jsonb_typeof(p_base->'real') = 'object' AND jsonb_typeof(d->'real') = 'object' THEN
    d := jsonb_set(d, '{real}', public.fn_obra_json_repor(p_base->'real', d->'real', ARRAY['custoReal', 'm']));
  END IF;
  IF jsonb_typeof(p_base->'realFases') = 'object' AND jsonb_typeof(d->'realFases') = 'object' THEN
    d := jsonb_set(d, '{realFases}', public.fn_obra_json_repor(p_base->'realFases', d->'realFases', ARRAY['custoPrev', 'custoReal']));
    IF jsonb_typeof(p_base->'realFases'->'fases') = 'array' AND jsonb_typeof(d->'realFases'->'fases') = 'array' THEN
      FOR i IN 0 .. least(jsonb_array_length(p_base->'realFases'->'fases'), jsonb_array_length(d->'realFases'->'fases')) - 1 LOOP
        fa := p_base->'realFases'->'fases'->i; fd := d->'realFases'->'fases'->i;
        CONTINUE WHEN jsonb_typeof(fa) IS DISTINCT FROM 'object' OR jsonb_typeof(fd) IS DISTINCT FROM 'object' OR (fa->'n') IS DISTINCT FROM (fd->'n');
        fd := public.fn_obra_json_repor(fa, fd, ARRAY['margemPrev', 'margemReal']);
        IF jsonb_typeof(fa->'prev') = 'object' AND jsonb_typeof(fd->'prev') = 'object' THEN
          fd := jsonb_set(fd, '{prev}', public.fn_obra_json_repor(fa->'prev', fd->'prev', ARRAY['custo']));
        END IF;
        IF jsonb_typeof(fa->'real') = 'object' AND jsonb_typeof(fd->'real') = 'object' THEN
          fd := jsonb_set(fd, '{real}', public.fn_obra_json_repor(fa->'real', fd->'real', ARRAY['custo']));
        END IF;
        d := jsonb_set(d, ARRAY['realFases', 'fases', i::text], fd);
      END LOOP;
    END IF;
  END IF;
  IF jsonb_typeof(p_base->'ec') = 'object' AND jsonb_typeof(d->'ec') = 'object' THEN
    d := jsonb_set(d, '{ec}', public.fn_obra_ec_repor_custos(p_base->'ec', d->'ec'));
  END IF;
  IF jsonb_typeof(p_base->'ecsAjuste') = 'array' AND jsonb_typeof(d->'ecsAjuste') = 'array' THEN
    FOR i IN 0 .. jsonb_array_length(d->'ecsAjuste') - 1 LOOP
      x := d->'ecsAjuste'->i;
      CONTINUE WHEN jsonb_typeof(x) IS DISTINCT FROM 'object' OR x->'n' IS NULL;
      SELECT y.e INTO a FROM jsonb_array_elements(p_base->'ecsAjuste') WITH ORDINALITY y(e, o)
      WHERE jsonb_typeof(y.e) = 'object' AND (y.e->'n') = (x->'n') ORDER BY y.o LIMIT 1;
      CONTINUE WHEN a IS NULL;
      d := jsonb_set(d, ARRAY['ecsAjuste', i::text], public.fn_obra_ec_repor_custos(a, x));
      a := NULL;
    END LOOP;
  END IF;
  RETURN public.fn_obra_emylia_repor_tarefas(p_base, d);
END $function$;

CREATE OR REPLACE FUNCTION public.fn_obra_emylia_sem_valores(e jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb;
BEGIN
  IF jsonb_typeof(e) IS DISTINCT FROM 'object' THEN RETURN e; END IF;
  -- 20270112150000: também as EC de ajuste (valor, custo, linhas) e a conversa com o cliente (neg_mensagens_ler recusa o técnico)
  r := e - ARRAY['real', 'realFases', 'ec', 'ecsAjuste', 'chat'];
  IF jsonb_typeof(r->'plano') = 'object' AND jsonb_typeof(r->'plano'->'tasks') = 'array' THEN
    r := jsonb_set(r, '{plano,tasks}', (SELECT coalesce(jsonb_agg(public.fn_obra_tarefa_sem_valores(t) ORDER BY i), '[]'::jsonb)
                                         FROM jsonb_array_elements(r->'plano'->'tasks') WITH ORDINALITY y(t, i)));
  END IF;
  RETURN r;
END $function$
;

CREATE OR REPLACE FUNCTION public.fn_obra_emylia_repor_valores(p_base jsonb, p_novo jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE d jsonb := p_novo; k text; i int; ta jsonb; td jsonb;
BEGIN
  IF jsonb_typeof(p_base) IS DISTINCT FROM 'object' OR jsonb_typeof(p_novo) IS DISTINCT FROM 'object' THEN RETURN p_novo; END IF;
  -- 20270112150000: ecsAjuste e chat (fn_obra_emylia_sem_valores tira-os)
  FOREACH k IN ARRAY ARRAY['real', 'realFases', 'ec', 'ecsAjuste', 'chat'] LOOP
    d := CASE WHEN p_base ? k THEN jsonb_set(d, ARRAY[k], p_base->k) ELSE d - k END;
  END LOOP;
  IF jsonb_typeof(p_base->'plano') = 'object' AND jsonb_typeof(p_base->'plano'->'tasks') = 'array'
     AND jsonb_typeof(d->'plano') = 'object' AND jsonb_typeof(d->'plano'->'tasks') = 'array' THEN
    FOR i IN 0 .. least(jsonb_array_length(p_base->'plano'->'tasks'), jsonb_array_length(d->'plano'->'tasks')) - 1 LOOP
      ta := p_base->'plano'->'tasks'->i; td := d->'plano'->'tasks'->i;
      CONTINUE WHEN jsonb_typeof(ta) IS DISTINCT FROM 'object' OR jsonb_typeof(td) IS DISTINCT FROM 'object' OR (ta->'nome') IS DISTINCT FROM (td->'nome');
      d := jsonb_set(d, ARRAY['plano', 'tasks', i::text], public.fn_obra_tarefa_repor_valores(ta, td));
    END LOOP;
  END IF;
  RETURN d;
END $function$
;

CREATE OR REPLACE FUNCTION public.obra_ler_negocios(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- 20270110400000: as mesmas obras que neg_ler_negocios (o âmbito de pessoas.view sobre o negócio)
  v_tudo boolean; v_chaves text[]; v_tarefas uuid[];
  v_ids uuid[]; -- 20270111100000
  v_custos boolean; v_ret boolean; -- 20270112150000
BEGIN
  -- 20270111100000: sem pessoas.view mas com negocios.obra.executar: só as obras onde trabalha, com o estado da Emylia sem valores
  -- (fn_obra_emylia_sem_valores); ao gravar, obra_guardar_negocio repõe-nos da base (fn_obra_emylia_repor_valores)
  IF public.fn_neg_so_execucao(p_org, 'pessoas.view') THEN
    v_ids := public.fn_neg_ids_do_tecnico(p_org);
    RETURN coalesce((
      SELECT jsonb_agg(jsonb_build_object('negocio_id', o.negocio_id, 'obra_id', o.id, 'codigo', o.codigo, 'estado', o.estado,
                                          'emylia', public.fn_obra_emylia_sem_valores(o.estado_emylia)) ORDER BY o.criada_em)
      FROM ops_obra o JOIN negocios n ON n.id = o.negocio_id AND n.organization_id = p_org AND n.deleted_at IS NULL
      WHERE o.organization_id = p_org AND o.negocio_id IS NOT NULL AND n.id = ANY (v_ids)), '[]'::jsonb);
  END IF;
  PERFORM public.fn_cat_exigir(p_org, 'pessoas.view');
  -- 20270112150000: na leitura completa, sem fn_quote_custos_pode os custos e as margens vêm a null como em neg_ler_negocios
  -- (fn_obra_emylia_sem_custos; os preços de venda ficam) e, sem hr.pessoas.retribuicao.view, sai o €/h de cada pessoa (exec.ch,
  -- exec.envios[].ch: vem do salário). obra_guardar_negocio repõe-nos da base ao gravar.
  v_custos := public.fn_quote_custos_pode(p_org);
  v_ret := public.is_system_admin_user(auth.uid()) OR public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.retribuicao.view', p_org);
  v_tudo := public.fn_neg_ambito_tudo(p_org, 'pessoas.view');
  IF NOT v_tudo THEN
    v_chaves := public.crm_scope_keys('pessoas.view');
    v_tarefas := public.fn_neg_ids_com_tarefa(p_org);
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('negocio_id', o.negocio_id, 'obra_id', o.id, 'codigo', o.codigo, 'estado', o.estado,
                                        'emylia', CASE WHEN NOT v_custos THEN public.fn_obra_emylia_sem_custos(o.estado_emylia)
                                                       WHEN NOT v_ret THEN public.fn_obra_emylia_sem_ch(o.estado_emylia)
                                                       ELSE o.estado_emylia END) ORDER BY o.criada_em)
    FROM ops_obra o JOIN negocios n ON n.id = o.negocio_id AND n.organization_id = p_org AND n.deleted_at IS NULL
    WHERE o.organization_id = p_org AND o.negocio_id IS NOT NULL
      AND (v_tudo OR public.fn_ambito_casa(v_chaves, n.organization_id, ARRAY[n.assigned_to, n.created_by])
           OR n.id = ANY (v_tarefas))), '[]'::jsonb); -- 20270110400000
END $function$
;

CREATE OR REPLACE FUNCTION public.obra_guardar_negocio(p_org uuid, p_negocio_id uuid, p_obra jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- 20270102220000: o código antigo do papel da obra deu lugar a negocios.obra.planear (o Gestor de obra) e negocios.obra.executar (o técnico)
  v_user uuid := public.fn_cat_exigir_uma(p_org, ARRAY['pessoas.edit', 'negocios.obra.planear', 'negocios.obra.executar']);
  v_existe boolean; v_planear boolean; v_executar boolean; v_eu uuid; v_porque text; s record;
  v_neg negocios; v_obra ops_obra; v_codigo text; v_estado text; v_plano boolean; v_inicio date;
  t jsonb; v_chave text; v_nome text; v_fase uuid; v_tar uuid; v_skill uuid; v_skill_nome text; v_pessoa uuid; v_tarestado text; v_pessoas smallint;
  v_chaves text[] := '{}'; v_avisos text[] := '{}';
  v_imp_a jsonb; v_imp_d jsonb; v_auto_a jsonb; v_auto_d jsonb; -- 20270105200000
  v_so boolean; -- 20270111100000
BEGIN
  SELECT * INTO v_neg FROM negocios WHERE id = p_negocio_id AND organization_id = p_org AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Negócio não encontrado nesta organização.' USING ERRCODE = 'NE003'; END IF;
  -- 20270110400000: o âmbito de pessoas.edit sobre o negócio (dono = assigned_to/created_by; TEAM/ORG pelas chaves). Mantêm o acesso
  -- de antes: admin, quem entra sem pessoas.edit no perfil (Papel no Negócio, obra.planear/executar) ou tem um Papel no Negócio
  -- que dá pessoas.edit, e quem tem tarefas na obra deste negócio (fn_neg_no_ambito).
  IF NOT public.fn_neg_no_ambito(v_neg, 'pessoas.edit') THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.edit): este negócio está fora do seu âmbito.' USING ERRCODE = 'CT001';
  END IF;
  IF p_obra IS NULL OR jsonb_typeof(p_obra) <> 'object' THEN RAISE EXCEPTION 'A obra tem de ser um objeto.' USING ERRCODE = 'CT002'; END IF;
  v_plano := coalesce(jsonb_typeof(p_obra->'tarefas') = 'array', false);
  v_estado := coalesce(nullif(p_obra->>'estado', ''), 'planeada');
  IF v_estado NOT IN ('planeada', 'em_curso', 'suspensa', 'concluida', 'cancelada') THEN
    RAISE EXCEPTION 'Estado da obra inválido: %.', v_estado USING ERRCODE = 'CT002';
  END IF;
  BEGIN
    v_inicio := nullif(p_obra->>'inicio', '')::date;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Data de início inválida: %.', p_obra->>'inicio' USING ERRCODE = 'CT002';
  END;

  SELECT * INTO v_obra FROM ops_obra WHERE negocio_id = p_negocio_id AND organization_id = p_org FOR UPDATE;
  v_existe := FOUND;
  -- 20270111100000: quem lê as obras reduzidas (sem pessoas.view, com negocios.obra.executar) só grava as obras que recebe
  -- (fn_neg_ids_do_tecnico), só como execução (nunca pelo ramo de planear: a leitura dele não tem o orçamento) e com o que a leitura
  -- tirou reposto da base antes de tudo (custos reais, a cópia da encomenda, preços dos materiais, €/h dos registos gravados).
  v_so := public.fn_neg_so_execucao(p_org, 'pessoas.view');
  IF v_so THEN
    IF NOT (p_negocio_id = ANY (public.fn_neg_ids_do_tecnico(p_org))) THEN
      RAISE EXCEPTION 'Sem permissão (pessoas.view): esta obra não tem tarefas nem visitas suas.' USING ERRCODE = 'CT001';
    END IF;
    IF v_existe AND jsonb_typeof(p_obra->'emylia') = 'object' THEN
      p_obra := jsonb_set(p_obra, '{emylia}', public.fn_obra_emylia_repor_valores(v_obra.estado_emylia, p_obra->'emylia'));
    END IF;
  END IF;
  -- 20270112150000: a leitura completa (obra_ler_negocios) tira os custos sem fn_quote_custos_pode e o €/h sem
  -- hr.pessoas.retribuicao.view: repõe-se da base o que chegou a null ou não chegou, antes das regras de execução e do €/h do servidor.
  IF NOT v_so AND v_existe AND jsonb_typeof(p_obra->'emylia') = 'object' THEN
    IF NOT public.fn_quote_custos_pode(p_org) THEN
      p_obra := jsonb_set(p_obra, '{emylia}', public.fn_obra_emylia_repor_custos(v_obra.estado_emylia, p_obra->'emylia'));
    ELSIF NOT (public.is_system_admin_user(auth.uid())
               OR public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.retribuicao.view', p_org)) THEN
      p_obra := jsonb_set(p_obra, '{emylia}', public.fn_obra_emylia_repor_tarefas(v_obra.estado_emylia, p_obra->'emylia'));
    END IF;
  END IF;
  -- 20270111200000: o €/h dos registos de horas novos é o do servidor (fn_obra_emylia_ch_servidor: a pessoa da tarefa,
  -- fn_rh_custo_hora_pessoa); os gravados ficam com o deles. Para todos os que gravam; gravar sem mudanças não muda nada.
  IF jsonb_typeof(p_obra->'emylia') = 'object' THEN
    p_obra := jsonb_set(p_obra, '{emylia}', public.fn_obra_emylia_ch_servidor(p_org, CASE WHEN v_existe THEN v_obra.id END,
                                                                               CASE WHEN v_existe THEN v_obra.estado_emylia END, p_obra->'emylia'));
  END IF;

  -- 20270102220000: sem negocios.obra.planear, compara-se a obra gravada com a nova e só passa o que é de quem executa: as tarefas
  -- atribuídas a ele (ops_obra_tarefa_rh; no estado da Emylia, tasks[i].tec), marcadas em curso ou feitas, com os registos, as
  -- fotografias, as notas e os imprevistos delas (fn_obra_execucao_permitida). Gravar sem mudanças passa sempre. O plano, o estado da
  -- obra, o cancelamento, a atribuição dos técnicos, a validação e as tarefas novas ou apagadas são do Gestor de obra.
  v_planear := public.fn_cat_pode(p_org, 'negocios.obra.planear') AND NOT v_so; -- 20270111100000
  IF NOT v_planear AND NOT v_existe THEN
    -- a obra nasce do orçamento (o plano gerado, por aprovar, sem nada feito): quem grava o negócio pode criá-la
    IF v_plano AND (v_estado <> 'planeada' OR NOT public.fn_cat_pode(p_org, 'pessoas.edit')
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_obra->'tarefas') x WHERE coalesce(nullif(x->>'estado', ''), 'por_fazer') <> 'por_fazer')) THEN
      RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): só o Gestor de obra cria uma obra que já não está só planeada.' USING ERRCODE = 'CT001';
    END IF;
  ELSIF NOT v_planear THEN
    v_executar := public.fn_cat_pode(p_org, 'negocios.obra.executar');
    v_eu := CASE WHEN v_executar THEN public.fn_neg_pessoa_da_conta(p_org) END;
    IF NOT v_plano OR v_estado IS DISTINCT FROM v_obra.estado THEN
      RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): não pode mudar o estado da obra nem cancelá-la.' USING ERRCODE = 'CT001';
    END IF;
    IF (SELECT coalesce(array_agg(t.chave ORDER BY t.chave), '{}') FROM ops_obra_tarefa t WHERE t.obra_id = v_obra.id)
       IS DISTINCT FROM (SELECT coalesce(array_agg(btrim(x->>'chave') ORDER BY btrim(x->>'chave')), '{}') FROM jsonb_array_elements(p_obra->'tarefas') x) THEN
      RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): não pode juntar nem tirar tarefas do plano.' USING ERRCODE = 'CT001';
    END IF;
    FOR s IN SELECT t.chave, t.nome, t.estado, (SELECT r.pessoa_id FROM ops_obra_tarefa_rh r WHERE r.tarefa_id = t.id LIMIT 1) AS pessoa,
                    CASE WHEN coalesce(nullif(x->>'estado', ''), 'por_fazer') IN ('por_fazer', 'em_curso', 'feita', 'validada', 'rejeitada')
                         THEN coalesce(nullif(x->>'estado', ''), 'por_fazer') ELSE 'por_fazer' END AS novo,
                    CASE WHEN coalesce(x->>'pessoa', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (x->>'pessoa')::uuid END AS nova_pessoa
             FROM ops_obra_tarefa t JOIN jsonb_array_elements(p_obra->'tarefas') x ON btrim(x->>'chave') = t.chave
             WHERE t.obra_id = v_obra.id LOOP
      IF s.nova_pessoa IS DISTINCT FROM s.pessoa THEN
        RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): não pode mudar o técnico da tarefa %.', s.nome USING ERRCODE = 'CT001';
      END IF;
      IF s.novo IS DISTINCT FROM s.estado AND NOT (v_eu IS NOT NULL AND s.pessoa = v_eu AND s.estado <> 'validada' AND s.novo IN ('em_curso', 'feita')) THEN
        -- 20270105500000: sem negocios.obra.executar a falta é essa (não a do Gestor de obra); a regra não muda, só a mensagem
        IF NOT coalesce(v_executar, false) THEN
          RAISE EXCEPTION 'Sem permissão (negocios.obra.executar): não pode marcar a tarefa % em curso ou feita.', s.nome
            USING ERRCODE = 'CT001';
        END IF;
        RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): na tarefa % só quem a tem atribuída a marca em curso ou feita; validar e pedir correção é do Gestor de obra.', s.nome
          USING ERRCODE = 'CT001';
      END IF;
    END LOOP;
    v_porque := public.fn_obra_execucao_permitida(v_obra.estado_emylia, p_obra->'emylia', v_eu);
    IF v_porque IS NOT NULL THEN
      -- 20270105700000: sem negocios.obra.executar o que falta é ela (não planear)
      RAISE EXCEPTION 'Sem permissão (%): não pode mudar %; só regista a execução das tarefas atribuídas a si.',
        CASE WHEN v_executar THEN 'negocios.obra.planear' ELSE 'negocios.obra.executar' END, v_porque USING ERRCODE = 'CT001';
    END IF;
    -- grava só a execução: o estado da Emylia e o estado das tarefas dele; o resto da projeção (datas, nomes, técnicos) fica o da base
    UPDATE ops_obra SET estado_emylia = p_obra->'emylia', atualizada_em = now()
    WHERE id = v_obra.id AND estado_emylia IS DISTINCT FROM p_obra->'emylia';
    UPDATE ops_obra_tarefa t SET estado = x.novo, atualizada_em = now()
    FROM (SELECT btrim(y->>'chave') AS chave, CASE WHEN coalesce(nullif(y->>'estado', ''), 'por_fazer') IN ('por_fazer', 'em_curso', 'feita', 'validada', 'rejeitada')
                         THEN coalesce(nullif(y->>'estado', ''), 'por_fazer') ELSE 'por_fazer' END AS novo FROM jsonb_array_elements(p_obra->'tarefas') y) x
    WHERE t.obra_id = v_obra.id AND t.chave = x.chave AND t.estado IS DISTINCT FROM x.novo;
    RETURN jsonb_build_object('obra_id', v_obra.id, 'codigo', v_obra.codigo, 'avisos', '[]'::jsonb);
  END IF;

  -- 20270105200000: daqui para baixo grava quem planeia (ou quem cria a obra só planeada). Por cima disso:
  --   negocios.obra.imprevistos  mudar ou tirar um imprevisto já gravado (propor ao cliente, decidir, fechar). Registar um novo (no fim da
  --                              lista) não a pede: é da execução (fn_obra_execucao_permitida) ou do planeamento.
  --   negocios.obra.fechar       a obra passar a concluída, ou o auto de receção mudar (enviá-lo). A assinatura do auto que o cliente fez no
  --                              portal (negocio_rececao_cliente com o mesmo número) passa sem ela: é o espelho do que já está na base.
  v_imp_a := public.fn_neg_lista(CASE WHEN v_existe THEN v_obra.estado_emylia->'imprevistos' END);
  v_imp_d := public.fn_neg_lista(p_obra->'emylia'->'imprevistos');
  IF (jsonb_array_length(v_imp_d) < jsonb_array_length(v_imp_a)
      OR EXISTS (SELECT 1 FROM generate_series(0, jsonb_array_length(v_imp_a) - 1) i WHERE (v_imp_d->i) IS DISTINCT FROM (v_imp_a->i)))
     AND NOT public.fn_cat_pode(p_org, 'negocios.obra.imprevistos') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.obra.imprevistos): não pode propor nem decidir os imprevistos da obra.' USING ERRCODE = 'CT001';
  END IF;
  v_auto_a := CASE WHEN v_existe AND jsonb_typeof(v_obra.estado_emylia->'auto') = 'object' THEN v_obra.estado_emylia->'auto' END;
  v_auto_d := CASE WHEN jsonb_typeof(p_obra->'emylia'->'auto') = 'object' THEN p_obra->'emylia'->'auto' END;
  IF ((v_estado = 'concluida' AND (NOT v_existe OR v_obra.estado IS DISTINCT FROM 'concluida'))
      OR (v_auto_d IS DISTINCT FROM v_auto_a
          AND NOT (v_auto_a->>'estado' = 'por assinar' AND v_auto_d->>'estado' = 'assinado' AND v_auto_d->>'n' = v_auto_a->>'n'
                   AND (v_auto_d - ARRAY['estado', 'assinado', 'assinatura', 'reservas']) = (v_auto_a - ARRAY['estado', 'assinado', 'assinatura', 'reservas'])
                   AND EXISTS (SELECT 1 FROM negocio_rececao_cliente r WHERE r.negocio_id = p_negocio_id AND r.auto_n = v_auto_d->>'n'))))
     AND NOT public.fn_cat_pode(p_org, 'negocios.obra.fechar') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.obra.fechar): não pode encerrar a obra nem enviar o auto de receção.' USING ERRCODE = 'CT001';
  END IF;

  IF NOT v_existe THEN
    IF NOT v_plano THEN RETURN jsonb_build_object('obra_id', NULL, 'codigo', NULL, 'avisos', '[]'::jsonb); END IF;
    v_codigo := 'OB-' || coalesce(v_neg.numero::text, left(p_negocio_id::text, 8));
    IF EXISTS (SELECT 1 FROM ops_obra WHERE organization_id = p_org AND codigo = v_codigo) THEN
      v_codigo := v_codigo || '-' || left(replace(gen_random_uuid()::text, '-', ''), 4);
    END IF;
    INSERT INTO ops_obra (organization_id, codigo, negocio_id, titulo, morada, estado, data_inicio_prevista, criada_por, estado_emylia,
                          iniciada_em, concluida_em)
    VALUES (p_org, v_codigo, p_negocio_id,
            coalesce(nullif(btrim(p_obra->>'titulo'), ''), nullif(btrim(v_neg.titulo), ''), 'Obra ' || v_codigo),
            nullif(btrim(coalesce(p_obra->>'morada', '')), ''), v_estado, v_inicio, v_user, p_obra->'emylia',
            CASE WHEN v_estado IN ('em_curso', 'concluida') THEN now() END, CASE WHEN v_estado = 'concluida' THEN now() END)
    RETURNING * INTO v_obra;
  ELSE
    UPDATE ops_obra SET
      titulo = coalesce(nullif(btrim(p_obra->>'titulo'), ''), titulo),
      morada = coalesce(nullif(btrim(coalesce(p_obra->>'morada', '')), ''), morada),
      estado = CASE WHEN v_plano THEN v_estado ELSE 'cancelada' END,
      data_inicio_prevista = coalesce(v_inicio, data_inicio_prevista),
      iniciada_em = CASE WHEN v_estado IN ('em_curso', 'concluida') THEN coalesce(iniciada_em, now()) ELSE iniciada_em END,
      concluida_em = CASE WHEN v_estado = 'concluida' THEN coalesce(concluida_em, now()) ELSE concluida_em END,
      estado_emylia = p_obra->'emylia',
      atualizada_em = now()
    WHERE id = v_obra.id
    RETURNING * INTO v_obra;
  END IF;

  IF NOT v_plano THEN
    DELETE FROM ops_obra_tarefa_rh WHERE obra_id = v_obra.id;
    RETURN jsonb_build_object('obra_id', v_obra.id, 'codigo', v_obra.codigo, 'avisos', '[]'::jsonb);
  END IF;

  -- as fases: as que o motor manda e as que as tarefas usam
  INSERT INTO ops_obra_fase (organization_id, obra_id, ordem, nome)
  SELECT p_org, v_obra.id, f.ordem, coalesce(max(f.nome), 'Fase ' || f.ordem)
  FROM (
    SELECT (x->>'ordem')::smallint AS ordem, nullif(btrim(x->>'nome'), '') AS nome
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_obra->'fases') = 'array' THEN p_obra->'fases' ELSE '[]'::jsonb END) x
    UNION ALL
    SELECT coalesce((x->>'fase')::smallint, 0), NULL FROM jsonb_array_elements(p_obra->'tarefas') x
  ) f
  GROUP BY f.ordem
  ON CONFLICT (obra_id, ordem) DO UPDATE SET nome = EXCLUDED.nome WHERE ops_obra_fase.nome IS DISTINCT FROM EXCLUDED.nome;

  FOR t IN SELECT x FROM jsonb_array_elements(p_obra->'tarefas') x LOOP
    v_chave := nullif(btrim(coalesce(t->>'chave', '')), '');
    v_nome := nullif(btrim(coalesce(t->>'nome', '')), '');
    IF v_chave IS NULL OR v_nome IS NULL THEN RAISE EXCEPTION 'Cada tarefa precisa de chave e nome.' USING ERRCODE = 'CT002'; END IF;
    IF v_chave = ANY (v_chaves) THEN RAISE EXCEPTION 'Tarefa repetida: %.', v_chave USING ERRCODE = 'CT002'; END IF;
    v_chaves := v_chaves || v_chave;

    v_skill := NULL; v_skill_nome := NULL;
    IF nullif(t->>'perfil', '') IS NOT NULL THEN
      SELECT k.id, k.nome INTO v_skill, v_skill_nome FROM ops_skill k
      WHERE k.organization_id = p_org AND (k.chave = t->>'perfil' OR k.id::text = t->>'perfil') LIMIT 1;
    END IF;
    SELECT id INTO v_fase FROM ops_obra_fase WHERE obra_id = v_obra.id AND ordem = coalesce((t->>'fase')::smallint, 0);
    v_tarestado := coalesce(nullif(t->>'estado', ''), 'por_fazer');
    IF v_tarestado NOT IN ('por_fazer', 'em_curso', 'feita', 'validada', 'rejeitada') THEN v_tarestado := 'por_fazer'; END IF;
    v_pessoas := least(20, greatest(1, coalesce((t->>'pessoas')::int, 1)));

    v_tar := NULL;
    SELECT id INTO v_tar FROM ops_obra_tarefa WHERE obra_id = v_obra.id AND chave = v_chave;
    IF v_tar IS NULL THEN
      INSERT INTO ops_obra_tarefa (organization_id, obra_id, fase_id, ordem, nome, minutos_previstos, inicio_planeado, fim_planeado,
                                   estado, skill_id, chave, pessoas_previstas)
      VALUES (p_org, v_obra.id, v_fase, coalesce((t->>'ordem')::int, 0), v_nome, greatest(1, coalesce(round((t->>'minutos')::numeric), 60))::int,
              nullif(t->>'inicio', '')::date, nullif(t->>'fim', '')::date, v_tarestado, v_skill, v_chave, v_pessoas)
      RETURNING id INTO v_tar;
    ELSE
      UPDATE ops_obra_tarefa SET fase_id = v_fase, ordem = coalesce((t->>'ordem')::int, 0), nome = v_nome,
        minutos_previstos = greatest(1, coalesce(round((t->>'minutos')::numeric), 60))::int,
        inicio_planeado = nullif(t->>'inicio', '')::date, fim_planeado = nullif(t->>'fim', '')::date,
        estado = v_tarestado, skill_id = v_skill, pessoas_previstas = v_pessoas, atualizada_em = now()
      WHERE id = v_tar
        AND (fase_id, ordem, nome, minutos_previstos, inicio_planeado, fim_planeado, estado, skill_id, pessoas_previstas) IS DISTINCT FROM
            (v_fase, coalesce((t->>'ordem')::int, 0), v_nome, greatest(1, coalesce(round((t->>'minutos')::numeric), 60))::int,
             nullif(t->>'inicio', '')::date, nullif(t->>'fim', '')::date, v_tarestado, v_skill, v_pessoas);
    END IF;

    -- quem a faz: só uma pessoa do RH desta organização
    v_pessoa := NULL;
    IF coalesce(t->>'pessoa', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT p.id INTO v_pessoa FROM pessoas p WHERE p.id = (t->>'pessoa')::uuid AND p.organization_id = p_org AND p.deleted_at IS NULL;
      IF v_pessoa IS NULL THEN
        v_avisos := v_avisos || format('%s: o técnico não é uma pessoa do RH desta organização. Ficou por atribuir.', v_nome);
      ELSIF NOT public.fn_rh_pessoa_tecnico_obra(p_org, v_pessoa) THEN -- 20270110600000: cargo ou perfil
        v_avisos := v_avisos || format('%s: a pessoa atribuída não tem cargo técnico de obra no RH nem o perfil de técnico de obra.', v_nome);
      ELSIF v_skill IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.fn_rh_oficios_efetivos(p_org, v_pessoa) o WHERE o.skill_id = v_skill) THEN
        v_avisos := v_avisos || format('%s: a pessoa atribuída não tem o ofício %s no RH.', v_nome, v_skill_nome);
      END IF;
    END IF;
    DELETE FROM ops_obra_tarefa_rh WHERE tarefa_id = v_tar AND pessoa_id IS DISTINCT FROM v_pessoa;
    IF v_pessoa IS NOT NULL THEN
      INSERT INTO ops_obra_tarefa_rh (organization_id, obra_id, tarefa_id, pessoa_id, atribuida_por)
      VALUES (p_org, v_obra.id, v_tar, v_pessoa, v_user)
      ON CONFLICT (tarefa_id, pessoa_id) DO NOTHING;
    END IF;
  END LOOP;

  -- o que saiu do plano sai da projeção (as fases só se nenhuma tarefa as usar)
  DELETE FROM ops_obra_tarefa WHERE obra_id = v_obra.id AND (chave IS NULL OR NOT (chave = ANY (v_chaves)));
  DELETE FROM ops_obra_fase f WHERE f.obra_id = v_obra.id AND NOT EXISTS (SELECT 1 FROM ops_obra_tarefa x WHERE x.fase_id = f.id);

  RETURN jsonb_build_object('obra_id', v_obra.id, 'codigo', v_obra.codigo, 'avisos', to_jsonb(v_avisos));
END $function$
;

REVOKE ALL ON FUNCTION public.fn_obra_json_anular(jsonb,text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_obra_json_repor(jsonb,jsonb,text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_obra_ec_sem_custos(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_obra_ec_repor_custos(jsonb,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_obra_emylia_sem_ch(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_obra_emylia_repor_tarefas(jsonb,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_obra_emylia_sem_custos(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_obra_emylia_repor_custos(jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_obra_json_anular(jsonb,text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_obra_json_repor(jsonb,jsonb,text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_obra_ec_sem_custos(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_obra_ec_repor_custos(jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_obra_emylia_sem_ch(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_obra_emylia_repor_tarefas(jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_obra_emylia_sem_custos(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_obra_emylia_repor_custos(jsonb,jsonb) TO service_role;
