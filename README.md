# 🚌 Buzun Simulator — Protótipo 0.1

**São Paulo real, visual low poly.** Jogo de direção no navegador com estradas do OpenStreetMap, relevo SRTM e modelos de fachadas gerados por peças.

**Cena atual (padrão): trecho McDonald’s → Habib’s da Avenida Dona Belmira Marin, Grajaú, São Paulo.** O projeto está em desenvolvimento; os dados e o código passaram por testes automáticos, mas a nova cena precisa de revisão no iPhone e em PC.

## ▶️ Testar

1. Abra a versão publicada na Vercel quando o deploy da `main` terminar; ou baixe este repositório.
2. Na pasta, rode `python3 -m http.server 5173` (ou `npm run start`).
3. Abra **http://localhost:5173**. É necessário acesso à internet para o Three.js hospedado em CDN.
4. Escolha **McDonald’s** (início) ou **Habib’s** (fim), clique em **Começar a dirigir**.
5. No canto superior, acompanhe a distância restante até o Habib’s.

## 🗺️ Dados reais do trecho

| Camada | Resultado preparado |
|---|---|
| Rota | Aproximadamente **1,16 km**, endereço 1277 → 111 |
| Vias | **44 trechos/entradas**, extraídos do OSM e limitados ao corredor |
| Construções | **619 contornos OSM**, transformados em modelos low poly |
| Altimetria | **320 amostras SRTM30m**, interpoladas no asfalto e terreno |
| Variação aproximada | De **817 m** (McDonald’s) para **765 m** (Habib’s) |
| Marcos | Habib’s mapeado pelo OSM (`619054945`), McDonald’s ancorado por endereço |

**Atenção:** nenhum letreiro ou fachada é uma reconstrução fotográfica exata. A localização do McDonald’s está confirmada pelo endereço, mas a identificação do seu prédio ainda precisa de revisão visual. O modelo é aproximado. No Habib’s o contorno do prédio é conhecido, mas materiais, janelas e letreiro também são estilizados.

Os bairros mais amplos não foram apagados: os extratos originais continuam guardados em `public/data/grajau.json`, `belmira-marin.json` e `cocaia-corredores.json`. A experiência carregada por padrão agora usa somente `belmira-corridor.json` para ser mais leve no celular.

## 🎮 Controles

| Ação | Teclado | Controle | Celular |
|---|---|---|---|
| Acelerar | W ou ↑ | RT / R2 | Pedal ACELERAR |
| Frear / ré | S ou ↓ | LT / L2 | Pedal FREIO |
| Esterçar | A/D ou ←/→ | Analógico esquerdo | Setas ◀ ▶ |
| Câmera | Arrastar mouse | Analógico direito | Arrastar o cenário |
| Reposicionar | R | — | Botão ↺ |
| Visitar próximo marco/modelo | Botão ⌂ | — | Botão ⌂ |

É possível segurar direção e pedal simultaneamente no touch. Seleção azul de texto e menus de toque prolongado foram desabilitados na interface do jogo.

## 🏗️ Pipeline de mundo (feito agora, automatização depois)

O pipeline reproduzível foi documentado em **[docs/WORLD_ENGINE_BELMIRA.md](docs/WORLD_ENGINE_BELMIRA.md)**, incluindo geometria, critérios de recorte, altimetria, fachadas, incertezas, licenças e o desenho do futuro botão **Create**.

Para atualizar as etapas de preparação em desenvolvimento:

```bash
npm run world:route
npm run world:blocks
npm run verify
```

- `world:route`: remonta o percurso no grafo de vias já salvo.
- `world:blocks`: realiza uma consulta de área pequena no OSM **somente durante a geração**, e recria a malha local de edifícios e ruas secundárias.
- A grade `belmira-elevation.json` foi obtida separadamente uma vez via OpenTopoData/SRTM e é reutilizada no jogo. Não chamar APIs públicas repetidamente no runtime.
- O **botão Create, imagens de rua, geração de textura por IA e R2 ainda não estão implementados**.

## 🗂️ Arquivos principais

```
index.html
src/main.js                  Cena, carro, câmera, minimapa, HUD, controles
src/world.js                 Solo, estradas, cruzamentos, prédios e vegetação
src/terrain.js               Interpolador de relevo SRTM / preview
src/corridor.js              Grafo e seleção da avenida
src/corridor-landmarks.js    Fachadas e letreiros low poly de referências
src/route-progress.js        Distância percorrida/restante sobre a rota
src/world-engine.js          Geração dos três presets iniciais
public/data/belmira-corridor.json
public/data/belmira-elevation.json
config/belmira-corridor.json
scripts/build-belmira-corridor.mjs
scripts/build-osm-blocks.mjs
docs/WORLD_ENGINE_BELMIRA.md
GDD.md
ROADMAP.csv
```

## ✅ Testes

Execute `npm run verify` com Node.js 22+. O GitHub Actions valida sintaxe e testes unitários. **Isso não garante que o WebGL rode perfeitamente nem que as fachadas estejam na posição ideal em todos os celulares.**

## 📜 Direitos e dados

- Dados geográficos: **© OpenStreetMap contributors**, licenciados em **ODbL 1.0**. https://www.openstreetmap.org/copyright
- Elevação: dados SRTM30m distribuídos via OpenTopoData; verificar termos da fonte antes de distribuição em novos produtos. https://www.opentopodata.org/datasets/srtm/
- Marca e fachadas: placas e modelos low poly são representações artísticas, não material oficial de McDonald’s/Habib’s. Não foram reaproveitadas fotos proprietárias.
- O código do jogo não possui licença pública de redistribuição definida. A licença do OSM segue independente.

[Repositório](https://github.com/DevSouza208/buzun-simulator) · [GDD](GDD.md) · [Documento de geração](docs/WORLD_ENGINE_BELMIRA.md)
