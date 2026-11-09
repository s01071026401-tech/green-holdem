export type Street='waiting'|'preflop'|'flop'|'turn'|'river'|'showdown';
export type Move='fold'|'check'|'call'|'raise'|'allin';
export type PlayerView={id:string;name:string;seat:number;stack:number;folded:boolean;allIn:boolean;streetBet:number;totalBet:number;connected:boolean;hole:string[];cardsCount:number;};
export type Snapshot={street:Street;board:string[];dealer:number;turn:number;currentBet:number;minRaise:number;bigBlind:number;handNo:number;log:string[];pots:{amount:number;eligible:string[]}[];totalPot:number;players:PlayerView[];you:string;};
