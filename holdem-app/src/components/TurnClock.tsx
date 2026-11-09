import React,{useEffect,useState} from 'react';
import {View,Text,StyleSheet} from 'react-native';
export function TurnClock({deadline,totalSeconds,label}:{deadline:number;totalSeconds:number;label:string}){
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),300);return()=>clearInterval(id);},[]);
  const remaining=deadline>0?Math.max(0,Math.ceil((deadline-now)/1000)):0;
  const pct=Math.max(0,Math.min(1,remaining/Math.max(1,totalSeconds)));
  return <View style={styles.root}>
    <View style={styles.row}><Text style={styles.label}>⏱ {label}</Text><Text style={[styles.time,remaining<=8&&{color:'#FF8585'}]}>{remaining}초</Text></View>
    <View style={styles.track}><View style={[styles.fill,{width:`${pct*100}%`,backgroundColor:remaining<=8?'#DB5B58':'#E5C47C'}]}/></View>
  </View>;
}
const styles=StyleSheet.create({root:{backgroundColor:'#142E23',padding:10,borderRadius:10,marginBottom:10},row:{flexDirection:'row',justifyContent:'space-between'},label:{color:'#D7E6D9',fontWeight:'700',fontSize:12},time:{color:'#E5C47C',fontWeight:'900'},track:{height:6,backgroundColor:'#355342',borderRadius:4,overflow:'hidden',marginTop:6},fill:{height:6,borderRadius:4}});
