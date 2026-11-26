-- =============================================================================
-- Catálogo — MUDELAR igual aos Excels, ONDA 2: os produtos com SKU LEGADO que têm linha num Excel. MIGRATION DE DADOS.
-- Base de RH (uetjghdkwbywbftedtth).
-- =============================================================================
--
-- !!! SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth). SÓ A MUDELAR (3242e925-da26-459a-8258-be04d904e355): todas as escritas
-- !!! levam o filtro da organização. Os ids e os valores «de» foram lidos na RH a 26/11/2026 (SELECT como administrador,
-- !!! sem RLS), DEPOIS da onda 1 (20270129500000). Noutra base (a principal) a organização ou os produtos não existem com
-- !!! estes ids e a migration sai por RAISE NOTICE sem escrever nada. Antes do `db push`, confirmar
-- !!! supabase/.temp/project-ref = uetjghdkwbywbftedtth.
--
-- Pedido do dono: «men so faz que teja tudo como nos excels sf». Os legados (SKU manual, sem modelo, sem atributos) são
-- fichas mínimas criadas a 23/11 para o histórico de orçamentos e negócios; cada um tem, quase sempre, um produto novo
-- «gémeo» (SKU gerado, com atributos) que é o mesmo artigo. Dos 218 legados, 119 têm linha num Excel. Destes, 103 já
-- estão iguais ao Excel nos campos de negócio (a onda 1 alinhou 86). Plano gerado por script (mudelar-audit/onda2:
-- o2_plan.py e o2_sql.py), fora da pasta do projeto; o que fica de fora e porquê está em mudelar-audit/onda2/fora.csv.
--
-- O QUE FAZ, em 52 legados da Mudelar (lista fechada, embutida abaixo; nada se calcula na hora):
--   (a) CAMPOS, em 16 legados das linhas ambíguas do Excel (a mesma linha casa com o legado e com o gémeo; a onda 1
--       deixou-as de fora): fornecedor 16 (a ligação preferencial «Fornecedor Demo» passa ao fornecedor real, que
--       já existe; fornecedor_livre 16; em dois passos como na onda 1), código do fornecedor 5, PVP 12, custo
--       2 (e o preço da ligação 2). Nome, marca, IVA e descrição já estão como no Excel (0 alterações).
--   (b) ATRIBUTOS, em 52 legados: copiam-se TODOS os atributos do gémeo (67 valores), só quando o gémeo cumpre todas
--       as regras: semelhança de nome >= 0,8 (Jaccard dos termos, a mesma da auditoria), a mesma subcategoria, a mesma
--       medida no nome, sem empate com outro produto novo, nunca um «pai» (o Excel do legado traz uma lista de cores) com
--       uma cor, nunca um gémeo cujo nome acrescenta uma cor ou acabamento que o legado não diz, e cada valor existe como
--       opção ativa do grupo do atributo (as medidas, sem grupo, levam o valor em value_json). Legados com e sem campos:
--       só campos 0, só atributos 36, ambos 16.
--   (c) a LIGAÇÃO legado→gémeo dos 52 fica em _mudelar_excel.onda2_gemeos (schema privado, só postgres).
--
-- O QUE NÃO FAZ: não muda SKU (nenhuma chamada a cat_gerar_sku_produto; C2 exige 0 SKU alterados e C13 que os legados
-- continuam com SKU manual), não dá modelo nem família a nenhum legado (C13), não arquiva nem apaga nada (os 99 legados
-- sem linha ficam para a onda 4), não reaponta orçamentos, negócios, compras nem a vista do cliente (C8), não toca nos
-- gémeos (C3), não cria marcas, fornecedores, opções nem produtos, não mexe em estado, subcategoria, unidade nem stock.
-- EXCEÇÕES à letra do Excel: as linhas de Torneiras só das versões antigas não se aplicam (manda a Rev1, 12 legados);
-- os 145 consumíveis CONS-… e os 7 CAT/TESTE não entram (não estão no Excel de vendas; os CONS estão nas receitas);
-- a cor continua a ser um produto (nenhum «pai» recebe uma cor); os gémeos das linhas ambíguas não são alinhados aqui.
--
-- GUARDAS (falham a migration inteira; nada fica): G0 a Mudelar existe (senão NOTICE e sai); L1 as listas têm os números
-- do cabeçalho; G1 contagens de partida (30010 produtos vivos, 548 famílias, 14637 membros); G2 cada legado existe, é
-- da Mudelar, está vivo, tem o SKU manual esperado, não tem modelo e não está em família; G7 cada gémeo está vivo, com
-- SKU gerado, a mesma subcategoria e exatamente os atributos lidos a 26/11; G7b cada valor existe como opção; G3 cada
-- valor «de» é o atual (ou todos já são «para»: já aplicada, sai por NOTICE); G4/G4b fornecedores de destino e ligações
-- (como na onda 1); G5 o utilizador da auditoria é membro ativo; G6 os eixos das famílias têm valores distintos.
-- Lock: pg_advisory_xact_lock(hashtextextended('cat_familias:' || org, 0)) e os legados e gémeos FOR NO KEY UPDATE.
-- CONFERÊNCIAS no fim: C11 cada valor gravado e cada legado com os atributos do gémeo; C12 auditoria e históricos sem
-- duplicados (uma linha por atributo novo); C1 nos legados só mudaram os campos desta onda; C2 0 SKU alterados; C13 SKU
-- manual, sem modelo, sem família; C3 produtos fora da onda iguais (sem updated_at); C4 preços e C5 ligações fora da
-- onda iguais; C6 atributos que já existiam iguais e +67 no total; C7 famílias (548 / 14637, impressão digital e eixos
-- distintos); C8 orçamentos, negócios, receitas, compras e negocio_vista_cliente iguais; C9 nada escrito fora da
-- Mudelar (xmin); C10 a cópia fechada.
--
-- CÓPIA E REVERSÃO: o estado antigo fica em _mudelar_excel.onda2_* (só postgres); os atributos criados ficam listados em
-- _mudelar_excel.onda2_atributos_novos. REVERSÃO fora da pasta das migrations (estar aqui é ser aplicada):
-- mudelar-reverter-onda2.sql, guardado com o trabalho. Para a aplicar, entra como uma migration nova.
--
-- ORDEM: depois de 20270129500000 (última no remoto RH a 26/11). `supabase db push` aplica TUDO o que estiver pendente:
-- listar com `supabase migration list --linked` imediatamente antes e empurrar só esta.
-- =============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

-- ─── 1. A lista fechada (tabelas temporárias: desaparecem no COMMIT) ───────────────────────────────
-- os legados tocados e o SKU de cada um (G2/C2/C13)
CREATE TEMP TABLE _o2_sku (id uuid PRIMARY KEY, sku text NOT NULL) ON COMMIT DROP;
INSERT INTO _o2_sku (id, sku) VALUES
  ('01b4abd4-cd1d-4a35-84e4-f6f9f04a7b29', 'MCCAIC0005'),
  ('0b6215ee-8969-4621-9c80-2d703cdfdac8', 'MACBE0047'),
  ('0f1f4c37-ee68-4a23-87a7-9750e9839654', 'LLCCI0011'),
  ('0f26378f-cf97-4ced-bda6-d4fd72179bbc', 'RSPC0014'),
  ('21e2abb0-e384-4e5e-a970-1b27ee086d8f', 'RSPC0015'),
  ('2a745e79-fe5c-4653-bd26-aba28974d37d', 'LSL0010'),
  ('2d582a9b-d4c1-4b48-b936-4237e6cd3d7f', 'MCCASC0010'),
  ('35aba3e6-e577-4f53-9aa5-7dece8674403', 'MCCASC0012'),
  ('37cd6409-4f67-43ed-af82-48b88c3bcb53', 'MACBE0093'),
  ('3a250723-16e8-4445-8305-e03f6d006941', 'EES0002'),
  ('3f41e8fb-a90f-4d9e-ade8-75f24f7ad14b', 'MACBE0074'),
  ('465a5c2c-6870-467a-adb3-9f8a8d90755b', 'EMO0003'),
  ('4e95e5dd-7ea6-4b5b-9273-439762426949', 'RP0035'),
  ('5c126624-62fd-4c02-a6b2-524835766bbf', 'ACBT0013'),
  ('5ce5e481-4b73-4c4f-805a-c120f03bf7af', 'MCCAIC0001'),
  ('5faf6029-281f-46c8-bbfa-fad01cac7d93', 'RSPC0004'),
  ('62645e38-0281-4ba6-b7d9-bd5fd9a4a832', 'MACBE0073'),
  ('69b890e6-254a-4a34-9e42-d72a543086e0', 'MCCAIC0003'),
  ('78346ea5-4b9b-4efe-a092-9f18c1090ab2', 'MACBE0045'),
  ('7ea74d67-af9f-44f6-a5c6-c9fc454d7541', 'RSPC0001'),
  ('8e202646-ae6a-4134-9754-986a51aa9c8b', 'EFO0003'),
  ('9bbb6084-5bd8-48bc-a257-775922bf342b', 'MACBE0036'),
  ('9dfb2e3e-ae36-47e1-9bbe-3e296fa90a2b', 'MACBE0078'),
  ('9eebe561-bd2f-413d-a883-03a9ea562b0e', 'MCCAIC0018'),
  ('a37359b0-4aaf-428c-819e-0a2e7134a4b7', 'MCCASC0105'),
  ('a9cf66db-9f9f-4d74-9de6-072a3b3b4105', 'LSS0016'),
  ('ab51f399-f500-4144-a9e5-cfdb4b5da077', 'ET0004'),
  ('ac1d91ba-59c3-405b-9321-d8f46713ca9d', 'EE0005'),
  ('ad8d6394-1eb8-444c-9a83-fc9f4d7ef7d0', 'RSPC0006'),
  ('addbe0a0-774a-4e9d-b0ac-512cf59d741b', 'MACBE0049'),
  ('bdc250f7-579b-4a5f-9d51-640cabcdcd65', 'MACBE0034'),
  ('bec595b8-67d2-434f-812a-75a0142ccfea', 'MCCASC0009'),
  ('c2be5bf6-360b-4fff-86d1-97f7d8fefb81', 'LSS0009'),
  ('c545e43b-95c7-43c6-8650-9a5036d7840e', 'EP0010'),
  ('c70efc94-d8ad-4231-bbff-37c31ab3ead2', 'LLCCI0009'),
  ('c81d9849-6196-4d0c-9c68-744050fd3e8b', 'MACBAL0009'),
  ('c8df2b88-e927-4ef1-989a-14284b5af2dd', 'MACBE0085'),
  ('cb1769a2-98d6-417d-869d-fa64ebd06732', 'MCCASC0011'),
  ('cb3ac0c4-7eaf-460b-87ee-484013a5735a', 'LSL0008'),
  ('cf7536cd-ff62-4877-9c92-1810bcb2ef9b', 'MCCAIC0002'),
  ('d0d2086d-c156-4d6f-a491-469cb33fc637', 'LLCCI0002'),
  ('d60a5771-1a57-4cb3-81ba-2293770f4f6d', 'RC0005'),
  ('d99cd82a-0eee-46a8-bb68-e0ccb8f7866d', 'MCCASC0014'),
  ('d9f85587-1a43-4047-84af-0860b1d2222d', 'LSL0003'),
  ('df933f3b-1a9b-4b50-82e8-477b036a47b6', 'MCCAIC0004'),
  ('e2f20fb2-87b5-43bb-a3ad-7ff52e9b60e8', 'LSB0010'),
  ('e810fd48-fb6e-493e-9e95-e699fd02eb0c', 'MCCASC0013'),
  ('ebd9edb9-d7f9-48d0-ac06-be4a4e5b3860', 'MCCASC0001'),
  ('f6681932-2b05-4e14-b40b-71b9a743186a', 'MACBAL0004'),
  ('fb9e115c-ec1a-481a-a622-db9f94ec2356', 'ET0007'),
  ('fcd5acfc-2f4b-4e65-a94f-395c14a46d5d', 'EMLL0005'),
  ('fea8217a-ccde-437b-8ea8-3433b30d3425', 'EFO0002');

-- products: campo, valor atual («de») e valor do Excel («para»)
CREATE TEMP TABLE _o2_prod (id uuid NOT NULL, campo text NOT NULL, de text, para text NOT NULL, PRIMARY KEY (id, campo)) ON COMMIT DROP;
INSERT INTO _o2_prod (id, campo, de, para) VALUES
  ('0b6215ee-8969-4621-9c80-2d703cdfdac8', 'fornecedor_livre', 'Fornecedor Demo', 'New Bath, Lda'),
  ('21e2abb0-e384-4e5e-a970-1b27ee086d8f', 'fornecedor_livre', 'Fornecedor Demo', 'NOVALAM INNOVACION, SA'),
  ('2a745e79-fe5c-4653-bd26-aba28974d37d', 'fornecedor_livre', 'Fornecedor Demo', 'RUBICER, Lda.'),
  ('5faf6029-281f-46c8-bbfa-fad01cac7d93', 'fornecedor_livre', 'Fornecedor Demo', 'EAST COAST SPC, S.A.'),
  ('78346ea5-4b9b-4efe-a092-9f18c1090ab2', 'fornecedor_livre', 'Fornecedor Demo', 'New Bath, Lda'),
  ('7ea74d67-af9f-44f6-a5c6-c9fc454d7541', 'fornecedor_livre', 'Fornecedor Demo', 'EAST COAST SPC, S.A.'),
  ('9bbb6084-5bd8-48bc-a257-775922bf342b', 'fornecedor_livre', 'Fornecedor Demo', 'New Bath, Lda'),
  ('a9cf66db-9f9f-4d74-9de6-072a3b3b4105', 'fornecedor_livre', 'Fornecedor Demo', 'RUBICER, Lda.'),
  ('ad8d6394-1eb8-444c-9a83-fc9f4d7ef7d0', 'fornecedor_livre', 'Fornecedor Demo', 'NOVALAM INNOVACION, SA'),
  ('addbe0a0-774a-4e9d-b0ac-512cf59d741b', 'fornecedor_livre', 'Fornecedor Demo', 'New Bath, Lda'),
  ('bdc250f7-579b-4a5f-9d51-640cabcdcd65', 'fornecedor_livre', 'Fornecedor Demo', 'New Bath, Lda'),
  ('c2be5bf6-360b-4fff-86d1-97f7d8fefb81', 'fornecedor_livre', 'Fornecedor Demo', 'RUBICER, Lda.'),
  ('cb3ac0c4-7eaf-460b-87ee-484013a5735a', 'fornecedor_livre', 'Fornecedor Demo', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
  ('d9f85587-1a43-4047-84af-0860b1d2222d', 'fornecedor_livre', 'Fornecedor Demo', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
  ('e2f20fb2-87b5-43bb-a3ad-7ff52e9b60e8', 'fornecedor_livre', 'Fornecedor Demo', 'RUBICER, Lda.'),
  ('f6681932-2b05-4e14-b40b-71b9a743186a', 'fornecedor_livre', 'Fornecedor Demo', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO');

-- product_prices: a linha atual do tipo, preço «de» e «para» (preco_exato = o valor a 6 casas)
CREATE TEMP TABLE _o2_preco (row_id uuid PRIMARY KEY, product_id uuid NOT NULL, tipo text NOT NULL, de numeric NOT NULL, para numeric NOT NULL, exato numeric NOT NULL) ON COMMIT DROP;
INSERT INTO _o2_preco (row_id, product_id, tipo, de, para, exato) VALUES
  ('33fada2d-e1f0-43be-a476-dea69630baba', '0b6215ee-8969-4621-9c80-2d703cdfdac8', 'retail', 320, 385, 385),
  ('562b9fd0-fbdb-407a-bf37-d678d842d716', '2a745e79-fe5c-4653-bd26-aba28974d37d', 'purchase', 70, 75, 75),
  ('852f7cd3-67ad-490d-bb52-675eb22f67e3', '2a745e79-fe5c-4653-bd26-aba28974d37d', 'retail', 116.67, 150, 150),
  ('28af7b86-e763-4b6d-ace2-0e9028b287a2', '78346ea5-4b9b-4efe-a092-9f18c1090ab2', 'retail', 275, 330, 330),
  ('840d8e6b-6ec9-4dc2-b0bc-e81925ba3ef2', '9bbb6084-5bd8-48bc-a257-775922bf342b', 'retail', 250, 300, 300),
  ('726dc5d2-fc69-44a9-8be4-a97b20265c31', 'a9cf66db-9f9f-4d74-9de6-072a3b3b4105', 'purchase', 90, 92.5, 92.5),
  ('b7a9558d-9d4c-4f6a-9d4d-41e2ac736b17', 'a9cf66db-9f9f-4d74-9de6-072a3b3b4105', 'retail', 150, 185, 185),
  ('416e7874-81fb-4f98-90a5-d1f63736e56d', 'addbe0a0-774a-4e9d-b0ac-512cf59d741b', 'retail', 258.33, 310, 310),
  ('8aa7d2a9-dc57-4da2-8389-2f6844f5fc88', 'bdc250f7-579b-4a5f-9d51-640cabcdcd65', 'retail', 225, 270, 270),
  ('7e9cb4e3-2d35-4703-b2a9-1f4ae3bd7804', 'c2be5bf6-360b-4fff-86d1-97f7d8fefb81', 'retail', 233.33, 280, 280),
  ('e0cbd293-be2c-430e-b526-380a04a5aac4', 'cb3ac0c4-7eaf-460b-87ee-484013a5735a', 'retail', 67.5, 75, 75),
  ('867a5c5b-d44c-4267-b286-096d42e3ddf0', 'd9f85587-1a43-4047-84af-0860b1d2222d', 'retail', 54, 60, 60),
  ('7984c556-e8fa-46bf-8f97-b762b21185d3', 'e2f20fb2-87b5-43bb-a3ad-7ff52e9b60e8', 'retail', 116.67, 140, 140),
  ('a09c137d-79bb-459c-825e-9c55500e65b3', 'f6681932-2b05-4e14-b40b-71b9a743186a', 'retail', 72, 80, 80);

-- item_suppliers: o que muda em cada ligação (fornecedor, código, preço), com o valor atual
CREATE TEMP TABLE _o2_isup (id uuid PRIMARY KEY, product_id uuid NOT NULL, m_sup boolean NOT NULL, sup_de uuid, sup_para uuid, m_ssku boolean NOT NULL, ssku_de text, ssku_para text, m_pp boolean NOT NULL, pp_de numeric, pp_para numeric) ON COMMIT DROP;
INSERT INTO _o2_isup (id, product_id, m_sup, sup_de, sup_para, m_ssku, ssku_de, ssku_para, m_pp, pp_de, pp_para) VALUES
  ('0c6f668a-b701-4f97-94fb-3c17c0887894', '7ea74d67-af9f-44f6-a5c6-c9fc454d7541', true, '33ab278b-47dd-4c24-8207-318b52258da5', 'd78c9cb1-fd91-4087-9b4f-c1f08354bf1f', false, NULL, NULL, false, NULL, NULL),
  ('107fbc3c-920c-4ead-9706-89b5e30e001a', 'e2f20fb2-87b5-43bb-a3ad-7ff52e9b60e8', true, '33ab278b-47dd-4c24-8207-318b52258da5', '08a685c1-1cc6-40c8-a250-62307dc7e463', true, 'LSB0010', 'RSBDMAXBRCBR', false, NULL, NULL),
  ('34c66a65-43eb-438f-84fa-01d5b71f836f', 'addbe0a0-774a-4e9d-b0ac-512cf59d741b', true, '33ab278b-47dd-4c24-8207-318b52258da5', '61ae4e27-1526-4328-8d99-5af4962ecd77', false, NULL, NULL, false, NULL, NULL),
  ('3fb3f370-0d0f-498a-9fa0-353b4eef8211', '2a745e79-fe5c-4653-bd26-aba28974d37d', true, '33ab278b-47dd-4c24-8207-318b52258da5', '08a685c1-1cc6-40c8-a250-62307dc7e463', true, 'LSL0010', 'RS78105MCP', true, 70, 75),
  ('452537cb-40f2-46c5-b69c-88ff29aeabac', 'f6681932-2b05-4e14-b40b-71b9a743186a', true, '33ab278b-47dd-4c24-8207-318b52258da5', '18ebe983-523a-4c8e-9721-ba0d0d1a9662', false, NULL, NULL, false, NULL, NULL),
  ('4f12566a-ac1a-4f00-92de-0cff2202d941', 'c2be5bf6-360b-4fff-86d1-97f7d8fefb81', true, '33ab278b-47dd-4c24-8207-318b52258da5', '08a685c1-1cc6-40c8-a250-62307dc7e463', true, 'LSS0009', 'RSWM9908GLM', false, NULL, NULL),
  ('4ff5b948-5695-4434-9cc0-0d5d1d913226', 'bdc250f7-579b-4a5f-9d51-640cabcdcd65', true, '33ab278b-47dd-4c24-8207-318b52258da5', '61ae4e27-1526-4328-8d99-5af4962ecd77', false, NULL, NULL, false, NULL, NULL),
  ('5e7b7308-3cac-4495-a044-8b5bb5d4c7b1', '9bbb6084-5bd8-48bc-a257-775922bf342b', true, '33ab278b-47dd-4c24-8207-318b52258da5', '61ae4e27-1526-4328-8d99-5af4962ecd77', false, NULL, NULL, false, NULL, NULL),
  ('8726c471-a45e-47d5-b286-ee320bce4a24', '21e2abb0-e384-4e5e-a970-1b27ee086d8f', true, '33ab278b-47dd-4c24-8207-318b52258da5', 'db958d1d-4665-425b-aa0d-568118a26076', true, 'RSPC0015', '00NVZ000095', false, NULL, NULL),
  ('8adfc007-c2ff-4cf8-842c-ce59a1c2635c', '0b6215ee-8969-4621-9c80-2d703cdfdac8', true, '33ab278b-47dd-4c24-8207-318b52258da5', '61ae4e27-1526-4328-8d99-5af4962ecd77', false, NULL, NULL, false, NULL, NULL),
  ('93192b65-584a-43cb-a17a-b12525e12370', '78346ea5-4b9b-4efe-a092-9f18c1090ab2', true, '33ab278b-47dd-4c24-8207-318b52258da5', '61ae4e27-1526-4328-8d99-5af4962ecd77', false, NULL, NULL, false, NULL, NULL),
  ('970c423a-d95e-473b-add2-358ae42e4ff9', '5faf6029-281f-46c8-bbfa-fad01cac7d93', true, '33ab278b-47dd-4c24-8207-318b52258da5', 'd78c9cb1-fd91-4087-9b4f-c1f08354bf1f', false, NULL, NULL, false, NULL, NULL),
  ('9c586b58-716b-4220-8cf0-b66172b2813a', 'cb3ac0c4-7eaf-460b-87ee-484013a5735a', true, '33ab278b-47dd-4c24-8207-318b52258da5', '18ebe983-523a-4c8e-9721-ba0d0d1a9662', false, NULL, NULL, false, NULL, NULL),
  ('d9522b56-0a6f-462a-912b-f732e1f75c7d', 'ad8d6394-1eb8-444c-9a83-fc9f4d7ef7d0', true, '33ab278b-47dd-4c24-8207-318b52258da5', 'db958d1d-4665-425b-aa0d-568118a26076', false, NULL, NULL, false, NULL, NULL),
  ('e0b5c078-995c-4359-812a-dbb313f27076', 'a9cf66db-9f9f-4d74-9de6-072a3b3b4105', true, '33ab278b-47dd-4c24-8207-318b52258da5', '08a685c1-1cc6-40c8-a250-62307dc7e463', true, 'LSS0016', 'RSC205FMAXBRC', true, 90, 92.5),
  ('f5b39a6a-09ea-4c22-b8e9-80c6ce54879b', 'd9f85587-1a43-4047-84af-0860b1d2222d', true, '33ab278b-47dd-4c24-8207-318b52258da5', '18ebe983-523a-4c8e-9721-ba0d0d1a9662', false, NULL, NULL, false, NULL, NULL);

-- a ligação legado→gémeo (semelhança de nome e número de atributos do gémeo)
CREATE TEMP TABLE _o2_gemeo (legado_id uuid PRIMARY KEY, gemeo_id uuid NOT NULL, gemeo_sku text NOT NULL, semelhanca numeric NOT NULL, n_attr integer NOT NULL) ON COMMIT DROP;
INSERT INTO _o2_gemeo (legado_id, gemeo_id, gemeo_sku, semelhanca, n_attr) VALUES
  ('01b4abd4-cd1d-4a35-84e4-f6f9f04a7b29', '19a9df99-878f-442b-b506-58212e7b8502', 'MCC-AI-0004-70', 1, 1),
  ('0b6215ee-8969-4621-9c80-2d703cdfdac8', 'c64d158e-474d-4cc6-9013-2ecb6b2c2aff', 'MACB-E-0038-120X80', 1, 1),
  ('0f1f4c37-ee68-4a23-87a7-9750e9839654', 'a9c045b9-45f5-46b9-b0ba-6e7185bdfd92', 'LLC-CI-0008-50', 1, 1),
  ('0f26378f-cf97-4ced-bda6-d4fd72179bbc', '7bbdcfa0-33c8-4c2d-8415-d7329aaccde5', 'RV-SP-0010-B-NAT', 0.833, 2),
  ('21e2abb0-e384-4e5e-a970-1b27ee086d8f', '43227a76-b7a0-4d5f-aec4-fa385b038c11', 'RV-SP-0011-NAT', 1, 1),
  ('2a745e79-fe5c-4653-bd26-aba28974d37d', '1198362e-40d4-43a4-988e-ca067f2796f4', 'LS-L-0001-CC', 1, 1),
  ('2d582a9b-d4c1-4b48-b936-4237e6cd3d7f', '9de4cde6-6db2-4f87-b0b8-572376b4f6ec', 'MCC-AS-0004-40X90', 1, 1),
  ('35aba3e6-e577-4f53-9aa5-7dece8674403', '8fe9bc7d-8449-48bd-99cb-dd2e861e51c9', 'MCC-AS-0004-60X90', 1, 1),
  ('37cd6409-4f67-43ed-af82-48b88c3bcb53', '96681219-151d-43c0-a491-37ff1b824587', 'MACB-E-0021-120X80', 0.8, 1),
  ('3a250723-16e8-4445-8305-e03f6d006941', 'f04929da-7850-408d-909a-08c182ca1a9b', 'EL-ES-0001-15L-PB', 1, 2),
  ('3f41e8fb-a90f-4d9e-ade8-75f24f7ad14b', 'c928f215-18db-44ef-bd0e-48aee0715954', 'MACB-E-0021-60X60', 0.8, 1),
  ('465a5c2c-6870-467a-adb3-9f8a8d90755b', '5e2c159b-3a81-4569-ba12-fd6e3b486523', 'EL-MO-0001-P', 1, 1),
  ('4e95e5dd-7ea6-4b5b-9273-439762426949', 'd5952142-3991-4ad1-a5df-97fb6c854e82', 'RV-PRC-0003-B-60X60-NAT', 1, 3),
  ('5c126624-62fd-4c02-a6b2-524835766bbf', '99396187-ad07-43dd-841b-c2e672a45a6d', 'ACB-T-0013-B', 1, 1),
  ('5ce5e481-4b73-4c4f-805a-c120f03bf7af', '79443e51-d77d-4212-9fa6-ed85f4f82786', 'MCC-AI-0004-30', 1, 1),
  ('5faf6029-281f-46c8-bbfa-fad01cac7d93', '937da09d-9619-4146-924f-84ba7157429c', 'RV-SP-0001-CAS-182X1220MM-NAT', 1, 3),
  ('62645e38-0281-4ba6-b7d9-bd5fd9a4a832', '2de89244-7aeb-42ee-b6f7-57b204805dd7', 'MACB-E-0021-60X50', 0.8, 1),
  ('69b890e6-254a-4a34-9e42-d72a543086e0', 'f808f589-7172-4a6e-b867-cbdae61b1f55', 'MCC-AI-0004-50', 1, 1),
  ('78346ea5-4b9b-4efe-a092-9f18c1090ab2', '33e9a111-0e0e-467f-9f5c-28a478285b4a', 'MACB-E-0038-80X80', 1, 1),
  ('7ea74d67-af9f-44f6-a5c6-c9fc454d7541', 'f3c9a75f-eab3-4541-b1f6-648039367b04', 'RV-SP-0001-BEG-182X1220MM-NAT', 1, 3),
  ('8e202646-ae6a-4134-9754-986a51aa9c8b', 'e4bda5ee-2f3d-4e02-bac2-1ff4d361be2e', 'EL-FR-0001-P', 1, 1),
  ('9bbb6084-5bd8-48bc-a257-775922bf342b', '631d6e7b-0803-416b-bfdc-745f8225b688', 'MACB-E-0034-80X80', 1, 1),
  ('9dfb2e3e-ae36-47e1-9bbe-3e296fa90a2b', '58b75928-9d6a-4dd2-b949-32382e03e9c1', 'MACB-E-0021-80X50', 0.8, 1),
  ('9eebe561-bd2f-413d-a883-03a9ea562b0e', '856b2c80-9ecc-4b27-b216-fd63640e684b', 'MCC-AI-0004-31A40', 1, 1),
  ('a37359b0-4aaf-428c-819e-0a2e7134a4b7', 'e41f16f9-1879-4ac1-97df-039a05933c69', 'MCC-AS-0004-1A30X90', 1, 1),
  ('a9cf66db-9f9f-4d74-9de6-072a3b3b4105', '004f5053-36a3-4e60-bbe5-6ef3f290ccd8', 'LS-S-0001-B-B', 1, 2),
  ('ab51f399-f500-4144-a9e5-cfdb4b5da077', '4cd9ec87-6d6f-439b-af7b-2749669057cb', 'EL-TR-0002-150L', 1, 1),
  ('ac1d91ba-59c3-405b-9321-d8f46713ca9d', '1aff046f-41e5-42ca-bf3e-749d34eab2b4', 'EL-EX-0006-60', 1, 1),
  ('ad8d6394-1eb8-444c-9a83-fc9f4d7ef7d0', '65e747d0-c7d5-4dbb-ae8c-717c73008bcc', 'RV-SP-0003-FRE-NAT', 1, 2),
  ('addbe0a0-774a-4e9d-b0ac-512cf59d741b', '9064f4ee-64e9-4498-9303-523e007c2c95', 'MACB-E-0041-100X70', 1, 1),
  ('bdc250f7-579b-4a5f-9d51-640cabcdcd65', '71ab1f9a-8981-41f7-8743-35ade4d4bc65', 'MACB-E-0034-60X60', 1, 1),
  ('bec595b8-67d2-434f-812a-75a0142ccfea', 'a05e83f1-ee81-47d4-8103-5edc538b6817', 'MCC-AS-0004-30X90', 1, 1),
  ('c2be5bf6-360b-4fff-86d1-97f7d8fefb81', '88d0899b-bd17-4224-9e53-73f45d4b0a8b', 'LS-S-0003-B-B', 1, 2),
  ('c545e43b-95c7-43c6-8650-9a5036d7840e', 'cbb4953b-9850-41a4-9f9c-c8e3e2688b52', 'EL-PL-0002-P', 1, 1),
  ('c70efc94-d8ad-4231-bbff-37c31ab3ead2', 'e5a25d87-8997-4ee4-99f4-21f5102fa1fd', 'LLC-CI-0008-40', 1, 1),
  ('c81d9849-6196-4d0c-9c68-744050fd3e8b', 'def1891f-710c-4e87-8d34-b0ee9a60f05b', 'MACB-AL-0003-30', 0.8, 1),
  ('c8df2b88-e927-4ef1-989a-14284b5af2dd', 'e34ef31c-0fb7-4f9f-a3c9-44dd818f3bf4', 'MACB-E-0021-90X80', 0.8, 1),
  ('cb1769a2-98d6-417d-869d-fa64ebd06732', 'fefb1f4e-369b-4ec5-9491-510a41c66cdc', 'MCC-AS-0004-50X90', 1, 1),
  ('cb3ac0c4-7eaf-460b-87ee-484013a5735a', 'a9bc8b9a-7969-47bd-b5d0-95c6becf5d6b', 'LS-L-0008-B-B', 1, 2),
  ('cf7536cd-ff62-4877-9c92-1810bcb2ef9b', '6076409a-fac1-4659-957a-2ff5ec2bf19f', 'MCC-AI-0004-40', 1, 1),
  ('d0d2086d-c156-4d6f-a491-469cb33fc637', 'd3b7eb08-4abb-4503-bb25-9bc76dc7e4d0', 'LLC-CI-0001-50', 1, 1),
  ('d60a5771-1a57-4cb3-81ba-2293770f4f6d', 'eea344d5-ad2c-4bf8-b02f-bccb375abe2d', 'RV-CR-0009-45X120-NAT', 1, 2),
  ('d99cd82a-0eee-46a8-bb68-e0ccb8f7866d', 'e3086a61-b1cd-4aa7-b2e2-783cc843cab2', 'MCC-AS-0004-80X90', 1, 1),
  ('d9f85587-1a43-4047-84af-0860b1d2222d', '5498f270-cb19-48a6-91d6-c6c1b6826ff7', 'LS-L-0002-B-B', 1, 2),
  ('df933f3b-1a9b-4b50-82e8-477b036a47b6', '596f4452-fdc7-4d84-8264-733b4fa9d1d7', 'MCC-AI-0004-60', 1, 1),
  ('e2f20fb2-87b5-43bb-a3ad-7ff52e9b60e8', '34b3f90e-8db9-4096-a585-cf7fa2278ede', 'LS-B-0001-B-B', 1, 2),
  ('e810fd48-fb6e-493e-9e95-e699fd02eb0c', 'ace181a5-2733-49c1-83a2-631bf933abf4', 'MCC-AS-0004-70X90', 1, 1),
  ('ebd9edb9-d7f9-48d0-ac06-be4a4e5b3860', '6e7137e3-02bf-4d69-99d1-10211927f743', 'MCC-AS-0004-30X70', 1, 1),
  ('f6681932-2b05-4e14-b40b-71b9a743186a', '085bc59e-3db8-430a-b213-6d8a4ace1768', 'MACB-AL-0004-60', 1, 1),
  ('fb9e115c-ec1a-481a-a622-db9f94ec2356', '15a50dbd-53ab-4df8-89f1-6328a3d349d0', 'EL-TR-0001-100L', 1, 1),
  ('fcd5acfc-2f4b-4e65-a94f-395c14a46d5d', '46e94cac-12d5-4bd7-b90d-6b5ab0f04929', 'EL-MLL-0004-SL', 1, 1),
  ('fea8217a-ccde-437b-8ea8-3433b30d3425', 'e0031be5-44db-4869-95bd-66c582b19cc8', 'EL-FR-0001-IN', 1, 1);

-- os valores a copiar: legado, atributo, o valor do gémeo (id e conteúdo, lidos a 26/11)
CREATE TEMP TABLE _o2_attr (legado_id uuid NOT NULL, attribute_id uuid NOT NULL, gemeo_value_id uuid NOT NULL, value_text text, value_number numeric, value_bool boolean, value_json jsonb, value_date date, unit text, PRIMARY KEY (legado_id, attribute_id)) ON COMMIT DROP;
INSERT INTO _o2_attr (legado_id, attribute_id, gemeo_value_id, value_text, value_number, value_bool, value_json, value_date, unit) VALUES
  ('01b4abd4-cd1d-4a35-84e4-f6f9f04a7b29', '1e938087-56c8-44cb-b3d2-e33072ed2e17', '49a21765-5641-424b-935b-acba3c1eb563', '70', NULL, NULL, NULL, NULL, NULL),
  ('0b6215ee-8969-4621-9c80-2d703cdfdac8', '8c2361bb-146b-4643-8091-f212de868c6f', 'e3c74755-61a8-4615-a708-5cfcd277fc73', '120 × 80 cm', NULL, NULL, '{"comprimento": 80, "espessura": null, "largura": 120, "tipo": "2D", "unidade": "cm"}'::jsonb, NULL, 'cm'),
  ('0f1f4c37-ee68-4a23-87a7-9750e9839654', '1e938087-56c8-44cb-b3d2-e33072ed2e17', '9af01cde-a1d5-4a0d-933a-af360ccb4f6a', '50', NULL, NULL, NULL, NULL, NULL),
  ('0f26378f-cf97-4ced-bda6-d4fd72179bbc', '98b65c86-5545-43cf-b8b1-e2d2f302ad91', 'd84fa9a9-dd40-4e95-b533-5d8e1e54d1f3', 'Branco', NULL, NULL, NULL, NULL, NULL),
  ('0f26378f-cf97-4ced-bda6-d4fd72179bbc', 'd3a0a0e9-53a2-406c-b2d9-6c8be05c2aa1', '78d03059-84a0-4ff7-b69b-9dbc80022314', 'Natural', NULL, NULL, NULL, NULL, NULL),
  ('21e2abb0-e384-4e5e-a970-1b27ee086d8f', 'd3a0a0e9-53a2-406c-b2d9-6c8be05c2aa1', '2025a414-ccee-4105-b90d-a000346f7293', 'Natural', NULL, NULL, NULL, NULL, NULL),
  ('2a745e79-fe5c-4653-bd26-aba28974d37d', '98b65c86-5545-43cf-b8b1-e2d2f302ad91', '2ee6fffe-21be-4fe5-ad81-76af0150a5aa', 'Capuccino', NULL, NULL, NULL, NULL, NULL),
  ('2d582a9b-d4c1-4b48-b936-4237e6cd3d7f', '8c2361bb-146b-4643-8091-f212de868c6f', '1bf4db94-2ff4-4b08-9cd7-fa4e3ff7c2d6', '40 × 90 cm', NULL, NULL, '{"comprimento": 90, "espessura": null, "largura": 40, "tipo": "2D", "unidade": "cm"}'::jsonb, NULL, 'cm'),
  ('35aba3e6-e577-4f53-9aa5-7dece8674403', '8c2361bb-146b-4643-8091-f212de868c6f', 'd983d18a-b667-4aa9-b46c-c1c30079caa8', '60 × 90 cm', NULL, NULL, '{"comprimento": 90, "espessura": null, "largura": 60, "tipo": "2D", "unidade": "cm"}'::jsonb, NULL, 'cm'),
  ('37cd6409-4f67-43ed-af82-48b88c3bcb53', '8c2361bb-146b-4643-8091-f212de868c6f', '20ede62d-604e-4c6c-85ca-d07632cb411d', '120 × 80 cm', NULL, NULL, '{"comprimento": 80, "espessura": null, "largura": 120, "tipo": "2D", "unidade": "cm"}'::jsonb, NULL, 'cm'),
  ('3a250723-16e8-4445-8305-e03f6d006941', '767c604b-934a-442a-8e6f-af0d3fc397a1', 'bb4e0bc7-ed5e-4719-9ce2-84c073f9ba4e', 'Propano/Butano', NULL, NULL, NULL, NULL, NULL),
  ('3a250723-16e8-4445-8305-e03f6d006941', '8b7069e7-c828-4f0c-be84-afc8159cbc25', 'bef21d27-466e-46e2-ab6b-08f5498f149f', '15 L', NULL, NULL, NULL, NULL, NULL),
  ('3f41e8fb-a90f-4d9e-ade8-75f24f7ad14b', '8c2361bb-146b-4643-8091-f212de868c6f', 'b760d771-9f01-4ba5-a6f8-3e8381b1eb40', '60 × 60 cm', NULL, NULL, '{"comprimento": 60, "espessura": null, "largura": 60, "tipo": "2D", "unidade": "cm"}'::jsonb, NULL, 'cm'),
  ('465a5c2c-6870-467a-adb3-9f8a8d90755b', '98b65c86-5545-43cf-b8b1-e2d2f302ad91', 'f3e6648e-dfa0-4c93-bafe-46886962646a', 'Preto', NULL, NULL, NULL, NULL, NULL),
  ('4e95e5dd-7ea6-4b5b-9273-439762426949', '8c2361bb-146b-4643-8091-f212de868c6f', '6db0a66d-38a0-4132-84da-9e7c2a1fcb23', '60 × 60 cm', NULL, NULL, '{"comprimento": 60, "espessura": null, "largura": 60, "tipo": "2D", "unidade": "cm"}'::jsonb, NULL, 'cm'),
  ('4e95e5dd-7ea6-4b5b-9273-439762426949', '98b65c86-5545-43cf-b8b1-e2d2f302ad91', '082837cc-ee88-4657-b9a2-2c9400b437f0', 'Branco', NULL, NULL, NULL, NULL, NULL),
  ('4e95e5dd-7ea6-4b5b-9273-439762426949', 'd3a0a0e9-53a2-406c-b2d9-6c8be05c2aa1', '3ff28e2d-2c8c-43ec-aefd-5cdfbbefd918', 'Natural', NULL, NULL, NULL, NULL, NULL),
  ('5c126624-62fd-4c02-a6b2-524835766bbf', '98b65c86-5545-43cf-b8b1-e2d2f302ad91', '4d841e2b-ff10-42b8-beb2-c9d11acddb20', 'Branco', NULL, NULL, NULL, NULL, NULL),
  ('5ce5e481-4b73-4c4f-805a-c120f03bf7af', '1e938087-56c8-44cb-b3d2-e33072ed2e17', '0312b6d2-7215-433a-bd5e-b5cce80c4803', '30', NULL, NULL, NULL, NULL, NULL),
  ('5faf6029-281f-46c8-bbfa-fad01cac7d93', '8c2361bb-146b-4643-8091-f212de868c6f', 'f1abfce7-f0f0-4db4-abe8-8af5b2c538ce', '182 × 1220 mm', NULL, NULL, '{"comprimento": 1220, "espessura": null, "largura": 182, "tipo": "2D", "unidade": "mm"}'::jsonb, NULL, 'mm'),
  ('5faf6029-281f-46c8-bbfa-fad01cac7d93', '98b65c86-5545-43cf-b8b1-e2d2f302ad91', 'd341aa85-bbe0-499e-b370-b4f1536e70df', 'Castanho', NULL, NULL, NULL, NULL, NULL),
  ('5faf6029-281f-46c8-bbfa-fad01cac7d93', 'd3a0a0e9-53a2-406c-b2d9-6c8be05c2aa1', '91793ae6-416f-4a3e-8dac-1142ad3d7685', 'Natural', NULL, NULL, NULL, NULL, NULL),
  ('62645e38-0281-4ba6-b7d9-bd5fd9a4a832', '8c2361bb-146b-4643-8091-f212de868c6f', '20a9222d-bac6-45e6-8870-347d514b17ab', '60 × 50 cm', NULL, NULL, '{"comprimento": 50, "espessura": null, "largura": 60, "tipo": "2D", "unidade": "cm"}'::jsonb, NULL, 'cm'),
  ('69b890e6-254a-4a34-9e42-d72a543086e0', '1e938087-56c8-44cb-b3d2-e33072ed2e17', 'cd82ba1d-aaed-4629-b01c-556668a90956', '50', NULL, NULL, NULL, NULL, NULL),
  ('78346ea5-4b9b-4efe-a092-9f18c1090ab2', '8c2361bb-146b-4643-8091-f212de868c6f', '8c159c53-6d54-4b07-8343-ad102a353cff', '80 × 80 cm', NULL, NULL, '{"comprimento": 80, "espessura": null, "largura": 80, "tipo": "2D", "unidade": "cm"}'::jsonb, NULL, 'cm'),
  ('7ea74d67-af9f-44f6-a5c6-c9fc454d7541', '8c2361bb-146b-4643-8091-f212de868c6f', '10623446-0ff8-4687-8ef5-cd7256173253', '182 × 1220 mm', NULL, NULL, '{"comprimento": 1220, "espessura": null, "largura": 182, "tipo": "2D", "unidade": "mm"}'::jsonb, NULL, 'mm'),
  ('7ea74d67-af9f-44f6-a5c6-c9fc454d7541', '98b65c86-5545-43cf-b8b1-e2d2f302ad91', '3186e2a4-e391-4155-8056-8d58832afd0d', 'Bege', NULL, NULL, NULL, NULL, NULL),
  ('7ea74d67-af9f-44f6-a5c6-c9fc454d7541', 'd3a0a0e9-53a2-406c-b2d9-6c8be05c2aa1', '44d71f04-506b-4e69-8653-6d89e301e130', 'Natural', NULL, NULL, NULL, NULL, NULL),
  ('8e202646-ae6a-4134-9754-986a51aa9c8b', '98b65c86-5545-43cf-b8b1-e2d2f302ad91', 'ee0f1aeb-7a0e-4765-a556-19077a811f45', 'Preto', NULL, NULL, NULL, NULL, NULL),
  ('9bbb6084-5bd8-48bc-a257-775922bf342b', '8c2361bb-146b-4643-8091-f212de868c6f', 'af8cde46-dfe0-417c-b947-324bdce0cf00', '80 × 80 cm', NULL, NULL, '{"comprimento": 80, "espessura": null, "largura": 80, "tipo": "2D", "unidade": "cm"}'::jsonb, NULL, 'cm'),
  ('9dfb2e3e-ae36-47e1-9bbe-3e296fa90a2b', '8c2361bb-146b-4643-8091-f212de868c6f', '5ee5243f-7f39-4b23-a537-08ee376a3c57', '80 × 50 cm', NULL, NULL, '{"comprimento": 50, "espessura": null, "largura": 80, "tipo": "2D", "unidade": "cm"}'::jsonb, NULL, 'cm'),
  ('9eebe561-bd2f-413d-a883-03a9ea562b0e', '1e938087-56c8-44cb-b3d2-e33072ed2e17', '25ddcddf-3953-47a6-9484-81c43b237f64', '31-40', NULL, NULL, NULL, NULL, NULL),
  ('a37359b0-4aaf-428c-819e-0a2e7134a4b7', '8c2361bb-146b-4643-8091-f212de868c6f', '4acc38c0-853c-40b4-a1ae-c210744cc8cb', '1–30 × 90 cm', NULL, NULL, '{"comprimento": 90, "espessura": null, "largura": {"ate": 30, "de": 1}, "tipo": "2D", "unidade": "cm"}'::jsonb, NULL, 'cm'),
  ('a9cf66db-9f9f-4d74-9de6-072a3b3b4105', '98b65c86-5545-43cf-b8b1-e2d2f302ad91', 'cba23f7b-998d-48a5-8a02-449b608f76d1', 'Branco', NULL, NULL, NULL, NULL, NULL),
  ('a9cf66db-9f9f-4d74-9de6-072a3b3b4105', 'af171aa4-98a6-41b8-804c-470570d8ce0e', '434408d7-f1ba-4a43-b082-052934720dec', 'BRILHO', NULL, NULL, NULL, NULL, NULL),
  ('ab51f399-f500-4144-a9e5-cfdb4b5da077', '8b7069e7-c828-4f0c-be84-afc8159cbc25', '9a624c6f-7d72-4cc7-ad31-efffdfddce28', '150 L', NULL, NULL, NULL, NULL, NULL),
  ('ac1d91ba-59c3-405b-9321-d8f46713ca9d', '1e938087-56c8-44cb-b3d2-e33072ed2e17', '347ad7ea-3299-43ca-9aa1-3ffb8169fdd5', '60', NULL, NULL, NULL, NULL, NULL),
  ('ad8d6394-1eb8-444c-9a83-fc9f4d7ef7d0', 'c9e95561-0976-4b8b-9c3b-3c2dda8eafd0', 'abf44f5a-981e-4f1f-8814-0bcc7a371882', 'Fresno', NULL, NULL, NULL, NULL, NULL),
  ('ad8d6394-1eb8-444c-9a83-fc9f4d7ef7d0', 'd3a0a0e9-53a2-406c-b2d9-6c8be05c2aa1', 'f914c5fa-3707-4782-a2e3-21870cd5978e', 'Natural', NULL, NULL, NULL, NULL, NULL),
  ('addbe0a0-774a-4e9d-b0ac-512cf59d741b', '8c2361bb-146b-4643-8091-f212de868c6f', 'f0e659e5-4ff7-49f7-986b-88ef91e25b01', '100 × 70 cm', NULL, NULL, '{"comprimento": 70, "espessura": null, "largura": 100, "tipo": "2D", "unidade": "cm"}'::jsonb, NULL, 'cm'),
  ('bdc250f7-579b-4a5f-9d51-640cabcdcd65', '8c2361bb-146b-4643-8091-f212de868c6f', 'dcfcfe72-ad35-472c-9063-5167476f3fb3', '60 × 60 cm', NULL, NULL, '{"comprimento": 60, "espessura": null, "largura": 60, "tipo": "2D", "unidade": "cm"}'::jsonb, NULL, 'cm'),
  ('bec595b8-67d2-434f-812a-75a0142ccfea', '8c2361bb-146b-4643-8091-f212de868c6f', '0f2f28d4-02ae-40ab-ad95-cfcb0187dac3', '30 × 90 cm', NULL, NULL, '{"comprimento": 90, "espessura": null, "largura": 30, "tipo": "2D", "unidade": "cm"}'::jsonb, NULL, 'cm'),
  ('c2be5bf6-360b-4fff-86d1-97f7d8fefb81', '98b65c86-5545-43cf-b8b1-e2d2f302ad91', '7a23acf1-cdf9-41cd-8891-2fba9264041f', 'Branco', NULL, NULL, NULL, NULL, NULL),
  ('c2be5bf6-360b-4fff-86d1-97f7d8fefb81', 'af171aa4-98a6-41b8-804c-470570d8ce0e', 'ca41adc1-70cd-46a8-9a6f-52b9d975d61d', 'BRILHO', NULL, NULL, NULL, NULL, NULL),
  ('c545e43b-95c7-43c6-8650-9a5036d7840e', '98b65c86-5545-43cf-b8b1-e2d2f302ad91', 'e4cd7a75-26d6-4b76-9be3-b0a12c26f170', 'Preto', NULL, NULL, NULL, NULL, NULL),
  ('c70efc94-d8ad-4231-bbff-37c31ab3ead2', '1e938087-56c8-44cb-b3d2-e33072ed2e17', 'e07cd0aa-468f-4553-b656-7d0d00605d2d', '40', NULL, NULL, NULL, NULL, NULL),
  ('c81d9849-6196-4d0c-9c68-744050fd3e8b', '1e938087-56c8-44cb-b3d2-e33072ed2e17', '5506459c-8be8-4b23-be04-268e435fe7f6', '30', NULL, NULL, NULL, NULL, NULL),
  ('c8df2b88-e927-4ef1-989a-14284b5af2dd', '8c2361bb-146b-4643-8091-f212de868c6f', 'c925c7d2-1d9f-4c1b-9a71-39aa3be78fc4', '90 × 80 cm', NULL, NULL, '{"comprimento": 80, "espessura": null, "largura": 90, "tipo": "2D", "unidade": "cm"}'::jsonb, NULL, 'cm'),
  ('cb1769a2-98d6-417d-869d-fa64ebd06732', '8c2361bb-146b-4643-8091-f212de868c6f', 'd1557c42-6110-4272-80bc-a148d746215b', '50 × 90 cm', NULL, NULL, '{"comprimento": 90, "espessura": null, "largura": 50, "tipo": "2D", "unidade": "cm"}'::jsonb, NULL, 'cm'),
  ('cb3ac0c4-7eaf-460b-87ee-484013a5735a', '98b65c86-5545-43cf-b8b1-e2d2f302ad91', 'a3e494e3-e002-4263-891b-73782f733506', 'Branco', NULL, NULL, NULL, NULL, NULL),
  ('cb3ac0c4-7eaf-460b-87ee-484013a5735a', 'af171aa4-98a6-41b8-804c-470570d8ce0e', '27579c18-3231-4171-844d-b51eaa58b634', 'BRILHO', NULL, NULL, NULL, NULL, NULL),
  ('cf7536cd-ff62-4877-9c92-1810bcb2ef9b', '1e938087-56c8-44cb-b3d2-e33072ed2e17', 'eeac6067-3fe9-441e-8f98-5f30523b9890', '40', NULL, NULL, NULL, NULL, NULL),
  ('d0d2086d-c156-4d6f-a491-469cb33fc637', '1e938087-56c8-44cb-b3d2-e33072ed2e17', 'ac3fa692-0bb3-4b61-8907-ad80068dce4f', '50', NULL, NULL, NULL, NULL, NULL),
  ('d60a5771-1a57-4cb3-81ba-2293770f4f6d', '8c2361bb-146b-4643-8091-f212de868c6f', 'c21ebcb6-308b-49b8-a9c5-bb8e29fc453e', '45 × 120 cm', NULL, NULL, '{"comprimento": 120, "espessura": null, "largura": 45, "tipo": "2D", "unidade": "cm"}'::jsonb, NULL, 'cm'),
  ('d60a5771-1a57-4cb3-81ba-2293770f4f6d', 'd3a0a0e9-53a2-406c-b2d9-6c8be05c2aa1', 'e7b7cc77-4890-4493-8188-c69df4b3616d', 'Natural', NULL, NULL, NULL, NULL, NULL),
  ('d99cd82a-0eee-46a8-bb68-e0ccb8f7866d', '8c2361bb-146b-4643-8091-f212de868c6f', 'fc4b4470-e258-4ba5-b7a8-a5a18a98eafd', '80 × 90 cm', NULL, NULL, '{"comprimento": 90, "espessura": null, "largura": 80, "tipo": "2D", "unidade": "cm"}'::jsonb, NULL, 'cm'),
  ('d9f85587-1a43-4047-84af-0860b1d2222d', '98b65c86-5545-43cf-b8b1-e2d2f302ad91', '9b4ce677-6872-476a-98f0-1e6a13b93e27', 'Branco', NULL, NULL, NULL, NULL, NULL),
  ('d9f85587-1a43-4047-84af-0860b1d2222d', 'af171aa4-98a6-41b8-804c-470570d8ce0e', 'f4b20f08-5517-48cc-a528-a8d4e812973c', 'BRILHO', NULL, NULL, NULL, NULL, NULL),
  ('df933f3b-1a9b-4b50-82e8-477b036a47b6', '1e938087-56c8-44cb-b3d2-e33072ed2e17', '77901970-c2ea-4123-ab7a-a0466d57f5ae', '60', NULL, NULL, NULL, NULL, NULL),
  ('e2f20fb2-87b5-43bb-a3ad-7ff52e9b60e8', '98b65c86-5545-43cf-b8b1-e2d2f302ad91', '3611a1f1-3f1f-4643-b141-cace46809099', 'Branco', NULL, NULL, NULL, NULL, NULL),
  ('e2f20fb2-87b5-43bb-a3ad-7ff52e9b60e8', 'af171aa4-98a6-41b8-804c-470570d8ce0e', '681417df-dc8f-4946-9221-d1bcd6951b91', 'BRILHO', NULL, NULL, NULL, NULL, NULL),
  ('e810fd48-fb6e-493e-9e95-e699fd02eb0c', '8c2361bb-146b-4643-8091-f212de868c6f', 'f911421a-c159-4d31-8cd4-92e3dba91623', '70 × 90 cm', NULL, NULL, '{"comprimento": 90, "espessura": null, "largura": 70, "tipo": "2D", "unidade": "cm"}'::jsonb, NULL, 'cm'),
  ('ebd9edb9-d7f9-48d0-ac06-be4a4e5b3860', '8c2361bb-146b-4643-8091-f212de868c6f', '93a9c9ef-4823-4c61-8a0d-02329be28636', '30 × 70 cm', NULL, NULL, '{"comprimento": 70, "espessura": null, "largura": 30, "tipo": "2D", "unidade": "cm"}'::jsonb, NULL, 'cm'),
  ('f6681932-2b05-4e14-b40b-71b9a743186a', '1e938087-56c8-44cb-b3d2-e33072ed2e17', '7727da7a-c757-4474-b07b-012b8cc7b409', '60', NULL, NULL, NULL, NULL, NULL),
  ('fb9e115c-ec1a-481a-a622-db9f94ec2356', '8b7069e7-c828-4f0c-be84-afc8159cbc25', '75ccd5cf-6ad5-4c00-a9ad-89694e8ce8e4', '100 L', NULL, NULL, NULL, NULL, NULL),
  ('fcd5acfc-2f4b-4e65-a94f-395c14a46d5d', 'c9e95561-0976-4b8b-9c3b-3c2dda8eafd0', '5b3b0b05-2965-4cf8-8463-29d1e80a6a3a', 'Silver', NULL, NULL, NULL, NULL, NULL),
  ('fea8217a-ccde-437b-8ea8-3433b30d3425', 'c9e95561-0976-4b8b-9c3b-3c2dda8eafd0', '7d91e4cd-47d4-4e1a-949e-4568f0fe666e', 'Inox', NULL, NULL, NULL, NULL, NULL);

-- ─── 2. Guardas, cópia, escrita e conferências (um só bloco: tudo ou nada) ─────────────────────────
DO $mig$
DECLARE
  c_org           constant uuid    := '3242e925-da26-459a-8258-be04d904e355';
  c_criador       constant uuid    := 'ba0b0ebf-1bdb-43f9-b82b-a2ade29848e2';
  c_fonte         constant text    := 'migration:mudelar_excel_onda2';
  c_n_mudelar     constant integer := 30010;
  c_n_fam         constant integer := 548;
  c_n_membros     constant integer := 14637;
  c_n_produtos    constant integer := 52;
  c_n_nome        constant integer := 0;
  c_n_descr       constant integer := 0;
  c_n_marca       constant integer := 0;
  c_n_flivre      constant integer := 16;
  c_n_preco       constant integer := 14;
  c_n_isup        constant integer := 16;
  c_n_isup_sup    constant integer := 16;
  c_n_isup_ssku   constant integer := 5;
  c_n_isup_pp     constant integer := 2;
  c_n_gemeos      constant integer := 52;
  c_n_attr        constant integer := 67;
  v_n bigint; v_m bigint; v_total bigint; v_pend bigint; v_feito bigint; v_pav_antes bigint;
  v_txt text; v_acl text; v_xid text; v_t text;
  v_h_sku_antes text;   v_h_sku_depois text;
  v_h_out_antes text;   v_h_out_depois text;
  v_h_preco_antes text; v_h_preco_depois text;
  v_h_isup_antes text;  v_h_isup_depois text;
  v_h_attr_antes text;  v_h_attr_depois text;
  v_h_fam_antes text;   v_h_fam_depois text;
  v_h_docs_antes text;  v_h_docs_depois text;
  v_n_marcas bigint; v_n_forn bigint;
BEGIN
  -- G0: só a Mudelar da base de RH
  IF NOT EXISTS (SELECT 1 FROM anew_organizations o WHERE o.id = c_org AND o.name = 'Mudelar' AND o.deleted_at IS NULL) THEN
    RAISE NOTICE 'mudelar_excel_onda2: a organização Mudelar (%) não existe nesta base — nada a fazer.', c_org;
    RETURN;
  END IF;
  SELECT count(*) INTO v_n FROM _o2_sku s JOIN products p ON p.id = s.id;
  IF v_n = 0 THEN
    RAISE NOTICE 'mudelar_excel_onda2: os produtos da lista não existem aqui — nada a fazer.';
    RETURN;
  END IF;

  -- L1: a lista embutida tem os números do cabeçalho
  IF (SELECT count(*) FROM _o2_sku) <> c_n_produtos THEN RAISE EXCEPTION 'L1: a lista de SKU não tem % produtos.', c_n_produtos; END IF;
  SELECT count(*) FILTER (WHERE campo = 'name'), count(*) FILTER (WHERE campo = 'short_description'),
         count(*) FILTER (WHERE campo = 'brand_id'), count(*) FILTER (WHERE campo = 'fornecedor_livre'), count(*)
    INTO v_n, v_m, v_pend, v_feito, v_total FROM _o2_prod;
  IF v_n <> c_n_nome OR v_m <> c_n_descr OR v_pend <> c_n_marca OR v_feito <> c_n_flivre OR v_total <> c_n_nome + c_n_descr + c_n_marca + c_n_flivre THEN
    RAISE EXCEPTION 'L1: a lista de products tem % nomes, % descrições, % marcas e % fornecedor_livre.', v_n, v_m, v_pend, v_feito;
  END IF;
  IF (SELECT count(*) FROM _o2_preco) <> c_n_preco OR (SELECT count(*) FROM _o2_isup) <> c_n_isup
     OR (SELECT count(*) FILTER (WHERE m_sup) FROM _o2_isup) <> c_n_isup_sup OR (SELECT count(*) FILTER (WHERE m_ssku) FROM _o2_isup) <> c_n_isup_ssku
     OR (SELECT count(*) FILTER (WHERE m_pp) FROM _o2_isup) <> c_n_isup_pp THEN
    RAISE EXCEPTION 'L1: as listas de preços e de ligações a fornecedores não têm os números do cabeçalho.';
  END IF;
  IF (SELECT count(*) FROM _o2_gemeo) <> c_n_gemeos OR (SELECT count(*) FROM _o2_attr) <> c_n_attr
     OR (SELECT sum(n_attr) FROM _o2_gemeo) <> c_n_attr
     OR EXISTS (SELECT 1 FROM _o2_gemeo g WHERE g.n_attr <> (SELECT count(*) FROM _o2_attr a WHERE a.legado_id = g.legado_id)) THEN
    RAISE EXCEPTION 'L1: as listas de gémeos e de atributos não têm os números do cabeçalho.';
  END IF;
  IF EXISTS (SELECT 1 FROM (SELECT id FROM _o2_prod UNION SELECT product_id FROM _o2_preco UNION SELECT product_id FROM _o2_isup
                            UNION SELECT legado_id FROM _o2_gemeo) z WHERE z.id NOT IN (SELECT s.id FROM _o2_sku s))
     OR EXISTS (SELECT 1 FROM _o2_gemeo g WHERE g.gemeo_id IN (SELECT s.id FROM _o2_sku s)) THEN
    RAISE EXCEPTION 'L1: há alterações para produtos que não estão na lista, ou um gémeo está na lista dos legados.';
  END IF;

  PERFORM set_config('app.audit_source', c_fonte, true);
  PERFORM set_config('app.audit_user_id', c_criador::text, true);
  -- o lock das funções das famílias do ecrã, e os legados e os gémeos presos até ao fim, por ordem fixa
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_familias:' || c_org::text, 0));
  PERFORM 1 FROM products p WHERE p.id IN (SELECT s.id FROM _o2_sku s UNION SELECT g.gemeo_id FROM _o2_gemeo g) ORDER BY p.id FOR NO KEY UPDATE;

  -- G1: contagens de partida
  SELECT count(*) INTO v_n FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.deleted_at IS NULL;
  IF v_n <> c_n_mudelar THEN RAISE EXCEPTION 'G1: a Mudelar tem % produtos vivos e esperavam-se %.', v_n, c_n_mudelar; END IF;
  SELECT count(*) INTO v_n FROM product_families f WHERE f.organization_id = c_org;
  SELECT count(*) INTO v_m FROM product_family_members m JOIN product_families f ON f.id = m.family_id WHERE f.organization_id = c_org;
  IF v_n <> c_n_fam OR v_m <> c_n_membros THEN
    RAISE EXCEPTION 'G1: a Mudelar tem % famílias e % membros; esperavam-se % e %.', v_n, v_m, c_n_fam, c_n_membros;
  END IF;

  -- G2: cada legado existe, é da Mudelar, está vivo, tem o SKU esperado, SKU manual, sem modelo e fora das famílias
  SELECT count(*) INTO v_n FROM _o2_sku s JOIN products p ON p.id = s.id
  WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.deleted_at IS NULL AND p.sku IS NOT DISTINCT FROM s.sku
    AND NOT coalesce(p.sku_gerado, false) AND p.model_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM product_family_members m WHERE m.product_id = p.id);
  IF v_n <> c_n_produtos THEN
    SELECT string_agg(s.sku || ' → ' || coalesce(p.sku, '(sem produto)'), '; ' ORDER BY s.sku) INTO v_txt
    FROM (SELECT * FROM _o2_sku s0 WHERE NOT EXISTS (SELECT 1 FROM products p0 WHERE p0.id = s0.id AND p0.organization_id = c_org
          AND NOT p0.is_deleted AND p0.deleted_at IS NULL AND p0.sku IS NOT DISTINCT FROM s0.sku AND NOT coalesce(p0.sku_gerado, false)
          AND p0.model_id IS NULL AND NOT EXISTS (SELECT 1 FROM product_family_members m WHERE m.product_id = p0.id)) ORDER BY s0.sku LIMIT 5) s
    LEFT JOIN products p ON p.id = s.id;
    RAISE EXCEPTION 'G2: só % de % legados existem na Mudelar, vivos, com o SKU manual esperado, sem modelo e fora das famílias. Primeiros: %', v_n, c_n_produtos, v_txt;
  END IF;
  -- G2b: cada preço a mudar é a ÚNICA linha desse tipo do produto (a atual)
  SELECT count(*) INTO v_n FROM _o2_preco x
  WHERE (SELECT count(*) FROM product_prices pp WHERE pp.product_id = x.product_id AND pp.price_type::text = x.tipo) <> 1;
  IF v_n > 0 THEN RAISE EXCEPTION 'G2: % preços a mudar já não são a única linha do seu tipo.', v_n; END IF;

  -- G7: cada gémeo existe, é da Mudelar, está vivo, tem SKU gerado, a mesma subcategoria do legado, e os atributos
  -- que tinha a 26/11 (os mesmos valores, nem mais nem menos)
  SELECT count(*) INTO v_n FROM _o2_gemeo g JOIN products q ON q.id = g.gemeo_id JOIN products l ON l.id = g.legado_id
  WHERE q.organization_id = c_org AND NOT q.is_deleted AND q.deleted_at IS NULL AND coalesce(q.sku_gerado, false)
    AND q.sku = g.gemeo_sku AND q.subcategory_id IS NOT DISTINCT FROM l.subcategory_id AND q.subcategory_id IS NOT NULL
    AND (SELECT count(*) FROM product_attribute_values v WHERE v.product_id = q.id) = g.n_attr;
  IF v_n <> c_n_gemeos THEN RAISE EXCEPTION 'G7: só % de % gémeos estão vivos, com SKU gerado, a mesma subcategoria e o número de atributos esperado.', v_n, c_n_gemeos; END IF;
  SELECT count(*) INTO v_n FROM _o2_attr a JOIN _o2_gemeo g ON g.legado_id = a.legado_id
    JOIN product_attribute_values v ON v.id = a.gemeo_value_id AND v.product_id = g.gemeo_id AND v.attribute_id = a.attribute_id
  WHERE v.value_text IS NOT DISTINCT FROM a.value_text AND v.value_number IS NOT DISTINCT FROM a.value_number
    AND v.value_bool IS NOT DISTINCT FROM a.value_bool AND v.value_json IS NOT DISTINCT FROM a.value_json
    AND v.value_date IS NOT DISTINCT FROM a.value_date AND v.unit IS NOT DISTINCT FROM a.unit;
  IF v_n <> c_n_attr THEN RAISE EXCEPTION 'G7: só % de % valores dos gémeos continuam como lidos a 26/11.', v_n, c_n_attr; END IF;
  -- G7b: cada valor a copiar existe como opção ativa do grupo do atributo (da Mudelar ou global); as medidas (sem grupo)
  -- levam o valor em value_json; nenhum atributo apagado
  SELECT count(*) INTO v_n FROM _o2_attr a JOIN product_attributes pa ON pa.id = a.attribute_id
  WHERE pa.deleted_at IS NULL AND (pa.organization_id IS NULL OR pa.organization_id = c_org)
    AND CASE WHEN pa.is_measurement THEN a.value_json IS NOT NULL
             ELSE EXISTS (SELECT 1 FROM attribute_option_groups g JOIN attribute_option_group_values o ON o.group_id = g.id
                          WHERE g.attribute_id = pa.id AND (g.organization_id IS NULL OR g.organization_id = c_org)
                            AND g.is_active AND o.is_active AND o.value_text = a.value_text) END;
  IF v_n <> c_n_attr THEN RAISE EXCEPTION 'G7: só % de % valores a copiar existem como opção (ou são medidas com valor).', v_n, c_n_attr; END IF;

  -- G3: o estado é o lido a 26/11 (pendente) ou já é o do Excel e do gémeo (aplicada); a meio, falha
  v_total := c_n_nome + c_n_descr + c_n_marca + c_n_flivre + c_n_preco + c_n_isup + c_n_attr;
  SELECT (SELECT count(*) FROM _o2_prod x JOIN products p ON p.id = x.id AND p.organization_id = c_org
          WHERE CASE x.campo WHEN 'name' THEN p.name IS NOT DISTINCT FROM x.de
                             WHEN 'short_description' THEN coalesce(p.short_description, '') = coalesce(x.de, '')
                             WHEN 'brand_id' THEN p.brand_id::text IS NOT DISTINCT FROM x.de
                             WHEN 'fornecedor_livre' THEN p.fornecedor_livre IS NOT DISTINCT FROM x.de END)
       + (SELECT count(*) FROM _o2_preco x JOIN product_prices pp ON pp.id = x.row_id
          WHERE pp.product_id = x.product_id AND pp.price_type::text = x.tipo AND pp.price = x.de)
       + (SELECT count(*) FROM _o2_isup x JOIN item_suppliers i ON i.id = x.id
          WHERE i.product_id = x.product_id AND i.organization_id = c_org AND i.deleted_at IS NULL AND i.is_preferred
            AND (NOT x.m_sup OR i.supplier_id = x.sup_de) AND (NOT x.m_ssku OR i.supplier_sku IS NOT DISTINCT FROM x.ssku_de)
            AND (NOT x.m_pp OR i.purchase_price = x.pp_de))
       + (SELECT count(*) FROM _o2_attr a WHERE NOT EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = a.legado_id))
    INTO v_pend;
  SELECT (SELECT count(*) FROM _o2_prod x JOIN products p ON p.id = x.id AND p.organization_id = c_org
          WHERE CASE x.campo WHEN 'name' THEN p.name = x.para WHEN 'short_description' THEN p.short_description = x.para
                             WHEN 'brand_id' THEN p.brand_id::text = x.para WHEN 'fornecedor_livre' THEN p.fornecedor_livre = x.para END)
       + (SELECT count(*) FROM _o2_preco x JOIN product_prices pp ON pp.id = x.row_id
          WHERE pp.product_id = x.product_id AND pp.price_type::text = x.tipo AND pp.price = x.para)
       + (SELECT count(*) FROM _o2_isup x JOIN item_suppliers i ON i.id = x.id
          WHERE i.product_id = x.product_id AND i.organization_id = c_org AND i.deleted_at IS NULL
            AND (NOT x.m_sup OR i.supplier_id = x.sup_para) AND (NOT x.m_ssku OR i.supplier_sku IS NOT DISTINCT FROM x.ssku_para)
            AND (NOT x.m_pp OR i.purchase_price = x.pp_para))
       + (SELECT count(*) FROM _o2_attr a JOIN product_attribute_values v ON v.product_id = a.legado_id AND v.attribute_id = a.attribute_id
          WHERE v.value_text IS NOT DISTINCT FROM a.value_text AND v.value_json IS NOT DISTINCT FROM a.value_json)
    INTO v_feito;
  IF v_feito = v_total AND to_regclass('_mudelar_excel.onda2_gemeos') IS NOT NULL THEN
    RAISE NOTICE 'mudelar_excel_onda2: já aplicada (os % valores já são os do Excel e dos gémeos) — nada a fazer.', v_total;
    RETURN;
  END IF;
  IF v_pend <> v_total THEN
    RAISE EXCEPTION 'mudelar_excel_onda2: estado a meio ou a base mudou: % de % valores estão como lidos a 26/11 e % já como no Excel.', v_pend, v_total, v_feito;
  END IF;

  -- G4: os fornecedores de destino existem, são da Mudelar, estão vivos e ativos (as marcas também, se houver)
  SELECT count(DISTINCT x.para) INTO v_n FROM _o2_prod x WHERE x.campo = 'brand_id';
  SELECT count(*) INTO v_m FROM brands b
  WHERE b.id::text IN (SELECT x.para FROM _o2_prod x WHERE x.campo = 'brand_id')
    AND b.organization_id = c_org AND b.deleted_at IS NULL AND b.is_active;
  IF v_m <> v_n THEN RAISE EXCEPTION 'G4: só % de % marcas de destino existem vivas na Mudelar.', v_m, v_n; END IF;
  SELECT count(DISTINCT x.sup_para) INTO v_n FROM _o2_isup x WHERE x.m_sup;
  SELECT count(*) INTO v_m FROM suppliers s
  WHERE s.id IN (SELECT x.sup_para FROM _o2_isup x WHERE x.m_sup) AND s.organization_id = c_org AND s.deleted_at IS NULL AND s.is_active;
  IF v_m <> v_n THEN RAISE EXCEPTION 'G4: só % de % fornecedores de destino existem vivos na Mudelar.', v_m, v_n; END IF;
  IF EXISTS (SELECT 1 FROM _o2_isup x JOIN item_suppliers i ON i.product_id = x.product_id AND i.deleted_at IS NULL
             WHERE x.m_sup AND i.id <> x.id AND i.supplier_id = x.sup_para) THEN
    RAISE EXCEPTION 'G4: um produto já tem outra ligação ao fornecedor de destino.';
  END IF;
  -- G4b: como na onda 1, a troca de fornecedor (W5b) só é segura sem outra ligação preferencial ativa e sem artigo do
  -- catálogo do fornecedor na ligação (fn_item_suppliers_catalog_guard apagava-o ao mudar supplier_id)
  SELECT count(DISTINCT x.product_id) INTO v_n FROM _o2_isup x JOIN item_suppliers i ON i.product_id = x.product_id
  WHERE i.id <> x.id AND i.is_preferred AND i.deleted_at IS NULL;
  IF v_n > 0 THEN RAISE EXCEPTION 'G4: % produtos têm outra ligação preferencial ativa.', v_n; END IF;
  SELECT count(*) INTO v_n FROM _o2_isup x JOIN item_suppliers i ON i.id = x.id WHERE x.m_sup AND i.catalog_item_id IS NOT NULL;
  IF v_n > 0 THEN RAISE EXCEPTION 'G4: % ligações a trocar de fornecedor têm artigo do catálogo do fornecedor.', v_n; END IF;
  IF coalesce(current_setting('app.audit_bypass', true), '') = 'on' THEN
    RAISE EXCEPTION 'G4: app.audit_bypass já está ligado antes da escrita.';
  END IF;
  SELECT count(*) INTO v_n_marcas FROM brands b WHERE b.organization_id = c_org;
  SELECT count(*) INTO v_n_forn FROM suppliers s WHERE s.organization_id = c_org;

  -- G5: o utilizador da auditoria existe e é membro ativo da Mudelar
  IF NOT EXISTS (SELECT 1 FROM anew_users u WHERE u.id = c_criador AND u.deleted_at IS NULL)
     OR NOT EXISTS (SELECT 1 FROM anew_memberships ms WHERE ms.user_id = c_criador AND ms.organization_id = c_org AND ms.status = 'active') THEN
    RAISE EXCEPTION 'G5: o utilizador % não existe em anew_users, está apagado ou não é membro ativo da Mudelar.', c_criador;
  END IF;

  -- G6: dentro de cada família, os valores dos eixos continuam distintos
  SELECT count(*) INTO v_n FROM (
    SELECT z.family_id, z.k FROM (
      SELECT m.family_id,
             (SELECT string_agg(coalesce(v.value_text, '') || '|' || coalesce(v.value_json::text, ''), '#' ORDER BY ax.posicao, v.id)
              FROM product_family_axes ax LEFT JOIN product_attribute_values v ON v.product_id = m.product_id AND v.attribute_id = ax.attribute_id
              WHERE ax.family_id = m.family_id) AS k
      FROM product_family_members m JOIN product_families f ON f.id = m.family_id WHERE f.organization_id = c_org) z
    GROUP BY z.family_id, z.k HAVING count(*) > 1) d;
  IF v_n > 0 THEN RAISE EXCEPTION 'G6: % combinações de eixos repetidas dentro de famílias da Mudelar (antes de escrever).', v_n; END IF;

  -- ─── impressões digitais de partida (sem updated_at) ───────────────────────────────────────────────
  SELECT md5(string_agg(p.id::text || '=' || p.sku, ',' ORDER BY p.id)) INTO v_h_sku_antes FROM products p WHERE p.organization_id = c_org;
  SELECT md5(string_agg(md5((to_jsonb(p) - 'updated_at')::text), '' ORDER BY p.id)) INTO v_h_out_antes
  FROM products p WHERE p.organization_id = c_org AND p.id NOT IN (SELECT s.id FROM _o2_sku s);
  SELECT md5(coalesce(string_agg(md5((to_jsonb(pp) - 'updated_at')::text), '' ORDER BY pp.id), '')) INTO v_h_preco_antes
  FROM product_prices pp JOIN products p ON p.id = pp.product_id
  WHERE p.organization_id = c_org AND pp.id NOT IN (SELECT x.row_id FROM _o2_preco x);
  SELECT md5(coalesce(string_agg(md5((to_jsonb(i) - 'updated_at')::text), '' ORDER BY i.id), '')) INTO v_h_isup_antes
  FROM item_suppliers i JOIN products p ON p.id = i.product_id
  WHERE p.organization_id = c_org AND i.id NOT IN (SELECT x.id FROM _o2_isup x);
  SELECT md5(coalesce(string_agg(md5((to_jsonb(v) - 'updated_at')::text), '' ORDER BY v.id), '')), count(*) INTO v_h_attr_antes, v_pav_antes
  FROM product_attribute_values v JOIN products p ON p.id = v.product_id WHERE p.organization_id = c_org;
  SELECT md5(coalesce(string_agg(h, '' ORDER BY h), '')) INTO v_h_fam_antes FROM (
    SELECT 'f' || md5((to_jsonb(f) - 'updated_at')::text) AS h FROM product_families f WHERE f.organization_id = c_org
    UNION ALL SELECT 'm' || md5(to_jsonb(m)::text) FROM product_family_members m JOIN product_families f ON f.id = m.family_id WHERE f.organization_id = c_org
    UNION ALL SELECT 'a' || md5(to_jsonb(a)::text) FROM product_family_axes a JOIN product_families f ON f.id = a.family_id WHERE f.organization_id = c_org) z;
  SELECT md5(coalesce(string_agg(h, '' ORDER BY h), '')) INTO v_h_docs_antes FROM (
    SELECT 'q' || md5((to_jsonb(t) - 'updated_at')::text) AS h FROM quote_lines t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'n' || md5((to_jsonb(t) - 'updated_at')::text) FROM negocio_produtos t JOIN products p ON p.id = t.produto_id WHERE p.organization_id = c_org
    UNION ALL SELECT 's' || md5((to_jsonb(t) - 'updated_at')::text) FROM service_materials t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'c' || md5((to_jsonb(t) - 'updated_at')::text) FROM purchase_order_items t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'v' || md5((to_jsonb(t) - 'atualizada_em')::text) FROM negocio_vista_cliente t WHERE t.organization_id = c_org) z;

  -- ─── 3. Cópia do estado antigo e a ligação legado→gémeo (schema privado, só postgres) ──────────────
  CREATE SCHEMA IF NOT EXISTS _mudelar_excel;
  REVOKE ALL ON SCHEMA _mudelar_excel FROM PUBLIC, anon, authenticated, service_role;
  IF to_regclass('_mudelar_excel.onda2_produtos') IS NOT NULL OR to_regclass('_mudelar_excel.onda2_gemeos') IS NOT NULL THEN
    RAISE EXCEPTION 'B1: a cópia _mudelar_excel.onda2_* já existe mas os valores não são os do Excel: rever à mão.';
  END IF;
  CREATE TABLE _mudelar_excel.onda2_produtos (id uuid PRIMARY KEY, linha jsonb NOT NULL, copiado_em timestamptz NOT NULL DEFAULT now());
  CREATE TABLE _mudelar_excel.onda2_plano_produtos (id uuid NOT NULL, campo text NOT NULL, de text, para text NOT NULL, PRIMARY KEY (id, campo));
  CREATE TABLE _mudelar_excel.onda2_precos (id uuid PRIMARY KEY, linha jsonb NOT NULL, para numeric NOT NULL, exato numeric NOT NULL);
  CREATE TABLE _mudelar_excel.onda2_item_suppliers (id uuid PRIMARY KEY, linha jsonb NOT NULL, m_sup boolean NOT NULL, sup_para uuid,
    m_ssku boolean NOT NULL, ssku_para text, m_pp boolean NOT NULL, pp_para numeric);
  -- a ligação legado→gémeo: o legado (SKU manual, fichas do histórico de orçamentos criadas a 23/11) é o mesmo produto que
  -- o gémeo (SKU gerado). Não se reapontam documentos nem se arquiva nada: fica só a ligação, para a onda 4 e para consulta.
  CREATE TABLE _mudelar_excel.onda2_gemeos (legado_id uuid PRIMARY KEY, legado_sku text NOT NULL, gemeo_id uuid NOT NULL,
    gemeo_sku text NOT NULL, semelhanca numeric NOT NULL, atributos_copiados integer NOT NULL, ligado_em timestamptz NOT NULL DEFAULT now());
  CREATE TABLE _mudelar_excel.onda2_atributos_novos (id uuid PRIMARY KEY, product_id uuid NOT NULL, attribute_id uuid NOT NULL, linha jsonb NOT NULL);
  REVOKE ALL ON ALL TABLES IN SCHEMA _mudelar_excel FROM PUBLIC, anon, authenticated, service_role;
  INSERT INTO _mudelar_excel.onda2_produtos (id, linha) SELECT p.id, to_jsonb(p) FROM products p WHERE p.id IN (SELECT s.id FROM _o2_sku s);
  INSERT INTO _mudelar_excel.onda2_plano_produtos (id, campo, de, para) SELECT x.id, x.campo, x.de, x.para FROM _o2_prod x;
  INSERT INTO _mudelar_excel.onda2_precos (id, linha, para, exato)
  SELECT pp.id, to_jsonb(pp), x.para, x.exato FROM product_prices pp JOIN _o2_preco x ON x.row_id = pp.id;
  INSERT INTO _mudelar_excel.onda2_item_suppliers (id, linha, m_sup, sup_para, m_ssku, ssku_para, m_pp, pp_para)
  SELECT i.id, to_jsonb(i), x.m_sup, x.sup_para, x.m_ssku, x.ssku_para, x.m_pp, x.pp_para FROM item_suppliers i JOIN _o2_isup x ON x.id = i.id;
  INSERT INTO _mudelar_excel.onda2_gemeos (legado_id, legado_sku, gemeo_id, gemeo_sku, semelhanca, atributos_copiados)
  SELECT g.legado_id, s.sku, g.gemeo_id, g.gemeo_sku, g.semelhanca, g.n_attr FROM _o2_gemeo g JOIN _o2_sku s ON s.id = g.legado_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_n_gemeos THEN RAISE EXCEPTION 'B2: % ligações legado→gémeo guardadas, esperadas %.', v_n, c_n_gemeos; END IF;

  -- ─── 4. Escrita (cada uma conta as linhas) ──────────────────────────────────────────────────────────
  -- W1-W4: campos de products, só onde o valor ainda é o lido
  UPDATE products p SET name = x.para FROM _o2_prod x
  WHERE x.campo = 'name' AND p.id = x.id AND p.organization_id = c_org AND p.name IS NOT DISTINCT FROM x.de;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_n_nome THEN RAISE EXCEPTION 'W1: % nomes escritos, esperados %.', v_n, c_n_nome; END IF;
  UPDATE products p SET short_description = x.para FROM _o2_prod x
  WHERE x.campo = 'short_description' AND p.id = x.id AND p.organization_id = c_org AND coalesce(p.short_description, '') = coalesce(x.de, '');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_n_descr THEN RAISE EXCEPTION 'W2: % descrições escritas, esperadas %.', v_n, c_n_descr; END IF;
  UPDATE products p SET brand_id = x.para::uuid FROM _o2_prod x
  WHERE x.campo = 'brand_id' AND p.id = x.id AND p.organization_id = c_org AND p.brand_id::text IS NOT DISTINCT FROM x.de;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_n_marca THEN RAISE EXCEPTION 'W3: % marcas escritas, esperadas %.', v_n, c_n_marca; END IF;
  UPDATE products p SET fornecedor_livre = x.para FROM _o2_prod x
  WHERE x.campo = 'fornecedor_livre' AND p.id = x.id AND p.organization_id = c_org AND p.fornecedor_livre IS NOT DISTINCT FROM x.de;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_n_flivre THEN RAISE EXCEPTION 'W4: % fornecedor_livre escritos, esperados %.', v_n, c_n_flivre; END IF;
  -- W5a: ligações em que o fornecedor NÃO muda (só código e/ou preço): um UPDATE, com a auditoria normal dos gatilhos
  UPDATE item_suppliers i
     SET supplier_sku   = CASE WHEN x.m_ssku THEN x.ssku_para ELSE i.supplier_sku END,
         purchase_price = CASE WHEN x.m_pp   THEN x.pp_para   ELSE i.purchase_price END
    FROM _o2_isup x
   WHERE NOT x.m_sup AND i.id = x.id AND i.product_id = x.product_id AND i.organization_id = c_org AND i.deleted_at IS NULL AND i.is_preferred
     AND (NOT x.m_ssku OR i.supplier_sku IS NOT DISTINCT FROM x.ssku_de) AND (NOT x.m_pp OR i.purchase_price = x.pp_de);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_n_isup - c_n_isup_sup THEN RAISE EXCEPTION 'W5: % ligações sem troca de fornecedor escritas, esperadas %.', v_n, c_n_isup - c_n_isup_sup; END IF;
  -- W5b: as que trocam de fornecedor, em dois passos e com a auditoria dos gatilhos desligada SÓ aqui, como na onda 1
  -- (fn_item_suppliers_check_preferred_conflict conta a própria linha como «outro preferencial» num só UPDATE)
  PERFORM set_config('app.audit_bypass', 'on', true);
  UPDATE item_suppliers i SET is_preferred = false FROM _o2_isup x
   WHERE x.m_sup AND i.id = x.id AND i.product_id = x.product_id AND i.organization_id = c_org AND i.deleted_at IS NULL AND i.is_preferred
     AND i.supplier_id = x.sup_de AND (NOT x.m_ssku OR i.supplier_sku IS NOT DISTINCT FROM x.ssku_de) AND (NOT x.m_pp OR i.purchase_price = x.pp_de);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_n_isup_sup THEN RAISE EXCEPTION 'W5b: % ligações desmarcadas, esperadas %.', v_n, c_n_isup_sup; END IF;
  UPDATE item_suppliers i
     SET supplier_id    = x.sup_para,
         supplier_sku   = CASE WHEN x.m_ssku THEN x.ssku_para ELSE i.supplier_sku END,
         purchase_price = CASE WHEN x.m_pp   THEN x.pp_para   ELSE i.purchase_price END,
         is_preferred   = true
    FROM _o2_isup x
   WHERE x.m_sup AND i.id = x.id AND i.product_id = x.product_id AND i.organization_id = c_org AND i.deleted_at IS NULL AND NOT i.is_preferred
     AND i.supplier_id = x.sup_de AND (NOT x.m_ssku OR i.supplier_sku IS NOT DISTINCT FROM x.ssku_de) AND (NOT x.m_pp OR i.purchase_price = x.pp_de);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_n_isup_sup THEN RAISE EXCEPTION 'W5b: % ligações trocadas de fornecedor, esperadas %.', v_n, c_n_isup_sup; END IF;
  PERFORM set_config('app.audit_bypass', 'off', true);
  IF current_setting('app.audit_bypass', true) <> 'off' THEN RAISE EXCEPTION 'W5b: app.audit_bypass não voltou a off.'; END IF;
  -- W5c: a auditoria da troca, igual à que fn_generic_entity_audit escreveria num só UPDATE
  INSERT INTO entity_audit_log (organization_id, entity_id, record_id, table_name, operation, changed_fields, full_record, changed_by, source)
  SELECT c_org, i.id, i.id, 'item_suppliers', 'UPDATE',
         (SELECT jsonb_object_agg(k.key, jsonb_build_object('old', b.linha -> k.key, 'new', k.value))
            FROM jsonb_each(to_jsonb(i)) k
           WHERE k.key <> ALL (ARRAY['updated_at', 'search_text', 'contact_attempts', 'last_activity_at'])
             AND (b.linha ->> k.key) IS DISTINCT FROM (to_jsonb(i) ->> k.key)),
         NULL, c_criador, c_fonte
    FROM item_suppliers i JOIN _mudelar_excel.onda2_item_suppliers b ON b.id = i.id
   WHERE b.m_sup AND i.organization_id = c_org;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_n_isup_sup THEN RAISE EXCEPTION 'W5c: % linhas de auditoria das ligações, esperadas %.', v_n, c_n_isup_sup; END IF;
  INSERT INTO entity_audit_log (organization_id, entity_id, record_id, table_name, operation, changed_fields, full_record, changed_by, source)
  SELECT c_org, p.id, p.id, 'products', 'UPDATE',
         jsonb_build_object('supplier_id', jsonb_build_object('old', b.linha -> 'supplier_id', 'new', to_jsonb(p.supplier_id))),
         NULL, c_criador, c_fonte
    FROM products p JOIN _mudelar_excel.onda2_produtos b ON b.id = p.id
   WHERE p.organization_id = c_org AND p.id IN (SELECT x.product_id FROM _o2_isup x WHERE x.m_sup)
     AND (b.linha ->> 'supplier_id') IS DISTINCT FROM p.supplier_id::text;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_n_isup_sup THEN RAISE EXCEPTION 'W5c: % linhas de auditoria de products.supplier_id, esperadas %.', v_n, c_n_isup_sup; END IF;
  -- W6: custo e PVP na linha ATUAL (como cat_definir_pvp); a história fica em product_price_history pelo gatilho
  UPDATE product_prices pp SET price = x.para, preco_exato = x.exato FROM _o2_preco x
  WHERE pp.id = x.row_id AND pp.product_id = x.product_id AND pp.price_type::text = x.tipo AND pp.price = x.de
    AND pp.product_id IN (SELECT p.id FROM products p WHERE p.organization_id = c_org);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_n_preco THEN RAISE EXCEPTION 'W6: % preços escritos, esperados %.', v_n, c_n_preco; END IF;
  -- W8: os atributos do gémeo no legado (só em legados ainda sem nenhum atributo). Não chama cat_gerar_sku_produto, não
  -- dá modelo nem família: em product_attribute_values só há os gatilhos de auditoria e de updated_at.
  WITH ins AS (
    INSERT INTO product_attribute_values (product_id, attribute_id, value_text, value_number, value_bool, value_json, value_date, unit)
    SELECT a.legado_id, a.attribute_id, a.value_text, a.value_number, a.value_bool, a.value_json, a.value_date, a.unit
    FROM _o2_attr a JOIN products p ON p.id = a.legado_id AND p.organization_id = c_org
    WHERE NOT EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = a.legado_id)
    ORDER BY a.legado_id, a.attribute_id
    RETURNING id, product_id, attribute_id)
  INSERT INTO _mudelar_excel.onda2_atributos_novos (id, product_id, attribute_id, linha) SELECT ins.id, ins.product_id, ins.attribute_id, '{}'::jsonb FROM ins;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_n_attr THEN RAISE EXCEPTION 'W8: % atributos escritos, esperados %.', v_n, c_n_attr; END IF;
  UPDATE _mudelar_excel.onda2_atributos_novos n SET linha = to_jsonb(v) FROM product_attribute_values v WHERE v.id = n.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_n_attr THEN RAISE EXCEPTION 'W8: % atributos copiados para a reversão, esperados %.', v_n, c_n_attr; END IF;

  -- ─── 5. Conferências ────────────────────────────────────────────────────────────────────────────────
  -- C11: cada valor «para» ficou gravado
  SELECT count(*) INTO v_n FROM _o2_prod x JOIN products p ON p.id = x.id
  WHERE CASE x.campo WHEN 'name' THEN p.name = x.para WHEN 'short_description' THEN p.short_description = x.para
                     WHEN 'brand_id' THEN p.brand_id::text = x.para WHEN 'fornecedor_livre' THEN p.fornecedor_livre = x.para END;
  IF v_n <> c_n_nome + c_n_descr + c_n_marca + c_n_flivre THEN RAISE EXCEPTION 'C11: só % valores de products ficaram como no Excel.', v_n; END IF;
  SELECT count(*) INTO v_n FROM _o2_isup x JOIN products p ON p.id = x.product_id WHERE x.m_sup AND p.supplier_id = x.sup_para;
  IF v_n <> c_n_isup_sup THEN RAISE EXCEPTION 'C11: products.supplier_id não acompanhou a ligação em % produtos.', c_n_isup_sup - v_n; END IF;
  SELECT count(*) INTO v_n FROM _o2_preco x JOIN product_prices pp ON pp.id = x.row_id WHERE pp.price = x.para AND pp.preco_exato = x.exato;
  IF v_n <> c_n_preco THEN RAISE EXCEPTION 'C11: só % de % preços ficaram como no Excel.', v_n, c_n_preco; END IF;
  SELECT count(*) INTO v_n FROM _o2_isup x JOIN item_suppliers i ON i.id = x.id
  WHERE (NOT x.m_sup OR i.supplier_id = x.sup_para) AND (NOT x.m_ssku OR i.supplier_sku IS NOT DISTINCT FROM x.ssku_para)
    AND (NOT x.m_pp OR i.purchase_price = x.pp_para) AND i.deleted_at IS NULL AND i.is_preferred;
  IF v_n <> c_n_isup THEN RAISE EXCEPTION 'C11: só % de % ligações a fornecedores ficaram como no Excel.', v_n, c_n_isup; END IF;
  SELECT count(*) INTO v_n FROM _o2_isup x JOIN products p ON p.id = x.product_id WHERE p.supplier_id IS DISTINCT FROM
    (SELECT i.supplier_id FROM item_suppliers i WHERE i.id = x.id);
  IF v_n > 0 THEN RAISE EXCEPTION 'C11: products.supplier_id ficou diferente da ligação preferencial em % produtos.', v_n; END IF;
  -- C11b: cada legado com gémeo tem exatamente os atributos do gémeo (os mesmos atributos e valores)
  SELECT count(*) INTO v_n FROM _o2_gemeo g
  WHERE (SELECT count(*) FROM product_attribute_values v WHERE v.product_id = g.legado_id) = g.n_attr
    AND NOT EXISTS (SELECT v.attribute_id, v.value_text, v.value_number, v.value_bool, v.value_json, v.value_date, v.unit
                    FROM product_attribute_values v WHERE v.product_id = g.gemeo_id
                    EXCEPT
                    SELECT v.attribute_id, v.value_text, v.value_number, v.value_bool, v.value_json, v.value_date, v.unit
                    FROM product_attribute_values v WHERE v.product_id = g.legado_id);
  IF v_n <> c_n_gemeos THEN RAISE EXCEPTION 'C11: só % de % legados ficaram com os atributos do gémeo.', v_n, c_n_gemeos; END IF;

  -- C12: auditoria e históricos sem duplicados (now() = o início desta transação)
  SELECT count(*), count(DISTINCT l.record_id),
         count(*) FILTER (WHERE l.changed_fields ? 'is_preferred' OR l.changed_fields IS NULL OR l.changed_fields = '{}'::jsonb)
    INTO v_n, v_m, v_pend
  FROM entity_audit_log l
  WHERE l.table_name = 'item_suppliers' AND l.record_id IN (SELECT x.id FROM _o2_isup x) AND l.created_at = now() AND l.source = c_fonte;
  IF v_n <> c_n_isup OR v_m <> c_n_isup OR v_pend > 0 THEN
    RAISE EXCEPTION 'C12: % linhas de auditoria das ligações (% ligações, % com is_preferred ou vazias); esperadas % e %.', v_n, v_m, v_pend, c_n_isup, c_n_isup;
  END IF;
  SELECT count(*), count(DISTINCT l.record_id),
         count(*) FILTER (WHERE (l.changed_fields -> 'supplier_id' ->> 'new') IS DISTINCT FROM x.sup_para::text)
    INTO v_n, v_m, v_pend
  FROM entity_audit_log l JOIN _o2_isup x ON x.product_id = l.record_id AND x.m_sup
  WHERE l.table_name = 'products' AND l.changed_fields ? 'supplier_id' AND l.created_at = now() AND l.source = c_fonte;
  IF v_n <> c_n_isup_sup OR v_m <> c_n_isup_sup OR v_pend > 0 THEN
    RAISE EXCEPTION 'C12: % auditorias de products.supplier_id (% produtos, % sem o fornecedor novo); esperadas %.', v_n, v_m, v_pend, c_n_isup_sup;
  END IF;
  SELECT count(*), count(DISTINCT h.item_supplier_id),
         count(*) FILTER (WHERE NOT x.m_pp OR h.old_price IS DISTINCT FROM x.pp_de OR h.new_price IS DISTINCT FROM x.pp_para)
    INTO v_n, v_m, v_pend
  FROM item_supplier_price_history h JOIN _o2_isup x ON x.id = h.item_supplier_id WHERE h.changed_at = now();
  IF v_n <> c_n_isup_pp OR v_m <> c_n_isup_pp OR v_pend > 0 THEN
    RAISE EXCEPTION 'C12: % linhas no histórico de preço das ligações (% ligações, % erradas); esperadas %.', v_n, v_m, v_pend, c_n_isup_pp;
  END IF;
  SELECT count(*) INTO v_n FROM product_price_history h
  WHERE h.product_id IN (SELECT x.product_id FROM _o2_preco x) AND h.changed_at = now();
  IF v_n <> c_n_preco THEN RAISE EXCEPTION 'C12: % linhas no histórico de preços dos produtos, esperadas %.', v_n, c_n_preco; END IF;
  SELECT count(*) INTO v_n FROM entity_audit_log l
  WHERE l.table_name = 'product_attribute_values' AND l.operation = 'INSERT' AND l.created_at = now() AND l.source = c_fonte
    AND l.entity_id IN (SELECT g.legado_id FROM _o2_gemeo g);
  IF v_n <> c_n_attr THEN RAISE EXCEPTION 'C12: % linhas de auditoria dos atributos, esperadas %.', v_n, c_n_attr; END IF;

  -- C1: nos legados só mudaram os campos desta onda (comparado com a cópia, campo a campo)
  SELECT count(*) INTO v_n FROM _mudelar_excel.onda2_produtos b JOIN products p ON p.id = b.id
  WHERE (to_jsonb(p) - ARRAY['updated_at', 'name', 'short_description', 'brand_id', 'marca_livre', 'supplier_id', 'fornecedor_livre'])
        IS DISTINCT FROM (b.linha - ARRAY['updated_at', 'name', 'short_description', 'brand_id', 'marca_livre', 'supplier_id', 'fornecedor_livre'])
     OR (p.name IS DISTINCT FROM b.linha->>'name' AND NOT EXISTS (SELECT 1 FROM _o2_prod x WHERE x.id = p.id AND x.campo = 'name'))
     OR (p.short_description IS DISTINCT FROM b.linha->>'short_description' AND NOT EXISTS (SELECT 1 FROM _o2_prod x WHERE x.id = p.id AND x.campo = 'short_description'))
     OR ((p.brand_id::text IS DISTINCT FROM b.linha->>'brand_id' OR p.marca_livre IS DISTINCT FROM b.linha->>'marca_livre')
         AND NOT EXISTS (SELECT 1 FROM _o2_prod x WHERE x.id = p.id AND x.campo = 'brand_id'))
     OR (p.fornecedor_livre IS DISTINCT FROM b.linha->>'fornecedor_livre' AND NOT EXISTS (SELECT 1 FROM _o2_prod x WHERE x.id = p.id AND x.campo = 'fornecedor_livre'))
     OR (p.supplier_id::text IS DISTINCT FROM b.linha->>'supplier_id' AND NOT EXISTS (SELECT 1 FROM _o2_isup x WHERE x.product_id = p.id AND x.m_sup));
  IF v_n > 0 THEN RAISE EXCEPTION 'C1: % legados mudaram fora dos campos desta onda.', v_n; END IF;
  SELECT count(*) INTO v_n FROM _mudelar_excel.onda2_precos b JOIN product_prices pp ON pp.id = b.id
  WHERE (to_jsonb(pp) - ARRAY['updated_at', 'price', 'preco_exato']) IS DISTINCT FROM (b.linha - ARRAY['updated_at', 'price', 'preco_exato']);
  IF v_n > 0 THEN RAISE EXCEPTION 'C1: % preços mudaram fora de price e preco_exato.', v_n; END IF;
  SELECT count(*) INTO v_n FROM _mudelar_excel.onda2_item_suppliers b JOIN item_suppliers i ON i.id = b.id
  WHERE (to_jsonb(i) - ARRAY['updated_at', 'supplier_id', 'supplier_sku', 'purchase_price'])
        IS DISTINCT FROM (b.linha - ARRAY['updated_at', 'supplier_id', 'supplier_sku', 'purchase_price']);
  IF v_n > 0 THEN RAISE EXCEPTION 'C1: % ligações a fornecedores mudaram fora dos campos desta onda.', v_n; END IF;

  -- C2: nenhum SKU da Mudelar mudou; C13: os legados continuam com SKU manual, sem modelo e fora das famílias
  SELECT md5(string_agg(p.id::text || '=' || p.sku, ',' ORDER BY p.id)) INTO v_h_sku_depois FROM products p WHERE p.organization_id = c_org;
  IF v_h_sku_depois <> v_h_sku_antes THEN RAISE EXCEPTION 'C2: há SKU alterados na Mudelar.'; END IF;
  SELECT count(*) INTO v_n FROM products p JOIN _o2_sku s ON s.id = p.id
  WHERE p.sku = s.sku AND NOT coalesce(p.sku_gerado, false) AND p.model_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM product_family_members m WHERE m.product_id = p.id);
  IF v_n <> c_n_produtos THEN RAISE EXCEPTION 'C13: só % de % legados continuam com o SKU manual, sem modelo e fora das famílias.', v_n, c_n_produtos; END IF;
  -- C3: os produtos que não são desta onda ficaram iguais (sem updated_at; os gémeos incluídos)
  SELECT md5(string_agg(md5((to_jsonb(p) - 'updated_at')::text), '' ORDER BY p.id)) INTO v_h_out_depois
  FROM products p WHERE p.organization_id = c_org AND p.id NOT IN (SELECT s.id FROM _o2_sku s);
  IF v_h_out_depois <> v_h_out_antes THEN RAISE EXCEPTION 'C3: mudaram produtos da Mudelar que não são desta onda.'; END IF;
  SELECT count(*) INTO v_n FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.deleted_at IS NULL;
  IF v_n <> c_n_mudelar THEN RAISE EXCEPTION 'C3: a Mudelar ficou com % produtos vivos (eram %).', v_n, c_n_mudelar; END IF;
  -- C4: preços que não são desta onda iguais
  SELECT md5(coalesce(string_agg(md5((to_jsonb(pp) - 'updated_at')::text), '' ORDER BY pp.id), '')) INTO v_h_preco_depois
  FROM product_prices pp JOIN products p ON p.id = pp.product_id
  WHERE p.organization_id = c_org AND pp.id NOT IN (SELECT x.row_id FROM _o2_preco x);
  IF v_h_preco_depois <> v_h_preco_antes THEN RAISE EXCEPTION 'C4: mudaram preços da Mudelar que não são desta onda.'; END IF;
  -- C5: ligações a fornecedores que não são desta onda iguais; marcas e fornecedores não aumentaram
  SELECT md5(coalesce(string_agg(md5((to_jsonb(i) - 'updated_at')::text), '' ORDER BY i.id), '')) INTO v_h_isup_depois
  FROM item_suppliers i JOIN products p ON p.id = i.product_id
  WHERE p.organization_id = c_org AND i.id NOT IN (SELECT x.id FROM _o2_isup x);
  IF v_h_isup_depois <> v_h_isup_antes THEN RAISE EXCEPTION 'C5: mudaram ligações a fornecedores que não são desta onda.'; END IF;
  SELECT count(*) INTO v_n FROM brands b WHERE b.organization_id = c_org;
  SELECT count(*) INTO v_m FROM suppliers s WHERE s.organization_id = c_org;
  IF v_n <> v_n_marcas OR v_m <> v_n_forn THEN
    RAISE EXCEPTION 'C5: a Mudelar ficou com % marcas e % fornecedores (eram % e %).', v_n, v_m, v_n_marcas, v_n_forn;
  END IF;
  -- C6: os atributos que já existiam ficaram iguais, e há exatamente c_n_attr atributos novos, todos nos legados
  SELECT md5(coalesce(string_agg(md5((to_jsonb(v) - 'updated_at')::text), '' ORDER BY v.id), '')), count(*) INTO v_h_attr_depois, v_n
  FROM product_attribute_values v JOIN products p ON p.id = v.product_id
  WHERE p.organization_id = c_org AND v.id NOT IN (SELECT n.id FROM _mudelar_excel.onda2_atributos_novos n);
  IF v_h_attr_depois <> v_h_attr_antes OR v_n <> v_pav_antes THEN RAISE EXCEPTION 'C6: mudaram valores de atributos da Mudelar que já existiam.'; END IF;
  SELECT count(*) INTO v_n FROM product_attribute_values v JOIN products p ON p.id = v.product_id WHERE p.organization_id = c_org;
  IF v_n <> v_pav_antes + c_n_attr THEN RAISE EXCEPTION 'C6: a Mudelar tem % valores de atributos; esperavam-se %.', v_n, v_pav_antes + c_n_attr; END IF;
  -- C7: famílias intactas (contagens, impressão digital e eixos distintos)
  SELECT count(*) INTO v_n FROM product_families f WHERE f.organization_id = c_org;
  SELECT count(*) INTO v_m FROM product_family_members m JOIN product_families f ON f.id = m.family_id WHERE f.organization_id = c_org;
  IF v_n <> c_n_fam OR v_m <> c_n_membros THEN
    RAISE EXCEPTION 'C7: a Mudelar ficou com % famílias e % membros (eram % e %).', v_n, v_m, c_n_fam, c_n_membros;
  END IF;
  SELECT md5(coalesce(string_agg(h, '' ORDER BY h), '')) INTO v_h_fam_depois FROM (
    SELECT 'f' || md5((to_jsonb(f) - 'updated_at')::text) AS h FROM product_families f WHERE f.organization_id = c_org
    UNION ALL SELECT 'm' || md5(to_jsonb(m)::text) FROM product_family_members m JOIN product_families f ON f.id = m.family_id WHERE f.organization_id = c_org
    UNION ALL SELECT 'a' || md5(to_jsonb(a)::text) FROM product_family_axes a JOIN product_families f ON f.id = a.family_id WHERE f.organization_id = c_org) z;
  IF v_h_fam_depois <> v_h_fam_antes THEN RAISE EXCEPTION 'C7: as famílias da Mudelar mudaram.'; END IF;
  SELECT count(*) INTO v_n FROM (
    SELECT z.family_id, z.k FROM (
      SELECT m.family_id,
             (SELECT string_agg(coalesce(v.value_text, '') || '|' || coalesce(v.value_json::text, ''), '#' ORDER BY ax.posicao, v.id)
              FROM product_family_axes ax LEFT JOIN product_attribute_values v ON v.product_id = m.product_id AND v.attribute_id = ax.attribute_id
              WHERE ax.family_id = m.family_id) AS k
      FROM product_family_members m JOIN product_families f ON f.id = m.family_id WHERE f.organization_id = c_org) z
    GROUP BY z.family_id, z.k HAVING count(*) > 1) d;
  IF v_n > 0 THEN RAISE EXCEPTION 'C7: % combinações de eixos repetidas dentro de famílias da Mudelar.', v_n; END IF;
  -- C8: orçamentos, negócios, receitas, compras e a vista do cliente iguais (nenhum documento reapontado)
  SELECT md5(coalesce(string_agg(h, '' ORDER BY h), '')) INTO v_h_docs_depois FROM (
    SELECT 'q' || md5((to_jsonb(t) - 'updated_at')::text) AS h FROM quote_lines t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'n' || md5((to_jsonb(t) - 'updated_at')::text) FROM negocio_produtos t JOIN products p ON p.id = t.produto_id WHERE p.organization_id = c_org
    UNION ALL SELECT 's' || md5((to_jsonb(t) - 'updated_at')::text) FROM service_materials t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'c' || md5((to_jsonb(t) - 'updated_at')::text) FROM purchase_order_items t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'v' || md5((to_jsonb(t) - 'atualizada_em')::text) FROM negocio_vista_cliente t WHERE t.organization_id = c_org) z;
  IF v_h_docs_depois <> v_h_docs_antes THEN RAISE EXCEPTION 'C8: mudaram orçamentos, negócios, receitas, compras ou vistas da Mudelar.'; END IF;
  -- C9: nada escrito fora da Mudelar (nenhuma linha de outra organização tem o xmin desta transação)
  v_xid := (txid_current() % 4294967296)::text;
  SELECT (SELECT count(*) FROM products p WHERE p.xmin::text = v_xid AND p.organization_id IS DISTINCT FROM c_org)
       + (SELECT count(*) FROM product_prices x JOIN products p ON p.id = x.product_id WHERE x.xmin::text = v_xid AND p.organization_id IS DISTINCT FROM c_org)
       + (SELECT count(*) FROM item_suppliers x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org)
       + (SELECT count(*) FROM product_attribute_values x JOIN products p ON p.id = x.product_id WHERE x.xmin::text = v_xid AND p.organization_id IS DISTINCT FROM c_org)
    INTO v_n;
  IF v_n > 0 THEN RAISE EXCEPTION 'C9: % linhas de outras organizações foram escritas.', v_n; END IF;
  -- C10: a cópia fica fechada (schema e tabelas sem privilégios para PUBLIC, anon, authenticated nem service_role)
  SELECT coalesce(n.nspacl::text, '') INTO v_acl FROM pg_namespace n WHERE n.nspname = '_mudelar_excel';
  IF v_acl LIKE '%anon=%' OR v_acl LIKE '%authenticated=%' OR v_acl LIKE '%service_role=%' OR v_acl LIKE '{=%' OR v_acl LIKE '%,=%' THEN
    RAISE EXCEPTION 'C10: o schema _mudelar_excel ficou aberto (%).', v_acl;
  END IF;
  FOR v_t IN SELECT c.oid::regclass::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = '_mudelar_excel' AND c.relkind::text = 'r' LOOP
    SELECT coalesce(c.relacl::text, '') INTO v_acl FROM pg_class c WHERE c.oid = to_regclass(v_t);
    IF v_acl LIKE '%anon=%' OR v_acl LIKE '%authenticated=%' OR v_acl LIKE '%service_role=%' OR v_acl LIKE '{=%' OR v_acl LIKE '%,=%' THEN
      RAISE EXCEPTION 'C10: % ficou aberta (%).', v_t, v_acl;
    END IF;
  END LOOP;

  RAISE NOTICE 'mudelar_excel_onda2: % legados: % fornecedores, % códigos de fornecedor, % preços, % ligações legado→gémeo, % atributos copiados.',
    c_n_produtos, c_n_isup_sup, c_n_isup_ssku, c_n_preco, c_n_gemeos, c_n_attr;
END $mig$;

COMMIT;
