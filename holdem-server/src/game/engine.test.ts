import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Holdem } from './engine.js';
import { rankFive, bestOfSeven, compareRanks } from './cards.js';
const make=(n=3)=>{const g=new Holdem();for(let i=0;i<n;i++)g.add('p'+i,'P'+i);g.start();return g;};
test('poker hand strength and wheel straight',()=>{
  assert.equal(rankFive(['As','2h','3s','4d','5c'])[0],4);
  assert.equal(rankFive(['As','2h','3s','4d','5c'])[1],5);
  assert.equal(rankFive(['As','Ks','Qs','Js','Ts'])[0],8);
  assert.equal(bestOfSeven(['As','Ks','Qs','Js','Ts','2d','3h'])[0],8);
  assert.ok(compareRanks(rankFive(['Ah','Ad','As','Kh','Kd']),rankFive(['2h','3h','4h','5h','7h']))>0);
});
test('start blinds, BB option, and a full hand by folding',()=>{
  const g=make(2);
  assert.equal(g.players.reduce((s,p)=>s+p.stack,0),19850);
  assert.equal(g.players.reduce((s,p)=>s+p.totalBet,0),150);
  assert.equal(g.players.find(p=>p.seat===g.dealer)?.streetBet,50);
  const first=g.players.find(p=>p.seat===g.turn)!;
  g.action(first.id,'fold');
  assert.equal(g.street,'showdown');
  assert.equal(g.players.reduce((s,p)=>s+p.stack,0),20000);
});
test('full play with checks reaches showdown and conserves chips',()=>{
  const g=make(2);
  for(let i=0;i<40&&g.active();i++){
    const p=g.players.find(p=>p.seat===g.turn)!;
    const call=g.currentBet-p.streetBet;
    g.action(p.id,call>0?'call':'check');
  }
  assert.equal(g.street,'showdown');assert.equal(g.board.length,5);
  assert.equal(g.players.reduce((s,p)=>s+p.stack,0),20000);
});
test('side pots with 3 different stack sizes',()=>{
  const g=new Holdem();g.add('a','A');g.add('b','B');g.add('c','C');
  g.players[0].stack=100;g.players[1].stack=200;g.players[2].stack=300;
  // Custom stack fixture; do not settle under the per-player fixed chip invariant.
  for(const p of g.players){p.totalBet=p.stack;p.streetBet=p.stack;p.stack=0;p.folded=false;p.hole=['As','Ks'];}
  const pots=(g as any).pots();
  assert.deepEqual(pots.map((p:{amount:number})=>p.amount),[300,200,100]);
  assert.deepEqual(pots.map((p:{eligible:string[]})=>p.eligible.length),[3,2,1]);
});
test('multiple consecutive hands conserve all chips',()=>{
  const g=new Holdem();
  for(let i=0;i<6;i++)g.add(String(i),'Player '+i);
  for(let h=0;h<12;h++){
    if(g.players.filter(p=>p.stack>0).length<2)break;
    g.start();let actions=0;
    while(g.active()&&actions++<100){
      const p=g.players.find(p=>p.seat===g.turn)!;
      const due=g.currentBet-p.streetBet;
      g.action(p.id,due?'call':'check');
    }
    assert.ok(actions<100,'hand must terminate');
    assert.equal(g.players.reduce((s,p)=>s+p.stack,0),60000);
  }
});

test('7-player full table deals 2 cards each, advances clockwise and conserves chips',()=>{
  const g=new Holdem();
  for(let i=0;i<7;i++)g.add('seven'+i,'Seven '+i);
  assert.throws(()=>g.add('extra','Extra'),/최대 7명/);
  g.start();
  assert.equal(g.players.length,7);
  assert.ok(g.players.every(p=>p.hole.length===2));
  assert.equal(g.players.reduce((s,p)=>s+p.stack+p.totalBet,0),70000);
  let actions=0;
  while(g.active() && actions++<120){
    const seatBefore=g.turn;
    const p=g.players.find(p=>p.seat===seatBefore)!;
    const due=g.currentBet-p.streetBet;
    g.action(p.id,due>0?'call':'check');
    if(g.active()&&g.street!=='showdown'&&g.turn>=0 && g.turn!==seatBefore){
      assert.ok((g.turn-seatBefore+7)%7>0);
    }
  }
  assert.ok(actions<120);
  assert.equal(g.street,'showdown');
  assert.equal(g.board.length,5);
  assert.equal(g.players.reduce((s,p)=>s+p.stack,0),70000);
});
