import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Holdem } from './engine.js';

test('late joiner spectates public board and pot without private cards',()=>{
  const g=new Holdem();
  for(let i=0;i<3;i++)g.add(`p${i}`,`P${i}`);
  g.start();
  const first=g.players.find(p=>p.seat===g.turn)!;
  g.action(first.id,'call');
  g.add('late','Late');
  const waiting=g.view('late');
  assert.equal(waiting.players.find(p=>p.id==='late')!.cardsCount,0);
  assert.equal(waiting.players.find(p=>p.id==='late')!.waitingForNextHand,true);
  assert.equal(waiting.players.filter(p=>p.id!=='late').every(p=>p.hole.length===0),true);
  assert.equal(waiting.totalPot,g.players.reduce((v,p)=>v+p.totalBet,0));
  let steps=0;
  while(g.active()&&steps++<150){
    const current=g.players.find(p=>p.seat===g.turn)!;
    const due=g.currentBet-current.streetBet;
    g.action(current.id,due?'call':'check');
  }
  assert.equal(g.street,'showdown');
  assert.equal(g.board.length,5);
  assert.equal(g.view('late').showdownHands.length,3);
  assert.equal(g.view('late').players.find(p=>p.id==='late')!.cardsCount,0);
  g.start();
  assert.equal(g.view('late').players.find(p=>p.id==='late')!.cardsCount,2);
});

test('showdown reveals every dealt player including a player who folded',()=>{
  const g=new Holdem();
  g.add('a','A');g.add('b','B');g.add('c','C');g.start();
  const first=g.players.find(p=>p.seat===g.turn)!;
  g.action(first.id,'fold');
  let steps=0;
  while(g.active()&&steps++<150){
    const current=g.players.find(p=>p.seat===g.turn)!;
    const due=g.currentBet-current.streetBet;
    g.action(current.id,due?'call':'check');
  }
  const details=g.view('a').showdownHands;
  assert.equal(details.length,3);
  assert.ok(details.every(p=>p.hole.length===2 && !!p.handName));
  assert.equal(details.find(p=>p.id===first.id)!.folded,true);
});

test('busted player alone can rebuy, only between hands',()=>{
  const g=new Holdem();g.add('a','A');g.add('b','B');g.start();
  assert.throws(()=>g.rebuy('a'),/칩이 0개/);
  let steps=0;
  while(g.active()&&steps++<120){
    const player=g.players.find(p=>p.seat===g.turn)!;
    const due=g.currentBet-player.streetBet;
    g.action(player.id,due?'call':'check');
  }
  const a=g.players.find(p=>p.id==='a')!;
  const b=g.players.find(p=>p.id==='b')!;
  a.stack=0;b.stack=20000;
  g.rebuy('a');
  assert.equal(a.stack,10000);
  assert.throws(()=>g.rebuy('a'),/칩이 0개/);
  g.start();
  assert.ok(a.hole.length===2);
});
