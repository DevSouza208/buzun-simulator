# Buzun World Engine — recorte McDonald's → Habib's

**Documentação executável da primeira conversão de uma avenida real em 3D low poly.**
**Status:** pipeline geográfico e cena implementados; renderização, posicionamento dos modelos e FPS precisam de revisão visual em celular/PC.
**Data da primeira construção:** 19/10/2026.
**Escopo:** Avenida Dona Belmira Marin, do McDonald's nº 1277 até o Habib's nº 111, São Paulo.

> Objetivo futuro: um botão **Create** que executará estas mesmas etapas sobre uma seleção geográfica, acompanhará o progresso e abrirá um editor visual para correções. O botão ainda NÃO existe.

## 1. Fontes reais usadas

| Fonte | Informação | Como foi usada |
|---|---|---|
| McDonald's oficial | Avenida Dona Belmira Marin, nº 1277 | Âncora de início (geocodificada no OSM) |
| Habib's oficial | Avenida Dona Belmira Marin, nº 111 | Âncora de chegada (geocodificada no OSM) |
| OpenStreetMap / Nominatim | Geometria viária, construções, cruzamentos, endereços | Traçado, fachadas procedurais, lados e entradas das ruas |
| OSM building way ID **619054945** | Prédio marcado no OSM como **Habib's**, com dado de altura | Objeto de referência para o Habib's estilizado |
| OpenTopoData / SRTM30m | Elevações medidas por modelo digital, resolução aproximada de 30m | Inclinação do asfalto e do terreno |
| Three.js local ao jogo | Malhas 3D, materiais e letreiros procedurais | Cena visual |

**Proveniência do endereço:**
- McDonald's: https://www.mcdonalds.com.br/restaurantes/sao-paulo/belmira-marin-bel-bel
- Habib's: https://www.habibs.com.br/blog-do-genio/37-o-mes-das-criancas-ta-on-no-habibs
- Dados OSM: https://www.openstreetmap.org/copyright
- Dataset SRTM30m: https://www.opentopodata.org/datasets/srtm/

**Ponto importante:** localizamos o endereço do McDonald's na avenida, mas **ainda não identificamos com certeza qual contorno de prédio OSM representa sua fachada**. O modelo/letreiro próximo ao local é um **marco artístico aproximado**, e não uma reconstrução fiel da loja. A fachada do Habib's também é uma interpretação low poly, apesar de o edifício estar mapeado.

Nenhuma imagem do Google Street View foi extraída, armazenada, copiada ou transformada em textura; nenhuma API de IA generativa ou R2 foi acionada para este trecho. Nomes, placas e formas são elementos renderizados pelo motor, sujeitos a revisão de uso de marcas.

## 2. Etapas realmente executadas

### Etapa A — definir recorte e rota

1. Endereços comerciais verificados em páginas das empresas.
2. Correspondência geográfica na avenida por OSM Nominatim (McDonald's próximo a **-23.7414161, -46.6916534**; Habib's próximo a **-23.7327927, -46.6969538**).
3. Converter latitude/longitude em metros locais usando origem **(-23.7368, -46.697)**.
4. Construir grafo dos 55 trechos originais da Av. Dona Belmira Marin.
5. Percorrer o grafo até ligar as duas âncoras; soma do caminho real cerca de **1,16 km**.

Arquivos: \`src/corridor.js\`, \`public/data/belmira-marin.json\`, \`public/data/belmira-selection.json\` (seleção original) e \`config/belmira-corridor.json\`.

### Etapa B — cortar ruas secundárias e imóveis

1. Consultar **uma área geográfica pequena** do endpoint OSM, durante a **construção dos dados**; NÃO no navegador a cada início da partida.
2. Projetar as vias da resposta para coordenadas locais.
3. Guardar as vias que cruzam ou se aproximam do corredor principal, preservando os pontos reais.
4. Cortar as entradas laterais após aproximadamente **58 m** do eixo da rota; não prolongá-las artificialmente.
5. Filtrar construções a aproximadamente **90 m** da rota, preservando **ID e contorno OSM**.
6. Guardar nomes/categorias mapeadas pelo próprio OSM, quando disponíveis.

Primeiro extrato salvo: **44 fragmentos viários** e **619 construções**, além de pontos de interesse na vizinhança. Os números podem variar numa nova extração, pois o OSM é editável.

Arquivo final: \`public/data/belmira-corridor.json\`. Comando reprodutível:
\`\`\`bash
npm run world:route
npm run world:blocks
\`\`\`

\`world:route\` seleciona e atualiza a linha principal e ruas laterais a partir dos vetores já salvos no repositório; \`world:blocks\` busca a pequena área no OSM e recria o arquivo de quarteirões. **Não executar isso toda vez que um jogador abre o jogo.** Obedecer a políticas e limites dos serviços. Para escala, preferir extratos OSM regionais hospedados/processados sob nossa responsabilidade.

### Etapa C — obter o relevo

1. Consultamos **320 amostras** de elevação através do endpoint OpenTopoData SRTM30m.
2. A grade usa células espaçadas em **70 m**, com amostragem armazenada uma única vez.
3. \`src/terrain.js\` carrega os dados e interpola as alturas entre amostras.
4. A mesma função \`sampleHeight(x,z)\` alimenta **pistas, solo, prédios, vegetação, carro e câmera**.
5. Fazemos transição para terreno plano na borda da área coberta, sem inventar elevação nos corredores distantes.

Arquivo de terreno: \`public/data/belmira-elevation.json\`. Referência inicial aproximada: **817 m** no McDonald's e **765 m** no Habib's; diferença próxima de **52 m**. Modelos de elevação não são levantamentos topográficos precisos: existem erros de resolução, edificações, cortes/aterros, viadutos e bordas. A interpolação pode precisar de correção local em cruzamentos.

### Etapa D — desenhar cidade, esquinas e lojas

- \`src/world.js\`: cria terreno, asfalto, calçadas, faixas, cruzamentos e volumes low poly; o preenchimento de cruzamentos é aplicado apenas onde vias reais compartilham o mesmo nó.
- \`src/world-engine.js\` + \`src/facade-recipe.js\`: primeiros modelos de fachada parametrizados.
- \`src/corridor-landmarks.js\`: placas, vitrines e elementos modulares com paletas e letreiros para McDonald's e Habib's; **não são cópias das fotos reais**.
- \`src/main.js\`: carrega os dados estáticos, ajusta altitude do carro, inicializa rota e permite trocar o ponto de início.
- \`index.html\`: apresentação do corredor e opções de ponto inicial.
- \`src/spawn.js\`: encontra pontos dirigíveis em ruas reais.

A cena evita desenhar 3.000+ construções de todo o bairro ao mesmo tempo: usa somente o recorte preparado, para reduzir custo no iPhone. Os elementos genéricos mantêm geometria simples.

### Etapa E — testes e entrega

- \`tests/belmira-corridor-game.test.js\`: origem/destino, construção identificada, geometria, ruas laterais e variação da altitude.
- \`tests/corridor-selection.test.js\`: seleção reprodutível da malha viária.
- \`npm run verify\`: sintaxe e testes do projeto no Node.
- GitHub Actions: validação automática; a Vercel publica a partir da \`main\` se a integração estiver ativa.

**Pendente:** revisão visual do corredor no navegador móvel, continuidade geométrica das esquinas, posicionamento da fachada provisória do McDonald's, visibilidade dos letreiros e FPS. Testes automatizados não confirmam fidelidade visual ou navegabilidade perfeita.

## 3. Mapa mental para o futuro botão Create

Seleção de região no mapa → confirmação de recorte e fontes → job no servidor/worker → buscar/validar OSM → criar grafo/ruas → buscar/citar DEM → filtrar construções → identificar estabelecimentos por dados abertos → criar presets low poly → preparar materiais locais/R2 → persistir cada setor e um relatório → revisar manualmente casos incertos → publicar versão.

**Arquitetura futura proposta:**

- **Frontend/editor:** seleção por polígono ou bounding box, zoom, prévia, botão Create.
- **API/job runner:** agenda etapas assíncronas; não colocar tokens de imagem privados no navegador.
- **Dados:** original OSM imutável + malha gerada + camada de substituições manuais por IDs.
- **Materiais:** biblioteca de portões, muros, calçadas, portas e janelas em atlas neutros; texturas compartilhadas hospedadas no R2 depois de geradas/curadas.
- **Referências visuais licenciadas:** Mapillary, Panoramax ou fotos próprias apenas quando houver cobertura, permissões e condições de atribuição/derivados adequadas. Ausência de foto **não** bloqueia a geração genérica.
- **IA:** converter observações visuais permitidas em **metadados de fachada** e criar variações estilizadas, sem copiar texturas fotográficas protegidas.
- **Human-in-the-loop:** identificar falsos positivos, corrigir endereços/modelos, persistir alterações.
- **Fila/status:** \`queued → osm → dem → buildings → materials → preview → review → published\`.
- **Custos e segurança:** fila limitada por região, rate limits, cache geográfico, IDs de versão, retries, créditos e licenças por asset, orçamento máximo por execução.

**Não implementados ainda:** botão Create, APIs de fotos, classificação de fachadas por IA, pipeline R2, edição visual persistente. O que já existe é a **prova da cadeia geográfica e visual** para convertê-la futuramente em uma ferramenta de um clique.

## 4. Próximos testes sugeridos

1. Abrir versão atualizada no iPhone e confirmar que aparece um McDonald's estilizado logo no início.
2. Dirigir em direção ao Habib's e verificar a sensação de descida.
3. Testar cruzamentos e as ruas laterais curtas (sem falsa continuação).
4. Conferir altura da calçada, prédio flutuante, terreno por baixo das ruas e velocidade do iPhone.
5. Ajustar o posicionamento exato do modelo do McDonald's, ainda provisório.
6. Registrar observações no \`ROADMAP.csv\` antes de integrar fotos e IA.

**Regra de produto:** primeiro fechar **um corredor reconhecível e jogável**; só depois automatizar a expansão de bairros inteiros.
