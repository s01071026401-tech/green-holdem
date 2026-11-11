import {rankFive, compareRanks, type Card} from '../game/cards.js';
import type {Player, Move} from '../game/engine.js';
export type Difficulty = 'easy'|'medium'|'hard';
export type BotDecision = {move:Move; amount?:number};
export type BotContext = {pot?:number; opponents?:number};
const R='23456789TJQKA';
const rank=(c:Card)=>R.indexOf(c[0])+2;
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
function preflopPower(hole:Card[]):number {
  if(hole.length!==2)return 0;
  const [a,b]=hole.map(rank), high=Math.max(a,b), low=Math.min(a,b);
  const pair=a===b, suited=hole[0][1]===hole[1][1], gap=high-low;
  if(pair)return clamp(0.58+high/32); // AA strongest; small pairs playable
  const premium=(high===14&&low>=10)||(high===13&&low>=11);
  return clamp(0.10+(high+low)/47+(suited?0.07:0)+(gap<=2?0.05:0)+(premium?0.09:0));
}
function postflopPower(hole:Card[],board:Card[]):number {
  const cards=[...hole,...board];
  if(cards.length<5)return preflopPower(hole);
  let best:number[]=[];
  for(let a=0;a<cards.length;a++)for(let b=a+1;b<cards.length;b++)for(let c=b+1;c<cards.length;c++)for(let d=c+1;d<cards.length;d++)for(let e=d+1;e<cards.length;e++){
    const score=rankFive([cards[a],cards[b],cards[c],cards[d],cards[e]]);
    if(!best.length||compareRanks(score,best)>0)best=score;
  }
  // Categories 0=high card ... 8=straight flush.
  const base=[0.13,0.45,0.65,0.78,0.85,0.89,0.94,0.985,1][best[0]??0] ?? 0.13;
  const relative=clamp((best[1]??0)/14)*0.08;
  let draw=0;
  if(board.length<5){
    const suits=cards.map(c=>c[1]);
    if(Math.max(...['s','h','d','c'].map(s=>suits.filter(x=>x===s).length))===4)draw+=0.12;
    const values=new Set(cards.map(rank));if(values.has(14))values.add(1);
    for(let start=1;start<=10;start++){
      const count=Array.from({length:5},(_,j)=>start+j).filter(x=>values.has(x)).length;
      if(count===4){draw+=0.08;break;}
    }
  }
  return clamp(base+relative+draw);
}
export function decideBot(p:Player,board:Card[],currentBet:number,minRaise:number,difficulty:Difficulty,random=Math.random,context:BotContext={}):BotDecision {
  const toCall=Math.max(0,currentBet-p.streetBet);
  const maxTotal=p.streetBet+p.stack;
  const minTotal=currentBet+minRaise;
  const power=board.length>=3?postflopPower(p.hole,board):preflopPower(p.hole);
  const opponents=Math.max(1,context.opponents??1);
  const pot=Math.max(1,context.pot??Math.max(currentBet*2,minRaise*2));
  const price=toCall/(pot+toCall); // pot-odds proxy, not simulated equity
  const exposure=toCall/Math.max(1,p.stack+toCall);
  const unpredictability=(random()-0.5)*(difficulty==='hard'?0.10:0.16);
  const confidence=clamp(power+unpredictability-(opponents-1)*0.035);
  if(difficulty==='easy'){
    if(toCall===0)return {move:'check'};
    if(power>0.83&&p.raiseRights&&maxTotal>=minTotal&&random()<0.22)return {move:'raise',amount:minTotal};
    return {move:exposure>0.55&&random()<0.65?'fold':'call'};
  }
  // More value raises, occasional semi-bluffs, varied bet sizes; still fold
  // weak hands when facing a costly bet. A tough player is not a shove bot.
  const hard=difficulty==='hard';
  const riskThreshold=(hard?0.25:0.22)+0.55*price+0.35*exposure;
  if(toCall>0&&confidence<riskThreshold&&random()<(hard?0.90:0.82))return {move:'fold'};
  const value=(hard?0.56:0.65), bluffRate=hard?0.13:0.08;
  const semiBluff=board.length===3||board.length===4;
  const bluff=confidence>0.28&&confidence<0.58&&random()<bluffRate*(semiBluff?1.5:1);
  const wantRaise=confidence>=value||bluff;
  if(wantRaise&&p.raiseRights&&p.stack>toCall&&maxTotal>=minTotal&&minTotal>currentBet){
    const betFraction=confidence>0.86?0.85:confidence>0.68?0.60:0.40;
    // Clamp to legal whole-chip bet and retain a meaningful fraction of stack.
    const base=board.length===0?Math.max(minRaise*2,Math.round(pot*0.5)):Math.round(pot*betFraction);
    const target=Math.min(maxTotal,Math.max(minTotal,currentBet+base));
    // Short-stack premiums can shove; repeated random weak shoves are avoided.
    if(confidence>0.82&&p.stack<Math.max(pot*1.3,minRaise*6)&&random()<0.55)return {move:'allin'};
    return {move:'raise',amount:target};
  }
  if(toCall>0&&maxTotal<=currentBet&&confidence>0.58)return {move:'allin'};
  return {move:toCall===0?'check':'call'};
}
