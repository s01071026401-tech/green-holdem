import {rankFive, compareRanks, type Card} from '../game/cards.js';
import type {Player, Move} from '../game/engine.js';
export type Difficulty = 'easy'|'medium'|'hard';
export type BotDecision = {move:Move; amount?:number};
const R='23456789TJQKA';
const r=(card:Card)=>R.indexOf(card[0])+2;
function handStrength(hole:Card[], board:Card[]):number {
  if(hole.length!==2) return 0;
  const [a,b]=hole.map(r);
  const pair=a===b, suited=hole[0][1]===hole[1][1];
  const high=Math.max(a,b);
  let raw=(pair?0.42+high/35:0.07+(a+b)/55)+(suited?0.08:0)+(Math.abs(a-b)===1?0.05:0);
  if(board.length>=3){
    const cards=[...hole,...board];
    // Compare complete five-card subsets. Scores are public-board-relative, not full equity.
    let best:number[]=[];
    for(let i=0;i<cards.length;i++)for(let j=i+1;j<cards.length;j++)for(let k=j+1;k<cards.length;k++)for(let l=k+1;l<cards.length;l++)for(let m=l+1;m<cards.length;m++){
      const value=rankFive([cards[i],cards[j],cards[k],cards[l],cards[m]]);
      if(!best.length||compareRanks(value,best)>0)best=value;
    }
    raw=Math.max(raw*0.45, (best[0]||0)/9+Math.min(0.14, (best[1]||0)/100));
  }
  return Math.max(0,Math.min(1,raw));
}
export function decideBot(p:Player,board:Card[],currentBet:number,minRaise:number,difficulty:Difficulty,random=Math.random):BotDecision {
  const toCall=Math.max(0,currentBet-p.streetBet);
  const strength=handStrength(p.hole,board);
  const pressure=toCall/Math.max(1,p.stack+toCall);
  if(difficulty==='easy'){
    if(toCall===0)return {move:'check'};
    return {move:pressure>0.55&&random()<0.65?'fold':'call'};
  }
  const hard=difficulty==='hard';
  const foldThreshold=(hard?0.29:0.2)+pressure*(hard?0.95:0.65);
  if(toCall>0&&strength+random()*0.22<foldThreshold)return {move:'fold'};
  const aggression=hard?0.56:0.76;
  const bluff=hard?0.065:0.025;
  const wantsRaise=(strength>aggression||random()<bluff);
  const target=currentBet+minRaise;
  const maxTotal=p.streetBet+p.stack;
  if(wantsRaise&&p.raiseRights&&maxTotal>=target&&target>currentBet&&p.stack>toCall){
    return {move:'raise',amount:target};
  }
  return {move:toCall===0?'check':'call'};
}
