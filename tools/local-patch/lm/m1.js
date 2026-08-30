
function play(t,arr,i){I=i;L=1;var p=P();if(!p)return;var U=[],N=[],A=[],B=[];
arr.forEach(function(x){U.push(x.uri||"");N.push(x.title||"");A.push(x.artist||"");B.push(String(x.albumId||"0"))});
var q=p.saveLocalQueue?p.saveLocalQueue({uris:JSON.stringify(U),titles:JSON.stringify(N),artists:JSON.stringify(A),albumIds:JSON.stringify(B),index:i}):Promise.resolve();
q.then(function(){return p.playTrack({uri:t.uri,title:t.title||"Local",artist:t.artist||"",albumId:String(t.albumId||"0")})})
.then(function(){try{isPlaying=1;intendedPlaying=1;lastStationName=t.title||"Local";lastStationUrl=t.uri||"";localStorage.setItem("isPlaying","true");localStorage.setItem("intendedPlaying","true")}catch(e){}
var info=document.getElementById("currentStationInfo");if(info){var n=info.querySelector(".station-name");if(n)n.textContent=t.title||"Local"}
np(1);poll();try{if(typeof syncPlaybackUi==="function")syncPlaybackUi(true)}catch(e){}}).catch(function(e){console.log(e)})}
function np(on){var a=document.getElementById("npSeekWrap"),b=document.getElementById("npLocalOpts");if(a)a.hidden=!on;if(b)b.hidden=!on}
function poll(){if(Ptm)clearInterval(Ptm);Ptm=setInterval(function(){if(!L)return;var p=P();if(!p||!p.getPosition)return;
p.getPosition().then(function(r){if(!r)return;var pos=r.positionMs||0,dur=r.durationMs||0,s=document.getElementById("npSeek");
function f(ms){ms=0|ms/1000;return(0|ms/60)+":"+("0"+ms%60).slice(-2)}
var pp=document.getElementById("npPos"),dd=document.getElementById("npDur");if(pp)pp.textContent=f(pos);if(dd)dd.textContent=f(dur);