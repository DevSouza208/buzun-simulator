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

## 🗺️ Mapa e implementação

O arquivo `public/data/grajau.json` contém **201 vias reais**, **3.347 contornos de construções** e **31 pontos identificados**, extraídos do OpenStreetMap em **19/10/2026**. Nem todos são desenhados; parte da geometria é filtrada na renderização.

As ruas usam coordenadas geográficas reais convertidas para metros locais. Prédios, fachadas e vegetação são gerados automaticamente em **low poly, sem voxel**. Alturas, larguras, calçadas e cruzamentos são aproximados, não um gêmeo digital fidedigno. O cenário e os veículos são simplificados para testes iniciais de performance.

Componentes já implementados no código: carro com aceleração/freio/ré/direção, câmera externa e próxima experimental, minimapa, HUD, gamepad, detecção de obstáculo simples e recuperação de posição.

### Estrutura

- `index.html`: interface e tela inicial.
- `src/main.js`: loop de direção, controles, câmera, velocímetro e minimapa.
- `src/world.js`: geração da malha de ruas e edifícios, colisões.
- `src/geo.js`: funções matemáticas e geográficas puras.
- `src/styles.css`: interface.
- `public/data/grajau.json`: extrato vetorial OSM.
- `tests/geo.test.js`: testes da base de mapas e integridade.
- `GDD.md`: visão completa, escopo 0.1 e roadmap.

### Testes

Use **Node.js 22+** e execute `npm run verify` para verificar sintaxe e testes unitários; há também uma checagem configurada no GitHub Actions. Esses testes **não substituem testar a cena WebGL em um navegador**.

## ⏭️ Próximos passos

1. Validar execução, posicionamento no asfalto, sensibilidade de direção e FPS em um PC real.
2. Corrigir cruzamentos e detalhes de colisão.
3. Implementar missões iniciais de transporte por aplicativo.
4. Desenvolver carreira, mais veículos e **um editor futuro de fachadas**, usando IDs das construções preservados do mapa.

**Não incluído na 0.1:** passageiros, corridas pagas, motos, ônibus, trânsito por IA, economia e editor visual.

## 📜 Dados e atribuição

**© OpenStreetMap contributors — ODbL 1.0**. Créditos dentro do jogo e [detalhes da licença](https://www.openstreetmap.org/copyright). As informações podem estar incompletas ou imprecisas e não servem para navegação real. O código do Buzun não possui licença de redistribuição publicada até decisão do titular; a licença ODbL dos dados é independente.

**Repositório:** https://github.com/DevSouza208/buzun-simulator
