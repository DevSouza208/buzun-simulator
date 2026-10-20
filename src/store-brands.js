import { seeded } from "./geo.js";

/**
 * Fictional local businesses, not real POIs. Brand signs are part of the
 * game's identity and never overwrite real OSM names or addresses.
 */
export const FICTIONAL_SHOPS=Object.freeze([
  {name:"Casas Ceará",category:"variedades",bg:"#d64e41",fg:"#fff5db"},
  {name:"Assento do Brasil",category:"banco imaginário",bg:"#2455a4",fg:"#fff4cb"},
  {name:"Mc Donaits",category:"lanchonete",bg:"#b62932",fg:"#ffe68b"},
  {name:"Padoca do Zé",category:"padaria",bg:"#986742",fg:"#fff0d2"},
  {name:"Drogaria Sem Drama",category:"farmácia",bg:"#267b68",fg:"#e8fff1"},
  {name:"Rei da Coxinha",category:"salgados",bg:"#b35d32",fg:"#fff3d9"},
  {name:"Móveis do Tio",category:"móveis",bg:"#755ca0",fg:"#f2e4fd"},
  {name:"Açougue Boi de Boa",category:"açougue",bg:"#a8394f",fg:"#fff2e2"},
  {name:"Ótica Dois Olhos",category:"óptica",bg:"#276b96",fg:"#e4faff"},
  {name:"Lojas Quase Tudo",category:"variedades",bg:"#ed7b36",fg:"#fff6e5"},
  {name:"Bar do Buzun",category:"bar fictício",bg:"#385e59",fg:"#f6f1d5"},
  {name:"Pizzaria Pedal",category:"pizzaria",bg:"#ac4037",fg:"#fcf1da"},
  {name:"Oficina Vai Que Vai",category:"oficina",bg:"#455a81",fg:"#e9f5ff"},
  {name:"Mercadinho 24 e Pouco",category:"mercado",bg:"#55824c",fg:"#fff8db"},
  {name:"Papelaria Três Pontas",category:"papelaria",bg:"#5874ab",fg:"#f6f5ff"},
  {name:"Cantinho do Pastel",category:"pastelaria",bg:"#a8653b",fg:"#ffefd3"},
  {name:"Eletrônica 220",category:"eletrônicos",bg:"#275c7f",fg:"#e3ffff"},
  {name:"Sorvetes Friozão",category:"sorveteria",bg:"#7f65a8",fg:"#fff0fd"},
  {name:"Pet & Patas",category:"pets",bg:"#437d7d",fg:"#fff9d8"},
  {name:"HabiBuz",category:"restaurante",bg:"#254fa1",fg:"#f5edcf"}
]);
export function fictionalShopFor(id,index=0) {
  const n=FICTIONAL_SHOPS.length;
  if(!Number.isFinite(id))return FICTIONAL_SHOPS[((index%n)+n)%n];
  // Repeatable in any scene build, while first shops showcase user choices.
  return FICTIONAL_SHOPS[((index%n)+n)%n];
}
export function randomizedFacadeAccent(id){
  return .85+seeded(id*17+51)*.3;
}
