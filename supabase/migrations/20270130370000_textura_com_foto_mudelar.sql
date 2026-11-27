-- =============================================================================
-- Catálogo — a «Textura» da Mudelar passa a poder ter FOTO por opção (Pizarra, Liso, Piedra), para o 3D da ficha a mostrar.
-- Base de RH (uetjghdkwbywbftedtth). DADOS: UMA linha de product_attributes (has_hex_color e has_photo a true). Sem DDL, sem
-- funções novas (por isso sem REVOKE/GRANT), sem INSERT, sem DELETE, sem tocar em opções, em produtos nem em valores de produto.
--
-- !!! SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth). O id da organização foi lido só na RH a 27/11/2026. Na base principal
-- !!! (Mudelar de produção, clientes reais) a Mudelar tem outro id: a migration sai com RAISE NOTICE sem escrever nada.
-- !!! Antes do `db push`, confirmar o projeto ligado (supabase/.temp/project-ref).
--
-- O QUE O ECRÃ FAZ DEPOIS (o que o dono vê):
--   * Gestão de Atributos → Textura: passa a «Lista com cor»; cada opção mostra a miniatura da foto (ou «sem hex» enquanto não
--     tem foto), aparece o campo do hex (opcional, quando o atributo tem foto) e o botão de carregar a foto de cada opção.
--   * Formulário e ficha do produto: o seletor da opção de Textura mostra a miniatura da foto.
--   * 3D da ficha: a foto da opção de Textura (p.ex. Pizarra) aplica-se ao corpo TINGIDA pela cor da opção de Cor (p.ex.
--     Antracite): a cor continua a ser a da Cor e só a textura muda. Sem foto na opção escolhida (Liso, ou ainda por carregar)
--     o 3D fica como hoje.
--   * A vista de família com 3D: a Textura continua a escolher o produto; a foto, quando existe, passa ao 3D tingida pela cor.
--
-- DEPENDE DE CÓDIGO NOVO (vai no mesmo envio): o 3D (acabamentoCor3d.ts, previaProduto3d.ts, zonasGlb.ts, zonasMateriais.ts,
-- texturaProduto.ts, Visualizador3D.tsx, Modelo3DProduto.tsx, familias/previaDoProduto.ts) tem de reconhecer a Textura como
-- atributo À PARTE (ehAtributoDeTextura): sem esse código, uma Textura com hex/foto contava como mais um atributo de COR e
-- podia pintar as zonas ou deixar de ser «o único atributo de cor». O código funciona com e sem esta migration (sem foto na
-- Textura nada muda), por isso o código pode ir antes; esta migration NUNCA vai antes do código.
--
-- Porquê assim: a CHECK product_attributes_has_photo_check (NOT has_photo OR has_hex_color IS TRUE) obriga a ter has_hex_color
-- para ter foto, e a Textura tinha os dois a false. Ligar os dois é uma linha de dados; a alternativa (uma coluna nova e mudar a
-- constraint, cat_definir_foto_atributo, cat_guardar_opcao e cat_editar_opcao para todas as organizações) mexia em muito mais.
--
-- Lido no remoto RH a 27/11/2026 (só SELECT): o atributo `textura` existe só na Mudelar (3242e925-…), lista, não medida, com
-- has_hex_color, has_photo e has_aspect a false; 3 opções (PIZARRA, LISO, PIEDRA), sem foto; o grupo de opções (90829d63-…) é
-- só deste atributo; nenhuma função de SKU lê has_hex_color (o SKU não muda); os triggers de product_attributes são a auditoria,
-- fn_cat_sku_ordem_trg (só INSERT), validate_attribute_measurement_color (só recusa medida com cor) e updated_at.
--
-- Âmbito (inerte, RAISE NOTICE e sai): a organização Mudelar-do-RH não existe nesta base, ou não tem atributo `textura`.
-- Falha (RAISE EXCEPTION, nada fica): mais de um atributo `textura` vivo; o atributo é medida ou não é lista; o grupo de opções é
-- partilhado com outro atributo; estado a meio (só um dos dois a true). Idempotente: com os dois já a true sai por NOTICE.
--
-- ATENÇÃO — fica preso: cat_guardar_atributo não deixa voltar a tirar o hex a um atributo com valores em uso (a Textura tem
-- 14 328). Para reverter é precisa OUTRA migration (o guião de reversão está FORA da pasta das migrations, de propósito).
--
-- Efeitos laterais: trigger de auditoria (1 linha, app.audit_source = 'migration:textura_com_foto_mudelar') e updated_at.
--
-- ORDEM: `supabase db push` aplica TUDO o que estiver pendente. Listar com `supabase migration list --linked` imediatamente
-- antes (a retida dos Ativos, 20270130400000, ainda pode estar por aplicar: este carimbo fica antes dela).
-- =============================================================================

SET lock_timeout = '5s';
SET statement_timeout = '2min';

DO $mig$
DECLARE
  c_org   constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  c_fonte constant text := 'migration:textura_com_foto_mudelar';
  v_id    uuid;
  v_grupo uuid;
  v_n     bigint;
  v_hex   boolean;
  v_foto  boolean;
  v_med   boolean;
  v_tipo  text;
  v_fora_antes  bigint;
  v_fora_depois bigint;
  v_opc_antes   text;
  v_opc_depois  text;
BEGIN
  -- ─── 0. Âmbito (inerte) ───────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM anew_organizations o WHERE o.id = c_org AND o.deleted_at IS NULL) THEN
    RAISE NOTICE 'textura_com_foto_mudelar: a organização Mudelar (%) não existe nesta base — nada a fazer.', c_org;
    RETURN;
  END IF;
  SELECT count(*) INTO v_n FROM product_attributes a
  WHERE a.organization_id = c_org AND a.code = 'textura' AND a.deleted_at IS NULL;
  IF v_n = 0 THEN
    RAISE NOTICE 'textura_com_foto_mudelar: a Mudelar não tem o atributo «textura» nesta base — nada a fazer.';
    RETURN;
  END IF;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'textura_com_foto_mudelar: % atributos «textura» vivos na Mudelar (esperado 1). Rever antes de aplicar.', v_n;
  END IF;

  -- ─── 1. Guardas: o estado é o lido ────────────────────────────────────────────────
  SELECT a.id, a.has_hex_color, a.has_photo, a.is_measurement, a.value_type
    INTO v_id, v_hex, v_foto, v_med, v_tipo
  FROM product_attributes a
  WHERE a.organization_id = c_org AND a.code = 'textura' AND a.deleted_at IS NULL
  FOR NO KEY UPDATE;
  IF v_med OR v_tipo IS DISTINCT FROM 'list' THEN
    RAISE EXCEPTION 'textura_com_foto_mudelar: o atributo «textura» (%) é medida (%) ou não é lista (%). Rever.', v_id, v_med, v_tipo;
  END IF;

  -- o grupo de opções tem de ser só deste atributo: senão as fotos apareceriam noutros atributos
  v_grupo := public.fn_cat_grupo_do_atributo(v_id, c_org);
  SELECT count(*) INTO v_n FROM product_attributes a
  WHERE a.organization_id = c_org AND a.deleted_at IS NULL AND a.id <> v_id
    AND public.fn_cat_grupo_do_atributo(a.id, c_org) IS NOT DISTINCT FROM v_grupo;
  IF v_grupo IS NOT NULL AND v_n > 0 THEN
    RAISE EXCEPTION 'textura_com_foto_mudelar: o grupo de opções (%) da Textura é partilhado com % outro(s) atributo(s). Rever.', v_grupo, v_n;
  END IF;

  -- já aplicada? a meio?
  IF COALESCE(v_hex, false) AND COALESCE(v_foto, false) THEN
    RAISE NOTICE 'textura_com_foto_mudelar: já aplicada (has_hex_color e has_photo a true) — nada a fazer.';
    RETURN;
  END IF;
  IF COALESCE(v_hex, false) OR COALESCE(v_foto, false) THEN
    RAISE EXCEPTION 'textura_com_foto_mudelar: estado a meio (has_hex_color=%, has_photo=%). Não se completa às cegas: rever.', v_hex, v_foto;
  END IF;

  -- ─── 2. Fotografia antes ──────────────────────────────────────────────────────────
  -- o que está FORA do âmbito (toda a base) tem de ficar igual; e as opções da Textura não se tocam
  SELECT count(*) INTO v_fora_antes FROM product_attributes a WHERE a.id <> v_id AND (a.has_hex_color OR a.has_photo);
  SELECT md5(coalesce(string_agg(to_jsonb(o)::text, '|' ORDER BY o.id), '')) INTO v_opc_antes
  FROM attribute_option_group_values o WHERE o.group_id = v_grupo;

  PERFORM set_config('app.audit_source', c_fonte, true);

  -- ─── 3. Escrever ──────────────────────────────────────────────────────────────────
  UPDATE product_attributes a SET has_hex_color = true, has_photo = true
  WHERE a.id = v_id AND a.organization_id = c_org AND a.code = 'textura' AND a.deleted_at IS NULL
    AND NOT a.has_hex_color AND NOT a.has_photo AND NOT a.is_measurement;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'textura_com_foto_mudelar: % linhas atualizadas em vez de 1.', v_n;
  END IF;

  -- ─── 4. Conferir ──────────────────────────────────────────────────────────────────
  SELECT a.has_hex_color, a.has_photo, a.is_measurement INTO v_hex, v_foto, v_med FROM product_attributes a WHERE a.id = v_id;
  IF NOT (v_hex AND v_foto) OR v_med THEN
    RAISE EXCEPTION 'textura_com_foto_mudelar: depois de escrever, has_hex_color=%, has_photo=%, is_measurement=% (esperado true, true, false).', v_hex, v_foto, v_med;
  END IF;
  SELECT count(*) INTO v_fora_depois FROM product_attributes a WHERE a.id <> v_id AND (a.has_hex_color OR a.has_photo);
  IF v_fora_depois <> v_fora_antes THEN
    RAISE EXCEPTION 'textura_com_foto_mudelar: os outros atributos com cor ou foto passaram de % para % (esperado igual).', v_fora_antes, v_fora_depois;
  END IF;
  SELECT md5(coalesce(string_agg(to_jsonb(o)::text, '|' ORDER BY o.id), '')) INTO v_opc_depois
  FROM attribute_option_group_values o WHERE o.group_id = v_grupo;
  IF v_opc_depois IS DISTINCT FROM v_opc_antes THEN
    RAISE EXCEPTION 'textura_com_foto_mudelar: as opções da Textura mudaram (esperado igual).';
  END IF;
  RAISE NOTICE 'textura_com_foto_mudelar: Textura (%) com has_hex_color e has_photo a true; % outros atributos com cor ou foto, sem alteração.', v_id, v_fora_depois;
END
$mig$;
