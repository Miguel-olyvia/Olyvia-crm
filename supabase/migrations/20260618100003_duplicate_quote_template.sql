-- P9: Duplicacao atomica de template de orcamento com organization_id correcto
-- Os dois INSERTs estao na mesma transaccao implicita do Postgres

CREATE OR REPLACE FUNCTION duplicate_quote_template(
  p_template_id uuid,
  p_org_id      uuid,
  p_user_id     uuid,
  p_new_name    text,
  p_new_codigo  text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_new_id uuid;
BEGIN
  -- Inserir template com organization_id (atomico com o INSERT de itens abaixo)
  INSERT INTO quote_templates (name, codigo, description, active, created_by, organization_id)
  SELECT p_new_name, p_new_codigo, description, false, p_user_id, p_org_id
  FROM quote_templates
  WHERE id = p_template_id
  RETURNING id INTO v_new_id;

  IF v_new_id IS NULL THEN
    RAISE EXCEPTION 'Template nao encontrado ou sem permissao';
  END IF;

  -- Copiar itens (mesmo statement, mesma transaccao — rollback automatico se falhar)
  INSERT INTO quote_template_items
    (template_id, product_id, service_id, item_type, default_qt, required, ordem)
  SELECT v_new_id, product_id, service_id, item_type, default_qt, required, ordem
  FROM quote_template_items
  WHERE template_id = p_template_id;

  RETURN v_new_id;
END;
$$;
