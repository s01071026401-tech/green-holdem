import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {decideBot} from '../rooms/botStrategy.js';
import type {Player} from './engine.js';
const fake=(hole:string[],stack=1000):Player=>({id:'bot',name:'bot',seat:0,stack,hole,folded:false,allIn:false,streetBet:0,totalBet:0,acted:false,raiseRights:true,connected:true});
test('easy bot checks on a free action',()=>{assert.equal(decideBot(fake(['2s','7d']),[],0,100,'easy').move,'check');});
test('hard bot can raise strong pocket pair without exceeding stack',()=>{
  const bot=fake(['As','Ad']); const decision=decideBot(bot,[],100,100,'hard',()=>0.5);
  assert.equal(decision.move,'raise');assert.ok(typeof decision.amount === 'number' && Number.isInteger(decision.amount) && decision.amount >= 200 && decision.amount <= bot.stack, 'raise must be legal and within the bot stack');
});
test('bot defaults to fold against a severe price with weak cards',()=>{
  const decision=decideBot(fake(['2s','7d']),[],900,100,'hard',()=>0.5);
  assert.equal(decision.move,'fold');
});

