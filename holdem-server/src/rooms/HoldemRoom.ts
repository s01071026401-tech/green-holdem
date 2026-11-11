import {Room, type Client} from 'colyseus';
import {Holdem, MAX_PLAYERS, type Move} from '../game/engine.js';
import {decideBot, type Difficulty} from './botStrategy.js';
const TURN_SECONDS=30;
const NEXT_HAND_DELAY_MS=5000;
const ALLIN_CARD_DELAY_MS=2000;
const RECONNECT_SECONDS=45;
const validDifficulty=(x:unknown):x is Difficulty=>x==='easy'||x==='medium'||x==='hard';
export class HoldemRoom extends Room {
  maxClients=MAX_PLAYERS;
  game=new Holdem();
  private botSerial=0;
  private pendingBotAdds:{count:number;difficulty:Difficulty}[]=[];
  private pendingBotRemovals=0;
  private pendingRebuys=new Set<string>();
  private revealTimer:ReturnType<typeof setTimeout>|undefined;
  private revealHand=-1;
  private revealBase=0;
  private revealCount=0;
  private revealTotal=0;
  private previousStacksDuringReveal=new Map<string,number>();
  private reservedCustomCode:string|undefined;
  private botLevels=new Map<string,Difficulty>();
  private botTimer:ReturnType<typeof setTimeout>|undefined;
  private nextHandTimer:ReturnType<typeof setTimeout>|undefined;
  private nextHandKey=0;
  private nextHandAt=0;
  private turnTimer:ReturnType<typeof setTimeout>|undefined;
  private turnDeadline=0;
  private turnKey='';
  async onCreate(options?:{roomCode?:string}){
    // Colyseus supports assigning roomId during onCreate. Reserve chosen IDs
    // using the shared Presence registry so a second room cannot reuse one.
    const candidate=typeof options?.roomCode==='string' ? options.roomCode.trim().toUpperCase() : '';
    if(candidate){
      if(!/^[A-Z0-9]{4,12}$/.test(candidate))throw new Error('방 코드는 영문 대문자/숫자 4~12자리');
      const key='greenholdem:custom-room-codes';
      const active=await this.presence.smembers(key);
      if(active.includes(candidate))throw new Error('이미 사용 중인 방 코드입니다');
      // Note: single process registration avoids normal collisions; for highly
      // concurrent distributed creation use an atomic SETNX-backed reservation.
      await this.presence.sadd(key,candidate);
      this.reservedCustomCode=candidate;
      this.roomId=candidate;
    }
    this.setPrivate(true);
    this.onMessage('addBot',(client,msg:{count?:number;difficulty?:Difficulty}|undefined)=>this.safe(client,()=>{
      const count=msg?.count??1;
      if(!Number.isInteger(count)||count<1||count>6)throw new Error('AI 수는 1~6명');
      const level=validDifficulty(msg?.difficulty)?msg!.difficulty!:'medium';
      if(this.game.active()||this.isRevealing()){
        this.pendingBotAdds.push({count,difficulty:level});
      }else this.addBots(count,level);
      this.sync();
    }));
    this.onMessage('removeBot',client=>this.safe(client,()=>{
      const bots=this.game.players.filter(p=>this.botLevels.has(p.id));
      const pending=this.pendingBotAdds.reduce((n,x)=>n+x.count,0);
      if(bots.length+pending-this.pendingBotRemovals<1)throw new Error('제거할 AI가 없습니다');
      if(this.game.active()||this.isRevealing())this.pendingBotRemovals++;
      else this.removeOneBot();
      this.sync();
    }));
    this.onMessage('start',client=>this.safe(client,()=>{if(this.game.active()||this.isRevealing())throw new Error('게임 진행 중');this.cancelNextHand();this.applyPendingChanges();this.game.start();this.sync()}));
    this.onMessage('rebuy',client=>this.safe(client,()=>{
      const p=this.game.players.find(x=>x.id===client.sessionId);
      if(!p||p.stack!==0)throw new Error('칩이 0개일 때만 재참가할 수 있습니다');
      if(this.game.active()||this.isRevealing()){
        // All-in hands can still win; only a folded/out player may queue.
        if(p.hole.length>0&&!p.folded)throw new Error('올인 결과가 확정된 후 신청해 주세요');
        this.pendingRebuys.add(client.sessionId);
      }else this.game.rebuy(client.sessionId);
      this.sync();
    }));
    this.onMessage('move',(client,msg:{move:Move;amount?:number})=>this.safe(client,()=>{
      if(!msg||!['fold','check','call','raise','allin'].includes(msg.move))throw new Error('잘못된 행동');
      const boardBefore=this.game.board.length;
      const stackBefore=new Map(this.game.players.map(p=>[p.id,p.stack]));
      this.game.action(client.sessionId,msg.move,msg.amount);
      this.startAllInRevealIfNeeded(boardBefore,stackBefore);
      this.sync();
    }));
    this.onMessage('refresh',client=>client.send('snapshot',this.snapshot(client.sessionId)));
  }
  onJoin(client:Client,options:{name?:string}){
    this.game.add(client.sessionId,typeof options?.name==='string'?options.name:'Player');this.sync();
  }
  // With Colyseus 0.17, onDrop holds the same seat during temporary network loss.
  async onDrop(client:Client){
    const p=this.game.players.find(p=>p.id===client.sessionId);
    if(p)p.connected=false;
    this.sync();
    try{await this.allowReconnection(client,RECONNECT_SECONDS);}catch{/* seat is released after timeout */}
  }
  onReconnect(client:Client){
    const p=this.game.players.find(p=>p.id===client.sessionId);
    if(p)p.connected=true;
    this.sync();
  }
  onLeave(client:Client){this.game.remove(client.sessionId);this.sync();}
  async onDispose(){
    if(this.botTimer)clearTimeout(this.botTimer);
    if(this.turnTimer)clearTimeout(this.turnTimer);
    if(this.revealTimer)clearTimeout(this.revealTimer);
    this.cancelNextHand();
    if(this.reservedCustomCode)await this.presence.srem('greenholdem:custom-room-codes',this.reservedCustomCode);
  }
  private snapshot(id:string){
    const view=this.game.view(id);
    if(this.isRevealing()){
      const board=view.board.slice(0,this.revealCount);
      return {...view,board,players:view.players.map(p=>({...p,stack:this.previousStacksDuringReveal.get(p.id)??p.stack,hole:p.id===id?p.hole:[]})),
        street:'river' as const,turn:-1,result:null,
        showdownHands:[],log:view.log.filter(line=>!line.includes(' +')&&!line.includes('칩 ·')),revealInProgress:true,revealCardsRemaining:this.revealTotal-this.revealCount,
        nextHandRemainingMs:0,turnDeadline:0,turnRemainingMs:0,turnSeconds:TURN_SECONDS};
    }
    return {...view,revealInProgress:false,revealCardsRemaining:0,
      rebuyQueued:this.pendingRebuys.has(id),pendingBotAdds:this.pendingBotAdds.reduce((n,x)=>n+x.count,0),
      pendingBotRemovals:this.pendingBotRemovals,
      turnDeadline:this.turnDeadline,turnSeconds:TURN_SECONDS,
      turnRemainingMs:Math.max(0,this.turnDeadline-Date.now()),nextHandRemainingMs:Math.max(0,this.nextHandAt-Date.now())};
  }
  private sync(){
    this.scheduleTurn();
    this.scheduleNextHand();
    for(const c of this.clients)c.send('snapshot',this.snapshot(c.sessionId));
    this.scheduleBot();
  }
  private cancelNextHand(){
    if(this.nextHandTimer)clearTimeout(this.nextHandTimer);
    this.nextHandTimer=undefined;this.nextHandAt=0;this.nextHandKey=0;
  }
  private scheduleNextHand(){
    if(this.isRevealing())return;
    if(this.game.street!=='showdown'){this.cancelNextHand();return;}
    // Never auto-start with fewer than two eligible participants.
    const available=this.game.players.filter(p=>p.connected&&p.stack>0).length+
      this.pendingBotAdds.reduce((n,x)=>n+x.count,0)+this.pendingRebuys.size-this.pendingBotRemovals;
    if(available<2){this.cancelNextHand();return;}
    if(this.nextHandKey===this.game.handNo)return;
    this.cancelNextHand();
    this.nextHandKey=this.game.handNo;
    this.nextHandAt=Date.now()+NEXT_HAND_DELAY_MS;
    this.nextHandTimer=setTimeout(()=>{
      this.nextHandTimer=undefined;this.nextHandAt=0;
      if(this.game.street!=='showdown'||this.game.handNo!==this.nextHandKey)return;
      this.applyPendingChanges();
      const ready=this.game.players.filter(p=>p.connected&&p.stack>0);
      if(ready.length>=2){
        try{this.game.start();}catch(e){console.error('Auto next hand error',e);}
      }
      this.sync();
    },NEXT_HAND_DELAY_MS);
  }
  private isRevealing(){return this.revealHand===this.game.handNo && this.revealCount<this.revealTotal;}
  private startAllInRevealIfNeeded(boardBefore:number,stackBefore:Map<string,number>){
    if(this.game.street!=='showdown'||this.game.board.length<=boardBefore)return;
    if(this.game.players.filter(p=>p.hole.length===2&&!p.folded).length<2)return;
    this.previousStacksDuringReveal=stackBefore;
    this.revealHand=this.game.handNo;
    this.revealBase=boardBefore;this.revealCount=boardBefore;
    this.revealTotal=this.game.board.length;
    this.queueNextReveal();
  }
  private queueNextReveal(){
    if(this.revealTimer)clearTimeout(this.revealTimer);
    if(!this.isRevealing())return;
    const hand=this.revealHand;
    this.revealTimer=setTimeout(()=>{
      if(this.game.handNo!==hand)return;
      this.revealCount++;
      if(this.isRevealing())this.queueNextReveal();
      this.sync();
    },ALLIN_CARD_DELAY_MS);
  }
  private addBots(count:number,level:Difficulty){
    for(let i=0;i<count&&this.game.players.length<MAX_PLAYERS;i++){
      const n=++this.botSerial,id=`bot-${this.roomId}-${n}`;
      this.game.add(id,`AI ${n} (${level==='easy'?'쉬움':level==='hard'?'어려움':'보통'})`);
      this.botLevels.set(id,level);
    }
  }
  private removeOneBot(){
    const p=[...this.game.players].reverse().find(x=>this.botLevels.has(x.id));
    if(p){this.botLevels.delete(p.id);this.game.players=this.game.players.filter(x=>x.id!==p.id);}
  }
  private applyPendingChanges(){
    if(this.game.active()||this.isRevealing())return;
    for(const id of this.pendingRebuys){
      const p=this.game.players.find(x=>x.id===id);
      if(p?.connected&&p.stack===0){try{this.game.rebuy(id);}catch(err){console.error('Rebuy error',err);}}
    }
    this.pendingRebuys.clear();
    for(let i=0;i<this.pendingBotRemovals;i++)this.removeOneBot();
    this.pendingBotRemovals=0;
    for(const request of this.pendingBotAdds)this.addBots(request.count,request.difficulty);
    this.pendingBotAdds=[];
  }
  private scheduleTurn(){
    const p=this.game.players.find(p=>p.seat===this.game.turn);
    const key=this.game.active()&&!this.isRevealing()&&p?`${this.game.handNo}:${this.game.street}:${this.game.turn}:${this.game.log[0]??''}`:'';
    if(key===this.turnKey)return;
    if(this.turnTimer)clearTimeout(this.turnTimer);
    this.turnTimer=undefined;this.turnKey=key;
    this.turnDeadline=key?Date.now()+TURN_SECONDS*1000:0;
    if(!key||!p)return;
    const actor=p.id;
    this.turnTimer=setTimeout(()=>{
      if(this.turnKey!==key||!this.game.active())return;
      const current=this.game.players.find(x=>x.seat===this.game.turn);
      if(!current||current.id!==actor)return;
      try{
        // Timed-out human and bot seats always fold, even when checking was free.
        this.game.action(actor,'fold');
        this.sync();
      }catch(err){console.error('Turn timer error',err);}
    },TURN_SECONDS*1000);
  }
  private scheduleBot(){
    if(this.botTimer)clearTimeout(this.botTimer);
    this.botTimer=undefined;
    if(!this.game.active()||this.isRevealing())return;
    const p=this.game.players.find(p=>p.seat===this.game.turn);
    if(!p||!this.botLevels.has(p.id))return;
    const botId=p.id;
    this.botTimer=setTimeout(()=>{
      this.botTimer=undefined;
      const actor=this.game.players.find(x=>x.id===botId);
      if(!actor||!this.game.active()||actor.seat!==this.game.turn)return;
      try{
        const before=this.game.board.length;
        const stacks=new Map(this.game.players.map(p=>[p.id,p.stack]));
        const decision=decideBot(actor,this.game.board,this.game.currentBet,this.game.minRaise,this.botLevels.get(botId)??'medium',Math.random,{pot:this.game.view(botId).totalPot,opponents:this.game.players.filter(p=>p.id!==botId&&p.hole.length===2&&!p.folded).length});
        try{this.game.action(botId,decision.move,decision.amount);}catch{
          this.game.action(botId,this.game.currentBet>actor.streetBet?'call':'check');
        }
        this.startAllInRevealIfNeeded(before,stacks);
        this.sync();
      }catch(err){console.error('Bot action error',err);}
    },450+Math.floor(Math.random()*1800));
  }
  private safe(client:Client,fn:()=>void){try{fn();}catch(err){client.send('gameError',err instanceof Error?err.message:'처리 오류');}}
}
