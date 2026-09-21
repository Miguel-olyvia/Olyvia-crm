-- Documentos — o trigger de validação passa a conhecer o entity_type 'product'.
--
-- Problema real que isto resolve
-- ------------------------------
-- Anexar um documento a um PRODUTO falhava SEMPRE. O utilizador escolhia o
-- ficheiro na ficha do produto e levava com o erro em bruto da base de dados:
--
--     contagem_INV-0003_2026-09-21.xlsx: documents: entity_type inválido product
--
-- A funcionalidade de documentos de produto NUNCA funcionou desde que foi
-- lançada. A migration 20261201130000_documents_allow_product.sql acrescentou
-- 'product' à CHECK constraint documents_entity_type_check e raciocinou sobre
-- RLS e storage — mas esqueceu-se do trigger BEFORE INSERT/UPDATE
-- trg_documents_validate_entity, que resolve a organização da entidade. Esse
-- trigger só tem ramos para 'contract', 'proposal' e 'quote'; tudo o resto cai
-- num ELSE que faz RAISE EXCEPTION. Ou seja: a constraint deixava entrar, o
-- trigger barrava à mesma, e o INSERT morria sempre.
--
-- Alteração ÚNICA desta migration: acrescentar ao
-- public.documents_validate_entity() um ramo para 'product'. Os três ramos
-- existentes — e as três mensagens de erro, palavra a palavra — ficam byte a
-- byte iguais. Não se recria o trigger (CREATE OR REPLACE FUNCTION basta), não
-- se toca em constraints, em RLS, nem em portal_user_can_see_doc.
--
-- Factos confirmados AO VIVO na base antes de escrever este ficheiro
-- (só leitura: pg_get_functiondef / pg_trigger / pg_constraint /
-- information_schema.columns / SELECT count):
--
--   F1. A base recriada aqui é a definição VIVA de documents_validate_entity,
--       extraída com pg_get_functiondef — NÃO um ficheiro de migration. Regra
--       do projeto: nunca reconstruir a partir de um ficheiro antigo, que
--       apagaria em silêncio correções posteriores. Existe exatamente 1
--       overload, sem argumentos e RETURNS trigger, por isso CREATE OR REPLACE
--       SEM DROP — o ACL é preservado e os triggers existentes continuam
--       ligados a este mesmo pg_proc.oid.
--
--   F2. Um único trigger não interno usa esta função:
--       trg_documents_validate_entity — BEFORE INSERT OR UPDATE OF
--       entity_type, entity_id, organization_id ON public.documents
--       FOR EACH ROW. Não é preciso recriá-lo.
--
--   F3. A constraint documents_entity_type_check JÁ aceita 'product'
--       (aplicada por 20261201130000). Confirmado ao vivo. O trigger era mesmo
--       a única barreira que faltava.
--
--   F4. CRÍTICO — products.organization_id NÃO serve para scoping. É nullable,
--       tem 1 produto a NULL e, pior, 13 produtos em que o valor NÃO existe
--       sequer em product_organizations para esse produto. Resolver a
--       organização por essa coluna, à maneira dos outros três ramos, daria
--       rejeições e aceitações erradas. A ligação real produto↔organização é
--       a tabela public.product_organizations (product_id, organization_id),
--       com UNIQUE (product_id, organization_id) — que serve de índice à
--       verificação de pertença feita aqui. 2483 produtos, 2469 ligações.
--
--   F5. Um produto PODE pertencer a várias organizações (o modelo de
--       product_organizations é N:N e é de propósito; hoje não há nenhum caso,
--       mas nada o impede). Logo não existe "a" organização do produto e o
--       padrão SELECT organization_id INTO v_org dos outros ramos é
--       inaplicável. A validação correta é de PERTENÇA, não de igualdade.
--
--   F6. public.products tem is_deleted (boolean NOT NULL) e deleted_at
--       (timestamptz nullable) — soft delete. 64 produtos apagados. Um produto
--       apagado é tratado como inexistente, para não se anexarem documentos a
--       lixo.
--
--   F7. Não havia nenhum documento de produto gravado:
--       SELECT count(*) FROM documents WHERE entity_type='product' → 0.
--       Confirma que a funcionalidade nunca chegou a gravar nada. Não há
--       linhas órfãs para tratar e esta migration não altera dados nenhuns.
--
-- SEGURANÇA — o raciocínio do cabeçalho de 20261201130000 continua VÁLIDO
-- ------------------------------------------------------------------------
-- Essa migration justificava assim que 'product' não abre nada ao cliente:
--
--   "1. portal_user_can_see_doc(entity_type, entity_id), usada na política
--       'Portal users can view their entity documents', só tem ramos para
--       'contract', 'proposal' e 'quote'. Para 'product' devolve false.
--    2. A política de storage portal_users_can_read_documents exige que o
--       segundo segmento do caminho seja 'contract', 'proposal' ou 'quote'."
--
-- Ambas continuam intactas depois desta alteração:
--   - portal_user_can_see_doc foi lida ao vivo com pg_get_functiondef: tem
--     exatamente os ramos de 'contract', 'proposal' e 'quote' (mais os dois
--     saltos quote→proposal e quote→contrato). NÃO tem ramo 'product', logo o
--     EXISTS devolve false. NÃO é alterada aqui, de propósito.
--   - Esta migration não toca em políticas RLS nem em políticas de storage.
-- O que muda é só isto: um INSERT interno, feito por um utilizador da
-- organização, deixa de rebentar. As políticas de leitura de documents
-- continuam a ser por organização (get_user_visible_org_ids) e o ramo novo
-- ainda APERTA o scoping — exige pertença provada em product_organizations.
--
-- Decisões
-- --------
--   D1. O ramo de 'product' faz as suas próprias validações e RETURN NEW
--       diretamente. Tem de ser assim: v_org fica NULL no caminho do produto,
--       e os IF v_org IS NULL / IF v_org <> NEW.organization_id que vêm a
--       seguir rebentariam sempre. Saindo no ramo, esses dois testes ficam a
--       valer, sem uma linha alterada, só para contract/proposal/quote.
--   D2. Produto inexistente ou apagado → mesma frase dos outros ramos,
--       'documents: % % não existe', que rende "documents: product <id> não
--       existe". Reutiliza-se a mensagem em vez de inventar outra.
--   D3. Produto que existe mas não está ligado a NEW.organization_id → erro no
--       espírito da mensagem de organization_id que já lá estava, adaptado ao
--       facto de o produto poder ter várias organizações.
--   D4. SECURITY DEFINER, SET search_path = public, RETURNS trigger e
--       LANGUAGE plpgsql mantidos tal e qual.

CREATE OR REPLACE FUNCTION public.documents_validate_entity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org UUID;
BEGIN
  IF NEW.entity_type = 'contract' THEN
    SELECT organization_id INTO v_org FROM public.client_contracts WHERE id = NEW.entity_id;
  ELSIF NEW.entity_type = 'proposal' THEN
    SELECT organization_id INTO v_org FROM public.proposals WHERE id = NEW.entity_id;
  ELSIF NEW.entity_type = 'quote' THEN
    SELECT organization_id INTO v_org FROM public.quotes WHERE id = NEW.entity_id;
  ELSIF NEW.entity_type = 'product' THEN
    -- Um produto pode pertencer a VÁRIAS organizações (product_organizations é
    -- N:N), por isso não há "a" organização do produto para comparar. E
    -- products.organization_id está a NULL/incoerente em produção, não serve
    -- para scoping. Valida-se PERTENÇA e sai-se já, sem passar pelos testes de
    -- v_org lá abaixo (que são só para contract/proposal/quote).
    IF NOT EXISTS (
      SELECT 1
      FROM public.products p
      WHERE p.id = NEW.entity_id
        AND p.is_deleted IS NOT TRUE
        AND p.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'documents: % % não existe', NEW.entity_type, NEW.entity_id;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.product_organizations po
      WHERE po.product_id = NEW.entity_id
        AND po.organization_id = NEW.organization_id
    ) THEN
      RAISE EXCEPTION 'documents: organization_id (%) não corresponde à entidade — o produto % não pertence a essa organização',
        NEW.organization_id, NEW.entity_id;
    END IF;

    RETURN NEW;
  ELSE
    RAISE EXCEPTION 'documents: entity_type inválido %', NEW.entity_type;
  END IF;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'documents: % % não existe', NEW.entity_type, NEW.entity_id;
  END IF;

  IF v_org <> NEW.organization_id THEN
    RAISE EXCEPTION 'documents: organization_id (%) não corresponde à entidade (%)',
      NEW.organization_id, v_org;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.documents_validate_entity() IS
  'Trigger BEFORE INSERT/UPDATE de public.documents (trg_documents_validate_entity): garante que o documento pertence mesmo à organização indicada. Para contract/proposal/quote resolve a organização da entidade e exige igualdade. Para product exige pertença em public.product_organizations — products.organization_id não serve para scoping (nullable e incoerente) e um produto pode pertencer a várias organizações. Qualquer outro entity_type é recusado.';
