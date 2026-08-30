(function(){"use strict";var T=[],F=[],I=0,L=0,Ptm=null;
function P(){try{return Capacitor.Plugins.LocalMusic}catch(e){return null}}
function nat(){try{return!!(Capacitor&&Capacitor.isNativePlatform())}catch(e){return!!P()}}
function tf(){try{F=JSON.parse(localStorage.getItem("localFavorites")||"[]")}catch(e){F=[]}if(!Array.isArray(F))F=[]}
function sf(){localStorage.setItem("localFavorites",JSON.stringify(F));var p=P();if(p&&p.setFavorites)p.setFavorites({ids:JSON.stringify(F)}).catch(function(){})}
function tabs(){var el=document.getElementById("tabs");if(!el||el.querySelector('[data-tab="local"]'))return;var s=el.querySelector('[data-tab="search"]');
function mk(id,lab){var b=document.createElement("button");b.className="tab-btn";b.dataset.tab=id;b.textContent=lab;b.onclick=function(){go(id)};return b}
var a=mk("local","Local"),b=mk("localbest","Lokal Best");if(s){el.insertBefore(a,s);el.insertBefore(b,s)}else{el.appendChild(a);el.appendChild(b)}}
function go(tab){L=1;try{currentTab=tab;localStorage.setItem("currentTab",tab)}catch(e){}
document.querySelectorAll(".tab-btn").forEach(function(x){x.classList.toggle("active",x.dataset.tab===tab)});
var p=P();if(p&&p.setMode)p.setMode({mode:"local"}).catch(function(){});
var si=document.getElementById("searchInput");if(si)si.style.display="none";load(tab==="localbest")}
function load(fav){var list=document.getElementById("stationList");if(!list)return;list.innerHTML="<div class='station-item empty'>…</div>";
var p=P();if(!p){list.innerHTML="<div class='station-item empty'>N/A</div>";return}
p.requestPermission().then(function(r){if(r&&r.granted===false){list.innerHTML="<div class='station-item empty'>No access</div>";return}
return p.listTracks().then(function(res){T=res&&res.tracks||[];if(typeof T==="string")try{T=JSON.parse(T)}catch(e){T=[]}ren(fav)})}).catch(function(){list.innerHTML="<div class='station-item empty'>err</div>"})}
function ren(fav){var list=document.getElementById("stationList");if(!list)return;var arr=fav?T.filter(function(t){return F.indexOf(String(t.id))>=0}):T;
if(!arr.length){list.innerHTML="<div class='station-item empty'>empty</div>";return}var f=document.createDocumentFragment();
arr.forEach(function(t,i){var d=document.createElement("div");d.className="station-item";d.dataset.i=i;var on=F.indexOf(String(t.id))>=0;
d.innerHTML='<span class="station-name">'+(t.title||"?")+'</span> <span style="opacity:.7;font-size:12px">'+(t.artist||"")+'</span><div class="buttons-container"><button type="button" class="local-star'+(on?" on":"")+'">'+(on?"★":"☆")+"</button></div>";
d._t=t;f.appendChild(d)});list.innerHTML="";list.appendChild(f);
list.onclick=function(e){var st=e.target.closest(".local-star"),it=e.target.closest(".station-item");
if(st&&it){e.stopPropagation();var id=String(it._t.id),j=F.indexOf(id);if(j>=0)F.splice(j,1);else F.unshift(id);sf();ren(localStorage.getItem("currentTab")==="localbest");return}
if(it&&it._t)play(it._t,arr,+it.dataset.i||0)}}