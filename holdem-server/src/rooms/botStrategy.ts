import {rankFive, compareRanks, type Card} from '../game/cards.js';
import type {Player, Move} from '../game/engine.js';

export type Difficulty='easy'|'medium'|'hard';
export type BotDecision={move:Move;amount?:number};
export type BotContext={
  pot?:number;
  opponents?:number;
  // Relative seat order. 0=early; 1=middle; 2=late/button or blind.
  position?:0|1|2;
  // Historical human fold fraction, if sufficient observations exist.
  opponentFoldRate?:number;
  // Stable personality per bot. 0=tight, 1=balanced, 2=aggressive.
  personality?:0|1|2;
};
const R='23456789TJQKA';
const rank=(c:Card)=>R.indexOf(c[0])+2;
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const rng=(random:()=>number)=>clamp(random());

function preflopStrength(h:Card[]):number{
  if(h.length!==2)return 0;
  const [a,b]=h.map(rank),hi=Math.max(a,b),lo=Math.min(a,b),gap=hi-lo;
  const suited=h[0][1]===h[1][1];
  if(a===b)return clamp(0.43+hi*0.037); // 22 .50, TT .80, AA .95
  const broadway=(hi>=11&&lo>=10)?0.10:0;
  const ace=hi===14?0.055:0;
  const connected=gap===1?0.08:gap===2?0.045:gap===3?0.02:0;
  const weakGap=gap>=5?0.055:0;
  return clamp(0.10+hi*0.025+lo*0.010+(suited?0.065:0)+broadway+ace+connected-weakGap);
}
function bestHand(h:Card[],board:Card[]):number[]{
  const all=[...h,...board];
  let best:number[]=[];
  for(let a=0;a<all.length-4;a++)for(let b=a+1;b<all.length-3;b++)for(let c=b+1;c<all.length-2;c++)for(let d=c+1;d<all.length-1;d++)for(let e=d+1;e<all.length;e++){
    const result=rankFive([all[a],all[b],all[c],all[d],all[e]]);
    if(!best.length||compareRanks(result,best)>0)best=result;
  }
  return best;
}
function straightDrawCount(cards:Card[]):number{
  const nums=new Set(cards.map(rank));if(nums.has(14))nums.add(1);
  let best=0;
  for(let start=1;start<=10;start++){
    const found=Array.from({length:5},(_,i)=>start+i).filter(n=>nums.has(n)).length;
    best=Math.max(best,found);
  }
  return best;
}
function postflop(h:Card[],board:Card[]):{power:number;draw:number;showdown:number;wet:number}{
  const all=[...h,...board],best=bestHand(h,board),category=best[0]??0;
  const boardBest=board.length===5?rankFive(board):[];
  const boardPlays=boardBest.length>0&&compareRanks(best,boardBest)===0;
  let power=[0.19,0.49,0.70,0.81,0.88,0.92,0.97,0.995,1][category]??0.2;
  const high=(best[1]??0)/14;
  power+=category<3?high*0.065:high*0.03;
  // A pair on the shared board is weaker than a pair in our hole cards.
  if(category===1){
    const holeRanks=h.map(rank),pairRank=best[1];
    if(!holeRanks.includes(pairRank))power-=0.18;
    if(holeRanks[0]===holeRanks[1])power+=0.035;
  }
  if(boardPlays)power-=0.20;
  let draw=0;
  if(board.length<5){
    const suitCounts=['s','h','d','c'].map(s=>all.filter(c=>c[1]===s).length);
    const flushSuit=['s','h','d','c'][suitCounts.indexOf(Math.max(...suitCounts))];
    if(Math.max(...suitCounts)===4 && h.some(c=>c[1]===flushSuit))draw+=0.22;
    if(straightDrawCount(all)===4)draw+=0.14;
    // Two overcards still have improvement potential, but not premium equity.
    if(category===0&&h.every(c=>rank(c)>Math.max(...board.map(rank))))draw+=0.045;
  }
  const boardSuitCounts=['s','h','d','c'].map(s=>board.filter(c=>c[1]===s).length);
  const wet=clamp((Math.max(...boardSuitCounts)-1)*0.16+(straightDrawCount(board)>=3?0.18:0));
  return {power:clamp(power),draw:clamp(draw),showdown:category,wet};
}
function betAmount(total:number,min:number,max:number,pot:number,fraction:number):number{
  // Engine expects TOTAL street bet, not an incremental raise.
  const increment=Math.max(1,Math.round((pot*fraction)/10)*10);
  return Math.max(min,Math.min(max,total+increment));
}

export function decideBot(p:Player,board:Card[],currentBet:number,minRaise:number,_difficulty:Difficulty,random=Math.random,context:BotContext={}):BotDecision{
  const toCall=Math.max(0,currentBet-p.streetBet);
  const maxTotal=p.streetBet+p.stack;
  const minTotal=currentBet+minRaise;
  const canRaise=p.raiseRights&&maxTotal>=minTotal&&p.stack>toCall;
  if(p.stack<=0)return {move:toCall?'fold':'check'};
  const pot=Math.max(1,context.pot??Math.max(currentBet*2,minRaise*2));
  const opponents=Math.max(1,context.opponents??1);
  const position=context.position??1;
  const personality=context.personality??1;
  const opponentFoldRate=clamp(context.opponentFoldRate??0.42);
  const pre=board.length===0;
  const detail=pre?{power:preflopStrength(p.hole),draw:0,showdown:0,wet:0}:postflop(p.hole,board);
  const strength=detail.power;
  const price=toCall/(pot+toCall);
  const stackBB=p.stack/Math.max(1,minRaise);
  const stackPot=p.stack/pot;
  const multiway=opponents>1;

  // All three UI difficulty settings use the same adaptive human-like policy.
  // Keep the argument for compatibility with saved rooms and client messages.
  const aggression=0.18+(personality===2?0.09:personality===0?-0.055:0);
  const positionalBonus=position===2?0.065:position===0?-0.035:0;
  // Bluffs less often multiway and more often against observed folding players.
  const foldAdjust=(opponentFoldRate-0.42)*0.25;
  const bluffBase=clamp(0.13+aggression*0.45+positionalBonus+foldAdjust-(opponents-1)*0.055);
  const noise=(rng(random)-0.5)*0.12;
  const confidence=clamp(strength+detail.draw*0.60+positionalBonus*0.30+noise-(opponents-1)*0.018);

  // Tighten calling odds when facing substantial pressure; draws can justify calls.
  const callNeed=clamp(0.12+price*0.66+Math.min(0.18,toCall/Math.max(1,p.stack)*0.22)+(opponents-1)*0.014);
  // When the blind is small compared with the stack, many recreational players
  // see a flop with marginal hands instead of folding the majority of a table.
  // Keep a randomized (not automatic) willingness to defend cheap preflops.
  const cheapPreflop=pre&&toCall>0&&toCall<=p.stack*0.055&&toCall<=Math.max(180,pot*0.72);
  const affordableCall=cheapPreflop&&confidence<0.53&&rng(random)<(personality===0?0.62:personality===2?0.86:0.77);
  const canContinue=confidence+detail.draw*0.30>=callNeed || affordableCall || (pre&&confidence>0.49&&price<0.21);
  // Concede hopeless holdings when facing a meaningful price, regardless
  // of the selected UI difficulty. Do not fold for free when check is legal.
  const weakNoDraw=detail.draw<0.10&&confidence<(pre?0.35:0.37);
  if(toCall>0 && ((weakNoDraw && !affordableCall && (price>=0.29||toCall>=p.stack*0.20)) || !canContinue)){
    return {move:'fold'};
  }

  // Stronger value range bets frequently. Semi-bluffs prefer real draws,
  // while river bluffs need low showdown value and good fold equity.
  const valueThreshold=pre?0.54:0.58;
  const premium=confidence>(pre?0.86:0.86);
  const valueRaise=confidence>=valueThreshold && rng(random)<Math.min(0.95,clamp(0.74+aggression+Math.max(0,confidence-valueThreshold)*0.45));
  const semiBluff=board.length>=3&&board.length<5&&detail.draw>=0.14&&strength<0.78;
  const preBluff=pre&&confidence>=0.38&&confidence<0.64&&position>=1;
  const riverBluff=board.length===5&&detail.showdown===0&&position===2&&stackPot>0.7;
  const pureBluff=semiBluff||preBluff||riverBluff;
  const bluffChance=bluffBase*(semiBluff?2.8:preBluff?1.45:riverBluff?1.0:0.0)*(toCall>0?0.78:1);
  const bluffRaise=pureBluff&&rng(random)<clamp(bluffChance);
  const betAllowed=canRaise && (valueRaise||bluffRaise);

  if(betAllowed){
    // Realistic mixed bet sizes: quarter/half/three-quarter/pot/occasional overbet.
    const roll=rng(random);
    const fractions=confidence>0.91?[0.45,0.72,1.0,1.25]:bluffRaise?[0.36,0.60,0.80,1.0]:[0.40,0.65,0.85,1.0];
    const frac=fractions[Math.min(fractions.length-1,Math.floor(roll*fractions.length))];
    const target=betAmount(currentBet,minTotal,maxTotal,pot,frac);
    // Short-stack premiums push naturally; pure bluffs rarely shove into multiple opponents.
    const shortPremium=premium&&stackBB<=16&&toCall<p.stack&&rng(random)<0.70;
    const committed=premium&&stackPot<1.0&&rng(random)<0.50;
    if((shortPremium||committed)&&!bluffRaise)return {move:'allin'};
    return {move:'raise',amount:target};
  }
  if(toCall===0)return {move:'check'};
  if(toCall>=p.stack){
    return canContinue?{move:'allin'}:{move:'fold'};
  }
  return {move:'call'};
}
