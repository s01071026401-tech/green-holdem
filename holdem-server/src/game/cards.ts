import { randomInt } from 'node:crypto';
export type Card = string;
const RANKS='23456789TJQKA';
const SUITS='shdc';
export function newDeck():Card[] {
  const cards = [...SUITS].flatMap(s => [...RANKS].map(r => r+s));
  for(let i=cards.length-1;i>0;i--) {const j=randomInt(i+1); [cards[i],cards[j]]=[cards[j],cards[i]];}
  return cards;
}
function straightHigh(ranks:number[]):number {
  const unique=[...new Set(ranks)].sort((a,b)=>b-a);
  if(unique.includes(14)) unique.push(1);
  for(let i=0;i<=unique.length-5;i++) if(unique[i]-unique[i+4]===4) return unique[i];
  return 0;
}
export function rankFive(cards:Card[]):number[] {
  if(cards.length!==5) throw new Error('Need exactly 5 cards');
  const ranks=cards.map(c=>RANKS.indexOf(c[0])+2);
  const flush=cards.every(c=>c[1]===cards[0][1]);
  const straight=straightHigh(ranks);
  const counts=new Map<number,number>();
  for(const r of ranks) counts.set(r,(counts.get(r)||0)+1);
  const groups=[...counts].sort((a,b)=>b[1]-a[1]||b[0]-a[0]);
  if(flush&&straight) return [8,straight];
  if(groups[0][1]===4) return [7,groups[0][0],groups[1][0]];
  if(groups[0][1]===3&&groups[1][1]===2) return [6,groups[0][0],groups[1][0]];
  if(flush) return [5,...ranks.sort((a,b)=>b-a)];
  if(straight) return [4,straight];
  if(groups[0][1]===3) return [3,groups[0][0],...groups.slice(1).map(x=>x[0]).sort((a,b)=>b-a)];
  if(groups[0][1]===2&&groups[1][1]===2) return [2,Math.max(groups[0][0],groups[1][0]),Math.min(groups[0][0],groups[1][0]),groups[2][0]];
  if(groups[0][1]===2) return [1,groups[0][0],...groups.slice(1).map(x=>x[0]).sort((a,b)=>b-a)];
  return [0,...ranks.sort((a,b)=>b-a)];
}
export function compareRanks(a:number[],b:number[]):number {
  for(let i=0;i<Math.max(a.length,b.length);i++) if((a[i]||0)!==(b[i]||0)) return (a[i]||0)-(b[i]||0);
  return 0;
}
export function bestOfSeven(cards:Card[]):number[] {
  if(cards.length!==7) throw new Error('Need 7 cards');
  let best:number[]=[];
  for(let a=0;a<3;a++) for(let b=a+1;b<4;b++) for(let c=b+1;c<5;c++) for(let d=c+1;d<6;d++) for(let e=d+1;e<7;e++) {
    const r=rankFive([cards[a],cards[b],cards[c],cards[d],cards[e]]);
    if(!best.length||compareRanks(r,best)>0)best=r;
  }
  return best;
}
export const HAND_NAMES=['하이카드','원페어','투페어','트리플','스트레이트','플러시','풀하우스','포카드','스트레이트 플러시'];
