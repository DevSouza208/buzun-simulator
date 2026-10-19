# BUZUN SIMULATOR — Game Design Document (GDD)

**Versão:** 1.0 — visão consolidada / pré-produção  
**Data:** 19 de outubro de 2026  
**Projeto:** Buzun Simulator  
**Repositório:** https://github.com/DevSouza208/buzun-simulator  
**Plataforma prioritária:** navegador em computadores  
**Estado:** documento de planejamento; jogo ainda não implementado

> **Diretriz máxima:** antes de construir um simulador enorme, provar que ele existe: um carro dirigível em ruas reais do Grajaú, dentro do navegador.

## 1. Resumo executivo

Buzun Simulator é um jogo de mundo aberto de transporte e progressão profissional ambientado inicialmente em São Paulo. O jogador dirige por uma **malha viária baseada em dados geográficos reais**, representada em um **3D estilizado, legível e leve**. Começa escolhendo uma origem de carreira e, ao longo da evolução, pode trabalhar com transporte individual, serviços sobre duas rodas, vans, ônibus urbanos e rodoviários e, futuramente, administrar empresas.

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
| Visual | 3D estilizado, leve |
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
| Prioridade atual | "Por enquanto quero ver existir" |

### 2.2 Propostas técnicas deste GDD — ainda NÃO aprovadas

Three.js, TypeScript, Vite, processamento prévio de dados OpenStreetMap, física própria simplificada no início, Rapier futuramente, HUD mínimo, persistência local e distribuição estática. São recomendações de implementação, **não decisões do criador**.

### 2.3 Questões abertas — não preencher com suposições

Nome final/identidade visual e mascote; marcas de veículos reais ou fictícias; mapa exato e raio inicial; proporção de tempo do jogo; sistemas de customização do personagem; economia numérica/balanceamento; se haverá energia/fadiga; nível de realismo das leis de trânsito; classificação etária; monetização; suporte offline; expansão para celular; multiplayer; suporte a volante; licenças de assets e uso de marcas.

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

O cenário 3D estiliza edifícios, calçadas, comércio, árvores, postes e mobiliário urbano. Locais icônicos podem receber assets artesanais separados, sem modificar a geografia real.

### 5.2 Área de estreia

**Grajaú, nas proximidades do Terminal Grajaú, São Paulo.** O recorte exato será fixado durante a implementação depois da inspeção dos dados. Não prometer mapa de toda São Paulo na versão inicial.

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

### 5.4 Estratégia de escala

- **0.1:** uma área pequena já exportada como asset estático; nada de streaming global.
- **0.2–0.3:** múltiplos setores contíguos, cache e descarregamento de áreas distantes.
- **Futuro:** ampliação para bairros, outras regiões de São Paulo e outras cidades, sempre acompanhada por testes de desempenho e licenças.

Não usar a API pública de edição do OSM como backend de jogo nem fazer consultas massivas automáticas em instâncias públicas do Overpass. Para escala, usar extratos regionais/processamento próprios ou provedor apropriado.

### 5.5 Reconhecimento da cidade

Terminal Grajaú é uma âncora espacial; outros marcos ficam para fases posteriores. Marcas, nomes e fachadas reais exigem avaliação própria de licenciamento/representação. **Não afirmar fidelidade fotográfica.**

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

## 12. Direção de arte e áudio

**Direção:** formas geométricas simples, materiais econômicos, paleta coesa, veículos reconhecíveis por silhueta. Prédios procedurais com variedades modestas de altura e fachada; pontos conhecidos mais elaborados progressivamente.

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

**core/** loop de atualização, configuração e estado; **input/** teclado e gamepad; **world/** leitura de setores, projeção geográfica, estradas, cenário e colisões; **vehicles/** controle e física; **camera/** seguimento e orbit; **ui/** HUD e menus; **data/** mapa de teste e assets; **tools/** importador e validação OSM; **tests/** regressões.

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

Passageiros; corridas pagas; Uber funcional; missões; dinheiro; personalização de personagem; garagem; habilitações; motos; ônibus; trânsito IA; pedestres; sinistros completos; guincho; seguro; combustível consumível; multas; clima dinâmico; dia/noite; GPS completo; multiplayer; mapa inteiro de São Paulo; versão mobile; save em nuvem.

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
| F0 — Fundação | Projeto Three.js/TS/Vite abre uma cena 3D e tem scripts de execução | Nenhuma | Planejada |
| F1 — Dados reais | Extrair, versionar e validar o recorte do Grajaú | F0 | Planejada |
| F2 — Rua dirigível | Gerar pistas, cruzamentos simples e solo sem buracos críticos | F1 | Planejada |
| F3 — Primeiro carro | Modelo, aceleração, frenagem, ré, esterçamento e câmera | F2 | Planejada |
| F4 — Interação | Teclado, mouse, gamepad, HUD, recuperação e erros | F3 | Planejada |
| F5 — Prova pública | Build hospedável, README, teste em desktop e ajustes de desempenho | F4 | Planejada |
| F6 — 0.2 Aplicativo | Primeiras corridas, origem/destino, passageiro simples e pagamento | F5 | Futura |
| F7 — Carreira | Criador de personagem, economia, combustível, missões/habilitações | F6 | Futura |
| F8 — Mundo vivo | Tráfego, sinalização, eventos e clima gradual | F7 | Futura |
| F9 — Ônibus | Veículos coletivos, linhas/pontos, rodoviários | F8 ou trilha paralela | Futura |
| F10 — Empresas | Frota, contratos, funcionários e gestão financeira | F7/F9 | Futura |
| F11 — Expansão | Setores, bairros/cidades, passeio sofisticado e corridas | Após estabilidade | Futura |

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
| Expectativa de fidelidade total à cidade | Médio | Declarar mapa real + cenários estilizados, não gêmeo digital |

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

- **v1.0 (2026-10-19):** consolidação das quatro rodadas de definição com o criador; distinção entre decisões confirmadas, propostas técnicas e dúvidas; escopo fechado do protótipo 0.1 e roadmap completo.
