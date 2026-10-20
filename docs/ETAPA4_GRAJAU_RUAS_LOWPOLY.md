# Etapa 4.1 — Grajaú ampliado: ruas e calçadas 1:1 low poly

## Visão

O Buzun constrói, nesta fase, **somente ruas, calçadas, meio-fios, terreno, marcações, o carro e o HUD**. Fachadas, prédios, mobiliário e lojas fictícias estão temporariamente ocultos; nada foi apagado da base original. A direção artística de referência é urbana, colorida e simplificada, com proporção antes de detalhe. As imagens de outros jogos não foram copiadas nem extraídas como texturas.

## Geografia e API

- Bounding box (sul, oeste, norte, leste): `-23.772,-46.719,-23.713,-46.637`. Inclui Grajaú, Parque Planalto, Parque Grajaú, Cocaia e áreas próximas ao Cantinho do Céu.
- Fonte: Overpass API / OpenStreetMap, somente vias motorizadas e de serviços selecionadas.
- O retorno do Overpass preserva IDs de vias, IDs de nós, `oneway`, largura `width` quando presente, categoria e geometria.
- Origem local: `-23.7368,-46.697`, eixos X=leste, Z=sul, escala nominal **1 unidade = 1 metro**, sem redimensionar a cena.
- Coordenadas WGS84 são projetadas localmente; valores e larguras representam a precisão do OSM e **não são um levantamento cadastral/topográfico**.
- O primeiro acesso consulta Overpass, salva o recorte em IndexedDB por até 72 horas e usa os extratos reais OSM já versionados se houver falha/timeout, com intervalo de espera para evitar insistência na API. O fallback local cobre **uma região menor**, e o status do mapa informa isso.
- Não enviar consultas Overpass a cada frame, em massa ou a cada recarga.

## Malha dirigível

- `src/grajau-osm.js`: leitura de dados OSM e grafo viário topológico por nós reais; sentidos únicos orientam arestas.
- `src/city-road-mesh.js`: polilinhas com juntas miter limitadas, asfaltos contínuos subdivididos por distância física, calçadas e meios-fios separados, pintura minimalista. Interseções são consideradas apenas quando duas vias compartilham nós OSM (não fundir viadutos).
- `src/city-world.js`: índice espacial da via mais próxima, terreno e tiles visuais de 440 m; somente tiles próximos ao carro são mostrados. Sem colisão com prédios.
- **A representação visual não é um roteador de GPS:** o grafo acompanha restrições básicas de sentido, mas o carro permanece com direção manual livre; sinalização sem detalhes reais de cada pista. Para direção por IA, respeitar `oneway` e restrições de conversão específicas das relações OSM.

## Elevação

- Modo principal, quando disponível: **Mapzen Terrain Tiles (Terrarium PNG)**, dataset global publicamente distribuído pela AWS Open Data, interpolado em metros. Fonte: https://registry.opendata.aws/terrain-tiles/ e https://github.com/tilezen/joerd/blob/master/docs/attribution.md.
- Altimetria alternativa: arquivo SRTM da Belmira, medição amostrada a cada 70 metros; fora da área coberta, o fallback é plano.
- A mesma função `sampleHeight` posiciona carro, ruas, calçadas e terreno. Altitude aproximada — **não** uma reprodução de lombadas, degraus ou greide de engenharia.

## Verificar visualmente

1. `npm run verify` deve passar. Testes Node não renderizam WebGL.
2. No GitHub Pages, verificar se aparece a versão atualizada, se o status do mapa indica Overpass ou recortes de reserva e se o terreno amplo foi baixado (ou aparece aviso de fallback no console).
3. Dirigir pela Belmira e pelas vias laterais. Examinar curvas, ruas em T e cruzamentos para detectar faixa desconexa, subida abrupta, calçada sobre o asfalto e interrupções.
4. Testar se carro e câmera não afundam no relevo, inclusive em diferentes escalas de zoom do minimapa.
5. Medir FPS e tempo de carregamento em desktop e celular. O recorte total é grande; os mosaicos de desenho mantêm um raio aproximado de 850 m ao redor do jogador, mas o download inicial ainda pode ser pesado.
6. Não reativar os edifícios até a base viária estar validada visualmente.

## Próxima iteração

Se for identificado problema visual, anotar endereço/coordenadas e captura. Ajustar malha e interseções sem mudar a geometria de origem; as larguras estimadas poderão ser substituídas por `width` do OSM ou medições verificadas. Depois acrescentar áreas de água/vegetação e os edifícios low poly inspirados nas referências.
