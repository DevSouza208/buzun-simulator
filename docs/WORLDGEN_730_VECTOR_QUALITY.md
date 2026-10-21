# WorldGen 7.3 — Vetores OSM com qualidade selecionável

## Padrão escolhido

**Ultra é o nível padrão**, mesmo que o navegador nunca tenha aberto
o simulador. Não ocorre seleção automática de uma qualidade inferior
em computadores lentos: o usuário escolhe Equilibrado ou Econômico
nas configurações, e a preferência é salva no `localStorage`.

O protótipo plano inicia com vetores reais por padrão. Para
comparações técnicas, `?roads=raster` restaura a pintura da 7.1.1
e `?roads=geometry` restaura os polígonos antigos. Nenhuma mudança
na `main` de produção.

## Uma cidade vetorial, não três cópias gigantes

O snapshot do OpenStreetMap (4.777 ways) é a **fonte canônica global**.
O índice espacial não decide geometria: ele consulta apenas quais
primitivas da cidade atravessam um tile de 420 m.

Cada perfil usa o MESMO eixo, largura e componentes conectados OSM.
Só muda a tesselação das juntas e curvas arredondadas:

| Configuração | Distância alvo por arco | Mínimo | Máximo |
| --- | ---: | ---: | ---: |
| Ultra (padrão) | 1,25 m | 18 | 48 |
| Equilibrado | 2,25 m | 12 | 28 |
| Econômico | 4,5 m | 8 | 14 |

Os três perfis não exigem armazenar três malhas 3D completas. Ao
escolher um nível, a malha de cada tile carregado é substituída,
no máximo dois tiles por frame, e os buffers anteriores são liberados.
Chunks novos já nascem no novo nível. A posição do carro e o
grafo original não são modificados ao selecionar outra qualidade.

## Interface

Novo botão `▥` na barra superior abre **Qualidade das ruas**,
independente do ícone ⚙ do editor de ruas. Três opções:
Ultra, Equilibrado e Econômico. Mudança ao clicar, durante o jogo;
Escape e botão de voltar fecham a janela. O diálogo interrompe a
direção para não acelerar o carro enquanto o motorista escolhe.

Ao reabrir a página, a escolha persiste no navegador. A URL
`?detail=ultra|balanced|economy` pode forçar uma qualidade para
comparações, sem alterar a referência OSM.

## Métricas e limites

O painel `debug=worldgen` mostra perfil vetorial selecionado,
triângulos carregados e tiles aguardando reconstrução. Isso
permite medir se Ultra realmente mantém desempenho aceitável
no navegador do usuário. **Não é possível garantir 60 FPS com
Ultra em todos os computadores apenas por testes automáticos.**

A 7.3 conserva o mundo plano e não resolve as interseções que
ainda apresentam braços sobrepostos ou ilhas reais. O próximo
trabalho de união topológica continua separado.

## Preparação para o relevo

Na engine Three.js, X/Z são as coordenadas horizontais e Y será
a altitude. A analogia de "um SVG do mapa inteiro" se refere a
fonte vetorial autoritativa única, não à renderização literal por
SVG 2D.

Quando aplicarmos DEM, cada vértice de centerline receberá Y
global, e todas as representações LOD deverão derivar das mesmas
alturas canônicas de nó/interseção. Ao alternar qualidade,
não pode mudar a altitude nem a posição das estradas.
O terreno compartilhará as mesmas bordas e cotas, sem precisar
reconstruir a topologia a partir de cada chunk.

**Status:** branch experimental. Validar FPS e resultado visual
dos três perfis antes de promover ao padrão de produção.
