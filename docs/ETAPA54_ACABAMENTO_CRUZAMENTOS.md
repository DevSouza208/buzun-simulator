# Etapa 5.4 — Acabamento de cruzamentos e concordância de greide

## Motivação
As ruas já compartilhavam a altitude exata nos nós OSM, mas 5–15 m antes de um cruzamento seus perfis podiam ter inclinações divergentes. A calçada foi unificada na Etapa 5.3; o meio-fio precisava de um acabamento visual menos rígido, sem invadir o asfalto ou redesenhar a rua.

## Implementação

- `src/intersection-grade.js` recebe ruas e nós compartilhados, agrupa por camada física OSM (nunca junta ponte com pista térrea), identifica a via dominante pela prioridade da união do asfalto, lê a inclinação local do DEM em ±3,5 m de sua direção e constrói um plano de referência para cada entroncamento real.
- O novo `reconcileRoadGrade` adapta somente as seções dentro de um raio entre 8–19 m do cruzamento. Usa transição cúbica suave e limita alteração de altitude a **no máximo 0,8 m**, preservando o nível e a escala 1:1 fora desse raio. Quando duas junções estão próximas, a soma dos pesos é normalizada.
- `src/city-road-mesh.js` aplica o novo perfil antes de criar asfalto, calçadas, meios-fios, marcações e superfície para o carro. O terreno não foi refeito nesta etapa.
- `src/sidewalk-union.js` agora produz um **perfil de meio-fio suavizado de três faixas**: parede baixa na borda do asfalto, bisel em duas etapas e conexão alguns centímetros para dentro do passeio. O limite X/Z do asfalto não se altera; o acabamento não pode entrar na faixa de rolamento. Para não triplicar a quantidade de triângulos ao longo de quilômetros de guia, o bisel mais detalhado é gerado **somente nas proximidades de cruzamentos OSM reais**; os trechos longos e retos preservam a parede simples.
- `src/city-world.js` inclui `stats.gradeStatistics.sharedJunctionPlanes` e estatísticas de número de faces do meio-fio para inspeção.
- Os testes cobrem entroncamentos T, influência local, limite vertical de ±0,8 m, vias em níveis distintos, perfil arredondado dentro da calçada e uma amostra grande de junções reais do Grajaú.

## O que NÃO está resolvido nesta etapa
- **O canto da esquina em planta continua poligonal.** O bisel dá suavidade ao perfil vertical do meio-fio, mas uma curva horizontal com raio real precisa reconstruir o polígono da esquina **junto com o asfalto e a calçada**. Não é correto simplesmente mover a guia e deixar buracos entre superfícies.
- As larguras sem `width` no OSM seguem sendo estimativas. Não é validação de urbanismo nem levantamento topográfico real.
- O greide se aproxima de um plano local da avenida apenas num raio curto, com corte máximo de 0,8 m. Trechos discrepantes acima disso ainda podem precisar de correção de dados/geração.
- Não muda sinalização das faixas, geometria OSM, minimapa, edifícios nem interfaces do editor.

## Validação
1. Confirmar a versão **0.1.54** no GitHub Pages.
2. Dirigir pela Belmira Marín e inspecionar cruzamentos em ladeiras. O encontro da rua lateral deverá apresentar menor degrau de asfalto.
3. No Buzun Create, aproximar para ver os novos meios-fios; o bisel deve ficar no passeio, nunca cruzar a pista.
4. Verificar o console `[Buzun WorldGen] Concordância de nível:` e comparar a aparência após cada recarga.
5. Se houver falhas visuais, registrar captura e localização aproximada; o ajuste de concordância não deve ocultar falhas de contorno/topologia.

## Próxima etapa 5.5 (após validação)
Resolver curvas horizontais de esquina com raios adaptativos a partir do polígono de união do asfalto, reconstruindo simultaneamente meio-fio, passeio e área asfaltada. Sem mexer no OSM original.
