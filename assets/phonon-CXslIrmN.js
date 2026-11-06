import{t as e}from"./index-DhleG29z.js";var t=512;function n(e,t,n){let r=t.length,i=new Float32Array(n);for(let a=0;a<n;a++){let n=0;for(let i=0;i<r;i++)n+=e[a*r+i]*t[i];i[a]=n}return i}function r(e,r){let i=new Float32Array(128);for(let e=0;e<64;e++){let t=1e3*r/1e4**(e/63);i[e]=Math.cos(t),i[64+e]=Math.sin(t)}let a=n(e.speakersProj,e.speakers,t),o=n(e.durationProj,i,t);for(let e=0;e<t;e++)a[e]+=o[e];let s=n(e.latentProj,e.bos,t);for(let e=0;e<t;e++)s[e]+=a[e];return{cond:a,bos:s}}var i=[[.77,.6],[.8,.45],[.84,.3],[.93,.15],[1,0],[1.07,-.15],[1.22,-.3],[1.3,-.45]];function a(e){let t=i.findIndex(([t])=>e<=t);if(t===0)return i[0][1];if(t<0)return i.at(-1)[1];let[n,r]=i[t-1],[a,o]=i[t];return r+(e-n)/(a-n)*(o-r)}var o={pos:0,frame:1,end:2,chunk:3,text:4,after:5,seed:6,scale:7},s=32,c=e=>Object.keys(e.tensors).filter(e=>/^l\d+\.qkv$/.test(e)).length;function l(e){let t=new DataView(e),n=Number(t.getBigUint64(0,!0)),r=JSON.parse(new TextDecoder().decode(new Uint8Array(e,8,n))),i=8+n,a=new Map;for(let[t,n]of Object.entries(r)){if(t===`__metadata__`)continue;let[r,o]=n.data_offsets,s=e.slice(i+r,i+o),c;if(n.dtype===`F32`)c=new Float32Array(s);else if(n.dtype===`BF16`){let e=new Uint16Array(s),t=new Uint32Array(e.length);for(let n=0;n<e.length;n++)t[n]=e[n]<<16;c=new Float32Array(t.buffer)}else throw Error(`Unexpected tensor type ${n.dtype} for ${t}`);a.set(t,{shape:n.shape,data:c})}return a}function u(e){let t=new Float32Array(1),n=new Uint32Array(t.buffer),r=new Uint16Array(e.length);for(let i=0;i<e.length;i++){t[0]=e[i];let a=n[0],o=a>>>16&32768,s=a>>>23&255,c=a&8388607;if(s===255){r[i]=o|31744|(c?512:0);continue}let l=s-127+15;if(l>=31){r[i]=o|31744;continue}if(l<=0){if(l<-10){r[i]=o;continue}c|=8388608;let e=14-l,t=c>>e,n=c&(1<<e)-1,a=1<<e-1;(n>a||n===a&&t&1)&&t++,r[i]=o|t;continue}let u=l<<10|c>>13,d=c&8191;(d>4096||d===4096&&u&1)&&u++,r[i]=o|u}return r}function d(e){let t=new DataView(e).getUint32(0,!0),n=JSON.parse(new TextDecoder().decode(new Uint8Array(e,4,t))),r=Math.ceil((4+t)/4)*4,i={};for(let[t,a]of n.pace)i[t]=new Float32Array(e,r,a),r+=a*4;return{tensors:n.tensors,pace:i,blob:new Uint8Array(e,r)}}function f(e){let t=Object.fromEntries(Object.entries(e.pace).map(([e,t])=>[e,t.slice()]));return{tensors:e.tensors,pace:t,blob:new Uint8Array}}function p(e){let t=l(e).get(`speaker_wavs`);if(!t)throw Error(`The voice file has no speaker_wavs`);let[,n,r]=t.shape,i=new Float32Array(r*n);for(let e=0;e<n;e++)for(let a=0;a<r;a++)i[a*n+e]=t.data[e*r+a];return i}var m=(e,t,n)=>`https://huggingface.co/${e}/resolve/${t}/${n}`,h=`phonon-webgpu`,g={en:`Delia`,fr:`Augustin`,de:`Mats`,es:`Marcos`,pt:`Davi`},_=`blixt/phonon-40m-webgpu`,v=`dde41aa27ed6bed7c874621d8b17e77dfece21bf`,y=(e,t,n,r)=>({source:{repo:`gradium/${e}`,revision:t},weights:m(_,v,`${e}.int8.bin`),tokenizer:m(_,v,`${e}.tokenizer.5.0.0.json`),languages:n,license:`CC-BY-NC-4.0`,align:r}),b={repo:`gradium/phonon-31m-en`,revision:`92741c5b07d085ff840e26fea8ce43110b87852f`},x={"phonon-31m-en":{source:b,weights:m(`blixt/phonon-31m-en-webgpu`,`f4635a6dddaa6072451e0155c03c97fbe889b6ec`,`phonon-31m-en.int8.bin`),tokenizer:m(b.repo,b.revision,`tokenizer.5.0.0.json`),languages:[`en`],license:`Apache-2.0`,align:{layer:3,head:0,lag:3}},"phonon-40m-en":y(`phonon-40m-en`,`bc7e8ae7e543a7a3e4604753e42fbda76ddf0781`,[`en`],{layer:6,head:0,lag:3}),"phonon-40m-fr":y(`phonon-40m-fr`,`d91086970206b88efd2c88ca971d0628b5968f0f`,[`fr`],{layer:4,head:1,lag:3}),"phonon-40m-de":y(`phonon-40m-de`,`79cfc7b47fcfc0b666657b981eb366415023a862`,[`de`],{layer:3,head:5,lag:2}),"phonon-40m-es":y(`phonon-40m-es`,`e5e052b26e31abd5918ade71d3135e69d51a66f8`,[`es`],{layer:4,head:6,lag:3}),"phonon-40m-pt":y(`phonon-40m-pt`,`4cbfd742a1555d60eb5399c6d296e9f2e07389e9`,[`pt`],{layer:4,head:2,lag:3}),"phonon-40m-multilingual":y(`phonon-40m-multilingual`,`1537ce46c64f42903e0d608b132ccb073dac46d2`,[`en`,`fr`,`de`,`es`,`pt`],{layer:4,head:1,lag:3})},S=`gradium/phonon-voices`,C=`0ee17205f254b5abc43b266c8a0f215565c352f7`,w=m(S,C,`voices.jsonl`),ee=e=>m(S,C,`voices/${e}.safetensors`);async function T(){try{return await caches.open(h)}catch{return null}}async function te(e){try{return await(await T())?.match(e)}catch{return}}async function ne(e,t){try{await(await T())?.put(e,new Response(t))}catch{}}async function re(e,t){let n=await fetch(e);if(!n.ok||!n.body)throw Error(`The voice model could not download (${n.status}).`);let r=Number(n.headers.get(`content-length`))||0,i=[],a=0,o=n.body.getReader();for(;;){let{done:e,value:n}=await o.read();if(e)break;i.push(n),a+=n.byteLength,r&&t&&t(Math.min(100,Math.round(a/r*100)))}let s=new Uint8Array(a),c=0;for(let e of i)s.set(e,c),c+=e.byteLength;return s}async function E(e,t){let n=await te(e);if(n)return n.arrayBuffer();let r=await re(e,t);return await ne(e,r),r.buffer}var D=512,O=2048,k=125,A=1024,j=768,M=[64,128,192,256],ie=4294967294,ae=4294967295,N=`1e-5`,oe=`1e-6`,se=`10000.0`,ce=`4.0`,P=8;function le(e,t){let n=n=>e.buffer(t*n*4);return{x:n(D),h:n(D),qkv:n(3*D),q:n(D),att:n(D),ff:n(O)}}function ue(e,t,n){let{B:r,rows:i,cache:a}=n,o=a.kind===`codec`?`chunk`:n.text?`text`:`none`,s={rows:i,pos0:n.pos0},c=[e.layernorm(r.x,r.h,i,`${t}.ln1.w`,`${t}.ln1.b`,N,o),...e.gemm(r.h,`${t}.qkv`,r.qkv,{M:i,K:D,N:3*D,gate:o}),e.ropeKV(r.qkv,r.q,n.kc,n.vc,s,{theta:se,cache:a,gate:o})];return n.kvOnly?c:[...c,e.attention(r.q,n.kc,n.vc,r.att,s,{cache:a,gate:o}),...e.gemm(r.att,`${t}.o`,r.x,{M:i,K:D,N:D,res:`add`,rbuf:r.x,gate:o}),e.layernorm(r.x,r.h,i,`${t}.ln2.w`,`${t}.ln2.b`,N,o),...e.gemm(r.h,`${t}.fc1`,r.ff,{M:i,K:D,N:O,act:`gelu`,gate:o}),...e.gemm(r.ff,`${t}.fc2`,n.out?.buf??r.x,{M:i,K:O,N:D,res:`add`,rbuf:r.x,yo:n.out?.yo??0,gate:o})]}var de=class{lats;step;align;g;rows;kc;vc;ids;bos;voiceIn;voiceOps;prefills;tail;cond;ada;fh;ft;z;lat;parts;depth;alignLayer;alignAt;constructor(e,t,n){this.g=e,this.depth=t,this.alignLayer=n.layer,this.alignAt={lo:k,width:240,head:n.head};let r=M.at(-1);this.rows=le(e,r),this.kc=Array.from({length:t},()=>e.buffer(A*D*e.kvBytes)),this.vc=Array.from({length:t},()=>e.buffer(A*D*e.kvBytes)),this.cond=e.buffer(D*4),this.ada=e.buffer(40960),this.fh=e.buffer(D*4),this.ft=e.buffer(D*4),this.z=e.buffer(128),this.lat=e.buffer(128),this.lats=e.buffer(j*32*4),this.ids=e.buffer(r*4),this.bos=e.buffer(D*4),this.parts=e.buffer(P*8*66*4),this.voiceIn=e.buffer(k*D*4),this.align=e.buffer(j*240*4),this.tail=this.tailOps(),this.step=[...Array.from({length:t},(e,t)=>this.stepLayer(t)).flat(),...this.tail],this.voiceOps=[...e.gemm(this.voiceIn,`prompt_proj`,this.rows.x,{M:k,K:D,N:D,gate:`none`}),...this.layers(k)],this.prefills=new Map(M.map(t=>[t,[e.embedRows(this.ids,this.rows.x,t,{bos:ie,pad:ae}),...this.layers(t,k)]]))}layers(e,t=0){let{g:n}=this;return Array.from({length:this.depth},(r,i)=>[...ue(n,`l${i}`,{B:this.rows,rows:e,kc:this.kc[i],vc:this.vc[i],cache:{kind:`lm`},pos0:t,kvOnly:!t&&i===this.depth-1,text:t>0}),...t&&i===this.alignLayer?[n.alignRow(this.rows.q,this.kc[i],this.align,this.alignAt)]:[]]).flat()}voice(e){let{g:t}=this,n=k*D*t.kvBytes,r=t.buffer(2*this.depth*n);t.write(this.voiceIn,0,e);let i=t.encoder();i.run(this.voiceOps);for(let e=0;e<this.depth;e++)i.copy(this.kc[e],0,r,2*e*n,n),i.copy(this.vc[e],0,r,(2*e+1)*n,n);return i.submit(),r}start(e,t,n,r,i,a){let{g:s}=this,c=M.find(e=>e>t.length),l=new Uint32Array(c).fill(ae);l.set(t),l[t.length]=ie,s.write(this.ids,0,l);let u=new Uint32Array(8);u[o.pos]=k+t.length,u[o.after]=a,u[o.text]=t.length,u[o.seed]=r>>>0,new Float32Array(u.buffer)[o.scale]=Math.sqrt(i),s.write(s.state,0,u);let d=k*D*s.kvBytes;for(let t=0;t<this.depth;t++)e.copy(n,2*t*d,this.kc[t],0,d),e.copy(n,(2*t+1)*d,this.vc[t],0,d);e.run(this.prefills.get(c)),e.copy(this.rows.x,t.length*D*4,this.bos,0,D*4),e.copy(this.bos,0,this.rows.x,0,D*4),e.run(this.tail)}stepLayer(e){let{g:t}=this,n=this.rows,r=`l${e}`;return[t.gemv(n.x,`${r}.qkv`,n.qkv,{K:D,N:3*D,ln:{w:`${r}.ln1.w`,b:`${r}.ln1.b`,eps:N}}),t.attnStep(n.qkv,this.kc[e],this.vc[e],this.parts,{splits:P,theta:se,align:e===this.alignLayer?{at:this.alignAt,buf:this.align}:void 0}),t.gemv(null,`${r}.o`,n.x,{K:D,N:D,res:`add`,rbuf:n.x,combine:{splits:P,parts:this.parts}}),t.gemv(n.x,`${r}.fc1`,n.ff,{K:D,N:O,act:`gelu`,ln:{w:`${r}.ln2.w`,b:`${r}.ln2.b`,eps:N}}),t.gemv(n.ff,`${r}.fc2`,n.x,{K:O,N:D,res:`add`,rbuf:n.x})]}tailOps(){let{g:e}=this,t=this.rows.x,n=Array.from({length:6},(t,n)=>{let r=n*1536;return[e.gemv(this.fh,`fh${n}.fc1.w`,this.ft,{K:D,N:D,bias:`fh${n}.fc1.b`,act:`silu`,ln:{w:`fh${n}.ln.w`,b:`fh${n}.ln.b`,eps:oe,mod:this.ada,ho:r,so:r+512}}),e.gemv(this.ft,`fh${n}.fc2.w`,this.fh,{K:D,N:D,bias:`fh${n}.fc2.b`,res:`gate`,rbuf:this.fh,gbuf:this.ada,go:r+1024})]}).flat();return[e.gemv(t,`fh.cond.w`,this.cond,{K:D,N:D,bias:`fh.cond.b`,act:`silu`,ln:{w:`norm.w`,b:`norm.b`,eps:N}}),e.gemv(this.cond,`fh.ada.w`,this.ada,{K:D,N:10240,bias:`fh.ada.b`}),e.noise(this.z),e.gemv(this.z,`fh.in.w`,this.fh,{K:32,N:D,bias:`fh.in.b`}),...n,e.gemv(this.fh,`fh.out.w`,this.lat,{K:D,N:32,bias:`fh.out.b`,res:`add`,rbuf:this.z,ln:{eps:oe,mod:this.ada,ho:9216,so:9728}}),e.finishStep(t,this.lat,this.lats,{eps:N,threshold:ce}),e.gemv(this.lat,`latent_proj`,t,{K:32,N:D,res:`vec`,vname:`cond`})]}},F=[1,2,4,8],fe=8,I=1920,pe=251,L=512,me=class{audio;g;ops;stages;constructor(e,t){this.g=e;let n=16*fe,r=(t,r,i)=>({ctx:t,rate:r,ch:i,buf:e.buffer((t+r*n)*i*4)}),i=r(6,1,512),a=r(1,1,512),o=r(2,6,256),s=r(0,6,128),c=r(1,6,256),l=r(2,30,128),u=r(0,30,64),d=r(1,30,128),f=r(2,120,64),p=r(0,120,32),m=r(2,120,64);this.stages=[i,a,o,c,l,d,f,m],this.audio=e.buffer(fe*I*4);let h=le(e,n),g=[0,1].map(()=>({kc:e.buffer(L*D*4),vc:e.buffer(L*D*4)})),_=`chunk`,v=n=>{let r=16*n,v=(t,n,i,a)=>{if(n.ctx!==a.k-1)throw Error(`${t} reads ${n.ctx} rows of context`);let o=i===this.audio?{buf:i,ctx:0}:i;return e.gemm(n.buf,`${t}.w`,o.buf,{M:n.rate*r,K:a.k*a.cin,N:a.cout,bias:`${t}.b`,load:`conv`,conv:{cin:a.cin,k:a.k,dil:1,elu:a.elu},res:a.res?`add`:`none`,rbuf:a.res?.buf,ro:a.res?a.res.ctx*a.cout:0,yo:o.ctx*a.cout,gate:_})},y=(t,n,i,a)=>e.gemm(n.buf,`${t}.w`,i.buf,{M:n.rate*r,K:2*a.cin,N:a.cout,bias:`${t}.b`,load:`convT`,conv:{cin:a.cin,elu:!0,stride:a.s},yo:i.ctx*a.cout,gate:_});return[e.upsample(t,h.x,r),...[0,1].flatMap(t=>ue(e,`d${t}`,{B:h,rows:r,...g[t],cache:{kind:`codec`,window:pe,ring:L},pos0:0,out:t===1?{buf:i.buf,yo:i.ctx*512}:void 0})),...v(`s0`,i,a,{cin:512,cout:512,k:7,elu:!1}),...y(`s1`,a,o,{cin:512,cout:256,s:6}),...v(`s1r1`,o,s,{cin:256,cout:128,k:3,elu:!0}),...v(`s1r2`,s,c,{cin:128,cout:256,k:1,elu:!0,res:o}),...y(`s2`,c,l,{cin:256,cout:128,s:5}),...v(`s2r1`,l,u,{cin:128,cout:64,k:3,elu:!0}),...v(`s2r2`,u,d,{cin:64,cout:128,k:1,elu:!0,res:l}),...y(`s3`,d,f,{cin:128,cout:64,s:4}),...v(`s3r1`,f,p,{cin:64,cout:32,k:3,elu:!0}),...v(`s3r2`,p,m,{cin:32,cout:64,k:1,elu:!0,res:f}),...v(`s4`,m,this.audio,{cin:64,cout:1,k:3,elu:!0}),e.shiftRows(this.stages,r)]};this.ops=new Map(F.map(e=>[e,v(e)]))}reset(e){for(let t of this.stages)e.clear(t.buf,0,t.ctx*t.ch*4)}encodeChunk(e,t,n){this.g.write(this.g.state,o.chunk*4,new Uint32Array([16*t])),e.run(this.ops.get(n))}},he=.3,ge=1,_e=3,ve=4,ye=12.5,R=16,z=Math.max(...F),be=class{g;model;lm;codec;voices=new Map;stages;rowsAt;pace=NaN;turn=Promise.resolve();constructor(e,t,n){this.model=t,this.g=e,this.lm=new de(this.g,c(t),n),this.codec=new me(this.g,this.lm.lats),this.rowsAt=R+z*I*4,this.stages=Array.from({length:e.depth},()=>e.staging(this.rowsAt+z*240*4)),this.setPace(0)}ready(){return this.g.ready()}addVoice(e,t){if(t.length!==k*D)throw Error(`Voice ${e} has ${t.length} values`);this.voices.set(e,this.lm.voice(t))}hasVoice(e){return this.voices.has(e)}setPace(e){if(e===this.pace)return;this.pace=e;let{cond:t,bos:n}=r(this.model.pace,e);for(let[e,r]of[[`cond`,t],[`bos_embed`,n]])this.g.write(this.g.weights,this.model.tensors[e].offset,u(r))}synthesize(e,t,n={}){let r=this.turn.then(()=>this.run(e,t,n));return this.turn=r.then(()=>{},()=>{}),r}async run(e,t,{seed:n=1,words:r=1/0,pace:i=0,latents:a,cancelled:s=()=>!1,onChunk:c,onRows:l}){if(!this.voices.has(t)){if(!a)throw Error(`Unknown voice ${t}`);this.addVoice(t,a)}let u=this.voices.get(t);if(this.setPace(i),!e.length)return{chunks:[]};if(e.length>240)throw Error(`Text too long: ${e.length} tokens`);let{g:d,lm:f,codec:p}=this,m=Math.min(j,A-k-e.length-1,Math.ceil((e.length/3+2)*ye)),h=r<=ve?_e:ge,g=d.encoder();p.reset(g),f.start(g,e,u,n,he,h),g.submit();let _=1,v=0,y=0,b=0,x=null,S=[],C=[...this.stages],w=[],ee=()=>{let e=C.pop();g=d.encoder();let t=F[Math.min(y,F.length-1)],n=Math.min(m,x??Math.max(_,v+t)),r=[];for(;_<n;_++)r.push(...f.step);g.run(r);let i=x??_,a=-1;v<i&&(v+t<=i||x!==null)&&(a=v,p.encodeChunk(g,a,t),v+=t,y++),g.read(d.state,0,e,0,16),a>=0&&g.read(p.audio,0,e,R,t*I*4);let o=b;if(_>o){if(_-o>z)throw Error(`${_-o} alignment rows in one submit`);g.read(f.align,o*960,e,this.rowsAt,(_-o)*960),b=_}g.submit(),w.push({stage:e,f0:a,size:t,n:_,r0:o,ready:e.map()})},T=async()=>{let t=w.shift();await t.ready;let n=t.stage.range(),r=new Uint32Array(n,0,4)[o.end];x===null&&r&&(x=Math.min(r,m)),x===null&&t.n>=m&&(x=m);let i=Math.min(t.n,x??1/0);if(l&&i>t.r0){let r=e.length,a=new Float32Array(n,this.rowsAt,(t.n-t.r0)*240),o=new Float32Array((i-t.r0)*r);for(let e=0;e<i-t.r0;e++)o.set(a.subarray(e*240,e*240+r),e*r);l(o)}if(t.f0>=0&&(x===null||t.f0<x)){let e=Math.min(t.size,(x??1/0)-t.f0),r=new Float32Array(n,R,e*I).slice();S.push(r),c?.(r)}t.stage.unmap(),C.push(t.stage)},te=()=>x!==null&&v>=x&&_>=x;for(;;){for(;!s()&&w.length<d.depth&&!te();)ee();if(!w.length)break;await T()}return s()?null:{chunks:S}}},B={layernorm:[`go`,`bo`],rows:[`rows`,`pos0`],embedRows:[`eo`,`eso`,`bo`],upsample:[`T`,`wo`,`wso`,`mo`,`so`],shiftRows:[`T`],gemm:[`M`,`yo`,`ro`,`rows`,`wo`,`bo`,`wso`],gemmReduce:[`rows`,`yo`,`ro`,`stride`,`bo`],gemv:[`xo`,`yo`,`ro`,`go`,`so`,`ho`,`wo`,`bo`,`vo`,`lgo`,`lbo`,`wso`],finishStep:[`ewo`,`ebo`,`ngo`,`nbo`]};function V(e,t={}){let n=Array.from({length:(4-e.length%4)%4},(e,t)=>`p${t}`);return`struct P { ${[...e,...n].map(e=>`${e}: ${t[e]??`u32`}`).join(`, `)} }`}var{pos:H,frame:U,end:W,chunk:G,text:xe,after:Se,seed:Ce,scale:we}=o,K={none:``,step:`if (st[${W}] != 0u && st[${U}] >= st[${W}]) { return; }`,chunk:`if (st[${W}] != 0u && st[${G}] / 16u >= st[${W}]) { return; }`,text:``},q=`
fn hf(i: u32) -> f32 { let f = unpack2x16float(wv[i >> 3u][(i >> 1u) & 3u]); return select(f.x, f.y, (i & 1u) == 1u); }
fn h4(i: u32) -> vec4<f32> { let q = wv[i >> 3u]; return select(vec4<f32>(unpack2x16float(q.x), unpack2x16float(q.y)), vec4<f32>(unpack2x16float(q.z), unpack2x16float(q.w)), (i & 4u) != 0u); }`,Te=(e,t,n)=>`(f32(unpack4xI8(wv[(${e}) / 4u + (${n}) / 16u][((${n}) / 4u) % 4u])[(${n}) % 4u]) * hf(${t} + (${n}) / ${s}u))`,J=`
fn gelu(v: f32) -> f32 {
  // erf via Abramowitz-Stegun 7.1.26 is too coarse; use a high-precision rational erf.
  let z = v * 0.70710678118654752;
  let a = abs(z);
  let t = 1.0 / (1.0 + 0.5 * a);
  let r = t * exp(-a * a - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  let erfz = select(r - 1.0, 1.0 - r, z >= 0.0);
  return 0.5 * v * (1.0 + erfz);
}
fn silu(v: f32) -> f32 { return v / (1.0 + exp(-v)); }`;function Y(e,t){return e===`gelu`?`gelu(${t})`:e===`silu`?`silu(${t})`:t}function X(e,t){return{none:``,add:`v = r[${t}] + v;`,add_y:`v = y[o] + v;`,gate:`v = r[${t}] + gv[p.go + n] * v;`,gate_y:`v = y[o] + gv[p.go + n] * v;`,vec:`v = v + hf(p.vo + n);`}[e]}function Ee(e){if(e===32)return`fn sumSeg(v: f32, li: u32) -> f32 { return subgroupAdd(v); }`;let t=`var t = v;`;for(let n=e/2;n>=1;n/=2)t+=` t += subgroupShuffleXor(t, ${n}u);`;return`fn sumSeg(v: f32, li: u32) -> f32 { ${t} return t; }`}function De({eps:e,gate:t}){return`
${V(B.layernorm)}
@group(0) @binding(0) var<storage, read> x: array<f32>;
@group(0) @binding(1) var<storage, read_write> y: array<f32>;
@group(0) @binding(2) var<storage, read> wv: array<vec4<u32>>;
@group(0) @binding(3) var<uniform> p: P;
@group(0) @binding(4) var<storage, read> st: array<u32>;
var<workgroup> red: array<f32, 128>;
${q}
@compute @workgroup_size(128)
fn main(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  _ = &x; _ = &y; _ = &wv; _ = &st;
  ${K[t]}
  let base = wid.x * 512u;
  var v: array<f32, 4>;
  var s = 0.0;
  for (var i = 0u; i < 4u; i++) { v[i] = x[base + li + i * 128u]; s += v[i]; }
  red[li] = s; workgroupBarrier();
  for (var k = 64u; k > 0u; k >>= 1u) { if (li < k) { red[li] += red[li + k]; } workgroupBarrier(); }
  let mean = red[0] / 512.0;
  workgroupBarrier();
  var q = 0.0;
  for (var i = 0u; i < 4u; i++) { let d = v[i] - mean; q += d * d; }
  red[li] = q; workgroupBarrier();
  for (var k = 64u; k > 0u; k >>= 1u) { if (li < k) { red[li] += red[li + k]; } workgroupBarrier(); }
  let inv = inverseSqrt(red[0] / 512.0 + ${e});
  for (var i = 0u; i < 4u; i++) {
    let c = li + i * 128u;
    y[base + c] = (v[i] - mean) * inv * hf(p.go + c) + hf(p.bo + c);
  }
}`}function Oe(e){let t=e.kind===`codec`;return{kv16:!t,at:t?`st[${G}]`:`0u`,gate:K[t?`chunk`:`none`],slot:n=>t?`((${n}) % ${e.ring}u)`:`(${n})`,window:t?e.window:0}}function ke({theta:e,cache:t}){let{kv16:n,at:r,gate:i,slot:a}=Oe(t),o=a(`pos`),s=n?`let kw = (${o} * 512u + h * 64u) / 2u + t;
  kc[kw] = pack2x16float(vec2<f32>(rot(base + 512u, d0, c0, s0), rot(base + 512u, d1, c1, s1)));
  vc[kw] = pack2x16float(vec2<f32>(qkv[base + 1024u + d0], qkv[base + 1024u + d1]));`:`let kb = ${o} * 512u + h * 64u;
  kc[kb + d0] = rot(base + 512u, d0, c0, s0); kc[kb + d1] = rot(base + 512u, d1, c1, s1);
  vc[kb + d0] = qkv[base + 1024u + d0]; vc[kb + d1] = qkv[base + 1024u + d1];`;return`
${V(B.rows)}
@group(0) @binding(0) var<storage, read> qkv: array<f32>;
@group(0) @binding(1) var<storage, read_write> qb: array<f32>;
@group(0) @binding(2) var<storage, read_write> kc: array<${n?`u32`:`f32`}>;
@group(0) @binding(3) var<storage, read_write> vc: array<${n?`u32`:`f32`}>;
@group(0) @binding(4) var<storage, read> st: array<u32>;
@group(0) @binding(5) var<uniform> p: P;
fn rot(base: u32, d: u32, c: f32, s: f32) -> f32 {
  if (d < 32u) { return qkv[base + d] * c - qkv[base + d + 32u] * s; }
  return qkv[base + d] * c + qkv[base + d - 32u] * s;
}
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  _ = &qkv; _ = &qb; _ = &kc; _ = &vc; _ = &st;
  ${i}
  let t = gid.x % 32u;
  let h = (gid.x / 32u) % 8u;
  let m = gid.x / 256u;
  if (m >= p.rows) { return; }
  let pos = p.pos0 + ${r} + m;
  let base = m * 1536u + h * 64u;
  let d0 = 2u * t; let d1 = d0 + 1u;
  let a0 = f32(pos) * pow(${e}, -f32(d0 % 32u) / 32.0);
  let a1 = f32(pos) * pow(${e}, -f32(d1 % 32u) / 32.0);
  let c0 = cos(a0); let s0 = sin(a0); let c1 = cos(a1); let s1 = sin(a1);
  qb[m * 512u + h * 64u + d0] = rot(base, d0, c0, s0);
  qb[m * 512u + h * 64u + d1] = rot(base, d1, c1, s1);
  ${s}
}`}function Ae({cache:e}){let{kv16:t,at:n,gate:r,slot:i,window:a}=Oe(e),o=t?`vec2<u32>`:`vec4<f32>`,s=(e,n)=>t?`kv(${e}[${n}])`:`${e}[${n}]`;return`
${V(B.rows)}
@group(0) @binding(0) var<storage, read> qb: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> kc: array<${o}>;
@group(0) @binding(2) var<storage, read> vc: array<${o}>;
@group(0) @binding(3) var<storage, read_write> o: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read> st: array<u32>;
@group(0) @binding(5) var<uniform> p: P;
var<workgroup> qs: array<array<vec4<f32>, 16>, 16>;
var<workgroup> ks: array<array<vec4<f32>, 16>, 16>;
var<workgroup> vs: array<array<vec4<f32>, 16>, 16>;
var<workgroup> sc: array<array<f32, 17>, 16>;
fn kv(u: vec2<u32>) -> vec4<f32> { return vec4<f32>(unpack2x16float(u.x), unpack2x16float(u.y)); }
fn lo(pos: u32) -> u32 { return ${a?`select(0u, pos + 1u - ${a}u, pos + 1u > ${a}u)`:`0u`}; }
@compute @workgroup_size(256)
fn main(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  _ = &qb; _ = &kc; _ = &vc; _ = &o; _ = &st;
  ${r}
  let h = wid.y; let m0 = wid.x * 16u;
  let r = li / 16u; let c = li % 16u;
  let m = m0 + r;
  let last = min(m0 + 15u, p.rows - 1u);
  let base = p.pos0 + ${n};
  let pos = base + m;
  let rowOk = m < p.rows;
  let mylo = lo(pos);
  qs[r][c] = select(vec4<f32>(0.0), qb[m * 128u + h * 16u + c] * 0.125, rowOk);
  var mx = -1e30; var l = 0.0; var acc = vec4<f32>(0.0);
  let k0 = lo(base + m0); let k1 = base + last + 1u;   // keys [k0, k1) cover the 16 rows
  for (var t = k0; t < k1; t += 16u) {
    workgroupBarrier();
    let kp = t + r;   // this thread loads key t + r, dims 4c..4c+3
    if (kp < k1) {
      let s = ${i(`kp`)} * 128u + h * 16u + c;
      ks[r][c] = ${s(`kc`,`s`)}; vs[r][c] = ${s(`vc`,`s`)};
    } else { ks[r][c] = vec4<f32>(0.0); vs[r][c] = vec4<f32>(0.0); }
    workgroupBarrier();
    var d = 0.0;
    for (var e = 0u; e < 16u; e++) { d += dot(qs[r][e], ks[c][e]); }
    let kc2 = t + c;
    sc[r][c] = select(-1e30, d, rowOk && kc2 <= pos && kc2 >= mylo && kc2 < k1);
    workgroupBarrier();
    var tm = mx;
    for (var j = 0u; j < 16u; j++) { tm = max(tm, sc[r][j]); }
    let scale = exp(mx - tm);
    l *= scale; acc *= scale;
    for (var j = 0u; j < 16u; j++) {
      let s = sc[r][j];
      let pj = select(0.0, exp(s - tm), s > -1e29);
      l += pj; acc += pj * vs[j][c];
    }
    mx = tm;
  }
  if (rowOk) { o[m * 128u + h * 16u + c] = acc / l; }
}`}function je({bos:e,pad:t}){return`
${V(B.embedRows)}
@group(0) @binding(0) var<storage, read> ids: array<u32>;
@group(0) @binding(1) var<storage, read> wv: array<vec4<u32>>;
@group(0) @binding(2) var<storage, read_write> x: array<f32>;
@group(0) @binding(3) var<uniform> p: P;
${q}
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  _ = &ids; _ = &wv; _ = &x;
  let c = gid.x % 512u; let i = gid.x / 512u;
  let id = ids[i];
  var v = 0.0;
  if (id == ${e}u) { v = hf(p.bo + c); } else if (id != ${t}u) { v = ${Te(`p.eo`,`p.eso`,`id * 512u + c`)}; }
  x[i * 512u + c] = v;
}`}function Me(){return`
@group(0) @binding(0) var<storage, read_write> z: array<f32>;
@group(0) @binding(1) var<storage, read> st: array<u32>;
fn pcg(v: u32) -> u32 { var s = v * 747796405u + 2891336453u; let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
@compute @workgroup_size(32)
fn main(@builtin(local_invocation_index) i: u32) {
  _ = &z; _ = &st;
  ${K.step}
  let f = st[${U}];
  let a = pcg(st[${Ce}] ^ pcg(f * 64u + i * 2u)); let b = pcg(a ^ 0x9e3779b9u);
  let u1 = (f32(a >> 8u) + 1.0) / 16777217.0; let u2 = f32(b >> 8u) / 16777216.0;
  z[i] = sqrt(-2.0 * log(u1)) * cos(6.283185307 * u2) * bitcast<f32>(st[${we}]);
}`}function Ne(){return`
${V(B.upsample)}
@group(0) @binding(0) var<storage, read> lats: array<f32>;
@group(0) @binding(1) var<storage, read> wv: array<vec4<u32>>;
@group(0) @binding(2) var<storage, read_write> y: array<f32>;
@group(0) @binding(3) var<uniform> p: P;
@group(0) @binding(4) var<storage, read> st: array<u32>;
${q}
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  _ = &lats; _ = &wv; _ = &y; _ = &st;
  ${K.chunk}
  let c = gid.x % 512u; let tl = gid.x / 512u;
  if (tl >= p.T) { return; }
  let t = st[${G}] + tl; let ph = t % 16u; let q = t / 16u;
  var acc = 0.0;
  for (var j = 0u; j < 2u; j++) {
    if (q < j) { continue; }
    let src = q - j;
    for (var i = 0u; i < 32u; i++) {
      let v = lats[src * 32u + i] * hf(p.so + i) + hf(p.mo + i);
      acc += ${Te(`p.wo`,`p.wso`,`((c * 16u + ph) * 2u + j) * 32u + i`)} * v;
    }
  }
  y[tl * 512u + c] = acc;
}`}function Pe(e){let t=0,n=e.map(({ctx:e,rate:n,ch:r},i)=>{let a=t;return t+=e*r,`if (gid.x < ${t}u) {
    let j = gid.x - ${a}u;
    b${i}[j] = b${i}[p.T * ${n*r}u + j];
    return;
  }`});return`
${V(B.shiftRows)}
${e.map((e,t)=>`@group(0) @binding(${t}) var<storage, read_write> b${t}: array<f32>;`).join(`
`)}
@group(0) @binding(${e.length}) var<uniform> p: P;
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  ${e.map((e,t)=>`_ = &b${t};`).join(` `)}
  ${n.join(`
  `)}
}`}function Fe({K:e,N:t,act:n=`none`,bias:r=!1,res:i=`none`,load:a=`linear`,conv:o=null,splits:c=1,q8:l,gate:u}){let d=a===`convT`,f={cin:0,k:1,dil:1,elu:!1,stride:1,...o},p=d?f.stride:1,m=f.cin,h=`fn loadA(m: u32, k: u32) -> vec4<f32> {
  if (m >= p.M) { return vec4<f32>(0.0); }
  let v = x[(${a===`linear`?`m * ${e}u + k`:a===`conv`?`(m + (k / ${m}u) * ${f.dil}u) * ${m}u + k % ${m}u`:`(m + 1u - k / ${m}u) * ${m}u + k % ${m}u`}) / 4u];
  return ${f.elu&&a!==`linear`?(e=>`select(exp(${e}) - vec4<f32>(1.0), ${e}, ${e} > vec4<f32>(0.0))`)(`v`):`v`};
}`,g=Math.ceil(e/c/32)*32,_=d?p*e:e,v=l?`
    if (li < 128u) {
      let row = li / 2u; let kq = (li % 2u) * 16u;
      let n = tn + row;
      var q = vec4<u32>(0u); var sc = 0.0;
      if (n < ${t}u) {
        let col = wbase + kt + kq;
        q = wv[p.wo / 4u + (n * ${_}u + col) / 16u];
        sc = hf(p.wso + n * ${_/s}u + col / ${s}u);
      }
      let k4 = kq / 4u;
      Bs[row][k4] = vec4<f32>(unpack4xI8(q.x)) * sc; Bs[row][k4 + 1u] = vec4<f32>(unpack4xI8(q.y)) * sc;
      Bs[row][k4 + 2u] = vec4<f32>(unpack4xI8(q.z)) * sc; Bs[row][k4 + 3u] = vec4<f32>(unpack4xI8(q.w)) * sc;
    }`:`
    {
      let row = li / 4u; let kq = (li % 4u) * 8u;
      let n = tn + row;
      var q = vec4<u32>(0u);
      if (n < ${t}u) { q = wv[(p.wo * 2u + n * ${_}u + wbase + kt + kq) / 8u]; }
      Bs[row][kq / 4u] = vec4<f32>(unpack2x16float(q.x), unpack2x16float(q.y));
      Bs[row][kq / 4u + 1u] = vec4<f32>(unpack2x16float(q.z), unpack2x16float(q.w));
    }`,y=c>1?`y[(sp * p.rows + orow) * ${t}u + n] = v;`:`${r?`v += hf(p.bo + n);`:``}
      v = ${Y(n,`v`)};
      let o = p.yo + orow * ${t}u + n;
      ${X(i,`p.ro + orow * ${t}u + n`)}
      y[o] = v;`;return`
${V(B.gemm)}
@group(0) @binding(0) var<storage, read> x: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> wv: array<vec4<u32>>;
@group(0) @binding(2) var<storage, read_write> y: array<f32>;
@group(0) @binding(3) var<storage, read> r: array<f32>;
@group(0) @binding(4) var<uniform> p: P;
@group(0) @binding(5) var<storage, read> st: array<u32>;
var<workgroup> As: array<array<vec4<f32>, 8>, 64>;
var<workgroup> Bs: array<array<vec4<f32>, 8>, 64>;
${q}
${J}
${h}
@compute @workgroup_size(16, 16)
fn main(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  _ = &x; _ = &wv; _ = &y; _ = &r; _ = &st;
  ${K[u]}
  let tm = wid.y * 64u;
  let tn = wid.x * 64u;
  let ph = wid.z / ${c}u;
  let sp = wid.z % ${c}u;
  let wbase = ${d?`ph * ${2*m}u`:`0u`};
  let li = lid.y * 16u + lid.x;
  let k0 = sp * ${g}u;
  let k1 = min(${e}u, k0 + ${g}u);
  var acc: array<vec4<f32>, 4>;
  for (var kt = k0; kt < k1; kt += 32u) {
    for (var e = 0u; e < 2u; e++) {
      let idx = li + e * 256u;        // 512 vec4 = 64 rows x 8 vec4 (32 k)
      let row = idx / 8u; let k4 = idx % 8u;
      As[row][k4] = loadA(tm + row, kt + k4 * 4u);
    }
    ${v}
    workgroupBarrier();
    for (var k4 = 0u; k4 < 8u; k4++) {
      let a0 = As[lid.y * 4u][k4]; let a1 = As[lid.y * 4u + 1u][k4]; let a2 = As[lid.y * 4u + 2u][k4]; let a3 = As[lid.y * 4u + 3u][k4];
      let b0 = Bs[lid.x * 4u][k4]; let b1 = Bs[lid.x * 4u + 1u][k4]; let b2 = Bs[lid.x * 4u + 2u][k4]; let b3 = Bs[lid.x * 4u + 3u][k4];
      acc[0] += vec4<f32>(dot(a0, b0), dot(a0, b1), dot(a0, b2), dot(a0, b3));
      acc[1] += vec4<f32>(dot(a1, b0), dot(a1, b1), dot(a1, b2), dot(a1, b3));
      acc[2] += vec4<f32>(dot(a2, b0), dot(a2, b1), dot(a2, b2), dot(a2, b3));
      acc[3] += vec4<f32>(dot(a3, b0), dot(a3, b1), dot(a3, b2), dot(a3, b3));
    }
    workgroupBarrier();
  }
  for (var i = 0u; i < 4u; i++) {
    let m = tm + lid.y * 4u + i;
    if (m >= p.M) { continue; }
    let orow = ${d?`(m * ${p}u + ph)`:`m`};
    for (var j = 0u; j < 4u; j++) {
      let n = tn + lid.x * 4u + j;
      if (n >= ${t}u) { continue; }
      var v = acc[i][j];
      ${y}
    }
  }
}`}function Ie({N:e,splits:t,act:n=`none`,bias:r=!1,res:i=`none`,gate:a}){return`
${V(B.gemmReduce)}
@group(0) @binding(0) var<storage, read> part: array<f32>;
@group(0) @binding(1) var<storage, read_write> y: array<f32>;
@group(0) @binding(2) var<storage, read> wv: array<vec4<u32>>;
@group(0) @binding(3) var<storage, read> r: array<f32>;
@group(0) @binding(4) var<uniform> p: P;
@group(0) @binding(5) var<storage, read> st: array<u32>;
${q}
${J}
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  _ = &part; _ = &y; _ = &wv; _ = &r; _ = &st;
  ${K[a]}
  let i = gid.x;
  if (i >= p.rows * ${e}u) { return; }
  let n = i % ${e}u; let row = i / ${e}u;
  var v = 0.0;
  for (var s = 0u; s < ${t}u; s++) { v += part[(s * p.stride + row) * ${e}u + n]; }
  ${r?`v += hf(p.bo + n);`:``}
  v = ${Y(n,`v`)};
  let o = p.yo + i;
  ${X(i,`p.ro + i`)}
  y[o] = v;
}`}function Le(e){let t=e/16,n=Math.min(32,t),r=32/n,i=2*r;return{WG:128,R:2,U:t,LPR:n,RPP:r,RS:i,rowsPerGroup:4*i}}function Re({K:e,N:t,act:n=`none`,bias:r=!1,res:i=`none`,ln:a=null,combine:o=0,sg:c}){let{WG:l,R:u,U:d,LPR:f,RPP:p,RS:m}=Le(e),h=e/4,g=`p.xo / 4u`,_=a?`
  // one pass: sum and sum of squares (f32 is ample for 512 values of this size)
  var s1 = 0.0; var s2 = 0.0;
  for (var i = li; i < 128u; i += ${l}u) { let v = x[${g} + i]; s1 += v.x + v.y + v.z + v.w; s2 += dot(v, v); }
  ${c?`s1 = subgroupAdd(s1); s2 = subgroupAdd(s2);
  if ((li & 31u) == 0u) { lnr[li >> 5u] = vec2<f32>(s1, s2); }
  workgroupBarrier();`:`lnr[li] = vec2<f32>(s1, s2);
  workgroupBarrier();
  for (var s = ${l/2}u; s > 0u; s >>= 1u) { if (li < s) { lnr[li] += lnr[li + s]; } workgroupBarrier(); }`}
  var t = vec2<f32>(0.0);
  ${c?`for (var i = 0u; i < ${l/32}u; i++) { t += lnr[i]; }`:`t = lnr[0];`}
  let mean = t.x / 512.0;
  let inv = inverseSqrt(max(t.y / 512.0 - mean * mean, 0.0) + ${a.eps});
  for (var i = li; i < 128u; i += ${l}u) {
    var o = (x[${g} + i] - vec4<f32>(mean)) * inv;
    ${a.affine?`o = o * h4(p.lgo + i * 4u) + h4(p.lbo + i * 4u);`:``}
    ${a.modulate?`o = o * (vec4<f32>(1.0) + md[p.so / 4u + i]) + md[p.ho / 4u + i];`:``}
    xs[i] = o;
  }
  workgroupBarrier();`:o?`
  // part: [split][head] blocks of 66 floats: 64 dims, max, sum
  for (var i = li; i < 128u; i += ${l}u) {
    let h = i / 16u; let d = (i % 16u) * 4u;
    var mx = -1e30;
    for (var s = 0u; s < ${o}u; s++) { mx = max(mx, r[(s * 8u + h) * 66u + 64u]); }
    var num = vec4<f32>(0.0); var den = 0.0;
    for (var s = 0u; s < ${o}u; s++) {
      let b = (s * 8u + h) * 66u;
      let f = exp(r[b + 64u] - mx);
      num += vec4<f32>(r[b + d], r[b + d + 1u], r[b + d + 2u], r[b + d + 3u]) * f;
      den += r[b + 65u] * f;
    }
    xs[i] = num / den;
  }
  workgroupBarrier();`:`
  for (var i = li; i < ${h}u; i += ${l}u) { xs[i] = x[${g} + i]; }
  workgroupBarrier();`;return`${c?`enable subgroups;`:``}
${V(B.gemv)}
@group(0) @binding(0) var<storage, read> x: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> wv: array<vec4<u32>>;
@group(0) @binding(2) var<storage, read_write> y: array<f32>;
@group(0) @binding(3) var<storage, read> r: array<f32>;
@group(0) @binding(4) var<uniform> p: P;
@group(0) @binding(5) var<storage, read> gv: array<f32>;
@group(0) @binding(6) var<storage, read> md: array<vec4<f32>>;
@group(0) @binding(7) var<storage, read> st: array<u32>;
var<workgroup> xs: array<vec4<f32>, ${Math.max(h,128)}>;
${a?`var<workgroup> lnr: array<vec2<f32>, ${c?l/32:l}>;`:``}
${q}
${J}
${c?Ee(f):`var<workgroup> r32: array<vec2<f32>, ${l}>;`}
@compute @workgroup_size(${l})
fn main(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  _ = &x; _ = &wv; _ = &y; _ = &r; _ = &gv; _ = &md; _ = &st;
  ${K.step}
  let lane = li & 31u;
  let ul = lane % ${f}u; let sub = lane / ${f}u;
  let n0 = (wid.x * ${l/32}u + (li >> 5u)) * ${m}u + sub;
  ${_}
  var acc: array<f32, ${u}>;
  for (var j = 0u; j < ${u}u; j++) {
    let n = n0 + j * ${p}u;
    if (n < ${t}u) {
      let wb = p.wo / 4u + n * ${d}u;
      for (var i = 0u; i < ${d/f}u; i++) {
        let u = ul + i * ${f}u;
        let q = wv[wb + u];
        let sc = hf(p.wso + n * ${e/s}u + (u * 16u) / ${s}u);
        let a = dot(xs[u * 4u], vec4<f32>(unpack4xI8(q.x))) + dot(xs[u * 4u + 1u], vec4<f32>(unpack4xI8(q.y)))
              + dot(xs[u * 4u + 2u], vec4<f32>(unpack4xI8(q.z))) + dot(xs[u * 4u + 3u], vec4<f32>(unpack4xI8(q.w)));
        acc[j] += a * sc;
      }
    }
  }
  ${c?``:`r32[li] = vec2<f32>(acc[0], acc[1]); workgroupBarrier();
  for (var s = ${f/2}u; s > 0u; s >>= 1u) { if (ul < s) { r32[li] += r32[li + s]; } workgroupBarrier(); }
  `}for (var j = 0u; j < ${u}u; j++) {
    let tot = ${c?`sumSeg(acc[j], li)`:`r32[li][j]`};
    let n = n0 + j * ${p}u;
    if (ul == 0u && n < ${t}u) {
      var v = tot${r?` + hf(p.bo + n)`:``};
      v = ${Y(n,`v`)};
      let o = p.yo + n;
      ${X(i,`p.ro + n`)}
      y[o] = v;
    }
  }
}`}function ze({eps:e,threshold:t}){return`
${V(B.finishStep)}
@group(0) @binding(0) var<storage, read> x: array<f32>;
@group(0) @binding(1) var<storage, read> wv: array<vec4<u32>>;
@group(0) @binding(2) var<storage, read> lat: array<f32>;
@group(0) @binding(3) var<storage, read_write> lats: array<f32>;
@group(0) @binding(4) var<storage, read_write> st: array<u32>;
@group(0) @binding(5) var<uniform> p: P;
var<workgroup> red: array<f32, 256>;
var<workgroup> ended: u32;
${q}
@compute @workgroup_size(256)
fn main(@builtin(local_invocation_index) li: u32) {
  _ = &x; _ = &wv; _ = &lat; _ = &lats; _ = &st;
  // st is read_write here, so the gate goes through workgroup memory to stay uniform.
  if (li == 0u) { ended = select(0u, 1u, st[${W}] != 0u && st[${U}] >= st[${W}]); }
  if (workgroupUniformLoad(&ended) == 1u) { return; }
  let a = x[li]; let b2 = x[li + 256u];
  red[li] = a + b2; workgroupBarrier();
  for (var s = 128u; s > 0u; s >>= 1u) { if (li < s) { red[li] += red[li + s]; } workgroupBarrier(); }
  let mean = red[0] / 512.0; workgroupBarrier();
  red[li] = (a - mean) * (a - mean) + (b2 - mean) * (b2 - mean); workgroupBarrier();
  for (var s = 128u; s > 0u; s >>= 1u) { if (li < s) { red[li] += red[li + s]; } workgroupBarrier(); }
  let inv = inverseSqrt(red[0] / 512.0 + ${e}); workgroupBarrier();
  let c2 = li + 256u;
  red[li] = ((a - mean) * inv * hf(p.ngo + li) + hf(p.nbo + li)) * hf(p.ewo + li)
          + ((b2 - mean) * inv * hf(p.ngo + c2) + hf(p.nbo + c2)) * hf(p.ewo + c2);
  workgroupBarrier();
  for (var s = 128u; s > 0u; s >>= 1u) { if (li < s) { red[li] += red[li + s]; } workgroupBarrier(); }
  let f = st[${U}];
  if (li < 32u) { lats[f * 32u + li] = lat[li]; }
  let logit = red[0] + hf(p.ebo);
  workgroupBarrier();
  storageBarrier();
  if (li == 0u) {
    st[${H}] = st[${H}] + 1u; st[${U}] = f + 1u;
    if (st[${W}] == 0u && logit > ${t}) { st[${W}] = f + st[${Se}] + 1u; }
  }
}`}function Be({splits:e,theta:t,sg:n,align:r}){let i=e=>`vec2<u32>(pack2x16float(${e}.xy), pack2x16float(${e}.zw))`;return`${n?`enable subgroups;`:``}
@group(0) @binding(0) var<storage, read> qkv: array<f32>;
@group(0) @binding(1) var<storage, read_write> kc: array<vec2<u32>>;
@group(0) @binding(2) var<storage, read_write> vc: array<vec2<u32>>;
@group(0) @binding(3) var<storage, read_write> part: array<f32>;
@group(0) @binding(4) var<storage, read> st: array<u32>;
${r?`@group(0) @binding(5) var<storage, read_write> al: array<f32>;`:``}
fn kv(u: vec2<u32>) -> vec4<f32> { return vec4<f32>(unpack2x16float(u.x), unpack2x16float(u.y)); }
var<workgroup> qf: array<f32, 64>;
var<workgroup> kf: array<f32, 64>;
var<workgroup> sc: array<f32, 256>;
var<workgroup> pr: array<f32, 128>;
var<workgroup> red: array<f32, 128>;
var<workgroup> acc4: array<vec4<f32>, 128>;
@compute @workgroup_size(128)
fn main(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  _ = &qkv; _ = &kc; _ = &vc; _ = &part; _ = &st;${r?` _ = &al;`:``}
  ${K.step}
  let sp = wid.x; let h = wid.y;
  let pos = st[${H}];
  let hb = h * 64u;
  let n = pos + 1u;
  let per = (n + ${e-1}u) / ${e}u;
  let j0 = sp * per; let j1 = min(n, j0 + per);
  let own = pos >= j0 && pos < j1;
  if (li < 32u) {
    let ang = f32(pos) * pow(${t}, -f32(li) / 32.0);
    let c = cos(ang); let s = sin(ang);
    let q1 = qkv[hb + li]; let q2 = qkv[hb + li + 32u];
    qf[li] = (q1 * c - q2 * s) * 0.125; qf[li + 32u] = (q2 * c + q1 * s) * 0.125;
    if (own) {
      let k1 = qkv[512u + hb + li]; let k2 = qkv[512u + hb + li + 32u];
      kf[li] = k1 * c - k2 * s; kf[li + 32u] = k2 * c + k1 * s;
    }
  } else if (own && li < 48u) {
    let d = (li - 32u) * 4u;
    let vv = vec4<f32>(qkv[1024u + hb + d], qkv[1025u + hb + d], qkv[1026u + hb + d], qkv[1027u + hb + d]);
    vc[(pos * 512u + hb + d) / 4u] = ${i(`vv`)};
  }
  workgroupBarrier();
  if (own && li < 16u) { let k4 = vec4<f32>(kf[li * 4u], kf[li * 4u + 1u], kf[li * 4u + 2u], kf[li * 4u + 3u]); kc[(pos * 512u + hb) / 4u + li] = ${i(`k4`)}; }
  storageBarrier();
  workgroupBarrier();
  // scores: a lane group of 8 per key, each lane 8 dims
  let kk = li / 8u; let part8 = li % 8u;
  let qa = vec4<f32>(qf[part8 * 8u], qf[part8 * 8u + 1u], qf[part8 * 8u + 2u], qf[part8 * 8u + 3u]);
  let qb = vec4<f32>(qf[part8 * 8u + 4u], qf[part8 * 8u + 5u], qf[part8 * 8u + 6u], qf[part8 * 8u + 7u]);
  let cnt = j1 - min(j0, j1);
  for (var base = 0u; base < cnt; base += 16u) {
    let j = j0 + base + kk;
    var d = 0.0;
    if (base + kk < cnt) {
      let kb = (j * 512u + hb) / 4u + part8 * 2u;
      d = dot(qa, kv(kc[kb])) + dot(qb, kv(kc[kb + 1u]));
    }
    ${n?`d += subgroupShuffleXor(d, 4u); d += subgroupShuffleXor(d, 2u); d += subgroupShuffleXor(d, 1u);
    if (part8 == 0u && base + kk < cnt) { sc[base + kk] = d; }`:`pr[li] = d; workgroupBarrier();
    if (li < 16u && base + li < cnt) { var t = 0.0; for (var e = 0u; e < 8u; e++) { t += pr[li * 8u + e]; } sc[base + li] = t; }
    workgroupBarrier();`}
  }
  workgroupBarrier();
  var mx = -1e30;
  for (var j = li; j < cnt; j += 128u) { mx = max(mx, sc[j]); }
  red[li] = mx; workgroupBarrier();
  for (var s = 64u; s > 0u; s >>= 1u) { if (li < s) { red[li] = max(red[li], red[li + s]); } workgroupBarrier(); }
  mx = red[0]; workgroupBarrier();
  var sum = 0.0;
  for (var j = li; j < cnt; j += 128u) {
    ${r?`let k = j0 + j - ${r.lo}u;
    if (h == ${r.head}u && j0 + j >= ${r.lo}u && k < st[${xe}]) { al[st[${U}] * ${r.width}u + k] = sc[j]; }`:``}
    let e = exp(sc[j] - mx); sc[j] = e; sum += e;
  }
  red[li] = sum; workgroupBarrier();
  for (var s = 64u; s > 0u; s >>= 1u) { if (li < s) { red[li] += red[li + s]; } workgroupBarrier(); }
  sum = red[0];
  // values: 16 lanes over the head's 64 dims (vec4), 8 key groups
  let dv = li % 16u; let g = li / 16u;
  var a = vec4<f32>(0.0);
  for (var j = g; j < cnt; j += 8u) { a += sc[j] * kv(vc[((j0 + j) * 512u + hb) / 4u + dv]); }
  acc4[li] = a; workgroupBarrier();
  let pb = (sp * 8u + h) * 66u;
  if (li < 16u) {
    var t = vec4<f32>(0.0);
    for (var e = 0u; e < 8u; e++) { t += acc4[e * 16u + li]; }
    part[pb + li * 4u] = t.x; part[pb + li * 4u + 1u] = t.y; part[pb + li * 4u + 2u] = t.z; part[pb + li * 4u + 3u] = t.w;
  }
  if (li == 0u) { part[pb + 64u] = select(mx, -1e30, j1 <= j0); part[pb + 65u] = sum; }
}`}function Ve({lo:e,head:t}){return`
@group(0) @binding(0) var<storage, read> qb: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> kc: array<vec2<u32>>;
@group(0) @binding(2) var<storage, read_write> al: array<f32>;
@group(0) @binding(3) var<storage, read> st: array<u32>;
fn kv(u: vec2<u32>) -> vec4<f32> { return vec4<f32>(unpack2x16float(u.x), unpack2x16float(u.y)); }
@compute @workgroup_size(256)
fn main(@builtin(local_invocation_index) li: u32) {
  _ = &qb; _ = &kc; _ = &al; _ = &st;
  let m = st[${H}] - ${e}u;
  for (var i = li; i < st[${xe}]; i += 256u) {
    var d = 0.0;
    for (var e = 0u; e < 16u; e++) { d += dot(qb[m * 128u + ${t*16}u + e] * 0.125, kv(kc[(${e}u + i) * 128u + ${t*16}u + e])); }
    al[i] = d;
  }
}`}var He=128,Ue=64,Z=8,We=4,Ge=1,Ke=4,qe=7.5*2**20;function Je(e,t){let n=e.beginComputePass();for(let e of t)n.setPipeline(e.pipe.pipeline),n.setBindGroup(0,e.bindGroup),n.dispatchWorkgroups(...e.groups);n.end()}function Ye(e,t){let n=[...t.matchAll(/@binding\((\d+)\) var<(storage|uniform)(?:, (read_write|read))?>/g)].map(([,e,t,n])=>({binding:Number(e),visibility:Ke,buffer:{type:t===`uniform`?`uniform`:n===`read_write`?`storage`:`read-only-storage`}}));return e.createBindGroupLayout({entries:n})}function Xe(e,t,n){return t===n?{res:`${e}_y`,rbuf:void 0}:{res:e,rbuf:t}}var Ze=class{buf;ready=null;constructor(e,t){this.buf=e.createBuffer({size:t,usage:Z|Ge})}map(){return this.ready??=this.buf.mapAsync(Ge)}range(){return this.buf.getMappedRange()}unmap(){this.buf.unmap(),this.ready=null}},Qe=class{device;enc;constructor(e){this.device=e,this.enc=e.createCommandEncoder()}run(e){e.length&&Je(this.enc,e)}copy(e,t,n,r,i){this.enc.copyBufferToBuffer(e,t,n,r,i)}clear(e,t,n){this.enc.clearBuffer(e,t,n)}read(e,t,n,r,i){this.enc.copyBufferToBuffer(e,t,n.buf,r,i)}submit(){this.device.queue.submit([this.enc.finish()])}},$e=class{device;weights;state;depth=3;kvBytes=2;zero;sg;tensors;pipes=new Map;compiling=[];scratchBuf=null;constructor(e,t,n){this.device=e,this.tensors=t.tensors,this.sg=n,this.weights=this.buffer(t.blob.byteLength,t.blob),this.state=this.buffer(32),this.zero=this.buffer(256)}buffer(e,t){let n=this.device.createBuffer({size:Math.max(256,Math.ceil(e/256)*256),usage:He|Z|We});return t&&this.write(n,0,t),n}write(e,t,n){this.device.queue.writeBuffer(e,t,n.buffer,n.byteOffset,n.byteLength)}encoder(){return new Qe(this.device)}staging(e){return new Ze(this.device,e)}u(e,t){let n=t,r=new Uint32Array(Math.max(4,Math.ceil(e.length/4)*4));e.forEach((e,t)=>r[t]=n[e]??0);let i=this.device.createBuffer({size:r.byteLength,usage:Ue|Z});return this.device.queue.writeBuffer(i,0,r),i}tensor(e){let t=this.tensors[e];if(!t)throw Error(`No tensor ${e}`);return t}half(e){let t=this.tensor(e);if(t.scales!==void 0)throw Error(`${e} is int8`);return t.offset/2}words(e){let t=this.tensor(e);return{wo:t.offset/4,wso:t.scales===void 0?0:t.scales/2,q8:t.scales!==void 0}}q8(e){let t=this.words(e);if(!t.q8)throw Error(`${e} is not int8`);return t}async ready(){for(;this.compiling.length;)await Promise.all(this.compiling.splice(0))}op(e,t,n){let r=this.pipes.get(e);if(!r){let t=Ye(this.device,e),n={layout:t,pipeline:null};this.compiling.push(this.device.createComputePipelineAsync({layout:this.device.createPipelineLayout({bindGroupLayouts:[t]}),compute:{module:this.device.createShaderModule({code:e}),entryPoint:`main`}}).then(e=>{n.pipeline=e})),this.pipes.set(e,n),r=n}let i=this.device.createBindGroup({layout:r.layout,entries:t.map((e,t)=>({binding:t,resource:e instanceof GPUBuffer?{buffer:e}:e}))});return{pipe:r,bindGroup:i,groups:n}}scratch(e){if(e>qe)throw Error(`Split-K partials of ${e} bytes`);return this.scratchBuf??=this.buffer(qe),{buffer:this.scratchBuf,offset:0,size:Math.ceil(e/256)*256}}gemv(e,t,n,r){let{ln:i,combine:a}=r,{res:o,rbuf:s}=Xe(r.res??`none`,r.rbuf,n),c=this.q8(t),l=Re({K:r.K,N:r.N,act:r.act,bias:!!r.bias,res:o,combine:a?.splits,ln:i&&{affine:!!i.w,modulate:!!i.mod,eps:i.eps},sg:this.sg}),u=this.u(B.gemv,{xo:r.xo,go:r.go,so:i?.so,ho:i?.ho,wo:c.wo,bo:r.bias?this.half(r.bias):0,vo:r.vname?this.half(r.vname):0,lgo:i?.w?this.half(i.w):0,lbo:i?.b?this.half(i.b):0,wso:c.wso});return this.op(l,[e??this.zero,this.weights,n,a?.parts??s??this.zero,u,r.gbuf??this.zero,i?.mod??this.zero,this.state],[Math.ceil(r.N/Le(r.K).rowsPerGroup),1,1])}gemm(e,t,n,r){let{M:i,K:a,N:o,load:s=`linear`,conv:c,yo:l=0,ro:u=0,gate:d}=r,{res:f,rbuf:p}=Xe(r.res??`none`,r.rbuf,n),m=this.words(t),h=s===`convT`?c.stride:1,g=Math.ceil(o/64)*Math.min(4,Math.ceil(i/64))*h,_=Math.max(1,Math.min(Math.floor(160/g),Math.floor(a/128))),v=[Math.ceil(o/64),Math.ceil(i/64),h*_],y=r.bias?this.half(r.bias):0,b={K:a,N:o,load:s,conv:c,q8:m.q8,gate:d},x=B.gemm;if(_===1){let t=Fe({...b,act:r.act,bias:!!r.bias,res:f});return[this.op(t,[e,this.weights,n,p??this.zero,this.u(x,{M:i,yo:l,ro:u,wo:m.wo,bo:y,wso:m.wso}),this.state],v)]}let S=i*h,C=this.scratch(_*S*o*4);return[this.op(Fe({...b,splits:_}),[e,this.weights,C,this.zero,this.u(x,{M:i,rows:S,wo:m.wo,wso:m.wso}),this.state],v),this.op(Ie({N:o,splits:_,act:r.act,bias:!!r.bias,res:f,gate:d}),[C,n,this.weights,p??this.zero,this.u(B.gemmReduce,{rows:S,yo:l,ro:u,stride:S,bo:y}),this.state],[Math.ceil(S*o/256),1,1])]}layernorm(e,t,n,r,i,a,o){return this.op(De({eps:a,gate:o}),[e,t,this.weights,this.u(B.layernorm,{go:this.half(r),bo:this.half(i)}),this.state],[n,1,1])}ropeKV(e,t,n,r,i,a){return this.op(ke({theta:a.theta,cache:a.cache}),[e,t,n,r,this.state,this.u(B.rows,i)],[i.rows,1,1])}attention(e,t,n,r,i,a){return this.op(Ae({cache:a.cache}),[e,t,n,r,this.state,this.u(B.rows,i)],[Math.ceil(i.rows/16),8,1])}attnStep(e,t,n,r,i){let a=Be({splits:i.splits,theta:i.theta,sg:this.sg,align:i.align?.at}),o=[e,t,n,r,this.state];return this.op(a,i.align?[...o,i.align.buf]:o,[i.splits,8,1])}alignRow(e,t,n,r){return this.op(Ve(r),[e,t,n,this.state],[1,1,1])}embedRows(e,t,n,r){let i=this.q8(`embed`);return this.op(je(r),[e,this.weights,t,this.u(B.embedRows,{eo:i.wo,eso:i.wso,bo:this.half(`bos_embed`)})],[n*512/256,1,1])}noise(e){return this.op(Me(),[e,this.state],[1,1,1])}finishStep(e,t,n,r){return this.op(ze(r),[e,this.weights,t,n,this.state,this.u(B.finishStep,{ewo:this.half(`eos.w`),ebo:this.half(`eos.b`),ngo:this.half(`norm.w`),nbo:this.half(`norm.b`)})],[1,1,1])}upsample(e,t,n){let r=this.q8(`up`);return this.op(Ne(),[e,this.weights,t,this.u(B.upsample,{T:n,wo:r.wo,wso:r.wso,mo:this.half(`lat_mean`),so:this.half(`lat_std`)}),this.state],[n*512/256,1,1])}shiftRows(e,t){return this.op(Pe(e),[...e.map(e=>e.buf),this.u(B.shiftRows,{T:t})],[Math.ceil(e.reduce((e,t)=>e+t.ctx*t.ch,0)/256),1,1])}},Q=24e3,et=.08,tt=-45,$=Q/100,nt=.005,rt=new Set([`.`,`,`,`!`,`?`,`;`,`:`,`)`,`"`,`'`]);function it(e){let t=[];return e.forEach((e,n)=>{let r=e.replaceAll(`▁`,``),i=!e.startsWith(`▁`)||!!r&&[...r].every(e=>rt.has(e));t.length&&i?(t.at(-1).text+=r,t.at(-1).to=n+1):t.push({text:r,from:n,to:n+1})}),t.filter(e=>e.text)}var at=class{pieces;ranges;onWord;lag;raw=[];pos=[];loud=[];samples=0;partial=new Float32Array($);partialAt=0;t=0;starts;at=[];emitted=0;ended=!1;constructor(e,t,n){this.pieces=e,this.lag=t,this.ranges=it(e),this.onWord=n,this.starts=Array.from({length:e.length},()=>null)}addRows(e){let t=this.pieces.length;for(let n=0;n+t<=e.length;n+=t){let r=e.subarray(n,n+t),i=0;for(let e=1;e<t;e++)r[e]>r[i]&&(i=e);let a=0,o=0;for(let e=Math.max(0,i-2);e<=Math.min(t-1,i+2);e++){let t=Math.exp(r[e]-r[i]);a+=t*e,o+=t}this.raw.push(a/o),this.settle()}this.advance()}addAudio(e){for(let t=0;t<e.length;t++)if(this.partial[this.partialAt++]=e[t],this.partialAt===$){let e=0;for(let t=0;t<$;t++)e+=this.partial[t]*this.partial[t];this.loud.push(20*Math.log10(Math.sqrt(e/$)+1e-9)),this.partialAt=0}this.samples+=e.length,this.advance()}finish(){return this.ended=!0,this.raw.length?(this.settle(),this.advance(),{tokens:this.pieces.map((e,t)=>this.token(t)),words:this.ranges.map(e=>this.word(e))}):{tokens:[],words:[]}}get end(){return this.samples/Q}settle(){let{raw:e,pos:t}=this;for(!t.length&&(e.length>=2||this.ended&&e.length)&&t.push(e.length>1?Math.min(e[0],e[1]):e[0]);t.length&&t.length<e.length;)t.push(Math.max(e[t.length],t[t.length-1]))}posAt(e){let{pos:t}=this,n=(e-et/2)/et-this.lag;if(!t.length)return null;if(n<=0)return t[0];if(this.ended&&n>=t.length-1)return t[t.length-1];let r=Math.floor(n);return r+1>=t.length?null:t[r]*(1-(n-r))+t[r+1]*(n-r)}advance(){let e=this.pieces.length;if(e&&this.raw.length){for(;this.t<=this.end;this.t+=nt){let t=this.posAt(this.t);if(t===null)break;let n=Math.round(t);for(let t=0;t<=n&&t<e;t++)this.starts[t]??=this.t}for(;this.at.length<e;){let e=this.at.length,t=this.starts[e];if(t===null&&!this.ended)break;let n=t??this.end,r=Math.floor(n*100);for(;r<this.loud.length&&this.loud[r]<tt;)r++;if(r>=this.loud.length&&!this.ended)break;this.at.push(Math.max(n,r/100,e?this.at[e-1]:0))}for(;this.emitted<this.ranges.length;){let e=this.ranges[this.emitted];if(!(this.ended||e.to<this.at.length))break;this.onWord?.(this.word(e)),this.emitted++}}}token(e){return{text:this.pieces[e].replaceAll(`▁`,``),start:this.at[e],end:e+1<this.pieces.length?this.at[e+1]:this.end}}word(e){let t=Array.from({length:e.to-e.from},(t,n)=>this.token(e.from+n));return{text:e.text,start:t[0].start,end:t.at(-1).end,tokens:t}}},ot=/^<0x([0-9A-F]{2})>$/,st=class{pieces;score=new Map;byte=new Map;maxLen;unk;norm;constructor(e){let t=e.model.vocab;this.pieces=t.map(e=>e[0]),t.forEach(([e,t],n)=>{let r=ot.exec(e);r?this.byte.set(Number.parseInt(r[1],16),n):this.score.set(e,[n,t])}),this.maxLen=Math.max(...this.pieces.map(e=>e.length)),this.unk=e.model.unk_id??0;let n=e.normalizer,r=n?n.type===`Sequence`?n.normalizers:[n]:[];this.norm=r.map(e=>{switch(e.type){case`Replace`:{let t=e.pattern.Regex===void 0?new RegExp((e.pattern.String??``).replaceAll(/[.*+?^${}()|[\]\\]/g,`\\$&`),`gu`):new RegExp(e.pattern.Regex.replaceAll(/\\x\{([0-9A-Fa-f]+)\}/g,`\\u{$1}`),`gu`);return n=>n.replaceAll(t,e.content)}case`Strip`:return t=>e.strip_left&&e.strip_right?t.trim():e.strip_left?t.trimStart():t.trimEnd();case`Prepend`:return t=>t&&e.prepend+t}})}normalize(e){return this.norm.reduce((e,t)=>t(e),e)}encode(e){let t=this.normalize(e).replaceAll(` `,`▁`);t.startsWith(`▁`)||(t=`▁`+t);let n=[];for(let e of t.split(/(?=▁)/u))e&&n.push(...this.word(e));return n}word(e){let t=Array.from(e),n=t.length,r=new Float64Array(n+1).fill(-1/0),i=new Int32Array(n+1),a=new Int32Array(n+1);r[0]=0;for(let e=0;e<n;e++){if(r[e]===-1/0)continue;let o=``;for(let s=e;s<Math.min(n,e+this.maxLen);s++){o+=t[s];let n=this.score.get(o);n&&r[e]+n[1]>r[s+1]&&(r[s+1]=r[e]+n[1],i[s+1]=e,a[s+1]=n[0])}r[e]-100>r[e+1]&&(r[e+1]=r[e]-100,i[e+1]=e,a[e+1]=-1)}let o=[];for(let e=n;e>0;e=i[e])a[e]>=0?o.push([a[e]]):o.push([...new TextEncoder().encode(t[e-1])].map(e=>this.byte.get(e)??this.unk));return o.reverse().flat()}};async function ct(e,t,n){let r=pt(e),i=await e.requestDevice({requiredFeatures:r?[`subgroups`]:[]});try{let e=d(t),a=new be(new $e(i,e,r),f(e),n);return await a.ready(),{engine:a,backend:{name:`webgpu`},lost:i.lost,close:async()=>i.destroy()}}catch(e){throw i.destroy(),e}}async function lt(t,n,r){let{CpuEngine:i}=await e(async()=>{let{CpuEngine:e}=await import(`./remote-76VW7A46-CbuGOXTi.js`);return{CpuEngine:e}},[],import.meta.url),a=await i.start(t,n,r);return{engine:a,backend:{name:`cpu`,threads:a.threads,simd:a.simd},lost:a.lost,close:()=>a.close()}}function ut(e,t){if(t(e)<=240)return[e];let n=[],r=``,i=e=>{if(r&&t(r+e)>240&&(n.push(r),r=``),t(e)<=240)r+=e;else if(/\s/.test(e.trim()))for(let t of e.split(/(?<=\s)/))i(t);else for(let t=0;t<e.length;t+=32)i(e.slice(t,t+32))};for(let t of e.match(/[^.!?]+(?:[.!?]+|$)\s*/g)??[e])i(t);return r&&n.push(r),n.map(e=>e.trim()).filter(Boolean)}var dt=class e{runtime;engine;tokenizer;catalog;lag;closed=!1;lost;backend;defaultVoice;constructor(e,t,n,r){this.runtime=r,this.engine=r.engine,this.lost=r.lost,this.backend=r.backend,this.tokenizer=t,this.catalog=n,this.lag=e.align.lag,this.defaultVoice=g[e.languages[0]]}static async load({model:t=`phonon-31m-en`,progress:n,backend:r=`auto`,threads:i}={}){let a=x[t],o=navigator.gpu,s=r===`cpu`?null:await o?.requestAdapter({powerPreference:`high-performance`}).catch(()=>null);if(!s&&r===`webgpu`)throw Error(`This browser has no WebGPU.`);let[c,l,u]=await Promise.all([E(a.weights,n),E(a.tokenizer).then(e=>new st(JSON.parse(new TextDecoder().decode(e)))),E(w).then(e=>new TextDecoder().decode(e).split(`
`).filter(Boolean).map(e=>JSON.parse(e)).filter(e=>a.languages.includes(e.language)).map(e=>({name:e.name,id:e.voice_id,language:e.language,locale:e.locale,gender:e.gender,description:e.description})))]),d=s?await ct(s,c,a.align):await lt(c,a.align,i??Math.min(8,navigator.hardwareConcurrency||1));return new e(a,l,u,d)}async close(){this.closed||(this.closed=!0,await this.runtime.close())}get voices(){return this.catalog}words(e){return this.parts(e).flatMap(e=>{let t=this.tokenizer.encode(e).map(e=>this.tokenizer.pieces[e]);return it(t).map(e=>({text:e.text,tokens:t.slice(e.from,e.to).map(e=>e.replaceAll(`▁`,``))}))})}parts(e){return ut(e,e=>this.tokenizer.encode(e).length)}async speak(e,t={}){if(this.closed)throw Error(`This model is closed.`);let{voice:n=this.defaultVoice,speed:r=1,seed:i=1,onAudio:o,onWord:s,signal:c}=t,l=this.catalog.find(e=>e.name===n||e.id===n);if(!l)throw Error(`No voice ${n}`);let u=this.engine.hasVoice(l.id)?void 0:p(await E(ee(l.id))),d=[],f=[],m=[],h=0;for(let[t,n]of this.parts(e).entries()){c?.throwIfAborted();let e=this.tokenizer.encode(n),p=e=>({...e,start:e.start+h,end:e.end+h}),g=e=>({...p(e),tokens:e.tokens.map(p)}),_=new at(e.map(e=>this.tokenizer.pieces[e]),this.lag,s&&(e=>s(g(e)))),v=await this.engine.synthesize(e,l.id,{seed:i+t,words:n.split(/\s+/).filter(Boolean).length,pace:a(r),latents:u,onRows:e=>_.addRows(e),onChunk:e=>{_.addAudio(e),o?.(e)},cancelled:()=>!!c?.aborted});c?.throwIfAborted();let y=ft(v.chunks),b=_.finish();f.push(...b.words.map(g)),m.push(...b.tokens.map(p)),d.push(y),h+=y.length/Q}return{audio:ft(d),sampleRate:Q,words:f,tokens:m}}};function ft(e){let t=new Float32Array(e.reduce((e,t)=>e+t.length,0)),n=0;for(let r of e)t.set(r,n),n+=r.length;return t}function pt(e){let t=e.info;return e.features.has(`subgroups`)&&t.subgroupMinSize===32&&t.subgroupMaxSize===32}export{dt as Phonon};