/**
 * Tempos padrão das obras de remodelação — os DADOS VALIDADOS.
 *
 * Origem: os manuais operacionais "Remodelação de Casas de Banho" e
 * "Remodelação de Cozinhas" (enviados pelo Hugo), compactados em tarefas, com
 * tempos propostos a partir dos dias por fase dos manuais e dos exemplos da
 * aplicação; validados pela equipa a 03/10/2026 na folha
 * "Planeamento - tempos padrão casa de banho e cozinha.xlsx".
 *
 * Daqui saem:
 *   · a carga dos tempos padrão em db/obras.sql (ops_obra_tempos_padrao) —
 *     node tools/planeamento/gerar-semente.mjs --escrever;
 *   · a tabela legível docs/tempos-padrao.md — node tools/planeamento/gerar-md.mjs;
 *   · a folha Excel — node tools/planeamento/gerar-excel.mjs (precisa de exceljs).
 *
 * Mudar um tempo no dia a dia faz-se no ecrã Obras → Modelos (e a aprendizagem
 * corrige-o com o real). Mudar AQUI é para mudar o ponto de partida de todas as
 * organizações que carreguem os tempos padrão.
 *
 * Formatos:
 *   WC / COZ: [cód, tarefa, fase, ofício, depende de [], espera antes (h),
 *              origem da espera, condição, quem executa, alteração face ao manual,
 *              pessoas, horas fixas, horas por medida, medida, base da estimativa,
 *              modelos parciais]
 *   EXTRAS:   [pacote, serviço (nome exato no catálogo), nº orçamentos, qt mediana,
 *              unidade, encaixe, nota, ofício, horas fixas, horas por unidade]
 *             encaixe: 'X.Y' (junta-se a X.Y) · 'Entre X e Y' · 'X + Y' (duas
 *             partes) · 'X / Y' (junta-se a X) · 'Depois de X' · 'Antes da obra'
 *             (não é trabalho no local)
 */

const FASES = {
  1: '1 Preparatórios e demolições',
  2: '2 Infraestruturas',
  3: '3 Revestimentos e acabamentos base',
  4: '4 Montagem final e acabamentos finos',
};

// Medidas de referência por pacote: [medida, valor, de onde vem]
const MEDIDAS = {
  'Casa de banho': [
    ['m² pavimento', 4, 'Casa de banho média de ≈ 2,0 × 2,0 m. Estimativa: os pacotes vendem-se com quantidade 1, sem medidas.'],
    ['m² parede', 18, 'Perímetro ≈ 8 m × 2,4 m de altura (revestimento até ao teto), menos a porta. Estimativa.'],
    ['m² total', 22, 'Pavimento + parede.'],
    ['pontos de água', 5, 'Sanita, lavatório, bidé, duche e máquina/esquentador. Estimativa.'],
    ['pontos elétricos', 6, 'Iluminação, tomadas, espelho, ventilação. Estimativa.'],
    ['peças sanitárias', 4, 'Sanita, lavatório, bidé, base de duche (ou banheira).'],
    ['acessórios e móveis', 6, 'Torneiras, móvel, espelho, resguardo, acessórios.'],
  ],
  'Cozinha': [
    ['m² pavimento', 10, 'Cozinha média. Estimativa: os pacotes vendem-se com quantidade 1, sem medidas.'],
    ['m² parede', 10, 'Revestimento entre móveis e zonas húmidas. Estimativa.'],
    ['m² total', 20, 'Pavimento + parede.'],
    ['pontos de água', 3, 'Lava-loiça, máquina da loiça, máquina da roupa.'],
    ['pontos elétricos', 12, 'Tomadas, iluminação, circuitos de forno e placa. Estimativa.'],
    ['módulos de móveis', 10, 'Módulos inferiores e superiores. Estimativa.'],
    ['eletrodomésticos', 4, 'Mediana de "Instalação de Eletrodomésticos de Cozinha" nos orçamentos (4 unidades).'],
    ['ml de bancada', 3, 'Estimativa.'],
  ],
};
const LISTA_MEDIDAS = ['só fixo', ...new Set(Object.values(MEDIDAS).flat().map(m => m[0]))];

// [cód, tarefa, fase, ofício, depende de [], espera antes (h), origem da espera, condição, quem executa, alteração face ao manual,
//  pessoas, horas fixas, horas por medida, medida, base da estimativa, modelos parciais]
const WC = [
  ['1.1', 'Isolamento e proteção da área', 1, 'Geral', [], 0, '', '', 'Equipa de obra', 'O manual repete esta proteção dentro da 1.2 e da 1.3. Aqui fica uma só vez.',
    1, 2, 0, 'só fixo', 'Exemplo da aplicação: 1 h. +1 h para casa habitada. A aprender com: habitada, mobilada, nº de portas, distância à entrada.', '0, 1, 2, 3'],
  ['1.2', 'Desligar redes e desmontar louças, móveis e acessórios', 1, 'Demolições', ['1.1'], 0, '', '', 'Equipa de obra', 'O manual 1.2 inclui também a remoção de revestimentos, que se sobrepõe à 1.3. Passou para a 1.3.',
    1, 1, 0.5, 'peças sanitárias', 'Exemplo da aplicação: 1,5 h. Mais o desligar das redes.', '0, 1, 2, 3 (banheira ou poliban)'],
  ['1.3', 'Demolição de revestimentos, pavimentos, paredes e tetos', 1, 'Demolições', ['1.2'], 0, '', '', 'Equipa de obra', 'Junta a remoção de revestimentos (manual 1.2) com a demolição (manual 1.3).',
    2, 2, 0.6, 'm² total', 'Exemplo da aplicação: 5 h só para revestimentos. Manual: fase 1 = 2–3 dias.', '0, 1, 2, 3 (só a zona do duche)'],
  ['1.4', 'Retirada de entulho e limpeza', 1, 'Geral', ['1.3'], 0, '', '', 'Equipa até ao contentor; vazadouro: armazém', 'O manual remete para um "ponto 3.3" que não existe.',
    1, 1, 0.15, 'm² total', 'Exemplo da aplicação: 2 h. A aprender com: elevador, andar, distância à entrada.', '0, 1, 2, 3'],
  ['1.5', 'Levantamento de materiais em armazém', 1, 'Logística', [], 0, '', '', 'Armazém', 'É logística: corre em paralelo com 1.1–1.4 e tem de estar feita antes da 2.1.',
    1, 3, 0, 'só fixo', 'Estimativa. Fora do caminho crítico.', '0, 1, 2, 3'],
  ['2.1', 'Canalização (água e esgotos)', 2, 'Canalização', ['1.4', '1.5'], 0, '', '', 'Canalizador', 'O fecho de roços passou para a 2.4 (só se fecha depois dos ensaios).',
    1, 6, 4, 'pontos de água', 'Exemplo da aplicação: 6 h (adaptação). Manual: fase 2 = 4–5 dias, com substituição total das redes.', '2, 3 (elevação da torneira)'],
  ['2.2', 'Instalação elétrica (iluminação, tomadas, ventilação)', 2, 'Eletricidade', ['1.4', '1.5'], 0, '', '', 'Eletricista', 'Em paralelo com a 2.1 (a confirmar).',
    1, 3, 1.5, 'pontos elétricos', 'Exemplo da aplicação: 4 h.', '—'],
  ['2.3', 'Preparação para aquecimento (toalheiro elétrico)', 2, 'Eletricidade', ['2.2'], 0, '', 'Só se o orçamento tiver toalheiro elétrico', 'Eletricista', 'O manual diz "se aplicável".',
    1, 2, 0, 'só fixo', 'Estimativa.', '—'],
  ['2.4', 'Ensaios (água, esgotos, elétrico) e fecho de roços', 2, 'Canalização', ['2.1', '2.2', '2.3'], 0, '', '', 'Canalizador + eletricista', 'NOVA. O quadro do manual põe "Testes e selagem" na fase 2, mas o detalhe não tem a tarefa (a cozinha tem: 2.4).',
    1, 6, 0, 'só fixo', 'Exemplo da aplicação: ensaio 1 h. Mais o fecho de roços.', '2, 3'],
  ['3.1', 'Regularização do pavimento (betonilha)', 3, 'Revestimentos', ['2.4'], 0, '', '', 'Pedreiro', 'O manual 3.1 junta betonilha e impermeabilização. Separadas por causa da cura.',
    1, 2, 0.75, 'm² pavimento', 'Exemplo da aplicação: 4 h (com regularização de paredes).', '0, 1, 2, 3 (base do duche)'],
  ['3.2', 'Impermeabilização de paredes e pavimento', 3, 'Revestimentos', ['3.1'], 48, 'Cura húmida da betonilha ≥ 48 h (manual 3.1)', '', 'Pedreiro', '',
    1, 1, 0.3, 'm² total', 'Exemplo da aplicação: 2 h (só a base do duche).', '0, 1, 2, 3'],
  ['3.3', 'Assentamento de azulejo e mosaico', 3, 'Revestimentos', ['3.2'], 0, 'Secagem da impermeabilização: o manual não diz quanto', '', 'Azulejista + ajudante', '',
    2, 2, 1.0, 'm² total', 'Exemplo da aplicação: 12 h para 1 pessoa (pavimento 5 h + paredes 7 h). Proposta: azulejista + ajudante.', '0, 1, 2, 3 (a altura do revestimento muda os m²)'],
  ['3.4', 'Betumação de juntas e limpeza', 3, 'Revestimentos', ['3.3'], 24, 'Cura da cola, geralmente 24 h (manual 3.2)', '', 'Azulejista', 'Separada da 3.3 por causa da cura da cola.',
    1, 1, 0.2, 'm² total', 'Exemplo da aplicação: 2 h.', '0, 1, 2, 3'],
  ['3.5', 'Teto falso, pintura do teto, sancas e rodapés', 3, 'Pintura', ['2.4'], 0, '', '', 'Pintor / estucador', 'PROPOSTA: corre durante a cura da betonilha (outro ofício, a mesma divisão parada). O manual põe-na depois do azulejo.',
    1, 4, 1.0, 'm² pavimento', 'Exemplo da aplicação: pintura 2 h. Mais o teto falso com focos (incluído no pacote).', '—'],
  ['4.1', 'Montagem de louças sanitárias', 4, 'Canalização', ['3.4', '3.5'], 24, 'Cura das juntas: "1 dia entre fase 3 e 4" (manual)', '', 'Canalizador', '',
    1, 2, 1.5, 'peças sanitárias', 'Exemplo da aplicação: 4 h.', '0, 1, 2, 3 (base de duche)'],
  ['4.2', 'Torneiras, acessórios, espelhos e mobiliário', 4, 'Carpintaria', ['4.1'], 0, '', '', 'Montador', '',
    1, 2, 1.0, 'acessórios e móveis', 'Exemplo da aplicação: 2 h.', '0, 1, 2, 3 (torneira, resguardo)'],
  ['4.3', 'Ligação de equipamentos elétricos (iluminação, ventilação)', 4, 'Eletricidade', ['3.4', '3.5'], 24, 'Depois da cura das juntas, com o espaço limpo', '', 'Eletricista', '',
    1, 1, 0.5, 'pontos elétricos', 'Estimativa.', '—'],
  ['4.4', 'Selagens, retoques, limpeza final e entrega', 4, 'Geral', ['4.2', '4.3'], 0, '', '', 'Equipa de obra', 'Inclui a vistoria com o cliente (está no exemplo da aplicação, não no manual).',
    1, 4, 0.1, 'm² total', 'Exemplo da aplicação: limpeza 1,5 h + vistoria 45 min. Mais as selagens.', '0, 1, 2, 3'],
];

const COZ = [
  ['1.1', 'Isolamento e proteção da área', 1, 'Geral', [], 0, '', '', 'Equipa de obra', 'O manual repete esta proteção dentro de outras tarefas. Aqui fica uma só vez.',
    1, 2, 0, 'só fixo', 'Cozinha de demonstração da aplicação: 1 h. +1 h para casa habitada. A aprender com: habitada, mobilada, portas, distância.', ''],
  ['1.2', 'Desligar e proteger pontos de água, gás e eletricidade', 1, 'Canalização', ['1.1'], 0, '', '', 'Canalizador + eletricista', 'No manual é a 1.4, depois da desmontagem; veio para antes, porque desmontar exige as redes desligadas.',
    1, 2, 0, 'só fixo', 'Estimativa.', ''],
  ['1.3', 'Desmontagem de móveis e eletrodomésticos', 1, 'Carpintaria', ['1.2'], 0, '', '', 'Montador', '',
    2, 2, 0.5, 'módulos de móveis', 'Cozinha de demonstração: 3 h.', ''],
  ['1.4', 'Remoção de revestimentos, pavimentos e demolições', 1, 'Demolições', ['1.3'], 0, '', '', 'Equipa de obra', 'Junta a 1.3 e a 1.5 do manual, que se sobrepõem.',
    2, 2, 0.8, 'm² total', 'Cozinha de demonstração: 5 h só para azulejo e reboco. Manual: fase 1 = 3–4 dias.', ''],
  ['1.5', 'Retirada de entulho e limpeza', 1, 'Geral', ['1.4'], 0, '', '', 'Equipa até ao contentor; vazadouro: armazém', 'O manual remete para um "ponto 3.3" que não existe.',
    1, 1, 0.2, 'm² total', 'Cozinha de demonstração: 2 h. A aprender com: elevador, andar, distância.', ''],
  ['1.6', 'Levantamento de materiais em armazém', 1, 'Logística', [], 0, '', '', 'Armazém', 'É logística: corre em paralelo com 1.1–1.5 e tem de estar feita antes da 2.1.',
    1, 3, 0, 'só fixo', 'Estimativa. Fora do caminho crítico.', ''],
  ['2.1', 'Canalização (água e esgotos)', 2, 'Canalização', ['1.5', '1.6'], 0, '', '', 'Canalizador', '',
    1, 4, 4, 'pontos de água', 'Cozinha de demonstração: 6 h.', ''],
  ['2.2', 'Instalação elétrica (iluminação, tomadas, circuitos de forno e placa)', 2, 'Eletricidade', ['1.5', '1.6'], 0, '', '', 'Eletricista', 'Em paralelo com a 2.1 (a confirmar).',
    1, 6, 2, 'pontos elétricos', 'Cozinha de demonstração: 5 h só para circuitos. Manual: fase 2 = 5–7 dias.', ''],
  ['2.3', 'Instalação de gás', 2, 'Gás (ITG)', ['1.5', '1.6'], 0, '', 'Só se o orçamento tiver gás', 'Técnico credenciado ITG', 'O manual diz "se aplicável".',
    1, 6, 0, 'só fixo', 'Estimativa.', ''],
  ['2.4', 'Testes de estanquidade e funcionamento e fecho de roços', 2, 'Canalização', ['2.1', '2.2', '2.3'], 0, '', '', 'Canalizador + eletricista (+ ITG)', 'O fecho de roços passou para aqui (só se fecha depois dos testes).',
    1, 8, 0, 'só fixo', 'Cozinha de demonstração: ensaio 1 h. Mais o fecho de roços.', ''],
  ['3.1', 'Regularização do pavimento (betonilha)', 3, 'Revestimentos', ['2.4'], 0, '', '', 'Pedreiro', 'O manual 3.1 junta betonilha e impermeabilização. Separadas por causa da cura.',
    1, 2, 0.5, 'm² pavimento', 'Cozinha de demonstração: 4 h.', ''],
  ['3.2', 'Impermeabilização (zonas húmidas)', 3, 'Revestimentos', ['3.1'], 48, 'Cura húmida da betonilha ≥ 48 h (manual 3.1)', '', 'Pedreiro', 'Em toda a área ou só nas zonas húmidas? (perguntas)',
    1, 1, 0.2, 'm² pavimento', 'Estimativa.', ''],
  ['3.3', 'Assentamento de azulejo e pavimento', 3, 'Revestimentos', ['3.2'], 0, 'Secagem da impermeabilização: o manual não diz quanto', '', 'Azulejista + ajudante', '',
    2, 2, 1.0, 'm² total', 'Cozinha de demonstração: 7 h só para revestimento. Proposta: azulejista + ajudante.', ''],
  ['3.4', 'Betumação de juntas e limpeza', 3, 'Revestimentos', ['3.3'], 24, 'Cura da cola, geralmente 24 h (manual 3.2)', '', 'Azulejista', 'Separada da 3.3 por causa da cura da cola.',
    1, 1, 0.2, 'm² total', 'Estimativa.', ''],
  ['3.5', 'Teto falso, pintura, sancas e rodapés', 3, 'Pintura', ['2.4'], 0, '', '', 'Pintor / estucador', 'PROPOSTA: corre durante a cura da betonilha (outro ofício). O manual põe-na depois do azulejo.',
    1, 4, 0.8, 'm² pavimento', 'Estimativa (inclui teto falso com 3 focos, que está no pacote).', ''],
  ['4.1', 'Montagem dos móveis', 4, 'Carpintaria', ['3.4', '3.5'], 24, 'Cura das juntas: "1 dia entre fase 3 e 4" (manual)', '', 'Montador', 'O manual junta móveis e bancadas na 4.1; separadas.',
    2, 4, 1.5, 'módulos de móveis', 'Cozinha de demonstração: 8 h para móveis e bancada.', ''],
  ['4.2', 'Medição da bancada', 4, 'Marmorista', ['4.1'], 0, '', '', 'Marmorista', 'NOVA. A bancada de pedra mede-se com os móveis montados.',
    1, 1, 0, 'só fixo', 'Estimativa.', ''],
  ['4.3', 'Colocação da bancada', 4, 'Marmorista', ['4.2'], 120, 'Prazo de fabrico da bancada: 5 dias (estimativa)', '', 'Marmorista', 'NOVA. Se o marmorista receber as medidas do projeto antes da obra (como se falou na reunião de 02/10), a espera desaparece.',
    2, 2, 1.0, 'ml de bancada', 'Estimativa.', ''],
  ['4.4', 'Instalação de eletrodomésticos', 4, 'Carpintaria', ['4.3'], 0, '', '', 'Montador', 'Depois da bancada (placa e lava-loiça embutidos).',
    1, 1, 1.0, 'eletrodomésticos', 'Estimativa: 1 h por eletrodoméstico.', ''],
  ['4.5', 'Ligações de água, gás e eletricidade', 4, 'Canalização', ['4.4'], 0, '', '', 'Canalizador + eletricista (+ ITG)', '',
    1, 2, 1.0, 'pontos de água', 'Estimativa.', ''],
  ['4.6', 'Selagens, retoques, limpeza final e entrega', 4, 'Geral', ['4.5'], 0, '', '', 'Equipa de obra', 'Inclui a vistoria com o cliente (está na cozinha de demonstração, não no manual).',
    1, 4, 0.1, 'm² total', 'Cozinha de demonstração: limpeza 2 h + vistoria 45 min. Mais as selagens.', ''],
];

// [pacote, serviço, nº orçamentos, qt mediana, unidade, encaixe sugerido, nota, ofício, horas fixas, horas por unidade]
const EXTRAS = [
  ['Casa de banho', 'Levantamento de Sanitários e Mobiliário', 133, 1, '', '1.2', 'É a mesma coisa que a 1.2? Se se vende à parte, a 1.2 sai do pacote?', 'Demolições', 2, 0],
  ['Casa de banho', 'Supressão de ponto de água', 101, 1, 'un', '2.1', '', 'Canalização', 0, 1.5],
  ['Casa de banho', 'Mão de Obra Construção de Nicho (valor por unidade)', 86, 1, 'un', 'Entre 2.4 e 3.2', 'Alvenaria antes de impermeabilizar.', 'Revestimentos', 0, 3],
  ['Casa de banho', 'Instalação de Revestimento m2', 46, 8, 'm²', '3.3', 'É o único sítio onde aparecem os m² da casa de banho.', 'Revestimentos', 0, 1],
  ['Casa de banho', 'Mão de Obra Demolição de parede m2', 35, 3, 'ml', '1.3', 'A unidade no orçamento é "ml" num serviço "m2".', 'Demolições', 0, 0.8],
  ['Casa de banho', 'Instalação de Pavimento m2', 23, 5, 'm²', '3.3', '', 'Revestimentos', 0, 1],
  ['Casa de banho', 'Anulação de Ponto de Gás', 22, 1, 'un', '2.1', 'Exige técnico ITG?', 'Gás (ITG)', 2, 0],
  ['Casa de banho', 'Mão de Obra Levantamento de parede em Alvenaria m2', 21, 2, 'm²', 'Entre 1.4 e 2.1', 'A parede tem de existir antes das redes que passam nela.', 'Revestimentos', 1, 1.5],
  ['Casa de banho', 'Instalação de Mobiliário WC', 21, 1, 'un', '4.2', '', 'Carpintaria', 0, 2],
  ['Casa de banho', 'Instalação de Coluna de Duche', 19, 1, 'un', '4.2', '', 'Canalização', 0, 1.5],
  ['Casa de banho', 'Colocação de Serigrafia para Resguardo', 18, 1, 'un', '4.2', '', 'Carpintaria', 0, 1],
  ['Casa de banho', 'Construção de Murete em Alvenaria até 80cm', 17, 1, 'un', 'Entre 2.4 e 3.2', '', 'Revestimentos', 0, 4],
  ['Casa de banho', 'Instalação de Sanita Compacta', 14, 1, 'un', '4.1', '', 'Canalização', 0, 2],
  ['Casa de banho', 'Instalação de Resguardo', 12, 1, 'un', '4.2', '', 'Carpintaria', 0, 2],
  ['Casa de banho', 'Instalação de Eletrodoméstico a Gás', 12, 1, 'un', '4.2', 'Esquentador? Exige técnico ITG?', 'Gás (ITG)', 0, 2],
  ['Casa de banho', 'Mão de Obra - Deslocação de Ponto de Água ML', 12, 1, 'ml', '2.1', '', 'Canalização', 0, 1.5],
  ['Casa de banho', 'Instalação de Banheira de Pousar', 10, 1, 'un', '4.1', '', 'Canalização', 0, 3],
  ['Casa de banho', 'Instalação de torneira de lavatório', 10, 1, 'un', '4.2', '', 'Canalização', 0, 0.75],
  ['Casa de banho', 'Instalação de Espelho com LED', 9, 1, 'un', '4.2 + 4.3', 'Montagem e ligação elétrica.', 'Eletricidade', 0, 1],
  ['Casa de banho', 'Instalação de Acessórios WC', 8, 1, 'un', '4.2', '', 'Carpintaria', 0, 0.5],
  ['Casa de banho', 'Mão de Obra - Deslocação de Ponto de Esgoto ML', 8, 1.5, 'ml', '2.1', '', 'Canalização', 0, 2],
  ['Casa de banho', 'Instalação de Lavatório Cerâmica', 7, 1, 'un', '4.1', '', 'Canalização', 0, 1.5],
  ['Casa de banho', 'Instalação de Bidé Compacto', 6, 1, 'un', '4.1', '', 'Canalização', 0, 1.5],
  ['Casa de banho', 'Instalação de Acessório de segurança WC', 6, 1.5, 'un', '4.2', '', 'Carpintaria', 0, 0.5],
  ['Casa de banho', 'Mão de Obra Abertura e Fecho de Roço c/ Acabamento ml', 5, 4, 'ml', '2.1 / 2.4', '', 'Canalização', 0, 1],
  ['Casa de banho', 'Instalação de Vidro Lateral Fixo', 5, 1, 'un', '4.2', '', 'Carpintaria', 0, 1.5],
  ['Casa de banho', 'Instalação de Torneira de Bidé', 5, 1, 'un', '4.2', '', 'Canalização', 0, 0.75],
  ['Casa de banho', 'Instalação de Toalheiros Eletricos', 5, 1, 'un', '2.3 + 4.3', 'Liga a tarefa condicional 2.3.', 'Eletricidade', 0, 1.5],
  ['Casa de banho', 'Instalação de Ventaxia WC', 5, 1, 'un', '2.2 + 4.3', '', 'Eletricidade', 0, 1.5],
  ['Cozinha', 'Projeto 3D 3 imagens - Clientes BMLAR', 123, 1, 'un', 'Antes da obra', 'Não é trabalho no local: fica fora do Gantt.', '—', 0, 0],
  ['Cozinha', 'Instalação de Eletrodomésticos de Cozinha', 122, 4, 'un', '4.4', 'Já contado na 4.4 (1 h por eletrodoméstico)?', 'Carpintaria', 0, 1],
  ['Cozinha', 'Instalação Estrutura para gaveta (valor unitário)', 86, 4, 'un', '4.1', '', 'Carpintaria', 0, 0.3],
  ['Cozinha', 'Mão de Obra Demolição de parede m2', 75, 4, 'un', '1.4', 'A unidade no orçamento é "un" num serviço "m2".', 'Demolições', 0, 0.8],
  ['Cozinha', 'Instalação Estrutura para gavetão (valor unitário)', 74, 2, 'un', '4.1', '', 'Carpintaria', 0, 0.4],
  ['Cozinha', 'Instalação de Eletrodoméstico a Gás', 54, 1, 'un', '4.4 + 4.5', 'Exige técnico ITG.', 'Gás (ITG)', 0, 2],
  ['Cozinha', 'Instalação de Eletrodomésticos Mudelar', 46, 4, 'un', '4.4', '', 'Carpintaria', 0, 1],
  ['Cozinha', 'Anulação de Ponto de Gás', 42, 1, 'un', '2.3', 'Liga a tarefa condicional 2.3.', 'Gás (ITG)', 2, 0],
  ['Cozinha', 'Instalação de Gás nas Paredes', 28, 1, 'un', '2.3', 'Liga a tarefa condicional 2.3.', 'Gás (ITG)', 6, 0],
  ['Cozinha', 'Passagem de fio Eletrico fase/neutro 1,5mm² ML', 17, 4, 'ml', '2.2', '', 'Eletricidade', 0, 0.15],
  ['Cozinha', 'Instalação Vista superior até 20cm de altura (valor p/ml)', 14, 4, 'ml', '4.1', '', 'Carpintaria', 0, 0.3],
  ['Cozinha', 'Mão de Obra Levantamento de parede em Alvenaria m2', 14, 2, 'm²', 'Entre 1.5 e 2.1', '', 'Revestimentos', 1, 1.5],
  ['Cozinha', 'Mão de Obra Abertura e Fecho de Roço c/ Acabamento ml', 13, 2.5, 'ml', '2.1 / 2.4', '', 'Canalização', 0, 1],
  ['Cozinha', 'Instalação Estrutura de Gavetões Internos para dispenseiro (valor até 4 unidades)', 12, 1, 'un', '4.1', '', 'Carpintaria', 0, 1],
  ['Cozinha', 'Certificação de Gás', 8, 1, 'un', 'Depois de 4.5', 'Técnico ITG; marca-se com antecedência?', 'Gás (ITG)', 2, 0],
  ['Cozinha', 'Instalação de torneira de Cozinha', 7, 1, 'un', '4.5', '', 'Canalização', 0, 0.75],
  ['Cozinha', 'Instalação de Rodapé ML', 7, 25, 'ml', '3.5', '', 'Pintura', 0, 0.25],
  ['Cozinha', 'Instalação de Lava Loiça', 6, 1, 'un', '4.5', '', 'Canalização', 0, 1],
  ['Cozinha', 'Mão de Obra - Deslocação de Ponto de Esgoto ML', 6, 1.5, 'ml', '2.1', '', 'Canalização', 0, 2],
];

export { FASES, MEDIDAS, LISTA_MEDIDAS, WC, COZ, EXTRAS };
