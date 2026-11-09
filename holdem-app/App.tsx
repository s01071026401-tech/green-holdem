import React, {useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator, Alert, Animated, Easing, KeyboardAvoidingView, Platform, SafeAreaView,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
  useWindowDimensions,
} from 'react-native';
import {Client, type Room} from '@colyseus/sdk';
import {StatusBar} from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useAudioPlayer} from 'expo-audio';
import {BetSizing, pickRaise, type BetPreset} from './src/components/BetSizing';
import {ShowdownBanner} from './src/components/ShowdownBanner';
import {TurnClock} from './src/components/TurnClock';
import type {Snapshot, Move, PlayerView} from './src/types';
import {estimateEquity, bestSeven, type EquityResult} from './src/game/equity';

// 검증된 온라인 서버 주소를 유지합니다.
const SERVER = 'https://green-holdem-server.onrender.com';
const SESSION_KEY = 'greenholdem-reconnect-v05';
const C = {
  bg: '#07130F', surface: '#10241C', elevated: '#17352A',
  felt: '#08633C', feltInner: '#087548', rail: '#704B29',
  railLight: '#AD8753', gold: '#EAC77E', goldBright: '#F7DC9A',
  ivory: '#F8F5E9', muted: '#9DBBAB', line: '#2D5744',
  red: '#D7565D', blue: '#3979A3', green: '#247D54',
};
const ranks: Record<string, string> = {T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A'};
const suits: Record<string, string> = {s: '♠', h: '♥', d: '♦', c: '♣'};
const cardText = (code: string) => code ? `${ranks[code[0]] ?? code[0]}${suits[code[1]] ?? ''}` : '';
const formatChips = (n: number) => (n ?? 0).toLocaleString();
const handNames = ['하이카드', '원페어', '투페어', '트리플', '스트레이트', '플러시', '풀하우스', '포카드', '스트레이트 플러시'];
// The label describes the player's CURRENT made hand, not a predicted future hand.
function currentHandName(hole: string[], board: string[]): string | null {
  if (hole.length !== 2) return null;
  const cards = [...hole, ...board];
  if (cards.length === 2) return hole[0][0] === hole[1][0] ? '포켓 페어 (원페어)' : '하이카드';
  if (cards.length < 5 || cards.length > 7) return null;
  return handNames[bestSeven(cards)[0]] ?? null;
}

type ButtonTone = 'gold' | 'green' | 'outline' | 'red' | 'blue';
function Button({title, onPress, disabled = false, tone = 'gold', compact = false}: {
  title: string; onPress: () => void; disabled?: boolean; tone?: ButtonTone; compact?: boolean;
}) {
  return (
    <TouchableOpacity activeOpacity={0.8} accessibilityRole="button" onPress={onPress} disabled={disabled}
      style={[styles.button, styles[`button_${tone}`], compact && styles.buttonCompact, disabled && styles.disabled]}>
      <Text style={[styles.buttonText, tone === 'gold' && styles.buttonTextDark, compact && styles.buttonTextCompact]}>{title}</Text>
    </TouchableOpacity>
  );
}
function PlayingCard({code, back = false, small = false}: {code?: string; back?: boolean; small?: boolean}) {
  const isRed = code?.endsWith('h') || code?.endsWith('d');
  return (
    <View style={[styles.playCard, small && styles.playCardSmall, back && styles.playCardBack, !code && !back && styles.playCardEmpty]}>
      {back ? <Text style={[styles.playCardBackText, small && {fontSize: 14}]}>♠</Text>
        : code ? <Text style={[styles.playCardText, small && {fontSize: 14}, isRed && {color: '#BE3042'}]}>{cardText(code)}</Text>
          : <Text style={styles.playCardPlaceholder}>·</Text>}
    </View>
  );
}
// Cards animate only when actually dealt / revealed, not on every state update.
function DealtCard({code, order, small = false, back = false}: {code?: string; order: number; small?: boolean; back?: boolean}) {
  const drop = useRef(new Animated.Value(-125)).current;
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    drop.setValue(-125); fade.setValue(0);
    const motion = Animated.parallel([
      Animated.timing(drop, {toValue: 0, duration: 460, delay: order * 160, easing: Easing.out(Easing.cubic), useNativeDriver: true}),
      Animated.timing(fade, {toValue: 1, duration: 250, delay: order * 160, useNativeDriver: true}),
    ]);
    motion.start();
    return () => motion.stop();
  }, [code, back, order, drop, fade]);
  return <Animated.View style={{transform: [{translateY: drop}], opacity: fade}}><PlayingCard code={code} back={back} small={small}/></Animated.View>;
}
// A single, native-driven 3D flip. Animate only when a NEW board card arrives.
// The back stays visible during the first half; the face appears after 90°.
function RevealCard({code, order, compact = false}: {code?: string; order: number; compact?: boolean}) {
  const rotation = useRef(new Animated.Value(0)).current;
  const [shownCode, setShownCode] = useState(code);
  useEffect(() => {
    if (!code) {
      rotation.stopAnimation();
      rotation.setValue(0);
      setShownCode(undefined);
      return;
    }
    setShownCode(code);
    rotation.stopAnimation();
    rotation.setValue(0);
    const motion = Animated.timing(rotation, {
      toValue: 1,
      duration: 760,
      // The flop comes out in a short cascade; turn/river flip immediately.
      delay: order * 130,
      easing: Easing.bezier(0.22, 0.61, 0.36, 1),
      useNativeDriver: true,
    });
    motion.start();
    return () => motion.stop();
  }, [code, order, rotation]);
  const frontTurn = rotation.interpolate({inputRange: [0, 1], outputRange: ['-180deg', '0deg']});
  const backTurn = rotation.interpolate({inputRange: [0, 1], outputRange: ['0deg', '180deg']});
  const lift = rotation.interpolate({inputRange: [0, 0.5, 1], outputRange: [0, -5, 0]});
  const shadow = rotation.interpolate({inputRange: [0, 0.5, 1], outputRange: [0.96, 1.035, 1]});
  if (!code) return <View style={compact ? styles.communityCardCompact : undefined}><View style={compact ? {transform: [{scale: 0.78}]} : undefined}><PlayingCard/></View></View>;
  return <Animated.View style={{width: compact ? 34 : 43, height: compact ? 48 : 61, transform: [{translateY: lift}, {scale: shadow}]}}>
    <Animated.View style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      backfaceVisibility: 'hidden', transform: [{perspective: 900}, {rotateY: backTurn}]}}>
      <View style={compact ? styles.communityCardCompact : undefined}><View style={compact ? {transform: [{scale: 0.78}]} : undefined}><PlayingCard back/></View></View>
    </Animated.View>
    <Animated.View style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      backfaceVisibility: 'hidden', transform: [{perspective: 900}, {rotateY: frontTurn}]}}>
      <View style={compact ? styles.communityCardCompact : undefined}><View style={compact ? {transform: [{scale: 0.78}]} : undefined}><PlayingCard code={shownCode}/></View></View>
    </Animated.View>
  </Animated.View>;
}

function ChipPile({large = false}: {large?: boolean}) {
  return <View style={{height: large ? 26 : 19, width: large ? 62 : 42, justifyContent: 'center', alignItems: 'center'}}>
    {[2, 1, 0].map(i => <View key={i} style={{position: 'absolute', bottom: 3 + i * (large ? 5 : 4),
      width: large ? 42 : 29, height: large ? 15 : 11, borderRadius: 50,
      backgroundColor: i === 0 ? '#DDB958' : '#EDDC9A', borderWidth: 2,
      borderColor: '#704C2A', transform: [{translateX: i % 2 ? 5 : -2}]}}/>)}
  </View>;
}
type FlyingChip = {id: number; playerId: string; reverse: boolean};
function MovingChip({fromX, fromY, toX, toY, onDone}: {
  fromX: number; fromY: number; toX: number; toY: number; onDone: () => void;
}) {
  const movement = useRef(new Animated.Value(0)).current;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    const animation = Animated.timing(movement, {toValue: 1, duration: 620,
      easing: Easing.inOut(Easing.cubic), useNativeDriver: true});
    animation.start(({finished}) => {if (finished) doneRef.current();});
    return () => animation.stop();
  }, [movement]);
  return <Animated.View pointerEvents="none" style={{position: 'absolute', left: fromX, top: fromY,
    zIndex: 40, opacity: movement.interpolate({inputRange: [0, 0.8, 1], outputRange: [1, 1, 0]}),
    transform: [{translateX: movement.interpolate({inputRange: [0, 1], outputRange: [0, toX - fromX]})},
      {translateY: movement.interpolate({inputRange: [0, 1], outputRange: [0, toY - fromY]})}]}}>
    <View style={{height: 21, width: 21, borderRadius: 11, borderWidth: 4, borderColor: '#FCE3A2', backgroundColor: '#BD8B37'}}/>
  </Animated.View>;
}

function SectionLabel({children}: {children: React.ReactNode}) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}
function PlayerSeat({p, dealer, turn, mine, width = 93, blind, handNo = 0}: {
  p: PlayerView; dealer: boolean; turn: boolean; mine: boolean; width?: number; blind?: 'SB' | 'BB'; handNo?: number;
}) {
  return (
    <View style={[styles.seat, {width}, turn && styles.seatTurn, mine && styles.seatMine, p.folded && styles.seatFolded]}>
      <View style={styles.seatHeader}>
        <View style={[styles.seatDot, {backgroundColor: mine ? C.gold : p.connected ? '#55C58C' : '#9B8D8D'}]}/>
        <Text style={styles.seatName} numberOfLines={1}>{p.name}</Text>
        {dealer ? <Text style={styles.dealerBadge}>D</Text> : null}
        {blind ? <Text style={styles.blindBadge}>{blind}</Text> : null}
      </View>
      <Text style={styles.seatStack}>◉ {formatChips(p.stack)}</Text>
      <Text style={styles.seatMeta} numberOfLines={1}>{p.allIn ? 'ALL-IN' : p.folded ? 'FOLD' : !p.connected ? 'OFFLINE' : `베팅 ${formatChips(p.streetBet)}`}</Text>
      <View style={styles.seatCards}>
        {p.hole.length ? p.hole.map((c, i) => <DealtCard key={`${handNo}-${i}`} code={c} order={i} small />)
          : p.cardsCount > 0 ? [0, 1].map(i => <DealtCard key={`${handNo}-${i}`} back small order={i} />) : null}
      </View>
    </View>
  );
}

export default function App() {
  const {width: screenWidth, height: screenHeight} = useWindowDimensions();
  const [name, setName] = useState('Player' + Math.floor(Math.random() * 900 + 100));
  const [code, setCode] = useState('');
  const [room, setRoom] = useState<Room | null>(null);
  const roomRef = useRef<Room | null>(null);
  const [state, setState] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [raise, setRaise] = useState('200');
  const [aiDifficulty, setAiDifficulty] = useState<'easy'|'medium'|'hard'>('medium');
  const [connected, setConnected] = useState(true);
  const [reconnectBusy, setReconnectBusy] = useState(false);
  const resumeToken = useRef<string | null>(null);
  const [hasResumeToken,setHasResumeToken]=useState(false);
  const [deadline, setDeadline] = useState<number>(0);
  // Effects are original local WAV assets: no external download at runtime.
  const dealSound = useAudioPlayer(require('./assets/sounds/deal.wav'));
  const turnSound = useAudioPlayer(require('./assets/sounds/turn.wav'));
  const actionSound = useAudioPlayer(require('./assets/sounds/action.wav'));
  const winSound = useAudioPlayer(require('./assets/sounds/win.wav'));
  const [soundEnabled, setSoundEnabled] = useState(true);
  const soundEnabledRef = useRef(true);
  const lastSoundSnapshot = useRef<Snapshot | null>(null);
  const playEffect = (kind: 'deal' | 'turn' | 'action' | 'win') => {
    if (!soundEnabledRef.current) return;
    const player = kind === 'deal' ? dealSound : kind === 'turn' ? turnSound : kind === 'action' ? actionSound : winSound;
    void player.seekTo(0).then(() => player.play()).catch(() => {});
  };
  const setSound = (enabled: boolean) => { soundEnabledRef.current = enabled; setSoundEnabled(enabled); };


  const attachRoom = (joined:Room) => {
    lastSoundSnapshot.current = null;
    roomRef.current = joined;
    setRoom(joined);
    setConnected(true);
    const saveToken=()=>{
      const token=joined.reconnectionToken;
      if(token){resumeToken.current=token;setHasResumeToken(true);void AsyncStorage.setItem(SESSION_KEY,token).catch(()=>{});}
    };
    saveToken();
    joined.onMessage('snapshot',(next:Snapshot)=>{
      const previous = lastSoundSnapshot.current;
      lastSoundSnapshot.current = next;
      if (previous && previous.handNo === next.handNo) {
        const prevMe = previous.players.find(p => p.id === previous.you);
        const nextMe = next.players.find(p => p.id === next.you);
        const prevMyTurn = !!prevMe && previous.turn === prevMe.seat && previous.street !== 'waiting' && previous.street !== 'showdown';
        const nextMyTurn = !!nextMe && next.turn === nextMe.seat && next.street !== 'waiting' && next.street !== 'showdown';
        if (next.street === 'showdown' && previous.street !== 'showdown') playEffect('win');
        else if (next.board.length > previous.board.length) playEffect('deal');
        else if (!prevMyTurn && nextMyTurn) playEffect('turn');
      } else if (previous && next.handNo !== previous.handNo) playEffect('deal');
      setState(next);
      if(next.turnRemainingMs !== undefined){
        setDeadline(next.turnRemainingMs > 0 ? Date.now()+next.turnRemainingMs : 0);
      }
    });
    joined.onMessage('gameError',(msg:string)=>Alert.alert('게임 알림',msg));
    joined.onError((_code:number,msg?:string)=>Alert.alert('네트워크 오류',msg ?? '연결 오류'));
    joined.onDrop(()=>setConnected(false));
    joined.onReconnect(()=>{setConnected(true);saveToken();joined.send('refresh');});
    joined.onLeave(()=>{
      if(roomRef.current===joined){
        roomRef.current=null;setRoom(null);setState(null);setConnected(false);
        Alert.alert('연결 종료','방 연결이 종료됐습니다. 45초 안이라면 재접속을 시도할 수 있습니다.');
      }
    });
    joined.send('refresh');
  };
  const reconnect=async()=>{
    if(reconnectBusy)return;
    setReconnectBusy(true);
    try{
      const token=resumeToken.current ?? await AsyncStorage.getItem(SESSION_KEY);
      if(!token)throw new Error('저장된 재접속 정보가 없습니다');
      // The original seat is held by the server for up to 45 seconds.
      const joined=await new Client(SERVER).reconnect(token);
      attachRoom(joined);
    }catch(err){
      resumeToken.current=null;setHasResumeToken(false);
      await AsyncStorage.removeItem(SESSION_KEY).catch(()=>{});
      Alert.alert('재접속 실패','재접속 제한시간 만료 또는 서버 재시작 가능성이 있습니다. 새 방으로 입장하세요.');
    }finally{setReconnectBusy(false);}
  };
  useEffect(()=>{
    let alive=true;
    void AsyncStorage.getItem(SESSION_KEY).then(token=>{
      if(alive&&token&&!roomRef.current){resumeToken.current=token;setHasResumeToken(true);}
    }).catch(()=>{});
    return ()=>{alive=false;};
  },[]);
  // 기존 서버 프로토콜과 방/AI 접속 로직은 그대로 보존합니다.
  const connect = async (kind: 'create' | 'join' | 'solo') => {
    if (!name.trim()) return Alert.alert('알림', '닉네임을 입력하세요');
    if (kind === 'join' && !code.trim()) return Alert.alert('알림', '초대 코드를 입력하세요');
    setBusy(true);
    try {
      const client = new Client(SERVER);
      const joined = kind !== 'join'
        ? await client.create('holdem', {name: name.trim()})
        : await client.joinById(code.trim(), {name: name.trim()});
      attachRoom(joined);
      if (kind === 'solo') joined.send('addBot', {count: 2, difficulty: aiDifficulty});
    } catch (e) {
      Alert.alert('접속 실패', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const exit = async () => {
    const r = roomRef.current;
    resumeToken.current=null;setHasResumeToken(false);void AsyncStorage.removeItem(SESSION_KEY).catch(()=>{});
    roomRef.current = null;
    setRoom(null);
    setState(null);
    if (r) await r.leave();
  };
  useEffect(() => () => {void roomRef.current?.leave();}, []);
  const me = state?.players.find(p => p.id === state.you);
  const myTurn = !!(state && me && state.turn === me.seat);
  const toCall = me && state ? Math.max(0, state.currentBet - me.streetBet) : 0;
  const maxTotal = me ? me.streetBet + me.stack : 0;
  const minTotal = state ? state.currentBet + state.minRaise : 0;
  const send = (move: Move, amount?: number) => {if(connected){roomRef.current?.send('move', {move, amount});playEffect('action');}};
  const start = () => {if(connected)roomRef.current?.send('start');};
  useEffect(()=>{
    if(!state||!me)return;
    const min=state.currentBet+state.minRaise,max=me.streetBet+me.stack;
    setRaise(String(max>=min?Math.min(max,Math.max(min,state.currentBet*2)):max));
  },[state?.handNo,state?.street,state?.currentBet,state?.minRaise,state?.turn]);

  // The server is authoritative: animate changes only after snapshots arrive.
  const [flying, setFlying] = useState<FlyingChip[]>([]);
  const lastSnapshot = useRef<Snapshot | null>(null);
  const chipSeq = useRef(0);
  useEffect(() => {
    if (!state || !room) {lastSnapshot.current = null; setFlying([]); return;}
    const prev = lastSnapshot.current;
    lastSnapshot.current = state;
    if (!prev || prev.handNo !== state.handNo) return;
    const events: FlyingChip[] = [];
    for (const p of state.players) {
      const before = prev.players.find(x => x.id === p.id);
      if (!before) continue;
      if (p.totalBet > before.totalBet) events.push({id: ++chipSeq.current, playerId: p.id, reverse: false});
      if (state.street === 'showdown' && prev.street !== 'showdown' && p.stack > before.stack) {
        events.push({id: ++chipSeq.current, playerId: p.id, reverse: true});
      }
    }
    if (events.length) setFlying(old => [...old.slice(-8), ...events]);
  }, [state, room]);

  const equityKey = aiDifficulty !== 'hard' && state && me?.hole.length === 2 && !['waiting', 'showdown'].includes(state.street)
    ? `${state.handNo}|${me.hole.join(',')}|${state.board.join(',')}|${state.players.filter(p => p.cardsCount > 0 && !p.folded && p.id !== state.you).length}|${me.folded}` : '';
  const [equity, setEquity] = useState<EquityResult | null>(null);
  useEffect(() => {
    setEquity(null);
    if (!equityKey || !state || !me || me.folded) return;
    const opponents = state.players.filter(p => p.cardsCount > 0 && !p.folded && p.id !== state.you).length;
    if (opponents < 1) return;
    // Schedule after paint to avoid blocking touch feedback.
    const timer = setTimeout(() => setEquity(estimateEquity(me.hole, state.board, opponents, 500)), 65);
    return () => clearTimeout(timer);
  // equityKey captures all equity-relevant values, preventing resimulation on every action.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equityKey]);
  const visibleHand = aiDifficulty === 'easy' && me && state && !me.folded &&
    !['waiting', 'showdown'].includes(state.street) ? currentHandName(me.hole, state.board) : null;

  if (!room || !state) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style="light"/>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.homeContent}>
          <View style={styles.homeTopRow}>
            <Text style={styles.overline}>PREMIUM POKER CLUB</Text>
            <View style={styles.onlinePill}><View style={styles.onlineDot}/><Text style={styles.onlineText}>ONLINE</Text></View>
          </View>
          <View style={styles.hero}>
            <Text style={styles.heroSuit}>♠  ♥  ♣  ♦</Text>
            <Text style={styles.heroTitle}>GREEN{ '\n' }HOLDEM</Text>
            <Text style={styles.heroSubtitle}>YOUR TABLE. YOUR GAME.</Text>
            <View style={styles.heroDivider}/>
            <Text style={styles.heroDescription}>친구와 함께, 또는 AI와 혼자.{'\n'}언제 어디서나 즐기는 텍사스 홀덤</Text>
          </View>
          <View style={styles.homePanel}>
            <SectionLabel>PLAYER PROFILE</SectionLabel>
            <Text style={styles.fieldLabel}>닉네임</Text>
            <TextInput style={styles.textInput} value={name} onChangeText={setName} maxLength={14}
              placeholder="닉네임 입력" placeholderTextColor="#759682"/>
            <SectionLabel>난이도 · 내 화면 정보 / AI 전략</SectionLabel>
            <View style={styles.v05DifficultyRow}>
              {(['easy','medium','hard'] as const).map(level => (
                <TouchableOpacity key={level} onPress={()=>setAiDifficulty(level)} style={[styles.v05Difficulty,aiDifficulty===level&&styles.v05DifficultySelected]}>
                  <Text style={[styles.v05DifficultyLabel,aiDifficulty===level&&{color:C.gold}]}>{level==='easy'?'쉬움':level==='medium'?'보통':'어려움'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.difficultyHelp}>
              {aiDifficulty === 'easy' ? '쉬움: 내 현재 족보 + 추정 승률 표시' : aiDifficulty === 'medium' ? '보통: 기존 화면 그대로 (추정 승률 표시)' : '어려움: 족보 안내와 추정 승률 숨김'}
            </Text>
            {hasResumeToken?<Button title={reconnectBusy?'재접속 시도 중...':'이전 방 재접속 (45초 이내)'} tone="outline" disabled={reconnectBusy} onPress={()=>void reconnect()}/>:null}
            <View style={styles.homeButtons}>
              <Button title="♠  온라인 비공개 방 만들기" disabled={busy} onPress={() => void connect('create')}/>
              <Button title="♣  혼자 연습하기 · AI 2명" disabled={busy} tone="green" onPress={() => void connect('solo')}/>
            </View>
            <View style={styles.divider}/>
            <SectionLabel>JOIN A PRIVATE TABLE</SectionLabel>
            <Text style={styles.fieldLabel}>친구에게 받은 방 코드</Text>
            <TextInput style={styles.textInput} value={code} onChangeText={setCode}
              autoCapitalize="none" autoCorrect={false} placeholder="초대 코드 입력" placeholderTextColor="#759682"/>
            <Button title="초대 코드로 입장  →" disabled={busy} tone="outline" onPress={() => void connect('join')}/>
            {busy ? <ActivityIndicator color={C.gold} style={{marginTop: 14}}/> : null}
          </View>
          <View style={styles.homeFooter}>
            <Text style={styles.footerAccent}>◆  7 PLAYERS MAX   ·   10,000 STARTING CHIPS</Text>
            <Text style={styles.footerText}>무료 가상 칩 전용 · 현금 거래 및 환전 불가</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const heroSeat = me?.seat ?? 0;
  const others = [...state.players]
    .filter(p => p.id !== state.you)
    .sort((a, b) => ((a.seat - heroSeat + 7) % 7) - ((b.seat - heroSeat + 7) % 7));
  const actionRailWidth = screenWidth < 380 ? 112 : 122;
  const tableWidth = Math.min(screenWidth - actionRailWidth - 22, 380);
  const tableHeight = Math.max(340, Math.min(490, Math.round(screenHeight * 0.60)));
  const seatWidth = tableWidth < 300 ? 70 : 82;
  const middleX = (tableWidth - seatWidth) / 2;
  const xRight = tableWidth - seatWidth + 2;
  // Clockwise order from every viewer's own seat (always bottom-left).
  // 7 people: add a right-middle seat, retaining the opposite bottom-right seat.
  const clockwiseSeats = [
    {left: -10, top: Math.round(tableHeight * 0.34)}, // left-middle
    {left: -8, top: Math.round(tableHeight * 0.09)}, // left-upper
    {left: middleX, top: -6}, // top
    {left: xRight, top: Math.round(tableHeight * 0.09)}, // right-upper
    {left: xRight - 10, top: Math.round(tableHeight * 0.40)}, // right-middle (7 players)
    {left: xRight - 10, top: tableHeight - 108}, // bottom-right
  ];
  // Retain the existing opposing bottom-right seat for up to 6 players.
  const seats = others.length <= 5
    ? [...clockwiseSeats.slice(0, 4), clockwiseSeats[5]]
    : clockwiseSeats;
  const dealtPlayers = [...state.players].filter(p => p.cardsCount > 0).sort((a, b) => a.seat - b.seat);
  const afterSeat = (seat: number) => dealtPlayers.find(p => p.seat > seat) ?? dealtPlayers[0];
  const smallBlindSeat = dealtPlayers.length === 2 ? state.dealer : afterSeat(state.dealer)?.seat;
  const bigBlindSeat = smallBlindSeat === undefined ? undefined : afterSeat(smallBlindSeat)?.seat;
  const blindOf = (seat: number): 'SB' | 'BB' | undefined =>
    dealtPlayers.length < 2 ? undefined : seat === smallBlindSeat ? 'SB' : seat === bigBlindSeat ? 'BB' : undefined;
  const smallBlindAmount = Math.floor(state.bigBlind / 2);
  const playerPoint = (playerId: string) => {
    if (playerId === state.you) return {x: 18, y: tableHeight - 36};
    const ix = others.findIndex(p => p.id === playerId);
    const pos = seats[ix];
    return pos ? {x: pos.left + seatWidth / 2 - 10, y: pos.top + 52} : null;
  };
  const handIsOver = state.street === 'waiting' || state.street === 'showdown';
  const canStart = state.players.filter(p => p.connected && p.stack > 0).length >= 2;
  const canRaise = connected && Number.isSafeInteger(Number(raise)) && Number(raise) >= minTotal && Number(raise) > 0 && Number(raise) <= maxTotal;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light"/>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.gameContent,{minHeight: screenHeight - 70}]} showsVerticalScrollIndicator={false}>
          <View style={styles.gameHeader}>
            <View>
              <Text style={styles.gameLogo}>♠  GREEN HOLDEM</Text>
              
            </View>
            <View style={{flexDirection:'row',alignItems:'center',gap:5}}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={soundEnabled ? '효과음 끄기' : '효과음 켜기'}
                style={styles.soundToggle} onPress={() => setSound(!soundEnabled)}>
                <Text style={styles.soundToggleLabel}>{soundEnabled ? '🔊' : '🔇'}</Text>
              </TouchableOpacity>
              <Button title="나가기" tone="outline" compact onPress={() => void exit()}/>
            </View>
          </View>
          <View style={styles.roomInfo}>
            <Text style={styles.roomCode} selectable>방 {room.roomId}</Text>
            <Text style={styles.roomCountText}>● {state.players.length}/7</Text>
          </View>
          {!connected?<Text style={styles.v05Warning}>네트워크 재접속 중 — 조작이 잠시 제한됩니다</Text>:null}
          <View style={styles.gameMetaRow}>
            <Text style={styles.metaLabel}>HAND #{state.handNo}</Text>
            <Text style={styles.roundPill}>{state.street.toUpperCase()}</Text>
            <Text style={styles.metaLabel}>SB {smallBlindAmount} / BB {state.bigBlind}</Text>
          </View>

          {state.turn>=0 && state.street!=='showdown'&&state.street!=='waiting' ? (
            <TurnClock key={`${state.handNo}-${state.street}-${state.turn}`} deadline={deadline} totalSeconds={state.turnSeconds??30}
              label={myTurn?'내 차례 · 0초면 자동 폴드':'현재 턴 제한시간'}/>
          ):null}
          <View style={styles.tableAndActions}>
          <View style={[styles.tableShell, {width: tableWidth, height: tableHeight}]}>
            <View style={styles.tableInner}/>
            <Text style={styles.tableWatermark}>GREEN HOLDEM</Text>
            {others.map((p, i) => {
              const pos = seats[i];
              return pos ? <View key={p.id} style={[styles.seatPosition, {left: pos.left, top: pos.top}]}>
                <PlayerSeat p={p} dealer={state.dealer === p.seat} turn={state.turn === p.seat} mine={false} width={seatWidth} blind={blindOf(p.seat)} handNo={state.handNo}/>
              </View> : null;
            })}
            <View style={styles.potBlock}>
              <Text style={styles.potCaption}>TOTAL POT</Text>
              <ChipPile large/>
              <Text style={styles.potNumber}>◉ {formatChips(state.totalPot)}</Text>
            </View>
            <View style={[styles.communityRow,{top:Math.round(tableHeight*0.61)}]}>
              {Array.from({length: 5}, (_, i) => <RevealCard key={`${state.handNo}-${i}`} code={state.board[i]} order={i < 3 ? i : 0} compact/>)}
            </View>
            <View style={styles.mySeatOnTable}>
              {me ? <PlayerSeat p={me} dealer={state.dealer === me.seat} turn={myTurn} mine width={Math.max(94, seatWidth + 18)} blind={blindOf(me.seat)} handNo={state.handNo}/> : null}
            </View>
            {flying.map(event => {
              const from = playerPoint(event.playerId);
              if (!from) return null;
              const pot = {x: tableWidth / 2 - 12, y: Math.round(tableHeight * 0.46)};
              const origin = event.reverse ? pot : from;
              const target = event.reverse ? from : pot;
              return <MovingChip key={event.id} fromX={origin.x} fromY={origin.y} toX={target.x} toY={target.y}
                onDone={() => setFlying(old => old.filter(x => x.id !== event.id))}/>;
            })}
          </View>
          <View style={[styles.rightActionRail, {width: actionRailWidth}]}>
            <Text style={styles.railHeading}>YOUR ACTION</Text>
            {handIsOver ? (
              <View style={styles.railControls}>
                <Button title={state.street === 'waiting' ? '게임 시작' : '다음 핸드'} disabled={!canStart} compact onPress={start}/>
                <Button title="AI 추가" tone="outline" compact disabled={state.players.length >= 7}
                  onPress={() => roomRef.current?.send('addBot', {count: 1,difficulty:aiDifficulty})}/>
              </View>
            ) : myTurn && me && !me.folded && !me.allIn ? (
              <View style={styles.railControls}>
                <Text style={styles.railCall}>콜 {formatChips(Math.min(toCall, me.stack))}</Text>
                <Button title="올인" tone="blue" compact onPress={() => send('allin')}/>
                <Button title={toCall === 0 ? '체크' : '콜'} tone="green" compact onPress={() => send(toCall === 0 ? 'check' : 'call')}/>
                <Button title="폴드" tone="red" compact onPress={() => send('fold')}/>
                <View style={styles.railDivider}/>
                <Text style={styles.railSmallLabel}>레이즈 금액</Text>
                <TextInput style={styles.railRaiseInput} keyboardType="number-pad" value={raise} onChangeText={setRaise}/>
                <View style={styles.railPresetRow}>
                  {(['half','pot'] as BetPreset[]).map(preset => <TouchableOpacity key={preset}
                    style={styles.railPreset} onPress={() => setRaise(String(pickRaise(preset, {minTotal,maxTotal,currentBet:state.currentBet,toCall,pot:state.totalPot})))}>
                    <Text style={styles.railPresetText}>{preset === 'half' ? '½팟' : '팟'}</Text>
                  </TouchableOpacity>)}
                </View>
                <Button title="레이즈" compact disabled={!canRaise||!connected} onPress={() => send('raise', Number(raise))}/>
              </View>
            ) : (
              <Text style={styles.railWaiting}>{myTurn ? '올인 / 폴드' : '상대 턴 대기 중'}</Text>
            )}
          </View>
          </View>

          {visibleHand ? (
            <View style={styles.handInfoPanel}>
              <Text style={styles.handInfoLabel}>현재 내 족보</Text>
              <Text style={styles.handInfoValue}>{visibleHand}</Text>
            </View>
          ) : null}
          {aiDifficulty !== 'hard' && equity ? (
            <View style={styles.equityPanel}>
              <View style={styles.equityRow}><Text style={styles.equityTitle}>추정 쇼다운 승률</Text>
                <Text style={styles.equityValue}>{equity.win.toFixed(1)}%</Text></View>
              <View style={styles.equityTrack}><View style={[styles.equityFill, {width: `${equity.win}%`}]}/></View>
              <Text style={styles.equityNote}>무승부 {equity.tie.toFixed(1)}% · 패배 {equity.lose.toFixed(1)}% · 팟 지분 {equity.equity.toFixed(1)}%</Text>

            </View>
          ) : null}

          {state.street==='showdown'&&state.result?<ShowdownBanner
            winners={aiDifficulty === 'hard' ? state.result.winners.map(w => ({...w, handName: ''})) : state.result.winners}
            you={state.you}/>:null}
          {handIsOver ? <View style={styles.logPanel}>
            <Text style={styles.controlTitle}>GAME HISTORY</Text>
            {state.log.slice(-6).map((line, i) => <Text style={styles.logText} key={i}>•  {aiDifficulty === 'hard' ? handNames.reduce((s, name) => s.split(name).join('비공개'), line) : line}</Text>)}
          </View> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  root: {flex: 1, backgroundColor: C.bg},
  homeContent: {paddingHorizontal: 22, paddingTop: 22, paddingBottom: 38},
  homeTopRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  overline: {fontSize: 10, letterSpacing: 2.2, color: C.gold, fontWeight: '800'},
  onlinePill: {borderRadius: 30, borderWidth: 1, borderColor: '#376C50', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6},
  onlineDot: {backgroundColor: '#65DF98', width: 6, height: 6, borderRadius: 3},
  onlineText: {color: '#B0E8C7', fontSize: 10, letterSpacing: 1.2, fontWeight: '800'},
  hero: {minHeight: 254, paddingTop: 26, alignItems: 'center'},
  heroSuit: {fontSize: 30, color: C.gold, letterSpacing: 12},
  heroTitle: {fontSize: 43, lineHeight: 46, letterSpacing: 4, fontWeight: '900', color: C.ivory, textAlign: 'center', marginTop: 14},
  heroSubtitle: {fontSize: 10, color: C.gold, fontWeight: '800', letterSpacing: 3.2, marginTop: 10},
  heroDivider: {height: 1, width: 46, backgroundColor: C.railLight, marginTop: 16},
  heroDescription: {textAlign: 'center', color: C.muted, lineHeight: 19, marginTop: 12, fontSize: 12},
  homePanel: {backgroundColor: C.surface, borderRadius: 19, borderWidth: 1, borderColor: '#2D4F3F', padding: 18},
  sectionLabel: {color: C.gold, fontSize: 11, letterSpacing: 1.6, fontWeight: '900', marginBottom: 12},
  fieldLabel: {color: '#BDD1C5', fontSize: 12, fontWeight: '700', marginBottom: 7},
  textInput: {height: 49, backgroundColor: '#0A2017', borderRadius: 10, borderWidth: 1, borderColor: '#375847', color: C.ivory, fontSize: 15, paddingHorizontal: 14},
  homeButtons: {marginTop: 12, gap: 8},
  button: {minHeight: 50, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13, borderWidth: 1, borderColor: 'transparent'},
  button_gold: {backgroundColor: C.gold},
  button_green: {backgroundColor: C.green, borderColor: '#42976A'},
  button_outline: {backgroundColor: '#17372A', borderColor: '#466C55'},
  button_red: {backgroundColor: '#7B333A', borderColor: '#A74A53'},
  button_blue: {backgroundColor: '#2C4F72', borderColor: '#4476A7'},
  buttonCompact: {minHeight: 39, paddingHorizontal: 10},
  buttonText: {fontSize: 14, fontWeight: '900', color: C.ivory},
  buttonTextDark: {color: '#2A291B'},
  buttonTextCompact: {fontSize: 12},
  disabled: {opacity: 0.35},
  divider: {height: 1, backgroundColor: '#34513F', marginVertical: 19},
  homeFooter: {alignItems: 'center', paddingTop: 26, gap: 8},
  footerAccent: {color: C.gold, fontSize: 10, fontWeight: '800', letterSpacing: 1},
  v05Warning:{backgroundColor:'#672B35',color:'#FFFFFF',padding:10,borderRadius:9,marginTop:8,textAlign:'center',fontWeight:'800'},
  v05DifficultyRow:{flexDirection:'row',gap:8,marginVertical:8},
  v05Difficulty:{flex:1,borderRadius:9,paddingVertical:10,alignItems:'center',backgroundColor:'#18382B',borderColor:'#355A44',borderWidth:1},
  v05DifficultySelected:{borderColor:C.gold,backgroundColor:'#29513A'},
  v05DifficultyLabel:{color:C.ivory,fontWeight:'800'},
  footerText: {color: '#7F9C8D', fontSize: 10, textAlign: 'center', lineHeight: 17, marginTop: 10},
  gameContent: {paddingHorizontal: 5, paddingTop: 4, paddingBottom: 10, alignItems: 'stretch'},
  tableAndActions: {flexDirection: 'row', alignItems: 'stretch', justifyContent: 'center', gap: 6},
  rightActionRail: {backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: 13, padding: 5, justifyContent: 'flex-start'},
  railHeading: {fontSize: 10, fontWeight: '900', color: C.gold, textAlign: 'center', marginVertical: 8},
  railControls: {gap: 6},
  railCall: {fontSize: 10, color: C.ivory, textAlign: 'center', fontWeight: '700'},
  railDivider: {height: 1, backgroundColor: C.line, marginVertical: 4},
  railSmallLabel: {fontSize: 10, color: C.muted, textAlign: 'center'},
  railRaiseInput: {height: 38, borderRadius: 8, borderWidth: 1, borderColor: C.line, backgroundColor: C.bg, color: C.ivory, textAlign: 'center', fontSize: 13},
  railPresetRow: {flexDirection: 'row', gap: 4},
  railPreset: {flex: 1, paddingVertical: 7, borderRadius: 7, backgroundColor: C.elevated, alignItems: 'center'},
  railPresetText: {fontSize: 10, fontWeight: '800', color: C.ivory},
  railWaiting: {fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 18},
  gameHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3},
  soundToggle: {height: 38, minWidth: 37, borderRadius: 9, backgroundColor: C.elevated, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.line},
  soundToggleLabel: {fontSize: 17},
  gameLogo: {fontSize: 17, fontWeight: '900', color: C.gold, letterSpacing: 1.1},
  gameSub: {fontSize: 9, letterSpacing: 1.8, color: C.muted, marginTop: 4},
  roomInfo: {paddingHorizontal: 6, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', justifyContent:'space-between'},
  metaLabel: {fontSize: 10, fontWeight: '900', letterSpacing: 1.2, color: C.muted},
  roomCode: {fontSize: 13, color: C.gold, fontWeight: '800', marginTop: 3},
  roomCount: {backgroundColor: '#1C4A35', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7},
  roomCountText: {fontSize: 11, color: '#B8E7CE', fontWeight: '800'},
  gameMetaRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 4, paddingHorizontal: 4},
  roundPill: {borderRadius: 16, backgroundColor: '#274A37', paddingHorizontal: 12, paddingVertical: 7, color: C.gold, fontWeight: '900', fontSize: 10, overflow: 'hidden'},
  tableShell: {alignSelf: 'center', position: 'relative', borderRadius: 170, borderWidth: 10, borderColor: C.rail, backgroundColor: C.felt, overflow: 'visible', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 14, elevation: 8},
  tableInner: {position: 'absolute', left: 8, right: 8, top: 8, bottom: 8, borderRadius: 165, borderWidth: 2, borderColor: '#479E70', backgroundColor: C.feltInner, opacity: 0.38},
  tableWatermark: {position: 'absolute', top: 105, fontSize: 14, fontWeight: '900', letterSpacing: 3.5, color: '#559C71', opacity: 0.5},
  seatPosition: {position: 'absolute', zIndex: 5},
  seat: {backgroundColor: '#12342A', borderColor: '#396F54', borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 4, paddingVertical: 6, alignItems: 'center', minHeight: 78},
  seatTurn: {borderColor: C.gold, borderWidth: 2.5, backgroundColor: '#22593F'},
  seatMine: {backgroundColor: '#244734'},
  seatFolded: {opacity: 0.48},
  seatHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, width: '100%'},
  seatDot: {height: 6, width: 6, borderRadius: 3},
  seatName: {fontWeight: '800', fontSize: 10, color: C.ivory, flexShrink: 1},
  dealerBadge: {fontSize: 10, fontWeight: '900', color: '#232015', backgroundColor: C.gold, borderRadius: 7, overflow: 'hidden', paddingHorizontal: 4},
  seatStack: {fontSize: 10, color: C.gold, fontWeight: '800', marginTop: 3},
  seatMeta: {fontSize: 9, color: '#B0CAB9', marginTop: 3},
  seatCards: {flexDirection: 'row', gap: 3, marginTop: 3},
  blindBadge: {fontSize: 9, fontWeight: '900', color: '#FFFFFF', backgroundColor: '#7D5933', borderRadius: 5, overflow: 'hidden', paddingHorizontal: 3},
  potBlock: {position: 'absolute', left: '50%', top: '50%', alignItems: 'center', backgroundColor: 'rgba(5,40,28,0.72)', borderRadius: 13, paddingHorizontal: 15, paddingVertical: 6, transform: [{translateX: -48}, {translateY: -46}], zIndex: 4},
  potCaption: {fontSize: 9, letterSpacing: 1.4, color: '#D1E9D6', fontWeight: '800'},
  potNumber: {fontSize: 19, fontWeight: '900', color: C.gold},
  communityRow: {position: 'absolute', top: 254, flexDirection: 'row', gap: 2, zIndex: 4},
  communityCardCompact: {width: 34, height: 48, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderRadius: 6},
  mySeatOnTable: {position: 'absolute', bottom: -3, left: -9, zIndex: 6},
  playCard: {width: 43, height: 61, backgroundColor: '#F8F6ED', borderRadius: 7, borderWidth: 1.5, borderColor: '#D5D0C5', alignItems: 'center', justifyContent: 'center'},
  playCardSmall: {width: 24, height: 32, borderRadius: 4},
  playCardBack: {backgroundColor: '#1B5972', borderColor: '#C8DDE1'},
  playCardEmpty: {backgroundColor: 'rgba(6,61,41,0.4)', borderColor: '#50A275'},
  playCardBackText: {color: '#DFD8A4', fontSize: 24},
  playCardText: {fontWeight: '900', fontSize: 18, color: '#192017'},
  playCardPlaceholder: {color: '#78BA8C', fontSize: 20},
  myHandPanel: {marginTop: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 15, padding: 15},
  myHandHead: {flexDirection: 'row', justifyContent: 'space-between'},
  myName: {fontSize: 16, color: C.ivory, fontWeight: '900', marginTop: 4},
  stackPanel: {alignItems: 'flex-end'},
  myStack: {fontSize: 18, color: C.gold, fontWeight: '900', marginTop: 4},
  myHandRow: {flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12},
  myHandHint: {color: C.muted, fontWeight: '800', marginLeft: 12, fontSize: 12, flex: 1},
  difficultyHelp: {color: C.muted, fontSize: 11, marginBottom: 8, marginTop: 3},
  handInfoPanel: {marginTop: 5, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.gold, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  handInfoLabel: {fontSize: 11, color: C.ivory, fontWeight: '800'},
  handInfoValue: {fontSize: 16, color: C.gold, fontWeight: '900'},
  equityPanel: {marginTop: 5, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.line},
  equityRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  equityTitle: {color: C.ivory, fontWeight: '800', fontSize: 11},
  equityValue: {color: C.gold, fontSize: 16, fontWeight: '900'},
  equityTrack: {marginTop: 3, height: 5, backgroundColor: '#294438', borderRadius: 8, overflow: 'hidden'},
  equityFill: {height: '100%', backgroundColor: '#DDB958', borderRadius: 8},
  equityNote: {fontSize: 10, color: C.ivory, marginTop: 3},
  equityDisclaimer: {fontSize: 10, color: C.muted, marginTop: 6, lineHeight: 15},
  controlPanel: {backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, padding: 8, borderRadius: 12, marginTop: 5, gap: 4},
  controlTitleRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  controlTitle: {fontSize: 11, letterSpacing: 1.6, fontWeight: '900', color: C.gold},
  callAmount: {fontSize: 12, fontWeight: '800', color: C.ivory},
  actionButtons: {flexDirection: 'row', gap: 5},
  actionButtonWrap: {flex: 1},
  raiseHelp: {color: C.muted, fontSize: 10, lineHeight: 15},
  raiseRow: {flexDirection: 'row', gap: 8},
  raiseInput: {flex: 1, height: 40},
  raiseButton: {width: 96},
  waitingPanel: {marginTop: 5, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, padding: 7, borderRadius: 12},
  waitingText: {textAlign: 'center', color: C.muted, fontSize: 12},
  logPanel: {backgroundColor: C.surface, marginTop: 14, padding: 15, borderRadius: 13, borderWidth: 1, borderColor: C.line, gap: 7},
  logText: {fontSize: 12, color: '#C4DACB', lineHeight: 17},
});
