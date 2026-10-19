# BUZUN SIMULATOR — Game Design Document (GDD)

**Versão:** 1.5 — World Engine piloto (3 fachadas) e relevo suave demonstrativo
**Data:** 19 de outubro de 2026  
**Projeto:** Buzun Simulator  
**Repositório:** https://github.com/DevSouza208/buzun-simulator  
**Plataforma prioritária:** navegador em computadores  
**Estado:** protótipo 0.1 implementado e relatado como executado em iPhone; expansão dos corredores aguardando testes reais de percurso

> **Diretriz máxima:** antes de construir um simulador enorme, provar que ele existe: um carro dirigível em ruas reais do Grajaú, dentro do navegador.

## 1. Resumo executivo

Buzun Simulator é um jogo de mundo aberto de transporte e progressão profissional ambientado inicialmente em São Paulo. O jogador dirige por uma **malha viária baseada em dados geográficos reais**, representada em um **3D low poly, legível e leve, sem estética voxel**. Começa escolhendo uma origem de carreira e, ao longo da evolução, pode trabalhar com transporte individual, serviços sobre duas rodas, vans, ônibus urbanos e rodoviários e, futuramente, administrar empresas.

O diferencial não é copiar fielmente cada prédio. É reconhecer a cidade pelas ruas, cruzamentos, trajetos e marcos importantes, sem abrir mão de uma estética própria e de bom desempenho.

A experiência deve equilibrar **direção acessível**, **sistemas semirrealistas** e **consequências econômicas**. O foco inicial é **jogador solo**. Modos passeio, Uber/aplicativo, gestão e corrida fazem parte da visão, mas não pertencem todos ao primeiro protótipo.

**Frase de apresentação:** "Dirija pelas ruas reais, construa sua carreira e transforme pequenas corridas em um império dos transportes."

## 2. Registro de decisões

### 2.1 Confirmadas pelo criador — NÃO reinterpretar

| Tema | Decisão |
|---|---|
| Conceito | Não apenas simulador de ônibus: progressão por atividades de transporte |
| Geografia | Começar em São Paulo e expandir |
| Área inicial | Grajaú e região do Terminal Grajaú |
| Representação | Mapa geograficamente real, cenários estilizados e pontos famosos mais detalhados |
| Plataforma | Navegador no PC primeiro |
| Visual | **3D low poly, sem voxel**, leve e com identidade própria |
| Veículos futuros | Carros, motos, ônibus urbanos e rodoviários, entre outras categorias |
| Primeiro veículo | Carro de aplicativo |
| Atividades futuras | Corridas de aplicativo, passeio, serviços de transporte, ônibus, gestão de empresa e corridas competitivas eventualmente |
| Mundo | Mundo aberto único, sem separar atividades em mundos distintos |
| Começo da carreira | Criador de personagem com dinheiro e profissão inicial personalizáveis |
| Habilitações | Desbloqueadas por missões e desafios |
| Física | Semirrealista, com peso, frenagem, danos e combustível |
| Economia | Combustível, multas, manutenção, financiamentos e negócios |
| Trânsito | Dinâmico, com obras, acidentes e emergências |
| Passageiros | Simples no início; interações e eventos depois |
| Tempo | Relógio acelerado, estações e clima variável |
| Sinistros | Danos amplos, guincho, seguro e consequências financeiras |
| Controles | Teclado, mouse e gamepad |
| Dificuldade | Equilibrada, com consequências financeiras |
| Multiplayer | Não é prioridade |
| Objetivo da 0.1 | Explorar ruas reais com um veículo dirigível |
| Editor de mundo (futuro) | Permitir selecionar edifícios, definir qual fachada representa cada lugar e modificar os modelos da cidade |
| Prioridade atual | "Por enquanto quero ver existir" |

### 2.2 Propostas técnicas deste GDD — ainda NÃO aprovadas

Three.js, TypeScript, Vite, processamento prévio de dados OpenStreetMap, física própria simplificada no início, Rapier futuramente, HUD mínimo, persistência local e distribuição estática. São recomendações de implementação, **não decisões do criador**.

### 2.3 Questões abertas — não preencher com suposições

Nome final/identidade visual e mascote; marcas de veículos reais ou fictícias; mapa exato e raio inicial; proporção de tempo do jogo; sistemas de customização do personagem; economia numérica/balanceamento; se haverá energia/fadiga; nível de realismo das leis de trânsito; classificação etária; monetização; suporte offline; expansão para celular; multiplayer; suporte a volante; licenças de assets e uso de marcas; escopo técnico da edição profunda de malha 3D (vértices/UV) versus edição paramétrica de modelos (dimensões, materiais e componentes).

## 3. Fantasia do jogador e pilares de design

**Fantasia:** começar como trabalhador independente do transporte, conhecer a cidade dirigindo, conquistar oportunidades e, se quiser, tornar-se proprietário de uma frota sem perder a liberdade de voltar ao volante.

**Pilares:**
1. **A cidade importa:** o mapa real é a base das trajetórias; marcos estilizados ajudam no reconhecimento.
2. **Liberdade contínua:** a progressão e as atividades acontecem no mesmo mundo.
3. **Direção prazerosa:** controles compreensíveis, sensação de massa, curvas e frenagem, com complexidade gradual.
4. **Consequências compreensíveis:** combustível, acidentes, tempo, multas e manutenção geram escolhas, não punição arbitrária.
5. **Construir por camadas:** sempre manter uma versão jogável antes de ampliar os sistemas.

**Público de interesse:** fãs de jogos de direção, ônibus, mapas reais, simuladores leves e evolução de carreira; incluir jogadores sem experiência em simulação hardcore.

## 4. Estrutura do jogo e ciclos de atividade

### 4.1 Loop básico — visão futura

**Escolher serviço → preparar veículo → dirigir até origem → embarcar/coletar → navegar até destino → concluir serviço → receber avaliação/pagamento → quitar despesas → melhorar veículo ou carreira → escolher próxima atividade.**

No mundo aberto, o jogador pode ignorar contratos e simplesmente explorar. O modo passeio é **uma atividade dentro do mesmo mundo**, não uma cópia separada do mapa.

### 4.2 Caminhos profissionais previstos

- **Aplicativo:** carro/moto/outros veículos habilitados; viagens individuais e pequenos serviços.
- **Transporte coletivo:** linhas urbanas, pontos e horários; ônibus e vans conforme progressão.
- **Rodoviário/fretamento:** trajetos longos, terminais e operações futuras.
- **Empresário:** adquirir frota, contratar motoristas, atender demandas e administrar custos.
- **Passeio:** direção livre sem obrigação econômica imediata.
- **Corridas:** modalidade competitiva futura, não prioridade.

Não impor uma árvore única obrigatória: missões liberam permissões e recursos, enquanto o jogador escolhe quais carreiras seguir. Categorias de habilitação são uma **abstração de jogo** inspirada na realidade, não substituem documentação real.

### 4.3 Exemplos de eventos futuros

Passageiro cancela; passageiro demora; chuva intensa; obra fecha acesso; acidente bloqueia a rota; fiscalização; pane mecânica; aumento de demanda perto de terminais; alteração temporária de itinerário. Eventos devem ser simples e previsíveis primeiro, evitando dependência de personagens com IA complexa.

## 5. Mundo, cidades e geração do mapa

### 5.1 Princípio geográfico

A topologia viária — posição das ruas, conexões, curvas e cruzamentos — vem de dados de mapa aberto. **Real não significa automaticamente idêntico:** largura de pista, sinalização, viadutos, elevação, fachadas e restrições viárias podem exigir aproximações ou dados complementares.

O cenário **low poly, sem voxel**, estiliza edifícios, calçadas, comércio, árvores, postes e mobiliário urbano. Locais icônicos podem receber assets artesanais separados, sem modificar a geografia real.

### 5.2 Área de estreia

**Grajaú, nas proximidades do Terminal Grajaú, São Paulo.** O recorte exato será fixado durante a implementação depois da inspeção dos dados. Não prometer mapa de toda São Paulo na versão inicial.

### 5.2.1 Expansão real dos corredores — implementada, verificação em campo pendente

A primeira versão de expansão deixa de estar restrita a um quadrado de cerca de 1 km em torno do Terminal Grajaú. Agora foram versionados dois extratos OSM adicionais, **sem inventar ruas ou alterar o traçado real**:

- **Avenida Dona Belmira Marin**: 55 trechos originais conectados, com 481 coordenadas e cerca de 9,1 km de comprimento **somado** (não confundir com extensão de ponta a ponta ou pistas paralelas).
- **Estrada Canal de Cocaia**: 16 trechos OSM.
- **Rua Pedro Escobar**: 9 trechos OSM.
- **Rua Rubens de Oliveira**: 3 trechos OSM.

A espinha dorsal foi validada automaticamente quanto à topologia conectada. Os novos dados usam coordenadas locais idênticas às do recorte inicial, removendo IDs de rua duplicados na mesclagem. O motor amplia o solo e aceita deslocamento por um corredor em torno das vias nomeadas sem carregar uma megacidade inteira.

**Decisão de performance:** fora da região original do Grajaú, a expansão atual inclui principalmente **vias 3D, não fachadas e quarteirões completos**. Um sistema posterior de setores carregáveis adicionará edifícios reais/estilizados nas proximidades. Relevo está expressamente adiado, conforme a ordem desejada pelo criador.

**Pendente de validação visual:** percorrer de carro os extremos da Belmira e os três ramais, conferir ruas/curvas, conexões, trechos que terminam, velocidade de carregamento e FPS no iPhone e desktop. Testes geográficos e de sintaxe não substituem uma volta completa no jogo.

### 5.3 Pipeline proposto para o motor de mapa

1. Selecionar pequena área geográfica de origem.
2. Extrair dados vetoriais do **OpenStreetMap** (preferencialmente no processo de desenvolvimento, não a cada sessão de jogo).
3. Filtrar vias pertinentes a automóveis; manter IDs originais e dados úteis: tipo, sentido, faixas e cruzamentos quando presentes.
4. Transformar latitude/longitude em coordenadas métricas locais, preservando uma origem geográfica consistente.
5. Construir grafo de vias: segmentos, nós, sentidos e conectividade.
6. Produzir malha 3D de asfalto com largura estimada e junções tratadas; suavizar curvas sem descaracterizar o traçado.
7. Adicionar solo, calçadas e obstáculos simples, com posicionamento procedural de objetos urbanos.
8. Preparar colisões e uma rede utilizável futuramente por GPS/IA.
9. Exportar arquivos locais leves, versionados e armazenados em cache; carregar por setores conforme a necessidade.
10. Validar visualmente contra o mapa fonte: posição relativa, cruzamentos, trechos interrompidos, sobreposições e sentido das vias.

**Dificuldades reconhecidas:** cruzamentos não são apenas retângulos; pontes e túneis precisam de níveis distintos; vias estreitas e sentido único exigem tratamento; geografia não garante altura dos edifícios. A primeira versão pode usar **terreno plano**, cruzamentos simplificados e fachadas genéricas, com evolução progressiva.

### 5.3.1 Relevo e ladeiras reais — possibilidade técnica, não implementada

**Pedido de estudo do criador:** avaliar a possibilidade de adicionar as elevações reais do mapa, principalmente subidas e descidas do Grajaú. **Resposta técnica: é viável**, porém esta não é uma escolha de implementação já confirmada para a 0.1.

**Abordagem proposta:** obter um Modelo Digital de Elevação (DEM), por exemplo dados de altitude em formato Mapzen Terrarium ou equivalente licenciado. O OSM responde *onde* estão as vias; o DEM aproxima *a que altitude* fica o terreno.

**Pipeline futuro:** (1) baixar/extrair alturas para a área de teste; (2) converter em grade de alturas local, relativa ao mesmo ponto de origem do mapa; (3) interpolar entre amostras e suavizar ruídos em trechos dirigíveis; (4) modificar terreno, ruas, calçadas e prédios, mantendo a geometria consistente; (5) atualizar colisores, posição e inclinação do carro; (6) adaptar a física a aclives/declives e ajustar câmera; (7) validar FPS e geometria em locais conhecidos. Em resolução da ordem de dezenas de metros, o DEM captura morros e inclinações gerais, não os centímetros de cada lombada ou rampa.

Não simplesmente elevar o plano e deixar os prédios/asfalto flutuando. Recomenda-se introduzir **depois de validar direção, rua e colisões no terreno plano**, sem comprometer a entrega do primeiro teste. Referência de codificação Terrarium: https://www.mapzen.com/blog/elevation/

### 5.4 Estratégia de escala

- **0.1:** uma área pequena já exportada como asset estático; nada de streaming global.
- **0.2–0.3:** múltiplos setores contíguos, cache e descarregamento de áreas distantes.
- **Futuro:** ampliação para bairros, outras regiões de São Paulo e outras cidades, sempre acompanhada por testes de desempenho e licenças.

Não usar a API pública de edição do OSM como backend de jogo nem fazer consultas massivas automáticas em instâncias públicas do Overpass. Para escala, usar extratos regionais/processamento próprios ou provedor apropriado.

### 5.5 Reconhecimento da cidade

Terminal Grajaú é uma âncora espacial; outros marcos ficam para fases posteriores. Marcas, nomes e fachadas reais exigem avaliação própria de licenciamento/representação. **Não afirmar fidelidade fotográfica.**

### 5.6 Editor de edifícios e fachadas — confirmado como funcionalidade FUTURA

**Decisão do criador:** depois da geração inicial do mundo, deve existir um editor onde seja possível **apontar para um prédio, dizer que lugar/fachada ele representa e modificar seu modelo 3D**. A geração automática entrega uma cidade dirigível imediatamente; as edições refinam o resultado ao longo do tempo. Não exigir o editor na 0.1.

**Proposta de fluxo de edição (sujeita a refinamento):**

1. Entrar no modo de edição (ferramenta de criação, separada da direção normal).
2. Clicar em um prédio existente no mundo 3D; o inspetor mostra a referência geográfica e o ID da construção.
3. Nomear/identificar o local (ex.: padaria, escola, farmácia, garagem, edifício residencial ou ponto de referência) **manualmente**, sem afirmar que o mapa já conheça a fachada real.
4. Escolher um preset de fachada low poly ou definir componentes (portas, janelas, vitrines, fachada comercial, telhado) e ajustar material/cor.
5. Ajustar dimensões, altura, orientação e posição visual do modelo dentro das restrições que o editor suportar.
6. Pré-visualizar, desfazer/refazer, salvar e recarregar sem perder as alterações.
7. Opcionalmente, numa etapa posterior, importar assets 3D (ex.: glTF/GLB), editar partes mais profundas da geometria e criar bibliotecas de fachadas reutilizáveis; **essas capacidades avançadas ainda não foram definidas como obrigatórias**.

**Arquitetura recomendada desde a base:** separar (a) **geografia original OSM** (nunca sobrescrever silenciosamente), (b) **geometria padrão procedural** e (c) **camada de sobrescritas/edições do usuário**. Um prédio terá identificador estável (ID OSM quando disponível, ou ID próprio derivado do recorte/geometria com estratégia para mudanças do mapa), tipo do local, preset/modelo, transformações e materiais. As edições devem estar em um formato serializável (por exemplo, JSON com versionamento), com opção futura de importar/exportar e possibilidade de recuperar alterações após regenerar setores. IDs derivados não são garantia absoluta quando a origem muda: prever detecção de conflitos e associação manual.

**Regra visual:** terrenos, pistas e veículos mantêm curvas e volumes adequados à direção; prédios são modelos low poly editáveis, **não blocos voxel**. Marcos icônicos podem ter modelos próprios e prioridades de detalhamento.

**Divisão de escopo:** 0.1 apenas prepara identificadores e estrutura de dados, *se isso não atrasar o protótipo*. O editor com seleção, catálogo de fachadas, personalização e persistência só entra após existir uma versão dirigível. Até lá, modelos genéricos são suficientes.

### 5.7 Prova do World Engine antes do botão Create (2026-10-19)

**Implementado em código:** três construções OSM existentes foram escolhidas para uma primeira geração automática de fachada low poly. IDs: `619054952` (casa com portão — ficção visual), `618875333` (comércio — ficção visual) e `618869167` (sobrado — ficção visual). As edificações e contornos existem nos dados OSM, **mas os respectivos tipos, fachadas e materiais são hipóteses artísticas**, não informações observadas em fotografia.

Motor piloto: `public/data/facade-pilot.json` define os presets; `src/facade-recipe.js` planeja o modelo sem dependências 3D; `src/world-engine.js` gera as peças em Three.js. A configuração preserva os IDs e pode ser substituída futuramente por editor, classificação semântica e materiais guardados em R2. **Nenhuma imagem de Street View/Mapillary, serviço de IA ou conta R2 foi acionado neste piloto.**

**Relevo agora:** `src/terrain.js` centraliza a amostragem `sampleHeight(x,z)` em metros. O terreno low poly no entorno inicial, asfalto, árvores, prédios, carro e câmera passam pela mesma interface. O valor atual é **uma ondulação procedural artificial suave, não dados de altitude reais**. As ruas distantes mantêm o terreno plano, com transição gradual. A próxima implementação pode trocar o amostrador por um DEM confiável, respeitando suavização de ruas, pontes e terrenos de construção.

**Próximo marco, ainda não feito:** validar no celular o relevo e as três fachadas; depois organizar uma biblioteca de texturas neutras reutilizáveis, referências legalmente permitidas e só então o botão que seleciona uma região e dispara a cadeia de processamento. O editor **não existe ainda** e a automação **não consulta APIs de imagem**.

## 6. Veículos e direção

### 6.1 Tipos previstos

- **Versão 0.1:** 1 carro genérico de passeio/aplicativo.
- **Depois:** motocicletas, carros adicionais, vans, ônibus urbanos convencionais/articulados e rodoviários.
- **Futuro distante:** variações de motorização, suspensão, transmissão e customização.

### 6.2 Modelo de direção semirrealista

Entradas: aceleração, freio, direção, ré e freio de estacionamento (este pode ser posterior). O comportamento considera velocidade, aceleração progressiva, esterçamento dependente da velocidade, aderência simplificada e desaceleração. Depois entram massa, carga, desgaste, piso molhado, danos, consumo e transmissão.

**0.1 não exige simulação completa de pneus ou motor.** Priorizar sensação de dirigir e estabilidade; uma física cinemática simples e testada pode ser melhor que um sistema complexo incompleto.

### 6.3 Câmeras

**Proposta para 0.1:** câmera em terceira pessoa com acompanhamento suave, controle com mouse e botão de recentrar. **Futuro:** painel, primeira pessoa, câmera externa livre, retrovisores e campo de visão configurável.

### 6.4 Danos e custos — visão futura

Colisões podem produzir danos visuais e mecânicos graduais, multas, acionamento de seguro, guincho e custos de reparo. O sistema deve explicar causas, custos e consequências, com salvaguardas contra situações irrecuperáveis que impeçam o jogador de continuar.

## 7. Personagem, habilidades e progressão

### 7.1 Criação inicial

O jogador define personagem, profissão de partida e recursos financeiros iniciais, conforme opções de início que serão balanceadas. Não definir valores monetários ou histórias fechadas neste momento.

### 7.2 Progressão

- Reputação por qualidade do serviço.
- Dinheiro para combustível, manutenção e expansão.
- Missões-desafio que habilitam novas categorias/atividades.
- Acesso gradual a contratos, veículos e garagem.
- Evolução opcional para empresa própria.

**Regra:** quem virar empresário poderá continuar dirigindo.

## 8. Passageiros, missões e serviços

### 8.1 Passageiros no lançamento do sistema de corridas (após 0.1)

Modelo mínimo: uma origem e um destino válidos, marcador de embarque, passageiro que aparece/entra com animação simples ou transição discreta, pagamento ao concluir e feedback curto. Não simular diálogos avançados no MVP.

### 8.2 Evolução

Avaliações, cancelamentos, atrasos, passageiros com preferências, mudanças de destino e eventos pontuais. Priorizar regras claras e eventos roteirizados sobre IA generativa em tempo real.

### 8.3 Navegação

Traçar rota em um grafo de ruas com segmentos dirigíveis, indicar destino no minimapa ou setas simples, respeitar sentidos quando os dados estiverem confiáveis. **Não prometer GPS completo na versão 0.1**.

## 9. Trânsito, tempo e clima

### 9.1 Trânsito dinâmico — fases futuras

Densidade por região e horário; semáforos; veículos com IA; pedestres simplificados; acidentes, obras e desvios temporários. Começar com tráfego discreto antes de simular centenas de agentes.

### 9.2 Relógio

Tempo acelerado com dia/noite, estações e clima dinâmico; relação entre tempo real e tempo do jogo a definir. Chuva/aderência e visibilidade são evoluções posteriores, não exigências da 0.1.

## 10. Economia e gerenciamento — visão futura

Entradas: corridas, contratos, fretamentos, receitas da frota. Saídas: combustível, manutenção, multas, taxas, seguro, guincho, financiamentos, funcionários e investimentos.

Proposta de balanço: remuneração baseada em distância, tempo, risco e qualidade, com despesas comunicadas antes e depois do serviço. Falência e recuperação financeira exigem desenho posterior; não bloquear o jogador sem saída.

Gestão empresarial futura: garagem, aquisição, rotas/contratos, manutenção programada, motoristas contratados, caixa e relatórios. O jogo permanece um mundo aberto, mesmo com interfaces de gestão.

## 11. Interface e controles

### 11.1 HUD da 0.1

Velocidade; indicador de marcha/sentido (se implementado); dica breve de controles; opção de reiniciar posição e painel simples de depuração (opcional no modo desenvolvimento). Evitar poluição visual.

### 11.2 Mapeamento preliminar — sujeito a teste

| Ação | Teclado | Gamepad (proposta) |
|---|---|---|
| Acelerar | W ou seta para cima | Gatilho direito |
| Frear / ré contextual | S ou seta para baixo | Gatilho esquerdo |
| Esterçar | A/D ou setas laterais | Analógico esquerdo |
| Mover câmera | Mouse | Analógico direito |
| Alternar câmera | C | Botão configurável |
| Reiniciar posição | R (com confirmação futura) | Menu de pausa |
| Pausar / opções | Esc | Start/Menu |

Permitir remapeamento posteriormente; prever sensibilidade, zona morta do controle e inversão de câmera. Input deve ser independente da simulação. Suporte real a gamepad requer testes com diferentes modelos/navegadores.

### 11.3 Acessibilidade e conforto

Legenda/ícones legíveis, opções gráficas, desligar trepidação excessiva de câmera, controle de volume, suporte a resolução variável; no futuro personalização de controles e alternativas para distinção de cores.

### 11.4 Controles touch mínimos — implementados no código, validação mobile pendente

Exibição automática em dispositivos de ponteiro sensível ao toque (CSS media `pointer: coarse`). Duas **setas esquerda/direita** à esquerda; dois **pedais FREIO/ACELERAR** à direita. Botões grandes, próximos aos polegares, visíveis em retrato e paisagem. Cada dedo mantém seu próprio estado de toque através de Pointer Events e pointer capture, permitindo acelerar e esterçar simultaneamente. Soltar/cancelar o toque interrompe a ação, assim como pausar, perder o foco ou ocultar a página. Freio funciona também como ré contextual conforme o modelo atual.

A HUD touch é **adaptação de controle** da 0.1 e não equivale a declarar suporte mobile plenamente otimizado. Performance, proporções e comportamento de gestos precisam ser testados em aparelhos reais.

## 12. Direção de arte e áudio

**Direção confirmada:** 3D **low poly sem voxel**. Usar superfícies poligonais limpas, silhuetas legíveis, materiais econômicos, paleta coesa e veículos estilizados reconhecíveis. As ruas permanecem suaves e dirigíveis. Prédios comuns devem ser gerados automaticamente com variações de altura, formato e fachadas; edifícios marcantes ganham modelos mais detalhados progressivamente. Evitar a aparência de cubos quadriculados típica de jogos voxel.

**Editabilidade futura confirmada:** os prédios não são apenas decoração descartável. Cada instância deve poder receber um identificador e, num editor posterior, ser identificada, receber uma fachada/modelo específico e sofrer ajustes visuais. Presets e sistemas parametrizados são propostas de implementação, não decisões finais.

**Áudio:** motor com pitch por rotação/velocidade, freio, colisão, ambiente urbano e interface. Usar recursos criados/licenciados, evitando sons copiados de jogos.

Acessórios publicitários e marcas reais não estão decididos; usar modelos fictícios no protótipo.

## 13. Arquitetura técnica recomendada

### 13.1 Stack proposta (não aprovada em definitivo)

- **Linguagem:** TypeScript.
- **Build/dev:** Vite.
- **Render:** Three.js / WebGL.
- **Mapas:** dados vetoriais OpenStreetMap processados previamente em arquivos de setor (GeoJSON intermediário ou formato compacto próprio).
- **Simulação 0.1:** modelo cinemático simples; avaliar Rapier para colisões/dinâmica no momento adequado.
- **UI:** HTML/CSS de baixa complexidade sobre canvas WebGL.
- **Persistência:** sem backend na 0.1; configurações/estado local depois.
- **Hospedagem:** arquivos estáticos, com provedor a decidir.
- **Testes:** unitários para geoconversão/grafo/física; verificações manuais em navegador, gamepad e desempenho; E2E quando houver menus e fluxo.

### 13.2 Módulos previstos

**core/** loop de atualização, configuração e estado; **input/** teclado e gamepad; **world/** leitura de setores, projeção geográfica, estradas, cenário, construções e colisões; **vehicles/** controle e física; **camera/** seguimento e orbit; **ui/** HUD e menus; **data/** mapa de teste e assets; **tools/** importador e validação OSM; **editor/** (futuro) seleção, inspeção, fachadas e sobrescritas; **tests/** regressões.

Ao implementar edifícios, considerar separar **dados-base**, **geração low poly padrão** e **edições persistidas** para evitar reescrever o motor quando chegar o editor. Essa preparação não deve adiar a primeira versão dirigível.

Separar **posição geográfica real** da **posição local renderizada**; documentar projeção e origem do mapa para evitar drift, inversões e distorções.

### 13.3 Fontes e licenças

- OpenStreetMap: dados sob ODbL, com atribuição visível e atenção às obrigações sobre bases derivadas.
- Overpass: útil para protótipo e extração pontual, mas não usar instâncias comunitárias como backend de produção de tráfego elevado.
- SPTrans/GTFS: candidato para fases de linhas urbanas; validar disponibilidade, campos e termos antes de integrar.
- Motores, modelos 3D, áudio e fotografias: registrar licenças e créditos por asset.
- Hop.Earth: referência conceitual, **não dependência assumida**; verificar código e licença da versão efetivamente encontrada antes de reutilizar qualquer arquivo.
- Não extrair mapas, fotos ou assets proprietários de Google Maps, Street View ou outros serviços sem licença adequada.

## 14. Escopo fechado — PROTÓTIPO 0.1

**Nome de trabalho:** "Primeira volta no Grajaú".

### 14.1 Objetivo único

Abrir o navegador em um PC, carregar um recorte geográfico real da região do Terminal Grajaú e **dirigir livremente um carro 3D por ruas navegáveis**, com câmera funcional e controles básicos.

### 14.2 Obrigatório na 0.1

1. Aplicação web executável localmente e preparável para hospedagem estática.
2. Importação reproduzível de **um** recorte do OSM, salvo como dados locais do projeto.
3. Ruas 3D reconhecíveis pela sua geometria e conectividade básica.
4. Piso e cenário procedural simples (não exigir modelos de prédios históricos).
5. Um carro genérico estilizado.
6. Direção com aceleração, freio, ré e esterçamento coerentes.
7. Câmera em terceira pessoa e interação com mouse.
8. Teclado funcional; gamepad testado como controle prioritário.
9. HUD com velocidade e instruções básicas.
10. Reiniciar veículo se ficar preso ou sair da via.
11. Carregamento/erro explícito, sem tela infinita, e crédito aos dados OSM.
12. Testes e instruções de execução em README.

### 14.3 Explicitamente FORA da 0.1

Passageiros; corridas pagas; Uber funcional; missões; dinheiro; personalização de personagem; garagem; habilitações; motos; ônibus; trânsito IA; pedestres; sinistros completos; guincho; seguro; combustível consumível; multas; clima dinâmico; dia/noite; GPS completo; **editor visual de edifícios e fachadas**; multiplayer; mapa inteiro de São Paulo; versão mobile; save em nuvem.

**Nota:** esses recursos continuam no GDD. Estão fora somente da primeira prova técnica.

### 14.4 Critérios de aceite objetivos

- A rua exibida é de fato gerada de dados geográficos da área escolhida, e não uma pista inventada.
- É possível identificar pelo menos **um cruzamento real** comparando a geometria do jogo ao mapa de origem.
- O carro acelera, freia, esterça e engata ré; não "morre" após um comando.
- A câmera acompanha o veículo sem saltos excessivos.
- Colisões/limites ou mecanismo de recuperação impedem a sessão de ficar irremediavelmente travada.
- Os comandos de teclado funcionam em navegador desktop; um gamepad compatível deve ser testado e os problemas documentados.
- Não requer credenciais, login, pagamentos ou serviço privado para iniciar a cena.
- Nenhuma consulta ao Overpass é feita a cada quadro ou a cada movimentação do veículo.
- Erros de assets/mapa geram mensagem compreensível.
- O repositório documenta como iniciar e como conferir que os dados do mapa correspondem ao Grajaú.

### 14.5 Metas de qualidade (aspiracionais; medir em hardware real)

Jogo visualmente fluido em PC intermediário, com meta inicial de **30 FPS estáveis** e busca de 60 FPS após otimizações; carregamento e memória medidos em teste, sem prometer números antes de experimentar. A qualidade de geração do mapa e o prazer de dirigir têm prioridade sobre volume de objetos decorativos.

## 15. Fases de desenvolvimento

| Etapa | Objetivo verificável | Dependência | Situação |
|---|---|---|---|
| F0 — Fundação | Projeto JavaScript ES Modules e Three.js com entrada HTML, sem build obrigatório | Nenhuma | Código implementado; abertura WebGL pendente |
| F1 — Dados reais | Extrair e versionar OSM real do Grajaú | F0 | Concluída (201 vias, 3.347 polígonos de construções) |
| F2 — Rua dirigível | Gerar pistas, cruzamentos simples e solo sem buracos críticos | F1 | Código implementado; validação visual pendente |
| F3 — Primeiro carro | Modelo, aceleração, frenagem, ré, esterçamento e câmera | F2 | Código implementado; teste jogável pendente |
| F4 — Interação | Teclado, mouse, gamepad, HUD, recuperação e erros | F3 | Código implementado; teste com gamepad pendente |
| F5 — Prova pública | Build hospedável, README, teste em desktop e ajustes de desempenho | F4 | README e verificação CI prontos; preview e teste desktop pendentes |
| F6 — 0.2 Aplicativo | Primeiras corridas, origem/destino, passageiro simples e pagamento | F5 | Futura |
| F7 — Carreira | Criador de personagem, economia, combustível, missões/habilitações | F6 | Futura |
| F8 — Mundo vivo | Tráfego, sinalização, eventos e clima gradual | F7 | Futura |
| F9 — Ônibus | Veículos coletivos, linhas/pontos, rodoviários | F8 ou trilha paralela | Futura |
| F10 — Empresas | Frota, contratos, funcionários e gestão financeira | F7/F9 | Futura |
| F11 — Expansão | Belmira Marin + Canal de Cocaia + Pedro Escobar + Rubens de Oliveira como esqueleto; depois quarteirões/setores/cidades | Após estabilidade | Quatro corredores implementados; bairros e validação visual pendentes |
| F12 — Editor de mundo | Selecionar prédios, identificar fachadas/locais, ajustar modelos low poly e salvar alterações persistentes | Após protótipo dirigível e base de edifícios | Futura |

O roadmap é **orientado por marcos**, não por prazo inventado. Concluir uma fase significa entregar algo executável ou observável, não apenas escrever código.

### 15.1 Ordem de implementação na 0.1

**Primeiro:** cena Three.js → ruas reais simplificadas.  
**Segundo:** carro tipo caixa/placeholder dirigível → câmera.  
**Terceiro:** substituir placeholder por carro estilizado, melhorar pistas e cruzamentos.  
**Quarto:** controle e feedback → validação → build.

Se a geração procedural travar o projeto, usar **um recorte estático pré-processado** do Grajaú e continuar: isso ainda comprova a proposta.

## 16. Riscos e decisões de engenharia

| Risco | Impacto | Mitigação |
|---|---|---|
| Malha OSM não produzir pistas corretas em interseções | Alto | Testar 1–3 cruzamentos reais; visualizar grafo; simplificar junções inicialmente |
| Confundir coordenadas geográficas com posições 3D | Alto | Projeção local explícita e testes de ida/volta |
| FPS baixo por edifícios e draw calls | Alto | Instanciamento, LOD, limite de objetos e setores pequenos |
| Escopo excessivo antes de jogar | Muito alto | Trava de escopo da 0.1 e teste jogável ao final de cada fase |
| Dependência de API pública para carregar jogo | Alto | Dados de mapa exportados/preprocessados e cache |
| Física instável ou carro inutilizável | Alto | Modelo cinemático simples e recuperação/reset desde cedo |
| Dados incompletos, sentidos errados, viadutos | Médio/alto | Validação por recorte; tags quando confiáveis; correções de pipeline documentadas |
| Licenciamento e atribuições ignorados | Alto | Créditos OSM e inventário de assets desde o começo |
| Gamepad inconsistente entre navegadores | Médio | Normalização de input, deadzone, testes e fallback teclado |
| Expectativa de fidelidade total à cidade | Médio | Declarar mapa real + cenários low poly, não gêmeo digital |
| Perder edições de fachada ao regenerar a cidade | Alto (futuro) | Separar dados OSM, geração padrão e camada de alterações com IDs estáveis/conciliação |

## 17. Definição de pronto e governança

**Uma tarefa está concluída quando:** há mudança executável/visível, critérios de aceite verificados, ausência de regressão impeditiva e documentação suficiente para reproduzir.

**Uma fase está concluída quando:** é possível mostrar evidência prática de seu resultado.

**Registro recomendado:** manter um CSV ou quadro com ID, fase, descrição, prioridade, status (Planejado / Em construção / Concluído / Bloqueado), evidência e commit. O próprio GDD não deve ser alterado para fingir que itens foram entregues.

**Política de produto:** ideias novas entram em backlog; não interrompem o objetivo 0.1 sem necessidade técnica demonstrada.

## 18. Próxima ação concreta

Criar a base do projeto e entregar **uma cena 3D com ruas reais do entorno do Terminal Grajaú**. Depois inserir um veículo básico que percorra essas ruas. O primeiro vídeo de teste deve demonstrar: abrir no navegador, mostrar o recorte real e dirigir do ponto A ao B.

**A vitória inicial não é ter um sistema de ônibus, Uber e financiamento. É sair andando no Grajaú.**

## 19. Fontes e leitura técnica

- OpenStreetMap — licença e créditos: https://www.openstreetmap.org/copyright/pt-BR
- OSM Foundation — atribuição em jogos: https://osmfoundation.org/wiki/Licence/Attribution_Guidelines
- Overpass — orientações de uso: https://dev.overpass-api.de/overpass-doc/en/preface/commons.html
- Three.js — documentação: https://threejs.org/docs/
- Three.js — integração Rapier: https://threejs.org/docs/pages/RapierPhysics.html
- SPTrans — API Olho Vivo: https://www.sptrans.com.br/desenvolvedores/api-do-olho-vivo-guia-de-referencia/documentacao-api/
- SPTrans — alimentação GTFS (referência de feed): https://www.transit.land/data/feeds/f-6gy-sptrans

## 20. Histórico

- **v1.5 (2026-10-19):** motor interno piloto com três fachadas estilizadas associadas a edifícios OSM reais, sem afirmar aparência real; relevo artificial suave e interface de altitude compartilhada por mapa/carro; testes automatizados e validação visual ainda pendente.
- **v1.4 (2026-10-19):** Belmira Marin completa no OSM (55 trechos conectados) e ramais Canal de Cocaia, Pedro Escobar e Rubens de Oliveira (28 trechos); motor ampliado para percursos longos e construção de bairros postergada até validação no celular. Relevo segue depois da malha viária.
- **v1.3 (2026-10-19):** adicionado HUD mobile com setas e pedais multitoque no código; proposta técnica de relevo real via DEM (ainda não implementada), com dependências de malha, edifícios e dinâmica do carro; testes em dispositivo real pendentes.
- **v1.2 (2026-10-19):** primeira base estática WebGL implementada no repositório; extração real de ruas e construções do Grajaú; testes Node/GitHub Actions aprovados. Execução visual, gamepad, FPS e publicação hospedada continuam **não validados**. Registro de tarefas em ROADMAP.csv. Stack inicial efetiva: ES modules + Three.js via CDN, sem Vite obrigatório.
- **v1.1 (2026-10-19):** visual **low poly sem voxel** confirmado; editor futuro de prédios, identificação de fachadas e personalização de modelos; preservada a prioridade de lançar a 0.1 dirigível.
- **v1.0 (2026-10-19):** consolidação das quatro rodadas de definição com o criador; distinção entre decisões confirmadas, propostas técnicas e dúvidas; escopo fechado do protótipo 0.1 e roadmap completo.

## 21. Expansão de mapa antes do relevo — 19/10/2026

**Nova prioridade confirmada pelo criador:** ampliar **primeiro a Avenida Dona Belmira Marin inteira**, pois ela é a espinha dorsal para desenvolver os arredores. Em sequência, carregar a **Estrada Canal de Cocaia**, a **Rua Pedro Escobar** e a **Rua Rubens de Oliveira**. Somente após a navegação e os cruzamentos nessas vias serem validados será considerado o relevo real.

### 21.1 Implementação da malha

- **Dona Belmira Marin:** arquivo `public/data/belmira-marin.json`, com **55 segmentos originais do OSM** conectados pelos seus pontos. Os segmentos incluem desdobramentos, então a soma de seus comprimentos não equivale necessariamente à extensão linear da avenida.
- **Canal de Cocaia, Pedro Escobar e Rubens de Oliveira:** arquivo `public/data/cocaia-corredores.json` com **28 segmentos nomeados** (16 / 9 / 3 respectivamente).
- **Grajaú original:** permanece em `public/data/grajau.json`; os novos arquivos são mesclados pelos IDs OSM sem gerar segmentos inventados.
- **Mundo 3D:** terreno plano expandido, ruas com malhas reais e corredor explorável perto delas; prédios low poly continuam prioritariamente na região inicial. Não criar obras futuras como se fossem ruas já existentes.

### 21.2 Definição de pronto da expansão

1. O trajeto principal da Belmira pode ser percorrido na área real mapeada, sem bloqueio da borda do antigo mapa.
2. As vias secundárias entram nos mesmos metros locais e são exibidas no mesmo minimapa.
3. O carro pode sair da Belmira em direções reais disponíveis, observadas as limitações de física e vias de mão única ainda não implementadas.
4. Testar em navegador de PC e iPhone com tempos de carregamento e FPS aceitáveis.
5. Identificar e registrar pontas de vias desconectadas e inconsistências no OSM antes de modificar geometria manualmente.
6. Nenhum relevo é adicionado enquanto não houver ao menos um percurso rodoviário completo testado.

**Status em 19/10:** carregamento, geometria e área dirigível implementados; testes automáticos aprovados; percurso visual completo e desempenho móvel da expansão ainda dependem de teste manual.

### 21.3 Visão futura de bairros

Desenvolver as ruas secundárias, áreas comerciais, casas, calçadas e fachadas por setores ligados aos corredores. Depois, incorporar o editor low poly para personalizar modelos, preservando IDs e camadas de edições. O relevo por DEM deve deformar *em conjunto* terreno, rodovias e bases de edifícios, com tratamento distinto para pontes e túneis.

