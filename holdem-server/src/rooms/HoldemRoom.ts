import { Room, type Client } from 'colyseus';
import { Holdem, type Move } from '../game/engine.js';

/** Server-side practice opponents. Bots are never Colyseus clients. */
export class HoldemRoom extends Room {
  maxClients = 6;
  game = new Holdem();
  private botSerial = 0;
  private botTimer: ReturnType<typeof setTimeout> | undefined;

  onCreate() {
    this.setPrivate(true);
    this.onMessage('addBot', (client, msg: { count?: number } | undefined) => this.safe(client, () => {
      if (this.game.active()) throw new Error('핸드 진행 중에는 봇을 추가할 수 없습니다');
      const count = msg?.count ?? 1;
      if (!Number.isInteger(count) || count < 1 || count > 5) throw new Error('AI 수는 1~5명');
      for (let i = 0; i < count; i++) {
        if (this.game.players.length >= 6) break;
        const next = ++this.botSerial;
        this.game.add(`bot-${this.roomId}-${next}`, `AI ${next}`);
      }
      this.sync();
    }));
    this.onMessage('start', (client) => this.safe(client, () => {
      if (this.game.active()) throw new Error('게임 진행 중');
      this.game.start(); this.sync();
    }));
    this.onMessage('move', (client, msg: { move: Move; amount?: number }) => this.safe(client, () => {
      if (!msg || !['fold','check','call','raise','allin'].includes(msg.move)) throw new Error('잘못된 행동');
      this.game.action(client.sessionId, msg.move, msg.amount); this.sync();
    }));
    this.onMessage('refresh', (client) => client.send('snapshot', this.game.view(client.sessionId)));
  }

  onJoin(client: Client, options: { name?: string }) {
    this.game.add(client.sessionId, typeof options?.name === 'string' ? options.name : 'Player');
    this.sync();
  }
  onLeave(client: Client) { this.game.remove(client.sessionId); this.sync(); }
  onDispose() { if (this.botTimer) clearTimeout(this.botTimer); }

  private sync() {
    for (const c of this.clients) c.send('snapshot', this.game.view(c.sessionId));
    this.scheduleBot();
  }

  private scheduleBot() {
    if (this.botTimer) clearTimeout(this.botTimer);
    this.botTimer = undefined;
    if (!this.game.active()) return;
    const p = this.game.players.find(p => p.seat === this.game.turn);
    if (!p?.id.startsWith(`bot-${this.roomId}-`)) return;
    const botId = p.id;
    this.botTimer = setTimeout(() => {
      this.botTimer = undefined;
      try {
        const acting = this.game.players.find(x => x.id === botId);
        if (!this.game.active() || !acting || acting.seat !== this.game.turn) return;
        const toCall = Math.max(0, this.game.currentBet - acting.streetBet);
        const action: Move = toCall === 0 ? 'check' :
          toCall > acting.stack * 0.4 && Math.random() < 0.65 ? 'fold' : 'call';
        this.game.action(botId, action);
        this.sync();
      } catch (err) {
        console.error('Bot action error', err);
      }
    }, 500 + Math.floor(Math.random() * 700));
  }
  private safe(client: Client, fn: () => void) {
    try { fn(); } catch (err) { client.send('gameError', err instanceof Error ? err.message : '처리 오류'); }
  }
}
