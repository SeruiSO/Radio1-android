(function(){
"use strict";
var T=[],F=[],I=0,L=0,Ptm=null,cur=null;
function P(){try{return Capacitor.Plugins.LocalMusic}catch(e){return null}}
function nat(){try{return!!(Capacitor&&Capacitor.isNativePlatform())}catch(e){return!!P()}}
function flag(v){try{window.__lmLocalFlag=!!v}catch(e){} L=v?1:0}
function isLoc(){try{if(window.__lmLocalFlag)return true}catch(e){}
  try{var t=localStorage.getItem("currentTab");return t==="local"||t==="localbest"}catch(e){return!!L}}
function tf(){try{F=JSON.parse(localStorage.getItem("localFavorites")||"[]")}catch(e){F=[]}if(!Array.isArray(F))F=[]}
function sf(){localStorage.setItem("localFavorites",JSON.stringify(F));var p=P();if(p&&p.setFavorites)p.setFavorites({ids:JSON.stringify(F)}).catch(function(){})}

function getFavExport(){
  var byId={};T.forEach(function(x){byId[String(x.id)]=x});
  return F.map(function(id){
    var x=byId[String(id)];
    if(x)return{id:String(x.id),title:x.title||"",artist:x.artist||"",albumId:String(x.albumId||"0")};
    return{id:String(id),title:"",artist:"",albumId:"0"};
  });
}
function applyFavImport(raw){
  if(!Array.isArray(raw))return;
  var ids=[],meta=[];
  raw.forEach(function(x){
    if(x==null)return;
    if(typeof x==="string"||typeof x==="number"){ids.push(String(x));return}
    if(typeof x==="object"&&x.id!=null){
      ids.push(String(x.id));
      meta.push({id:String(x.id),title:x.title||"",artist:x.artist||"",albumId:String(x.albumId||"0")});
    }
  });
  F=ids.slice(0,5000);
  sf();
  try{window.__lmFavMeta=meta}catch(e){}
  try{if(localStorage.getItem("currentTab")==="localbest")ren(true)}catch(e){}
}
window.__lmGetFavoritesExport=getFavExport;
window.__lmApplyFavorites=applyFavImport;
window.__lmReloadFavorites=function(){tf();try{if(localStorage.getItem("currentTab")==="localbest")ren(true)}catch(e){}};

function setCur(t){cur=t?{uri:t.uri,title:t.title,artist:t.artist,albumId:t.albumId,id:t.id}:null;try{window.__lmCur=cur}catch(e){}}
function art(albumId){
  var p=P();if(!p||!p.getArt||!albumId)return;
  p.getArt({albumId:String(albumId)}).then(function(r){
    var b64=(r&&r.base64)||"";if(!b64)return;
    var icon=document.getElementById("stationIconBtn"),np=document.getElementById("npArt");
    if(icon){icon.innerHTML="";icon.style.backgroundImage="url("+b64+")";icon.style.backgroundSize="contain";icon.style.backgroundRepeat="no-repeat";icon.style.backgroundPosition="center"}
    if(np){np.textContent="";np.style.backgroundImage="url("+b64+")"}
  }).catch(function(){})
}
function tabs(){
  var el=document.getElementById("tabs");if(!el)return;
  if(!el.querySelector('[data-tab="local"]')){
    var s=el.querySelector('[data-tab="search"]');
    function mk(id,lab){var b=document.createElement("button");b.className="tab-btn";b.dataset.tab=id;b.textContent=lab;b.setAttribute("role","tab");
      b.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();go(id)},true);return b}
    var a=mk("local","Local"),b=mk("localbest","Lokal Best");
    if(s){el.insertBefore(a,s);el.insertBefore(b,s)}else{el.appendChild(a);el.appendChild(b)}
  } else {
    el.querySelectorAll('[data-tab="local"],[data-tab="localbest"]').forEach(function(btn){
      if(btn._lmW)return;btn._lmW=1;
      btn.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();go(btn.dataset.tab)},true);
    });
  }
}
function go(tab){
  flag(true);
  try{currentTab=tab;localStorage.setItem("currentTab",tab)}catch(e){}
  document.querySelectorAll(".tab-btn").forEach(function(x){x.classList.toggle("active",x.dataset.tab===tab)});
  var p=P();if(p&&p.setMode)p.setMode({mode:"local"}).catch(function(){});
  var si=document.getElementById("searchInput");if(si)si.style.display="none";
  load(tab==="localbest");
}
function load(fav){
  var list=document.getElementById("stationList");if(!list)return;
  list.innerHTML="<div class='station-item empty'>…</div>";
  var p=P();if(!p){list.innerHTML="<div class='station-item empty'>N/A</div>";return}
  p.requestPermission().then(function(r){
    if(r&&r.granted===false){list.innerHTML="<div class='station-item empty'>No access</div>";return}
    return p.listTracks().then(function(res){
      T=res&&res.tracks||[];if(typeof T==="string")try{T=JSON.parse(T)}catch(e){T=[]}
      ren(fav);
    });
  }).catch(function(){list.innerHTML="<div class='station-item empty'>err</div>"});
}
function ren(fav){
  var list=document.getElementById("stationList");if(!list)return;
  var arr;if(fav){  var byId={};T.forEach(function(x){byId[String(x.id)]=x});  arr=[];  F.forEach(function(id){var x=byId[String(id)];if(x)arr.push(x)});}else{arr=T;}
  if(!arr.length){list.innerHTML="<div class='station-item empty'>empty</div>";return}
  var f=document.createDocumentFragment();
  arr.forEach(function(t,i){
    var d=document.createElement("div");d.className="station-item";d.dataset.i=String(i);
    d.dataset.uri=t.uri||"";d.dataset.title=t.title||"";d.dataset.artist=t.artist||"";
    d.dataset.albumId=String(t.albumId||"0");d.dataset.id=String(t.id||"");
    var on=F.indexOf(String(t.id))>=0;
    d.innerHTML='<span class="station-name">'+(t.title||"?")+'</span> <span style="opacity:.7;font-size:12px">'+(t.artist||"")+'</span><div class="buttons-container"><button type="button" class="local-star'+(on?" on":"")+'">'+(on?"★":"☆")+"</button></div>";
    d._t=t;f.appendChild(d);
  });
  list.innerHTML="";list.appendChild(f);
  list.onclick=function(e){
    var st=e.target.closest(".local-star"),it=e.target.closest(".station-item");
    if(st&&it){e.stopPropagation();var id=String(it.dataset.id||(it._t&&it._t.id)),j=F.indexOf(id);if(j>=0)F.splice(j,1);else F.unshift(id);sf();ren(localStorage.getItem("currentTab")==="localbest");return}
    if(it){var t=it._t||{uri:it.dataset.uri,title:it.dataset.title,artist:it.dataset.artist,albumId:it.dataset.albumId,id:it.dataset.id};play(t,arr,+it.dataset.i||0)}
  };
}
function play(t,arr,i){
  I=i;flag(true);setCur(t);var p=P();if(!p||!t||!t.uri)return;
  var U=[],N=[],A=[],B=[];
  (arr||[t]).forEach(function(x){U.push(x.uri||"");N.push(x.title||"");A.push(x.artist||"");B.push(String(x.albumId||"0"))});
  var q=p.saveLocalQueue?p.saveLocalQueue({uris:JSON.stringify(U),titles:JSON.stringify(N),artists:JSON.stringify(A),albumIds:JSON.stringify(B),index:i}):Promise.resolve();
  q.then(function(){return p.playTrack({uri:t.uri,title:t.title||"Local",artist:t.artist||"",albumId:String(t.albumId||"0")})})
   .then(function(){
     try{isPlaying=true;intendedPlaying=true;lastStationName=t.title||"Local";lastStationUrl=t.uri||"";
       localStorage.setItem("isPlaying","true");localStorage.setItem("intendedPlaying","true");
       localStorage.setItem("lastStationName",lastStationName);localStorage.setItem("lastStationUrl",lastStationUrl);
       if(typeof syncPlaybackUi==="function")syncPlaybackUi(true)}catch(e){}
     var info=document.getElementById("currentStationInfo");
     if(info){var n=info.querySelector(".station-name");if(n)n.textContent=t.title||"Local";
       var g=info.querySelector(".station-genre");if(g)g.textContent="артист: "+(t.artist||"—");
       var c=info.querySelector(".station-country");if(c)c.textContent="локальний трек"}
     art(t.albumId);np(1);poll();
   }).catch(function(e){console.log("lm play",e)});
}
function np(on){var a=document.getElementById("npSeekWrap"),b=document.getElementById("npLocalOpts");if(a)a.hidden=!on;if(b)b.hidden=!on}
function poll(){if(Ptm)clearInterval(Ptm);Ptm=setInterval(function(){
  if(!isLoc())return;var p=P();if(!p||!p.getPosition)return;
  p.getPosition().then(function(r){if(!r)return;var pos=r.positionMs||0,dur=r.durationMs||0,s=document.getElementById("npSeek");
    function f(ms){ms=0|ms/1000;return(0|ms/60)+":"+("0"+ms%60).slice(-2)}
    var pp=document.getElementById("npPos"),dd=document.getElementById("npDur");if(pp)pp.textContent=f(pos);if(dd)dd.textContent=f(dur);
    if(s&&dur>0&&!s._d){s.max=1000;s.value=0|pos/dur*1000}
    if(typeof r.isPlaying==="boolean"){try{if(typeof syncPlaybackUi==="function")syncPlaybackUi(!!r.isPlaying)}catch(e){}}
  }).catch(function(){})},500)}
function pauseCur(){
  try{var plug=Capacitor.Plugins.BluetoothAutoPlay;if(plug&&plug.pause)plug.pause()}catch(e){}
  try{isPlaying=false;intendedPlaying=false;localStorage.setItem("isPlaying","false");localStorage.setItem("intendedPlaying","false");
    if(typeof syncPlaybackUi==="function")syncPlaybackUi(false)}catch(e){}
}
function playCur(){if(cur&&cur.uri){play(cur,T.length?T:[cur],I);return true}return false}
function skip(next){var p=P();if(!p||!p.skip)return;p.skip({next:!!next}).then(function(){setTimeout(refreshFromNative,120);setTimeout(refreshFromNative,400)}).catch(function(){})}

function refreshFromNative(){
  var p=P();if(!p||!p.getQueueState)return;
  p.getQueueState().then(function(st){
    if(!st||st.mode&&st.mode!=="local")return;
    I=st.index|0;
    var t={uri:st.uri||"",title:st.title||"Local",artist:st.artist||"",albumId:st.albumId||"0",id:""};
    setCur(t);
    try{
      lastStationName=t.title;lastStationUrl=t.uri||lastStationUrl;
      localStorage.setItem("lastStationName",lastStationName);
      localStorage.setItem("lastStationUrl",lastStationUrl||"");
      isPlaying=true;intendedPlaying=true;
      localStorage.setItem("isPlaying","true");localStorage.setItem("intendedPlaying","true");
      if(typeof syncPlaybackUi==="function")syncPlaybackUi(true);
    }catch(e){}
    var info=document.getElementById("currentStationInfo");
    if(info){
      var n=info.querySelector(".station-name");if(n)n.textContent=t.title||"Local";
      var g=info.querySelector(".station-genre");if(g)g.textContent="артист: "+(t.artist||"—");
      var c=info.querySelector(".station-country");if(c)c.textContent="локальний трек";
    }
    var npTitle=document.getElementById("npTitle");if(npTitle)npTitle.textContent=t.title||"Local";
    var npSub=document.getElementById("npSub");if(npSub)npSub.textContent=t.artist||"";
    art(t.albumId);
    // highlight in list
    var list=document.getElementById("stationList");
    if(list){
      list.querySelectorAll(".station-item").forEach(function(el){
        var match=false;
        if(t.uri&&el.dataset.uri===t.uri)match=true;
        if(!match&&t.title&&el.dataset.title===t.title)match=true;
        el.classList.toggle("selected",match);
      });
      var sel=list.querySelector(".station-item.selected");
      if(sel&&sel.scrollIntoView)try{sel.scrollIntoView({block:"nearest",behavior:"smooth"})}catch(e){}
    }
    // empty album art fallback
    if(!t.albumId||String(t.albumId)==="0"){
      var icon0=document.getElementById("stationIconBtn"),np0=document.getElementById("npArt");
      if(icon0){icon0.style.backgroundImage="none";icon0.innerHTML="🎵"}
      if(np0){np0.style.backgroundImage="none";np0.textContent="🎵"}
    }
  }).catch(function(){});
}
window.__lmRefreshFromNative=refreshFromNative;
window.refreshFromNative=refreshFromNative;

function onCtrl(e,which){
  if(!isLoc())return;
  e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
  if(which==="prev")skip(false);
  else if(which==="next")skip(true);
  else if(which==="play"){var playing=false;try{playing=!!isPlaying}catch(e){} if(playing)pauseCur();else playCur()}
}
function bindCtrl(){
  function wire(sel,which){var el=typeof sel==="string"?document.querySelector(sel):sel;if(!el||el._lmC)return;el._lmC=1;
    el.addEventListener("click",function(e){onCtrl(e,which)},true)}
  wire(".controls .control-btn:nth-child(1)","prev");
  wire(".controls .control-btn:nth-child(2)","play");
  wire(".controls .control-btn:nth-child(3)","next");
  wire("#npPrev","prev");wire("#npPlay","play");wire("#npNext","next");
  var s=document.getElementById("npSeek");
  if(s&&!s._lb){s._lb=1;s.onpointerdown=function(){s._d=1};s.onpointerup=s.onchange=function(){s._d=0;var p=P();if(!p||!p.seekTo)return;p.getPosition().then(function(r){var d=r&&r.durationMs||0;if(d)p.seekTo({positionMs:0|s.value/1000*d})})}}
  var sh=document.getElementById("npShuffle");if(sh&&!sh._lb){sh._lb=1;sh.onclick=function(){sh.classList.toggle("active");var p=P();if(p&&p.setShuffle)p.setShuffle({value:sh.classList.contains("active")})}}
  var rp=document.getElementById("npRepeat");if(rp&&!rp._lb){rp._lb=1;rp.dataset.m="off";rp.onclick=function(){var m=["off","all","one"],i=m.indexOf(rp.dataset.m||"off");rp.dataset.m=m[(i+1)%3];rp.classList.toggle("active",rp.dataset.m!=="off");var p=P();if(p&&p.setRepeat)p.setRepeat({value:rp.dataset.m})}}
}
function bindTabsWatch(){
  var el=document.getElementById("tabs");if(!el||el._lmObs)return;el._lmObs=1;
  new MutationObserver(function(){setTimeout(tabs,20)}).observe(el,{childList:true});
  document.addEventListener("click",function(e){
    var b=e.target.closest(".tab-btn");if(!b)return;var t=b.dataset.tab;
    if(t==="local"||t==="localbest")flag(true);
    else if(t){flag(false);np(0);if(Ptm){clearInterval(Ptm);Ptm=null}
      var p=P();if(p&&p.setMode)p.setMode({mode:"radio"}).catch(function(){})}
  },true);
}

function bindResumeSync(){
  if(window.__lmResumeBound)return;window.__lmResumeBound=1;
  function tryRefresh(){
    if(!isLoc())return;
    setTimeout(refreshFromNative,80);
    setTimeout(refreshFromNative,350);
  }
  document.addEventListener("visibilitychange",function(){if(!document.hidden)tryRefresh()});
  window.addEventListener("pageshow",tryRefresh);
  window.addEventListener("focus",tryRefresh);
  document.addEventListener("resume",tryRefresh);
}

function init(){
  if(!nat())return;tf();tabs();bindCtrl();bindTabsWatch();bindResumeSync();
  window.__lmGo=go;window.__lmTabs=tabs;
  var t=localStorage.getItem("currentTab");
  if(t==="local"||t==="localbest")setTimeout(function(){go(t)},400);
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",function(){setTimeout(init,300)});
else setTimeout(init,300);
setTimeout(init,1200);
})();


/* lm-block-radio: media-next/prev/online must not start radio while local */
(function(){
  function loc(){try{return!!window.__lmLocalFlag}catch(e){return false}
    try{var t=localStorage.getItem("currentTab");return t==="local"||t==="localbest"}catch(e){return false}}
  function stopRadio(e){
    if(!loc())return;
    e.stopImmediatePropagation();
    e.preventDefault();
  }
  ["media-next","media-prev","media-next-sync","media-prev-sync"].forEach(function(ev){
    window.addEventListener(ev,function(e){
      if(!loc())return;
      stopRadio(e);
      try{
        var rf=window.__lmRefreshFromNative||window.refreshFromNative;
        if(typeof rf==="function"){rf();setTimeout(rf,200);setTimeout(rf,500)}
      }catch(err){}
    },true);
  });
  window.addEventListener("online",function(e){
    if(!loc())return;
    e.stopImmediatePropagation();
    // local content:// — не чіпаємо, сервіс і так isLocalMode
  },true);
})();
