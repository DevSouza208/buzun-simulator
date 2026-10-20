# Etapa 5.10 — auditoria WorldGen, orçamento de geometria e LOD visual

## Objetivo
A cidade de Grajaú já tem asfalto unido (5.1), vias por faixa (5.2), guias e calçadas (5.3–5.6), travessias (5.7), rampas (5.8) e materiais/piso tátil (5.9). O detalhe pequeno não deve ser renderizado na mesma distância da pista, e agora precisamos **medir** custo de construção e de desenho, não assumir que o jogo está rápido.

## Medições no próprio navegador
`src/worldgen-diagnostics.js` e `src/city-world.js` registram:
- `stats.worldTiming.roadsMs`: tempo síncrono para criar a cena viária.
- `stats.worldTiming.terrainMs`: criação inicial dos tiles de terreno.
- `stats.worldTiming.totalMs`: tempo de montagem inicial da cidade incluindo índices/grafo e atualização inicial (não inclui download HTTP de OSM ou DEM).
- `stats.buildProfile.stagesMs`: tempo individual de **corredores espaciais**, **cruzamentos/planejamento**, **amostragem OSM e marcas**, **união de asfalto**, **verificação das travessias**, **união calçadas/guias/rampas** e **costura/alocação de meshes**.
- `stats.geometryStatistics`: quantos setores, triângulos, vértices e MiB estimados de buffers (posições, normais e UVs). Inclui ranking `heavySectors` dos 10 tiles mais pesados.
- `stats.lodStatistics`: triângulos viários potencialmente renderizados versus omitidos, setores e objetos visíveis, número de recálculos do LOD.

**Nota:** memória é estimativa dos buffers WebGL de geometria, não RAM total, VRAM real, texturas DEM, textura de asfalto ou uso de memória do navegador. No desenho em tempo real, draw calls e triangles de `renderer.info.render` podem incluir carro, luz, terreno e outros meshes.

## Redução de trabalho de desenho
A Etapa 5.10 introduz **LOD por material da malha viária**, com a distância medida até a **borda mais próxima** do setor espacial (440 m), não até seu centro. Existe uma margem de 25 m contra desaparecimento precoce de geometria perto do limite do setor, e histerese de 18 m para evitar tremulação ao dirigir no limite.

| Material viário | Distância aproximada de detalhe |
|---|---:|
| Asfalto | Até o raio geral do mundo (850 m) |
| Calçada | Até 850 m |
| Canteiros | 630 m |
| Guias/meio-fio | 390 m |
| Marcações brancas / amarelas | 520 m |
| Piso tátil ilustrativo | 135 m |
| Outros detalhes secundários | 630 m |

A distância considera o **ponto mais próximo do setor inteiro**, então, em tiles grandes, o material também pode permanecer visível mais longe do que a cifra acima. Isso é uma escolha conservadora para evitar sumiços dentro do setor. O raio do mundo pode ser configurado sem quebrar essa hierarquia.

O atualizador verifica a posição apenas após deslocamento de **10 metros**, em vez de reaplicar centenas de decisões de visibilidade a cada frame. O asfalto, física do carro, plano de altitude, área navegável, relevo e minimapa **não são simplificados nem alterados**: só objetos de render distantes deixam de ser desenhados.

## Painel de auditoria visual

Abra o jogo com o parâmetro:

[https://devsouza208.github.io/buzun-simulator/?worldgen=debug](https://devsouza208.github.io/buzun-simulator/?worldgen=debug)

O painel opt-in (canto inferior direito, sem interceptar mouse ou toque) mostra:
- FPS medido a cada ~1 segundo;
- chamadas de desenho (`renderer.info.render.calls`) e triângulos do último frame;
- setores visíveis, triângulos do mundo viário admitidos pelo LOD versus total de triângulos alocados;
- MiB estimados de buffer de geometria, tempos de worldgen e setor mais pesado.

Também funciona na câmera aérea do Buzun Create. No console:

```js
window.buzunWorldgenReport()
```

retorna um objeto com perfil, geometria, status do LOD e FPS. O perfil não envia telemetria para servidor externo e só é ligado quando o parâmetro de depuração está na URL.

## Auditoria automatizada
`tests/worldgen-lod.test.js` cobre distâncias de borda, limites de material, histerese, orçamento de geometria, ordenação dos setores, repetibilidade, profiler e ausência de HUD quando desligado.

No snapshot de 4.777 vias do Grajaú, o teste reconstrói setores amostrados a partir de 43.035 vértices OSM:
- 275 setores potenciais;
- em posição de referência (0,0), **24 setores visíveis e 251 ocultados**;
- a amostra sintética de geometria aceita **216 triângulos** e pula **3.634** sob os limites LOD.

**Esses triângulos são números de geometria FICTÍCIA do teste unitário** (pequena malha de teste por setor), não contagens da renderização real do Grajaú. Use o painel no jogo para ler as quantidades reais.

## Roteiro para comparação visual
1. Abrir **v0.1.60** em modo normal e no modo `?worldgen=debug`.
2. Entrar no trecho McDonald's → Habib's da Av. Dona Belmira Marin; observar se a calçada/asfalto permanecem e se guias e piso tátil somem suavemente longe da câmera.
3. Alternar Buzun Create → jogar e verificar se a atualização do foco ativa os materiais corretos sem bugs.
4. Coletar `window.buzunWorldgenReport()` nos mesmos pontos usando câmera a altura/zoom semelhantes, e comparar FPS/triângulos/desenhos.
5. Conferir os setores mais caros em `geometry.heavySectors`; usar screenshots para relacionar falhas visuais com tiles e escolher áreas para otimização.

## Limitações conhecidas
- LOD **não reduz a geometria gerada e alocada**; todo o Grajaú continua sendo compilado antes de dirigir. Para otimização do tempo de entrada e memória seria preciso worldgen progressivo por região e descarte/cache por setores.
- Setor de 440 m é um proxy grosseiro de distância de detalhes. A etapa seguinte pode separar piso tátil e marcas em subtiles menores ou simplificar geometrias a distância.
- FPS depende do navegador, GPU, zoom e efeitos. O teste CI sem WebGL **não comprova melhoria real de FPS**; a cena precisa ser inspecionada no navegador com o overlay.
- Sem leitura externa de anúncios, logs de hardware, street view ou execução em paralelo no servidor.

## Próxima etapa
**WorldGen 5.11: auditoria visual dirigida e streaming por regiões**. Primeiro coletar os dados reais do HUD/prints das vias críticas, depois atacar o maior custo do perfil (geração de calçadas, triangulação, memória de buffers ou terreno) com cache e carregamento por setores, preservando fonte OSM 1:1.
