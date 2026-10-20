# Etapa 5.12 — orçamento real de geometria no streaming

## Ponto de partida

A versão v0.1.63 corrigiu um bug de LOD nos setores carregados enquanto o jogo estava parado. No navegador remoto, registramos, em 11 regiões carregadas: **242 draw calls**, **344.212 triângulos/frame** e **2,6 FPS** (contra 571 draw calls/741.927 triângulos e 1,8 FPS na v0.1.62). FPS da automação remota não representa o PC do jogador e a navegação efetiva não foi exercitada.

Na v0.1.63 ainda havia dois desperdícios importantes:
1. Cada setor de streaming de 880 m × 880 m era repartido novamente em até quatro grupos de render de 440 m, cada um com meshes separados por material. O volume de draw calls continuava alto.
2. Até mesmo linhas OSM retas eram divididas em seções de 5 m; detalhes minúsculos do piso tátil recebiam 14 quadradinhos por rampa, criando milhares de triângulos numa região pequena.

## Como a versão 5.12 atua

### Perfil independente do modo tradicional

`src/worldgen-render-profile.js` define dois perfis **explícitos, testados e reprodutíveis**:

| Parâmetro | Tradicional | Streaming otimizado |
|---|---:|---:|
| Amostragem interpolada de altitude/contorno | 5 m | 9 m |
| Quadradinhos táteis por lado de rampa | 7 × 2 = 14 | 3 × 1 = 3 |
| Lote de geometria por material | 440 m × 440 m | 880 m × 880 m |
| Topologia OSM e nós reais | Preservados | Preservados |
| Largura e posição horizontal das vias | Preservadas | Preservadas |
| Altura autoritativa de física | mesma seção de asfalto | mesma seção de asfalto |
| Terrain Mapzen / minimapa | Inalterados | Inalterados |

A variante normal de `createRoadScene(scene,roads,sampleHeight)` continua exatamente com seu perfil antigo. O novo perfil entra automaticamente apenas quando o compositor recebe `renderBounds` de uma região regional.

### Um mesh por região e material

O `chunkFor` passa a concentrar as subgeometrias no mesmo buffer sempre que `renderBounds` está ativo. A união de asfalto, os recortes de calçada, faixas, guias, zebras e rampas **acontecem ANTES do clipping**, usando a margem de seleção das vias. O recorte final ainda segue os 880 m exatos da região, com altura dos vértices interpolada no limite. Portanto o novo batching não introduz asfalto duplicado nem remove junções OSM.

Para preservar a visibilidade ao passar pelas bordas, o LOD passa a medir a distância do jogador **ao limite do retângulo 880 m inteiro**, não ao subtile de 440 m que o novo grupo substituiu.

Com até nove categorias, cada região normalmente exige no máximo um draw por categoria que possui geometria, em vez de até quatro vezes esse número. O benefício efetivo depende do material, da câmera e do terreno.

### Posição e greide

A amostragem de 9 m **só remove pontos intermediários interpolados**, não altera a lista de pontos original do OSM. Uma polilinha com trecho de 80 m pode ser dividida em nove intervalos em vez de 16, mantendo as mesmas extremidades. A seção de asfalto 3D e o índice de superfície que calcula a altura do veículo são construídos a partir dos mesmos pontos. O perfil clássico permanece com 5 m para comparar eventuais artefatos visuais.

### Piso tátil de densidade adaptada

O gerador aceita `tactileOptions` e, no modo streaming, cria três quadradinhos por lado de rampa, sempre dentro da área de calçada aceita por recorte, acompanhando a altura da rampa. Não são overlays flutuantes. No modo tradicional, continuam sendo 14 por lado.

## Testes (CI)

`tests/worldgen-render-profile.test.js` verifica: equivalência exata do perfil clássico, preset streaming, agrupamento de posições nos quatro quadrantes da mesma região, LOD correto na borda, preservação de todos os nós originais OSM, relevo finito em ladeiras e redução real dos quadradinhos sem invadir a pista.

**Benchmark em 350 vias reais de Grajaú:** 18.013 amostras no render clássico e **10.889** no streaming, ou **39,5% de redução de seções geradas**. A redução de seções geralmente diminui número de segmentos a recortar no asfalto e calçadas, mas **não** é garantia de redução de 39,5% dos triângulos finais. São processos distintos.

**188 testes automatizados aprovados, nenhuma falha.** Testes unitários não cobrem a cena WebGL real; comparar painel do navegador após publicação.

## Validação visual e de desempenho

Abrir [streaming experimental](https://devsouza208.github.io/buzun-simulator/?worldgen=stream), aguardar o carregamento de regiões vizinhas e acompanhar FPS/draw calls/triângulos e memória. Para o modo tradicional, abrir a URL sem parâmetros.

No Buzun Create verificar a área do corredor Av. Dona Belmira Marin — entradas laterais, guias, rampas e esquinas em ladeira. Procurar diferença de altura perto das fronteiras de 880 m e nas inclinações muito bruscas. Não marcar uma etapa como perfeita apenas pelo número de FPS.

## Limitações e próxima etapa

- O streaming ainda compila uma região inteira de maneira síncrona quando ela entra no raio de interesse; um frame pode travar enquanto a compilação ocorre. `requestIdleCallback` só decide **quando** começar, não torna o algoritmo em si assíncrono.
- Agrupar todas as geometrias de um mesmo material numa região de 880 m reduz draw calls mas pode renderizar triângulos que estão mais longe dentro da própria região; é compromisso visual/CPU-GPU.
- Não existe simplificação topológica real de curvas, pontes e calçadas; só espaçamento de amostras intermediárias, sem redistribuir as coordenadas.
- Se novas medições ainda mostrarem travadas, otimizar o gerador por etapas fracionadas ou Worker real (com serialização/deserialização da geometria), e medir GPU/CPU separadamente, antes de ativar o streaming como padrão.
