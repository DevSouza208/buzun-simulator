# Buzun World Engine — Pipeline reproduzível McDonald's → Habib's

**Estado:** Etapa 1 de 4, dados e recorte. Atualizado em 2026-10-19.  
**Alvo da experiência:** Avenida Dona Belmira Marin, São Paulo — McDonald's, nº 1277 → Habib's, nº 111.

## O que já foi feito (ETAPA 1)

1. Confirmar endereços comerciais: McDonald's oficial, Av. Dona Belmira Marin 1277; Habib's oficial, Av. Dona Belmira Marin 111.
2. Localizar coordenadas correspondentes nos registros de endereço do OpenStreetMap/Nominatim. Essas coordenadas **não são garantia da fachada, entrada ou lote exato**.
3. Converter lat/lon para o sistema local do Buzun, com origem original (lat -23.7368, lon -46.697); X = leste, Z = sul, unidades em metros.
4. Projetar as duas âncoras sobre os segmentos reais da avenida.
5. Construir grafo dos way IDs originais da Belmira; calcular menor caminho ligado por Dijkstra. **Resultado: 1.168,3 m com 60 pontos da linha viária e 9 vias OSM originais.**
6. Percorrer as vias laterais já mapeadas e extrair pequenos segmentos que se aproximam da rota a até **50 m**: **21 fragmentos de acessos laterais** em `public/data/belmira-selection.json`. São recortes **sobre geometrias OSM existentes**, não ruas desenhadas de memória.
7. Manter o extrato enriquecido existente `public/data/belmira-corridor.json` **sem sobrescrever**: contém **44 fragmentos de ruas, 619 polígonos de edifícios, 7 POIs e dois pontos âncora**; todos são candidatos à fase de detalhamento, mas não devem ser interpretados automaticamente como estabelecimentos verificados.
8. Consultar quatro amostras SRTM30m em pontos ao longo do trecho. Aproximação: **817 m próximo ao McDonald's** e **765 m próximo ao Habib's**. A diferença inicial observada é ~52 m e é compatível com a descrição de descida, mas **as altitudes ainda não foram aplicadas ao mundo do jogo**.

**Importante:** o recorte e os dados estão disponíveis no GitHub, mas **ainda não mudam automaticamente o mapa visual/terreno**. Essa ligação será trabalho das etapas 2 e 3.

### Arquivos e comando para reproduzir

- `src/corridor.js`: algoritmo genérico que combina segmentação OSM, rota e ruas transversais cortadas.
- `scripts/build-belmira-corridor.mjs`: transforma os dados existentes no recorte de forma repetível.
- `public/data/belmira-selection.json`: recorte selecionado, âncoras e caminhos.
- `public/data/belmira-corridor.json`: extrato enriquecido com prédios e pontos de interesse (preexistente, **não sobrescrever**).
- `tests/corridor-selection.test.js`: testes de consistência e regressão.

```bash
node scripts/build-belmira-corridor.mjs
npm run verify
```

O script escreve **somente** em `belmira-selection.json`. A estrutura mantém as fontes separadas para a futura interface com botão Create.

## ETAPA 2 — Relevo e passagem do carro (pendente)

- Usar o DEM (SRTM30m, ou base de resolução melhor quando licenciada) em uma grade georreferenciada; interpolar a altitude por vértice sem criar rampas verticais ou degraus.
- Fazer ruas, calçadas, entradas, terreno e carro compartilharem amostragem de alturas.
- Aplicar a altitude no trecho **McDonald's → Habib's**, sem distorcer artificialmente a largura das pistas; tratar alinhamento de cruzamentos e transição para áreas ainda planas.
- Testar direção norte (McDonald's para Habib's) e o sentido inverso, verificando subida/descida.
- Revisar com o usuário no iPhone. Não tratar o SRTM como medição de guias, pontes ou calçadas; esses recursos precisam de solução independente.

## ETAPA 3 — World Engine / fachadas e entradas (pendente)

- Integrar os **619 polígonos OSM disponíveis** e usar todos apenas como volumetria-base do recorte.
- Fazer edificações e calçadas respeitarem o terreno e as esquinas; modelar de modo mais elaborado **as duas âncoras**.
- McDonald's: usar identificação comercial verificada; fachada construída de peças low poly (volumes, vidros, cobertura, sinalização) com dimensões e materiais **aproximados**, sem alegar reprodução de fotografia.
- Habib's: idem. Existe indicação de edifício nomeado no OSM, mas é preciso checar posição do lote e correspondência entre dados.
- Para as outras casas: aplicar biblioteca modular de muros, portões, vitrines e telhados, com diferenciação procedural e rótulo de confiança.
- Se forem usadas APIs de imagens de rua, registrar explicitamente **URL, proprietário, licença e permissão de uso como referência**, sem copiar texturas fotográficas. A automação pode ser executada primeiro com presets, sem chamar serviços de IA.
- Esquinas e entradas das ruas laterais: 21 fragmentos OSM de até 50 m da rota, com finais tratados visualmente para não parecer que a rua segue eternamente.
- Medir carregamento e FPS em celular antes de ampliar.

## ETAPA 4 — Introdução, seleção por região e documentação para botão Create (pendente)

- Spawning em frente ao McDonald's e percurso guiado de aproximadamente 1,17 km até o Habib's, preservando botões mobile.
- Indicadores de onde estão as duas âncoras, direção do percurso e marcador de versão automática.
- Registrar tempos, consumo de dados e qualidade de cada resultado.
- Separar o pipeline em operações com progresso/erros: **Selecionar área → Importar OSM → Traçar ruas → Amostrar DEM → Classificar construções → Gerar módulos/UV → Revisar → Armazenar e carregar**.
- Só depois permitir clique para disparar a cadeia completa e persistir resultados. Cada etapa deve ser repetível, verificável e reversível sem sobrescrever o mapa OSM original.

## Regras de qualidade e licenças

- OpenStreetMap (ODbL): atribuir os colaboradores e manter informação de proveniência e regras de dados derivados.
- Fontes de DEM: armazenar proveniência, resolução, data e direitos.
- Imagens de rua: só usar imagens com direitos compatíveis com o fluxo; Google Street View não deve ser copiado/reprocessado automaticamente como fonte de texturas.
- Marcas de McDonald's/Habib's: identificação do ponto é diferente de reproduzir logotipos e fachadas protegidos; testar marcações textuais no protótipo e revisar uso de marcas antes de divulgação comercial.
- **Confiabilidade:** tags comerciais verificadas não permitem inferir materiais, janelas ou fachadas reais de todas as construções.
