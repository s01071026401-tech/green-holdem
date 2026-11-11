import test from 'node:test';
import assert from 'node:assert/strict';
import {decideBot} from '../rooms/botStrategy.js';
import type {Player} from './engine.js';

const player=(hole:string[],stack=9900):Player=>({
  id:'bot-test',name:'AI',seat:1,stack,hole,
  folded:false,allIn:false,streetBet:0,totalBet:0,acted:false,raiseRights:true,connected:true,
});
const sample=(values:number[])=>{let i=0;return ()=>values[i++%values.length];};

test('v0.7.2: aggressive bot raises premium hands with legal total bet',()=>{
  const p=player(['As','Ah']);
  const d=decideBot(p,[],100,100,'hard',sample([0.5,0.1,0.15,0.5]),{pot:300,opponents:1,position:2,personality:2});
  assert.equal(d.move,'raise');
  assert.ok(typeof d.amount==='number'&&Number.isSafeInteger(d.amount)&&d.amount>=200&&d.amount<=p.stack);
});

test('v0.7.2: premium hands sometimes slowplay rather than always raising',()=>{
  const p=player(['As','Ah']);
  const d=decideBot(p,[],100,100,'hard',sample([0.5,0.99,0.5]),{pot:300,opponents:1,position:2,personality:2});
  assert.equal(d.move,'call');
});

test('v0.7.2: avoid defending hopeless hands facing huge price',()=>{
  const p=player(['2s','7d'],1200);
  const d=decideBot(p,[],1000,100,'hard',()=>0.5,{pot:1800,opponents:3,position:0,personality:0});
  assert.equal(d.move,'fold');
});

test('v0.7.2: strong draw can semi-bluff when checked to',()=>{
  const p=player(['Jh','Th']);
  const d=decideBot(p,['Qh','9h','2c'],0,100,'hard',sample([0.5,0.1,0.1]),{pot:800,opponents:1,position:2,personality:2});
  assert.equal(d.move,'raise');
  assert.ok(typeof d.amount==='number'&&d.amount>=100&&d.amount<=p.stack);
});

test('v0.7.2: never make a raise when action rights are closed',()=>{
  const p={...player(['As','Ah']),raiseRights:false};
  const d=decideBot(p,[],200,100,'hard',()=>0.2,{pot:500});
  assert.ok(d.move==='call'||d.move==='fold'||d.move==='allin');
});

test('v0.7.2: never raise more chips than stack permits',()=>{
  const p=player(['As','Ah'],230);
  const d=decideBot(p,[],100,100,'hard',()=>0.1,{pot:500,position:2,personality:2});
  assert.ok(d.move!=='raise'||(typeof d.amount==='number'&&d.amount<=p.stack));
});

for (const difficulty of ['easy','medium','hard'] as const) {
  test(`${difficulty}: folds very weak hand under significant bet pressure`,()=>{
    const p=player(['2s','7d'],1200);
    const d=decideBot(p,[],1000,100,difficulty,()=>0.5,{pot:1800,opponents:3,position:0,personality:0});
    assert.equal(d.move,'fold');
  });
  test(`${difficulty}: plays a premium hand aggressively when appropriate`,()=>{
    const p=player(['As','Ah']);
    const d=decideBot(p,[],100,100,difficulty,sample([0.5,0.1,0.15,0.5]),{pot:300,opponents:1,position:2,personality:2});
    assert.equal(d.move,'raise');
    assert.ok(typeof d.amount==='number'&&d.amount>=200&&d.amount<=p.stack);
  });
  test(`${difficulty}: can slowplay a premium pair`,()=>{
    const p=player(['As','Ah']);
    const d=decideBot(p,[],100,100,difficulty,sample([0.5,0.99,0.5]),{pot:300,opponents:1,position:2,personality:2});
    assert.equal(d.move,'call');
  });
  test(`${difficulty}: checks free rather than folding weak cards`,()=>{
    const p=player(['2s','7d']);
    const d=decideBot(p,[],0,100,difficulty,()=>0.5,{pot:300,opponents:3,position:0,personality:0});
    assert.equal(d.move,'check');
  });
}
