import {Room, type Client} from 'colyseus';
import {Holdem, MAX_PLAYERS, type Move} from '../game/engine.js';
import {decideBot, type Difficulty} from './botStrategy.js';
const TURN_SECONDS=30;
const RECONNECT_SECONDS=45;
const validDifficulty=(x:unknown):x is Difficulty=>x==='easy'||x==='medium'||x==='hard';
export class HoldemRoom extends Room {
  maxClients=MAX_PLAYERS;
  game=new Holdem();
  private botSerial=0;
  private botLevels=new Map<string,Difficulty>();
  private botTimer:ReturnType<typeof setTimeout>|undefined;
  private turnTimer:ReturnType<typeof setTimeout>|undefined;
  private turnDeadline=0;
  private turnKey='';
  onCreate(){
    this.setPrivate(true);
    this.onMessage('addBot',(client,msg:{count?:number;difficulty?:Difficulty}|undefined)=>this.safe(client,()=>{
      if(this.game.active())throw new Error('핸드 진행 중에는 봇을 추가할 수 없습니다');
      const count=msg?.count??1;
      if(!Number.isInteger(count)||count<1||count>6)throw new Error('AI 수는 1~6명');
      const level=validDifficulty(msg?.difficulty)?msg!.difficulty!:'medium';
      for(let i=0;i<count&&this.game.players.length<MAX_PLAYERS;i++){
        const n=++this.botSerial,id=`bot-${this.roomId}-${n}`;
        this.game.add(id,`AI ${n} (${level==='easy'?'쉬움':level==='hard'?'어려움':'보통'})`);
        this.botLevels.set(id,level);
      }
      this.sync();
    }));
    this.onMessage('start',client=>this.safe(client,()=>{if(this.game.active())throw new Error('게임 진행 중');this.game.start();this.sync()}));
    this.onMessage('move',(client,msg:{move:Move;amount?:number})=>this.safe(client,()=>{
      if(!msg||!['fold','check','call','raise','allin'].includes(msg.move))throw new Error('잘못된 행동');
      this.game.action(client.sessionId,msg.move,msg.amount);this.sync();
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
  onDispose(){if(this.botTimer)clearTimeout(this.botTimer);if(this.turnTimer)clearTimeout(this.turnTimer);}
  private snapshot(id:string){return {...this.game.view(id),turnDeadline:this.turnDeadline,turnSeconds:TURN_SECONDS,turnRemainingMs:Math.max(0,this.turnDeadline-Date.now())};}
  private sync(){
    this.scheduleTurn();
    for(const c of this.clients)c.send('snapshot',this.snapshot(c.sessionId));
    this.scheduleBot();
  }
  private scheduleTurn(){
    const p=this.game.players.find(p=>p.seat===this.game.turn);
    const key=this.game.active()&&p?`${this.game.handNo}:${this.game.street}:${this.game.turn}:${this.game.log[0]??''}`:'';
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
        this.game.action(actor,this.game.currentBet>current.streetBet?'fold':'check');
        this.sync();
      }catch(err){console.error('Turn timer error',err);}
    },TURN_SECONDS*1000);
  }
  private scheduleBot(){
    if(this.botTimer)clearTimeout(this.botTimer);
    this.botTimer=undefined;
    if(!this.game.active())return;
    const p=this.game.players.find(p=>p.seat===this.game.turn);
    if(!p||!this.botLevels.has(p.id))return;
    const botId=p.id;
    this.botTimer=setTimeout(()=>{
      this.botTimer=undefined;
      const actor=this.game.players.find(x=>x.id===botId);
      if(!actor||!this.game.active()||actor.seat!==this.game.turn)return;
      try{
        const decision=decideBot(actor,this.game.board,this.game.currentBet,this.game.minRaise,this.botLevels.get(botId)??'medium');
        try{this.game.action(botId,decision.move,decision.amount);}catch{
          this.game.action(botId,this.game.currentBet>actor.streetBet?'call':'check');
        }
        this.sync();
      }catch(err){console.error('Bot action error',err);}
    },650+Math.floor(Math.random()*750));
  }
  private safe(client:Client,fn:()=>void){try{fn();}catch(err){client.send('gameError',err instanceof Error?err.message:'처리 오류');}}
}
