-- Venda Direta — backfill do número de proforma para vendas já aceites.
--
-- Problema
-- --------
-- O número da proforma é atribuído pelo trigger
-- trigger_set_direct_sale_proforma_number (20261201150000), que dispara na
-- TRANSIÇÃO de status para 'aceite' — cláusula WHEN (NEW.status = 'aceite'
-- AND OLD.status IS DISTINCT FROM 'aceite').
--
-- As vendas aceites ANTES dessa migration ser aplicada nunca passaram por essa
-- transição com o trigger no sítio, logo ficaram em 'aceite' com
-- proforma_number NULL. E como já estão em 'aceite', a transição não volta a
-- acontecer: o número nunca lhes seria atribuído. Na prática o botão de
-- descarregar a proforma não aparece para elas, porque depende do número.
--
-- Esta migration corre uma vez e fecha essa janela.
--
-- Forward-only migration. Do not fold into the baseline.
--
-- Porquê um LOOP e não um UPDATE único
-- ------------------------------------
-- generate_proforma_number() calcula MAX+1 lendo direct_sales. Num UPDATE
-- único, todas as linhas veriam o mesmo snapshot da tabela e receberiam o
-- MESMO número — e o índice único idx_direct_sales_proforma_number_unique
-- rejeitaria o lote inteiro. Dentro do LOOP, cada UPDATE já vê o resultado do
-- anterior, por isso a sequência sai correta.
--
-- O trigger não interfere: aqui o status não muda (aceite -> aceite), logo
-- OLD.status = NEW.status e a cláusula WHEN é falsa.
--
-- Data de emissão
-- ---------------
-- Usa accepted_at, não now(): datar hoje um documento aceite noutro dia seria
-- falso. Só cai para now() se accepted_at estiver vazio, o que não deveria
-- acontecer numa venda em 'aceite'.
--
-- Limitação conhecida: generate_proforma_number() usa sempre o ano corrente.
-- Uma venda aceite num ano anterior receberia um número do ano de hoje. Não
-- corrijo isso aqui porque implicaria mudar a função para todos os casos; à
-- data desta migration não existe nenhuma venda aceite fora do ano corrente.

DO $$
DECLARE
  sale_row record;
  updated_count integer := 0;
BEGIN
  FOR sale_row IN
    SELECT id, organization_id, accepted_at
    FROM public.direct_sales
    WHERE status = 'aceite'
      AND proforma_number IS NULL
      AND organization_id IS NOT NULL
    -- Ordem cronológica: a numeração deve seguir a ordem por que as vendas
    -- foram aceites, não a ordem física das linhas na tabela.
    ORDER BY accepted_at NULLS LAST, created_at
  LOOP
    UPDATE public.direct_sales
    SET proforma_number = public.generate_proforma_number(sale_row.organization_id),
        proforma_issued_at = COALESCE(sale_row.accepted_at, now())
    WHERE id = sale_row.id
      -- Guarda de idempotência: se esta migration correr duas vezes, a segunda
      -- não encontra nada para fazer e nenhum número é reemitido.
      AND proforma_number IS NULL;

    updated_count := updated_count + 1;
  END LOOP;

  RAISE NOTICE 'Backfill de proforma_number: % venda(s) aceite(s) sem número.', updated_count;
END $$;


-- ============================================================
-- Verification notes (para revisão humana, não executadas)
-- ============================================================
--
-- 1. Nenhuma venda aceite fica sem número:
--      SELECT count(*) FROM direct_sales
--      WHERE status = 'aceite' AND proforma_number IS NULL;
--      -- esperado: 0
--
-- 2. Sem números duplicados dentro da mesma organização:
--      SELECT organization_id, proforma_number, count(*)
--      FROM direct_sales WHERE proforma_number IS NOT NULL
--      GROUP BY 1, 2 HAVING count(*) > 1;
--      -- esperado: 0 linhas
--
-- 3. A data de emissão acompanha a aceitação, não a data do backfill:
--      SELECT sale_number, accepted_at, proforma_issued_at
--      FROM direct_sales WHERE proforma_number IS NOT NULL;
