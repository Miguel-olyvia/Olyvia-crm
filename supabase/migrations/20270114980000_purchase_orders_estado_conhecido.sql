-- ============================================================
-- 20270114980000_purchase_orders_estado_conhecido
-- ============================================================
-- Falha (revisão de segurança do desenho, HIGH, rede de segurança): purchase_orders.status não tem CHECK; qualquer função
--   que gravasse um texto fora da lista criava um estado que a reserva da EC e os ecrãs não conhecem.
-- Decisão: CHECK purchase_orders_status_conhecido (status IN ('pending','ordered','partially_received','received','cancelled')),
--   adicionado NOT VALID e validado no fim, só depois de confirmar que não há nenhum valor fora da lista; se houver, a
--   migration aborta com a contagem em vez de adivinhar o que fazer a esses valores.
-- Lido a 11/11 (só leitura, nike = a única organização da tabela): 43 POs, todas em pending (12), ordered (5),
--   received (24), cancelled (2): 0 fora da lista. Os estados que as funções vivas escrevem em purchase_orders são só
--   estes cinco ('sent', 'confirmed', 'withdrawn', 'active' são da publicação no portal, outra tabela).
-- A coluna já é NOT NULL com omissão 'pending' (lido a 11/11), por isso o CHECK cobre todas as linhas.
-- Bloqueio: ADD CONSTRAINT toma ACCESS EXCLUSIVE em purchase_orders até ao COMMIT (o VALIDATE corre na mesma transação; a
--   tabela tem 43 linhas). lock_timeout de 5s: se houver escritas em curso, falha em vez de ficar em fila.
-- Uso normal: nada. As funções (com 20270114930000, 20270114940000 e 20270114950000) só gravam os cinco estados.
-- Desenho: vault/ficheiros/inventario/correcao-reteste-desenho.md (fechado; decisões do coordenador e revisão de segurança).
-- Base: RH (uetjghdkwbywbftedtth), que só tem a nike. Nada disto chega à Mudelar por esta base.
-- Aplicar: SET lock_timeout de sessão antes do BEGIN e RESET no fim (o CLI pode não correr o ficheiro numa só transação).
-- Teste: supabase/tests/inventario_reteste_buracos.test.sql — correr ANTES do db push (vermelho) e DEPOIS (verde).
-- ============================================================

SET lock_timeout = '5s';

BEGIN;

DO $pre$
DECLARE
  v_fora bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint c
             WHERE c.conrelid = 'public.purchase_orders'::regclass
               AND c.conname::text = 'purchase_orders_status_conhecido') THEN
    RAISE EXCEPTION '20270114980000: o CHECK purchase_orders_status_conhecido já existe; reler antes de aplicar';
  END IF;
  SELECT count(*) INTO v_fora FROM public.purchase_orders
  WHERE status IS NOT NULL
    AND status NOT IN ('pending', 'ordered', 'partially_received', 'received', 'cancelled');
  IF v_fora > 0 THEN
    RAISE EXCEPTION '20270114980000: % encomenda(s) com um estado fora da lista; decidir o que fazer antes de aplicar', v_fora;
  END IF;
END $pre$;

ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_status_conhecido
  CHECK (status IN ('pending', 'ordered', 'partially_received', 'received', 'cancelled')) NOT VALID;

ALTER TABLE public.purchase_orders VALIDATE CONSTRAINT purchase_orders_status_conhecido;

DO $chk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c
                 WHERE c.conrelid = 'public.purchase_orders'::regclass
                   AND c.conname::text = 'purchase_orders_status_conhecido'
                   AND c.contype::text = 'c'
                   AND c.convalidated) THEN
    RAISE EXCEPTION '20270114980000: o CHECK purchase_orders_status_conhecido não ficou criado e validado';
  END IF;
END $chk$;

COMMIT;

RESET lock_timeout;
