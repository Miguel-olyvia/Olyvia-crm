-- 20270126310000 — o desconto do orçamento grava-se como fração, como a coluna diz (contratos reais da Mudelar no testarh, 24/11).
-- Antes: a app mandava o desconto do orçamento principal em percentagem (2,5) e neg_guardar_negocio punha-o em quotes.desconto_fracao,
-- que só aceita 0 a 1 (quotes_desconto_fracao_check): QUALQUER desconto de 1% ou mais falhava a gravar («Não gravou … check constraint»),
-- também os botões 3%, 5% e 10%. As adendas já gravavam a fração; o documento do contrato lê desconto_global_percent em %.
-- Agora a app manda a fração (0,025) e lê-a de volta em % (negocioReal.ts: fracao/percent). Aqui só muda a conferência do total da
-- 20270126260000 (NE016), que dividia o desconto por 100: passa a usar a fração como está. Nada mais muda na função.
-- Como: lê-se a função viva, trocam-se as 2 expressões (e só se forem exatamente 2) e volta-se a criar. Se não estiverem lá, não aplica.

DO $desconto$
DECLARE
  v_def text := pg_get_functiondef('public.neg_guardar_negocio(uuid,uuid,jsonb)'::regprocedure);
  v_velho constant text := '(1 - coalesce(q.desconto_fracao, 0) / 100)';
  v_novo constant text := '(1 - coalesce(q.desconto_fracao, 0))';
  v_n int;
BEGIN
  v_n := (length(v_def) - length(replace(v_def, v_velho, ''))) / length(v_velho);
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'neg_guardar_negocio: esperava 2 vezes «%» e encontrei %. Rever antes de aplicar.', v_velho, v_n;
  END IF;
  EXECUTE replace(v_def, v_velho, v_novo);
END $desconto$;

-- Verificação: as duas expressões novas na função viva (deve dar 2) e quantos orçamentos já têm desconto gravado (deve dar 0: até aqui
-- nenhum desconto de 1% ou mais conseguia gravar).
SELECT
  (length(pg_get_functiondef('public.neg_guardar_negocio(uuid,uuid,jsonb)'::regprocedure))
   - length(replace(pg_get_functiondef('public.neg_guardar_negocio(uuid,uuid,jsonb)'::regprocedure), '(1 - coalesce(q.desconto_fracao, 0))', '')))
   / length('(1 - coalesce(q.desconto_fracao, 0))') AS expressoes_novas,
  (SELECT count(*) FROM public.quotes WHERE coalesce(desconto_fracao, 0) > 0 AND deleted_at IS NULL) AS orcamentos_com_desconto;
