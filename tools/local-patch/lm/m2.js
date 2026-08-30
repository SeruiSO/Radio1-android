
if(s&&dur>0&&!s._d){s.max=1000;s.value=0|pos/dur*1000}}).catch(function(){})},500)}
function bind(){var s=document.getElementById("npSeek");
if(s&&!s._lb){s._lb=1;s.onpointerdown=function(){s._d=1};s.onpointerup=s.onchange=function(){s._d=0;var p=P();if(!p||!p.seekTo)return;p.getPosition().then(function(r){var d=r&&r.durationMs||0;if(d)p.seekTo({positionMs:0|s.value/1000*d})})}}
var sh=document.getElementById("npShuffle");if(sh&&!sh._lb){sh._lb=1;sh.onclick=function(){sh.classList.toggle("active");var p=P();if(p&&p.setShuffle)p.setShuffle({value:sh.classList.contains("active")})}}
var rp=document.getElementById("npRepeat");if(rp&&!rp._lb){rp._lb=1;rp.dataset.m="off";rp.onclick=function(){var m=["off","all","one"],i=m.indexOf(rp.dataset.m||"off");rp.dataset.m=m[(i+1)%3];rp.classList.toggle("active",rp.dataset.m!=="off");var p=P();if(p&&p.setRepeat)p.setRepeat({value:rp.dataset.m})}}
var te=document.getElementById("tabs");if(te&&!te._lh){te._lh=1;te.addEventListener("click",function(e){var b=e.target.closest(".tab-btn");if(!b)return;var t=b.dataset.tab;if(t==="local"||t==="localbest")return;L=0;np(0);if(Ptm)clearInterval(Ptm);var p=P();if(p&&p.setMode)p.setMode({mode:"radio"})},true)}}
function init(){if(!nat())return;tf();tabs();bind();var t=localStorage.getItem("currentTab");if(t==="local"||t==="localbest")setTimeout(function(){go(t)},400)}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",function(){setTimeout(init,300)});else setTimeout(init,300);setTimeout(init,1200)})();
