// 25/11 (Rúben: «tenho o infraspeak aberto porque tem lá as tasks reais… preciso que vejas as tasks para meter na olyvia»). As tarefas
// reais da Mudelar no Infraspeak (Definições › Manutenções › 800 - MUDELAR), lidas só em consulta a 25/11/2026: 801 Remodelação Cozinha e
// 802 Remodelação Casa de Banho, por fase (0 Retificação de medidas … 4 Montagem final, 5 Entrega). Cada tarefa tem o grupo (o 2.º número
// do código do Infraspeak), o nome, as horas previstas, quem faz e a checklist. A cópia completa está em
// Downloads «Infraspeak Mudelar tarefas 2026-11-25.json». Gerado; não editar à mão (microtarefasMudelar.ts usa-o).
export interface TarefaMudelar { g: number; n: string; h?: number; quem: string; det: string[] }
export interface FaseMudelar { obra: "cozinha" | "wc"; fase: number; nome: string; tarefas: TarefaMudelar[] }
export const FASES_MUDELAR: FaseMudelar[] = [
 {
  "obra": "cozinha",
  "fase": 0,
  "nome": "Retificação de medidas",
  "tarefas": [
   {
    "g": 0,
    "n": "Retificação de Medidas",
    "h": 1.0,
    "quem": "Auditor",
    "det": [
     "Retificação de Medidas"
    ]
   }
  ]
 },
 {
  "obra": "cozinha",
  "fase": 1,
  "nome": "Trabalhos Preparatórios e Demolições",
  "tarefas": [
   {
    "g": 1,
    "n": "Delimitação da Zona de Intervenção",
    "h": 1.0,
    "quem": "Polivalente",
    "det": [
     "Marcação física dos limites da área de obra, incluindo portas, janelas e acessos.",
     "Colocação de fitas de sinalização e/ou barreiras físicas (painéis de MDF, PVC ou estruturas metálicas leves).",
     "Instalação de portas temporárias com fecho magnético ou zip doors em plástico reforçado, permitindo acesso controlado sem dispersão de poeiras."
    ]
   },
   {
    "g": 1,
    "n": "Proteção do Pavimento Existente",
    "h": 1.0,
    "quem": "Polivalente",
    "det": [
     "Aplicação de mantas protetoras, painéis de MDF, cortiça, cartão canelado ou telas de polietileno sobre pisos adjacentes (corredores, escadas, halls).",
     "Fixação com fita adesiva apropriada (não agressiva) nas juntas, garantindo estabilidade e evitando escorregamentos.",
     "Em zonas de carga e descarga de materiais, reforço com chapas de compensado ou tapetes de borracha."
    ]
   },
   {
    "g": 1,
    "n": "Proteção de Paredes, Rodapés e Portas",
    "h": 1.0,
    "quem": "Polivalente",
    "det": [
     "Cobertura de superfícies verticais com plástico de alta densidade (200 micras) ou telas não-tecidas.",
     "Envolvimento de rodapés e cantos com fita protetora e espuma de canto.",
     "Cobertura temporária de portas e aros com filme plástico ou papel kraft."
    ]
   },
   {
    "g": 1,
    "n": "Isolamento Contra Poeiras e Ruído",
    "h": 0.5,
    "quem": "Polivalente",
    "det": [
     "Montagem de barreiras anti-pó (Dust Barriers) entre a área de obra e o resto da habitação, com estrutura telescópica ou fita dupla face.",
     "Se possível, instalação de sistemas de ventilação temporária, com exaustão controlada de ar para o exterior.",
     "Utilização de máquinas aspiradoras industriais durante demolições para reduzir poeiras suspensas."
    ]
   },
   {
    "g": 1,
    "n": "Proteção de Instalações e Equipamentos Existentes",
    "h": 1.0,
    "quem": "Polivalente",
    "det": [
     "Isolamento de tomadas elétricas, caixas de derivação e interruptores com fita isoladora.",
     "Cobertura de luminárias, radiadores e outros elementos fixos.",
     "Proteção de janelas e caixilharias com película adesiva de baixa aderência."
    ]
   },
   {
    "g": 1,
    "n": "Verificação e Manutenção Diária",
    "h": 0.5,
    "quem": "Empreiteiro Geral",
    "det": [
     "Inspeção diária do estado das proteções e substituição de elementos danificados.",
     "Manutenção de corredores limpos e acessos desobstruídos.",
     "Reforço das proteções sempre que se altere o tipo de trabalho (por exemplo, passagem de demolições para rebocos ou pintura)."
    ]
   },
   {
    "g": 2,
    "n": "Levantamento e registo prévio",
    "h": 0.17,
    "quem": "Empreiteiro Geral",
    "det": [
     "Inspeção visual do estado dos móveis e equipamentos existentes.",
     "Registo fotográfico da disposição original (útil para reinstalações ou comparações futuras).",
     "Identificação de elementos a reutilizar, armazenar ou descartar.",
     "Desligamento prévio das redes:; Água fria/quente e esgotos;; Energia elétrica (desligar quadro parcial, tomadas e cabos diretos);; Gás, se aplicável (com fecho de válvula principal)."
    ]
   },
   {
    "g": 2,
    "n": "Desmontagem de móveis superiores e inferiores",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Remoção faseada, de cima para baixo, para evitar riscos de queda.",
     "Retirada de prateleiras, portas e ferragens (dobradiças, puxadores, amortecedores).",
     "Desparafusamento de módulos à parede, com ferramentas adequadas (chave de impacto, berbequim, etc.).",
     "Identificação e acondicionamento das peças reutilizáveis ou de valor.",
     "Retirada de tampas e bancadas, incluindo selagens e fixações a paredes."
    ]
   },
   {
    "g": 2,
    "n": "Desmontagem e remoção de eletrodomésticos",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Desligamento seguro da corrente elétrica e das ligações de água/gás.",
     "Desconexão de equipamentos integrados (máquina de lavar, forno, frigorífico, placa, exaustor).",
     "Proteção temporária dos cabos e tubos para evitar danos.",
     "Remoção física com apoio de carrinho de transporte ou duas pessoas, garantindo ergonomia e segurança.",
     "Armazenamento temporário em zona seca e ventilada, fora da área de obra."
    ]
   },
   {
    "g": 2,
    "n": "Desmontagem de tampos, rodapés e acessórios",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Retirada de tampos e bancadas em pedra, madeira ou compósito, com auxílio de ventosas ou ferramentas adequadas.",
     "Desparafusamento de rodapés, calhas e perfis metálicos.",
     "Corte controlado de selagens de silicone para libertar junções.",
     "Proteção dos elementos removidos com mantas ou espuma de bolha, se forem reaproveitados."
    ]
   },
   {
    "g": 2,
    "n": "Limpeza e remoção de resíduos",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Recolha e transporte dos materiais desmontados e resíduos para o local de armazenamento temporário ou destino final (ecocentro/licenciado).",
     "Separação entre materiais reutilizáveis, recicláveis e resíduos mistos.",
     "Limpeza inicial do espaço, deixando a zona livre de obstáculos para a próxima fase (demolições ou instalações)."
    ]
   },
   {
    "g": 3,
    "n": "Preparação da área de trabalho",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Delimitação da zona de intervenção com barreiras e sinalização (plásticos, fitas, painéis).",
     "Proteção das zonas adjacentes (portas, pavimentos de acesso, janelas, mobiliário fixo) com mantas ou plástico reforçado.",
     "Desligamento de redes elétricas e hidráulicas próximas à área de trabalho.",
     "Verificação estrutural preliminar — identificar zonas de parede ou piso com possível fragilidade."
    ]
   },
   {
    "g": 3,
    "n": "Remoção de revestimentos de parede",
    "h": 8,
    "quem": "Empreiteiro Geral",
    "det": [
     "Desmontagem de elementos de acabamento (espelhos, prateleiras, tomadas, acessórios).",
     "Corte das juntas com rebarbadora ou espátula de corte para soltar o primeiro azulejo.",
     "Remoção manual ou mecânica dos azulejos com martelo e talhadeira, ou martelo pneumático leve (máx. 3–5 kg).",
     "Limpeza do suporte (reboco ou alvenaria), retirando restos de argamassa ou cola antiga.",
     "Avaliação do estado da parede — decidir se deve ser reaproveitada, regularizada ou demolida."
    ]
   },
   {
    "g": 3,
    "n": "Remoção de pavimentos",
    "h": 8,
    "quem": "Empreiteiro Geral",
    "det": [
     "Levantamento do rodapé com ferramenta de ponta fina.",
     "Descolagem do pavimento cerâmico, mosaico ou madeira com martelo pneumático e espátula larga.",
     "Retirada da camada de assentamento (argamassa, betume ou cola), até expor a base sólida.",
     "Verificação do estado da betonilha ou laje estrutural — corrigir fissuras, destacamentos ou zonas com humidade.",
     "Caso o pavimento seja vinílico ou de PVC, usar soprador térmico e raspador metálico para remoção de cola."
    ]
   },
   {
    "g": 3,
    "n": "Gestão de entulho e limpeza",
    "h": 8,
    "quem": "Empreiteiro Geral",
    "det": [
     "Recolha imediata do entulho com pás e sacos resistentes.",
     "Armazenamento temporário em local definido, protegido e de fácil acesso.",
     "Transporte para contentor ou local de descarga autorizado (ecocentro, operador licenciado).",
     "Varredura e aspiração final da superfície, removendo poeiras e detritos soltos.",
     "O espaço deve ficar limpo, seco e pronto para nova impermeabilização ou regularização."
    ]
   },
   {
    "g": 4,
    "n": "Levantamento e identificação dos pontos de ligação",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Inspeção detalhada da rede hidráulica e elétrica existente (torneiras, sifões, válvulas, tomadas, interruptores, caixas de derivação, eletrodomésticos ligados).",
     "Identificação e marcação dos pontos ativos com fita ou etiquetas (ex: “Água fria”, “Tomada forno”, “Circuito iluminação”).",
     "Consulta dos quadros elétricos e válvulas de seccionamento da habitação para planeamento do desligamento geral ou parcial."
    ]
   },
   {
    "g": 4,
    "n": "Desligamento de rede elétrica",
    "h": 4.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Desligar o disjuntor principal ou circuito específico correspondente à zona em remodelação.",
     "Testar a ausência de tensão em tomadas, interruptores e fios com multímetro ou detector de corrente.",
     "Isolar os cabos expostos com fita isoladora de alta resistência e tampas de segurança.",
     "Retirar aparelhos embutidos (tomadas, interruptores, focos) quando necessário, deixando as caixas seladas com fita de vedação.",
     "Caso a instalação vá ser parcialmente reaproveitada, identificar e proteger os circuitos que continuarão em uso (ex: frigorífico numa cozinha)."
    ]
   },
   {
    "g": 4,
    "n": "Desligamento da rede de água",
    "h": 4.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Fechar as válvulas de corte locais (torneiras de segurança) ou, se inexistentes, a válvula geral de entrada de água da divisão ou da habitação.",
     "Abrir as torneiras para aliviar a pressão residual e drenar a água remanescente nas tubagens.",
     "Desmontar flexíveis, sifões e ligações dos pontos de utilização (lavatório, sanita, lava-louça, máquina de lavar).",
     "Tamponar as extremidades das tubagens com tampões de PVC, rolhas roscadas ou vedantes temporários para evitar entrada de pó ou retorno de água.",
     "Em caso de rede antiga (ferro ou cobre oxidado), aplicar lubrificante de roscas e manusear com cuidado para evitar ruturas."
    ]
   },
   {
    "g": 4,
    "n": "Proteção física dos pontos e condutas",
    "h": 2.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Selar todas as saídas de água e caixas elétricas expostas com fita adesiva, silicone temporário ou película plástica.",
     "Instalar tampas de proteção ou caixas cegas nas aberturas elétricas.",
     "Proteger as tubagens aparentes com tubo corrugado, manga isolante ou espuma de polietileno.",
     "Garantir que os cabos e condutas são devidamente fixos e não ficam soltos durante a obra."
    ]
   },
   {
    "g": 4,
    "n": "Verificação final e registo",
    "h": 0.5,
    "quem": "Empreiteiro Geral",
    "det": [
     "Confirmar que não há fugas nem corrente elétrica ativa.",
     "Registar no diário de obra ou ficha técnica as ações executadas: pontos desligados, data, responsável e observações.",
     "Sinalizar as zonas “sem tensão” e “sem água” para conhecimento de todos os intervenientes.",
     "Manter o acesso às válvulas e quadros desobstruído, em caso de necessidade de reativação temporária."
    ]
   },
   {
    "g": 5,
    "n": "Preparação e segurança do local",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Isolar completamente a zona de trabalho com plásticos, fita de sinalização e painéis temporários para evitar dispersão de poeiras e fragmentos.",
     "Proteger portas, caixilhos, pavimentos e corredores adjacentes com mantas protetoras, cartão canelado e fita adesiva.",
     "Desligar as redes de água e eletricidade da divisão antes do início da demolição.",
     "Confirmar a localização exata das canalizações, esgotos e cabos elétricos com detetor multifuncional (scanner de parede).",
     "Garantir ventilação adequada e uso obrigatório de EPI: capacete, luvas, óculos, máscara antipó (FFP2 ou superior), botas com biqueira e protetores auriculares."
    ]
   },
   {
    "g": 5,
    "n": "Demolição de paredes (parcial ou total)",
    "h": 4.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Executar levantamento prévio da estrutura existente, identificando se as paredes são:; Divisórias não estruturais (tijolo furado, bloco cerâmico ou pladur);; Paredes estruturais ou de suporte (nunca demolir sem parecer técnico).",
     "Iniciar a demolição de cima para baixo, removendo primeiro os revestimentos (azulejos, rebocos, argamassas).",
     "Utilizar martelo pneumático leve (3–5 kg) ou marreta e talhadeira manual, conforme o tipo de material.",
     "Trabalhar em painéis verticais de pequena dimensão (1 m²) para evitar colapsos descontrolados.",
     "Retirar o entulho progressivamente e não acumular material junto às paredes ainda por demolir.",
     "Proteger as redes embutidas que não serão substituídas, aplicando tampões e sinalização.",
     "Armazenar e separar os resíduos (cerâmica, tijolo, argamassa) em contentores adequados para RCD."
    ]
   },
   {
    "g": 5,
    "n": "Demolição de pisos (betonilha e revestimentos)",
    "h": 4.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Iniciar pela remoção dos revestimentos cerâmicos com martelo e talhadeira.",
     "Prosseguir com a demolição da betonilha (camada de regularização) até atingir a laje estrutural, sem danificar o suporte.",
     "Executar o trabalho em faixas paralelas e controladas, evitando impactos excessivos.",
     "Verificar a presença de tubagens embutidas (esgotos, aquecimento radiante, etc.) e atuar com precaução nestas zonas.",
     "Recolher o entulho de forma contínua, evitando acumulações no pavimento.",
     "Após a demolição, efetuar limpeza e aspiração completa da laje, removendo poeira e fragmentos."
    ]
   },
   {
    "g": 5,
    "n": "Demolição de tetos (reboco, gesso ou pladur)",
    "h": 4.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Confirmar o tipo de teto existente (reboco tradicional, gesso cartonado, PVC ou alumínio).",
     "Iniciar a remoção dos elementos suspensos e perfis metálicos, desmontando secções de pequena dimensão.",
     "Cortar e remover luminárias, condutas de exaustão e cablagens antes da demolição.",
     "Trabalhar com plataforma estável ou andaime pequeno, nunca em escadas instáveis.",
     "Evitar vibrações excessivas para não afetar paredes e tetos adjacentes.",
     "Após a remoção, verificar a integridade da laje ou estrutura e eliminar resíduos de fixação (pregos, buchas, perfis)."
    ]
   },
   {
    "g": 5,
    "n": "Recolha, triagem e limpeza final",
    "h": 2.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Segregar os resíduos em conformidade com as normas de Gestão de Resíduos de Construção e Demolição (RCD):; Cerâmicos e argamassas;; Metais;; Materiais plásticos;; Madeira e gesso.",
     "Transportar o entulho para contentor autorizado e assegurar o destino final conforme legislação ambiental.",
     "Efetuar limpeza completa da área, incluindo varredura, aspiração e lavagem leve se necessário.",
     "Tamponar todas as tubagens expostas com rolhas provisórias ou fita adesiva.",
     "Deixar o espaço limpo, seco e pronto para as novas infraestruturas (fase 2)."
    ]
   },
   {
    "g": 6,
    "n": "Recolha e triagem inicial dos resíduos",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Identificação dos tipos de resíduos produzidos (ex.: cerâmica, argamassa, madeira, metal, plástico, vidro, restos de tubagem, etc.).",
     "Separação por categoria para facilitar reciclagem e destino final:1.2.1 RCD Inertes (tijolo, betão, cerâmica).; Resíduos metálicos (canalizações, ferragens).; Resíduos mistos ou indiferenciados.; Resíduos perigosos (tintas, colas, solventes) — acondicionados separadamente.; Colocação do entulho em sacos resistentes (ex. big bags, sacos de ráfia ou polietileno reforçado)."
    ]
   },
   {
    "g": 6,
    "n": "Transporte interno e armazenamento temporário",
    "h": 2.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Transporte manual ou mecanizado (carrinhos, baldes, pás, ou empilhadores ligeiros) do entulho até ao ponto de recolha.",
     "Proteção do percurso (pavimentos, corredores, elevadores) com mantas ou placas de MDF para evitar danos e sujidade."
    ]
   },
   {
    "g": 6,
    "n": "Remoção para destino final (A PARTIR DO PONTO; É RESPONSABILIDADE DO ARMAZÉM)",
    "h": 2.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Carregamento dos contentores ou big bags por meios manuais ou mecanizados (pá carregadora, grua, etc.).",
     "Deposito em contentores específicos devidamente identificados e colocados em zona segura e ventilada no armazém.",
     "Transporte para operador licenciado, conforme legislação nacional (ex.: Decreto-Lei n.º 46/2008).",
     "Acompanhamento do transporte com guia de resíduos emitida pela entidade gestora, comprovando a rastreabilidade e destino final.",
     "Registo fotográfico e documental da entrega dos resíduos, sempre que exigido pela fiscalização ou pelo dono da obra."
    ]
   },
   {
    "g": 6,
    "n": "Limpeza geral da área de trabalho",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Varredura minuciosa das superfícies (pavimento, rodapés, cantos e juntas).",
     "Remoção de poeiras e pequenos fragmentos com aspirador industrial ou escova de cerdas duras."
    ]
   },
   {
    "g": 6,
    "n": "Verificação e validação final",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Inspeção visual pelo encarregado ou técnico de obra para confirmar que a área está limpa, segura e livre de obstáculos.",
     "Registo no diário de obra da data e volume aproximado de resíduos removidos.",
     "Confirmação de que todas as zonas adjacentes (acessos, corredores, varandas, escadas) ficam em estado de limpeza equivalente."
    ]
   },
   {
    "g": 7,
    "n": "Planeamento e preparação do levantamento",
    "h": 0.5,
    "quem": "Empreiteiro Geral",
    "det": [
     "Consulta da lista de materiais aprovados no projeto e verificação das quantidades necessárias para a fase da obra.",
     "Emissão da requisição interna de materiais, com identificação de:; Tipo de material, referência e unidade de medida;; Quantidade necessária;; Local e data de utilização;; Responsável pela requisição.",
     "Coordenação com o encarregado de armazém para agendamento do levantamento, garantindo disponibilidade e organização do stock.",
     "Preparação de meios de transporte e acondicionamento adequados (paletes, caixas, cintas, coberturas)."
    ]
   },
   {
    "g": 7,
    "n": "Conferência e recolha no armazém",
    "h": 3.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Identificação dos materiais com base nas fichas técnicas e códigos internos (ex.: azulejo modelo X, tubo PEX Ø16, cimento cola tipo C2).",
     "Verificação da quantidade física (contagem, pesagem ou medição) e conformidade do lote com a nota de requisição.",
     "Inspeção visual da qualidade e integridade dos materiais:; Verificar ausência de danos (rachas, deformações, humidade, ferrugem, etc.);; Confirmar prazos de validade (em colas, tintas, argamassas, selantes).",
     "Caso seja necessário, emissão de nota de não conformidade para materiais danificados ou incorretos.",
     "Registo de saída de materiais em guia de remessa interna ou nota de transferência de stock."
    ]
   },
   {
    "g": 7,
    "n": "Carregamento e transporte",
    "h": 1.5,
    "quem": "Empreiteiro Geral",
    "det": [
     "Planeamento do transporte segundo o tipo de material:; Materiais pesados ou volumosos: utilização de empilhadores, gruas, paleteiras.; Materiais frágeis: transporte protegido com mantas, espumas e paletes estáveis.",
     "Acondicionamento e amarração segura da carga (cintas, fitas ou redes de proteção).",
     "Emissão e acompanhamento da guia de transporte ou guia de remessa até à obra.",
     "Registo do condutor, matrícula e hora de saída.",
     "No transporte de argamassas, tintas ou líquidos, garantir o não tombamento e temperatura adequada."
    ]
   },
   {
    "g": 7,
    "n": "Receção e descarga em obra",
    "h": 0.17,
    "quem": "Parceiro",
    "det": [
     "Verificação dos materiais à chegada ao estaleiro:; Conferência das quantidades e integridade física.; Confirmação com guia de remessa e assinatura de receção.",
     "Acondicionamento no local de armazenamento temporário em obra, protegido da intempérie e humidade.",
     "Organização dos materiais por tipo e prioridade de utilização (ex.: canalizações, revestimentos, colas, tintas).",
     "Atualização do mapa de controlo de materiais em obra (entradas e saídas)."
    ]
   },
   {
    "g": 7,
    "n": "Registo documental e controlo",
    "h": 0.17,
    "quem": "Parceiro",
    "det": [
     "Arquivo das guias de transporte, requisições e relatórios de controlo de qualidade.",
     "Atualização do inventário de armazém e do mapa de stock em obra.",
     "Comunicação com a equipa de gestão de obra para planear novos levantamentos ou reposições"
    ]
   }
  ]
 },
 {
  "obra": "cozinha",
  "fase": 2,
  "nome": "Infraestruturas (Instalações técnicas)",
  "tarefas": [
   {
    "g": 1,
    "n": "Levantamento e marcação",
    "h": 1.5,
    "quem": "Empreiteiro Geral",
    "det": [
     "Registo Fotográfico e Levantamento das linhas de abastecimento e drenagem existentes, identificando:; Localização e diâmetro das tubagens antigas;; Pontos de entrada/saída;; Alturas e declives dos ramais;; Possíveis interferências com outras redes (elétrica, gás, ventilação).",
     "Definição das novas rotas de canalização com base no projeto de especialidades e no layout final (lava-louça, máquina de lavar, etc.).",
     "Marcação em parede, pavimento ou teto com giz, fita ou laser para posterior rasgo."
    ]
   },
   {
    "g": 1,
    "n": "Remoção das instalações existentes",
    "h": 1.5,
    "quem": "Empreiteiro Geral",
    "det": [
     "Corte e desmontagem das tubagens antigas (PVC, cobre, ferro galvanizado ou PPR).",
     "Tamponamento temporário dos pontos de entrada e saída para evitar fugas de água ou maus cheiros.",
     "Limpeza das caleiras e caixas de visita existentes.",
     "Verificação do estado do coletor principal — decidir se mantém ou substitui conforme inspeção."
    ]
   },
   {
    "g": 1,
    "n": "Execução de rasgos e aberturas",
    "h": 2.5,
    "quem": "Empreiteiro Geral",
    "det": [
     "Abertura controlada de paredes, pavimentos e tetos falsos para passagem das novas tubagens, respeitando sempre as estruturas e armaduras existentes.",
     "Utilização de rebarbadora, martelo pneumático leve ou serra de parede, consoante o tipo de suporte.",
     "Limpeza dos rasgos e preparação das superfícies para a nova instalação."
    ]
   },
   {
    "g": 1,
    "n": "Instalação das novas tubagens",
    "h": 3.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Abastecimento de água fria e quente:; Instalação de tubagens em PEX, multicamada ou PPR com diâmetros adequados (mín. Ø16 para lavatórios e Ø20 para duches ou lavatórios duplos).; Fixação com abraçadeiras plásticas ou metálicas, respeitando espaçamentos máximos de 50–60 cm.; Interposição de mangas isolantes para evitar condensação e ruído.; Colocação de válvulas de seccionamento em pontos estratégicos (entrada, lavatório, máquina, base de duche).",
     "Rede de esgotos e ventilação:; Utilização de tubagem em PVC ou PP de parede lisa (mín. Ø40 mm para lavatórios, Ø50 mm para duches e máquinas, Ø110 mm para sanitas).; Execução dos ramais com declive mínimo de 2% para garantir o escoamento.; União com manguitos e juntas elásticas devidamente lubrificadas.; Instalação de joelhos, sifões e ventiladores secundários, conforme necessidade."
    ]
   },
   {
    "g": 1,
    "n": "Ensaios e verificação",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Ensaio de estanquidade da rede de água:; Pressurização a 6 bar durante 30 minutos, sem perdas.; Verificação de todas as uniões e conexões.",
     "Teste de escoamento na rede de esgotos:; Enchimento parcial de ramais e verificação visual de fugas.; Confirmar a ausência de ruídos e refluxos.",
     "Registo de resultados e aprovação pelo técnico responsável."
    ]
   },
   {
    "g": 1,
    "n": "Fecho dos rasgos e limpeza final",
    "h": 4.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Após aprovação dos ensaios, fecho das roços e aberturas com argamassa de enchimento (cimento/areia) ou reboco fino.",
     "Regularização das superfícies para posterior revestimento.",
     "Limpeza final das zonas de intervenção, remoção de resíduos e etiquetagem dos pontos de ligação."
    ]
   },
   {
    "g": 2,
    "n": "Levantamento e planeamento da instalação",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Análise do projeto elétrico e do layout da cozinha, identificando:; Localização de tomadas, interruptores, pontos de luz e saídas técnicas.; Potência total prevista e circuitos dedicados (forno, placa, exaustor, máquina de lavar, frigorífico, micro-ondas, termoacumulador, etc.).; Tipo de conduta (embutida ou aparente) e altura de instalação conforme normas (ex.: tomadas 1,10 m acima do piso, interruptores a 1,20 m).",
     "Verificação do quadro elétrico existente — avaliar se há necessidade de:; Novos disjuntores;; Diferenciais (ID);; Aumento de potência contratada;; Reforço de cablagem principal.",
     "Marcação no local, conforme traçado aprovado."
    ]
   },
   {
    "g": 2,
    "n": "Execução de rasgos e passagens",
    "h": 4.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Abertura controlada de roços em paredes e tetos para embutir tubagens elétricas, respeitando as zonas de segurança (verticais e horizontais).",
     "Colocação de caixas de derivação, aparelhagem e passagem (PVC ou ABS, com grau de proteção IP adequado).",
     "Fixação mecânica das tubagens (tubos corrugados de Ø16–25 mm) com abraçadeiras ou argamassa de enchimento.",
     "Em pavimentos, execução de passagens embutidas protegidas por tubo rígido ou conduta metálica, conforme o caso."
    ]
   },
   {
    "g": 2,
    "n": "Lançamento e ligação dos condutores",
    "h": 2.0,
    "quem": "Eletricista",
    "det": [
     "Introdução dos condutores elétricos (tipo H07V-U ou H07V-R) nos tubos, respeitando a codificação de cores:; Azul – Neutro (N); Castanho / Preto / Cinzento – Fase (L); Verde/Amarelo – Terra (PE)",
     "Dimensionamento das secções dos cabos conforme o circuito: Circuito Secção do Condutor Proteção Iluminação 1,5 mm² Disjuntor 10 A Tomadas gerais 2,5 mm² Disjuntor 16 A Forno / Placa 4,0 mm² (ou 6,0 mm² se necessário) Disjuntor 20–25 A Máquina lavar / Termoacumulador 2,5 mm² Disjuntor 16 A",
     "Instalação dos condutores de terra interligando todas as tomadas metálicas e aparelhos."
    ]
   },
   {
    "g": 2,
    "n": "Montagem dos equipamentos e aparelhagem",
    "h": 4.0,
    "quem": "Eletricista",
    "det": [
     "Instalação das caixas de aparelhagem embutidas (tomadas, interruptores, saídas de cabos, pontos de luz).",
     "Montagem de condutas e caixas técnicas para ligação de forno, placa, frigorífico, exaustor, micro-ondas, etc.",
     "Fixação de quadros parciais (se aplicável) e identificação dos disjuntores.",
     "Colocação de mangas protetoras em todas as passagens de cabos por paredes e tetos.",
     "Instalação de pontos de iluminação (plafons, calhas LED, focos encastrados) e ligação aos interruptores."
    ]
   },
   {
    "g": 2,
    "n": "Ensaios, medições e verificações",
    "h": 1.0,
    "quem": "Eletricista",
    "det": [
     "Teste de continuidade de condutores (fase, neutro e terra).",
     "Verificação de isolamento com megômetro (500 VDC).",
     "Teste de resistência da terra — medição inferior a 50 Ω, conforme norma.",
     "Teste de diferenciais e disjuntores com equipamento de verificação.",
     "Ensaio funcional de todos os circuitos, confirmando o funcionamento das tomadas, iluminação e equipamentos.",
     "Registo dos resultados no relatório de ensaio elétrico para aprovação."
    ]
   },
   {
    "g": 2,
    "n": "Fecho de roços e limpeza",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Após aprovação dos testes, fecho das roças e caixas com argamassa de enchimento ou massa de regularização.",
     "Limpeza das superfícies e retirada de detritos.",
     "Rotulagem final das tomadas e circuitos no quadro elétrico."
    ]
   },
   {
    "g": 3,
    "n": "Levantamento e planeamento",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Análise do projeto de gás existente (se houver) e do novo layout da cozinha.",
     "Identificação dos pontos de consumo (placa, forno, esquentador) e definição dos novos percursos das tubagens.",
     "Verificação das condições de ventilação e exaustão — janelas, grelhas de ventilação, condutas de exaustão e distâncias de segurança.",
     "Planeamento dos pontos de corte (válvulas de segurança) e acessos de manutenção.",
     "Emissão de ficha de trabalho e comunicação ao técnico de segurança (quando aplicável)."
    ]
   },
   {
    "g": 3,
    "n": "Desmontagem e preparação da instalação existente",
    "h": 4.0,
    "quem": "Técnico Gás",
    "det": [
     "Fecho da válvula geral de gás (interior ou contador).",
     "Purgamento da rede para eliminação de gás residual.",
     "Desmontagem de tubagens, válvulas e ligações antigas, respeitando o protocolo de segurança.",
     "Verificação do estado dos suportes, atravessamentos e condutas.",
     "Limpeza e desobstrução dos trajetos de instalação (paredes, pavimentos, tetos)."
    ]
   },
   {
    "g": 3,
    "n": "Instalação das novas tubagens",
    "h": 2.0,
    "quem": "Técnico Gás",
    "det": [
     "Colocação de tubagem em cobre rígido (EN 1057), aço galvanizado ou PE (exterior), conforme o tipo de rede e local de instalação.",
     "Fixação mecânica das tubagens com abraçadeiras metálicas a cada 1,5 m no mínimo.",
     "Execução de soldaduras capilares (para cobre) ou roscas com vedante apropriado (para aço).",
     "Montagem de:; Válvulas de corte em cada ponto de consumo.; Reguladores de pressão, se aplicável.; Uniões desmontáveis em locais de fácil acesso.",
     "Execução de atravessamentos de paredes com tubos de proteção (buchas metálicas ou mangas isolantes).",
     "Garantir distância mínima de 30 cm entre tubagens de gás e condutas elétricas."
    ]
   },
   {
    "g": 3,
    "n": "Instalação dos pontos de consumo",
    "h": 2.0,
    "quem": "Técnico Gás",
    "det": [
     "Colocação das saídas de gás na posição definida em projeto (atrás da placa, forno, esquentador, etc.).",
     "Ligação dos aparelhos com mangueiras metálicas flexíveis certificadas (EN 14800), com comprimentos e curvas adequadas.",
     "Instalação de válvulas de fecho acessíveis junto a cada aparelho.",
     "Montagem de detetor de fugas de gás (obrigatório em locais sem ventilação permanente ou em cozinhas modernas fechadas).",
     "Verificação das condições de ventilação e exaustão de fumos do espaço, conforme RIG."
    ]
   },
   {
    "g": 3,
    "n": "Ensaios e verificações",
    "h": 1.0,
    "quem": "Técnico Gás",
    "det": [
     "Ensaio de estanquidade da rede:; Pressurização com ar seco ou gás inerte (ex.: azoto) a 150 mbar durante 10 minutos, sem variação de pressão.; Inspeção de todas as uniões com água saponada ou detetor de fugas eletrônico.",
     "Verificação funcional dos equipamentos: acendimento, chama estável e correta evacuação de gases.",
     "Medição de monóxido de carbono (CO) nos produtos de combustão, garantindo níveis inferiores a 100 ppm.",
     "Emissão de certificado de ensaio e conformidade pela entidade instaladora credenciada."
    ]
   },
   {
    "g": 3,
    "n": "Identificação e documentação",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Colocação de etiquetas de identificação nas válvulas, reguladores e pontos de consumo.",
     "Registo de traçado da instalação (as built) com localização das válvulas e tubagens.",
     "Arquivo de fichas técnicas dos materiais e equipamentos utilizados.",
     "Entrega de Declaração de Conformidade da Instalação de Gás (DCIG), assinada pelo técnico responsável."
    ]
   },
   {
    "g": 4,
    "n": "Preparação para os testes",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Confirmar que todas as redes foram completamente instaladas, ligadas e seladas.",
     "Fechar válvulas, tampas e extremidades de cada circuito.",
     "Garantir que as caixas de visita, sifões e uniões estão acessíveis para inspeção.",
     "Limpar previamente as tubagens de resíduos ou detritos que possam comprometer os testes.",
     "Preparar equipamentos de medição: manómetro, bomba de pressão, megômetro, detetor de fugas, etc.",
     "Identificar o técnico responsável e preencher a ficha de ensaio."
    ]
   },
   {
    "g": 4,
    "n": "Teste de estanqueidade da rede de abastecimento de água",
    "h": 1.0,
    "quem": "Canalizador",
    "det": [
     "Verificar a ausência de fugas e a integridade das uniões.; Fechar todas as saídas de água.; Encher o circuito com água limpa e eliminar o ar.; Pressurizar o sistema até 6 bar (ou 1,5x a pressão de serviço).; Manter a pressão durante 30 minutos, sem queda superior a 0,1 bar.; Observar todas as ligações, válvulas e uniões."
    ]
   },
   {
    "g": 4,
    "n": "Teste de estanqueidade da rede de esgotos",
    "h": 1.0,
    "quem": "Canalizador",
    "det": [
     "Verificar se o sistema está livre de fugas, obstruções e refluxos.; Procedimento:; Selar todas as saídas (sanitas, ralos, sifões) com tampas apropriadas.; Encher os ramais com água até ao ponto mais alto ou utilizar teste de pressão de ar a 50 mbar.; Manter durante 15 minutos e observar eventuais descidas de nível.; Verificar visualmente todas as uniões e caixas de visita.; Resultado esperado: Ausência de fugas ou variação de pressão; escoamento livre."
    ]
   },
   {
    "g": 4,
    "n": "Teste de estanqueidade da rede de gás (se aplicável)",
    "h": 1.0,
    "quem": "Técnico Gás",
    "det": [
     "Objetivo: Garantir a estanqueidade total e segurança da rede antes da ligação ao contador.; Procedimento:; Teste efetuado com ar seco ou azoto (nunca com gás combustível).; Aplicar pressão de 150 mbar durante 10 minutos, sem variação.; Confirmar todas as uniões com água saponada ou detetor eletrónico de fugas.; Após ensaio, purgar o ar e proceder à ligação final.; Resultado esperado: Nenhuma perda de pressão nem presença de bolhas.; Observação: Ensaios obrigatoriamente executados por técnico credenciado ITG e registados em certificado de conformidade."
    ]
   },
   {
    "g": 4,
    "n": "Teste de funcionamento da instalação elétrica",
    "h": 1.0,
    "quem": "Eletricista",
    "det": [
     "Comprovar a continuidade, isolamento e segurança dos circuitos elétricos.; Procedimento:; Verificar a continuidade dos condutores (fase, neutro, terra).; Medir resistência de isolamento (mínimo 1 MΩ entre condutores).; Testar funcionamento dos diferenciais (ID) — tempo de disparo ≤ 0,3 s.; Medir resistência da terra (máx. 50 Ω).; Confirmar polaridade correta nas tomadas e presença de tensão nominal (230 V).; Ensaiar o funcionamento de iluminação e equipamentos.; Resultado esperado: Todos os valores dentro dos limites regulamentares e funcionamento normal."
    ]
   },
   {
    "g": 4,
    "n": "Registo e validação",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Compilação dos resultados dos ensaios em fichas próprias.",
     "Registo de pressões iniciais e finais, valores medidos e observações.",
     "Emissão de relatórios de ensaio e certificados de conformidade, assinados pelo técnico responsável.",
     "Em caso de não conformidades:; Identificação da origem do problema;; Correção da falha;; Repetição do teste até aprovação final."
    ]
   }
  ]
 },
 {
  "obra": "cozinha",
  "fase": 3,
  "nome": "Revestimentos e Acabamentos Base",
  "tarefas": [
   {
    "g": 1,
    "n": "Preparação das superfícies",
    "h": 2.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Limpeza completa das superfícies de poeiras, gorduras, restos de argamassa ou tintas soltas.",
     "Retirada de pregos, buchas, resíduos e elementos metálicos oxidados.",
     "Humedecimento ligeiro das superfícies, quando necessário, para melhorar a aderência.",
     "Verificação de fissuras ou buracos e reparação com argamassa de reparo (cimento e areia fina ou massa reparadora específica).",
     "Aplicação de primário de aderência (base acrílica ou epóxi) em suportes muito absorventes ou lisos (betão polido, reboco antigo, etc.)."
    ]
   },
   {
    "g": 1,
    "n": "Regularização das paredes",
    "h": 16,
    "quem": "Empreiteiro Geral",
    "det": [
     "Aplicação de reboco de regularização com argamassa tradicional (cimento/areia 1:3 a 1:4) ou massa pré-doseada industrial conforme especificação.",
     "Espessura média entre 1,5 e 2 cm, aplicada com colher e desempenadeira metálica.",
     "Nivelamento com régua de alumínio e verificação de prumos e esquadrias.",
     "Em zonas húmidas (chuveiro, lavatório, etc.), adicionar aditivo impermeabilizante líquido à argamassa.",
     "Após endurecimento (24–48h), lixagem e limpeza superficial."
    ]
   },
   {
    "g": 1,
    "n": "Regularização dos pavimentos",
    "h": 16,
    "quem": "Empreiteiro Geral",
    "det": [
     "Limpeza e remoção de poeiras, resíduos soltos e desníveis.",
     "Aplicação de camada de regularização (betonilha) em argamassa de cimento e areia (1:3) ou com argamassa autonivelante, conforme o tipo de revestimento final.",
     "Espessura média de 3 a 5 cm, com declives mínimos de 2% em zonas molhadas para garantir o escoamento.",
     "Execução de juntas perimetrais com espuma ou fita compressível junto às paredes.",
     "Cura húmida da betonilha por no mínimo 48 horas antes da impermeabilização."
    ]
   },
   {
    "g": 1,
    "n": "Impermeabilização das paredes e pavimentos",
    "h": 16,
    "quem": "Empreiteiro Geral",
    "det": [
     "Aplicação de sistema impermeabilizante bicomponente (cimento + resina) ou membrana líquida acrílica, conforme especificação técnica do fabricante.",
     "Aplicar com trincha ou rolo, em duas a três demãos cruzadas, respeitando o tempo de secagem entre camadas (geralmente 4–6h).",
     "Reforço com tela ou malha de fibra de vidro nas zonas críticas:; Cantos parede/pavimento;; Perímetros de ralos e drenos",
     "Subida mínima de 20 cm nas paredes e até 1,80 m nas zonas de duche ou banheira.",
     "Teste final de estanqueidade (enchimento do pavimento com 2–3 cm de água por 24h) antes de revestir."
    ]
   },
   {
    "g": 1,
    "n": "Acabamentos e limpeza",
    "h": 2.0,
    "quem": "Auditor",
    "det": [
     "Após a secagem completa, verificar planicidade, aderência e estanqueidade da superfície.",
     "Retirar resíduos, poeiras ou salpicos de produto impermeabilizante.",
     "Aplicar primário ou promotor de aderência (quando exigido pelo sistema de revestimento cerâmico).",
     "Entregar a superfície pronta para assentamento dos revestimentos."
    ]
   },
   {
    "g": 2,
    "n": "Preparação das superfícies",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Verificar se a regularização e impermeabilização das superfícies foram concluídas, secas e em bom estado.",
     "Assegurar que a superfície está limpa, firme e isenta de pó, gordura ou resíduos de cimento.",
     "Aplicar primário de aderência ou promotor (no caso de betonilhas muito lisas ou absorventes).",
     "Marcar os níveis de referência (pontos de nível, linhas horizontais e verticais) com laser, fio de prumo ou mangueira de nível.",
     "Determinar o ponto de partida do revestimento para minimizar cortes visíveis e manter simetria."
    ]
   },
   {
    "g": 2,
    "n": "Seleção e preparação dos materiais",
    "h": 0.5,
    "quem": "Empreiteiro Geral",
    "det": [
     "Escolher o tipo de revestimento conforme o projeto:; Azulejos cerâmicos ou porcelânicos;; Mosaicos hidráulicos ou vinílicos;; Pedra natural (mármore, granito);; Pastilhas de vidro ou cerâmica.",
     "Verificar dimensões, tonalidades e calibre dos lotes para evitar diferenças visuais.",
     "Preparar a argamassa colante adequada ao tipo de material e suporte (C1, C2, S1, S2 conforme EN 12004).",
     "Misturar o produto mecanicamente até obter uma pasta homogénea, respeitando as proporções e tempos de maturação."
    ]
   },
   {
    "g": 2,
    "n": "Colocação de revestimentos em paredes",
    "h": 8.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Aplicar a argamassa colante com desempenadeira dentada (6 a 10 mm), em áreas de aproximadamente 1 m² de cada vez.",
     "Assentar os azulejos pressionando e movendo ligeiramente em sentido horizontal/vertical para garantir a aderência.",
     "Manter juntas regulares (1,5 a 3 mm) com uso de cruzetas ou niveladores.",
     "Verificar nivelamento e alinhamento continuamente com régua e nível de bolha.",
     "Nas zonas húmidas (chuveiro, lavatório, rodapé), aplicar cola com aditivo impermeável e reforçar juntas.",
     "Cortar peças com serra de azulejos ou cortadora de disco diamantado para encaixes em tomadas, torneiras e ralos."
    ]
   },
   {
    "g": 2,
    "n": "Colocação de revestimentos em pavimentos",
    "h": 8.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Verificar o nível e planeza do piso e corrigir eventuais irregularidades.",
     "Aplicar a argamassa colante sobre o pavimento, distribuindo uniformemente com desempenadeira dentada (10 a 12 mm).",
     "Assentar as peças de forma ordenada, seguindo o traçado predefinido (em fiadas, diagonal, junta contínua, junta desencontrada, etc.).",
     "Utilizar niveladores de pavimento para eliminar desníveis entre peças (efeito “lippage”).",
     "Garantir juntas uniformes e espaçamento adequado, conforme o formato da peça.",
     "Retirar imediatamente o excesso de cola das juntas e superfícies."
    ]
   },
   {
    "g": 2,
    "n": "Betumação (rejuntamento)",
    "h": 8.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Aguardar o tempo mínimo de cura da cola (geralmente 24h).",
     "Preparar o betume de juntas (cimento ou epóxi) de acordo com o tipo de revestimento e local de aplicação.",
     "Aplicar com espátula de borracha, em diagonal às juntas, preenchendo completamente os espaços.",
     "Remover o excesso de material com esponja húmida após início de presa.",
     "Em zonas húmidas, utilizar betumes impermeáveis ou epoxídicos.",
     "Após secagem, realizar limpeza final com pano seco e detergente neutro."
    ]
   },
   {
    "g": 2,
    "n": "Acabamentos e inspeção",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Executar selagem com silicone neutro nas juntas de dilatação e perimetrais (encontros parede/piso, lavatórios, bases de duche).",
     "Verificar planicidade, verticalidade e alinhamento das juntas.",
     "Corrigir eventuais falhas, lascas ou peças desalinhadas antes da entrega.",
     "Limpar integralmente as superfícies, removendo resíduos de cimento e poeiras."
    ]
   },
   {
    "g": 3,
    "n": "Preparação das superfícies",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Verificar se as paredes e tetos estão secos, limpos e devidamente rebocados.",
     "Corrigir fissuras, juntas e imperfeições com massa de barramento e lixa fina.",
     "Remover poeiras, resíduos de cimento e manchas de humidade.",
     "Isolar e proteger zonas já acabadas (revestimentos cerâmicos, pavimentos, caixilhos) com fita adesiva e plásticos.",
     "Confirmar as cotas de instalação dos tetos falsos e sancas segundo o projeto de arquitetura/interiores."
    ]
   },
   {
    "g": 3,
    "n": "Instalação de tetos falsos (gesso cartonado ou PVC)",
    "h": 8,
    "quem": "Empreiteiro Geral",
    "det": [
     "Marcação e traçado de níveis:; Utilizar nível laser ou mangueira de água para definir o plano do teto falso.; Marcar a altura de instalação (normalmente 5 a 15 cm abaixo da laje, consoante a necessidade técnica).",
     "Montagem da estrutura metálica (perfilado galvanizado):; Fixar o perfil perimetral (UD) ao contorno das paredes com buchas e parafusos.; Instalar perfis principais (CD) suspensos por pendurais ajustáveis, espaçados entre 40–50 cm.; Garantir a planicidade do conjunto e travamento com perfis secundários.",
     "Aplicação das placas de gesso cartonado (Pladur® ou equivalente):; Aparafusar as placas aos perfis CD com parafusos autorroscantes, afastados no máximo 17 cm entre si.; Dispor as juntas desencontradas entre fiadas para maior resistência.; Deixar aberturas previstas para luminárias, exaustores e acessos técnicos.",
     "Tratamento de juntas e acabamentos:; Aplicar massa de juntas e fita de papel microperfurada sobre as uniões das placas.; Lixar e aplicar segunda demão de massa até obter uma superfície uniforme e pronta para pintura.",
     "Limpeza e inspeção final antes da pintura, garantindo ausência de poeiras ou resíduos."
    ]
   },
   {
    "g": 3,
    "n": "Pintura de tetos e paredes superiores",
    "h": 8,
    "quem": "Empreiteiro Geral",
    "det": [
     "Aplicar primário selante acrílico sobre as superfícies de gesso cartonado e rebocos secos.",
     "Após secagem, aplicar duas demãos de tinta acrílica lavável ou antimofo, com rolo de lã curta ou pistola airless.",
     "Manter intervalos de secagem adequados entre demãos (mínimo 4 h).",
     "Assegurar uma acabamento homogéneo, sem manchas ou escorrimentos.",
     "Inspecionar sob luz natural e corrigir eventuais falhas."
    ]
   },
   {
    "g": 3,
    "n": "Montagem de sancas (gesso, poliuretano, EPS ou madeira)",
    "h": 4.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Escolher o tipo de sanca conforme o projeto (decorativa, técnica para LED, ou de remate).",
     "Cortar as peças com ingleteira para garantir juntas limpas e ângulos precisos.",
     "Fixar as sancas ao teto e paredes com cola de montagem e pregos de acabamento (conforme o material).",
     "Corrigir juntas com massa e lixar até obter superfície contínua.",
     "Aplicar pintura final ou acabamento decorativo conforme o material (gesso, PVC ou madeira).",
     "Se aplicável, integrar fitas LED embutidas ou calhas técnicas antes da pintura final."
    ]
   },
   {
    "g": 3,
    "n": "Instalação de rodapés e acabamentos base",
    "h": 4.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Limpar as superfícies de aplicação (paredes e pavimento).",
     "Cortar os rodapés à medida, com uniões em esquadria nas esquinas.",
     "Fixar com cola de montagem, buchas ou clipes metálicos (consoante o material: cerâmico, MDF, alumínio ou PVC).",
     "Garantir o nivelamento e continuidade linear ao longo de todo o perímetro.",
     "Selar a junção superior com silicone ou massa acrílica para evitar infiltração de humidade.",
     "Aplicar retoques de pintura nos encontros e zonas de ligação."
    ]
   },
   {
    "g": 3,
    "n": "Acabamentos e inspeção final",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Verificar o nivelamento e alinhamento dos tetos, sancas e rodapés.",
     "Corrigir pequenas imperfeições com massa fina e repintar, se necessário.",
     "Limpar todas as superfícies e remover proteções.",
     "Testar iluminação e encaixe de elementos embutidos (spotlights, sensores, ventax).",
     "Confirmar que todas as juntas estão seladas e livres de fissuras."
    ]
   }
  ]
 },
 {
  "obra": "cozinha",
  "fase": 4,
  "nome": "Montagem Final e Acabamentos Finos",
  "tarefas": [
   {
    "g": 1,
    "n": "Preparação e conferência",
    "h": 2.0,
    "quem": "Carpintaria",
    "det": [
     "Verificar se as superfícies de paredes e pavimentos estão niveladas, limpas e secas, e se as infraestruturas (tomadas, pontos de água e esgoto) estão na posição correta conforme o projeto.",
     "Conferir o layout de montagem (desenho técnico com medidas e referências dos módulos).",
     "Desembalar os móveis com cuidado, verificando quantidades, integridade e acabamento das peças.",
     "Organizar os módulos conforme o seu posicionamento (superiores, inferiores, colunas, cantos).",
     "Proteger o pavimento e as superfícies circundantes com manta ou cartão canelado antes de iniciar a montagem."
    ]
   },
   {
    "g": 1,
    "n": "Montagem dos módulos inferiores (base)",
    "h": 2.0,
    "quem": "Carpintaria",
    "det": [
     "Posicionar os módulos inferiores no local, de acordo com o traçado e medições previamente definidos.",
     "Regular as bases e pés dos móveis com o nível de bolha ou laser, garantindo perfeita horizontalidade da linha base.",
     "Fixar os módulos entre si com parafusos de ligação, garantindo continuidade e esquadria.",
     "Verificar o recuo traseiro dos móveis para passagem de tubagens, tomadas e mangueiras.",
     "Assegurar encaixe correto dos cantos e terminais e reforçar uniões com buchas e suportes metálicos, se necessário."
    ]
   },
   {
    "g": 1,
    "n": "Montagem das bancadas",
    "h": 2.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Verificar medidas e cortes prévios das bancadas (pedra, compacto, laminado ou outro material).",
     "Efetuar ajustes finos no local, cortando aberturas para lava-louça, placa de fogão e tomadas embutidas, utilizando serra de disco ou serra tico-tico com lâmina adequada.",
     "Aplicar massa de vedação ou silicone neutro nas uniões e nas zonas de contacto com a parede.",
     "Assentar a bancada sobre os móveis base, nivelando e fixando com suportes, esquadros ou colas estruturais conforme o material.",
     "No caso de pedra natural ou quartzo, realizar a fixação com ajuda de ventosas e silicone estrutural, garantindo estabilidade sem tensão.",
     "Executar a selagem perimetral entre bancada e parede com silicone impermeável, de cor a combinar com o revestimento."
    ]
   },
   {
    "g": 1,
    "n": "Montagem dos módulos superiores e painéis",
    "h": 4.0,
    "quem": "Carpintaria",
    "det": [
     "Marcar a altura de fixação (normalmente entre 1,45 m e 1,55 m do pavimento).",
     "Fixar os suportes de parede (calhas ou buchas metálicas) com parafusos adequados ao tipo de suporte (alvenaria, gesso, tijolo).",
     "Pendurar e alinhar os módulos superiores, ajustando com o nível laser.",
     "Montar painéis laterais, cornijas, prateleiras e tampas de acabamento, garantindo continuidade visual.",
     "Conferir a folga correta entre portas e gavetas (2 a 3 mm) e ajustar dobradiças e corrediças."
    ]
   },
   {
    "g": 1,
    "n": "Montagem de acessórios e ajustes finais",
    "h": 2.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Instalar puxadores, amortecedores, sistemas de fecho suave e divisórias internas.",
     "Verificar o funcionamento de todas as portas, gavetas e dobradiças.",
     "Aplicar selantes e coberturas plásticas nas uniões entre móveis, rodapés e paredes.",
     "Limpar as superfícies e remover restos de adesivo ou pó de corte.",
     "Eliminar ruídos ou folgas por meio de pequenos ajustes."
    ]
   },
   {
    "g": 2,
    "n": "Preparação e verificação prévia",
    "h": 1.5,
    "quem": "Empreiteiro Geral",
    "det": [
     "Confirmar que todas as ligações de infraestrutura (elétrica, hidráulica, esgoto e gás) estão concluídas, testadas e localizadas conforme o projeto.",
     "Verificar tensões elétricas e tipo de tomada (230 V monofásico ou 400 V trifásico).",
     "Conferir pressão de água e funcionamento dos esgotos, garantindo ausência de fugas.",
     "Desembalar cuidadosamente os eletrodomésticos e verificar integridade, modelo e acessórios.",
     "Organizar os equipamentos por ordem de instalação (embutidos, encastráveis e de livre instalação)."
    ]
   },
   {
    "g": 2,
    "n": "Instalação de equipamentos elétricos",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Fixação e posicionamento; Posicionar os equipamentos no local conforme o layout técnico.; Garantir espaços de ventilação e folgas recomendados pelo fabricante (ex.: 2–5 cm atrás dos equipamentos).; Corrigir desníveis com calços ou pés ajustáveis, garantindo alinhamento com os móveis e bancada.",
     "Ligações elétricas; Desligar o disjuntor do circuito correspondente antes de qualquer ligação.; Conectar os cabos às tomadas ou caixas de derivação, respeitando polaridade e secção adequada: 2.2.3 2,5 mm² (tomadas de uso geral) 2.2.4 4 mm² (forno/placa) 2.2.5 6 mm² (equipamentos de maior potência, conforme projeto).; Instalar fichas de ligação, bornes e tomadas de embutir com ligação à terra obrigatória.; Verificar continuidade e isolamento antes de energizar o circuito.",
     "Teste funcional; Ligar cada equipamento individualmente e verificar arranque, consumo e ruído.; Testar função de aquecimento, ventilação e iluminação (para forno e exaustor).; Garantir que os cabos e fichas não ficam em contacto com partes quentes ou móveis."
    ]
   },
   {
    "g": 2,
    "n": "Instalação de equipamentos hidráulicos",
    "h": 1.5,
    "quem": "Empreiteiro Geral",
    "det": [
     "Ligar mangueiras de alimentação de água com fitas de vedação e juntas apropriadas.",
     "Ligar os tubos de esgoto aos sifões, garantindo encaixe completo e estanqueidade.",
     "Instalar válvulas de corte individuais junto de cada equipamento.",
     "Realizar teste de fugas abrindo as válvulas e observando eventuais perdas.",
     "Fixar as mangueiras de drenagem para evitar recuos ou entupimentos.",
     "Garantir isolamento elétrico e afastamento de cabos das zonas molhadas."
    ]
   },
   {
    "g": 2,
    "n": "Instalação de equipamentos a gás (se aplicável)",
    "h": 1.5,
    "quem": "Auditor",
    "det": [
     "Confirmar presença de válvula de corte acessível e ventilação adequada do espaço.",
     "Ligar o equipamento com mangueira metálica flexível certificada (EN 14800) e juntas de vedação apropriadas.",
     "Testar estanqueidade com detetor eletrónico de fugas ou solução saponácea.",
     "Verificar acendimento, estabilidade da chama e exaustão dos gases de combustão.",
     "Executar as ligações e ensaios apenas por técnico credenciado ITG."
    ]
   },
   {
    "g": 2,
    "n": "Instalação de exaustores e ventilação",
    "h": 1.5,
    "quem": "Empreiteiro Geral",
    "det": [
     "Marcar e abrir a passagem da conduta de exaustão conforme diâmetro recomendado (geralmente Ø120–150 mm).",
     "Montar o exaustor com buchas adequadas e parafusos de fixação.",
     "Conectar a conduta à saída exterior ou chaminé com mangueira metálica flexível e abraçadeiras.",
     "Testar nível de ruído e sucção nas várias velocidades."
    ]
   },
   {
    "g": 2,
    "n": "Verificação e acabamento final",
    "h": 1.5,
    "quem": "Empreiteiro Geral",
    "det": [
     "Confirmar funcionamento simultâneo dos equipamentos, sem interferência entre circuitos.",
     "Garantir alinhamento e nivelamento com os móveis e bancadas.",
     "Verificar acesso livre às válvulas e tomadas de manutenção.",
     "Aplicar selantes e coberturas plásticas nas uniões visíveis.",
     "Retirar películas de proteção e limpar os equipamentos.",
     "Entregar manual de utilização e garantia ao dono da obra."
    ]
   },
   {
    "g": 3,
    "n": "Preparação e verificação das infraestruturas",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Confirmar que as redes de água, gás e eletricidade foram devidamente testadas e aprovadas na Fase 2 (Testes de Estanqueidade e Funcionamento).",
     "Verificar pressões de serviço e tensão elétrica:; Água fria: 3–4 bar;; Água quente: 2,5–3 bar;; Gás: 21 mbar (GN) ou 37 mbar (GLP);; Eletricidade: 230 V (monofásico) / 400 V (trifásico).",
     "Confirmar a localização e acessibilidade das válvulas de corte, quadros elétricos e tomadas.",
     "Preparar ferramentas e materiais apropriados (mangueiras, cabos, conectores, fitas de vedação, selantes, etc.)."
    ]
   },
   {
    "g": 3,
    "n": "Ligações de água",
    "h": 3.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Equipamentos a ligar: lavatórios, torneiras, máquinas de lavar, esquentadores, termoacumuladores, autoclismos, lava-louças.",
     "Instalar flexíveis de alimentação (água fria e quente) em aço inox ou malha trançada, de comprimento adequado.",
     "Apertar as uniões manualmente e finalizar com chave inglesa, sem exceder o torque indicado para não danificar as roscas.",
     "Ligar as saídas de esgoto com tubos flexíveis ou sifões, garantindo declive e estanqueidade.",
     "Aplicar fita veda-rosca PTFE ou massa vedante de uso sanitário nas conexões metálicas.",
     "Verificar ausência de fugas abrindo gradualmente as válvulas e observando cada união.",
     "Fixar as tubagens ou sifões com suportes e abraçadeiras adequadas."
    ]
   },
   {
    "g": 3,
    "n": "Ligações de gás (GN ou GLP)",
    "h": 1.5,
    "quem": "Técnico Gás",
    "det": [
     "Equipamentos a ligar: placa de fogão, forno a gás, esquentador ou caldeira.",
     "Confirmar que o circuito foi testado e certificado na fase anterior e que existe ventilação adequada.",
     "Ligar os equipamentos com mangueira metálica flexível certificada (EN 14800), sem torções nem tensões.",
     "Assegurar que as válvulas de corte estão acessíveis e visíveis.",
     "Testar a estanquidade com detetor eletrónico de fugas ou solução saponácea, sem uso de chama.",
     "Verificar o acendimento, estabilidade e cor da chama (azul uniforme).",
     "Garantir que a conduta de exaustão de gases de combustão está devidamente ligada e funcional.",
     "Emitir, quando aplicável, o Certificado de Conformidade de Instalação de Gás (DCIG) assinado por técnico ITG."
    ]
   },
   {
    "g": 3,
    "n": "Ligações elétricas",
    "h": 0.17,
    "quem": "Eletricista",
    "det": [
     "Equipamentos a ligar: forno, placa elétrica, exaustor, frigorífico, micro-ondas, máquina de lavar loiça, máquina de lavar roupa, termoacumulador.",
     "Desligar o disjuntor principal antes de qualquer manipulação.",
     "Ligar os cabos à tomada ou borne de derivação correspondente, respeitando polaridade:; Fase (L): castanho/preto/cinzento;; Neutro (N): azul;; Terra (PE): verde/amarelo.",
     "Verificar a secção mínima dos condutores (2,5 mm² para tomadas, 4–6 mm² para circuitos de potência).",
     "Instalar fichas, disjuntores e diferenciais adequados a cada circuito.",
     "Fixar cabos e fichas de forma a evitar tensões mecânicas e contacto com fontes de calor.",
     "Testar o funcionamento e continuidade do circuito com multímetro e detector de tensão.",
     "Confirmar que todos os equipamentos estão devidamente aterrados e protegidos por diferencial residual (ID ≤ 30 mA)."
    ]
   },
   {
    "g": 3,
    "n": "Verificações finais e ensaios",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Abrir gradualmente as válvulas de água e gás e energizar os circuitos elétricos.",
     "Verificar o funcionamento simultâneo dos equipamentos e a ausência de fugas, ruídos ou vibrações.",
     "Confirmar que todos os elementos estão firmemente fixos e acessíveis para manutenção.",
     "Efetuar registo fotográfico e preencher ficha de verificação final das ligações.",
     "Entregar documentação técnica e instruções de segurança ao dono da obra."
    ]
   },
   {
    "g": 4,
    "n": "Selagens técnicas e decorativas",
    "h": 2.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Aplicar silicone neutro, acrílico ou poliuretano em todas as juntas de dilatação, ligações entre materiais e uniões entre planos (parede/pavimento, bancada/parede, louça/revestimento, rodapé/piso).",
     "Escolher o tipo de selante conforme o local de aplicação:; Silicone neutro: zonas húmidas (cozinhas, casas de banho, lavandarias);; Selante acrílico: juntas de acabamento ou pintura;; Poliuretano (PU): juntas elásticas expostas a movimento ou vibração.",
     "Assegurar que as superfícies estão limpas, secas e livres de poeiras e gorduras.",
     "Aplicar fita de acabamento para delimitar a junta, garantindo linhas retas e limpas.",
     "Extrudir o selante com pistola aplicadora e alisar com espátula de silicone ou dedo umedecido.",
     "Remover a fita de proteção antes da secagem.",
     "Verificar continuidade, aderência e acabamento liso das selagens."
    ]
   },
   {
    "g": 4,
    "n": "Retoques de pintura e acabamento",
    "h": 2.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Corrigir imperfeições, riscos, manchas ou irregularidades nas paredes, tetos e rodapés.",
     "Retocar zonas afetadas durante a montagem (cantoneiras, esquadrias, sancas, etc.).",
     "Aplicar massa de retoque e tinta correspondente à cor e acabamento original (mate, acetinado, lavável, etc.).",
     "Verificar transições de cor e brilho para evitar diferenças visuais.",
     "Reapertar ou alinhar elementos soltos (módulos, dobradiças, sancas, rodapés).",
     "Substituir ou reparar pequenos elementos danificados (tampas, parafusos, perfis, cantoneiras)."
    ]
   },
   {
    "g": 4,
    "n": "Limpeza técnica e final",
    "h": 4.0,
    "quem": "Tecnico de Limpeza",
    "det": [
     "Limpeza grossa: remoção de poeiras, entulhos finos, restos de silicone, cola ou argamassa.; Varredura e aspiração de todas as superfícies.; Retirada de películas protetoras de móveis, bancadas e janelas.",
     "Limpeza fina: higienização completa dos espaços e acabamentos:; Lavagem de revestimentos cerâmicos com detergente neutro.; Limpeza de bancadas, móveis, vidros, metais e acessórios com produtos específicos.; Polimento de torneiras, puxadores e superfícies em inox.; Limpeza de vidros com limpa-vidros e panos de microfibra.; Desinfeção de louças sanitárias e superfícies de contacto.",
     "Verificação de ausência de resíduos, manchas e marcas de dedos.",
     "Ventilação dos espaços para eliminar odores e humidade."
    ]
   },
   {
    "g": 4,
    "n": "Inspeção e controlo final",
    "h": 2.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Revisão detalhada de todas as zonas de intervenção:; Verificar juntas, selagens e acabamentos visuais.; Testar funcionamento de portas, janelas, torneiras, tomadas e luminárias.; Confirmar que não existem fugas de água, gás ou cabos expostos.",
     "Realizar checklist de verificação final de obra, assinado pelo encarregado ou técnico responsável.",
     "Executar retoques adicionais, se necessário.",
     "Entregar o espaço limpo, seco e totalmente operacional."
    ]
   }
  ]
 },
 {
  "obra": "wc",
  "fase": 0,
  "nome": "Retificação de Medidas",
  "tarefas": [
   {
    "g": 0,
    "n": "Retificação de Medidas",
    "h": 0.05,
    "quem": "Auditor",
    "det": [
     "Retificação de Medidas"
    ]
   }
  ]
 },
 {
  "obra": "wc",
  "fase": 1,
  "nome": "Trabalhos Preparatórios e Demolições",
  "tarefas": [
   {
    "g": 1,
    "n": "Delimitação da Zona de Intervenção",
    "h": 1.0,
    "quem": "Polivalente",
    "det": [
     "Marcação física dos limites da área de obra, incluindo portas, janelas e acessos.",
     "Colocação de fitas de sinalização e/ou barreiras físicas (painéis de MDF, PVC ou estruturas metálicas leves).",
     "Instalação de portas temporárias com fecho magnético ou zip doors em plástico reforçado, permitindo acesso controlado sem dispersão de poeiras."
    ]
   },
   {
    "g": 1,
    "n": "Proteção do Pavimento Existente",
    "h": 1.0,
    "quem": "Polivalente",
    "det": [
     "Aplicação de mantas protetoras, painéis de MDF, cortiça, cartão canelado ou telas de polietileno sobre pisos adjacentes (corredores, escadas, halls).",
     "Fixação com fita adesiva apropriada (não agressiva) nas juntas, garantindo estabilidade e evitando escorregamentos.",
     "Em zonas de carga e descarga de materiais, reforço com chapas de compensado ou tapetes de borracha."
    ]
   },
   {
    "g": 1,
    "n": "Proteção de Paredes, Rodapés e Portas",
    "h": 1.0,
    "quem": "Polivalente",
    "det": [
     "Cobertura de superfícies verticais com plástico de alta densidade (200 micras) ou telas não-tecidas.",
     "Envolvimento de rodapés e cantos com fita protetora e espuma de canto.",
     "Cobertura temporária de portas e aros com filme plástico ou papel kraft."
    ]
   },
   {
    "g": 1,
    "n": "Isolamento Contra Poeiras e Ruído",
    "h": 0.5,
    "quem": "Polivalente",
    "det": [
     "Montagem de barreiras anti-pó (Dust Barriers) entre a área de obra e o resto da habitação, com estrutura telescópica ou fita dupla face.",
     "Se possível, instalação de sistemas de ventilação temporária, com exaustão controlada de ar para o exterior.",
     "Utilização de máquinas aspiradoras industriais durante demolições para reduzir poeiras suspensas."
    ]
   },
   {
    "g": 1,
    "n": "Proteção de Instalações e Equipamentos Existentes",
    "h": 1.0,
    "quem": "Polivalente",
    "det": [
     "Isolamento de tomadas elétricas, caixas de derivação e interruptores com fita isoladora.",
     "Cobertura de luminárias, radiadores e outros elementos fixos.",
     "Proteção de janelas e caixilharias com película adesiva de baixa aderência."
    ]
   },
   {
    "g": 1,
    "n": "Verificação e Manutenção Diária",
    "h": 0.5,
    "quem": "Empreiteiro Geral",
    "det": [
     "Inspeção diária do estado das proteções e substituição de elementos danificados.",
     "Manutenção de corredores limpos e acessos desobstruídos.",
     "Reforço das proteções sempre que se altere o tipo de trabalho (por exemplo, passagem de demolições para rebocos ou pintura)."
    ]
   },
   {
    "g": 2,
    "n": "Preparação da área de trabalho",
    "h": 0.5,
    "quem": "Empreiteiro Geral",
    "det": [
     "Delimitar e isolar a área de intervenção com fita de sinalização, painéis plásticos ou divisórias.",
     "Proteger as zonas adjacentes (portas, janelas, pavimentos, rodapés, escadas) com mantas protetoras ou cartão canelado.",
     "Desligar as redes de água e eletricidade, garantindo segurança durante as desmontagens.",
     "Confirmar o acesso livre para transporte de entulho e materiais (ex.: trajeto até contentor ou armazém temporário).",
     "Utilizar Equipamentos de Proteção Individual (EPI): luvas, botas, óculos e máscara antipó."
    ]
   },
   {
    "g": 2,
    "n": "Desmontagem e remoção de louças sanitárias",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Corte e desligamento das ligações hidráulicas (flexíveis, torneiras, sifões, válvulas) e de esgoto.",
     "Desaparafusar e remover:; Sanita (com desconexão da saída e vedação temporária do tubo de esgoto);; Lavatório e respetivo móvel ou coluna;; Bidé e respetivas ligações;; Base de duche ou banheira (incluindo sifão e ligação de esgoto).",
     "Proteger as saídas de esgoto com tampões ou fita adesiva para evitar odores e entrada de resíduos.",
     "Transportar as peças cuidadosamente, evitando impactos e quebras.",
     "Armazenar ou descartar conforme instruções do dono da obra (reutilização, substituição ou reciclagem)."
    ]
   },
   {
    "g": 2,
    "n": "Desmontagem e remoção de móveis e acessórios",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Desaparafusar móveis suspensos, armários, prateleiras e espelhos.",
     "Retirar puxadores, portas e dobradiças para facilitar o transporte.",
     "Remover móveis-lavatório e colunas de arrumação, protegendo as paredes adjacentes.",
     "Separar os materiais reutilizáveis (madeira, metal, vidro) dos resíduos mistos.",
     "Armazenar os móveis reaproveitáveis em local seco e protegido."
    ]
   },
   {
    "g": 2,
    "n": "Remoção de revestimentos e pavimentos",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Remover azulejos, mosaicos ou pedras decorativas com martelo e talhadeira manual ou martelo pneumático leve (3–5 kg).",
     "Retirar revestimentos cerâmicos soltos ou danificados até expor a base firme (reboco ou betonilha).",
     "Executar a remoção dos rodapés e juntas com ferramentas adequadas para evitar danos nas superfícies de suporte.",
     "Recolher o entulho gerado, separando resíduos inertes (cerâmica, argamassa) de metais e plásticos.",
     "Transportar o entulho para o local de armazenamento temporário ou contentor devidamente identificado."
    ]
   },
   {
    "g": 2,
    "n": "Limpeza e preparação final",
    "h": 0.75,
    "quem": "Empreiteiro Geral",
    "det": [
     "Aspirar e varrer o local, removendo poeiras e fragmentos soltos.",
     "Tamponar todas as condutas e tubagens expostas (água e esgoto) com rolhas provisórias.",
     "Efetuar uma inspeção visual da área — identificar fissuras, humidades, ou zonas que necessitem de reparo.",
     "Deixar o espaço limpo, seco e preparado para o início das novas instalações (fase 2)."
    ]
   },
   {
    "g": 3,
    "n": "Preparação e segurança do local",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Isolar completamente a zona de trabalho com plásticos, fita de sinalização e painéis temporários para evitar dispersão de poeiras e fragmentos.",
     "Proteger portas, caixilhos, pavimentos e corredores adjacentes com mantas protetoras, cartão canelado e fita adesiva.",
     "Desligar as redes de água e eletricidade da divisão antes do início da demolição.",
     "Confirmar a localização exata das canalizações, esgotos e cabos elétricos com detetor multifuncional (scanner de parede).",
     "Garantir ventilação adequada e uso obrigatório de EPI: capacete, luvas, óculos, máscara antipó (FFP2 ou superior), botas com biqueira e protetores auriculares."
    ]
   },
   {
    "g": 3,
    "n": "Demolição de paredes (parcial ou total)",
    "h": 4.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Executar levantamento prévio da estrutura existente, identificando se as paredes são:; Divisórias não estruturais (tijolo furado, bloco cerâmico ou pladur);; Paredes estruturais ou de suporte (nunca demolir sem parecer técnico).",
     "Iniciar a demolição de cima para baixo, removendo primeiro os revestimentos (azulejos, rebocos, argamassas).",
     "Utilizar martelo pneumático leve (3–5 kg) ou marreta e talhadeira manual, conforme o tipo de material.",
     "Trabalhar em painéis verticais de pequena dimensão (1 m²) para evitar colapsos descontrolados.",
     "Retirar o entulho progressivamente e não acumular material junto às paredes ainda por demolir.",
     "Proteger as redes embutidas que não serão substituídas, aplicando tampões e sinalização.",
     "Armazenar e separar os resíduos (cerâmica, tijolo, argamassa) em contentores adequados para RCD."
    ]
   },
   {
    "g": 3,
    "n": "Demolição de pisos (betonilha e revestimentos)",
    "h": 4.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Iniciar pela remoção dos revestimentos cerâmicos com martelo e talhadeira.",
     "Prosseguir com a demolição da betonilha (camada de regularização) até atingir a laje estrutural, sem danificar o suporte.",
     "Executar o trabalho em faixas paralelas e controladas, evitando impactos excessivos.",
     "Verificar a presença de tubagens embutidas (esgotos, aquecimento radiante, etc.) e atuar com precaução nestas zonas.",
     "Recolher o entulho de forma contínua, evitando acumulações no pavimento.",
     "Após a demolição, efetuar limpeza e aspiração completa da laje, removendo poeira e fragmentos."
    ]
   },
   {
    "g": 3,
    "n": "Demolição de tetos (reboco, gesso ou pladur)",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Confirmar o tipo de teto existente (reboco tradicional, gesso cartonado, PVC ou alumínio).",
     "Iniciar a remoção dos elementos suspensos e perfis metálicos, desmontando secções de pequena dimensão.",
     "Cortar e remover luminárias, condutas de exaustão e cablagens antes da demolição.",
     "Trabalhar com plataforma estável ou andaime pequeno, nunca em escadas instáveis.",
     "Evitar vibrações excessivas para não afetar paredes e tetos adjacentes.",
     "Após a remoção, verificar a integridade da laje ou estrutura e eliminar resíduos de fixação (pregos, buchas, perfis)."
    ]
   },
   {
    "g": 3,
    "n": "Recolha, triagem e limpeza final",
    "h": 2.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Segregar os resíduos em conformidade com as normas de Gestão de Resíduos de Construção e Demolição (RCD):; Cerâmicos e argamassas;; Metais;; Materiais plásticos;; Madeira e gesso.",
     "Transportar o entulho para contentor autorizado e assegurar o destino final conforme legislação ambiental.",
     "Efetuar limpeza completa da área, incluindo varredura, aspiração e lavagem leve se necessário.",
     "Tamponar todas as tubagens expostas com rolhas provisórias ou fita adesiva.",
     "Deixar o espaço limpo, seco e pronto para as novas infraestruturas (fase 2)."
    ]
   },
   {
    "g": 4,
    "n": "Recolha e triagem inicial dos resíduos",
    "h": 0.75,
    "quem": "Empreiteiro Geral",
    "det": [
     "Identificação dos tipos de resíduos produzidos (ex.: cerâmica, argamassa, madeira, metal, plástico, vidro, restos de tubagem, etc.).",
     "Separação por categoria para facilitar reciclagem e destino final:; RCD Inertes (tijolo, betão, cerâmica).; Resíduos metálicos (canalizações, ferragens).; Resíduos mistos ou indiferenciados.; Resíduos perigosos (tintas, colas, solventes) — acondicionados separadamente.; Colocação do entulho em sacos resistentes (ex. big bags, sacos de ráfia ou polietileno reforçado)."
    ]
   },
   {
    "g": 4,
    "n": "Transporte interno e armazenamento temporário",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Transporte manual ou mecanizado (carrinhos, baldes, pás, ou empilhadores ligeiros) do entulho até ao ponto de recolha.",
     "Proteção do percurso (pavimentos, corredores, elevadores) com mantas ou placas de MDF para evitar danos e sujidade."
    ]
   },
   {
    "g": 4,
    "n": "Remoção para destino final (A PARTIR DO PONTO; É RESPONSABILIDADE DO ARMAZÉM)",
    "h": 2.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Carregamento dos contentores ou big bags por meios manuais ou mecanizados (pá carregadora, grua, etc.).",
     "Deposito em contentores específicos devidamente identificados e colocados em zona segura e ventilada no armazém.",
     "Transporte para operador licenciado, conforme legislação nacional (ex.: Decreto-Lei n.º 46/2008).",
     "Acompanhamento do transporte com guia de resíduos emitida pela entidade gestora, comprovando a rastreabilidade e destino final.",
     "Registo fotográfico e documental da entrega dos resíduos, sempre que exigido pela fiscalização ou pelo dono da obra."
    ]
   },
   {
    "g": 4,
    "n": "Limpeza geral da área de trabalho",
    "h": 0.75,
    "quem": "Empreiteiro Geral",
    "det": [
     "Varredura minuciosa das superfícies (pavimento, rodapés, cantos e juntas).",
     "Remoção de poeiras e pequenos fragmentos com aspirador industrial ou escova de cerdas duras.",
     "Limpeza húmida de pavimentos e paredes, quando aplicável, utilizando detergentes neutros e panos adequados.",
     "Retirada final de plásticos de proteção, fitas e materiais temporários usados na fase anterior.",
     "Ventilação do espaço para eliminar pó residual e odores."
    ]
   },
   {
    "g": 4,
    "n": "Verificação e validação final",
    "h": 0.5,
    "quem": "Empreiteiro Geral",
    "det": [
     "Inspeção visual pelo encarregado ou técnico de obra para confirmar que a área está limpa, segura e livre de obstáculos.",
     "Registo no diário de obra da data e volume aproximado de resíduos removidos.",
     "Confirmação de que todas as zonas adjacentes (acessos, corredores, varandas, escadas) ficam em estado de limpeza equivalente."
    ]
   },
   {
    "g": 5,
    "n": "Planeamento e preparação do levantamento",
    "h": 0.5,
    "quem": "Empreiteiro Geral",
    "det": [
     "Consulta da lista de materiais aprovados no projeto e verificação das quantidades necessárias para a fase da obra.",
     "Emissão da requisição interna de materiais, com identificação de:; Tipo de material, referência e unidade de medida;; Quantidade necessária;; Local e data de utilização;; Responsável pela requisição.",
     "Coordenação com o encarregado de armazém para agendamento do levantamento, garantindo disponibilidade e organização do stock.",
     "Preparação de meios de transporte e acondicionamento adequados (paletes, caixas, cintas, coberturas)."
    ]
   },
   {
    "g": 5,
    "n": "Conferência e recolha no armazém",
    "h": 2.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Identificação dos materiais com base nas fichas técnicas e códigos internos (ex.: azulejo modelo X, tubo PEX Ø16, cimento cola tipo C2).",
     "Verificação da quantidade física (contagem, pesagem ou medição) e conformidade do lote com a nota de requisição.",
     "Inspeção visual da qualidade e integridade dos materiais:; Verificar ausência de danos (rachas, deformações, humidade, ferrugem, etc.);; Confirmar prazos de validade (em colas, tintas, argamassas, selantes).",
     "Caso seja necessário, emissão de nota de não conformidade para materiais danificados ou incorretos.",
     "Registo de saída de materiais em guia de remessa interna ou nota de transferência de stock."
    ]
   },
   {
    "g": 5,
    "n": "Carregamento e transporte",
    "h": 1.5,
    "quem": "Empreiteiro Geral",
    "det": [
     "Planeamento do transporte segundo o tipo de material:; Materiais pesados ou volumosos: utilização de empilhadores, gruas, paleteiras.; Materiais frágeis: transporte protegido com mantas, espumas e paletes estáveis.",
     "Acondicionamento e amarração segura da carga (cintas, fitas ou redes de proteção).",
     "Emissão e acompanhamento da guia de transporte ou guia de remessa até à obra.",
     "Registo do condutor, matrícula e hora de saída.",
     "No transporte de argamassas, tintas ou líquidos, garantir o não tombamento e temperatura adequada."
    ]
   },
   {
    "g": 5,
    "n": "Receção e descarga em obra",
    "h": 0.17,
    "quem": "Empreiteiro Geral",
    "det": [
     "Verificação dos materiais à chegada ao estaleiro:; Conferência das quantidades e integridade física.; Confirmação com guia de remessa e assinatura de receção.",
     "Acondicionamento no local de armazenamento temporário em obra, protegido da intempérie e humidade.",
     "Organização dos materiais por tipo e prioridade de utilização (ex.: canalizações, revestimentos, colas, tintas).",
     "Atualização do mapa de controlo de materiais em obra (entradas e saídas)."
    ]
   },
   {
    "g": 5,
    "n": "Registo documental e controlo",
    "h": 0.17,
    "quem": "Parceiro",
    "det": [
     "Arquivo das guias de transporte, requisições e relatórios de controlo de qualidade.",
     "Atualização do inventário de armazém e do mapa de stock em obra.",
     "Comunicação com a equipa de gestão de obra para planear novos levantamentos ou reposições."
    ]
   }
  ]
 },
 {
  "obra": "wc",
  "fase": 2,
  "nome": "Infraestruturas (Instalações técnicas)",
  "tarefas": [
   {
    "g": 1,
    "n": "Levantamento e marcação",
    "h": 1.5,
    "quem": "Empreiteiro Geral",
    "det": [
     "Levantamento das linhas de abastecimento e drenagem existentes, identificando:; Localização e diâmetro das tubagens antigas;; Pontos de entrada/saída;; Alturas e declives dos ramais;; Possíveis interferências com outras redes (elétrica, gás, ventilação).",
     "Definição das novas rotas de canalização com base no projeto de especialidades e no layout final (sanita, base de duche, etc.).",
     "Marcação em parede, pavimento ou teto com giz, fita ou laser para posterior rasgo."
    ]
   },
   {
    "g": 1,
    "n": "Remoção das instalações existentes",
    "h": 1.5,
    "quem": "Empreiteiro Geral",
    "det": [
     "Corte e desmontagem das tubagens antigas (PVC, cobre, ferro galvanizado ou PPR).",
     "Tamponamento temporário dos pontos de entrada e saída para evitar fugas de água ou maus cheiros.",
     "Limpeza das caleiras e caixas de visita existentes.",
     "Verificação do estado do coletor principal — decidir se mantém ou substitui conforme inspeção."
    ]
   },
   {
    "g": 1,
    "n": "Execução de rasgos e aberturas",
    "h": 2.5,
    "quem": "Empreiteiro Geral",
    "det": [
     "Abertura controlada de paredes, pavimentos e tetos falsos para passagem das novas tubagens, respeitando sempre as estruturas e armaduras existentes.",
     "Utilização de rebarbadora, martelo pneumático leve ou serra de parede, consoante o tipo de suporte.",
     "Limpeza dos rasgos e preparação das superfícies para a nova instalação."
    ]
   },
   {
    "g": 1,
    "n": "Instalação das novas tubagens",
    "h": 2.5,
    "quem": "Empreiteiro Geral",
    "det": [
     "Abastecimento de água fria e quente:; Instalação de tubagens em PEX, multicamada ou PPR com diâmetros adequados (mín. Ø16 para lavatórios e Ø20 para duches ou lavatórios duplos).; Fixação com abraçadeiras plásticas ou metálicas, respeitando espaçamentos máximos de 50–60 cm.; Interposição de mangas isolantes para evitar condensação e ruído.; Colocação de válvulas de seccionamento em pontos estratégicos (entrada, lavatório, máquina, base de duche).",
     "Rede de esgotos e ventilação:; Utilização de tubagem em PVC ou PP de parede lisa (mín. Ø40 mm para lavatórios, Ø50 mm para duches e máquinas, Ø110 mm para sanitas).; Execução dos ramais com declive mínimo de 2% para garantir o escoamento.; União com manguitos e juntas elásticas devidamente lubrificadas.; Instalação de joelhos, sifões e ventiladores secundários, conforme necessidade."
    ]
   },
   {
    "g": 1,
    "n": "Ensaios e verificação",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Ensaio de estanquidade da rede de água:; Pressurização a 6 bar durante 30 minutos, sem perdas.; Verificação de todas as uniões e conexões.",
     "Teste de escoamento na rede de esgotos:; Enchimento parcial de ramais e verificação visual de fugas.; Confirmar a ausência de ruídos e refluxos.",
     "Registo de resultados e aprovação pelo técnico responsável."
    ]
   },
   {
    "g": 1,
    "n": "Fecho dos rasgos e limpeza final",
    "h": 4.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Após aprovação dos ensaios, fecho das roços e aberturas com argamassa de enchimento (cimento/areia) ou reboco fino.",
     "Regularização das superfícies para posterior revestimento.",
     "Limpeza final das zonas de intervenção, remoção de resíduos e etiquetagem dos pontos de ligação."
    ]
   },
   {
    "g": 2,
    "n": "Levantamento e planeamento da instalação",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Análise do projeto elétrico e do layout da casa de banho, identificando:; Localização de tomadas, interruptores, pontos de luz e saídas técnicas.; Tipo de conduta (embutida ou aparente) e altura de instalação conforme normas (ex.: tomadas 1,10 m acima do piso, interruptores a 1,20 m).",
     "Verificação do quadro elétrico existente — avaliar se há necessidade de:; Novos disjuntores;; Diferenciais (ID);; Aumento de potência contratada;; Reforço de cablagem principal.",
     "Marcação no local, conforme traçado aprovado."
    ]
   },
   {
    "g": 2,
    "n": "Execução de rasgos e passagens",
    "h": 2.5,
    "quem": "Empreiteiro Geral",
    "det": [
     "Abertura controlada de roços em paredes e tetos para embutir tubagens elétricas, respeitando as zonas de segurança (verticais e horizontais).",
     "Colocação de caixas de derivação, aparelhagem e passagem (PVC ou ABS, com grau de proteção IP adequado).",
     "Fixação mecânica das tubagens (tubos corrugados de Ø16–25 mm) com abraçadeiras ou argamassa de enchimento.",
     "Em pavimentos, execução de passagens embutidas protegidas por tubo rígido ou conduta metálica, conforme o caso."
    ]
   },
   {
    "g": 2,
    "n": "Lançamento e ligação dos condutores",
    "h": 2.0,
    "quem": "Eletricista",
    "det": [
     "Introdução dos condutores elétricos (tipo H07V-U ou H07V-R) nos tubos, respeitando a codificação de cores:; Azul – Neutro (N); Castanho / Preto / Cinzento – Fase (L); Verde/Amarelo – Terra (PE)",
     "Dimensionamento das secções dos cabos conforme o circuito: Circuito Secção do Condutor Proteção Iluminação 1,5 mm² Disjuntor 10 A Tomadas gerais 2,5 mm² Disjuntor 16 A",
     "Instalação dos condutores de terra interligando todas as tomadas metálicas e aparelhos."
    ]
   },
   {
    "g": 2,
    "n": "Montagem dos equipamentos e aparelhagem",
    "h": 4.0,
    "quem": "Eletricista",
    "det": [
     "Instalação das caixas de aparelhagem embutidas (tomadas, interruptores, saídas de cabos, pontos de luz).",
     "Fixação de quadros parciais (se aplicável) e identificação dos disjuntores.",
     "Colocação de mangas protetoras em todas as passagens de cabos por paredes e tetos.",
     "Instalação de pontos de iluminação (plafons, calhas LED, focos encastrados) e ligação aos interruptores."
    ]
   },
   {
    "g": 2,
    "n": "Ensaios, medições e verificações",
    "h": 1.0,
    "quem": "Eletricista",
    "det": [
     "Teste de continuidade de condutores (fase, neutro e terra).",
     "Verificação de isolamento com megômetro (500 VDC).",
     "Teste de resistência da terra — medição inferior a 50 Ω, conforme norma.",
     "Teste de diferenciais e disjuntores com equipamento de verificação.",
     "Ensaio funcional de todos os circuitos, confirmando o funcionamento das tomadas, iluminação e equipamentos.",
     "Registo dos resultados no relatório de ensaio elétrico para aprovação."
    ]
   },
   {
    "g": 2,
    "n": "Fecho de roços e limpeza",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Após aprovação dos testes, fecho das roças e caixas com argamassa de enchimento ou massa de regularização.",
     "Limpeza das superfícies e retirada de detritos.",
     "Rotulagem final das tomadas e circuitos no quadro elétrico.",
     "Entrega do esquema atualizado da instalação elétrica executada (as built)."
    ]
   },
   {
    "g": 3,
    "n": "Planeamento e marcação",
    "h": 0.5,
    "quem": "Empreiteiro Geral",
    "det": [
     "Confirmar a posição exata e modelo do equipamento (toalheiro, radiador, convetor, etc.), de acordo com o layout do projeto.",
     "Verificar altura de instalação recomendada (geralmente 90–120 cm do piso acabado) e distâncias mínimas a outros elementos (sanita, lavatório, base de duche).",
     "Determinar o tipo de ligação necessária:; Elétrica – toalheiro elétrico ou convetor;; Hidráulica – radiador ligado à rede de aquecimento central;; Híbrida – elétrica + circuito de água quente.",
     "Marcar no local os pontos de alimentação e fixação com base em medidas do fabricante."
    ]
   },
   {
    "g": 3,
    "n": "Infraestrutura elétrica (para toalheiro elétrico ou convetor)",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Garantir alimentação elétrica individual proveniente do quadro secundário ou circuito dedicado (tomada técnica).",
     "Utilizar condutor com secção mínima de 2,5 mm² (H07V-U ou equivalente) e proteção por disjuntor 16 A e diferencial de 30 mA.",
     "Executar a canalização elétrica embutida em tubo corrugado Ø16–20 mm, até à caixa de saída do equipamento (a 1,10–1,20 m do piso).",
     "Instalar caixa de derivação embutida atrás ou ao lado do ponto de fixação do toalheiro.",
     "Não utilizar tomadas convencionais em zonas de duche ou banheira — apenas ligação direta e estanque.",
     "Assegurar grau de proteção IP44 ou superior, adequado a zonas húmidas (conforme norma IEC 60364).",
     "Identificar o circuito no quadro com etiqueta “Toalheiro Elétrico – Casa de Banho”."
    ]
   },
   {
    "g": 3,
    "n": "Infraestrutura hidráulica (para toalheiro ou radiador de água quente)",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Confirmar existência ou planeamento de circuito de aquecimento central (alimentado por caldeira, bomba de calor ou termoacumulador).",
     "Estudar o traçado das tubagens (ida e retorno) até ao ponto de ligação do radiador/toalheiro.",
     "Utilizar tubagem em multicamada, PEX ou cobre, Ø16 mm, com isolamento térmico.",
     "Executar a instalação embutida nas paredes ou pavimento, protegendo com mangas plásticas.",
     "Deixar as pontas das tubagens tapadas e sinalizadas, com espaçamento conforme o tipo de ligação (normalmente 50 mm entre eixos).",
     "Prever válvulas de corte e purgadores automáticos junto ao equipamento.",
     "Fixar os tubos para evitar vibrações e assegurar declives adequados para o correto enchimento e drenagem."
    ]
   },
   {
    "g": 3,
    "n": "Infraestrutura híbrida (elétrica + hidráulica)",
    "h": 1.0,
    "quem": "Auditor",
    "det": [
     "Combinar as duas redes:; Alimentação elétrica embutida com tubo separado da instalação hidráulica;; Tubos de ida e retorno em multicamada ou PEX;; Caixa técnica de junção e válvulas de corte embutidas no revestimento.",
     "Deixar o ponto de energia e as tubagens na mesma vertical, para compatibilidade com o equipamento híbrido."
    ]
   },
   {
    "g": 3,
    "n": "Verificação e ensaios",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Antes de fechar os roços:; Verificar continuidade e isolamento elétrico do circuito com multímetro;; Testar estanquidade das tubagens hidráulicas sob pressão (6 bar durante 30 minutos).",
     "Conferir o alinhamento e posicionamento dos pontos de fixação e ligações.",
     "Fotografar e registar a posição exata das infraestruturas embutidas para futura referência.",
     "Após aprovação técnica, proceder ao fecho das roças com argamassa e reboco fino."
    ]
   }
  ]
 },
 {
  "obra": "wc",
  "fase": 3,
  "nome": "Revestimentos e Acabamentos Base",
  "tarefas": [
   {
    "g": 1,
    "n": "Preparação das superfícies",
    "h": 2.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Limpeza completa das superfícies de poeiras, gorduras, restos de argamassa ou tintas soltas.",
     "Retirada de pregos, buchas, resíduos e elementos metálicos oxidados.",
     "Humedecimento ligeiro das superfícies, quando necessário, para melhorar a aderência.",
     "Verificação de fissuras ou buracos e reparação com argamassa de reparo (cimento e areia fina ou massa reparadora específica).",
     "Aplicação de primário de aderência (base acrílica ou epóxi) em suportes muito absorventes ou lisos (betão polido, reboco antigo, etc.)."
    ]
   },
   {
    "g": 1,
    "n": "Regularização das paredes",
    "h": 8,
    "quem": "Empreiteiro Geral",
    "det": [
     "Aplicação de reboco de regularização com argamassa tradicional (cimento/areia 1:3 a 1:4) ou massa pré-doseada industrial conforme especificação.",
     "Espessura média entre 1,5 e 2 cm, aplicada com colher e desempenadeira metálica.",
     "Nivelamento com régua de alumínio e verificação de prumos e esquadrias.",
     "Em zonas húmidas (chuveiro, lavatório, etc.), adicionar aditivo impermeabilizante líquido à argamassa.",
     "Após endurecimento (24–48h), lixagem e limpeza superficial."
    ]
   },
   {
    "g": 1,
    "n": "Regularização dos pavimentos",
    "h": 8,
    "quem": "Empreiteiro Geral",
    "det": [
     "Limpeza e remoção de poeiras, resíduos soltos e desníveis.",
     "Aplicação de camada de regularização (betonilha) em argamassa de cimento e areia (1:3) ou com argamassa autonivelante, conforme o tipo de revestimento final.",
     "Espessura média de 3 a 5 cm, com declives mínimos de 2% em zonas molhadas para garantir o escoamento.",
     "Execução de juntas perimetrais com espuma ou fita compressível junto às paredes.",
     "Cura húmida da betonilha por no mínimo 48 horas antes da impermeabilização."
    ]
   },
   {
    "g": 1,
    "n": "Impermeabilização das paredes e pavimentos",
    "h": 8,
    "quem": "Empreiteiro Geral",
    "det": [
     "Aplicação de sistema impermeabilizante bicomponente (cimento + resina) ou membrana líquida acrílica, conforme especificação técnica do fabricante.",
     "Aplicar com trincha ou rolo, em duas a três demãos cruzadas, respeitando o tempo de secagem entre camadas (geralmente 4–6h).",
     "Reforço com tela ou malha de fibra de vidro nas zonas críticas:; Cantos parede/pavimento;; Perímetros de ralos e drenos;; Junções com tubagens e bases de duche.",
     "Subida mínima de 20 cm nas paredes e até 1,80 m nas zonas de duche ou banheira.",
     "Teste final de estanqueidade (enchimento do pavimento com 2–3 cm de água por 24h) antes de revestir."
    ]
   },
   {
    "g": 1,
    "n": "Acabamentos e limpeza",
    "h": 2.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Após a secagem completa, verificar planicidade, aderência e estanqueidade da superfície.",
     "Retirar resíduos, poeiras ou salpicos de produto impermeabilizante.",
     "Aplicar primário ou promotor de aderência (quando exigido pelo sistema de revestimento cerâmico).",
     "Entregar a superfície pronta para assentamento dos revestimentos."
    ]
   },
   {
    "g": 2,
    "n": "Preparação das superfícies",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Verificar se a regularização e impermeabilização das superfícies foram concluídas, secas e em bom estado.",
     "Assegurar que a superfície está limpa, firme e isenta de pó, gordura ou resíduos de cimento.",
     "Aplicar primário de aderência ou promotor (no caso de betonilhas muito lisas ou absorventes).",
     "Marcar os níveis de referência (pontos de nível, linhas horizontais e verticais) com laser, fio de prumo ou mangueira de nível.",
     "Determinar o ponto de partida do revestimento para minimizar cortes visíveis e manter simetria."
    ]
   },
   {
    "g": 2,
    "n": "Seleção e preparação dos materiais",
    "h": 0.5,
    "quem": "Empreiteiro Geral",
    "det": [
     "Escolher o tipo de revestimento conforme o projeto:; Azulejos cerâmicos ou porcelânicos;; Mosaicos hidráulicos ou vinílicos;; Pedra natural (mármore, granito);; Pastilhas de vidro ou cerâmica.",
     "Verificar dimensões, tonalidades e calibre dos lotes para evitar diferenças visuais.",
     "Preparar a argamassa colante adequada ao tipo de material e suporte (C1, C2, S1, S2 conforme EN 12004).",
     "Misturar o produto mecanicamente até obter uma pasta homogénea, respeitando as proporções e tempos de maturação."
    ]
   },
   {
    "g": 2,
    "n": "Colocação de revestimentos em paredes",
    "h": 6.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Aplicar a argamassa colante com desempenadeira dentada (6 a 10 mm), em áreas de aproximadamente 1 m² de cada vez.",
     "Assentar os azulejos pressionando e movendo ligeiramente em sentido horizontal/vertical para garantir a aderência.",
     "Manter juntas regulares (1,5 a 3 mm) com uso de cruzetas ou niveladores.",
     "Verificar nivelamento e alinhamento continuamente com régua e nível de bolha.",
     "Nas zonas húmidas (chuveiro, lavatório, rodapé), aplicar cola com aditivo impermeável e reforçar juntas.",
     "Cortar peças com serra de azulejos ou cortadora de disco diamantado para encaixes em tomadas, torneiras e ralos."
    ]
   },
   {
    "g": 2,
    "n": "Colocação de revestimentos em pavimentos",
    "h": 6.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Verificar o nível e planeza do piso e corrigir eventuais irregularidades.",
     "Aplicar a argamassa colante sobre o pavimento, distribuindo uniformemente com desempenadeira dentada (10 a 12 mm).",
     "Assentar as peças de forma ordenada, seguindo o traçado predefinido (em fiadas, diagonal, junta contínua, junta desencontrada, etc.).",
     "Utilizar niveladores de pavimento para eliminar desníveis entre peças (efeito “lippage”).",
     "Garantir juntas uniformes e espaçamento adequado, conforme o formato da peça.",
     "Retirar imediatamente o excesso de cola das juntas e superfícies."
    ]
   },
   {
    "g": 2,
    "n": "Betumação (rejuntamento)",
    "h": 6.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Aguardar o tempo mínimo de cura da cola (geralmente 24h).",
     "Preparar o betume de juntas (cimento ou epóxi) de acordo com o tipo de revestimento e local de aplicação.",
     "Aplicar com espátula de borracha, em diagonal às juntas, preenchendo completamente os espaços.",
     "Remover o excesso de material com esponja húmida após início de presa.",
     "Em zonas húmidas, utilizar betumes impermeáveis ou epoxídicos.",
     "Após secagem, realizar limpeza final com pano seco e detergente neutro."
    ]
   },
   {
    "g": 2,
    "n": "Acabamentos e inspeção",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Executar selagem com silicone neutro nas juntas de dilatação e perimetrais (encontros parede/piso, lavatórios, bases de duche).",
     "Verificar planicidade, verticalidade e alinhamento das juntas.",
     "Corrigir eventuais falhas, lascas ou peças desalinhadas antes da entrega.",
     "Limpar integralmente as superfícies, removendo resíduos de cimento e poeiras."
    ]
   },
   {
    "g": 3,
    "n": "Preparação das superfícies",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Verificar se as paredes e tetos estão secos, limpos e devidamente rebocados.",
     "Corrigir fissuras, juntas e imperfeições com massa de barramento e lixa fina.",
     "Remover poeiras, resíduos de cimento e manchas de humidade.",
     "Isolar e proteger zonas já acabadas (revestimentos cerâmicos, pavimentos, caixilhos) com fita adesiva e plásticos.",
     "Confirmar as cotas de instalação dos tetos falsos e sancas segundo o projeto de arquitetura/interiores."
    ]
   },
   {
    "g": 3,
    "n": "Instalação de tetos falsos (gesso cartonado ou PVC)",
    "h": 8,
    "quem": "Empreiteiro Geral",
    "det": [
     "Marcação e traçado de níveis:; Utilizar nível laser ou mangueira de água para definir o plano do teto falso.; Marcar a altura de instalação (normalmente 5 a 15 cm abaixo da laje, consoante a necessidade técnica).",
     "Montagem da estrutura metálica (perfilado galvanizado):; Fixar o perfil perimetral (UD) ao contorno das paredes com buchas e parafusos.; Instalar perfis principais (CD) suspensos por pendurais ajustáveis, espaçados entre 40–50 cm.; Garantir a planicidade do conjunto e travamento com perfis secundários.",
     "Aplicação das placas de gesso cartonado (Pladur® ou equivalente):; Aparafusar as placas aos perfis CD com parafusos autorroscantes, afastados no máximo 17 cm entre si.; Dispor as juntas desencontradas entre fiadas para maior resistência.; Deixar aberturas previstas para luminárias, exaustores e acessos técnicos.",
     "Tratamento de juntas e acabamentos:; Aplicar massa de juntas e fita de papel microperfurada sobre as uniões das placas.; Lixar e aplicar segunda demão de massa até obter uma superfície uniforme e pronta para pintura.",
     "Limpeza e inspeção final antes da pintura, garantindo ausência de poeiras ou resíduos."
    ]
   },
   {
    "g": 3,
    "n": "Pintura de tetos e paredes superiores",
    "h": 12.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Aplicar primário selante acrílico sobre as superfícies de gesso cartonado e rebocos secos.",
     "Após secagem, aplicar duas demãos de tinta acrílica lavável ou antimofo, com rolo de lã curta ou pistola airless.",
     "Manter intervalos de secagem adequados entre demãos (mínimo 4 h).",
     "Assegurar uma acabamento homogéneo, sem manchas ou escorrimentos.",
     "Inspecionar sob luz natural e corrigir eventuais falhas."
    ]
   },
   {
    "g": 3,
    "n": "Montagem de sancas (gesso, poliuretano, EPS ou madeira)",
    "h": 2.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Escolher o tipo de sanca conforme o projeto (decorativa, técnica para LED, ou de remate).",
     "Cortar as peças com ingleteira para garantir juntas limpas e ângulos precisos.",
     "Fixar as sancas ao teto e paredes com cola de montagem e pregos de acabamento (conforme o material).",
     "Corrigir juntas com massa e lixar até obter superfície contínua.",
     "Aplicar pintura final ou acabamento decorativo conforme o material (gesso, PVC ou madeira).",
     "Se aplicável, integrar fitas LED embutidas ou calhas técnicas antes da pintura final."
    ]
   },
   {
    "g": 3,
    "n": "Instalação de rodapés e acabamentos base",
    "h": 4.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Limpar as superfícies de aplicação (paredes e pavimento).",
     "Cortar os rodapés à medida, com uniões em esquadria nas esquinas.",
     "Fixar com cola de montagem, buchas ou clipes metálicos (consoante o material: cerâmico, MDF, alumínio ou PVC).",
     "Garantir o nivelamento e continuidade linear ao longo de todo o perímetro.",
     "Selar a junção superior com silicone ou massa acrílica para evitar infiltração de humidade.",
     "Aplicar retoques de pintura nos encontros e zonas de ligação."
    ]
   },
   {
    "g": 3,
    "n": "Acabamentos e inspeção final",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Verificar o nivelamento e alinhamento dos tetos, sancas e rodapés.",
     "Corrigir pequenas imperfeições com massa fina e repintar, se necessário.",
     "Limpar todas as superfícies e remover proteções.",
     "Testar iluminação e encaixe de elementos embutidos (spotlights, sensores, ventax).",
     "Confirmar que todas as juntas estão seladas e livres de fissuras."
    ]
   }
  ]
 },
 {
  "obra": "wc",
  "fase": 4,
  "nome": "Montagem Final e Acabamentos Finos",
  "tarefas": [
   {
    "g": 1,
    "n": "Preparação e verificação",
    "h": 0.5,
    "quem": "Empreiteiro Geral",
    "det": [
     "Confirmar que as infraestruturas de água e esgoto estão testadas e limpas.",
     "Conferir posições, alturas e diâmetros das ligações:; Esgotos: Ø110 mm (sanita), Ø40–50 mm (lavatório e bidé).; Água fria/quente: Ø16–20 mm, com válvulas de corte visíveis.",
     "Verificar nível e planeza do pavimento e paredes onde serão fixadas as louças.",
     "Reunir o material completo de fixação e vedação (buchas, parafusos, anilhas, juntas, silicone).",
     "Proteger o piso com manta ou cartão para evitar riscos durante a montagem."
    ]
   },
   {
    "g": 1,
    "n": "Montagem da sanita",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Posicionar a sanita conforme o traçado de projeto, garantindo alinhamento e estabilidade.",
     "Ligar a saída de esgoto com manguito de ligação em PVC Ø110 mm, vedado com anel de borracha ou silicone.",
     "Fixar a base ao pavimento com parafusos e buchas adequadas (ou colagem com silicone estrutural se o modelo for suspenso).",
     "Conectar a alimentação de água ao reservatório (autoclismo embutido ou externo).",
     "Testar a descarga e enchimento, verificando fugas e ruídos.",
     "Colocar a tampa do assento e ajustar as fixações."
    ]
   },
   {
    "g": 1,
    "n": "Montagem do lavatório",
    "h": 0.75,
    "quem": "Empreiteiro Geral",
    "det": [
     "Posicionar o lavatório ou móvel-lavatório conforme o nível e o ponto de esgoto.",
     "Fixar o lavatório à parede com suportes metálicos ou parafusos com buchas de alta resistência.",
     "Ligar os flexíveis de alimentação (água fria e quente) às válvulas de corte.",
     "Conectar o sifão ao tubo de esgoto (Ø40 mm), garantindo estanqueidade com juntas e fita PTFE.",
     "Nivelar o conjunto e aplicar selante de silicone no perímetro de contacto com a parede."
    ]
   },
   {
    "g": 1,
    "n": "Montagem do bidé (se aplicável)",
    "h": 0.67,
    "quem": "Empreiteiro Geral",
    "det": [
     "Alinhar o bidé paralelamente à sanita.",
     "Ligar flexíveis às válvulas de corte e o sifão ao tubo de drenagem.",
     "Testar descarga e estanqueidade de todas as ligações.",
     "Selar a base com silicone."
    ]
   },
   {
    "g": 1,
    "n": "Montagem da base de duche ou banheira",
    "h": 1.5,
    "quem": "Empreiteiro Geral",
    "det": [
     "Nivelar o suporte e verificar o escoamento da tubagem de drenagem (declive ≥ 2%).",
     "Colocar a base sobre o suporte ou estrutura e ligar o sifão à saída de esgoto.",
     "Testar o escoamento com água antes da selagem final.",
     "Aplicar silicone sanitário (fungicida) no contorno da base ou banheira.",
     "Em banheiras, ligar válvulas e transbordo e testar o enchimento e escoamento."
    ]
   },
   {
    "g": 1,
    "n": "Verificação e limpeza final",
    "h": 0.5,
    "quem": "Empreiteiro Geral",
    "det": [
     "Confirmar ausência de fugas, ruídos ou vibrações.",
     "Verificar nível, alinhamento e estabilidade de todos os equipamentos.",
     "Remover restos de silicone e resíduos de montagem.",
     "Limpar as superfícies com pano húmido e detergente neutro."
    ]
   },
   {
    "g": 2,
    "n": "Preparação",
    "h": 0.5,
    "quem": "Empreiteiro Geral",
    "det": [
     "Confirmar que as louças, revestimentos e selagens estão concluídas e curadas.",
     "Verificar a pressão da rede de água (2,5–4 bar) e a limpeza das tubagens.",
     "Proteger as superfícies com mantas ou panos antes de instalar os elementos metálicos.",
     "Reunir os modelos exatos de torneiras e acessórios definidos no projeto."
    ]
   },
   {
    "g": 2,
    "n": "Instalação de torneiras",
    "h": 0.75,
    "quem": "Empreiteiro Geral",
    "det": [
     "Torneira de lavatório / bidé:; Montar o corpo e vedantes conforme as instruções do fabricante.; Ligar flexíveis de água fria e quente às válvulas de corte.; Fixar o conjunto firmemente sem excessos de aperto.; Testar o funcionamento e estanqueidade.",
     "Coluna de duche / banheira:; Fixar as bases excêntricas à parede, alinhadas e niveladas.; Instalar o misturador e apertar com chaves adequadas, protegendo o acabamento cromado.; Ligar o chuveiro, mangueira e suporte.; Testar caudal, temperatura e pressão."
    ]
   },
   {
    "g": 2,
    "n": "Instalação de acessórios sanitários",
    "h": 0.67,
    "quem": "Empreiteiro Geral",
    "det": [
     "Marcar a posição conforme o layout ergonómico:; Porta-toalhas: 90–120 cm do piso;; Porta-rolo: 65–70 cm do piso e 20–30 cm da sanita;; Suporte de copo, saboneteira e gancho em zonas acessíveis.",
     "Utilizar buchas de nylon e parafusos inoxidáveis, com nivelamento preciso.",
     "Evitar perfurações sobre tubagens — usar detetor de metais.",
     "Fixar firmemente, garantindo estabilidade e alinhamento visual."
    ]
   },
   {
    "g": 2,
    "n": "Instalação de espelhos",
    "h": 0.5,
    "quem": "Empreiteiro Geral",
    "det": [
     "Confirmar altura ideal (eixo central a 1,60 m do piso).",
     "Verificar a verticalidade e aplicar buchas e suportes adequados ao peso.",
     "Em modelos colados, utilizar cola de montagem neutra (sem solventes) e apoio temporário até cura total.",
     "Limpar o espelho após a instalação."
    ]
   },
   {
    "g": 2,
    "n": "Montagem de mobiliário",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Posicionar o móvel-lavatório ou armário conforme o projeto e prumos da parede.",
     "Fixar à parede com buchas e parafusos adequados (alvenaria ou pladur).",
     "Ajustar portas e gavetas (nivelamento e amortecedores).",
     "Colocar tampas, puxadores e prateleiras internas.",
     "Selar a junção entre móvel e parede com silicone neutro."
    ]
   },
   {
    "g": 2,
    "n": "Verificação e limpeza final",
    "h": 0.5,
    "quem": "Empreiteiro Geral",
    "det": [
     "Testar todas as torneiras e válvulas de fecho.",
     "Confirmar ausência de fugas, ruídos e vibrações.",
     "Verificar alinhamento e fixação de acessórios e espelhos.",
     "Limpar cuidadosamente todos os acabamentos (inox, cromados e espelhos).",
     "Remover proteções e realizar inspeção visual conjunta com o responsável técnico."
    ]
   },
   {
    "g": 3,
    "n": "Preparação e verificação",
    "h": 0.5,
    "quem": "Empreiteiro Geral",
    "det": [
     "Confirmar que a instalação elétrica está finalizada e testada na Fase 2, com circuitos devidamente identificados e disjuntores instalados.",
     "Cortar a alimentação geral (disjuntor principal) antes de iniciar qualquer ligação.",
     "Verificar o tipo de equipamento a instalar e os respetivos requisitos elétricos:; Luminárias de teto embutidas ou de superfície;; Espelhos com luz integrada;; Ventax (exaustor ou ventilador elétrico);; Tomadas e interruptores adicionais.",
     "Conferir que os cabos de alimentação (fase, neutro e terra) estão corretamente dimensionados e identificados por cor:; Fase (L): castanho, preto ou cinzento;; Neutro (N): azul;; Terra (PE): verde/amarelo.",
     "Certificar-se de que o grau de proteção (IP) dos equipamentos é adequado à zona da casa de banho:; IP44 ou superior em zonas húmidas (duche, lavatório);; IP20–IP40 em zonas secas."
    ]
   },
   {
    "g": 3,
    "n": "Ligação de luminárias",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Confirmar o posicionamento exato das luminárias segundo o projeto (teto, parede, embutido ou de superfície).",
     "Verificar a compatibilidade entre o tipo de luminária e a alimentação disponível (230 V AC ou 12/24 V DC, conforme o caso).",
     "Fixar a base ou calha de suporte com buchas e parafusos adequados ao tipo de suporte (reboco, gesso cartonado ou betão).",
     "Conectar os condutores ao borne da luminária:; L (fase) → castanho/preto;; N (neutro) → azul;; PE (terra) → verde/amarelo.",
     "Garantir que as ligações são feitas com fichas rápidas ou bornes isolados e sem fios expostos.",
     "Fixar o difusor e testar o funcionamento do interruptor correspondente.",
     "Verificar nível de iluminação e ausência de cintilação."
    ]
   },
   {
    "g": 3,
    "n": "Ligação de Ventax (exaustor elétrico ou ventilador)",
    "h": 0.5,
    "quem": "Empreiteiro Geral",
    "det": [
     "Verificar o local e dimensão da saída de ar, assegurando ligação à conduta de exaustão.",
     "Confirmar a tensão de alimentação (230 V) e a existência de circuito protegido (disjuntor 10 A + diferencial 30 mA).",
     "Montar o corpo do equipamento com buchas adequadas e vedar o perímetro com silicone neutro (em zonas húmidas).",
     "Efetuar a ligação elétrica:; L (fase) → castanho/preto;; N (neutro) → azul;; PE (terra) → verde/amarelo.",
     "Se o exaustor for automático (com sensor de humidade ou temporizador):; Ligar o fio de comando (geralmente branco) ao circuito de iluminação, para que funcione em simultâneo com o interruptor.",
     "Testar o funcionamento e ruído do motor, bem como o tempo de desligamento retardado (se aplicável).",
     "Confirmar que a exaustão é eficiente e sem retorno de ar."
    ]
   },
   {
    "g": 3,
    "n": "Instalação de interruptores e tomadas finais",
    "h": 0.5,
    "quem": "Empreiteiro Geral",
    "det": [
     "Instalar mecanismos de aparelhagem (tomadas e interruptores) com espelhos e placas frontais.",
     "Respeitar as zonas de proteção da casa de banho (Norma IEC 60364-7-701):; Zona 0: interior da banheira/duche — proibida instalação de aparelhos elétricos;; Zona 1: até 2,25 m acima do duche — só equipamentos IPX5 (Ventax);; Zona 2: até 0,6 m do limite da banheira — IPX4;; Zona 3: restantes áreas — equipamentos normais (IP20+).",
     "Fixar as caixas com parafusos inoxidáveis e verificar alinhamento e estabilidade.",
     "Testar o funcionamento de cada circuito (luzes, ventax, espelho, tomadas)."
    ]
   },
   {
    "g": 3,
    "n": "Ensaios e verificações finais",
    "h": 0.5,
    "quem": "Empreiteiro Geral",
    "det": [
     "Ligar o disjuntor principal e testar todos os circuitos individualmente.",
     "Confirmar:; Tensão nominal (230 V);; Funcionamento de luminárias e ventiladores;; Ausência de aquecimento excessivo ou ruídos;; Funcionamento dos diferenciais (ID) e proteção à terra.",
     "Testar o nível de iluminação e a ventilação adequada da casa de banho.",
     "Etiquetar circuitos no quadro elétrico, se aplicável.",
     "Executar verificação visual e funcional com o responsável técnico."
    ]
   },
   {
    "g": 4,
    "n": "Selagens técnicas e decorativas",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Aplicar silicone neutro, acrílico ou poliuretano em todas as juntas de dilatação, ligações entre materiais e uniões entre planos (parede/pavimento, bancada/parede, louça/revestimento, rodapé/piso).",
     "Escolher o tipo de selante conforme o local de aplicação:; Silicone neutro: zonas húmidas (cozinhas, casas de banho, lavandarias);; Selante acrílico: juntas de acabamento ou pintura;; Poliuretano (PU): juntas elásticas expostas a movimento ou vibração.",
     "Assegurar que as superfícies estão limpas, secas e livres de poeiras e gorduras.",
     "Aplicar fita de acabamento para delimitar a junta, garantindo linhas retas e limpas.",
     "Extrudir o selante com pistola aplicadora e alisar com espátula de silicone ou dedo umedecido.",
     "Remover a fita de proteção antes da secagem.",
     "Verificar continuidade, aderência e acabamento liso das selagens."
    ]
   },
   {
    "g": 4,
    "n": "Retoques de pintura e acabamento",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Corrigir imperfeições, riscos, manchas ou irregularidades nas paredes, tetos e rodapés.",
     "Retocar zonas afetadas durante a montagem (cantoneiras, esquadrias, sancas, etc.).",
     "Aplicar massa de retoque e tinta correspondente à cor e acabamento original (mate, acetinado, lavável, etc.).",
     "Verificar transições de cor e brilho para evitar diferenças visuais.",
     "Reapertar ou alinhar elementos soltos (módulos, dobradiças, sancas, rodapés).",
     "Substituir ou reparar pequenos elementos danificados (tampas, parafusos, perfis, cantoneiras)."
    ]
   },
   {
    "g": 4,
    "n": "Limpeza técnica e final",
    "h": 1.5,
    "quem": "Tecnico de Limpeza",
    "det": [
     "Limpeza grossa: remoção de poeiras, entulhos finos, restos de silicone, cola ou argamassa.; Varredura e aspiração de todas as superfícies.; Retirada de películas protetoras de móveis, bancadas e janelas",
     "Limpeza fina: higienização completa dos espaços e acabamentos:; Lavagem de revestimentos cerâmicos com detergente neutro.; Limpeza de bancadas, móveis, vidros, metais e acessórios com produtos específicos.; Polimento de torneiras, puxadores e superfícies em inox.; Limpeza de vidros com limpa-vidros e panos de microfibra.; Desinfeção de louças sanitárias e superfícies de contacto.",
     "Verificação de ausência de resíduos, manchas e marcas de dedos.",
     "Ventilação dos espaços para eliminar odores e humidade."
    ]
   },
   {
    "g": 4,
    "n": "Inspeção e controlo final",
    "h": 1.0,
    "quem": "Empreiteiro Geral",
    "det": [
     "Revisão detalhada de todas as zonas de intervenção:; Verificar juntas, selagens e acabamentos visuais.; Testar funcionamento de portas, janelas, torneiras, tomadas e luminárias.; Confirmar que não existem fugas de água, gás ou cabos expostos.",
     "Realizar checklist de verificação final de obra, assinado pelo encarregado ou técnico responsável.",
     "Executar retoques adicionais, se necessário.",
     "Entregar o espaço limpo, seco e totalmente operacional."
    ]
   }
  ]
 },
 {
  "obra": "wc",
  "fase": 5,
  "nome": "Entrega Final",
  "tarefas": [
   {
    "g": 1,
    "n": "Inspeção final com cliente",
    "h": 0.5,
    "quem": "Supervisor",
    "det": []
   },
   {
    "g": 1,
    "n": "Entrega de Book Obra",
    "h": 0.05,
    "quem": "Supervisor",
    "det": []
   }
  ]
 }
];
