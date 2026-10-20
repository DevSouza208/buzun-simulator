# Etapa 5.15 — asfalto em Web Worker, com fallback e medição de lotes

## Por que isso existe?

Na v0.1.66, a construção de regiões vizinhas passou a alternar com os frames do jogo. Contudo, preparar e unir polígonos complexos ainda podia ocupar tempo demais em uma única operação JavaScript, especialmente quando o algoritmo precisava recortar muitos cruzamentos. `requestIdleCallback` não executa cálculos em outra thread: apenas escolhe quando a thread principal começa a tarefa.

A 5.15 desloca **a etapa pesada de união poligonal do asfalto das regiões vizinhas** para um Worker nativo do navegador. O algoritmo geométrico é o mesmo; não há novo proxy, biblioteca, API paga ou mudança no OSM.

## Arquitetura

### Worker de geometria pura

- `src/worldgen-asphalt-job.js`: usa o mesmo `unionAsphaltPatches` da versão anterior, recolhe triângulos 3D preservando ordem e altura e retorna `Float64Array` de posições mais as estatísticas da união.
- `src/worldgen-asphalt.worker.js`: recebe `{id,patches}`, calcula os triângulos fora da thread principal e usa `postMessage` **com transferência de `positions.buffer`**, evitando cópia do resultado. Não importa Three.js e não lê DOM, WebGL ou Mapzen.
- `src/worldgen-asphalt-client.js`: cria Worker ESM no mesmo domínio, valida identidade/tipo da resposta, termina o Worker no sucesso ou erro e permite cancelar em teletransportes.
- `src/city-road-mesh.js`: só utiliza Worker com `renderBounds` e `backgroundAsphalt:true`. Enquanto espera, gera checkpoints `asphalt_worker_wait`; quando recebe os dados, reenvia os triângulos às malhas em grupos de 160 e continua a construção cooperativa de calçadas, guias, rampas, marcas e buffers Three.js.

**A região inicial, o modo tradicional e os carregamentos emergenciais de teleporte continuam síncronos**: não seria seguro consumir um generator que aguarda a mensagem de Worker numa chamada bloqueante. O processo de terreno e o cálculo físico de alturas continuam no fluxo já validado.

### Falhas e cancelamento

Se o navegador não oferecer Web Worker, bloquear módulos por CSP, falhar na execução, retornar dados inválidos ou não responder após **12 segundos**, o WorldGen abandona o Worker e executa a união via `unionAsphaltSteps`, versão cooperativa da 5.14, sem deixar pistas vazias.

Quando uma região em construção deixa o raio de interesse, `createCooperativeRunner.cancel()` encerra o generator; seu `finally` termina o Worker associado. Cada região de background utiliza um Worker temporário e nunca modifica diretamente a cena.

### Telemetria e limites de tempo

O HUD de `?worldgen=stream` passou a informar:
- `Asfalto Worker`: regiões concluídas em Worker e número de regiões com fallback;
- `Pior etapa`: duração e nome da operação individual mais lenta da construção cooperativa;
- `Lotes acima da meta`: quantos passos excederam 6 ms.

Outros contadores em `window.buzunWorldgenReport().streaming`: `asphaltWorkerRegions`, `asphaltWorkerFallbacks`, `asphaltWorkerTriangles`, `maxCooperativeStepMs`, `slowestCooperativeStage`, `slowCooperativeSteps` e `asphaltWorkerWaitSlices`.

O limite de 6 ms continua sendo um **alvo**, não interrupção compulsória de JavaScript. O código mede a duração real do passo mais longo para orientar a próxima rodada.

## Testes automatizados

- `tests/worldgen-asphalt-worker.test.js`: igualdade exata de coordenadas, ordem e estatísticas entre união síncrona e job Worker, `Float64Array` transferível, reconstrução por lotes, respostas inválidas, ausência de suporte, cancelamento e tempos máximos de passos.
- `tests/worldgen-worker-thread.test.js`: inicia **uma thread Worker real no Node.js**, executando o **mesmo arquivo de Worker** entregue aos navegadores, e confirma o resultado transferido e a resposta de erro. Isso não é apenas um mock.
- Amostra de **150 vias reais OSM do Grajaú**, 1.353 patches: **9.193 triângulos**, idênticos em ambas as modalidades. Buffer de saída com **661.896 bytes** (`Float64Array`) antes da conversão para GPU.
- Último CI: **208 testes aprovados e zero falhas**.

## Limitações e plano seguinte

- O custo de **enviar os polígonos de entrada** ainda existe: `postMessage` faz uma clonagem dos patches antes de transferir o buffer de resultado. A troca compensa mais em regiões complexas que em segmentos simples e precisa de medição no navegador.
- O retorno à thread principal também tem um custo pequeno de replay e conversão para `BufferGeometry`; por isso é fatiado em checkpoints.
- A criação inicial de vias, modelos de altitude e cruzamentos, calçadas, guias, rampas, terreno e emergências ainda pode bloquear quadros. Esta etapa não promete 60 FPS nem ganho garantido de desempenho global.
- O CI executa Worker real **em Node**, mas não substitui inspeção do Web Worker no Chrome/Firefox com WebGL e OSM/DEM carregados.
- O serviço de automação externa do navegador ficou sem créditos nesta sessão; a publicação e os testes podem ser verificados, mas não devemos alegar um teste de FPS remoto novo.

## Verificação manual

Abra o experimento:

https://devsouza208.github.io/buzun-simulator/?worldgen=stream

No painel, acompanhe `Asfalto Worker`. Após construir alguns setores vizinhos, o valor de regiões concluídas em Worker deverá aumentar, salvo fallback. Verifique que o jogo mantém asfalto, faixas e rampas na borda de regiões. Compare `Pior etapa` e FPS **enquanto novas regiões são construídas**, não apenas após o mundo ficar parado.

O modo tradicional permanece acessível sem parâmetros:

https://devsouza208.github.io/buzun-simulator/

## Próxima etapa

**5.16 — telemetria de condução e workerização das calçadas**, caso os números mostrem que a união de calçadas e guias ainda é a etapa dominante. Antes de ativar o streaming como padrão, validar direção real, mudança de região, falta de Worker e recarregamento de regiões previamente descartadas.
