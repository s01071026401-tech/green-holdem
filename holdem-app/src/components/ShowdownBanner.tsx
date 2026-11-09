import React from 'react';
import {View,Text,StyleSheet} from 'react-native';
type Winner={id:string;name:string;amount:number;handName:string};
export function ShowdownBanner({winners,you}:{winners:Winner[];you:string}){
  if(!winners.length)return null;
  return <View style={styles.box}>
    <Text style={styles.title}>🏆 HAND RESULT</Text>
    {winners.map(w=><View style={styles.row} key={w.id}>
      <Text style={styles.name}>{w.name}{w.id===you?' (나)':''}</Text>
      <Text style={styles.hand}>{w.handName}</Text>
      <Text style={styles.win}>+{w.amount.toLocaleString()} 칩</Text>
    </View>)}
    <Text style={styles.foot}>사이드 팟이 있다면 플레이어별 지급액 합산</Text>
  </View>;
}
const styles=StyleSheet.create({box:{marginTop:15,padding:16,borderRadius:14,backgroundColor:'#19372B',borderWidth:2,borderColor:'#DABB78'},title:{color:'#F1D48A',textAlign:'center',fontSize:17,fontWeight:'900',marginBottom:12},row:{paddingVertical:8,borderBottomWidth:1,borderBottomColor:'#335645'},name:{color:'white',fontSize:15,fontWeight:'800'},hand:{color:'#C6DECE',marginTop:3,fontSize:12},win:{color:'#F4D184',fontSize:18,fontWeight:'900',marginTop:2},foot:{color:'#9DBAAA',fontSize:10,marginTop:8,textAlign:'center'}});
