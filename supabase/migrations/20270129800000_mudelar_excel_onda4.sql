-- =============================================================================
-- Catálogo — MUDELAR igual aos Excels, ONDA 4: ARQUIVAR os produtos da base que não estão em nenhum Excel. MIGRATION DE DADOS.
-- Base de RH (uetjghdkwbywbftedtth).
-- =============================================================================
--
-- !!! SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth). SÓ A MUDELAR (3242e925-da26-459a-8258-be04d904e355): todas as escritas
-- !!! levam a organização. Os ids, os SKU, as ligações a fornecedores e as referências foram lidos na RH a 26/11/2026 (SELECT
-- !!! como administrador, sem RLS), DEPOIS da onda 3 (20270129700000). Noutra base (a principal) a organização ou os produtos
-- !!! não existem com estes ids e a migration sai por RAISE NOTICE sem escrever nada. Antes do `db push`, confirmar
-- !!! supabase/.temp/project-ref = uetjghdkwbywbftedtth.
--
-- Pedido do dono: «men so faz que teja tudo como nos excels sf» (depois de «... e os prod na mudelar que nao teem no excel
-- tiras»). A auditoria (mudelar-audit/d.csv) encontrou 403 produtos da base sem linha em nenhuma versão dos Excels. Plano
-- gerado por script (mudelar-audit/onda4: o4_plan.py e o4_sql.py), fora da pasta do projeto; o que fica de fora e porquê está
-- em mudelar-audit/onda4/fora.csv, e a lista arquivada em mudelar-audit/onda4/arquivar.csv.
--
-- O QUE FAZ: ARQUIVA 180 produtos da Mudelar (lista fechada, embutida abaixo; nada se calcula na hora), como o Catálogo
-- (rpc_delete_product / rpc_bulk_delete_product): is_deleted, deleted_at e deleted_by, os três, e uma linha de auditoria
-- por produto (fn_manual_audit_log, com a auditoria dos gatilhos desligada só nessa escrita, como as RPC). Arquiva também as
-- 173 ligações a fornecedores (item_suppliers) vivas desses produtos, como rpc_delete_item_supplier (deleted_at, deleted_by e
-- uma linha de auditoria cada); eram todas a preferencial, por isso o gatilho fn_item_suppliers_sync_preferred limpa
-- products.supplier_id desses 173 produtos (a reversão repõe-no ao repor a ligação).
--   Sem referências ......... 84  (Armários Inferiores 67 e superiores 1 — as variantes de cor de 17/11; o
--                                  Excel só tem o «pai» —, Eletrodomésticos 7, os 7 CAT/TESTE e o resto)
--   Com referências ......... 96  (legados 89, demo 6, novos 1; linhas: orçamentos 164, negócios 165,
--                                  vista do cliente 164, compras 20, receções 20, leituras 20,
--                                  guias 4, movimentos de stock 6)
--   Só se arquivam os com referências porque cada documento continua a mostrar o nome sem o produto ativo (lido a 26/11):
--   quote_lines.descricao_snapshot, negocio_produtos.nome, purchase_order_items.description e supplier_delivery_note_lines.
--   description estão preenchidos em todas as linhas destes produtos (G3 volta a exigi-lo); a RLS de products (products_select)
--   não filtra is_deleted, por isso os ecrãs que juntam products(name, sku) — orçamento, compras, receções — continuam a ler o
--   produto arquivado; a Emylia lê o nome guardado no negócio (neg_ler_negocios, fn_neg_ler_orcamento) e na vista do cliente.
-- Por subcategoria: (sem categoria) / - 7; Acessórios de Casa de Banho / Toalheiros 1; Bancadas de Cozinha /
--   laminados 6; Duche & Banho / Bases Duche 25; Duche & Banho / Chuveiro Higiénico 3; Duche & Banho / Colunas Duche
--   3; Duche & Banho / Resguardos de Duche 27; Eletricidade / - 2; Eletrodomésticos / Exaustores 2; Eletrodomésticos
--   / Máquinas lavar loiça 3; Eletrodomésticos / Placas 2; Eletrodomésticos / Ventax 1; Janelas / - 1; Janelas /
--   Janelas PVC 1; Loiças Sanitárias / Bidés 1; Loiças Sanitárias / Kit´s para Sanitários 3; Loiças Sanitárias /
--   Sanitas 3; Materiais / - 10; Mobiliário & Componentes Cozinha / Armários Inferiores 67; Mobiliário & Componentes
--   Cozinha / Armários superiores 1; Móveis & Arrumação Casa de Banho / Espelhos 1; Móveis & Arrumação Casa de Banho
--   / Móveis de lavatório 1; Portas / Portas Interiores 4; Revestimentos / Cerâmico 1; Revestimentos / Porcelânico
--   3; Torneiras & Misturadoras / Torneira Lavatório 1
--
-- O QUE NÃO FAZ: não apaga nada (nenhum DELETE), não muda SKU (nenhuma chamada a cat_gerar_sku_produto; C2 exige 0 SKU
-- alterados), não mexe em nome, estado, preços, atributos, códigos, organização, stock, famílias nem modelos, não toca em
-- product_family_members, não reaponta nem altera orçamentos, negócios, compras, receções, receitas nem a vista do cliente (C8),
-- não arquiva códigos de produto (product_codes; como as RPC do Catálogo). Nenhum produto fora da lista muda (C3).
-- EXCEÇÕES à letra do Excel (ficam ATIVOS; lista com o motivo em mudelar-audit/onda4/fora.csv):
--   145 consumivel CONS-: esta nas receitas dos servicos (service_materials) e nunca esteve no Excel de vendas
--    46 a onda 1 reconheceu-o como o produto de uma linha do Excel (renomeacao/descricao): fica
--    27 a onda 2 reconheceu-o como gemeo de um legado com linha no Excel (o mesmo artigo): fica
--     3 encomenda a fornecedor por receber (PO-2026-0012:pending): a rececao por leitura (rpc_receiving_lookup)
--   ignora produtos arquivados
--     2 possivel renomeacao recusada na onda 1 (semelhanca 0,75 < 0,8) e a onda 3 nao criou a linha: arquivar
--   deixava o Excel sem produto; resolver a mao
--   O produto numa família (ACB-T-0013-B, Toalheiro ELETRICO HOT BRANCO) está entre os gémeos da onda 2: fica, e a família
--   não se mexe.
--
-- GUARDAS (falham a migration inteira; nada fica): G0 a Mudelar existe (senão NOTICE e sai); L1 as listas têm os números do
-- cabeçalho; G1 contagens de partida (32327 produtos vivos, 548 famílias, 14637 membros); G2 cada produto existe, é da Mudelar,
-- está vivo, tem o SKU esperado, não é CONS-, não está em família nem em receitas, não tem encomenda a fornecedor por receber nem
-- stock; G2b as referências são as lidas (com e sem referências); G3 todas as linhas de documento destes produtos têm o nome
-- guardado; G3b nenhuma referência noutras tabelas (modelos, pacotes, configuradores, adendas, vendas diretas, contagens...);
-- G4 as ligações são todas as vivas destes produtos; G5 o utilizador da auditoria é membro ativo e app.audit_bypass desligado;
-- G6 os eixos das famílias têm valores distintos. Se já aplicada (os 180 arquivados por esta onda e a cópia existe), sai por NOTICE.
-- Lock: pg_advisory_xact_lock(hashtextextended('cat_familias:' || org, 0)) e os produtos FOR NO KEY UPDATE por ordem.
-- CONFERÊNCIAS no fim: C1 nos produtos e nas ligações só mudou o arquivo (e products.supplier_id, limpo pelo gatilho); C2 0 SKU
-- alterados; C3 produtos fora da lista iguais (sem updated_at) e vivos = 32327 − 180; C4 preços, atributos, códigos e organização
-- iguais; C5 ligações fora da lista iguais; C7 famílias (548 / 14637, impressão digital e eixos distintos); C8 documentos e
-- receitas iguais; C9 nada escrito fora da Mudelar (xmin); C10 a cópia fechada; C12 uma linha de auditoria por escrita.
--
-- CÓPIA E REVERSÃO: o estado antigo fica em _mudelar_excel.onda4_produtos e _mudelar_excel.onda4_item_suppliers (só postgres).
-- REVERSÃO fora da pasta das migrations (estar aqui é ser aplicada): mudelar-reverter-onda4.sql, guardado com o trabalho; repõe
-- is_deleted=false e limpa deleted_at/deleted_by, e não repõe (lista-os) os produtos cujo código de barras esteja entretanto
-- noutro produto ativo (fn_products_barcode_guard). Para a aplicar, entra como uma migration nova.
--
-- ORDEM: depois de 20270129700000 (última no remoto RH a 26/11). `supabase db push` aplica TUDO o que estiver pendente:
-- listar com `supabase migration list --linked` imediatamente antes e empurrar só esta.
-- =============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

-- ─── 1. A lista fechada (tabelas temporárias: desaparecem no COMMIT) ───────────────────────────────
-- os produtos a arquivar: id, SKU lido a 26/11 e se têm referências em documentos
CREATE TEMP TABLE _o4_prod (id uuid PRIMARY KEY, sku text NOT NULL, com_refs boolean NOT NULL) ON COMMIT DROP;
INSERT INTO _o4_prod (id, sku, com_refs) VALUES
  ('2606fcb5-d13d-41e3-8036-a520e059bb2e', 'ACBT0009', true),
  ('9ed1a7fd-ede8-435c-9d94-70e1a75da420', 'BCL0009', true),
  ('c5709cbb-40c2-4c3e-ad9d-40204ba07a17', 'BCL0012', true),
  ('6ff41cf0-8c26-4cd3-9d43-9bb321f92982', 'BCL0024', true),
  ('2c831e03-879a-4da8-9dcd-d833f8a652b5', 'BCL0031', true),
  ('4a88c460-fbd8-4a35-8212-c193e6a46337', 'BCL0032', true),
  ('6de260f5-d432-48dd-82a1-a0368ef2a959', 'BCL0035', true),
  ('5a0004f2-2f9b-451e-a6ca-8143310a23de', 'CAT-1166F09B15', false),
  ('cc8e107a-9c28-4b63-9fa5-e811cbfaeead', 'CAT-221947827E', false),
  ('a16adc82-ff4a-49cc-b8cc-e84afc5596d8', 'CAT-4D5DAD9BFD', false),
  ('82544d56-c9e3-462c-845b-e037985fe9ba', 'CAT-9C4A5740C8', false),
  ('bd0b159f-100c-4961-93c9-26f4d117eaa5', 'CAT-D2C5D89DF2', false),
  ('3d90c0e2-40da-4038-b47b-4c4f0a0c1b08', 'CAT-E67C9ACA62', false),
  ('d57d624c-b197-4706-9cc2-4e8f84e79e74', 'DBBD0006', true),
  ('aa387792-8725-4c8e-b07b-f25bf568732b', 'DBBD0007', true),
  ('2be4b391-2840-4551-a06f-1c1828653703', 'DBBD0008', true),
  ('648fd4b0-4b1a-44e1-8dcc-cea8589af2a1', 'DBBD0011', true),
  ('945df034-eb68-4e75-9773-1769bd4c0d76', 'DBBD0012', true),
  ('50e90cf1-579b-4822-9cf0-6620481ca9eb', 'DBBD0023', true),
  ('2625e824-90c6-4e5b-a98e-ed9a072f7017', 'DBBD0024', true),
  ('9c056989-2e1a-41c4-8a32-5f47bd37676c', 'DBBD0026', true),
  ('10c394d5-3917-4590-ae2f-5735b1a9a470', 'DBBD0027', true),
  ('722c99d6-9d8b-463e-87e8-23d51aea4c24', 'DBBD0036', true),
  ('504da782-ca35-422e-8704-3205d8b07cf0', 'DBBD0040', true),
  ('ab482c9e-c3ea-411b-8188-ad238ed4c669', 'DBBD0042', true),
  ('3a25e8df-5fa0-42c8-a4f8-6b1102867013', 'DBBD0043', true),
  ('b3a7a64e-8c77-4851-ac15-199c66d56dec', 'DBBD0044', true),
  ('a27f2e3e-0d2f-466d-8a0b-d163994b4ea0', 'DBBD0049', true),
  ('65df2133-1e78-44ee-9b6b-22c177c0d7d2', 'DBBD0051', true),
  ('b3de4f15-59f7-4dbb-9b94-af82a23d9997', 'DBBD0067', true),
  ('b26b2488-50e5-4350-b6dd-237c9d93038e', 'DBBD0088', true),
  ('41e51722-ba12-43f1-baf0-4c8e554f7a3e', 'DBBD0098', true),
  ('5a193607-0aa9-4570-8e49-44050e745c19', 'DBBD0111', true),
  ('6fa1fe8a-e7d6-4ea6-8e91-70b3a85f8121', 'DBBD0112', true),
  ('888d2e14-afdc-42e9-914c-875be110452b', 'DBBD0137', true),
  ('4a99b5a3-7c38-4b47-ad81-46204c2b888b', 'DBBD0143', true),
  ('0d45564a-6a7c-4366-ba10-98dcc20c1e02', 'DBBD0151', true),
  ('34940d71-c357-4dd4-b127-7c4a5cf69c34', 'DBCD0002', true),
  ('071f1a1e-b4c1-4ddb-9413-44695cca6ee0', 'DBCD0008', true),
  ('bf972bf6-5303-47a2-b361-dac18dd46139', 'DBCD0013', true),
  ('5717db94-7533-44cd-9f16-56798a2735e1', 'DBCH0001', true),
  ('4e37d403-529d-4c2f-84a5-2160c91f7a5a', 'DBCH0002', true),
  ('9b4af191-8453-4174-b0e5-25bcf36ad247', 'DBCH0003', true),
  ('a452868a-a058-4f9a-815f-a4802564bad3', 'DBR0006', true),
  ('eed2753e-c701-4737-9622-0b76aef7a459', 'DBR0009', true),
  ('4cac23a3-61f9-4505-95ee-41dbb4319258', 'DBR0011', true),
  ('8a7e0063-9206-4cb4-aab0-506391d8bbb6', 'DBR0014', true),
  ('8f948937-40d9-4c7d-a64b-9a50c5b4fe1d', 'DBR0016', true),
  ('24607db2-be9c-4728-bdae-5fe6eb9319a1', 'DBR0019', true),
  ('dc20902d-710e-4190-b7a3-4c9c9632fb2f', 'DBR0021', true),
  ('d46f4f85-5999-4219-b268-2770d398be8e', 'DBR0022', true),
  ('cbacb87b-22cb-4a28-a07c-f41476cc3ac8', 'DBR0024', true),
  ('a7da91fd-a7a5-4a35-bf86-a71dcda74d84', 'DBR0026', true),
  ('2509f7ef-7bf9-4647-90d9-42b5f23baf4a', 'DBR0031', true),
  ('9918a897-dadc-497f-9d1f-c8bf7bbbfe6e', 'DBR0033', true),
  ('04c2f0e4-d7b1-4b28-91aa-2a47c603192d', 'DBR0044', true),
  ('3749773d-fef2-4f19-a2d9-a946e7c4179f', 'DBR0049', true),
  ('4dbd1e40-4e7f-4828-b997-7df19eaf293c', 'DBR0054', true),
  ('61058016-6093-416e-9424-aa09feb2731a', 'DBR0100', true),
  ('890c6d8f-a13e-4ec9-99fb-95e5d5ca4fb8', 'DBR0101', true),
  ('d2537f3d-606c-4fe9-8609-238fcf4895b9', 'DBR0117', true),
  ('f0d50548-c6dd-457f-989f-0f5f206add50', 'DBR0118', true),
  ('f2a51bd6-deb3-4fc4-a245-345dc08aa41a', 'DBR0139', true),
  ('0dc9f767-06fc-4ec2-a5fe-37e455d880bf', 'DBR0154', true),
  ('7864a211-a5dc-4a86-8dc2-552dd0b79942', 'DBR0157', true),
  ('164ae0d9-04db-4c39-bead-3ae13b2ecfd9', 'DBR0253', true),
  ('4d31d645-34a2-4929-acc8-7f1c7f23a52f', 'DBR0254', true),
  ('9a04dff9-5e6e-488a-b9bd-4ac5dfc929b7', 'DBR0255', true),
  ('a5e4aee7-138f-4007-9296-da5728eebb3e', 'DBR0257', true),
  ('b4b8d7c6-9027-49a0-a6a6-33366ee6e6df', 'DEMO-BD-80120', true),
  ('b6768a2f-7510-4c65-adb9-19fbe7d4e90e', 'DEMO-ES-8070', false),
  ('32342819-64d4-42a1-84a4-f8fb4b1f808a', 'DEMO-MV-80', true),
  ('c6bc7683-01e2-4994-b83e-09f1f0f75d7f', 'DEMO-PV-6060', true),
  ('92da626f-b784-4ebc-9ad8-a49a65edcffd', 'DEMO-RG-120', false),
  ('32266ac8-2aed-4d00-b796-f8c62801dc97', 'DEMO-RV-3060', true),
  ('1e2efd7b-f797-4b49-9562-9ccbfb65a596', 'DEMO-SN-SUSP', true),
  ('8d026fb0-2287-43a1-9e96-ad9911f854f5', 'DEMO-TL-MONO', true),
  ('50f4bc52-f9d4-4311-9755-922badbabe46', 'EL-EX-0001', false),
  ('f52bbc76-a1f1-4b08-8838-572665faf037', 'EL-EX-0008', false),
  ('b03d6e45-487a-4adf-bd93-95b24fd05303', 'EL-MLL-0001-45', false),
  ('23987228-53c3-44a0-8c97-7f788b18a8e7', 'EL-MLL-0002', false),
  ('aa35a10d-b228-418d-933a-13fcb8f2a64b', 'EL-MLL-0004-45', false),
  ('98b724e0-72dd-4b56-9255-e71a969d8c83', 'EL-PL-0001-80', false),
  ('a0f08435-011c-419c-8a5f-4961aad81ee0', 'EL-PL-0007', false),
  ('15810572-56cb-4476-b2a1-1d5c489a6b70', 'EL-VN-0001', true),
  ('0be5cd28-42dc-47ee-bdf6-c151416dc8aa', 'JJPVC0003', true),
  ('aec7ec3e-8180-4bcd-a6ff-6d5e9c5fedab', 'JJPVC0008', true),
  ('84d7e741-7400-4cfd-bcfc-13464f474be3', 'LSB0002', true),
  ('9af29dd4-07f0-4a8a-be41-5744f5c3b0f8', 'LSKS0001', true),
  ('0173bcf2-99c5-42a8-befa-d0ba83fc704a', 'LSKS0003', true),
  ('4b5ffaf8-d004-498b-b893-e7b052f21f81', 'LSKS0014', true),
  ('093aa199-572c-48a0-83a8-222e895bd8b7', 'LSS0015', true),
  ('e5b96a62-7037-4642-8d3c-bb6b0077b740', 'LSS0028', true),
  ('b8e1df47-9f6d-4746-a779-9207b2e604e5', 'MCC-AI-0004-VC-0A30', false),
  ('77abe5b5-09e5-4834-b956-a80ddc40287a', 'MCC-AI-0004-VC-100', false),
  ('f0616153-943a-4ea4-9f55-82bd7281de85', 'MCC-AI-0004-VC-30', false),
  ('1c16c57c-e99e-41ac-9a02-383901373021', 'MCC-AI-0004-VC-31A40', false),
  ('53c8b72d-e7a8-420b-9f0c-31fcd23a8f53', 'MCC-AI-0004-VC-40', false),
  ('0213fbbe-b778-4490-b1cb-8aab80799a7e', 'MCC-AI-0004-VC-41A50', false),
  ('3a1f024c-ba23-4e1e-b1d0-81217536d963', 'MCC-AI-0004-VC-50', false),
  ('dc284ec5-4443-413a-b889-6cea11a6b163', 'MCC-AI-0004-VC-51A60', false),
  ('1683ef6f-179c-4292-9f79-b996a0a173f6', 'MCC-AI-0004-VC-60', false),
  ('97087fbb-f39e-49da-8e85-b5c1a4051748', 'MCC-AI-0004-VC-61A70', false),
  ('b4a263b3-f500-479d-8267-97a1184177b6', 'MCC-AI-0004-VC-70', false),
  ('a554a0b1-4d52-4a18-be9c-95a5e6d5330b', 'MCC-AI-0004-VC-71A80', false),
  ('3a1e1692-bc9c-4088-ab33-346550a398f2', 'MCC-AI-0004-VC-80', false),
  ('94da87b9-8164-4f73-a31d-010bbfb9df36', 'MCC-AI-0004-VC-81A90', false),
  ('225b3744-eb2c-4ed3-82d2-8ef6ea4ad712', 'MCC-AI-0004-VC-90', false),
  ('829bca18-ac54-4144-b7a4-ad5423d4a206', 'MCC-AI-0004-VC-91A100', false),
  ('edb9fc14-a8cb-4092-8998-36aabde78c11', 'MCC-AI-0004-VNR-0A30', false),
  ('ee45510f-29b0-4a22-8f2b-138f8bad237a', 'MCC-AI-0004-VNR-100', false),
  ('9b0bb375-91d3-4d1e-ba3c-857bf3e40b91', 'MCC-AI-0004-VNR-30', false),
  ('98903cc9-72cd-49d8-97fa-33481030025d', 'MCC-AI-0004-VNR-31A40', false),
  ('f723a57d-0fe3-4f19-9c76-9c62f52f6cf4', 'MCC-AI-0004-VNR-40', false),
  ('8cd14e2d-ab49-4d2d-b5eb-0c545b864472', 'MCC-AI-0004-VNR-41A50', false),
  ('2fc0c989-3f98-4583-8cba-a56d4d14b869', 'MCC-AI-0004-VNR-50', false),
  ('3fb20ac0-e12b-4287-bdea-b439314abb58', 'MCC-AI-0004-VNR-51A60', false),
  ('0b25666f-be0e-42dc-a086-230fec138d82', 'MCC-AI-0004-VNR-60', false),
  ('3dc38010-d1bf-4721-9f21-9e45420d3d5e', 'MCC-AI-0004-VNR-61A70', false),
  ('f7479962-325e-48eb-a238-431598ba248e', 'MCC-AI-0004-VNR-70', false),
  ('824ebc69-4f13-426c-be6b-ae393fb571db', 'MCC-AI-0004-VNR-71A80', false),
  ('4051e589-0900-4c2c-b807-1e00fc739e47', 'MCC-AI-0004-VNR-80', false),
  ('b203d34c-fea9-4ae0-b299-b5519a2657be', 'MCC-AI-0004-VNR-81A90', false),
  ('426bfb1f-75d2-4a91-a248-e84bb2563418', 'MCC-AI-0004-VNR-90', false),
  ('91f2ea4d-5dd9-4fba-8cf4-39434d0a95d0', 'MCC-AI-0004-VNR-91A100', false),
  ('97fa5666-df96-4447-9c53-8c86169427ed', 'MCC-AI-0005-VC-0A30', false),
  ('bed9636c-45a9-4899-86f7-e1b3fc362f33', 'MCC-AI-0005-VC-100', false),
  ('808b20da-5694-4ae1-bf28-548c613c1d0a', 'MCC-AI-0005-VC-30', false),
  ('c8d08cb4-1a1d-477c-8cf4-97bddb43f2fe', 'MCC-AI-0005-VC-31A40', false),
  ('8edf7b1e-179a-48e6-9119-5ace36f06869', 'MCC-AI-0005-VC-40', false),
  ('0c176751-2301-4b13-b33c-5bd4df8c335f', 'MCC-AI-0005-VC-41A50', false),
  ('87868c10-c470-42b8-956f-ca25dbeffe45', 'MCC-AI-0005-VC-50', false),
  ('67d1d324-8190-470f-9dc8-18bf179c6631', 'MCC-AI-0005-VC-51A60', false),
  ('11e08fd9-9761-4830-a753-db54f59fe07f', 'MCC-AI-0005-VC-60', false),
  ('63d4815c-7848-4d50-9dc1-d5473461b190', 'MCC-AI-0005-VC-61A70', false),
  ('e7576f79-88c6-48a9-bb58-7035688de1e2', 'MCC-AI-0005-VC-70', false),
  ('f33b641d-f9f2-42fe-8173-b8e023968130', 'MCC-AI-0005-VC-71A80', false),
  ('a43e6bb4-bca0-4601-a6c1-00aea64720ab', 'MCC-AI-0005-VC-80', false),
  ('4c6837bb-06ee-4ccd-9046-fb3e33b7bbf4', 'MCC-AI-0005-VC-81A90', false),
  ('d61b7ed5-f779-48ec-9414-bc871506d1bf', 'MCC-AI-0005-VC-90', false),
  ('9e6849cf-260c-49a0-914c-2e445cb7845c', 'MCC-AI-0005-VC-91A100', false),
  ('c813509b-6470-4c68-93c3-59b7c0c23cd6', 'MCC-AI-0005-VNR-0A30', false),
  ('fd196961-9de8-45c4-a72f-0eac1cd96732', 'MCC-AI-0005-VNR-100', false),
  ('00ab3fb3-d859-4954-8677-566a9661af63', 'MCC-AI-0005-VNR-30', false),
  ('9fd1e8a2-19c9-4568-b768-4703d5e13511', 'MCC-AI-0005-VNR-31A40', false),
  ('baef0ef9-810a-47db-89be-249ac88750f7', 'MCC-AI-0005-VNR-40', false),
  ('035a81f1-b89e-4ca6-a4e1-143d3a13c9d7', 'MCC-AI-0005-VNR-41A50', false),
  ('5dad4520-6d54-44ac-b69b-80839320f73e', 'MCC-AI-0005-VNR-50', false),
  ('c481184e-bc94-4a68-bdb4-02b42ff05c50', 'MCC-AI-0005-VNR-51A60', false),
  ('03184398-f978-4665-97a3-10d7999443e3', 'MCC-AI-0005-VNR-60', false),
  ('014a77bb-2e2d-46fc-92b3-0f79713a7da9', 'MCC-AI-0005-VNR-61A70', false),
  ('d4c4429c-5955-4a8b-9c81-786ae3c5d4ce', 'MCC-AI-0005-VNR-70', false),
  ('71be9321-3bf3-4933-9829-d054ddf4dfbe', 'MCC-AI-0005-VNR-71A80', false),
  ('1d6ef1dc-5808-4b80-be97-d7b911d3b598', 'MCC-AI-0005-VNR-80', false),
  ('11c89f13-c0ea-4f12-af0f-8a91163c70d8', 'MCC-AI-0005-VNR-81A90', false),
  ('f77ad617-2e0f-45a7-9777-24e5db7d16dd', 'MCC-AI-0005-VNR-90', false),
  ('143f3398-fc95-4060-bb65-efa9aaf1a9e1', 'MCC-AI-0005-VNR-91A100', false),
  ('2df706f9-9bcc-4ec2-9dc7-165ee0d0ec6d', 'MCC-AI-0006', false),
  ('00e4a0e2-d493-4ef5-9540-17f68afc886f', 'MCC-AI-0006-VC', false),
  ('b076d549-08b1-483e-99da-d3508e4d6735', 'MCC-AI-0006-VNR', false),
  ('67af3d69-4a39-41ee-bef3-ad4a62277bcb', 'MCC-AS-0011', false),
  ('a2564f62-bb11-4da0-b346-8064f7bc010e', 'MGM0', true),
  ('bea499d9-f7c3-4a59-86a9-42041626682a', 'MGM0001', true),
  ('1e2c551b-f5c3-40b2-9ab7-569cebba244b', 'MGM013', true),
  ('c89fb44e-3c21-4863-ad5c-735a1b196e7a', 'MGM1', true),
  ('bb9436f1-01b9-44f5-9c14-3ced1eb9bd91', 'MGM12', true),
  ('03939749-f2d3-493e-9c1d-98bb69e7a667', 'MGM13', true),
  ('97d9a78c-4684-4c95-ab57-777427a24223', 'MGM18', true),
  ('7fe88130-c5d5-4fe7-aa2d-86d80d57388d', 'MGM23', true),
  ('7adfdd05-4103-496f-89a8-ed27b1025a31', 'MGM5', true),
  ('e5fa629d-da3e-42a2-9c38-8f9840921212', 'MGM6', true),
  ('177f3ee1-ad35-4c8f-8ed0-80b893d2e5c4', 'MGM7', true),
  ('17a20471-b4e6-4016-add2-bf919cb55d98', 'MGM8', true),
  ('e2fcc084-b063-45d6-8f41-47aa8d762aac', 'PPI0001', true),
  ('44923e1f-62b5-49c3-a75e-83338e9eb8ec', 'PPI0002', true),
  ('32dde84c-63d5-4017-892d-3e9a167fc70e', 'PPI0003', true),
  ('4abed430-974b-47ba-95fd-5b2abfd97386', 'PPI0004', true),
  ('e99f3c50-fba1-4fa3-8f8f-0236d7f68465', 'RP0064', true),
  ('21914387-80f1-4727-9d2b-9ee0b4fd0039', 'RP0065', true),
  ('b0d40f82-9e8a-40ac-973d-24c77738efe7', 'TESTE-EMY-SIL', false);

-- as ligações a fornecedores vivas desses produtos (todas)
CREATE TEMP TABLE _o4_isup (id uuid PRIMARY KEY, product_id uuid NOT NULL) ON COMMIT DROP;
INSERT INTO _o4_isup (id, product_id) VALUES
  ('00743b0f-b505-4b21-877c-eb4e21c3bc70', '11c89f13-c0ea-4f12-af0f-8a91163c70d8'),
  ('00de0eff-c921-42a9-8710-895c085468a6', '8cd14e2d-ab49-4d2d-b5eb-0c545b864472'),
  ('02260d86-a2cb-468e-9b07-fff96aaec0c9', 'bed9636c-45a9-4899-86f7-e1b3fc362f33'),
  ('06446fe3-4782-4ee4-a459-0e951451080a', 'd61b7ed5-f779-48ec-9414-bc871506d1bf'),
  ('0667d3fc-d015-4cac-8998-765b53f9af41', '945df034-eb68-4e75-9773-1769bd4c0d76'),
  ('06dd3944-3b50-490a-a778-d7209f4d6f06', '4a88c460-fbd8-4a35-8212-c193e6a46337'),
  ('07d290bd-cac0-4b5f-8b8d-ffa6d382220c', 'b8e1df47-9f6d-4746-a779-9207b2e604e5'),
  ('0a2c2a2f-e610-4195-80af-2ae73854259a', '23987228-53c3-44a0-8c97-7f788b18a8e7'),
  ('0b430a04-6c56-4e4e-b7e3-613e560cd4af', '4051e589-0900-4c2c-b807-1e00fc739e47'),
  ('0c0c2000-a5b0-446f-adc6-f409b1b0bf46', '97fa5666-df96-4447-9c53-8c86169427ed'),
  ('0cd3a81d-26a2-414d-ab45-040b1ec8b1a1', '97087fbb-f39e-49da-8e85-b5c1a4051748'),
  ('0e1922d4-59f6-4c2d-a28b-cdb782bcc381', 'b0d40f82-9e8a-40ac-973d-24c77738efe7'),
  ('0eba4e9f-06d1-4f8f-9575-e225b74b08c4', '94da87b9-8164-4f73-a31d-010bbfb9df36'),
  ('0f4ec886-7d7e-467a-855e-af2c100636c1', '3dc38010-d1bf-4721-9f21-9e45420d3d5e'),
  ('0f872108-a5fd-449f-844c-0b948b55a92c', '143f3398-fc95-4060-bb65-efa9aaf1a9e1'),
  ('12810688-ddf3-4b83-9365-8ac2924fce50', '03939749-f2d3-493e-9c1d-98bb69e7a667'),
  ('1479b524-7864-4bd5-b1fe-0a49468a6c9a', '8a7e0063-9206-4cb4-aab0-506391d8bbb6'),
  ('15a8d718-08c1-4030-bb8d-510707748f6c', '67af3d69-4a39-41ee-bef3-ad4a62277bcb'),
  ('16b403bf-e0e5-4b46-9552-46811cfac6ae', '9b4af191-8453-4174-b0e5-25bcf36ad247'),
  ('16f13c63-49f4-4506-bee9-af3148fa20bb', 'f33b641d-f9f2-42fe-8173-b8e023968130'),
  ('17fee66d-a427-4f31-978e-8be3b0f494ff', 'a43e6bb4-bca0-4601-a6c1-00aea64720ab'),
  ('19f171b4-4898-49c3-8c9c-1a2ca81a15e6', 'ee45510f-29b0-4a22-8f2b-138f8bad237a'),
  ('1a7e22af-6670-4677-bdab-1e343a467b51', '7fe88130-c5d5-4fe7-aa2d-86d80d57388d'),
  ('1ceacab6-b1a9-44f3-b4bb-7780f338be36', '4d31d645-34a2-4929-acc8-7f1c7f23a52f'),
  ('1e7bfe80-de01-457f-b3bd-6310eb0eb296', '3a1f024c-ba23-4e1e-b1d0-81217536d963'),
  ('1fc08908-2b16-45be-a96f-88df30be3990', 'bf972bf6-5303-47a2-b361-dac18dd46139'),
  ('21d4e1d0-0dd4-4f4d-b4c7-550b4026e982', 'e99f3c50-fba1-4fa3-8f8f-0236d7f68465'),
  ('24ffe99d-7cef-4cb9-9f8c-f2b860f8b550', '2606fcb5-d13d-41e3-8036-a520e059bb2e'),
  ('2631a88b-b9d1-42f7-b3a3-5e7b9e1cb6a5', 'c5709cbb-40c2-4c3e-ad9d-40204ba07a17'),
  ('268f585a-cbe7-481b-b801-1d0c312a0ed2', 'c813509b-6470-4c68-93c3-59b7c0c23cd6'),
  ('2752d416-d459-4b8f-9e9d-ca06246a548b', 'edb9fc14-a8cb-4092-8998-36aabde78c11'),
  ('2828bb7d-8b6b-492c-acb3-6b46bf7726b0', 'f7479962-325e-48eb-a238-431598ba248e'),
  ('295eb6b3-ddfa-4750-97c2-0e8bcd2585d7', '2c831e03-879a-4da8-9dcd-d833f8a652b5'),
  ('29a80fc2-4a1a-4a35-825b-4d08db695b6a', 'b3de4f15-59f7-4dbb-9b94-af82a23d9997'),
  ('2b1f2886-46e2-4213-aafd-d693e2856ef0', 'b4a263b3-f500-479d-8267-97a1184177b6'),
  ('2bb76edf-33d8-4543-8b48-bcb25bc4e579', '177f3ee1-ad35-4c8f-8ed0-80b893d2e5c4'),
  ('2ec3db53-69be-44c7-8d2e-2be3ebdd835d', '1683ef6f-179c-4292-9f79-b996a0a173f6'),
  ('2f693c6c-357b-4cd8-aea3-87c381a697ff', '890c6d8f-a13e-4ec9-99fb-95e5d5ca4fb8'),
  ('307b607b-db3f-43a3-9c76-076fb2dcccf9', '3749773d-fef2-4f19-a2d9-a946e7c4179f'),
  ('3351024d-77c0-42ea-8234-c2126b2aaa34', 'd46f4f85-5999-4219-b268-2770d398be8e'),
  ('33fd7b39-7b8d-4da1-a4bc-5e1c0f0b0a3c', '2df706f9-9bcc-4ec2-9dc7-165ee0d0ec6d'),
  ('3631f7df-3ccc-4002-a237-bb08e08ab420', 'e5fa629d-da3e-42a2-9c38-8f9840921212'),
  ('3818b030-7738-4d84-ae30-cb270f3f2676', '4a99b5a3-7c38-4b47-ad81-46204c2b888b'),
  ('40370dc7-c1eb-4051-b0c7-31570a43b735', '61058016-6093-416e-9424-aa09feb2731a'),
  ('4071528d-7e4c-4d50-a653-36b485b28101', '97d9a78c-4684-4c95-ab57-777427a24223'),
  ('40cc05a5-3f4e-4f1e-bc16-a0ae63546df7', '84d7e741-7400-4cfd-bcfc-13464f474be3'),
  ('41889580-8bf6-472d-b807-db8ebb570220', '24607db2-be9c-4728-bdae-5fe6eb9319a1'),
  ('424be7b8-944b-4e13-b541-2482feec5048', '04c2f0e4-d7b1-4b28-91aa-2a47c603192d'),
  ('42e92bfe-b492-4906-9dea-13b69947b737', '8d026fb0-2287-43a1-9e96-ad9911f854f5'),
  ('42f973cd-7dc3-4bae-b1b8-8daae4161ae9', '50e90cf1-579b-4822-9cf0-6620481ca9eb'),
  ('432c728f-a3e8-4ae3-9175-f2e335075fe9', 'b076d549-08b1-483e-99da-d3508e4d6735'),
  ('43e213b7-9d9e-4b1d-8414-aec055a135ac', '093aa199-572c-48a0-83a8-222e895bd8b7'),
  ('4467c90d-3f6b-41c9-b65c-e71461d4c317', '0d45564a-6a7c-4366-ba10-98dcc20c1e02'),
  ('4933aed4-95f7-4d5d-a83a-f39903e7308b', '65df2133-1e78-44ee-9b6b-22c177c0d7d2'),
  ('4c862636-04e4-439b-8b75-d3cd0c8293ab', '91f2ea4d-5dd9-4fba-8cf4-39434d0a95d0'),
  ('4cc5eb72-ed67-4ef9-9ac9-aff5685bc7b0', 'e7576f79-88c6-48a9-bb58-7035688de1e2'),
  ('4cfa5bf4-86e5-48ef-b112-d892dcb5d07c', 'c8d08cb4-1a1d-477c-8cf4-97bddb43f2fe'),
  ('50c4d288-eae0-42f7-be27-2bc0b2ea7436', '3fb20ac0-e12b-4287-bdea-b439314abb58'),
  ('527292be-5c5b-49ca-a32c-0ff790b02eea', '9fd1e8a2-19c9-4568-b768-4703d5e13511'),
  ('5327c3f8-53aa-4297-9299-d735d1f60c55', '00e4a0e2-d493-4ef5-9540-17f68afc886f'),
  ('5362bf91-92b8-4fb1-bbf4-6aa0e25e26f9', 'a27f2e3e-0d2f-466d-8a0b-d163994b4ea0'),
  ('544497d9-fb2e-4545-8f6f-8f863e32bff6', '8edf7b1e-179a-48e6-9119-5ace36f06869'),
  ('54a8323d-c1f0-45ff-b43e-0938de69dfc6', '17a20471-b4e6-4016-add2-bf919cb55d98'),
  ('59dbbe4c-729e-48f4-acdf-bc300023e9b6', '4c6837bb-06ee-4ccd-9046-fb3e33b7bbf4'),
  ('5a8fecc8-538c-4889-89ba-ebb688a152ef', '6de260f5-d432-48dd-82a1-a0368ef2a959'),
  ('5ab1dcd6-3b1d-4ebd-9d29-c1e1b74e25fd', 'f723a57d-0fe3-4f19-9c76-9c62f52f6cf4'),
  ('5ad02d65-c7a8-4113-ac0c-61d7517ee41c', '03184398-f978-4665-97a3-10d7999443e3'),
  ('5c5bfcec-cfa5-42a9-adbe-1f5c09d58dee', '50f4bc52-f9d4-4311-9755-922badbabe46'),
  ('5f5b4da9-16b9-415e-a363-d9ae8ea93a23', '071f1a1e-b4c1-4ddb-9413-44695cca6ee0'),
  ('6043ff4d-2ef4-4ed7-b6aa-0d692b42c3f7', 'a7da91fd-a7a5-4a35-bf86-a71dcda74d84'),
  ('6179e179-6e14-426b-9ef1-9a685f2dca1a', '2625e824-90c6-4e5b-a98e-ed9a072f7017'),
  ('64c1b060-5d66-4dd5-b271-b7aa3ef55ae9', '41e51722-ba12-43f1-baf0-4c8e554f7a3e'),
  ('64eedd8f-ba20-409b-b253-a65b0824046e', '808b20da-5694-4ae1-bf28-548c613c1d0a'),
  ('664667f2-aa1d-4fa8-9d74-bc564a2c2ce7', '77abe5b5-09e5-4834-b956-a80ddc40287a'),
  ('675a1702-2bc4-410d-8c2d-581b619b5b4e', '0c176751-2301-4b13-b33c-5bd4df8c335f'),
  ('685c2ff3-58d1-4362-a6a2-0290044bbcca', 'd2537f3d-606c-4fe9-8609-238fcf4895b9'),
  ('691f10bc-c0e5-4e23-b9dc-88ccb248796b', '035a81f1-b89e-4ca6-a4e1-143d3a13c9d7'),
  ('6989141d-ac2e-4470-b9ca-78c4b76e7f34', 'cbacb87b-22cb-4a28-a07c-f41476cc3ac8'),
  ('6a156ab3-52d4-41b8-9096-2145d77483ff', '9ed1a7fd-ede8-435c-9d94-70e1a75da420'),
  ('6c7b4b22-26bb-4a09-99c9-5569d9ea91c2', 'eed2753e-c701-4737-9622-0b76aef7a459'),
  ('6e1f319e-ea63-4a5d-87ed-c63b382569ee', '92da626f-b784-4ebc-9ad8-a49a65edcffd'),
  ('70426079-151b-4f9f-8a37-69a535831a44', 'b203d34c-fea9-4ae0-b299-b5519a2657be'),
  ('7147516b-eaa7-4b36-8bde-cac9a0afdbdf', '1e2c551b-f5c3-40b2-9ab7-569cebba244b'),
  ('7148234b-62d4-46a2-9ea8-f6070f343279', '98903cc9-72cd-49d8-97fa-33481030025d'),
  ('74e172ad-679f-45b6-b45e-76b74e9a6338', '63d4815c-7848-4d50-9dc1-d5473461b190'),
  ('76d3379e-a573-4f1b-b431-70caf33b9cd1', '4e37d403-529d-4c2f-84a5-2160c91f7a5a'),
  ('79ea2092-e87f-4676-888a-1e6577f25b62', 'b03d6e45-487a-4adf-bd93-95b24fd05303'),
  ('7b9a6777-199d-427e-a1ac-77c5c494c473', '9e6849cf-260c-49a0-914c-2e445cb7845c'),
  ('7ca0c426-c770-4501-99e1-9c108541b507', 'bb9436f1-01b9-44f5-9c14-3ced1eb9bd91'),
  ('7cb294a1-8c42-4e29-b31a-0c9ce3fd37a4', '225b3744-eb2c-4ed3-82d2-8ef6ea4ad712'),
  ('7dad43d5-ed32-45d2-8fe0-a6ae572b3f9d', '00ab3fb3-d859-4954-8677-566a9661af63'),
  ('7f3daa47-839b-4d45-ad05-6451df2c753c', '87868c10-c470-42b8-956f-ca25dbeffe45'),
  ('8019b44c-1fa4-43ef-b19b-86a09bcd44e2', 'aa387792-8725-4c8e-b07b-f25bf568732b'),
  ('81943e93-f239-4de2-94ad-74068dac3a7f', 'dc284ec5-4443-413a-b889-6cea11a6b163'),
  ('835b1773-87cb-49a8-8ccb-873567a63d9e', 'b4b8d7c6-9027-49a0-a6a6-33366ee6e6df'),
  ('8478ee5b-9f96-4c5a-bef6-21dada27c32a', '829bca18-ac54-4144-b7a4-ad5423d4a206'),
  ('88715f36-798b-42c5-9b93-8e89635bf754', '9918a897-dadc-497f-9d1f-c8bf7bbbfe6e'),
  ('88820f19-f33b-4909-91be-1ea89a00bf62', '15810572-56cb-4476-b2a1-1d5c489a6b70'),
  ('88e5b7ea-6ae4-40e9-9b64-731702aec85f', '10c394d5-3917-4590-ae2f-5735b1a9a470'),
  ('8d6246b8-d884-4b09-81e1-d7a077c60a02', '11e08fd9-9761-4830-a753-db54f59fe07f'),
  ('9000490a-442d-4c74-8f25-347a79299ccc', '648fd4b0-4b1a-44e1-8dcc-cea8589af2a1'),
  ('924976f9-535a-4354-a256-c223be0d8f99', 'd57d624c-b197-4706-9cc2-4e8f84e79e74'),
  ('94144375-b3fa-43ac-9ffa-8b143f1a78ed', 'e2fcc084-b063-45d6-8f41-47aa8d762aac'),
  ('962d3623-7530-460d-8e1b-a1cfe84c0a31', '0be5cd28-42dc-47ee-bdf6-c151416dc8aa'),
  ('98fc3bb0-750d-4a5a-b762-9130ed4a10f0', '426bfb1f-75d2-4a91-a248-e84bb2563418'),
  ('99d2d183-e31c-48af-afeb-31d229041f8b', '7adfdd05-4103-496f-89a8-ed27b1025a31'),
  ('9a6eab10-38c5-4216-9002-cc378d06a903', 'bea499d9-f7c3-4a59-86a9-42041626682a'),
  ('9a7f6e80-ec9d-490a-aa6d-1cec7937b5a7', '3a25e8df-5fa0-42c8-a4f8-6b1102867013'),
  ('9b2e4cfe-e5c2-4601-aff8-566663a9db6c', 'e5b96a62-7037-4642-8d3c-bb6b0077b740'),
  ('9d46e1a6-1559-4869-917f-020d4e89b562', 'b26b2488-50e5-4350-b6dd-237c9d93038e'),
  ('9e12c571-c3af-49e0-bd5f-871033567fc7', 'f2a51bd6-deb3-4fc4-a245-345dc08aa41a'),
  ('a0a9c0ed-2f8e-4b6c-a513-5f53f7cca761', 'f0d50548-c6dd-457f-989f-0f5f206add50'),
  ('a307ab74-17d3-4bc1-9ee4-24cab6abfda6', '3a1e1692-bc9c-4088-ab33-346550a398f2'),
  ('a5523680-6664-41c5-a9c2-79b7d655b5f1', 'a0f08435-011c-419c-8a5f-4961aad81ee0'),
  ('a55d6966-d791-4131-b22f-a562abdc4da5', 'f52bbc76-a1f1-4b08-8838-572665faf037'),
  ('a68a11fd-92ae-4739-bf16-d49e6451ec4c', '0173bcf2-99c5-42a8-befa-d0ba83fc704a'),
  ('a6b5a027-9b3f-437f-a31e-a5125e755854', '21914387-80f1-4727-9d2b-9ee0b4fd0039'),
  ('aaee6991-3a5c-4160-8228-62f6806acfc1', 'a5e4aee7-138f-4007-9296-da5728eebb3e'),
  ('ac11af67-56c6-4214-bb01-d38279d81813', '722c99d6-9d8b-463e-87e8-23d51aea4c24'),
  ('ad4ac22d-7e3f-4e75-b3ef-fbca3e741cc9', '0dc9f767-06fc-4ec2-a5fe-37e455d880bf'),
  ('ad93ef4a-ecb2-4edf-b7cf-059b45924d70', '4cac23a3-61f9-4505-95ee-41dbb4319258'),
  ('afa4a0aa-d399-4563-9150-bcd838e5ccbf', 'dc20902d-710e-4190-b7a3-4c9c9632fb2f'),
  ('b3f51e35-605e-4925-920e-94138f6abff2', '2fc0c989-3f98-4583-8cba-a56d4d14b869'),
  ('b561648a-f056-47b9-8bf8-e45455d004e4', 'c89fb44e-3c21-4863-ad5c-735a1b196e7a'),
  ('b5810394-ef7f-41d3-9768-94a6c38bfc8a', '9b0bb375-91d3-4d1e-ba3c-857bf3e40b91'),
  ('b5b8cebb-e715-4179-b5f6-c72f744e6903', '4b5ffaf8-d004-498b-b893-e7b052f21f81'),
  ('b69b12f1-3a56-40d8-b5de-672572aef144', 'a2564f62-bb11-4da0-b346-8064f7bc010e'),
  ('b8c429cc-3864-4ff3-af8f-31b0f0427c1c', '32266ac8-2aed-4d00-b796-f8c62801dc97'),
  ('b91dc1fa-0a8a-4d33-a39f-52a02859584e', 'b6768a2f-7510-4c65-adb9-19fbe7d4e90e'),
  ('bc47e9c2-8af4-4565-a0ac-40ccec0bf0d8', 'aa35a10d-b228-418d-933a-13fcb8f2a64b'),
  ('bcaefbd4-05fb-4d91-a2b4-4d9826a78c53', '8f948937-40d9-4c7d-a64b-9a50c5b4fe1d'),
  ('be1b32ff-7e92-43cc-942f-c7fa6edd2e7d', '5717db94-7533-44cd-9f16-56798a2735e1'),
  ('beb60636-27b9-4f9f-a08b-fb64a6bac5c2', '71be9321-3bf3-4933-9829-d054ddf4dfbe'),
  ('c238d8df-a159-470c-8b2a-9a8afb7f898c', 'a554a0b1-4d52-4a18-be9c-95a5e6d5330b'),
  ('c287e30e-23b1-4cd3-baca-7eb4eefae2dd', '9c056989-2e1a-41c4-8a32-5f47bd37676c'),
  ('c2bc035c-05f9-4b73-b85a-51594fad149a', 'a452868a-a058-4f9a-815f-a4802564bad3'),
  ('c3144f0d-413d-4299-9367-83c669aa8847', 'b3a7a64e-8c77-4851-ac15-199c66d56dec'),
  ('c3f28566-12e4-4e9a-bf5c-486aeed3f7b0', '504da782-ca35-422e-8704-3205d8b07cf0'),
  ('c6be9738-67cb-4033-9b80-9d505032bb17', 'baef0ef9-810a-47db-89be-249ac88750f7'),
  ('c9581da5-751f-4851-82ac-932ff809dc49', '1d6ef1dc-5808-4b80-be97-d7b911d3b598'),
  ('cce274c8-276a-4e16-b5bc-250ca71e2d2c', 'fd196961-9de8-45c4-a72f-0eac1cd96732'),
  ('ccfea9d1-65e3-475d-8ac6-175e3758b22a', 'd4c4429c-5955-4a8b-9c81-786ae3c5d4ce'),
  ('d2461a9e-c8a8-4dc1-a032-2ed81ffb52ec', '6ff41cf0-8c26-4cd3-9d43-9bb321f92982'),
  ('d30ceb16-aaa4-4e18-892a-5c4df9fa6e4b', '888d2e14-afdc-42e9-914c-875be110452b'),
  ('d3325a50-9e72-4cc0-ad50-8751e618b922', 'f0616153-943a-4ea4-9f55-82bd7281de85'),
  ('d407a943-dd33-4c1e-8cdb-e28047088475', '014a77bb-2e2d-46fc-92b3-0f79713a7da9'),
  ('d5480770-8db2-4f1f-bdb4-9cb3ca1816b8', '32342819-64d4-42a1-84a4-f8fb4b1f808a'),
  ('d5aa61e8-b621-4c8f-bac1-ae82894c1dc3', '4abed430-974b-47ba-95fd-5b2abfd97386'),
  ('d6d8c5f0-f692-4b57-88da-c754ab43c3f0', '5dad4520-6d54-44ac-b69b-80839320f73e'),
  ('d774142b-1737-4a18-8a10-a04645e2c092', '1e2efd7b-f797-4b49-9562-9ccbfb65a596'),
  ('d81c5c61-4c06-4107-b0dc-ba3d2207f3fb', '53c8b72d-e7a8-420b-9f0c-31fcd23a8f53'),
  ('d95a910f-b89d-487f-a133-de9ae3dc2400', '164ae0d9-04db-4c39-bead-3ae13b2ecfd9'),
  ('da02cf20-cd7a-443a-994b-e1124ab14ca7', '824ebc69-4f13-426c-be6b-ae393fb571db'),
  ('da518280-c309-4c29-9c66-bb67759e4bdc', '1c16c57c-e99e-41ac-9a02-383901373021'),
  ('debd5abf-3478-4518-beaf-4d9b1b5cc3e1', '2509f7ef-7bf9-4647-90d9-42b5f23baf4a'),
  ('df39bd61-51ce-4a2f-9829-36593be710f0', '9a04dff9-5e6e-488a-b9bd-4ac5dfc929b7'),
  ('e3f34a5d-307d-4d0e-90af-d4f87a76ae11', 'f77ad617-2e0f-45a7-9777-24e5db7d16dd'),
  ('e4137bd9-c50d-4364-ae5f-68b618f0cb10', '6fa1fe8a-e7d6-4ea6-8e91-70b3a85f8121'),
  ('e6cd6411-c17a-4e38-8559-e95ce81103e1', 'c6bc7683-01e2-4994-b83e-09f1f0f75d7f'),
  ('e8bf826f-da04-4569-91fe-a73a3743b7e2', 'ab482c9e-c3ea-411b-8188-ad238ed4c669'),
  ('eb5589e6-e65a-48ab-b9a8-f0da38c51ad5', '2be4b391-2840-4551-a06f-1c1828653703'),
  ('eb7060ee-ee2e-4c3b-a02f-9e9b113d80e9', '0b25666f-be0e-42dc-a086-230fec138d82'),
  ('ebc90a21-538a-45cf-a33d-64818d51dc7d', '32dde84c-63d5-4017-892d-3e9a167fc70e'),
  ('ec9bb291-0be6-44ac-aa92-87a49fb23009', '7864a211-a5dc-4a86-8dc2-552dd0b79942'),
  ('f0433fa7-8d19-4cc9-b81d-25a216fa2d02', '4dbd1e40-4e7f-4828-b997-7df19eaf293c'),
  ('f15ed6d0-f220-4bb5-9ed7-62a9497ad1f8', '98b724e0-72dd-4b56-9255-e71a969d8c83'),
  ('f3516511-4c78-4367-986e-1f1bda844018', '34940d71-c357-4dd4-b127-7c4a5cf69c34'),
  ('f6e2a34f-dfd1-4d88-b7da-c55b4526300f', '67d1d324-8190-470f-9dc8-18bf179c6631'),
  ('f8b0303e-aa07-4a9e-8734-16cad6cc1df1', 'c481184e-bc94-4a68-bdb4-02b42ff05c50'),
  ('f9779860-851b-4fff-9498-91936521c4e7', '5a193607-0aa9-4570-8e49-44050e745c19'),
  ('fbe0d575-0275-45b1-87a4-d46c83d903d3', '0213fbbe-b778-4490-b1cb-8aab80799a7e'),
  ('fd2c7d46-29e6-4c6f-9500-1572a722cf38', '44923e1f-62b5-49c3-a75e-83338e9eb8ec'),
  ('fd691c8d-2af0-4023-bcf3-62682a9125d1', '9af29dd4-07f0-4a8a-be41-5744f5c3b0f8');

-- ─── 2. Guardas, cópia, escrita e conferências (um só bloco: tudo ou nada) ─────────────────────────
DO $mig$
DECLARE
  c_org           constant uuid    := '3242e925-da26-459a-8258-be04d904e355';
  c_criador       constant uuid    := 'ba0b0ebf-1bdb-43f9-b82b-a2ade29848e2';
  c_fonte         constant text    := 'migration:mudelar_excel_onda4';
  c_n_mudelar     constant integer := 32327;
  c_n_fam         constant integer := 548;
  c_n_membros     constant integer := 14637;
  c_n_produtos    constant integer := 180;
  c_n_sem_refs    constant integer := 84;
  c_n_com_refs    constant integer := 96;
  c_n_isup        constant integer := 173;
  v_n bigint; v_m bigint; v_arq_antes bigint; v_isup_vivas bigint;
  v_txt text; v_acl text; v_xid text; v_t text;
  v_h_sku_antes text;   v_h_sku_depois text;
  v_h_out_antes text;   v_h_out_depois text;
  v_h_preco_antes text; v_h_preco_depois text;
  v_h_isup_antes text;  v_h_isup_depois text;
  v_h_attr_antes text;  v_h_attr_depois text;
  v_h_cod_antes text;   v_h_cod_depois text;
  v_h_fam_antes text;   v_h_fam_depois text;
  v_h_docs_antes text;  v_h_docs_depois text;
BEGIN
  -- G0: só a Mudelar da base de RH
  IF NOT EXISTS (SELECT 1 FROM anew_organizations o WHERE o.id = c_org AND o.name = 'Mudelar' AND o.deleted_at IS NULL) THEN
    RAISE NOTICE 'mudelar_excel_onda4: a organização Mudelar (%) não existe nesta base — nada a fazer.', c_org;
    RETURN;
  END IF;
  SELECT count(*) INTO v_n FROM _o4_prod x JOIN products p ON p.id = x.id;
  IF v_n = 0 THEN
    RAISE NOTICE 'mudelar_excel_onda4: os produtos da lista não existem aqui — nada a fazer.';
    RETURN;
  END IF;

  -- L1: a lista embutida tem os números do cabeçalho
  IF (SELECT count(*) FROM _o4_prod) <> c_n_produtos OR (SELECT count(*) FROM _o4_prod WHERE com_refs) <> c_n_com_refs
     OR (SELECT count(*) FROM _o4_prod WHERE NOT com_refs) <> c_n_sem_refs THEN
    RAISE EXCEPTION 'L1: a lista não tem % produtos (% com referências e % sem).', c_n_produtos, c_n_com_refs, c_n_sem_refs;
  END IF;
  IF (SELECT count(*) FROM _o4_isup) <> c_n_isup OR EXISTS (SELECT 1 FROM _o4_isup i WHERE i.product_id NOT IN (SELECT x.id FROM _o4_prod x)) THEN
    RAISE EXCEPTION 'L1: a lista de ligações não tem % linhas, ou há ligações de produtos fora da lista.', c_n_isup;
  END IF;

  PERFORM set_config('app.audit_source', c_fonte, true);
  PERFORM set_config('app.audit_user_id', c_criador::text, true);
  -- o lock das funções das famílias do ecrã, e os produtos presos até ao fim, por ordem fixa
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_familias:' || c_org::text, 0));
  PERFORM 1 FROM products p WHERE p.id IN (SELECT x.id FROM _o4_prod x) ORDER BY p.id FOR NO KEY UPDATE;

  -- já aplicada? (os produtos arquivados por esta onda, as ligações também, e a cópia existe); a meio, falha
  SELECT count(*) INTO v_n FROM _o4_prod x JOIN products p ON p.id = x.id
  WHERE p.organization_id = c_org AND p.is_deleted AND p.deleted_at IS NOT NULL AND p.deleted_by = c_criador;
  SELECT count(*) INTO v_m FROM _o4_isup x JOIN item_suppliers i ON i.id = x.id WHERE i.deleted_at IS NOT NULL AND i.deleted_by = c_criador;
  IF v_n = c_n_produtos AND v_m = c_n_isup AND to_regclass('_mudelar_excel.onda4_produtos') IS NOT NULL THEN
    RAISE NOTICE 'mudelar_excel_onda4: já aplicada (os % produtos e as % ligações já estão arquivados) — nada a fazer.', c_n_produtos, c_n_isup;
    RETURN;
  END IF;
  IF v_n > 0 OR v_m > 0 OR to_regclass('_mudelar_excel.onda4_produtos') IS NOT NULL OR to_regclass('_mudelar_excel.onda4_item_suppliers') IS NOT NULL THEN
    RAISE EXCEPTION 'mudelar_excel_onda4: estado a meio: % de % produtos e % de % ligações já arquivados por esta onda, ou a cópia já existe.', v_n, c_n_produtos, v_m, c_n_isup;
  END IF;

  -- G1: contagens de partida
  SELECT count(*) INTO v_n FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.deleted_at IS NULL;
  IF v_n <> c_n_mudelar THEN RAISE EXCEPTION 'G1: a Mudelar tem % produtos vivos e esperavam-se %.', v_n, c_n_mudelar; END IF;
  SELECT count(*) INTO v_arq_antes FROM products p WHERE p.organization_id = c_org AND (p.is_deleted OR p.deleted_at IS NOT NULL);
  SELECT count(*) INTO v_isup_vivas FROM item_suppliers i WHERE i.organization_id = c_org AND i.deleted_at IS NULL;
  SELECT count(*) INTO v_n FROM product_families f WHERE f.organization_id = c_org;
  SELECT count(*) INTO v_m FROM product_family_members m JOIN product_families f ON f.id = m.family_id WHERE f.organization_id = c_org;
  IF v_n <> c_n_fam OR v_m <> c_n_membros THEN
    RAISE EXCEPTION 'G1: a Mudelar tem % famílias e % membros; esperavam-se % e %.', v_n, v_m, c_n_fam, c_n_membros;
  END IF;

  -- G2: cada produto existe, é da Mudelar, está vivo, tem o SKU esperado, não é consumível, não está em família nem em
  -- receitas, não tem encomenda a fornecedor por receber nem stock
  SELECT count(*) INTO v_n FROM _o4_prod x JOIN products p ON p.id = x.id
  WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.deleted_at IS NULL AND p.sku IS NOT DISTINCT FROM x.sku
    AND p.sku NOT LIKE 'CONS-%'
    AND NOT EXISTS (SELECT 1 FROM product_family_members m WHERE m.product_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM service_materials t WHERE t.product_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM purchase_order_items poi JOIN purchase_orders po ON po.id = poi.purchase_order_id
                    WHERE poi.product_id = p.id AND po.deleted_at IS NULL AND po.status::text NOT IN ('received', 'cancelled')
                      AND poi.quantity > coalesce(poi.received_quantity, 0))
    AND NOT EXISTS (SELECT 1 FROM stocks s WHERE s.product_id = p.id AND s.quantity > 0)
    AND NOT EXISTS (SELECT 1 FROM product_stock s WHERE s.product_id = p.id AND s.qty_available > 0);
  IF v_n <> c_n_produtos THEN
    SELECT string_agg(x.sku, '; ' ORDER BY x.sku) INTO v_txt FROM (
      SELECT x0.sku FROM _o4_prod x0 LEFT JOIN products p0 ON p0.id = x0.id
      WHERE p0.id IS NULL OR p0.organization_id IS DISTINCT FROM c_org OR p0.is_deleted OR p0.deleted_at IS NOT NULL
         OR p0.sku IS DISTINCT FROM x0.sku OR EXISTS (SELECT 1 FROM product_family_members m WHERE m.product_id = p0.id)
         OR EXISTS (SELECT 1 FROM service_materials t WHERE t.product_id = p0.id)
      ORDER BY x0.sku LIMIT 5) x;
    RAISE EXCEPTION 'G2: só % de % produtos estão vivos na Mudelar com o SKU esperado, fora das famílias, das receitas, das encomendas por receber e sem stock. Primeiros: %', v_n, c_n_produtos, v_txt;
  END IF;
  -- G2b: as referências em documentos são as lidas a 26/11
  SELECT count(*) INTO v_n FROM _o4_prod x WHERE x.com_refs IS DISTINCT FROM (EXISTS (SELECT 1 FROM quote_lines t WHERE t.product_id = x.id) OR EXISTS (SELECT 1 FROM negocio_produtos t WHERE t.produto_id = x.id)
          OR EXISTS (SELECT 1 FROM purchase_order_items t WHERE t.product_id = x.id) OR EXISTS (SELECT 1 FROM purchase_order_receipts t WHERE t.product_id = x.id)
          OR EXISTS (SELECT 1 FROM receiving_scans t WHERE t.product_id = x.id) OR EXISTS (SELECT 1 FROM supplier_delivery_note_lines t WHERE t.product_id = x.id)
          OR EXISTS (SELECT 1 FROM stock_movements t WHERE t.product_id = x.id)
          OR EXISTS (SELECT 1 FROM negocio_vista_cliente t WHERE t.organization_id = c_org AND strpos(t.vista::text, x.id::text) > 0));
  IF v_n > 0 THEN RAISE EXCEPTION 'G2: % produtos ganharam ou perderam referências em documentos desde 26/11.', v_n; END IF;
  -- G3 (exceção 2 do dono): cada documento continua a mostrar o nome sem o produto ativo — o nome está guardado na linha
  SELECT (SELECT count(*) FROM quote_lines t WHERE t.product_id IN (SELECT x.id FROM _o4_prod x) AND coalesce(btrim(t.descricao_snapshot), '') = '')
       + (SELECT count(*) FROM negocio_produtos t WHERE t.produto_id IN (SELECT x.id FROM _o4_prod x) AND coalesce(btrim(t.nome), '') = '')
       + (SELECT count(*) FROM purchase_order_items t WHERE t.product_id IN (SELECT x.id FROM _o4_prod x) AND coalesce(btrim(t.description), '') = '')
       + (SELECT count(*) FROM supplier_delivery_note_lines t WHERE t.product_id IN (SELECT x.id FROM _o4_prod x) AND coalesce(btrim(t.description), '') = '')
    INTO v_n;
  IF v_n > 0 THEN RAISE EXCEPTION 'G3: % linhas de documentos destes produtos não têm o nome guardado.', v_n; END IF;
  -- G3b: nenhuma referência noutras tabelas (só os documentos verificados acima)
  SELECT (SELECT count(*) FROM deal_need_items t WHERE t.product_id IN (SELECT x.id FROM _o4_prod x))
       + (SELECT count(*) FROM deal_need_diagnostic_materials t WHERE t.product_id IN (SELECT x.id FROM _o4_prod x))
       + (SELECT count(*) FROM ops_custo t WHERE t.produto_id IN (SELECT x.id FROM _o4_prod x))
       + (SELECT count(*) FROM quote_template_items t WHERE t.product_id IN (SELECT x.id FROM _o4_prod x))
       + (SELECT count(*) FROM quote_suggestion_rules t WHERE t.product_id IN (SELECT x.id FROM _o4_prod x))
       + (SELECT count(*) FROM quote_diagnostic_area_suggestions t WHERE t.product_id IN (SELECT x.id FROM _o4_prod x))
       + (SELECT count(*) FROM bundle_components t WHERE t.product_id IN (SELECT x.id FROM _o4_prod x))
       + (SELECT count(*) FROM product_config_slot_options t WHERE t.component_product_id IN (SELECT x.id FROM _o4_prod x))
       + (SELECT count(*) FROM product_configuration_templates t WHERE t.product_id IN (SELECT x.id FROM _o4_prod x))
       + (SELECT count(*) FROM cat_config_3d t WHERE t.produto_id IN (SELECT x.id FROM _o4_prod x))
       + (SELECT count(*) FROM adenda_linha_materiais t WHERE t.produto_id IN (SELECT x.id FROM _o4_prod x))
       + (SELECT count(*) FROM neg_linha_modelo_materiais t WHERE t.product_id IN (SELECT x.id FROM _o4_prod x))
       + (SELECT count(*) FROM direct_sale_lines t WHERE t.product_id IN (SELECT x.id FROM _o4_prod x))
       + (SELECT count(*) FROM inventory_count_lines t WHERE t.product_id IN (SELECT x.id FROM _o4_prod x))
       + (SELECT count(*) FROM fleet_restock_requests t WHERE t.product_id IN (SELECT x.id FROM _o4_prod x))
       + (SELECT count(*) FROM supplier_price_change_requests t WHERE t.product_id IN (SELECT x.id FROM _o4_prod x))
       + (SELECT count(*) FROM orcamento_linhas t WHERE t.produto_id IN (SELECT x.id FROM _o4_prod x))
       + (SELECT count(*) FROM quote_versao_produtos t WHERE t.produto_id IN (SELECT x.id FROM _o4_prod x))
    INTO v_n;
  IF v_n > 0 THEN RAISE EXCEPTION 'G3: % referências destes produtos em tabelas que não foram verificadas.', v_n; END IF;

  -- G4: as ligações da lista são TODAS as vivas destes produtos, da Mudelar
  SELECT count(*) INTO v_n FROM _o4_isup x JOIN item_suppliers i ON i.id = x.id
  WHERE i.product_id = x.product_id AND i.organization_id = c_org AND i.deleted_at IS NULL;
  SELECT count(*) INTO v_m FROM item_suppliers i WHERE i.product_id IN (SELECT x.id FROM _o4_prod x) AND i.deleted_at IS NULL;
  IF v_n <> c_n_isup OR v_m <> c_n_isup THEN
    RAISE EXCEPTION 'G4: % de % ligações da lista estão vivas na Mudelar, e os produtos têm % ligações vivas.', v_n, c_n_isup, v_m;
  END IF;
  -- G5: o utilizador da auditoria existe e é membro ativo da Mudelar; a auditoria dos gatilhos está ligada
  IF NOT EXISTS (SELECT 1 FROM anew_users u WHERE u.id = c_criador AND u.deleted_at IS NULL)
     OR NOT EXISTS (SELECT 1 FROM anew_memberships ms WHERE ms.user_id = c_criador AND ms.organization_id = c_org AND ms.status = 'active') THEN
    RAISE EXCEPTION 'G5: o utilizador % não existe em anew_users, está apagado ou não é membro ativo da Mudelar.', c_criador;
  END IF;
  IF coalesce(current_setting('app.audit_bypass', true), '') = 'on' THEN
    RAISE EXCEPTION 'G5: app.audit_bypass já está ligado antes da escrita.';
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
  FROM products p WHERE p.organization_id = c_org AND p.id NOT IN (SELECT x.id FROM _o4_prod x);
  SELECT md5(coalesce(string_agg(md5((to_jsonb(pp) - 'updated_at')::text), '' ORDER BY pp.id), '')) INTO v_h_preco_antes
  FROM product_prices pp JOIN products p ON p.id = pp.product_id WHERE p.organization_id = c_org;
  SELECT md5(coalesce(string_agg(md5((to_jsonb(i) - 'updated_at')::text), '' ORDER BY i.id), '')) INTO v_h_isup_antes
  FROM item_suppliers i JOIN products p ON p.id = i.product_id
  WHERE p.organization_id = c_org AND i.id NOT IN (SELECT x.id FROM _o4_isup x);
  SELECT md5(coalesce(string_agg(md5((to_jsonb(v) - 'updated_at')::text), '' ORDER BY v.id), '')) INTO v_h_attr_antes
  FROM product_attribute_values v JOIN products p ON p.id = v.product_id WHERE p.organization_id = c_org;
  SELECT md5(coalesce(string_agg(h, '' ORDER BY h), '')) INTO v_h_cod_antes FROM (
    SELECT 'c' || md5((to_jsonb(t) - 'updated_at')::text) AS h FROM product_codes t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'o' || md5((to_jsonb(t) - 'updated_at')::text) FROM product_organizations t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'h' || md5(to_jsonb(t)::text) FROM product_price_history t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org) z;
  SELECT md5(coalesce(string_agg(h, '' ORDER BY h), '')) INTO v_h_fam_antes FROM (
    SELECT 'f' || md5((to_jsonb(f) - 'updated_at')::text) AS h FROM product_families f WHERE f.organization_id = c_org
    UNION ALL SELECT 'm' || md5(to_jsonb(m)::text) FROM product_family_members m JOIN product_families f ON f.id = m.family_id WHERE f.organization_id = c_org
    UNION ALL SELECT 'a' || md5(to_jsonb(a)::text) FROM product_family_axes a JOIN product_families f ON f.id = a.family_id WHERE f.organization_id = c_org) z;
  SELECT md5(coalesce(string_agg(h, '' ORDER BY h), '')) INTO v_h_docs_antes FROM (
    SELECT 'q' || md5((to_jsonb(t) - 'updated_at')::text) AS h FROM quote_lines t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'n' || md5(to_jsonb(t)::text) FROM negocio_produtos t JOIN products p ON p.id = t.produto_id WHERE p.organization_id = c_org
    UNION ALL SELECT 's' || md5((to_jsonb(t) - 'updated_at')::text) FROM service_materials t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'c' || md5((to_jsonb(t) - 'updated_at')::text) FROM purchase_order_items t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'r' || md5(to_jsonb(t)::text) FROM purchase_order_receipts t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'e' || md5(to_jsonb(t)::text) FROM receiving_scans t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'g' || md5(to_jsonb(t)::text) FROM supplier_delivery_note_lines t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'm' || md5(to_jsonb(t)::text) FROM stock_movements t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'v' || md5((to_jsonb(t) - 'atualizada_em')::text) FROM negocio_vista_cliente t WHERE t.organization_id = c_org) z;

  -- ─── 3. Cópia do estado antigo (schema privado, só postgres) ───────────────────────────────────────
  CREATE SCHEMA IF NOT EXISTS _mudelar_excel;
  REVOKE ALL ON SCHEMA _mudelar_excel FROM PUBLIC, anon, authenticated, service_role;
  CREATE TABLE _mudelar_excel.onda4_produtos (id uuid PRIMARY KEY, linha jsonb NOT NULL, com_refs boolean NOT NULL,
    arquivado_em timestamptz NOT NULL DEFAULT now());
  CREATE TABLE _mudelar_excel.onda4_item_suppliers (id uuid PRIMARY KEY, product_id uuid NOT NULL, linha jsonb NOT NULL);
  REVOKE ALL ON ALL TABLES IN SCHEMA _mudelar_excel FROM PUBLIC, anon, authenticated, service_role;
  INSERT INTO _mudelar_excel.onda4_produtos (id, linha, com_refs)
  SELECT p.id, to_jsonb(p), x.com_refs FROM products p JOIN _o4_prod x ON x.id = p.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_n_produtos THEN RAISE EXCEPTION 'B1: % produtos copiados, esperados %.', v_n, c_n_produtos; END IF;
  INSERT INTO _mudelar_excel.onda4_item_suppliers (id, product_id, linha)
  SELECT i.id, i.product_id, to_jsonb(i) FROM item_suppliers i JOIN _o4_isup x ON x.id = i.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_n_isup THEN RAISE EXCEPTION 'B1: % ligações copiadas, esperadas %.', v_n, c_n_isup; END IF;

  -- ─── 4. Escrita (como rpc_bulk_delete_product e rpc_delete_item_supplier: auditoria dos gatilhos desligada só aqui) ──
  PERFORM set_config('app.audit_bypass', 'on', true);
  -- W1: os produtos (is_deleted, deleted_at e deleted_by, os três)
  UPDATE products p SET is_deleted = true, deleted_at = now(), deleted_by = c_criador
  WHERE p.id IN (SELECT x.id FROM _o4_prod x) AND p.organization_id = c_org AND NOT p.is_deleted AND p.deleted_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_n_produtos THEN RAISE EXCEPTION 'W1: % produtos arquivados, esperados %.', v_n, c_n_produtos; END IF;
  -- W2: as ligações a fornecedores desses produtos (o gatilho de preferencial limpa products.supplier_id)
  UPDATE item_suppliers i SET deleted_at = now(), deleted_by = c_criador, updated_at = now()
  WHERE i.id IN (SELECT x.id FROM _o4_isup x) AND i.organization_id = c_org AND i.deleted_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_n_isup THEN RAISE EXCEPTION 'W2: % ligações arquivadas, esperadas %.', v_n, c_n_isup; END IF;
  PERFORM set_config('app.audit_bypass', 'off', true);
  IF current_setting('app.audit_bypass', true) <> 'off' THEN RAISE EXCEPTION 'W2: app.audit_bypass não voltou a off.'; END IF;
  -- W3: uma linha de auditoria por produto e por ligação, iguais às das RPC
  PERFORM fn_manual_audit_log('products', x.id, c_org, 'UPDATE',
    jsonb_build_object('products', jsonb_build_object(
      'is_deleted', jsonb_build_object('old', to_jsonb(false), 'new', to_jsonb(true)),
      'deleted_at', jsonb_build_object('old', NULL, 'new', to_jsonb(now())))), c_fonte)
  FROM _o4_prod x;
  PERFORM fn_manual_audit_log('item_suppliers', x.id, c_org, 'UPDATE',
    jsonb_build_object(
      'deleted_at', jsonb_build_object('old', NULL, 'new', to_jsonb(now())),
      'deleted_by', jsonb_build_object('old', NULL, 'new', to_jsonb(c_criador))), c_fonte)
  FROM _o4_isup x;

  -- ─── 5. Conferências ──────────────────────────────────────────────────────────────────────────────
  -- C1: nos produtos só mudou o arquivo (e supplier_id, limpo pelo gatilho ao arquivar a ligação preferencial)
  SELECT count(*) INTO v_n FROM _mudelar_excel.onda4_produtos b JOIN products p ON p.id = b.id
  WHERE (to_jsonb(p) - ARRAY['updated_at', 'is_deleted', 'deleted_at', 'deleted_by', 'supplier_id'])
        IS DISTINCT FROM (b.linha - ARRAY['updated_at', 'is_deleted', 'deleted_at', 'deleted_by', 'supplier_id'])
     OR NOT p.is_deleted OR p.deleted_at IS DISTINCT FROM now() OR p.deleted_by IS DISTINCT FROM c_criador
     OR (p.supplier_id IS NOT NULL AND EXISTS (SELECT 1 FROM _o4_isup x WHERE x.product_id = p.id))
     OR (p.supplier_id::text IS DISTINCT FROM b.linha->>'supplier_id' AND NOT EXISTS (SELECT 1 FROM _o4_isup x WHERE x.product_id = p.id));
  IF v_n > 0 THEN RAISE EXCEPTION 'C1: % produtos da lista mudaram fora do arquivo.', v_n; END IF;
  SELECT count(*) INTO v_n FROM _mudelar_excel.onda4_item_suppliers b JOIN item_suppliers i ON i.id = b.id
  WHERE (to_jsonb(i) - ARRAY['updated_at', 'deleted_at', 'deleted_by']) IS DISTINCT FROM (b.linha - ARRAY['updated_at', 'deleted_at', 'deleted_by'])
     OR i.deleted_at IS DISTINCT FROM now() OR i.deleted_by IS DISTINCT FROM c_criador;
  IF v_n > 0 THEN RAISE EXCEPTION 'C1: % ligações da lista mudaram fora do arquivo.', v_n; END IF;
  -- C2: nenhum SKU da Mudelar mudou
  SELECT md5(string_agg(p.id::text || '=' || p.sku, ',' ORDER BY p.id)) INTO v_h_sku_depois FROM products p WHERE p.organization_id = c_org;
  IF v_h_sku_depois <> v_h_sku_antes THEN RAISE EXCEPTION 'C2: há SKU alterados na Mudelar.'; END IF;
  -- C3: os produtos fora da lista ficaram iguais (sem updated_at); vivos e arquivados contados
  SELECT md5(string_agg(md5((to_jsonb(p) - 'updated_at')::text), '' ORDER BY p.id)) INTO v_h_out_depois
  FROM products p WHERE p.organization_id = c_org AND p.id NOT IN (SELECT x.id FROM _o4_prod x);
  IF v_h_out_depois <> v_h_out_antes THEN RAISE EXCEPTION 'C3: mudaram produtos da Mudelar que não são desta onda.'; END IF;
  SELECT count(*) INTO v_n FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.deleted_at IS NULL;
  SELECT count(*) INTO v_m FROM products p WHERE p.organization_id = c_org AND (p.is_deleted OR p.deleted_at IS NOT NULL);
  IF v_n <> c_n_mudelar - c_n_produtos OR v_m <> v_arq_antes + c_n_produtos THEN
    RAISE EXCEPTION 'C3: a Mudelar ficou com % produtos vivos e % arquivados; esperavam-se % e %.', v_n, v_m, c_n_mudelar - c_n_produtos, v_arq_antes + c_n_produtos;
  END IF;
  -- C4: preços, atributos, códigos, organização e histórico de preços iguais
  SELECT md5(coalesce(string_agg(md5((to_jsonb(pp) - 'updated_at')::text), '' ORDER BY pp.id), '')) INTO v_h_preco_depois
  FROM product_prices pp JOIN products p ON p.id = pp.product_id WHERE p.organization_id = c_org;
  IF v_h_preco_depois <> v_h_preco_antes THEN RAISE EXCEPTION 'C4: mudaram preços da Mudelar.'; END IF;
  SELECT md5(coalesce(string_agg(md5((to_jsonb(v) - 'updated_at')::text), '' ORDER BY v.id), '')) INTO v_h_attr_depois
  FROM product_attribute_values v JOIN products p ON p.id = v.product_id WHERE p.organization_id = c_org;
  IF v_h_attr_depois <> v_h_attr_antes THEN RAISE EXCEPTION 'C4: mudaram atributos da Mudelar.'; END IF;
  SELECT md5(coalesce(string_agg(h, '' ORDER BY h), '')) INTO v_h_cod_depois FROM (
    SELECT 'c' || md5((to_jsonb(t) - 'updated_at')::text) AS h FROM product_codes t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'o' || md5((to_jsonb(t) - 'updated_at')::text) FROM product_organizations t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'h' || md5(to_jsonb(t)::text) FROM product_price_history t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org) z;
  IF v_h_cod_depois <> v_h_cod_antes THEN RAISE EXCEPTION 'C4: mudaram códigos, organizações ou o histórico de preços da Mudelar.'; END IF;
  -- C5: ligações a fornecedores fora da lista iguais; vivas contadas
  SELECT md5(coalesce(string_agg(md5((to_jsonb(i) - 'updated_at')::text), '' ORDER BY i.id), '')) INTO v_h_isup_depois
  FROM item_suppliers i JOIN products p ON p.id = i.product_id
  WHERE p.organization_id = c_org AND i.id NOT IN (SELECT x.id FROM _o4_isup x);
  IF v_h_isup_depois <> v_h_isup_antes THEN RAISE EXCEPTION 'C5: mudaram ligações a fornecedores que não são desta onda.'; END IF;
  SELECT count(*) INTO v_n FROM item_suppliers i WHERE i.organization_id = c_org AND i.deleted_at IS NULL;
  IF v_n <> v_isup_vivas - c_n_isup THEN RAISE EXCEPTION 'C5: a Mudelar ficou com % ligações vivas; esperavam-se %.', v_n, v_isup_vivas - c_n_isup; END IF;
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
  -- C8: orçamentos, negócios, receitas, compras, receções, guias, stock e a vista do cliente iguais (nada reapontado)
  SELECT md5(coalesce(string_agg(h, '' ORDER BY h), '')) INTO v_h_docs_depois FROM (
    SELECT 'q' || md5((to_jsonb(t) - 'updated_at')::text) AS h FROM quote_lines t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'n' || md5(to_jsonb(t)::text) FROM negocio_produtos t JOIN products p ON p.id = t.produto_id WHERE p.organization_id = c_org
    UNION ALL SELECT 's' || md5((to_jsonb(t) - 'updated_at')::text) FROM service_materials t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'c' || md5((to_jsonb(t) - 'updated_at')::text) FROM purchase_order_items t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'r' || md5(to_jsonb(t)::text) FROM purchase_order_receipts t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'e' || md5(to_jsonb(t)::text) FROM receiving_scans t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'g' || md5(to_jsonb(t)::text) FROM supplier_delivery_note_lines t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'm' || md5(to_jsonb(t)::text) FROM stock_movements t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'v' || md5((to_jsonb(t) - 'atualizada_em')::text) FROM negocio_vista_cliente t WHERE t.organization_id = c_org) z;
  IF v_h_docs_depois <> v_h_docs_antes THEN RAISE EXCEPTION 'C8: mudaram documentos, receitas ou vistas da Mudelar.'; END IF;
  -- C9: nada escrito fora da Mudelar (nenhuma linha de outra organização tem o xmin desta transação)
  v_xid := (txid_current() % 4294967296)::text;
  SELECT (SELECT count(*) FROM products p WHERE p.xmin::text = v_xid AND p.organization_id IS DISTINCT FROM c_org)
       + (SELECT count(*) FROM item_suppliers x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org)
       + (SELECT count(*) FROM entity_audit_log x WHERE x.created_at = now() AND x.source = c_fonte AND x.organization_id IS DISTINCT FROM c_org)
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
  -- C12: uma linha de auditoria por produto e por ligação, e nenhuma dos gatilhos (now() = o início desta transação)
  SELECT count(*) INTO v_n FROM entity_audit_log l
  WHERE l.created_at = now() AND l.source = c_fonte AND l.changed_by = c_criador AND l.table_name = 'products' AND l.entity_id IN (SELECT x.id FROM _o4_prod x);
  IF v_n <> c_n_produtos THEN RAISE EXCEPTION 'C12: % linhas de auditoria dos produtos, esperadas %.', v_n, c_n_produtos; END IF;
  SELECT count(*) INTO v_n FROM entity_audit_log l
  WHERE l.created_at = now() AND l.source = c_fonte AND l.changed_by = c_criador AND l.table_name = 'item_suppliers' AND l.entity_id IN (SELECT x.id FROM _o4_isup x);
  IF v_n <> c_n_isup THEN RAISE EXCEPTION 'C12: % linhas de auditoria das ligações, esperadas %.', v_n, c_n_isup; END IF;
  SELECT count(*) INTO v_n FROM entity_audit_log l WHERE l.created_at = now() AND l.entity_id IN (SELECT x.id FROM _o4_prod x UNION ALL SELECT x.id FROM _o4_isup x);
  IF v_n <> c_n_produtos + c_n_isup THEN RAISE EXCEPTION 'C12: % linhas de auditoria destes produtos e ligações nesta transação, esperadas %.', v_n, c_n_produtos + c_n_isup; END IF;

  RAISE NOTICE 'mudelar_excel_onda4: % produtos arquivados (% sem referências, % com referências) e % ligações a fornecedores arquivadas.',
    c_n_produtos, c_n_sem_refs, c_n_com_refs, c_n_isup;
END $mig$;

COMMIT;
