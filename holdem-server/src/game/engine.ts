import { newDeck, bestOfSeven, compareRanks, HAND_NAMES, type Card } from './cards.js';
export type Move = 'fold'|'check'|'call'|'raise'|'allin';
export type Street = 'waiting'|'preflop'|'flop'|'turn'|'river'|'showdown';
export interface Player {id:string;name:string;seat:number;stack:number;hole:Card[];folded:boolean;allIn:boolean;streetBet:number;totalBet:number;acted:boolean;raiseRights:boolean;connected:boolean;}
export interface Pot {amount:number;eligible:string[];}
export class Holdem {
  players:Player[]=[]; street:Street='waiting'; board:Card[]=[]; deck:Card[]=[];
  dealer=-1; turn=-1; currentBet=0; minRaise=100; smallBlind=50; bigBlind=100;
  handNo=0; log:string[]=[]; reveal:Record<string,Card[]>={}; lastPots:Pot[]=[];
  result:{winners:{id:string;name:string;amount:number;handName:string}[]}|null=null;
  add(id:string,name:string) {
    if(this.players.some(p=>p.id===id)) throw new Error('이미 참여한 플레이어');
    if(this.players.length>=6)throw new Error('최대 6명');
    const occupied=new Set(this.players.map(p=>p.seat));
    const seat=[0,1,2,3,4,5].find(s=>!occupied.has(s))!;
    this.players.push({id,name:name.slice(0,14)||'Player',seat,stack:10000,hole:[],folded:true,allIn:false,streetBet:0,totalBet:0,acted:false,raiseRights:false,connected:true});
    this.players.sort((a,b)=>a.seat-b.seat);
  }
  remove(id:string) {
    const p=this.players.find(p=>p.id===id); if(!p)return;
    p.connected=false;
    if(this.active() && p.hole.length && !p.folded) {
      p.folded=true; p.acted=true; p.raiseRights=false;
      this.log.unshift(`${p.name} 연결 종료 · 폴드`);this.advance();
    }
    // Keep occupied seats and chip stacks until the game is no longer active.
    if(!this.active())this.players=this.players.filter(x=>x.connected);
  }
  active(){return this.street!=='waiting'&&this.street!=='showdown';}
  private eligible(){return this.players.filter(p=>p.connected&&p.stack>0);}
  private nextSeat(from:number,predicate:(p:Player)=>boolean):Player|undefined {
    for(let i=1;i<=6;i++) {
      const seat=(from+i+6)%6;const p=this.players.find(p=>p.seat===seat);
      if(p&&predicate(p))return p;
    }
  }
  private bet(p:Player,amount:number) {
    if(!Number.isSafeInteger(amount)||amount<0||amount>p.stack)throw new Error('잘못된 베팅');
    p.stack-=amount;p.streetBet+=amount;p.totalBet+=amount;
    if(!p.stack)p.allIn=true;
  }
  start():void {
    if(this.active())throw new Error('이미 진행 중');
    this.players=this.players.filter(p=>p.connected);
    const ready=this.eligible();
    if(ready.length<2)throw new Error('칩이 남은 참가자가 최소 2명 필요');
    this.handNo++;this.street='preflop';this.board=[];this.deck=newDeck();this.log=[];this.reveal={};this.lastPots=[];this.result=null;
    this.dealer=this.nextSeat(this.dealer,p=>p.connected&&p.stack>0)!.seat;
    for(const p of this.players) {
      p.hole=[];p.folded=!(p.connected&&p.stack>0);p.allIn=false;
      p.streetBet=0;p.totalBet=0;p.acted=false;p.raiseRights=!p.folded;
    }
    // Round-robin dealing; only participating players get cards.
    for(let r=0;r<2;r++) for(let i=1;i<=6;i++) {
      const p=this.players.find(p=>p.seat===(this.dealer+i)%6);
      if(p&&!p.folded)p.hole.push(this.deck.pop()!);
    }
    const sb=ready.length===2?this.players.find(p=>p.seat===this.dealer)!:this.nextSeat(this.dealer,p=>!p.folded)!;
    const bb=this.nextSeat(sb.seat,p=>!p.folded)!;
    this.bet(sb,Math.min(this.smallBlind,sb.stack));this.bet(bb,Math.min(this.bigBlind,bb.stack));
    // BB option remains valid even if the BB is posted for less than a full blind.
    this.currentBet=this.bigBlind;this.minRaise=this.bigBlind;
    this.turn=bb.seat;
    this.log.unshift(`핸드 #${this.handNo} 시작 · 블라인드 ${this.smallBlind}/${this.bigBlind}`);
    this.advance();
  }
  private canAct(p:Player){return !p.folded&&!p.allIn&&p.connected;}
  private remaining(){return this.players.filter(p=>p.hole.length&&!p.folded);}
  private needsAction(p:Player){return this.canAct(p)&&(!p.acted||p.streetBet!==this.currentBet);}
  action(id:string,move:Move,amount?:number) {
    if(!this.active())throw new Error('진행 중인 핸드가 없음');
    const p=this.players.find(p=>p.id===id);
    if(!p||p.seat!==this.turn||!this.canAct(p))throw new Error('현재 자신의 차례가 아님');
    const toCall=Math.max(0,this.currentBet-p.streetBet);
    const oldBet=this.currentBet;
    if(move==='fold'){p.folded=true;p.acted=true;p.raiseRights=false;}
    else if(move==='check'){
      if(toCall!==0)throw new Error('콜이 필요해 체크 불가');p.acted=true;p.raiseRights=false;
    }else if(move==='call'){
      if(toCall===0)throw new Error('체크 가능');this.bet(p,Math.min(toCall,p.stack));p.acted=true;p.raiseRights=false;
    }else if(move==='raise'||move==='allin'){
      const target=move==='allin'?p.streetBet+p.stack:amount;
      if(!Number.isSafeInteger(target)||target===undefined)throw new Error('총 베팅 금액을 정수로 입력');
      if(target<=this.currentBet){
        if(move!=='allin'||target!==p.streetBet+p.stack)throw new Error('레이즈 금액 부족');
        this.bet(p,p.stack);p.acted=true;p.raiseRights=false;
      }else{
        if(!p.raiseRights)throw new Error('숏 올인 이후 재레이즈 권한 없음');
        const increment=target-this.currentBet;
        const full=increment>=this.minRaise;
        const isTrueAllIn=target===p.streetBet+p.stack;
        if(!full&&!isTrueAllIn)throw new Error(`최소 총 베팅액: ${this.currentBet+this.minRaise}`);
        if(target>p.streetBet+p.stack)throw new Error('보유 칩 부족');
        this.bet(p,target-p.streetBet);
        this.currentBet=target;
        if(full){this.minRaise=increment;for(const other of this.players)if(other.id!==p.id&&this.canAct(other)){other.acted=false;other.raiseRights=true;}}
        // A short all-in does not reopen betting to players who already acted.
        p.acted=true;p.raiseRights=false;
      }
    }else throw new Error('알 수 없는 행동');
    this.log.unshift(`${p.name}: ${move}${this.currentBet>oldBet?' '+this.currentBet:''}`);
    this.advance();
  }
  private advance(){
    if(!this.active())return;
    if(this.remaining().length===1){this.settle();return;}
    // No one may continue betting if there are <=1 actionable players and all others are all-in.
    const actionable=this.players.filter(p=>this.canAct(p)&&p.hole.length);
    const pending=this.players.filter(p=>this.needsAction(p)&&p.hole.length>0);
    if(actionable.length<=1 && (!actionable.length || actionable[0].streetBet>=this.currentBet)) {
      this.runout();return;
    }
    if(pending.length===0){this.nextStreet();return;}
    const next=this.nextSeat(this.turn<0?this.dealer:this.turn,p=>this.needsAction(p)&&p.hole.length>0);
    this.turn=next?.seat??-1;
  }
  private nextStreet(){
    for(const p of this.players){p.streetBet=0;p.acted=false;p.raiseRights=!p.folded&&!p.allIn;}
    this.currentBet=0;this.minRaise=this.bigBlind;
    if(this.street==='preflop'){this.burn();this.board.push(this.deck.pop()!,this.deck.pop()!,this.deck.pop()!);this.street='flop';}
    else if(this.street==='flop'){this.burn();this.board.push(this.deck.pop()!);this.street='turn';}
    else if(this.street==='turn'){this.burn();this.board.push(this.deck.pop()!);this.street='river';}
    else {this.settle();return;}
    this.turn=this.dealer;
    this.log.unshift(`${this.street.toUpperCase()} 공개`);
    this.advance();
  }
  private burn(){this.deck.pop();}
  private runout(){
    while(this.active()) {
      if(this.street==='river'){this.settle();break;}
      // Advance to the next street; no extra betting action should be requested.
      if(this.street==='preflop'){this.burn();this.board.push(this.deck.pop()!,this.deck.pop()!,this.deck.pop()!);this.street='flop';}
      else if(this.street==='flop'){this.burn();this.board.push(this.deck.pop()!);this.street='turn';}
      else if(this.street==='turn'){this.burn();this.board.push(this.deck.pop()!);this.street='river';}
    }
  }
  private pots():Pot[]{
    let prev=0; const result:Pot[]=[];
    const levels=[...new Set(this.players.map(p=>p.totalBet).filter(v=>v>0))].sort((a,b)=>a-b);
    for(const level of levels){
      const contributors=this.players.filter(p=>p.totalBet>=level);
      const amount=(level-prev)*contributors.length;
      if(amount>0)result.push({amount,eligible:contributors.filter(p=>!p.folded).map(p=>p.id)});
      prev=level;
    }
    return result;
  }
  private settle(){
    const survivors=this.remaining();
    if(survivors.length>1&&this.board.length!==5)throw new Error('보드 5장 필요');
    const scores=new Map<string,number[]>();
    for(const p of survivors){if(this.board.length===5)scores.set(p.id,bestOfSeven([...p.hole,...this.board]));this.reveal[p.id]=[...p.hole];}
    const pots=this.pots();this.lastPots=pots;
    const paid=new Map<string,{id:string;name:string;amount:number;handName:string}>();
    for(const pot of pots) {
      const eligible=survivors.filter(p=>pot.eligible.includes(p.id));
      if(eligible.length===0)throw new Error('팟 정산 오류');
      let winners=eligible;
      if(eligible.length>1){
        const best=eligible.map(p=>scores.get(p.id)!).sort((a,b)=>compareRanks(b,a))[0];
        winners=eligible.filter(p=>compareRanks(scores.get(p.id)!,best)===0);
      }
      const each=Math.floor(pot.amount/winners.length);let odd=pot.amount%winners.length;
      // Odd chips go clockwise from the button.
      winners.sort((a,b)=>((a.seat-this.dealer+6)%6)-((b.seat-this.dealer+6)%6));
      for(const p of winners){
        const payment=each+(odd>0?1:0);p.stack+=payment;if(odd>0)odd--;
        const record=paid.get(p.id)||{id:p.id,name:p.name,amount:0,handName:scores.has(p.id)?HAND_NAMES[scores.get(p.id)![0]]:'상대 폴드'};
        record.amount+=payment;paid.set(p.id,record);
      }
      this.log.unshift(`${winners.map(p=>p.name).join(', ')} +${pot.amount}칩${eligible.length>1?' · '+HAND_NAMES[scores.get(winners[0].id)![0]]:''}`);
    }
    this.result={winners:[...paid.values()]};
    this.street='showdown';this.turn=-1;this.currentBet=0;
    const total=this.players.reduce((s,p)=>s+p.stack,0);
    if(total!==this.players.length*10000) {
      // Disconnected players are deliberately retained through settlement.
      throw new Error(`칩 보존 오류: ${total}`);
    }
  }
  view(forId:string){
    return {
      street:this.street,board:this.board,dealer:this.dealer,turn:this.turn,currentBet:this.currentBet,minRaise:this.minRaise,
      bigBlind:this.bigBlind,handNo:this.handNo,log:this.log.slice(0,12),pots:this.active()?this.pots():this.lastPots,result:this.result,
      totalPot:this.players.reduce((sum,p)=>sum+p.totalBet,0),
      players:this.players.map(p=>({id:p.id,name:p.name,seat:p.seat,stack:p.stack,folded:p.folded,allIn:p.allIn,streetBet:p.streetBet,totalBet:p.totalBet,connected:p.connected,
        hole:p.id===forId?p.hole:(this.street==='showdown'?this.reveal[p.id]||[]:[]),cardsCount:p.hole.length})),
      you:forId
    };
  }
}
