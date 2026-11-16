export function createAutoBrowse({getPlaces,onPlace,onPhoto,onState=()=>{},setTimer=setTimeout,clearTimer=clearTimeout}){
  let active=false,revision=0,timers=[],positions=new Map(),placeIndex=0;
  function clear(){timers.forEach(clearTimer);timers=[];}
  function stop(){active=false;revision++;clear();onState(false);}
  async function visit(ticket){
    const places=getPlaces();if(!active||!places.length){stop();return;}
    placeIndex%=places.length;const place=places[placeIndex],index=(positions.get(place.id)||0)%Math.max(1,place.photos.length);
    let ready;try{ready=await onPlace(place,index);}catch{stop();return;}if(!active||ticket!==revision)return;if(ready===false){stop();return;}
    positions.set(place.id,(index+1)%Math.max(1,place.photos.length));
    if(place.photos.length>1)for(const offset of [1,2])timers.push(setTimer(()=>{
      if(active&&ticket===revision){const next=(index+offset)%place.photos.length;positions.set(place.id,(next+1)%place.photos.length);const failed=()=>{if(ticket===revision)stop();};try{Promise.resolve(onPhoto(next)).catch(failed);}catch{failed();}}
    },offset*2000));
    timers.push(setTimer(()=>{if(active&&ticket===revision){clear();placeIndex++;visit(ticket);}},5000));
  }
  return {get active(){return active;},start(id){stop();const places=getPlaces();if(!places.length)return;placeIndex=Math.max(0,places.findIndex(place=>place.id===id));active=true;const ticket=++revision;onState(true);visit(ticket);},stop};
}
