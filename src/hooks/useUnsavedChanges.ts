import {useEffect} from 'react';
import {BEFORE_NAVIGATION} from '../lib/navigation';
export function useUnsavedChanges(dirty:boolean,saving=false){
 useEffect(()=>{
  if(!dirty&&!saving)return;
  const unload=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
  const navigate=(event:Event)=>{
   if(event.defaultPrevented)return;
   if(saving||!window.confirm('当前修改尚未保存，确定放弃这些修改并离开？'))event.preventDefault();
  };
  window.addEventListener('beforeunload',unload);
  window.addEventListener(BEFORE_NAVIGATION,navigate);
  return()=>{window.removeEventListener('beforeunload',unload);window.removeEventListener(BEFORE_NAVIGATION,navigate);};
 },[dirty,saving]);
}
