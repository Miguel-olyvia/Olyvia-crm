-- ============================================================
-- Testes: 20270126260000_orcamento_total_pelas_linhas.sql (base RH, Mudelar)
-- ============================================================
-- O total do orçamento (preco_final, sem IVA, e total_com_iva) que o ecrã manda em neg_guardar_negocio tem de bater com as linhas e o
-- desconto, pela conta do ecrã (motor.ts: tot().pf e totaisIva().total): a soma de quantidade × preço de cada linha, menos o desconto
-- (em %, como no ecrã) e, com IVA, a taxa de cada linha; arredonda-se só no fim. Tolerância de 1 cêntimo. Antes, qualquer total passava
-- (linhas a 8.900,25 € gravavam um orçamento e uma proposta enviada a 1.000 €). As versões substituídas (o histórico) não se conferem.
--
-- Conta real da Mudelar (3242e925): Rui Jesus (comercial: orcamento.editar, proposta.enviar). Tudo dentro de BEGIN … ROLLBACK; cada caso
-- acaba em RAISE (desfaz-se) e parte do mesmo negócio de teste (na fase Negócio, sem orçamento).
--
-- Correr (o resultado útil é o último SELECT):
--   rhq.ps1 -SqlFile supabase/tests/orcamento_total_pelas_linhas.test.sql
-- ============================================================

BEGIN;
CREATE TEMP TABLE _rel (n serial, caso text, esperado text, obtido text) ON COMMIT DROP;

-- corre os passos por ordem e desfaz tudo; cada passo é {auth, json} (neg_guardar_negocio como essa conta) ou {portal_aceita: versão}
-- (o portal aceita a versão, como client-portal-action); devolve PASSA ou «código: mensagem» do primeiro que falhar
CREATE FUNCTION pg_temp.tentar(p_passos jsonb) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE v_msg text; v_st text; p jsonb;
BEGIN
  BEGIN
    FOR p IN SELECT * FROM jsonb_array_elements(p_passos) LOOP
      EXECUTE 'RESET ROLE';
      IF p ? 'portal_aceita' THEN
        PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
        EXECUTE 'SET LOCAL ROLE service_role';
        PERFORM public.set_audit_context(null, 'portal');
        UPDATE quotes SET estado = 'aceite' WHERE negocio_id = 'e2e0e2e0-0000-4000-8000-0000000a0702' AND versao = (p->>'portal_aceita')::smallint;
        CONTINUE;
      END IF;
      PERFORM set_config('request.jwt.claims', json_build_object('sub', p->>'auth', 'role', 'authenticated')::text, true);
      PERFORM set_config('request.jwt.claim.sub', p->>'auth', true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      PERFORM public.neg_guardar_negocio('3242e925-da26-459a-8258-be04d904e355', 'e2e0e2e0-0000-4000-8000-0000000a0702', p->'json');
    END LOOP;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '__desfazer__';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT, v_st = RETURNED_SQLSTATE;
  END;
  EXECUTE 'RESET ROLE';
  IF v_msg = '__desfazer__' THEN RETURN 'PASSA'; END IF;
  RETURN v_st || ': ' || left(v_msg, 220);
END $f$;

-- uma linha livre (p_iva: 'materiais' a 23 %, 'mao_obra' a 6 %; p_taxa: a taxa escrita, ou null)
CREATE FUNCTION pg_temp.l(p_ordem int, p_q numeric, p_pu numeric, p_iva text DEFAULT 'materiais', p_taxa numeric DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $f$
  SELECT jsonb_build_object('ordem', p_ordem, 'tipo', CASE WHEN p_iva = 'mao_obra' THEN 'servico' ELSE 'livre' END, 'descricao', 'Linha ' || p_ordem,
    'unidade', 'un', 'quantidade', p_q, 'preco_un', p_pu, 'parte_iva', p_iva, 'taxa_iva', p_taxa, 'custo', jsonb_build_object('custo_un', round(p_pu / 2, 2)))
$f$;

-- uma versão do orçamento
CREATE FUNCTION pg_temp.o(p_versao int, p_estado text, p_linhas jsonb, p_pf numeric, p_tci numeric, p_desconto numeric DEFAULT 0,
                          p_venda_direta boolean DEFAULT false) RETURNS jsonb LANGUAGE sql AS $f$
  SELECT jsonb_build_object('versao', p_versao, 'estado', p_estado, 'modelo', 'wc', 'desconto', p_desconto, 'venda_direta', p_venda_direta,
    'enviado_em', CASE WHEN p_estado IN ('enviado', 'aceite', 'substituido') THEN '2026-11-23T10:00:00Z' END,
    'substituido_em', CASE WHEN p_estado = 'substituido' THEN '2026-11-23T11:00:00Z' END,
    'preco_final', p_pf, 'total_com_iva', p_tci, 'zonas', jsonb_build_array('Geral'),
    'prestacoes', jsonb_build_array(jsonb_build_object('ordem', 1, 'rotulo', 'Na adjudicação', 'pct', 0.5, 'marco', 'adjudicacao'),
                                    jsonb_build_object('ordem', 2, 'rotulo', 'No fim da obra', 'pct', 0.5, 'marco', 'fim')),
    'linhas', p_linhas)
$f$;

-- o JSON do negócio (p_fase; as versões do orçamento)
CREATE FUNCTION pg_temp.j(p_fase int, p_orc jsonb) RETURNS jsonb LANGUAGE sql AS $f$
  SELECT jsonb_build_object(
    'negocio', jsonb_build_object('fase', p_fase, 'linha', 'wc', 'linha_por_definir', false, 'servico_pedido', 'Casa de banho', 'origem', 'à mão',
                                  'dono_papel', 'comercial', 'titulo', 'Teste 126260 total', 'morada_obra', 'Rua de Teste, 1'),
    'respostas', jsonb_build_array(
       jsonb_build_object('campo_chave', 'resultado', 'valor', 'Atendeu · interessado', 'sugerido', false),
       jsonb_build_object('campo_chave', 'tentativas', 'valor', '1', 'sugerido', false),
       jsonb_build_object('campo_chave', 'contacto_concluido', 'valor', '2026-11-23', 'sugerido', false),
       jsonb_build_object('campo_chave', 'v1_data', 'valor', '2026-11-25', 'sugerido', false),
       jsonb_build_object('campo_chave', 'v1_hora', 'valor', '10:00', 'sugerido', false),
       jsonb_build_object('campo_chave', 'v1_tipo', 'valor', 'Levantamento', 'sugerido', false),
       jsonb_build_object('campo_chave', 'v1_estado', 'valor', 'Marcada', 'sugerido', false),
       jsonb_build_object('campo_chave', 'v1_quem', 'valor', 'Rui Jesus', 'sugerido', false),
       jsonb_build_object('campo_chave', 'v1_duracao', 'valor', '1 h', 'sugerido', false)),
    'medidas', jsonb_build_object('slot', 'qua 25/11 · 10:00', 'fechada', p_fase >= 3, 'necessidades', '[]'::jsonb),
    'visitas', '[1]'::jsonb, 'servicos', '[]'::jsonb, 'produtos', '[]'::jsonb, 'historico', '[]'::jsonb,
    'orcamentos', coalesce(p_orc, '[]'::jsonb), 'contratos', '[]'::jsonb, 'faturas', '[]'::jsonb, 'adendas', '[]'::jsonb)
$f$;

-- ─── preparação: a assistente cria a pessoa e o negócio (dono: Rui Jesus) e marca a visita; o comercial passa-o a Negócio ───────────
DO $fx$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"e2d4acad-8911-40c8-8eb5-26282d57f577","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', 'e2d4acad-8911-40c8-8eb5-26282d57f577', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO anew_entities (id, organization_id, type, display_name, first_name, last_name, created_by)
  VALUES ('e2e0e2e0-0000-4000-8000-0000000a07e2', '3242e925-da26-459a-8258-be04d904e355', 'person', 'Cliente Teste 126260', 'Cliente', 'Teste',
          public.current_business_user_id());
  PERFORM public.neg_criar_negocio('e2e0e2e0-0000-4000-8000-0000000a0702', '3242e925-da26-459a-8258-be04d904e355',
    'e2e0e2e0-0000-4000-8000-0000000a07e2', 'Teste 126260 total', null, '830efc80-4a52-4a7e-ab66-6ea233a14f9e'::uuid, '[]'::jsonb,
    null, null, false, 'contrato');
  PERFORM public.neg_guardar_negocio('3242e925-da26-459a-8258-be04d904e355', 'e2e0e2e0-0000-4000-8000-0000000a0702', pg_temp.j(2, null));
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"sub":"6de385dc-b039-46dc-b793-c5cdefc095c3","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', '6de385dc-b039-46dc-b793-c5cdefc095c3', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.neg_guardar_negocio('3242e925-da26-459a-8258-be04d904e355', 'e2e0e2e0-0000-4000-8000-0000000a0702', pg_temp.j(3, null));
  EXECUTE 'RESET ROLE';
END $fx$;

DO $t$
DECLARE
  com text := '6de385dc-b039-46dc-b793-c5cdefc095c3';  -- Rui Jesus, comercial
  -- 8.884,75 € sem IVA: 3 linhas de materiais (23 %) e 1 de mão de obra (6 %)
  L jsonb := jsonb_build_array(pg_temp.l(0, 4, 1234.5), pg_temp.l(1, 2.5, 640.1), pg_temp.l(2, 1, 1312.5), pg_temp.l(3, 10, 103.4, 'mao_obra'));
  -- 3 × 1,15 € a 23 %: linha a linha dá 4,23 € com IVA, a conta do ecrã (arredonda no fim) dá 4,24 €
  L1c jsonb := jsonb_build_array(pg_temp.l(0, 1, 1.15), pg_temp.l(1, 1, 1.15), pg_temp.l(2, 1, 1.15));
  pf numeric := 4 * 1234.5 + 2.5 * 640.1 + 1312.5 + 10 * 103.4; tci numeric;  -- 8884,75
  ed text; ec text; ec1 text; pc boolean;
BEGIN
  -- 0. o pressuposto: a conta pode editar o orçamento e enviar a proposta
  PERFORM set_config('request.jwt.claims', json_build_object('sub', com, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', com, true);
  pc := public.fn_cat_pode('3242e925-da26-459a-8258-be04d904e355', 'negocios.orcamento.editar')
        AND public.fn_cat_pode('3242e925-da26-459a-8258-be04d904e355', 'negocios.proposta.enviar');
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO _rel (caso, esperado, obtido) VALUES ('00 comercial: orcamento.editar e proposta.enviar', 'true', pc::text);
  -- (4 × 1234,5 + 2,5 × 640,1 + 1312,5) × 1,23 + 1034 × 1,06
  tci := round((4 * 1234.5 + 2.5 * 640.1 + 1312.5) * 1.23 + 10 * 103.4 * 1.06, 2);

  -- 1 a 3. os totais certos passam (rascunho, enviado, com 1 cêntimo de diferença do IVA linha a linha)
  INSERT INTO _rel (caso, esperado, obtido) VALUES ('01 rascunho com os totais das linhas', 'PASSA',
    pg_temp.tentar(jsonb_build_array(jsonb_build_object('auth', com, 'json', pg_temp.j(3, jsonb_build_array(pg_temp.o(1, 'rascunho', L, pf, tci)))))));
  INSERT INTO _rel (caso, esperado, obtido) VALUES ('02 proposta enviada com os totais das linhas', 'PASSA',
    pg_temp.tentar(jsonb_build_array(jsonb_build_object('auth', com, 'json', pg_temp.j(3, jsonb_build_array(pg_temp.o(1, 'enviado', L, pf, tci)))))));
  INSERT INTO _rel (caso, esperado, obtido) VALUES ('03a IVA arredondado no fim (4,24 €, como o ecrã)', 'PASSA',
    pg_temp.tentar(jsonb_build_array(jsonb_build_object('auth', com, 'json', pg_temp.j(3, jsonb_build_array(pg_temp.o(1, 'rascunho', L1c, 3.45, 4.24)))))));
  INSERT INTO _rel (caso, esperado, obtido) VALUES ('03b IVA somado linha a linha (4,23 €: 1 cêntimo)', 'PASSA',
    pg_temp.tentar(jsonb_build_array(jsonb_build_object('auth', com, 'json', pg_temp.j(3, jsonb_build_array(pg_temp.o(1, 'rascunho', L1c, 3.45, 4.23)))))));

  -- 4 a 7. o total adulterado recusa-se (NE016) e nada fica gravado
  INSERT INTO _rel (caso, esperado, obtido) VALUES ('04 enviada a 1.000 € / 1.230 € com linhas de 8.884,75 €', 'NE016',
    pg_temp.tentar(jsonb_build_array(jsonb_build_object('auth', com, 'json', pg_temp.j(3, jsonb_build_array(pg_temp.o(1, 'enviado', L, 1000, 1230)))))));
  INSERT INTO _rel (caso, esperado, obtido) VALUES ('05 rascunho com o total sem IVA adulterado', 'NE016',
    pg_temp.tentar(jsonb_build_array(jsonb_build_object('auth', com, 'json', pg_temp.j(3, jsonb_build_array(pg_temp.o(1, 'rascunho', L, pf - 0.05, tci)))))));
  INSERT INTO _rel (caso, esperado, obtido) VALUES ('06 enviada com só o total com IVA adulterado', 'NE016',
    pg_temp.tentar(jsonb_build_array(jsonb_build_object('auth', com, 'json', pg_temp.j(3, jsonb_build_array(pg_temp.o(1, 'enviado', L, pf, tci - 100)))))));
  INSERT INTO _rel (caso, esperado, obtido) VALUES ('07 enviada sem total com linhas', 'NE016',
    pg_temp.tentar(jsonb_build_array(jsonb_build_object('auth', com, 'json', pg_temp.j(3, jsonb_build_array(pg_temp.o(1, 'enviado', L, null, null)))))));
  INSERT INTO _rel (caso, esperado, obtido) VALUES ('07b rascunho sem linhas nem total', 'PASSA',
    pg_temp.tentar(jsonb_build_array(jsonb_build_object('auth', com, 'json', pg_temp.j(3, jsonb_build_array(pg_temp.o(1, 'rascunho', '[]'::jsonb, 0, 0)))))));

  -- 8. o desconto (em %, como no ecrã: 0,5 % de 1.000 €)
  INSERT INTO _rel (caso, esperado, obtido) VALUES ('08a desconto 0,5 %: 995 € / 1.223,85 €', 'PASSA',
    pg_temp.tentar(jsonb_build_array(jsonb_build_object('auth', com, 'json', pg_temp.j(3, jsonb_build_array(
      pg_temp.o(1, 'rascunho', jsonb_build_array(pg_temp.l(0, 1, 1000)), 995, 1223.85, 0.5)))))));
  INSERT INTO _rel (caso, esperado, obtido) VALUES ('08b desconto 0,5 % mas o total sem o desconto', 'NE016',
    pg_temp.tentar(jsonb_build_array(jsonb_build_object('auth', com, 'json', pg_temp.j(3, jsonb_build_array(
      pg_temp.o(1, 'rascunho', jsonb_build_array(pg_temp.l(0, 1, 1000)), 1000, 1230, 0.5)))))));

  -- 9. a venda direta tem a mesma conta
  INSERT INTO _rel (caso, esperado, obtido) VALUES ('09a venda direta com os totais das linhas', 'PASSA',
    pg_temp.tentar(jsonb_build_array(jsonb_build_object('auth', com, 'json', pg_temp.j(3, jsonb_build_array(pg_temp.o(1, 'rascunho', L, pf, tci, 0, true)))))));
  INSERT INTO _rel (caso, esperado, obtido) VALUES ('09b venda direta com o total adulterado', 'NE016',
    pg_temp.tentar(jsonb_build_array(jsonb_build_object('auth', com, 'json', pg_temp.j(3, jsonb_build_array(pg_temp.o(1, 'rascunho', L, 1000, 1230, 0, true)))))));

  -- 10. as versões substituídas (o histórico, sem linhas no JSON) não se conferem; a atual sim
  INSERT INTO _rel (caso, esperado, obtido) VALUES ('10a v1 substituída sem linhas + v2 certa', 'PASSA',
    pg_temp.tentar(jsonb_build_array(jsonb_build_object('auth', com, 'json', pg_temp.j(3, jsonb_build_array(
      pg_temp.o(1, 'substituido', null, 500, 615), pg_temp.o(2, 'rascunho', L, pf, tci)))))));
  INSERT INTO _rel (caso, esperado, obtido) VALUES ('10b v1 substituída + v2 adulterada', 'NE016',
    pg_temp.tentar(jsonb_build_array(jsonb_build_object('auth', com, 'json', pg_temp.j(3, jsonb_build_array(
      pg_temp.o(1, 'substituido', null, 500, 615), pg_temp.o(2, 'rascunho', L, 1000, 1230)))))));

  -- 11. a versão aceite no portal (linhas fixas): o total congelado certo passa; mudar o total recusa-se
  INSERT INTO _rel (caso, esperado, obtido) VALUES ('11a aceite: gravar com o total congelado', 'PASSA',
    pg_temp.tentar(jsonb_build_array(
      jsonb_build_object('auth', com, 'json', pg_temp.j(3, jsonb_build_array(pg_temp.o(1, 'enviado', L, pf, tci)))),
      jsonb_build_object('portal_aceita', 1),
      jsonb_build_object('auth', com, 'json', pg_temp.j(3, jsonb_build_array(pg_temp.o(1, 'aceite', L, pf, tci)))))));
  INSERT INTO _rel (caso, esperado, obtido) VALUES ('11b aceite: mudar o total no JSON', 'NE016',
    pg_temp.tentar(jsonb_build_array(
      jsonb_build_object('auth', com, 'json', pg_temp.j(3, jsonb_build_array(pg_temp.o(1, 'enviado', L, pf, tci)))),
      jsonb_build_object('portal_aceita', 1),
      jsonb_build_object('auth', com, 'json', pg_temp.j(3, jsonb_build_array(pg_temp.o(1, 'aceite', L, 1000, 1230)))))));

  -- 12. a recusa deixa a base como estava: o orçamento e a proposta enviados ficam com os totais certos
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', json_build_object('sub', com, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', com, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM public.neg_guardar_negocio('3242e925-da26-459a-8258-be04d904e355', 'e2e0e2e0-0000-4000-8000-0000000a0702',
      pg_temp.j(3, jsonb_build_array(pg_temp.o(1, 'enviado', L, pf, tci))));
    EXECUTE 'RESET ROLE';
    SELECT q.preco_final || '/' || q.total_com_iva || '/' || q.subtotal || '/' || q.total || '/' || p.value || '/' || p.value_sem_iva || '/' || p.status INTO ec1
    FROM quotes q JOIN proposals p ON p.id = q.proposal_id WHERE q.negocio_id = 'e2e0e2e0-0000-4000-8000-0000000a0702' AND q.versao = 1;
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      PERFORM public.neg_guardar_negocio('3242e925-da26-459a-8258-be04d904e355', 'e2e0e2e0-0000-4000-8000-0000000a0702',
        pg_temp.j(3, jsonb_build_array(pg_temp.o(1, 'enviado', L, 1000, 1230))));
      ed := 'gravou';
    EXCEPTION WHEN OTHERS THEN ed := SQLSTATE;
    END;
    EXECUTE 'RESET ROLE';
    SELECT q.preco_final || '/' || q.total_com_iva || '/' || q.subtotal || '/' || q.total || '/' || p.value || '/' || p.value_sem_iva || '/' || p.status INTO ec
    FROM quotes q JOIN proposals p ON p.id = q.proposal_id WHERE q.negocio_id = 'e2e0e2e0-0000-4000-8000-0000000a0702' AND q.versao = 1;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '__desfazer__';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> '__desfazer__' THEN ed := SQLSTATE || ': ' || SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO _rel (caso, esperado, obtido) VALUES ('12 recusada: o orçamento e a proposta ficam como estavam', 'NE016 igual (' || pf || '/' || tci || ')',
    coalesce(ed, '?') || ' ' || CASE WHEN ec = ec1 AND ec1 LIKE pf || '/' || tci || '/%' THEN 'igual (' || pf || '/' || tci || ')' ELSE coalesce(ec1, '?') || ' -> ' || coalesce(ec, '?') END);
END $t$;

SELECT json_agg(x ORDER BY x.n) FROM (
  SELECT n, caso, esperado, obtido,
         CASE WHEN esperado = obtido OR (esperado = 'NE016' AND obtido LIKE 'NE016: Orçamento versão %') THEN 'OK' ELSE 'FALHA' END AS resultado
  FROM _rel
  UNION ALL
  SELECT 9999, 'TOTAL', count(*)::text || ' verificações', null,
         count(*) FILTER (WHERE NOT (esperado = obtido OR (esperado = 'NE016' AND obtido LIKE 'NE016: Orçamento versão %')))::text || ' FALHA(S)'
  FROM _rel) x;

ROLLBACK;
