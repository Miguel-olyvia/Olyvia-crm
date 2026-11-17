-- 17/11 (teste A-Z do Rúben na Mudelar, negócio 1004): os produtos importados pelo Miguel só têm a categoria nova (product_categories).
-- O motor do negócio sabe o que um produto é pelo ramo da árvore do Catálogo (products.catalogo_categoria_id → service_categories:
-- «Canalização › Louças e torneiras», «Revestimentos › Parede»…). Sem ele:
--  · os produtos escolhidos não descontam a estimativa dos materiais do modelo (a louça contava duas vezes no orçamento);
--  · os seletores das Necessidades do cliente ficavam vazios («Não há produtos com estes filtros»).
-- Aqui cada subcategoria nova fica com o ramo da árvore do Catálogo que lhe corresponde. Só mexe nos produtos ainda sem ramo:
-- pode correr-se outra vez (e apanha importações novas das mesmas subcategorias).

with org as (select '3242e925-da26-459a-8258-be04d904e355'::uuid id),
mapa(sub, oficio, ramo) as (values
  -- Canalização › Louças e torneiras (o modelo da casa de banho: «louças, base e torneiras»)
  ('Bases Duche', 'Canalização', 'Louças e torneiras'), ('Banheiras', 'Canalização', 'Louças e torneiras'),
  ('Sanitas', 'Canalização', 'Louças e torneiras'), ('Bidés', 'Canalização', 'Louças e torneiras'),
  ('Lavatórios', 'Canalização', 'Louças e torneiras'), ('Kit´s para Sanitários', 'Canalização', 'Louças e torneiras'),
  ('Chuveiro Higiénico', 'Canalização', 'Louças e torneiras'), ('Colunas Duche', 'Canalização', 'Louças e torneiras'),
  ('Torneira Lavatório', 'Canalização', 'Louças e torneiras'), ('Torneira Pé Alto', 'Canalização', 'Louças e torneiras'),
  ('Torneira Bidé', 'Canalização', 'Louças e torneiras'), ('Torneira Banheira', 'Canalização', 'Louças e torneiras'),
  ('Torneira Encastre', 'Canalização', 'Louças e torneiras'), ('Torneira Duche', 'Canalização', 'Louças e torneiras'),
  ('Sifões Lavatório', 'Canalização', 'Louças e torneiras'),
  -- Canalização › Lava-loiças e torneiras de cozinha
  ('Cubas compósito', 'Canalização', 'Lava-loiças e torneiras de cozinha'), ('Cubas inox', 'Canalização', 'Lava-loiças e torneiras de cozinha'),
  ('Misturadoras Monocomando', 'Canalização', 'Lava-loiças e torneiras de cozinha'),
  ('Misturadoras Monocomando Abatível', 'Canalização', 'Lava-loiças e torneiras de cozinha'),
  ('Misturadoras Monocomando Extraível', 'Canalização', 'Lava-loiças e torneiras de cozinha'),
  ('Misturadoras Monocomando Flexível', 'Canalização', 'Lava-loiças e torneiras de cozinha'),
  ('Misturadoras Monocomando Giratória', 'Canalização', 'Lava-loiças e torneiras de cozinha'),
  -- águas quentes
  ('Termoacumulador', 'Canalização', 'Aquecimento de águas'), ('Esquentador', 'Gás (ITG)', 'Aparelhos a gás'),
  -- Carpintaria
  ('Resguardos de Duche', 'Carpintaria', 'Resguardos'),
  ('Móveis de lavatório', 'Carpintaria', 'Móveis de casa de banho'), ('Colunas', 'Carpintaria', 'Móveis de casa de banho'),
  ('Tampos & Bancadas WC', 'Carpintaria', 'Móveis de casa de banho'), ('Espelhos', 'Carpintaria', 'Móveis de casa de banho'),
  ('Toalheiros', 'Carpintaria', 'Acessórios WC'), ('Auxiliares', 'Carpintaria', 'Acessórios WC'), ('Cabides', 'Carpintaria', 'Acessórios WC'),
  ('Cestos', 'Carpintaria', 'Acessórios WC'), ('Piaçaba', 'Carpintaria', 'Acessórios WC'), ('Porta-rolos', 'Carpintaria', 'Acessórios WC'),
  ('Bancos', 'Carpintaria', 'Acessórios WC'), ('Cadeiras', 'Carpintaria', 'Acessórios WC'), ('Pega De Segurança', 'Carpintaria', 'Acessórios WC'),
  ('Exaustores', 'Carpintaria', 'Eletrodomésticos'), ('Fornos', 'Carpintaria', 'Eletrodomésticos'), ('Frigoríficos', 'Carpintaria', 'Eletrodomésticos'),
  ('Garrafeira', 'Carpintaria', 'Eletrodomésticos'), ('Máquinas lavar & secar roupa', 'Carpintaria', 'Eletrodomésticos'),
  ('Máquinas lavar loiça', 'Carpintaria', 'Eletrodomésticos'), ('Máquinas lavar roupa', 'Carpintaria', 'Eletrodomésticos'),
  ('Máquinas secar roupa', 'Carpintaria', 'Eletrodomésticos'), ('Micro-ondas', 'Carpintaria', 'Eletrodomésticos'),
  ('Placas', 'Carpintaria', 'Eletrodomésticos'),
  ('Armários Inferiores', 'Carpintaria', 'Mobiliário'), ('Armários superiores', 'Carpintaria', 'Mobiliário'),
  ('Armários de Coluna', 'Carpintaria', 'Mobiliário'), ('Acessórios de Cozinha', 'Carpintaria', 'Mobiliário'),
  ('Cozinha Completa - Projetos', 'Carpintaria', 'Mobiliário'), ('Puxadores', 'Carpintaria', 'Mobiliário'),
  -- Eletricidade
  ('Apliques LED', 'Eletricidade', 'Iluminação'), ('Ventax', 'Eletricidade', 'Ventilação'),
  -- Revestimentos (o modelo: «cerâmico de parede» e «pavimento»)
  ('Cerâmico', 'Revestimentos', 'Parede'), ('Cerâmico Laminado', 'Revestimentos', 'Parede'),
  ('Porcelânico', 'Revestimentos', 'Pavimento'), ('SPC', 'Revestimentos', 'Pavimento')
),
-- sem acentos nem maiúsculas («Flexivel» = «Flexível»)
norm as (select m.*, translate(lower(m.sub), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') k from mapa m),
no as (
  select c.id, translate(lower(pai.name), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') oficio,
         translate(lower(c.name), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') ramo
  from service_categories c join service_categories pai on pai.id = c.parent_id, org
  where c.organization_id = org.id and c.deleted_at is null
),
alvo as (
  select p.id, n2.id no_id
  from products p join product_categories sc on sc.id = p.subcategory_id
  join norm n on n.k = translate(lower(sc.name), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
  join no n2 on n2.oficio = translate(lower(n.oficio), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
            and n2.ramo = translate(lower(n.ramo), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), org
  where p.organization_id = org.id and p.tipo_catalogo = 'produto' and p.catalogo_categoria_id is null
)
update products p set catalogo_categoria_id = a.no_id from alvo a where p.id = a.id and p.catalogo_categoria_id is null;

-- Conferir (os produtos da Mudelar sem ramo devem ficar a 0, ou perto):
-- select count(*) filter (where catalogo_categoria_id is null) sem_ramo, count(*) total from products
-- where organization_id = '3242e925-da26-459a-8258-be04d904e355' and tipo_catalogo = 'produto' and not coalesce(is_deleted, false);
