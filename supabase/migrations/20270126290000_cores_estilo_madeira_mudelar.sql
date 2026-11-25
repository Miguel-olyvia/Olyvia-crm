-- =============================================================================
-- Catálogo — COR: preenche o hex (#RRGGBB) de 8 opções de cor da MUDELAR («estilo, madeira ou acabamento + uma cor clara»)
-- que hoje não têm hex. Base de RH (uetjghdkwbywbftedtth). SÓ DADOS: um UPDATE a attribute_option_group_values.hex_color.
--
-- !!! SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth). NUNCA SE APLICA NA BASE PRINCIPAL (a de produção real da Mudelar,
-- !!! onde estão clientes reais). Escreve em dados da organização Mudelar; as 8 opções, os ids e os hex foram
-- !!! lidos e aprovados só na RH. Antes do `db push`, confirmar o projeto ligado (supabase/.temp/project-ref).
-- !!! Rede de segurança, não substitui a confirmação: se nenhuma das 8 opções (ids) existir na base onde corre, a
-- !!! migration sai sem escrever; e exige que as 8 existam com o nome esperado, ativas e sem hex, ou falha.
--
-- NÃO precisa de código novo (o ecrã já mostra a amostra de cor quando a opção tem hex). Sem DDL, sem DROP, sem
-- tocar em product_attribute_values, produtos, preços, SKUs nem noutras colunas das opções.
-- =============================================================================
--
-- É o seguimento da migration 20270126280000_cores_sem_hex_mudelar (já aplicada na RH: 196 opções da Mudelar com hex,
-- 105 sem, lidas no remoto a 24/11). Esta preenche 8 das 105: as de «estilo, madeira ou acabamento + UMA palavra de cor
-- nomeada de forma inequívoca», que o dono autorizou («sim»). Cada uma recebe o hex da MESMA cor que já existe no
-- catálogo (lido na base a 24/11; hex repetidos não importam):
--   * Blanco (#FCFCFC, opção «BLANCO»):  RÚSTICO BLANCO, VINTAGE BLANCO, PATINA BLANCO, PINO BLANCO, TESEL BLANCO,
--     Tesel Blanco 72
--   * Azul   (#3563E9, opção «Blue», o azul simples do catálogo): RÚSTICO AZUL
--   * Moka   (#DCB384, opção «Moka»): ROBLE MOKA
-- «Tesel Blanco 72» vem do Excel da Mudelar (lista «Cor Móveis» do ficheiro de Móveis & Arrumação Casa de Banho),
-- mantém-se tal como o Excel o traz. As 97 restantes (as 105 menos estas 8) NÃO se tocam. Ficam de fora, por falta de
-- equivalente com hex ou por não terem uma só cor: OASIS MARRÓN CLARO e OASIS MARRÓN OSCURO (não há «marrón
-- claro/oscuro» com hex no catálogo), RÚSTICO, VINTAGE, PINO NATURAL, PINO FLANDES, RÚSTICO NATURAL, ROBLE AHUMADO,
-- MARRÓN EMPERADOR, Azul Colombino, as de duas cores, os padrões, as pedras e os decors (Artisan, Halifax, Lincoln,
-- Joplim, Tea).
--
-- Origem: a escolha do lote e os hex foram lidos na RH a 24/11 (as 8 ficam sem produtos ligados em
-- product_attribute_values; o ecrã de opções passa a mostrar a amostra). O hex é #RRGGBB em maiúsculas, o mesmo formato
-- das 196 que já tinham (a coluna é varchar(7) sem CHECK de formato; o único CHECK da tabela é o da sigla).
--
-- O que NÃO muda: os 196 hex que já existem (a migration só escreve onde hex_color é NULL ou vazio, e confere no fim
-- que os 196 estão iguais); os nomes, siglas, ordem e estado das opções; as restantes 97 sem hex.
--
-- Só toca opções da Mudelar (organização 3242e925-…), ativas, num grupo ativo de um dos três atributos de cor (atributo
-- não apagado), com hex vazio. O UPDATE leva esse filtro. Os 196 hex e o total final contam-se só na Mudelar (uma
-- opção com hex gravada noutra organização entretanto não faz falhar a migration).
--
-- Efeitos laterais lidos no remoto (triggers de attribute_option_group_values), os mesmos da migration anterior:
--   * update_attribute_option_group_values_updated_at (BEFORE UPDATE): põe updated_at = now() nas 8 linhas.
--   * trg_audit_attribute_option_group_values (AFTER, fn_audit_attribute_option_group_values): uma linha por opção
--     mudada em entity_audit_log (changed_fields = hex_color antes → depois), com
--     app.audit_source = 'migration:cores_estilo_madeira_mudelar'. A linha de auditoria guarda o GRUPO da opção
--     (entity_id = group_id; record_id fica NULL), não a opção: dá o hex antigo e o novo por grupo, mas não
--     identifica qual das opções do grupo mudou quando várias recebem o mesmo hex. Quem precisar de saber qual
--     opção mudou lê-o desta migration (a lista de ids está no VALUES) ou de updated_at.
--   * trg_cat_sigla_opcao é BEFORE INSERT (não reage a UPDATE); os RI_ConstraintTrigger só validam o group_id (não muda).
--
-- GUARDA (inerte: RAISE NOTICE e sai sem escrever nada) se: a organização 3242e925-… não existir com o nome
-- 'Mudelar' nesta base; se nenhum dos 8 ids existir nesta base (não é a base de RH); ou nenhuma das 8 opções
-- estiver elegível (já aplicada, ou já preenchidas à mão: não se sobrepõe nada).
-- Falha (RAISE EXCEPTION, nada fica) se: o estado lido não for o esperado (as opções da Mudelar com hex não forem as
-- 196 lidas, só algumas das 8 estiverem elegíveis, uma das 8 não existir, não tiver o nome esperado, não for da
-- Mudelar, não estiver ativa, o grupo estiver inativo, o atributo apagado ou for de outro atributo); o nº de linhas
-- atualizadas não for 8; alguma das 196 mudar de valor; alguma das 8 não ficar com o hex proposto; qualquer outra
-- coluna das 8 mudar; ou a transação escrever noutras linhas da tabela.
--
-- Idempotente: a segunda execução não encontra nenhuma opção com hex vazio entre as 8 e sai por NOTICE.
--
-- ORDEM: tem de correr DEPOIS de 20270126280000_cores_sem_hex_mudelar (o md5 dos 196 com hex inclui as 74 dela).
-- ATENÇÃO antes do db push: `supabase db push` aplica TUDO o que estiver pendente; listar com
-- `supabase migration list --linked` imediatamente antes.
-- =============================================================================

SET lock_timeout = '5s';
SET statement_timeout = '2min';

DO $mig$
DECLARE
  c_org           constant uuid    := '3242e925-da26-459a-8258-be04d904e355';
  c_fonte         constant text    := 'migration:cores_estilo_madeira_mudelar';
  c_esperado      constant integer := 8;
  c_ja            constant integer := 196;
  c_ja_md5        constant text    := '3ec376ce5e52222bc528d93ea30a3e39';
  v_n             bigint;
  v_m             bigint;
  v_txt           text;
  v_xid           text;
BEGIN
  -- ─── 0. Guarda (inerte) ───────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM anew_organizations o WHERE o.id = c_org AND o.name = 'Mudelar' AND o.deleted_at IS NULL) THEN
    RAISE NOTICE 'cores_estilo_madeira_mudelar: a organização Mudelar (%) não existe nesta base — nada a fazer.', c_org;
    RETURN;
  END IF;

  -- ─── 1. As 8 opções do lote (opcao_id, hex #RRGGBB, nome só para as mensagens) ───────
  DROP TABLE IF EXISTS pg_temp._cores_hex, pg_temp._cores_ja, pg_temp._cores_antes;
  CREATE TEMP TABLE _cores_hex (id uuid PRIMARY KEY, hex text NOT NULL, nome text NOT NULL) ON COMMIT DROP;
  INSERT INTO _cores_hex (id, hex, nome) VALUES
    ('2c879595-da89-438f-9b6b-c56ceffb7eb8', '#DCB384', 'ROBLE MOKA'),
    ('851ffbef-1382-4c09-8990-e9162a100f63', '#FCFCFC', 'PINO BLANCO'),
    ('ba48e775-5f4a-4aaa-9a9a-2843b9d2afb0', '#FCFCFC', 'Tesel Blanco 72'),
    ('c105dc31-75bc-4818-986e-be031289762c', '#3563E9', 'RÚSTICO AZUL'),
    ('dc77d1ee-faf7-41e2-9688-8dc29f4cc8d3', '#FCFCFC', 'TESEL BLANCO'),
    ('dd732d44-c82b-4871-a712-2be7eaf8aaf3', '#FCFCFC', 'VINTAGE BLANCO'),
    ('fa533d88-7b0e-48f9-90fc-8cacda1ea57a', '#FCFCFC', 'RÚSTICO BLANCO'),
    ('ffca7fce-6c6b-4c67-b273-704f45facfa7', '#FCFCFC', 'PATINA BLANCO');
  SELECT count(*) INTO v_n FROM _cores_hex;
  SELECT count(*) INTO v_m FROM _cores_hex h WHERE h.hex !~ '^#[0-9A-F]{6}$';
  IF v_n <> c_esperado OR v_m > 0 THEN
    RAISE EXCEPTION 'cores_estilo_madeira_mudelar: a lista tem % opções (esperadas %) e % com hex fora do formato #RRGGBB.', v_n, c_esperado, v_m;
  END IF;

  -- ─── 2. O estado lido ──────────────────────────────────────────────────────────
  -- esta migration é só da base de RH: se nenhum dos 8 ids existe aqui, não é essa base — sai sem escrever
  SELECT count(*) INTO v_n FROM _cores_hex h JOIN attribute_option_group_values v ON v.id = h.id;
  IF v_n = 0 THEN
    RAISE NOTICE 'cores_estilo_madeira_mudelar: nenhuma das % opções existe nesta base (esta migration é só da base de RH) — nada a fazer.', c_esperado;
    RETURN;
  END IF;

  -- as opções da MUDELAR que já têm hex (só desta organização: um hex gravado noutra não conta)
  CREATE TEMP TABLE _cores_ja ON COMMIT DROP AS
  SELECT v.id, v.hex_color AS hex
  FROM attribute_option_group_values v
  JOIN attribute_option_groups g ON g.id = v.group_id AND g.organization_id = c_org
  WHERE v.hex_color IS NOT NULL AND v.hex_color <> '';
  SELECT count(*) INTO v_n FROM _cores_ja;

  -- as 8: existem com o nome esperado, são da Mudelar, ativas, num grupo ativo de um atributo de cor não apagado, com hex vazio?
  SELECT count(*) INTO v_m
  FROM _cores_hex h
  JOIN attribute_option_group_values v ON v.id = h.id
  JOIN attribute_option_groups g ON g.id = v.group_id AND g.organization_id = c_org AND g.is_active
  JOIN product_attributes a ON a.id = g.attribute_id AND a.organization_id = c_org AND a.deleted_at IS NULL
  WHERE v.is_active AND (v.hex_color IS NULL OR v.hex_color = '')
    AND (lower(v.value_text::text) = lower(h.nome) OR lower(coalesce(v.display_name, '')::text) = lower(h.nome))
    AND a.label IN ('Cor', 'Cor da frente', 'Cor do corpo') AND coalesce(a.has_hex_color, false);
  IF v_m = 0 THEN
    RAISE NOTICE 'cores_estilo_madeira_mudelar: nenhuma das % opções está elegível (hex já preenchido, ou opção, nome ou grupo diferentes) — nada a fazer.', c_esperado;
    RETURN;
  END IF;
  IF v_m <> c_esperado THEN
    SELECT string_agg(h.nome || ' (' || h.id::text || ')', '; ') INTO v_txt
    FROM _cores_hex h
    WHERE NOT EXISTS (
      SELECT 1 FROM attribute_option_group_values v
      JOIN attribute_option_groups g ON g.id = v.group_id AND g.organization_id = c_org AND g.is_active
      JOIN product_attributes a ON a.id = g.attribute_id AND a.organization_id = c_org AND a.deleted_at IS NULL
      WHERE v.id = h.id AND v.is_active AND (v.hex_color IS NULL OR v.hex_color = '')
        AND (lower(v.value_text::text) = lower(h.nome) OR lower(coalesce(v.display_name, '')::text) = lower(h.nome))
        AND a.label IN ('Cor', 'Cor da frente', 'Cor do corpo') AND coalesce(a.has_hex_color, false));
    RAISE EXCEPTION 'cores_estilo_madeira_mudelar: só % das % opções estão elegíveis; as outras mudaram desde a leitura: %. Rever antes de aplicar.',
      v_m, c_esperado, left(v_txt, 1500);
  END IF;
  SELECT md5(string_agg(j.id::text || ':' || j.hex, ',' ORDER BY j.id)) INTO v_txt FROM _cores_ja j;
  IF v_n <> c_ja OR v_txt IS DISTINCT FROM c_ja_md5 THEN
    RAISE EXCEPTION 'cores_estilo_madeira_mudelar: % opções com hex (esperadas %, md5 %): o estado não é o lido. Rever antes de aplicar.',
      v_n, c_ja, v_txt;
  END IF;

  -- o estado das 8 antes (para conferir que só o hex_color mudou)
  CREATE TEMP TABLE _cores_antes ON COMMIT DROP AS
  SELECT v.id, v.group_id, v.value_text, v.display_name, v.sigla, v.sort_order, v.is_active
  FROM attribute_option_group_values v JOIN _cores_hex h ON h.id = v.id;

  v_xid := (txid_current() % 4294967296)::text;
  PERFORM set_config('app.audit_source', c_fonte, true);

  -- ─── 3. Gravar (só onde o hex está vazio, só na Mudelar) ─────────────────────────
  UPDATE attribute_option_group_values v
  SET hex_color = h.hex
  FROM _cores_hex h, attribute_option_groups g, product_attributes a
  WHERE v.id = h.id
    AND g.id = v.group_id AND g.organization_id = c_org AND g.is_active
    AND a.id = g.attribute_id AND a.organization_id = c_org AND a.deleted_at IS NULL
    AND v.is_active
    AND (v.hex_color IS NULL OR v.hex_color = '');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_esperado THEN
    RAISE EXCEPTION 'cores_estilo_madeira_mudelar: % opções atualizadas em vez de %.', v_n, c_esperado;
  END IF;

  -- ─── 4. Conferir (cada contagem é do que está ERRADO; tem de dar 0) ───────────
  -- as 196 que já tinham hex ficam iguais
  SELECT count(*) INTO v_n
  FROM _cores_ja j LEFT JOIN attribute_option_group_values v ON v.id = j.id
  WHERE v.hex_color IS DISTINCT FROM j.hex;
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % das % opções que já tinham hex mudaram de valor.', v_n, c_ja; END IF;

  -- as 8 ficam com o hex proposto
  SELECT count(*) INTO v_n
  FROM _cores_hex h LEFT JOIN attribute_option_group_values v ON v.id = h.id
  WHERE v.hex_color IS DISTINCT FROM h.hex;
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % das % opções não ficaram com o hex proposto.', v_n, c_esperado; END IF;

  -- nada mais mudou nas 8 (grupo, valor, nome, sigla, ordem, estado)
  SELECT count(*) INTO v_n
  FROM _cores_antes a LEFT JOIN attribute_option_group_values v ON v.id = a.id
  WHERE v.id IS NULL OR v.group_id <> a.group_id OR v.value_text <> a.value_text
     OR v.display_name IS DISTINCT FROM a.display_name OR v.sigla IS DISTINCT FROM a.sigla
     OR v.sort_order IS DISTINCT FROM a.sort_order OR v.is_active <> a.is_active;
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % das % opções mudaram noutra coluna além do hex.', v_n, c_esperado; END IF;

  -- total de opções da Mudelar com hex: as 196 + as 8; e nenhuma outra linha da tabela escrita nesta transação
  SELECT count(*) INTO v_n FROM attribute_option_group_values v
  JOIN attribute_option_groups g ON g.id = v.group_id AND g.organization_id = c_org
  WHERE v.hex_color IS NOT NULL AND v.hex_color <> '';
  IF v_n <> c_ja + c_esperado THEN
    RAISE EXCEPTION 'Conferir: % opções da Mudelar com hex no fim (esperadas % + % = %).', v_n, c_ja, c_esperado, c_ja + c_esperado;
  END IF;
  SELECT count(*) INTO v_n FROM attribute_option_group_values v
  WHERE v.xmin::text = v_xid AND NOT EXISTS (SELECT 1 FROM _cores_hex h WHERE h.id = v.id);
  SELECT count(*) INTO v_m FROM attribute_option_group_values v
  JOIN attribute_option_groups g ON g.id = v.group_id
  WHERE v.xmin::text = v_xid AND g.organization_id IS DISTINCT FROM c_org;
  IF v_n > 0 OR v_m > 0 THEN
    RAISE EXCEPTION 'Conferir: % opções fora da lista e % de outra organização escritas nesta transação.', v_n, v_m;
  END IF;

  -- a auditoria linha a linha (o trigger engole os próprios erros: aqui só se avisa, não se falha)
  SELECT count(*) INTO v_n FROM entity_audit_log e
  WHERE e.organization_id = c_org AND e.source = c_fonte AND e.table_name = 'attribute_option_group_values' AND e.operation = 'UPDATE';
  IF v_n <> c_esperado THEN
    RAISE WARNING 'cores_estilo_madeira_mudelar: % linhas de auditoria em vez de % (o trigger engole o erro); os hex ficaram gravados.', v_n, c_esperado;
  END IF;

  RAISE NOTICE 'cores_estilo_madeira_mudelar: % opções de cor da Mudelar com hex preenchido; as % que já tinham ficaram iguais. Conferido.',
    c_esperado, c_ja;
END $mig$;

RESET statement_timeout;
RESET lock_timeout;
