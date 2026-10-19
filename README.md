# 🚌 Buzun Simulator — Protótipo 0.1

**Primeira volta no Grajaú.** Jogo experimental de direção low poly no navegador com geometria real do OpenStreetMap na região do Terminal Grajaú (São Paulo).

> **Situação:** base de código inicial entregue. A execução WebGL e o desempenho em uma GPU real ainda precisam ser validados; este não é um jogo de carreira finalizado.

## ▶️ Como testar

1. Clone ou baixe o repositório.
2. Na pasta do projeto, rode `python3 -m http.server 5173` (ou `npm run start`).
3. Acesse **http://localhost:5173** no Chrome, Edge ou Firefox.
4. Quando o mapa terminar de carregar, clique em **COMEÇAR A DIRIGIR**.

Não precisa instalar dependências npm nem configurar backend. O navegador precisa de internet para carregar o **Three.js 0.180.0** pelo CDN jsDelivr. Não abra o index.html via `file://`: o mapa é carregado com `fetch`.

## 🎮 Controles

| Ação | Teclado | Controle |
|---|---|---|
| Acelerar | W ou ↑ | RT / R2 |
| Frear / ré | S ou ↓ | LT / L2 |
| Direção | A/D ou ←/→ | Analógico esquerdo |
| Girar câmera | Arrastar mouse | Analógico direito |
| Alternar câmera | C | Teclado por enquanto |
| Voltar ao início | R | Teclado por enquanto |
| Ajuda | ? / Esc | Teclado por enquanto |

**No celular:** aparecem automaticamente duas **setas de direção** à esquerda e dois **pedais** à direita (**FREIO / ACELERAR**). É possível segurar uma seta e um pedal com dedos diferentes. Soltar o dedo interrompe a ação, inclusive em caso de cancelamento do toque. Se não aparecerem, confira se o navegador reconhece o dispositivo como tela sensível ao toque. A interface e a dirigibilidade mobile ainda precisam de validação em aparelhos reais.

## 🛣️ Expansão: Belmira Marin e Cocaia (19/10/2026)

O jogo agora carrega, no mesmo sistema métrico do Grajaú, dois conjuntos de vias adicionais:

- **`public/data/belmira-marin.json`**: eixo da **Avenida Dona Belmira Marin** completo nos dados OSM consultados, com **55 segmentos de vias nomeadas** e ligação verificada entre os fragmentos.
- **`public/data/cocaia-corredores.json`**: **Estrada Canal de Cocaia (16 segmentos)**, **Rua Pedro Escobar (9)** e **Rua Rubens de Oliveira (3)**.

As geometrias são extraídas do **OpenStreetMap**, mantendo os identificadores originais das vias. Trechos iguais aos do mapa anterior são deduplicados ao carregar. O terreno foi ampliado para permitir a navegação além da área inicial e o veículo pode trafegar dentro de um corredor ao redor das ruas reais, sem precisar carregar bairros inteiros de uma vez.

**Limitação importante:** fora da região inicial do Terminal Grajaú, ainda não existem fachadas e prédios detalhados, semáforos ou relevo. A presença de uma estrada no mapa não garante que as interseções, acessos e proibições de circulação estejam perfeitos na simulação atual. Os três eixos adicionais precisam de uma inspeção manual de ponta a ponta.

**Próxima prioridade:** testar as quatro vias em celular e PC, consertar eventuais cruzamentos e completar arredores em etapas. **Somente depois entra o relevo real** — para evitar estradas flutuantes ou rampas desconectadas.

## 🗺️ Mapa e implementação

O arquivo `public/data/grajau.json` contém **201 vias reais**, **3.347 contornos de construções** e **31 pontos identificados**, extraídos do OpenStreetMap em **19/10/2026**. Nem todos são desenhados; parte da geometria é filtrada na renderização.

As ruas usam coordenadas geográficas reais convertidas para metros locais. **Nesta versão o terreno é plano.** Para uma evolução futura de relevo real, podemos importar um DEM (ex.: tiles Terrarium) e aplicar altitudes suavizadas ao terreno, às ruas, aos prédios, às colisões e ao veículo. Não basta elevar só o chão: o automóvel também precisará se orientar nas inclinações. Prédios, fachadas e vegetação são gerados automaticamente em **low poly, sem voxel**. Alturas, larguras, calçadas e cruzamentos são aproximados, não um gêmeo digital fidedigno. O cenário e os veículos são simplificados para testes iniciais de performance.

Componentes já implementados no código: carro com aceleração/freio/ré/direção, câmera externa e próxima experimental, minimapa, HUD, gamepad e botões mobile multitoque, detecção de obstáculo simples e recuperação de posição.

### Estrutura

- `index.html`: interface e tela inicial.
- `src/main.js`: loop de direção, controles, câmera, velocímetro e minimapa.
- `src/world.js`: geração da malha de ruas e edifícios, colisões.
- `src/geo.js`: funções matemáticas e geográficas puras.
- `src/touch-controls.js`: setas e pedais mobile multitoque.
- `src/styles.css`: interface.
- `public/data/grajau.json`: extrato vetorial OSM.
- `tests/geo.test.js`: testes da base de mapas e integridade.
- `GDD.md`: visão completa, escopo 0.1 e roadmap.

### Testes

Use **Node.js 22+** e execute `npm run verify` para verificar sintaxe e testes unitários; há também uma checagem configurada no GitHub Actions. Esses testes **não substituem testar a cena WebGL em um navegador**.

## ⏭️ Próximos passos

1. Validar execução, posicionamento no asfalto, sensibilidade de direção e FPS em PC e celular reais.
2. Corrigir cruzamentos, detalhes de colisão e ajustar o HUD em diferentes tamanhos de tela.
3. Implementar missões iniciais de transporte por aplicativo.
4. Estudar relevo real com DEM após estabilizar a direção e a geometria das ruas.
5. Desenvolver carreira, mais veículos e **um editor futuro de fachadas**, usando IDs das construções preservados do mapa.

**Não incluído na 0.1:** passageiros, corridas pagas, motos, ônibus, trânsito por IA, economia e editor visual.

## 📜 Dados e atribuição

**© OpenStreetMap contributors — ODbL 1.0**. Créditos dentro do jogo e [detalhes da licença](https://www.openstreetmap.org/copyright). As informações podem estar incompletas ou imprecisas e não servem para navegação real. O código do Buzun não possui licença de redistribuição publicada até decisão do titular; a licença ODbL dos dados é independente.

**Repositório:** https://github.com/DevSouza208/buzun-simulator
