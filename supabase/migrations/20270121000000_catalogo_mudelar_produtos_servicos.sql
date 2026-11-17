-- 17/11 (Rúben: «o Miguel importou muitos produtos e temos que os ligar aos serviços; faz como tu quiseres»). Cada produto do
-- catálogo da Mudelar passa a trazer o serviço que o instala (products.servico_id, fator 1): quando se escolhe na visita, a
-- instalação entra no orçamento (cat_ler_catalogo → Produto.servico).
--
-- Como se decide (pré-visualizado na base a 17/11: 28 919 de 28 992 produtos ligados):
--  1. Pelo nome, nos armários e acessórios de cozinha: o serviço «Instalação (de) <nome do produto>» (sem a cor no fim e com o
--     maior valor do intervalo: «Armário Inferior de cozinha de 71cm a 80cm - Verde normal» → «Instalação Armário Inferior de
--     cozinha 80cm»), ou o serviço com o mesmo nome do produto.
--  2. Pela subcategoria, com o nome a afinar (o que o protótipo de 14/10, dados/catalogoMudelar.ts, já fazia): sanita suspensa,
--     compacta ou elétrica; bidé suspenso ou compacto; espelho com LED; lateral fixo do resguardo; placa a gás ou de indução;
--     toalheiro elétrico; chuveiro higiénico de água fria; coluna de duche de encastre.
-- Ficam sem serviço (de propósito): os componentes das colunas de duche (braços, pratos, chuveiros de encastre: vão com a coluna),
-- as placas de acionamento (vão com a sanita), os termoacumuladores (não há serviço) e os armários sem medida.
-- Só mexe nos produtos ainda sem serviço: pode correr-se outra vez.
-- 17/11 (tarde): também as torneiras e misturadoras (lavatório, pé alto e sifões → torneira de lavatório; bidé; banheira; encastre;
-- misturadoras → torneira de cozinha) e os revestimentos (cerâmico e laminado → parede; porcelânico → pavimento; SPC; rodapés)
-- que o Miguel importou no mesmo dia. Corrido outra vez, liga só esses (os outros já têm serviço).

with org as (select '3242e925-da26-459a-8258-be04d904e355'::uuid id),
regras(sub, padrao, chave, ordem) as (values
  -- Duche & Banho
  ('Bases Duche', null, 's-moibdxxl', 9),
  ('Banheiras', null, 'c17', 9),
  ('Resguardos de Duche', 'serigrafia', 'c11', 1),
  ('Resguardos de Duche', '^\s*lateral', 'c26', 2),
  ('Resguardos de Duche', null, 'c14', 9),
  ('Colunas Duche', '^\s*coluna.*encastre', 's-moicde', 1),
  ('Colunas Duche', '^\s*(coluna|adaptador)', 'c10', 2),
  ('Chuveiro Higiénico', 'fria', 's-moich', 1),
  ('Chuveiro Higiénico', null, 's-moichm', 9),
  -- Loiças Sanitárias
  ('Sanitas', 'smart|el[eé]tric', 's-moise', 1),
  ('Sanitas', 'suspens', 's-moissusp', 2),
  ('Sanitas', null, 'c13', 9),
  ('Bidés', 'suspens', 's-moibsusp', 1),
  ('Bidés', null, 'c23', 9),
  ('Lavatórios', null, 'c22', 9),
  -- Acessórios de Casa de Banho
  ('Toalheiros', 'el[eé]tric', 'c28', 1),
  ('Toalheiros', null, 'c20', 9),
  ('Auxiliares', null, 'c20', 9), ('Cabides', null, 'c20', 9), ('Cestos', null, 'c20', 9), ('Piaçaba', null, 'c20', 9), ('Porta-rolos', null, 'c20', 9),
  ('Bancos', null, 'c24', 9), ('Cadeiras', null, 'c24', 9), ('Pega De Segurança', null, 'c24', 9),
  -- Móveis & Arrumação Casa de Banho
  ('Móveis de lavatório', null, 'c9', 9), ('Colunas', null, 'c9', 9),
  ('Espelhos', '\mled\M', 'c19', 1), ('Espelhos', null, 's-moie', 9),
  ('Tampos & Bancadas WC', null, 's-moitb', 9),
  ('Apliques LED', null, 's-moial', 9),
  -- Lava-louças & Cubas
  ('Cubas compósito', null, 'c41', 9), ('Cubas inox', null, 'c41', 9),
  -- Eletrodomésticos
  ('Placas', 'indu', 'c30', 0), ('Placas', 'g[aá]s', 'c15', 1), ('Placas', null, 'c30', 9),
  ('Esquentador', null, 'c15', 9),
  ('Exaustores', null, 'c30', 9), ('Fornos', null, 'c30', 9), ('Frigoríficos', null, 'c30', 9), ('Garrafeira', null, 'c30', 9),
  ('Máquinas lavar & secar roupa', null, 'c30', 9), ('Máquinas lavar loiça', null, 'c30', 9), ('Máquinas lavar roupa', null, 'c30', 9),
  ('Máquinas secar roupa', null, 'c30', 9), ('Micro-ondas', null, 'c30', 9),
  ('Ventax', null, 'c29', 9),
  -- 17/11 (as importações do Miguel do mesmo dia): Torneiras & Misturadoras
  ('Torneira Lavatório', null, 'c18', 9), ('Torneira Pé Alto', null, 'c18', 9), ('Sifões Lavatório', null, 'c18', 9),
  ('Torneira Bidé', null, 'c27', 9),
  ('Torneira Banheira', 'ch[aã]o', 's-moitcb', 1), ('Torneira Banheira', null, 's-moitbf', 9),
  ('Torneira Encastre', null, 's-moitle', 9),
  -- não há serviço de torneira de duche: a mais parecida é a de banheira fixa (misturadora de parede, a mesma montagem)
  ('Torneira Duche', null, 's-moitbf', 9),
  ('Misturadoras Monocomando', null, 'c39', 9), ('Misturadoras Monocomando Abatível', null, 'c39', 9),
  ('Misturadoras Monocomando Extraível', null, 'c39', 9), ('Misturadoras Monocomando Flexível', null, 'c39', 9),
  ('Misturadoras Monocomando Giratória', null, 'c39', 9),
  -- Revestimentos (por m²): parede, pavimento, SPC; os rodapés por ml
  ('Cerâmico', 'rodap', 'c40', 0), ('Cerâmico', '\mpav\M', 'c6', 1), ('Cerâmico', null, 'c4', 9),
  ('Cerâmico Laminado', 'rodap', 'c40', 0), ('Cerâmico Laminado', null, 'c4', 9),
  ('Porcelânico', 'rodap', 'c40', 0), ('Porcelânico', '\mrev\M', 'c4', 1), ('Porcelânico', null, 'c6', 9),
  ('SPC', 'rodap', 'c40', 0), ('SPC', null, 's-moipspc', 9)
),
pelo_nome_subs(sub) as (values ('Armários Inferiores'), ('Armários superiores'), ('Armários de Coluna'), ('Acessórios de Cozinha'),
  ('Cozinha Completa - Projetos'), ('Puxadores'), ('Mobiliário de Roupeiros')),
prod as (
  select p.id, p.name, sc.name sub
  from products p join product_categories sc on sc.id = p.subcategory_id, org
  where p.organization_id = org.id and p.tipo_catalogo = 'produto' and not coalesce(p.is_deleted, false) and p.servico_id is null
),
-- fn_cat_nome: minúsculas e espaços acertados (mantém os acentos)
svc as materialized (select s.id, s.chave, lower(fn_cat_nome(s.name)) n from services s, org where s.organization_id = org.id),
base as (
  select pr.id, lower(fn_cat_nome(regexp_replace(regexp_replace(pr.name, '\s+-\s+[^-]*$', ''), '\mde\s+\d+\s*(cm)?\s+a\s+', '', 'gi'))) b
  from prod pr where pr.sub in (select sub from pelo_nome_subs)
),
nome as (
  select distinct on (b.id) b.id, s.id sid from base b
  join svc s on s.n = 'instalação ' || b.b or s.n = 'instalação de ' || b.b or s.n = b.b
  order by b.id, (s.n = b.b)
),
regra as (
  select distinct on (pr.id) pr.id, s.id sid from prod pr
  -- a subcategoria comparada sem acentos nem maiúsculas («Flexivel» = «Flexível»)
  join regras r on translate(lower(r.sub), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') = translate(lower(pr.sub), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
    and (r.padrao is null or pr.name ~* r.padrao)
  join svc s on s.chave = r.chave
  order by pr.id, r.ordem
),
ligado as (
  select pr.id, coalesce(n.sid, g.sid) servico_id from prod pr left join nome n on n.id = pr.id left join regra g on g.id = pr.id
)
update products p
set servico_id = l.servico_id, fator_servico = 1
from ligado l
where p.id = l.id and l.servico_id is not null and p.servico_id is null;

-- Conferir (deve dar ~28 919 ligados e 73 sem serviço):
-- select count(*) filter (where servico_id is not null) ligados, count(*) filter (where servico_id is null) sem_servico
-- from products where organization_id = '3242e925-da26-459a-8258-be04d904e355' and tipo_catalogo = 'produto' and not coalesce(is_deleted, false);
