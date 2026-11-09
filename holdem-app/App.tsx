import React,{useEffect,useRef,useState} from 'react';
import {SafeAreaView,ScrollView,View,Text,TextInput,TouchableOpacity,StyleSheet,Alert,KeyboardAvoidingView,Platform,ActivityIndicator} from 'react-native';
import {Client, type Room} from '@colyseus/sdk';
import {StatusBar} from 'expo-status-bar';
import type {Snapshot,Move,PlayerView} from './src/types';
const SERVER = 'http://10.0.80.112:2567'; // 배포 후 HTTPS 주소로 교체
const green='#075c3a',light='#e8f4e9',gold='#f5cf79';
const cardText=(c:string)=>c?`${'23456789TJQKA'.includes(c[0])&&c[0]==='T'?'10':c[0]}${({s:'♠',h:'♥',d:'♦',c:'♣'} as Record<string,string>)[c[1]]||''}`:'?';
function Card({code,back=false}:{code?:string;back?:boolean}){
  const red=code?.endsWith('h')||code?.endsWith('d');
  return <View style={[styles.card,back&&styles.back]}><Text style={{fontWeight:'900',fontSize:18,color:back?gold:red?'#c0293e':'#111'}}>{back?'★':cardText(code||'')}</Text></View>;
}
function Btn({title,onPress,disabled=false,secondary=false}:{title:string;onPress:()=>void;disabled?:boolean;secondary?:boolean}){
  return <TouchableOpacity onPress={onPress} disabled={disabled} style={[styles.btn,secondary&&styles.secondary,disabled&&{opacity:.35}]}><Text style={[styles.btnText,secondary&&{color:light}]}>{title}</Text></TouchableOpacity>;
}
export default function App(){
  const [name,setName]=useState('Player'+Math.floor(Math.random()*900+100));
  const [code,setCode]=useState('');const [room,setRoom]=useState<Room|null>(null);
  const roomRef=useRef<Room|null>(null);const [state,setState]=useState<Snapshot|null>(null);
  const [busy,setBusy]=useState(false);const [raise,setRaise]=useState('200');
  const connect=async(kind:'create'|'join'|'solo')=>{
    if(!name.trim())return Alert.alert('알림','닉네임을 입력하세요');
    if(kind==='join'&&!code.trim())return Alert.alert('알림','초대 코드를 입력하세요');
    setBusy(true);
    try{
      const client=new Client(SERVER);
      const joined=kind!=='join'?await client.create('holdem',{name:name.trim()}):await client.joinById(code.trim(),{name:name.trim()});
      roomRef.current=joined;setRoom(joined);
      joined.onMessage('snapshot',(next:Snapshot)=>setState(next));
      joined.onMessage('gameError',(msg:string)=>Alert.alert('게임 알림',msg));
      joined.onError((_code:number,msg?:string)=>Alert.alert('네트워크 오류',msg ?? '연결 오류'));
      joined.onLeave(()=>{if(roomRef.current===joined){roomRef.current=null;setRoom(null);setState(null);Alert.alert('연결 종료','방에서 나왔거나 서버 연결이 끊어졌습니다.');}});
      joined.send('refresh');
      if(kind==='solo') joined.send('addBot',{count:2});
    }catch(e){Alert.alert('접속 실패',e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  };
  const exit=async()=>{const r=roomRef.current;roomRef.current=null;setRoom(null);setState(null);if(r)await r.leave();};
  useEffect(()=>()=>{void roomRef.current?.leave();},[]);
  const me=state?.players.find(p=>p.id===state.you);
  const myTurn=!!(state&&me&&state.turn===me.seat);
  const toCall=me&&state?Math.max(0,state.currentBet-me.streetBet):0;
  const maxTotal=me?me.streetBet+me.stack:0;
  const minTotal=state?state.currentBet+state.minRaise:0;
  const send=(move:Move,amount?:number)=>roomRef.current?.send('move',{move,amount});
  const start=()=>roomRef.current?.send('start');
  if(!room||!state)return <SafeAreaView style={styles.root}><StatusBar style="light"/><ScrollView contentContainerStyle={styles.lobby} keyboardShouldPersistTaps="handled">
    <Text style={styles.logo}>♠ GREEN HOLDEM ♥</Text><Text style={styles.sub}>친구와 함께하는 6인 텍사스 홀덤</Text>
    <Text style={styles.label}>닉네임</Text><TextInput style={styles.input} value={name} onChangeText={setName} maxLength={14} placeholderTextColor="#a9c4b4"/>
    <Btn title="새 비공개 방 만들기" disabled={busy} onPress={()=>void connect('create')}/>
    <Btn title="혼자 연습하기 (AI 2명)" disabled={busy} secondary onPress={()=>void connect('solo')}/>
    <Text style={[styles.label,{marginTop:25}]}>친구에게 받은 초대 코드</Text>
    <TextInput style={styles.input} value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false} placeholder="방 코드를 붙여넣으세요" placeholderTextColor="#a9c4b4"/>
    <Btn title="코드로 입장" disabled={busy} onPress={()=>void connect('join')}/>
    {busy&&<ActivityIndicator color={gold} style={{marginTop:20}}/>}
    <Text style={styles.tip}>서버: {SERVER}{'\n'}무료 게임 칩 전용 · 환전 불가</Text>
  </ScrollView></SafeAreaView>;
  const seated=[...state.players].sort((a,b)=>a.seat-b.seat);
  return <SafeAreaView style={styles.root}><StatusBar style="light"/><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
    <ScrollView contentContainerStyle={{padding:12,paddingBottom:45}} keyboardShouldPersistTaps="handled">
      <View style={styles.top}><Text style={styles.logoSmall}>♠ GREEN HOLDEM</Text><Btn title="나가기" secondary onPress={()=>void exit()}/></View>
      <Text style={styles.roomCode}>초대 코드: {room.roomId}</Text>
      <Text selectable style={styles.tip}>친구에게 위 코드 전체를 보내세요. 최대 6명. AI와 연습도 가능합니다.</Text>
      {state.street==='waiting'||state.street==='showdown'?<Btn title="AI 상대 1명 추가" secondary disabled={state.players.length>=6} onPress={()=>roomRef.current?.send('addBot',{count:1})}/>:null}
      <View style={styles.table}>
        <Text style={styles.tableTitle}>HAND #{state.handNo}  ·  {state.street.toUpperCase()}</Text>
        <View style={styles.players}>
          {seated.map(p=><PlayerSeat key={p.id} p={p} dealer={state.dealer===p.seat} turn={state.turn===p.seat} mine={p.id===state.you}/>)}
        </View>
        <Text style={styles.pot}>POT {state.totalPot.toLocaleString()} 칩</Text>
        <View style={styles.board}>{Array.from({length:5},(_,i)=><Card key={i} code={state.board[i]}/>)}</View>
        <Text style={styles.small}>현재 총 베팅 {state.currentBet} · 최소 레이즈 증가분 {state.minRaise}</Text>
      </View>
      <Text style={styles.heading}>내 카드 · {me?.name||''}</Text>
      <View style={styles.myCards}>{me?.hole.map((c,i)=><Card code={c} key={i}/>)||null}<Text style={styles.stack}>잔여 {me?.stack.toLocaleString()} 칩</Text></View>
      {state.street==='waiting'||state.street==='showdown'?<Btn title={state.street==='waiting'?'게임 시작 (2명 이상)':'다음 핸드 시작'} disabled={state.players.filter(p=>p.connected&&p.stack>0).length<2} onPress={start}/>:null}
      {myTurn&&me&&!me.folded&&!me.allIn?<View style={styles.actions}>
        <Text style={styles.heading}>내 차례 · 콜 필요 금액 {Math.min(toCall,me.stack)}</Text>
        <View style={styles.actionRow}>
          <Btn title="폴드" secondary onPress={()=>send('fold')}/>
          {toCall===0?<Btn title="체크" onPress={()=>send('check')}/>:<Btn title={`콜 ${Math.min(toCall,me.stack)}`} onPress={()=>send('call')}/>}
          <Btn title="올인" onPress={()=>send('allin')}/>
        </View>
        <Text style={styles.label}>레이즈 총 베팅액 (현재 거리 베팅 포함)</Text>
        <Text style={styles.small}>보통 최소 {minTotal} ~ 최대 {maxTotal} · 부족하면 올인 버튼 사용</Text>
        <TextInput keyboardType="number-pad" style={styles.input} value={raise} onChangeText={setRaise}/>
        <Btn title="레이즈" disabled={!Number.isSafeInteger(Number(raise))||Number(raise)<minTotal||Number(raise)>maxTotal} onPress={()=>send('raise',Number(raise))}/>
      </View>:<Text style={styles.waiting}>{state.street==='showdown'?'핸드가 종료되었습니다.':myTurn?'올인 또는 폴드 상태입니다.':'다른 플레이어의 행동을 기다리는 중...'}</Text>}
      <Text style={styles.heading}>플레이 기록</Text>
      {state.log.map((line,i)=><Text style={styles.log} key={i}>• {line}</Text>)}
      <Text style={styles.tip}>연결 종료 시 현재 핸드에서 폴드 처리됩니다. 서버가 재시작되면 방과 칩 기록이 초기화됩니다.</Text>
    </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
function PlayerSeat({p,dealer,turn,mine}:{p:PlayerView;dealer:boolean;turn:boolean;mine:boolean}){
  return <View style={[styles.seat,turn&&styles.turn,mine&&styles.mine]}>
    <Text numberOfLines={1} style={styles.seatName}>{p.name}{dealer?' Ⓓ':''}</Text>
    <Text style={styles.seatChip}>{p.stack.toLocaleString()} 칩</Text>
    <Text style={styles.seatBet}>베팅 {p.streetBet}{p.allIn?' · ALL-IN':''}</Text>
    <View style={{flexDirection:'row',gap:2}}>{p.hole.length?p.hole.map((c,i)=><Text key={i} style={styles.miniCard}>{cardText(c)}</Text>):p.cardsCount>0?[0,1].map(i=><Text key={i} style={styles.miniCard}>🂠</Text>):null}</View>
    {p.folded?<Text style={styles.folded}>FOLD</Text>:!p.connected?<Text style={styles.folded}>OFFLINE</Text>:null}
  </View>;
}
const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:'#071d15'},lobby:{padding:24,paddingTop:70,gap:12},logo:{fontSize:28,fontWeight:'900',color:gold,textAlign:'center'},logoSmall:{fontSize:16,fontWeight:'900',color:gold},sub:{color:light,textAlign:'center',fontSize:15,marginBottom:24},label:{color:light,fontSize:13,marginBottom:5},input:{borderColor:'#6d9d84',borderWidth:1,borderRadius:12,padding:12,color:'#fff',backgroundColor:'#123c2c',fontSize:16,marginBottom:8},btn:{backgroundColor:'#dfb751',borderRadius:10,paddingVertical:12,paddingHorizontal:12,alignItems:'center',justifyContent:'center',marginVertical:3,minHeight:44},secondary:{backgroundColor:'#275f4a'},btnText:{color:'#152d22',fontWeight:'800',fontSize:14},tip:{fontSize:12,color:'#adc5b6',marginTop:12,lineHeight:19},top:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},roomCode:{color:gold,fontWeight:'800',marginTop:8},table:{borderRadius:110,borderWidth:8,borderColor:'#7b5630',backgroundColor:green,minHeight:370,marginTop:16,padding:12,justifyContent:'space-around',alignItems:'center'},tableTitle:{color:gold,fontWeight:'bold',fontSize:12},players:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-around',width:'100%',gap:6},seat:{width:'30%',minHeight:84,backgroundColor:'#0c3628',borderRadius:10,padding:5,alignItems:'center',borderWidth:1,borderColor:'#3e8060'},turn:{borderColor:gold,borderWidth:3},mine:{backgroundColor:'#205842'},seatName:{color:'#fff',fontSize:11,fontWeight:'800'},seatChip:{color:gold,fontSize:11},seatBet:{color:'#d6e9dc',fontSize:10},miniCard:{fontSize:14,color:'white'},folded:{color:'#ff9999',fontSize:10},pot:{color:gold,fontSize:18,fontWeight:'900',marginTop:10},board:{flexDirection:'row',justifyContent:'center',gap:4,marginVertical:14},card:{width:51,height:72,borderRadius:6,backgroundColor:'#f6f3e9',borderWidth:2,borderColor:'#c8c4b9',justifyContent:'center',alignItems:'center'},back:{backgroundColor:'#145a76',borderColor:'#b3d5e4'},small:{color:'#cce0d2',fontSize:11,textAlign:'center'},heading:{color:gold,fontSize:16,fontWeight:'800',marginTop:22,marginBottom:9},myCards:{flexDirection:'row',alignItems:'center',gap:8},stack:{color:'#fff',fontWeight:'800',marginLeft:14},actions:{marginTop:8},actionRow:{flexDirection:'row',gap:8,justifyContent:'space-between'},waiting:{color:'#cde7d7',marginTop:18},log:{color:'#d2dfd6',paddingVertical:4,fontSize:13}
});
