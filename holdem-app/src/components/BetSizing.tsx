import React, {useState} from 'react';
import {Text, View, TouchableOpacity, StyleSheet, type GestureResponderEvent} from 'react-native';
export type BetPreset='half'|'pot'|'double'|'allin';
type Limits={minTotal:number;maxTotal:number;currentBet:number;toCall:number;pot:number};
const clamp=(n:number,l:Limits)=>Math.min(l.maxTotal,Math.max(l.minTotal,Math.round(n)));
export function pickRaise(preset:BetPreset,l:Limits):number {
  if(l.maxTotal<l.minTotal)return l.maxTotal;
  // Pot-size raise: call first, then raise by the pot after calling.
  const potRaise=l.currentBet+l.pot+l.toCall;
  const halfPot=l.currentBet+Math.ceil((l.pot+l.toCall)/2);
  const target=preset==='half'?halfPot:preset==='pot'?potRaise:preset==='double'?l.currentBet*2:l.maxTotal;
  return clamp(target,l);
}
export function BetSizing({minTotal,maxTotal,currentBet,toCall,pot,amount,onAmountChange,onPreset}:Limits&{
  amount:number;onAmountChange:(amount:number)=>void;onPreset:(preset:BetPreset)=>void;
}) {
  const [width,setWidth]=useState(1);
  const available=maxTotal>=minTotal;
  const limits={minTotal,maxTotal,currentBet,toCall,pot};
  const pct=available&&maxTotal>minTotal?Math.min(1,Math.max(0,(amount-minTotal)/(maxTotal-minTotal))):0;
  const handle=(event:GestureResponderEvent)=>{
    if(!available)return;
    const x=event.nativeEvent.locationX;
    const fraction=Math.min(1,Math.max(0,x/width));
    const raw=minTotal+fraction*(maxTotal-minTotal);
    onAmountChange(clamp(raw,limits));
  };
  return <View style={styles.root}>
    <View style={styles.presetRow}>
      {([['half','½ POT'],['pot','POT'],['double','2×'],['allin','ALL-IN']] as const).map(([key,title])=>
        <TouchableOpacity key={key} disabled={!available} style={[styles.preset,!available&&{opacity:0.3}]} onPress={()=>onPreset(key)}>
          <Text style={styles.presetText}>{title}</Text>
        </TouchableOpacity>)}
    </View>
    <View style={styles.rangeRow}><Text style={styles.note}>MIN {minTotal.toLocaleString()}</Text><Text style={styles.amount}>{Math.round(amount).toLocaleString()}</Text><Text style={styles.note}>MAX {maxTotal.toLocaleString()}</Text></View>
    <View style={[styles.track,!available&&{opacity:0.3}]} onLayout={e=>setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={()=>available} onMoveShouldSetResponder={()=>available}
      onResponderGrant={handle} onResponderMove={handle}>
      <View pointerEvents="none" style={[styles.fill,{width:`${pct*100}%`}]}/>
      <View pointerEvents="none" style={[styles.thumb,{left:`${pct*100}%`}]}/>
    </View>
    {!available?<Text style={styles.note}>일반 레이즈가 불가능합니다. 올인을 이용하세요.</Text>:null}
  </View>;
}
const styles=StyleSheet.create({root:{gap:9,marginVertical:5},presetRow:{flexDirection:'row',gap:6},preset:{flex:1,backgroundColor:'#264D3B',borderWidth:1,borderColor:'#56846B',paddingVertical:10,borderRadius:8,alignItems:'center'},presetText:{color:'#F1DBA0',fontSize:11,fontWeight:'800'},rangeRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},note:{fontSize:10,color:'#AAC9B7'},amount:{color:'#F2D28A',fontSize:16,fontWeight:'900'},track:{height:25,justifyContent:'center',marginHorizontal:10,backgroundColor:'#365443',borderRadius:12,marginVertical:6},fill:{height:8,backgroundColor:'#D9B663',borderRadius:7},thumb:{position:'absolute',width:24,height:24,marginLeft:-12,borderRadius:12,backgroundColor:'#FCE2A5',borderWidth:3,borderColor:'#927039'}});
