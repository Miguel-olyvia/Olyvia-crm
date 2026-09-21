-- Venda Direta — numeração da proforma (PF-YYYY-NNNN).
--
-- Contexto
-- --------
-- direct_sales já tem as colunas proforma_number/proforma_issued_at desde
-- 20261130230000_venda_direta_base.sql (:107-109), mas nulas e sem nenhuma
-- função, trigger, ou índice que as preencha — ver secção "Fica para as
-- fases seguintes" desse ficheiro (:568-569). Esta migration fecha esse
-- gap: a proforma passa a nascer sozinha quando o cliente aceita a venda
-- direta (status transita para 'aceite' — valor confirmado no CHECK de
-- direct_sales.status em 20261130230000_venda_direta_base.sql:87-88).
--
-- Forward-only migration. Do not fold into the baseline. Do not edit an
-- already-applied migration.
--
-- Padrão seguido (lido por inteiro antes de escrever esta migration):
--   20261130230000_venda_direta_base.sql:171-230
--     -> generate_direct_sale_number()/set_direct_sale_number() + trigger
--        BEFORE INSERT: mesma formatação, LANGUAGE plpgsql, SET search_path
--        TO 'public', REVOKE ALL FROM PUBLIC + GRANT EXECUTE a authenticated
--        e service_role, comentários em português, padrão de numeração anual
--        via regexp_match(sale_number, '^VD-[0-9]{4}-([0-9]+)$') + LPAD.
--
-- Divergência deliberada face a esse padrão — NÃO "corrigir" por engano:
--   generate_direct_sale_number() é GLOBAL (não filtra por organização); a
--   numeração da proforma, ao contrário, é POR ORGANIZAÇÃO
--   (generate_proforma_number recebe p_organization_id e filtra por ele).
--   Cada organização tem a sua própria série PF-YYYY-0001, PF-YYYY-0002...
--   Isto foi pedido explicitamente — não alinhar com sale_number.
--
-- Esta migration NÃO toca em generate_direct_sale_number(), em
-- set_direct_sale_number(), nem no trigger trigger_set_direct_sale_number
-- (numeração de sale_number, disparada no INSERT) — são coisas completamente
-- separadas.
--
-- Regra de negócio: a proforma nasce na ACEITAÇÃO, não no INSERT.
--   - Trigger BEFORE UPDATE em direct_sales, disparado só na TRANSIÇÃO para
--     'aceite' (NEW.status = 'aceite' AND OLD.status IS DISTINCT FROM
--     'aceite') — não em todo o UPDATE de uma venda já aceite.
--   - Reaceitação (ex.: aceite -> rejeitada -> aceite outra vez) mantém o
--     primeiro número: a função só gera quando NEW.proforma_number IS NULL.
--     Um documento emitido nunca muda de número.

-- ------------------------------------------------------------
-- 1. generate_proforma_number(p_organization_id uuid) — próximo número da
--    série da organização, formato PF-YYYY-NNNN.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.generate_proforma_number(p_organization_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $_$
DECLARE
  year_part text;
  sequence_num integer;
BEGIN
  year_part := EXTRACT(YEAR FROM CURRENT_DATE)::text;

  SELECT COALESCE(MAX(
    CASE
      WHEN proforma_number ~ '^PF-[0-9]{4}-[0-9]+$'
      THEN (regexp_match(proforma_number, '^PF-[0-9]{4}-([0-9]+)$'))[1]::integer
      ELSE 0
    END
  ), 0) + 1
  INTO sequence_num
  FROM public.direct_sales
  WHERE organization_id = p_organization_id
    AND proforma_number LIKE 'PF-' || year_part || '-%';

  RETURN 'PF-' || year_part || '-' || LPAD(sequence_num::text, 4, '0');
END;
$_$;

REVOKE ALL ON FUNCTION public.generate_proforma_number(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_proforma_number(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_proforma_number(uuid) TO service_role;

COMMENT ON FUNCTION public.generate_proforma_number(uuid) IS
  'Gera o próximo proforma_number no formato PF-YYYY-NNNN, por ano E POR ORGANIZAÇÃO (divergência deliberada de generate_direct_sale_number(), que é global — não "corrigir" para global por engano). Cada organização tem a sua própria série. O MAX+1 aqui não é, por si só, à prova de corrida concorrente — quem impede duplicados de facto é o índice único parcial idx_direct_sales_proforma_number_unique (organization_id, proforma_number) mais abaixo; esta função só calcula a sugestão de próximo número.';


-- ------------------------------------------------------------
-- 2. set_direct_sale_proforma_number() — trigger function: preenche
--    proforma_number/proforma_issued_at quando a venda direta é aceite.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_direct_sale_proforma_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Reaceitação (aceite -> rejeitada/cancelada -> aceite outra vez) mantém o
  -- número já emitido. A cláusula WHEN do trigger (mais abaixo) já filtra
  -- para só disparar em transições PARA 'aceite', mas esta guarda por
  -- IS NULL é a proteção real contra reemitir/trocar um número já dado a um
  -- documento — nunca reescrever um proforma_number existente.
  IF NEW.proforma_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- organization_id é NOT NULL na definição da tabela
  -- (20261130230000_venda_direta_base.sql:74) — este caso não deveria
  -- acontecer nunca. Guarda puramente defensiva: a numeração da proforma
  -- nunca pode impedir a aceitação da venda direta. Se isto disparar, a
  -- venda fica aceite sem proforma_number, a corrigir manualmente depois,
  -- em vez de fazer a transação de aceitação falhar.
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.proforma_number := public.generate_proforma_number(NEW.organization_id);
  NEW.proforma_issued_at := now();

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_direct_sale_proforma_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_direct_sale_proforma_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_direct_sale_proforma_number() TO service_role;

COMMENT ON FUNCTION public.set_direct_sale_proforma_number() IS
  'Trigger function BEFORE UPDATE em direct_sales: gera proforma_number/proforma_issued_at na transição do status para "aceite" (ver trigger_set_direct_sale_proforma_number). Só gera se proforma_number ainda for NULL — reaceitação mantém o número original. Nunca bloqueia a aceitação por causa da numeração (organization_id NULL é tratado sem erro).';


-- ------------------------------------------------------------
-- 3. Trigger — dispara só na transição PARA 'aceite', via cláusula WHEN.
-- ------------------------------------------------------------
-- WHEN em vez de IF no corpo da função: a condição de transição
-- (NEW.status = 'aceite' AND OLD.status IS DISTINCT FROM 'aceite') é
-- puramente sobre colunas do trigger, sem I/O nem lógica de negócio — o
-- lugar certo para isso é a cláusula WHEN da definição do trigger (avaliada
-- pelo próprio Postgres antes de invocar a função), não o corpo em plpgsql.
-- Isto também evita chamar a função em TODOS os outros UPDATEs de
-- direct_sales (ex.: só a mudar notes), que seria trabalho desperdiçado. A
-- guarda por IS NULL dentro da função (secção 2) continua a existir como
-- segunda linha de defesa para o caso de reaceitação.

DROP TRIGGER IF EXISTS trigger_set_direct_sale_proforma_number ON public.direct_sales;
CREATE TRIGGER trigger_set_direct_sale_proforma_number
  BEFORE UPDATE ON public.direct_sales
  FOR EACH ROW
  WHEN (NEW.status = 'aceite' AND OLD.status IS DISTINCT FROM 'aceite')
  EXECUTE FUNCTION public.set_direct_sale_proforma_number();


-- ------------------------------------------------------------
-- 4. Índice único parcial — proteção real contra corrida no MAX+1.
-- ------------------------------------------------------------
-- generate_proforma_number() calcula MAX+1 fora de qualquer lock; duas
-- aceitações simultâneas da mesma organização podiam, em teoria, calcular o
-- mesmo próximo número antes de qualquer delas gravar. Este índice único
-- parcial é o que impede esse duplicado de facto: se duas transações
-- tentarem gravar o mesmo (organization_id, proforma_number), uma delas
-- falha no UPDATE e a numeração fica consistente. Parcial (WHERE
-- proforma_number IS NOT NULL) porque a esmagadora maioria das vendas
-- diretas nunca chega a ser aceite e fica sempre com proforma_number NULL —
-- um índice único normal deixaria passar isso na mesma (NULL <> NULL para
-- efeitos de unicidade), mas o WHERE evita indexar milhares de linhas NULL
-- à toa.

CREATE UNIQUE INDEX IF NOT EXISTS idx_direct_sales_proforma_number_unique
  ON public.direct_sales(organization_id, proforma_number)
  WHERE proforma_number IS NOT NULL;


-- ============================================================
-- Verification notes (para revisão humana, não executadas)
-- ============================================================
--
-- 1. Funções e trigger criados:
--      SELECT proname FROM pg_proc
--      WHERE proname IN ('generate_proforma_number','set_direct_sale_proforma_number');
--      SELECT tgname, tgtype FROM pg_trigger
--      WHERE tgrelid = 'public.direct_sales'::regclass
--        AND tgname = 'trigger_set_direct_sale_proforma_number';
--
-- 2. Aceitar uma venda direta em rascunho/enviada gera proforma_number no
--    formato PF-2026-0001 e proforma_issued_at:
--      UPDATE direct_sales SET status = 'aceite' WHERE id = '...';
--      SELECT proforma_number, proforma_issued_at FROM direct_sales WHERE id = '...';
--
-- 3. Reaceitação mantém o número: mudar de 'aceite' para 'rejeitada' e outra
--    vez para 'aceite' NÃO deve alterar proforma_number nem
--    proforma_issued_at da segunda vez.
--
-- 4. Duas organizações diferentes podem ter, ambas, PF-2026-0001 no mesmo
--    ano (série por organização, não global) — comportamento esperado.
--
-- 5. UPDATE que não muda status (ex.: só notes) numa venda já aceite não
--    volta a disparar a função (WHEN não passa na condição de transição).
--
-- 6. Índice único parcial existe e é parcial:
--      SELECT indexdef FROM pg_indexes
--      WHERE indexname = 'idx_direct_sales_proforma_number_unique';
--
--
-- ============================================================
-- Fica para as fases seguintes (fora do âmbito desta migration)
-- ============================================================
-- - Geração do PDF da proforma a partir de proforma_number/proforma_issued_at
--   — hoje só numeração, sem documento.
-- - Qualquer RPC de aceitação (ex.: rpc_accept_direct_sale) que valide OTP/
--   assinatura do portal do cliente antes de fazer o UPDATE de status para
--   'aceite' — esta migration só reage à mudança de status, não a provoca.
