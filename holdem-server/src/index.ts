import { defineServer, defineRoom } from 'colyseus';
import { HoldemRoom } from './rooms/HoldemRoom.js';
const port=Number(process.env.PORT)||2567;
const server=defineServer({rooms:{holdem:defineRoom(HoldemRoom)},express:(app)=>{
  app.get('/', (_req: any, res: any) => {
    res.json({ ok: true, service: 'holdem-server' });
});
}});
server.listen(port);
console.log(`Holdem Colyseus listening on http://0.0.0.0:${port}`);
