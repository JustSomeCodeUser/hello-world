'use strict';
class FXEngine {
 constructor(canvas, forceGL1=false){
  this.canvas=canvas; const opts={alpha:false,antialias:false,depth:true,stencil:false,preserveDrawingBuffer:false};
  this.gl=(!forceGL1&&canvas.getContext('webgl2',opts))||canvas.getContext('webgl',opts);if(!this.gl)throw Error('WebGL 不可用；没有以假动画代替测试。');
  const g=this.gl;this.gl2=typeof g.texStorage2D==='function';this.float=!!(this.gl2&&g.getExtension('EXT_color_buffer_float'));this.timer=g.getExtension(this.gl2?'EXT_disjoint_timer_query_webgl2':'EXT_disjoint_timer_query');
  const r=g.getExtension('WEBGL_debug_renderer_info');this.device={webgl:this.gl2?2:1,floatColor:this.float,gpuTimer:!!this.timer,renderer:r?g.getParameter(r.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER),vendor:r?g.getParameter(r.UNMASKED_VENDOR_WEBGL):'',maxTexture:g.getParameter(g.MAX_TEXTURE_SIZE),precision:g.getShaderPrecisionFormat(g.FRAGMENT_SHADER,g.HIGH_FLOAT).precision,userAgent:navigator.userAgent,devicePixelRatio:devicePixelRatio,logicalCores:navigator.hardwareConcurrency||null};
  this.cache=new Map();this.targets=[];this.drawCalls=0;this.t=0;this.simAccumulator=0;this.touch=[.5,.5,0,0];this.source=1;this.paused=false;this.contextLost=false;this.cpuParticles=null;this.layers=1;
  this.quad=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,this.quad);g.bufferData(g.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),g.STATIC_DRAW);
  this.noise=this.makeNoise();this.scene=this.makeScene();this.empty=this.texture(1,1,new Uint8Array([0,0,0,255]));
  this.particleBuffer=g.createBuffer();this.meshBuffer=g.createBuffer();this.meshNormal=g.createBuffer();this.meshIndex=g.createBuffer();this.seedData=new Float32Array(1024*4);let seed=2197;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};for(let i=0;i<this.seedData.length;i++)this.seedData[i]=rand();
  this.effect=EFFECTS[0];this.route='lite';this.configure('smoke','lite');
 }
 header(vertex=false){const p=this.device.precision?'highp':'mediump';return (this.gl2?'#version 300 es\n':'')+'precision '+p+' float;\n'+(this.gl2?(vertex?'#define attribute in\n#define varying out\n':'#define varying in\nout vec4 fragOut;\n#define OUT fragOut\n'):'#define OUT gl_FragColor\n')+(this.gl2?'#define texture2D texture\n':'');}
 program(key,fs,vs=null){if(this.cache.has(key))return this.cache.get(key);const g=this.gl;vs=vs||'attribute vec2 aPos;varying vec2 vUv;void main(){vUv=aPos*.5+.5;gl_Position=vec4(aPos,0,1);}';const compile=(type,source)=>{let s=g.createShader(type);g.shaderSource(s,source);g.compileShader(s);if(!g.getShaderParameter(s,g.COMPILE_STATUS)){const e=g.getShaderInfoLog(s);g.deleteShader(s);throw Error(key+': '+e);}return s;};const v=compile(g.VERTEX_SHADER,this.header(true)+vs),f=compile(g.FRAGMENT_SHADER,this.header()+fs),p=g.createProgram();g.attachShader(p,v);g.attachShader(p,f);g.bindAttribLocation(p,0,'aPos');g.bindAttribLocation(p,0,'aData');g.bindAttribLocation(p,1,'aNormal');g.linkProgram(p);g.deleteShader(v);g.deleteShader(f);if(!g.getProgramParameter(p,g.LINK_STATUS))throw Error(key+': '+g.getProgramInfoLog(p));let u={};for(let i=0;i<g.getProgramParameter(p,g.ACTIVE_UNIFORMS);i++){const info=g.getActiveUniform(p,i);u[info.name.replace('[0]','')]={loc:g.getUniformLocation(p,info.name),type:info.type};}let result={p,u};this.cache.set(key,result);return result;}
 use(p,values={},textures={}){const g=this.gl;g.useProgram(p.p);let unit=0;for(const [name,tex]of Object.entries(textures)){const u=p.u[name];if(!u)continue;g.activeTexture(g.TEXTURE0+unit);g.bindTexture(g.TEXTURE_2D,tex.t||tex);g.uniform1i(u.loc,unit++);}for(const [name,value]of Object.entries(values)){const u=p.u[name];if(!u)continue;switch(u.type){case g.FLOAT:g.uniform1f(u.loc,value);break;case g.INT:case g.BOOL:g.uniform1i(u.loc,value);break;case g.FLOAT_VEC2:g.uniform2fv(u.loc,value);break;case g.FLOAT_VEC3:g.uniform3fv(u.loc,value);break;case g.FLOAT_VEC4:g.uniform4fv(u.loc,value);break;}}}
 texture(w,h,data=null,repeat=false){const g=this.gl,t=g.createTexture();g.bindTexture(g.TEXTURE_2D,t);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,repeat?g.REPEAT:g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,repeat?g.REPEAT:g.CLAMP_TO_EDGE);g.texImage2D(g.TEXTURE_2D,0,g.RGBA,w,h,0,g.RGBA,g.UNSIGNED_BYTE,data);return t;}
 makeNoise(){let seed=731;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};let grids=[];for(let n of [8,16,32,64]){let a=new Float32Array(n*n);for(let i=0;i<a.length;i++)a[i]=random();grids.push({n,a});}const val=(x,y,k)=>{const{n,a}=grids[k];x=x*n;y=y*n;let ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);const at=(i,j)=>a[((j%n+n)%n)*n+(i%n+n)%n];return (at(ix,iy)*(1-fx)+at(ix+1,iy)*fx)*(1-fy)+(at(ix,iy+1)*(1-fx)+at(ix+1,iy+1)*fx)*fy;};let a=new Uint8Array(256*256*4);for(let y=0;y<256;y++)for(let x=0;x<256;x++){let i=(y*256+x)*4;for(let c=0;c<3;c++){let X=x/256+c*.257,Y=y/256+c*.173;a[i+c]=Math.round(255*(val(X,Y,0)*.54+val(X,Y,1)*.28+val(X,Y,2)*.13+val(X,Y,3)*.05));}a[i+3]=255;}return this.texture(256,256,a,true);}
 makeScene(){const c=document.createElement('canvas');c.width=512;c.height=512;const ctx=c.getContext('2d');const grad=ctx.createLinearGradient(0,0,512,512);grad.addColorStop(0,'#172734');grad.addColorStop(.5,'#0b1724');grad.addColorStop(1,'#254c55');ctx.fillStyle=grad;ctx.fillRect(0,0,512,512);for(let y=0;y<512;y+=32)for(let x=0;x<512;x+=32){ctx.fillStyle=((x+y)/32)%2?'rgba(151,181,180,.09)':'rgba(0,0,0,.10)';ctx.fillRect(x+1,y+1,30,30);}let light=ctx.createRadialGradient(125,110,5,125,110,280);light.addColorStop(0,'rgba(155,201,219,.37)');light.addColorStop(1,'rgba(100,190,230,0)');ctx.fillStyle=light;ctx.fillRect(0,0,512,512);ctx.strokeStyle='rgba(186,209,211,.15)';ctx.lineWidth=2;for(let x of [66,256,446]){ctx.beginPath();ctx.moveTo(x,60);ctx.lineTo(x,450);ctx.stroke();}ctx.strokeStyle='rgba(214,173,105,.65)';ctx.lineWidth=5;ctx.beginPath();ctx.arc(365,165,43,0,6.284);ctx.stroke();ctx.fillStyle='rgba(201,217,208,.36)';ctx.font='14px monospace';ctx.fillText('OPTICAL / FLOW FIELD',35,45);ctx.fillText('REFERENCE SURFACE',35,480);const g=this.gl,t=g.createTexture();g.bindTexture(g.TEXTURE_2D,t);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL,true);g.texImage2D(g.TEXTURE_2D,0,g.RGBA,g.RGBA,g.UNSIGNED_BYTE,c);g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL,false);return t;}
 target(w,h,isFloat=false){const g=this.gl,t=g.createTexture(),fb=g.createFramebuffer();g.bindTexture(g.TEXTURE_2D,t);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);g.texImage2D(g.TEXTURE_2D,0,isFloat?g.RGBA16F:g.RGBA,w,h,0,g.RGBA,isFloat?g.HALF_FLOAT:g.UNSIGNED_BYTE,null);g.bindFramebuffer(g.FRAMEBUFFER,fb);g.framebufferTexture2D(g.FRAMEBUFFER,g.COLOR_ATTACHMENT0,g.TEXTURE_2D,t,0);if(g.checkFramebufferStatus(g.FRAMEBUFFER)!==g.FRAMEBUFFER_COMPLETE)throw Error('不支持该渲染目标');let a={t,fb,w,h,isFloat};this.targets.push(a);return a;}
 pair(w,h,f=false){return{a:this.target(w,h,f),b:this.target(w,h,f)};}
 swap(a){let t=a.a;a.a=a.b;a.b=t;}
 clearTarget(a,values=[0,0,0,0]){const g=this.gl;g.bindFramebuffer(g.FRAMEBUFFER,a.fb);g.clearColor(...values);g.clear(g.COLOR_BUFFER_BIT);}
 freeTargets(){const g=this.gl;for(const a of this.targets){g.deleteTexture(a.t);g.deleteFramebuffer(a.fb);}this.targets=[];this.fluid=null;this.wave=null;this.trail=null;}
 drawQuad(p,out=null,values={},textures={}){const g=this.gl;g.bindFramebuffer(g.FRAMEBUFFER,out?out.fb:null);g.viewport(0,0,out?out.w:this.canvas.width,out?out.h:this.canvas.height);g.disable(g.DEPTH_TEST);this.use(p,values,textures);g.bindBuffer(g.ARRAY_BUFFER,this.quad);g.enableVertexAttribArray(0);g.vertexAttribPointer(0,2,g.FLOAT,false,0,0);g.disableVertexAttribArray(1);g.drawArrays(g.TRIANGLES,0,3);this.drawCalls++;}
 configure(id,route='lite',options={}){const def=EFFECTS.find(x=>x.id===id);if(!def&&id!=='baseline')throw Error('未知效果');if(route==='stateful'&&def?.engine==='fluid'&&!this.float)throw Error('UNSUPPORTED: 实时流体需要 WebGL2 与可渲染浮点纹理');this.freeTargets();this.effect=def||{id:'baseline',engine:'none',name:'纯背景基线',limit:''};this.route=route;this.t=0;this.simAccumulator=0;this.touch=[.5,.5,0,0];this.source=1;this.simSteps=0;this.droppedTime=0;this.options={grid:64,iterations:12,maccormack:false,particles:768,...options};this.springs=new Float32Array(8);this.springT=0;this.lastWavePulse=-1;
 if(route==='stateful'&&this.effect.engine==='fluid')this.initFluid();if(route==='stateful'&&this.effect.engine==='wave')this.initWave();if(this.effect.engine==='particles')this.initParticles();if(this.effect.engine==='mesh')this.initMesh();
 if(EFFECT_SHADER[id])this.display=this.program('display-'+id+'-'+route,'varying vec2 vUv;\n#define STATEFUL '+(route==='stateful'?1:0)+'\n'+COMMON+EFFECT_SHADER[id]);this.background=this.program('background','varying vec2 vUv;uniform sampler2D uScene;void main(){OUT=texture2D(uScene,vUv);}');
 this.memoryBytes=256*256*4+512*512*4+this.targets.reduce((s,x)=>s+x.w*x.h*(x.isFloat?8:4),0)+(this.effect.engine==='particles'?this.options.particles*(this.effect.id==='trails'&&this.route==='lite'?32:16):0)+(this.effect.engine==='mesh'?((24+1)*(40+1)*6*4+this.meshCount*2):0);
 }
 initFluid(){const n=this.options.grid,m=Math.round(n*1.5),s=2;this.fluid={vel:this.pair(n,m,true),p:this.pair(n,m,true),div:this.target(n,m,true),curl:this.target(n,m,true),dye:this.pair(n*s,m*s,true),grid:[n,m],dgrid:[n*s,m*s]};if(this.options.maccormack){this.fluid.fwd=this.target(n*s,m*s,true);this.fluid.rev=this.target(n*s,m*s,true);}for(const a of this.targets)this.clearTarget(a);for(const[key,src]of Object.entries(FLUID_SHADER))this.program('fluid-'+key,FLUID_COMMON+src);}
 fluidPass(name,out,more={},tex={}){const f=this.fluid;this.drawQuad(this.cache.get('fluid-'+name),out,{uGrid:f.grid,uPhysical:[1,1.5],uSize:f.dgrid,uDt:1/30,uTime:this.t,uEnabled:this.source,uKind:EFFECTS.indexOf(this.effect),uTouch:this.touch,...more},{uVelocity:f.vel.a,uField:f.dye.a,uPressure:f.p.a,uDivergence:f.div,uCurl:f.curl,uNoise:this.noise,...tex});}
 updateFluid(){const f=this.fluid,g=this.gl;g.disable(g.BLEND);this.fluidPass('vel',f.vel.b);this.swap(f.vel);this.fluidPass('curl',f.curl);this.fluidPass('force',f.vel.b);this.swap(f.vel);this.fluidPass('div',f.div);this.clearTarget(f.p.a);this.clearTarget(f.p.b);for(let i=0;i<this.options.iterations;i++){this.fluidPass('pressure',f.p.b);this.swap(f.p);}this.fluidPass('project',f.vel.b);this.swap(f.vel);if(this.options.maccormack){this.fluidPass('advect',f.fwd,{}, {uInput:f.dye.a});this.fluidPass('advect',f.rev,{uDt:-1/30},{uInput:f.fwd});this.fluidPass('correct',f.dye.b,{}, {uOriginal:f.dye.a,uForward:f.fwd,uReverse:f.rev});this.swap(f.dye);}else{this.fluidPass('advect',f.dye.b,{}, {uInput:f.dye.a});this.swap(f.dye);}this.fluidPass('source',f.dye.b);this.swap(f.dye);this.touch[2]*=.7;this.touch[3]*=.7;}
 initWave(){this.wave=this.pair(96,144,this.float);for(let a of [this.wave.a,this.wave.b])this.clearTarget(a,[.5,.5,0,1]);this.waveProgram=this.program('wave',WAVE_SHADER);}
 updateWave(){const pulse=Math.floor(this.t/2.4);let strength=pulse!==this.lastWavePulse?1:0;this.lastWavePulse=pulse;const pt=this.touch[2]||this.touch[3]?[this.touch[0],this.touch[1]]:[.5+.15*Math.sin(pulse*2.3),.5+.15*Math.cos(pulse*1.7)];strength=Math.max(strength,Math.abs(this.touch[2])+Math.abs(this.touch[3]));this.drawQuad(this.waveProgram,this.wave.b,{uGrid:[96,144],uPoint:pt,uImpulse:strength*this.source},{uField:this.wave.a});this.swap(this.wave);this.touch[2]*=.6;this.touch[3]*=.6;}
 initParticles(){let n=this.options.particles;this.cpuParticles=new Float32Array(n*4);this.pVelocity=new Float32Array(n*2);this.pLife=new Float32Array(n);for(let i=0;i<n;i++)this.resetParticle(i,true);if(this.effect.id==='trails'&&this.route==='stateful'){this.trail=this.pair(256,384,false);for(let a of [this.trail.a,this.trail.b])this.clearTarget(a);}this.pDirty=true;const g=this.gl;g.bindBuffer(g.ARRAY_BUFFER,this.particleBuffer);if(this.effect.id==='trails'&&this.route==='lite'){this.lineSeeds=new Float32Array(n*8);for(let i=0;i<n;i++){this.lineSeeds.set(this.seedData.subarray(i*4,i*4+4),i*8);this.lineSeeds.set(this.seedData.subarray(i*4,i*4+4),i*8+4);this.lineSeeds[i*8+7]+=2;}g.bufferData(g.ARRAY_BUFFER,this.lineSeeds,g.STATIC_DRAW);}else g.bufferData(g.ARRAY_BUFFER,this.route==='stateful'?this.cpuParticles:this.seedData.subarray(0,n*4),this.route==='stateful'?g.DYNAMIC_DRAW:g.STATIC_DRAW);this.particleProgram=this.program('particle-'+this.effect.id+'-'+this.route,this.effect.id==='trails'&&this.route==='lite'?'varying vec3 vColor;varying float vAlpha;void main(){OUT=vec4(vColor*vAlpha,vAlpha);}':PARTICLE_FS,PARTICLE_VS.replace('KIND_VALUE',String(EFFECTS.indexOf(this.effect))).replace('STATE_VALUE',this.route==='stateful'?'1':'0'));this.fadeProgram=this.program('fade','varying vec2 vUv;uniform sampler2D uTrail;uniform float uFade;void main(){OUT=texture2D(uTrail,vUv)*uFade;}');this.trailComposite=this.program('trailComp','varying vec2 vUv;uniform sampler2D uTrail,uScene;void main(){OUT=vec4(texture2D(uScene,vUv).rgb+texture2D(uTrail,vUv).rgb,1);}');}
 resetParticle(i,initial=false){const a=this.cpuParticles,v=this.pVelocity,s=this.seedData,i4=i*4,i2=i*2;const life=2+s[i4+2]*3;let age=initial?s[i4+1]*life:0;let id=this.effect.id;a[i4]=.5+(s[i4]-.5)*.08;a[i4+1]=.17;a[i4+2]=age;a[i4+3]=s[i4+3];this.pLife[i]=life;v[i2]=(s[i4]-.5)*(id==='splash'?.55:.16);v[i2+1]=id==='splash'?.45+s[i4+1]*.25:.12+s[i4+1]*.25;if(id==='dust'){a[i4]=s[i4];a[i4+1]=s[i4+1];v[i2]=.04;v[i2+1]=.012;}if(id==='trails'){a[i4]=.5+Math.cos(s[i4]*6.283)*(.12+s[i4+1]*.20);a[i4+1]=.5+Math.sin(s[i4]*6.283)*(.12+s[i4+1]*.20);v[i2]=0;v[i2+1]=0;}}
 updateParticles(dt){this.pDirty=true;const n=this.options.particles,a=this.cpuParticles,v=this.pVelocity,id=this.effect.id;for(let i=0;i<n;i++){let j=i*4,k=i*2;a[j+2]+=dt;if(a[j+2]>this.pLife[i]||a[j+1]>.99||a[j]<-.1||a[j]>1.1){if(this.source)this.resetParticle(i);else{a[j+1]=-3;continue;}}let x=a[j]-.5,y=a[j+1]-.5;if(id==='trails'){let r=Math.hypot(x,y)+.02;let tx=-y/r*.18+x*.012,ty=x/r*.18+y*.012;v[k]+=(tx-v[k])*dt*4;v[k+1]+=(ty-v[k+1])*dt*4;}else if(id==='splash'){v[k+1]-=dt*.30;if(a[j+1]<.12&&v[k+1]<0){a[j+1]=.12;v[k+1]*=-.35;v[k]*=.65;}}else{v[k]+=(Math.sin(a[j+1]*11+this.t*.8)*.045-v[k])*.9*dt;if(id==='sparks')v[k+1]-=.022*dt;else v[k+1]+=Math.sin(a[j]*12+this.t*.4)*.012*dt;}const dx=a[j]-this.touch[0],dy=a[j+1]-this.touch[1],att=Math.exp(-(dx*dx+dy*dy)*65);v[k]+=this.touch[2]*att*dt;v[k+1]+=this.touch[3]*att*dt;a[j]+=v[k]*dt;a[j+1]+=v[k+1]*dt;}this.touch[2]*=.8;this.touch[3]*=.8;}
 renderParticles(out=null){const g=this.gl;g.bindFramebuffer(g.FRAMEBUFFER,out?out.fb:null);g.viewport(0,0,out?out.w:this.canvas.width,out?out.h:this.canvas.height);g.disable(g.DEPTH_TEST);g.enable(g.BLEND);g.blendFunc(g.ONE,g.ONE);this.use(this.particleProgram,{uTime:this.t,uAspect:this.canvas.width/this.canvas.height,uResolution:[this.canvas.width,this.canvas.height],uSource:this.source},{uNoise:this.noise});g.bindBuffer(g.ARRAY_BUFFER,this.particleBuffer);if(this.route==='stateful'&&this.pDirty){g.bufferSubData(g.ARRAY_BUFFER,0,this.cpuParticles);this.pDirty=false;}g.enableVertexAttribArray(0);g.vertexAttribPointer(0,4,g.FLOAT,false,0,0);g.disableVertexAttribArray(1);g.drawArrays(this.effect.id==='trails'&&this.route==='lite'?g.LINES:g.POINTS,0,this.options.particles*(this.effect.id==='trails'&&this.route==='lite'?2:1));this.drawCalls++;g.disable(g.BLEND);}
 initMesh(){const g=this.gl,lat=24,lon=40,pos=[],norm=[],idx=[];for(let y=0;y<=lat;y++){let v=y/lat*Math.PI;for(let x=0;x<=lon;x++){let u=x/lon*Math.PI*2,p=[Math.sin(v)*Math.cos(u),Math.cos(v),Math.sin(v)*Math.sin(u)];pos.push(...p);norm.push(...p);}}for(let y=0;y<lat;y++)for(let x=0;x<lon;x++){let a=y*(lon+1)+x,b=a+lon+1;idx.push(a,b,a+1,b,b+1,a+1);}g.bindBuffer(g.ARRAY_BUFFER,this.meshBuffer);g.bufferData(g.ARRAY_BUFFER,new Float32Array(pos),g.STATIC_DRAW);g.bindBuffer(g.ARRAY_BUFFER,this.meshNormal);g.bufferData(g.ARRAY_BUFFER,new Float32Array(norm),g.STATIC_DRAW);g.bindBuffer(g.ELEMENT_ARRAY_BUFFER,this.meshIndex);g.bufferData(g.ELEMENT_ARRAY_BUFFER,new Uint16Array(idx),g.STATIC_DRAW);this.meshCount=idx.length;this.meshProgram=this.program('mesh-'+this.effect.id+'-'+this.route,MESH_FS.replace('METAL_VALUE',this.effect.id==='metal'?'1':'0'),MESH_VS.replace('STATE_VALUE',this.route==='stateful'?'1':'0').replace('METAL_VALUE',this.effect.id==='metal'?'1':'0'));}
 updateSprings(dt){this.springT+=dt;if(this.springT>2.5){this.springT-=2.5;for(let i=0;i<4;i++)this.springs[i*2+1]+=(i%2?-.6:.7);}for(let i=0;i<4;i++){let x=this.springs[i*2],v=this.springs[i*2+1];v+=(-22*x-3.5*v)*dt;this.springs[i*2]=x+v*dt;this.springs[i*2+1]=v;}if(this.touch[2]||this.touch[3]){this.springs[1]+=(this.touch[2]+this.touch[3])*.25;this.touch[2]*=.5;this.touch[3]*=.5;}}
 renderMesh(){const g=this.gl;g.bindFramebuffer(g.FRAMEBUFFER,null);g.viewport(0,0,this.canvas.width,this.canvas.height);g.clear(g.DEPTH_BUFFER_BIT);g.enable(g.DEPTH_TEST);g.disable(g.CULL_FACE);this.use(this.meshProgram,{uTime:this.t,uAspect:this.canvas.width/this.canvas.height,uSpring:[this.springs[0],this.springs[2],this.springs[4],this.springs[6]]});g.bindBuffer(g.ARRAY_BUFFER,this.meshBuffer);g.enableVertexAttribArray(0);g.vertexAttribPointer(0,3,g.FLOAT,false,0,0);g.bindBuffer(g.ARRAY_BUFFER,this.meshNormal);g.enableVertexAttribArray(1);g.vertexAttribPointer(1,3,g.FLOAT,false,0,0);g.bindBuffer(g.ELEMENT_ARRAY_BUFFER,this.meshIndex);g.drawElements(g.TRIANGLES,this.meshCount,g.UNSIGNED_SHORT,0);this.drawCalls++;g.disable(g.DEPTH_TEST);}
 advance(dt=1/60){this.t+=dt;let steps=0;if(this.route==='stateful'){if(this.fluid||this.wave){this.simAccumulator+=dt;while(this.simAccumulator>=1/30&&steps<3){if(this.fluid)this.updateFluid();else this.updateWave();this.simAccumulator-=1/30;steps++;}if(this.simAccumulator>=1/30){this.droppedTime+=this.simAccumulator;this.simAccumulator=0;}}else if(this.effect.engine==='particles'){this.updateParticles(dt);steps=1;}else if(this.effect.engine==='mesh'){this.updateSprings(dt);steps=1;}}this.simSteps+=steps;return steps;}
 render(){const g=this.gl;g.disable(g.BLEND);g.disable(g.DEPTH_TEST);const type=this.effect.engine;
 if(type==='particles'){if(this.trail){this.drawQuad(this.fadeProgram,this.trail.b,{uFade:.94},{uTrail:this.trail.a});this.renderParticles(this.trail.b);this.swap(this.trail);for(let i=0;i<this.layers;i++)this.drawQuad(this.trailComposite,null,{}, {uScene:this.scene,uTrail:this.trail.a});}else{for(let i=0;i<this.layers;i++){if(i===0)this.drawQuad(this.background,null,{}, {uScene:this.scene});this.renderParticles();}}return;}
 if(type==='mesh'){this.drawQuad(this.background,null,{}, {uScene:this.scene});for(let i=0;i<this.layers;i++)this.renderMesh();return;}
 if(type==='none'){for(let i=0;i<this.layers;i++)this.drawQuad(this.background,null,{}, {uScene:this.scene});return;}
 for(let i=0;i<this.layers;i++)this.drawQuad(this.display,null,{uTime:this.t,uGrid:this.fluid?this.fluid.grid:[96,144],uResolution:[this.canvas.width,this.canvas.height],uAspect:this.canvas.width/this.canvas.height,uSource:this.source,uTouch:this.touch},{uScene:this.scene,uNoise:this.noise,uField:this.fluid?this.fluid.dye.a:(this.wave?this.wave.a:this.empty),uVelocity:this.fluid?this.fluid.vel.a:this.empty});
 }
 info(){return{effect:this.effect.id,route:this.route,width:this.canvas.width,height:this.canvas.height,grid:this.fluid?this.fluid.grid:(this.wave?[96,144]:null),iterations:this.fluid?this.options.iterations:0,maccormack:!!this.options.maccormack,particles:this.effect.engine==='particles'?this.options.particles:null,triangles:this.effect.engine==='mesh'?this.meshCount/3:null,textureBytes:this.memoryBytes,layers:this.layers,source:this.source,boundary:this.effect.limit};}
 check(){const e=this.gl.getError();return{glError:e,finiteTime:Number.isFinite(this.t),simSteps:this.simSteps,info:this.info()};}
}
const FLUID_COMMON=`varying vec2 vUv;uniform sampler2D uVelocity,uField,uPressure,uDivergence,uCurl,uNoise,uInput,uOriginal,uForward,uReverse;uniform vec2 uGrid,uPhysical,uSize;uniform float uDt,uTime,uEnabled;uniform int uKind;uniform vec4 uTouch;
vec2 velocityAt(vec2 p){vec2 e=1./uGrid;return vec2(texture2D(uVelocity,p-vec2(e.x*.5,0)).x,texture2D(uVelocity,p-vec2(0,e.y*.5)).y);}
vec2 trace(vec2 p,float dt){vec2 v=velocityAt(p);vec2 mid=p-.5*dt*v/uPhysical;return clamp(p-dt*velocityAt(mid)/uPhysical,vec2(.001),vec2(.999));}
float src(vec2 p,vec2 c,vec2 radius){vec2 d=(p-c)/radius;return exp(-dot(d,d));}
float solid(vec2 p){if(uKind==16)return 1.-step(.09,length((p-vec2(.30,.50))*vec2(1.,1.5)));return 0.;}
`;
const FLUID_SHADER={
vel:`void main(){vec2 e=1./uGrid;float u=velocityAt(trace(vUv+vec2(e.x*.5,0),uDt)).x,v=velocityAt(trace(vUv+vec2(0,e.y*.5),uDt)).y;OUT=vec4(vec2(u,v)*exp(-uDt*.28),0,0);}`,
curl:`void main(){vec2 e=1./uGrid;float l=velocityAt(vUv-vec2(e.x,0)).y,r=velocityAt(vUv+vec2(e.x,0)).y,b=velocityAt(vUv-vec2(0,e.y)).x,t=velocityAt(vUv+vec2(0,e.y)).x;float h=uPhysical.x/uGrid.x;OUT=vec4((r-l-t+b)/(2.*h),0,0,0);}`,
force:`void main(){vec2 p=vUv,e=1./uGrid,v=texture2D(uVelocity,p).xy;float d=texture2D(uField,p).a;float l=abs(texture2D(uCurl,p-vec2(e.x,0)).r),r=abs(texture2D(uCurl,p+vec2(e.x,0)).r),b=abs(texture2D(uCurl,p-vec2(0,e.y)).r),t=abs(texture2D(uCurl,p+vec2(0,e.y)).r);vec2 grad=vec2(r-l,t-b);grad/=length(grad)+.0001;v+=uDt*vec2(grad.y,-grad.x)*texture2D(uCurl,p).r*4.0/uGrid.x;
float t0=uTime;float jet=src(p,vec2(.5+.018*sin(t0*2.7),.14),vec2(.038,.025));
if(uKind==0||uKind==11){v.y+=d*.70*uDt;v=mix(v,vec2(.12*sin(t0*2.3),.5),jet*.55*uEnabled);}
if(uKind==1){jet=src(p,vec2(.34,.14),vec2(.035,.025))+src(p,vec2(.66,.14),vec2(.035,.025));v.y+=d*.8*uDt;v=mix(v,vec2(.13*sin(t0*2.),.8),clamp(jet*.6,0.,1.)*uEnabled);}
if(uKind==2){v+=uDt*vec2(.015+sin(p.y*9.+t0*.3)*.04,cos(p.x*8.-t0*.4)*.03);}
if(uKind==3){jet=src(p,vec2(.5,.24),vec2(.15,.04));v.y+=d*.25*uDt;v=mix(v,vec2(.16*sin(t0),.20),jet*.3*uEnabled);}
if(uKind==4||uKind==5){float a=src(p,vec2(.25,.30),vec2(.055,.055)),b2=src(p,vec2(.75,.70),vec2(.055,.055));v=mix(v,vec2(.28,.22),a*.5*uEnabled);v=mix(v,vec2(-.28,-.22),b2*.5*uEnabled);}
if(uKind==6||uKind==7){vec2 q=p-.5;float rad=length(q)+.03;vec2 target=vec2(-q.y,q.x)/rad*.40-q*.05;v=mix(v,target,1.-exp(-uDt*1.6));}
if(uKind==8){jet=src(p,vec2(.34,.13),vec2(.022,.025))+src(p,vec2(.5,.13),vec2(.025,.025))+src(p,vec2(.66,.13),vec2(.022,.025));v.y+=d*.30*uDt;v=mix(v,vec2(.19*sin(t0*1.9+p.x*15.),.63),clamp(jet*.6,0.,1.)*uEnabled);}
if(uKind==9||uKind==10){vec2 q=p-.5;v+=uDt*vec2(-q.y,q.x)*.11;v*=exp(-uDt*1.4);v.x+=.003*sin(t0*.7+p.y*7.);}
if(uKind==16){if(p.x<.035)v=vec2(.46,.012*sin(t0*2.3));v*=1.-solid(p);}
if(uKind==19){if(p.y>.89)v=mix(v,vec2(.03*sin(p.x*32.+t0),-.65),.7);v.y-=uDt*.20;}
vec2 q=p-uTouch.xy;float influence=exp(-dot(q,q)/.004);v+=uTouch.zw*influence*.2;
if(uKind!=16&&uKind!=2){float edge=smoothstep(0.,.025,p.x)*smoothstep(0.,.025,1.-p.x);v*=mix(.4,1.,edge);}OUT=vec4(clamp(v,vec2(-2),vec2(2)),0,0);}`,
div:`void main(){vec2 e=1./uGrid;vec2 c=texture2D(uVelocity,vUv).xy;float l=texture2D(uVelocity,vUv-vec2(e.x,0)).x,b=texture2D(uVelocity,vUv-vec2(0,e.y)).y;float h=uPhysical.x/uGrid.x;OUT=vec4((c.x-l+c.y-b)/h,0,0,0);}`,
pressure:`void main(){vec2 p=vUv,e=1./uGrid;float c=texture2D(uPressure,p).r;vec2 L=p-vec2(e.x,0),R=p+vec2(e.x,0),B=p-vec2(0,e.y),T=p+vec2(0,e.y);float l=mix(texture2D(uPressure,L).r,c,solid(L)),r=mix(texture2D(uPressure,R).r,c,solid(R)),b=mix(texture2D(uPressure,B).r,c,solid(B)),t=mix(texture2D(uPressure,T).r,c,solid(T));float h=uPhysical.x/uGrid.x;float pr=(l+r+b+t-h*h*texture2D(uDivergence,p).r)*.25;if(p.y>1.-e.y||p.x<e.x||p.x>1.-e.x||solid(p)>.5)pr=0.;OUT=vec4(pr,0,0,0);}`,
project:`void main(){vec2 p=vUv,e=1./uGrid;float c=texture2D(uPressure,p).r,r=texture2D(uPressure,p+vec2(e.x,0)).r,t=texture2D(uPressure,p+vec2(0,e.y)).r;vec2 v=texture2D(uVelocity,p).xy-vec2(r-c,t-c)/(uPhysical.x/uGrid.x);v*=1.-solid(p);OUT=vec4(v,0,0);}`,
advect:`void main(){OUT=texture2D(uInput,trace(vUv,uDt));}`,
correct:`void main(){vec2 pos=trace(vUv,uDt),p=pos*uSize-.5,i=floor(p),e=1./uSize;vec4 a=texture2D(uOriginal,(i+.5)*e),b=texture2D(uOriginal,(i+vec2(1.5,.5))*e),c=texture2D(uOriginal,(i+vec2(.5,1.5))*e),d=texture2D(uOriginal,(i+1.5)*e);vec4 lo=min(min(a,b),min(c,d)),hi=max(max(a,b),max(c,d));OUT=clamp(texture2D(uForward,vUv)+.5*(texture2D(uOriginal,vUv)-texture2D(uReverse,vUv)),lo,hi);}`,
source:`void main(){vec2 p=vUv;vec4 old=texture2D(uField,p);float decay=.55;if(uKind==1)decay=1.2;if(uKind==4||uKind==5)decay=.12;if(uKind==9||uKind==10)decay=.16;vec4 d=old*exp(-uDt*decay);float s=0.;vec3 color=vec3(.6,.75,.8);float t=uTime;
if(uKind==0||uKind==11)s=src(p,vec2(.5+.018*sin(t*2.7),.14),vec2(.035,.024))*2.;
if(uKind==1)s=(src(p,vec2(.34,.14),vec2(.034,.024))+src(p,vec2(.66,.14),vec2(.034,.024)))*2.2;
if(uKind==2){s=(.3+.7*texture2D(uNoise,p*.6+t*.006).r)*.12;s+=src(p,vec2(.18,.35),vec2(.09,.22))*.4;}
if(uKind==3){s=src(p,vec2(.5,.24),vec2(.15,.04));color=vec3(.1,.6,.25);}
if(uKind==4||uKind==5){float a=src(p,vec2(.25,.30),vec2(.06,.05)),b=src(p,vec2(.75,.70),vec2(.06,.05));d.rgb+=uDt*3.*(a*vec3(.04,.7,1.)+b*vec3(1.,.05,.35))*uEnabled;s=a+b;}
if(uKind==6||uKind==7){vec2 q=p-.5;float r=length(q);float ring=exp(-pow((r-(uKind==7?.27:.20))/.023,2.));float angle=atan(q.y,q.x);s=ring*(.18+.82*pow(.5+.5*sin(angle*3.+t*.2),4.));color=uKind==7?vec3(1.,.25,.02):vec3(.08,.65,1.);}
if(uKind==8){s=src(p,vec2(.34,.13),vec2(.023,.02))+src(p,vec2(.5,.13),vec2(.023,.02))+src(p,vec2(.66,.13),vec2(.023,.02));color=vec3(.1,.5,1.);}
if(uKind==9||uKind==10){s=src(p,vec2(.42+.08*sin(t*.4),.43),vec2(.11,.12))*.65+src(p,vec2(.62,.59),vec2(.09,.09))*.35;}
if(uKind==16){s=exp(-pow((p.x-.025)/.015,2.))*exp(-pow((p.y-.5)/.11,2.))*2.;color=mix(vec3(.08,.5,1.),vec3(1.,.35,.03),smoothstep(.49,.51,p.y));}
if(uKind==19){s=exp(-pow((p.y-.93)/.025,2.))*smoothstep(.19,.25,p.x)*(1.-smoothstep(.75,.81,p.x))*(.4+.6*texture2D(uNoise,vec2(p.x*1.4,t*.02)).r)*2.;color=vec3(.3,.7,.8);}
if(uKind!=4&&uKind!=5)d.rgb+=color*s*uDt*4.*uEnabled;d.a+=s*uDt*4.*uEnabled;d*=1.-solid(p);if(uKind!=16){d*=mix(.90,1.,smoothstep(.0,.025,p.y)*smoothstep(.0,.025,1.-p.y));}OUT=clamp(d,vec4(0.),vec4(4.));}`
};
const WAVE_SHADER=`varying vec2 vUv;uniform sampler2D uField;uniform vec2 uGrid,uPoint;uniform float uImpulse;void main(){vec2 p=vUv,e=1./uGrid;vec2 hv=(texture2D(uField,p).rg-.5)*2.;float l=(texture2D(uField,p-vec2(e.x,0)).r-.5)*2.,r=(texture2D(uField,p+vec2(e.x,0)).r-.5)*2.,b=(texture2D(uField,p-vec2(0,e.y)).r-.5)*2.,t=(texture2D(uField,p+vec2(0,e.y)).r-.5)*2.;float v=(hv.y+(l+r+b+t-4.*hv.x)*.35)*.983;float h=hv.x+v*.8;vec2 d=(p-uPoint)*vec2(1.,1.5);h+=uImpulse*exp(-dot(d,d)/.0013)*.17;float edge=smoothstep(0.,.04,p.x)*smoothstep(0.,.04,1.-p.x)*smoothstep(0.,.04,p.y)*smoothstep(0.,.04,1.-p.y);OUT=vec4(clamp(vec2(h,v)*edge*.5+.5,.001,.999),0,1);}`;
const PARTICLE_VS=`#define KIND KIND_VALUE
#define STATEFUL STATE_VALUE
attribute vec4 aData;uniform float uTime,uAspect,uSource;uniform vec2 uResolution;varying vec3 vColor;varying float vAlpha;
void main(){vec2 p;float age,seed;
#if STATEFUL == 1
p=aData.xy;age=aData.z;seed=aData.w;
#else
seed=aData.w;float life=2.+aData.z*3.;age=mod(uTime+aData.y*life,life);float x=aData.x-.5;
#if KIND == 14
float a=aData.x*6.283+uTime*(.3+aData.y*.15)-step(1.,aData.w)*.11;float r=.12+aData.z*.23;p=vec2(.5+cos(a)*r,.5+sin(a)*r);
#elif KIND == 15
p=fract(aData.xy+vec2(uTime*.025+sin(uTime*.4+aData.z*6.)*.015,uTime*.006));
#elif KIND == 18
p=vec2(.5+x*.5*age,.15+(.45+aData.y*.25)*age-.15*age*age);
#else
p=vec2(.5+x*.11+sin(age*1.7+aData.z*5.)*age*.018,.15+age*(.13+aData.x*.10));
#endif
#endif
vAlpha=smoothstep(0.,.2,age)*(1.-smoothstep(2.6,4.9,age));
#if STATEFUL == 0
vAlpha*=uSource;
#endif
#if KIND == 14
vColor=vec3(.12,.68,1.7);vAlpha=.32;
#elif KIND == 15
vColor=vec3(.65,.77,.61);vAlpha*=.25;
#elif KIND == 18
vColor=vec3(.32,.70,1.0);vAlpha*=smoothstep(.10,.16,p.y);
#else
vColor=mix(vec3(1.8,.28,.035),vec3(2.,1.2,.3),seed);
#endif
gl_Position=vec4(p*2.-1.,0,1);gl_PointSize=clamp((1.4+seed*2.8)*uResolution.x/360.,1.,12.);
}`;
const PARTICLE_FS=`varying vec3 vColor;varying float vAlpha;void main(){float r=length(gl_PointCoord-.5)*2.;float a=(1.-smoothstep(.1,1.,r))*vAlpha;OUT=vec4(vColor*a,a);}`;
const MESH_VS=`#define STATEFUL STATE_VALUE
#define METAL METAL_VALUE
attribute vec3 aPos,aNormal;uniform float uTime,uAspect;uniform vec4 uSpring;varying vec3 vNormal,vPos;
void main(){vec3 p=aPos,n=aNormal;float strength;
#if STATEFUL == 1
strength=uSpring.x+uSpring.y*exp(-pow(aPos.x-.5,2.)*4.)+uSpring.z*aPos.x*.5+uSpring.w*aPos.z*.5;
#else
float age=mod(uTime,2.5);strength=sin(age*8.)*exp(-age*1.9)*.12;
#endif
#if METAL == 1
vec3 center=normalize(vec3(.38,.24,1.));float d=length(n-center);float hit=exp(-d*d*12.);float dent;
#if STATEFUL == 1
dent=(.12+abs(strength)*1.7)*hit;
#else
dent=.25*exp(-mod(uTime,2.5)*1.4)*hit;
#endif
p-=n*dent;n=normalize(n+(n-center)*hit*dent*18.);
#else
p.y*=.78-strength;p.xz*=1.+strength*.45;float bend=sin(p.y*3.+uTime*1.4)*strength;p.x+=bend;p.z+=strength*sin(p.x*2.);n=normalize(vec3(n.x/(1.+strength*.45),n.y/(.78-strength),n.z));
#endif
float a=.35;float c=cos(a),s=sin(a);p=vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);n=vec3(c*n.x+s*n.z,n.y,-s*n.x+c*n.z);p*=.32;p.y-=.05;float proj=1.0+p.z*.45;gl_Position=vec4(p.x/proj/uAspect*1.65,p.y/proj*1.65,-p.z*.4,1.);vNormal=n;vPos=p;}`;
const MESH_FS=`#define METAL METAL_VALUE
varying vec3 vNormal,vPos;
void main(){vec3 N=normalize(vNormal),L=normalize(vec3(-.5,.8,1.)),V=normalize(vec3(0,0,2.)-vPos);float diff=max(dot(N,L),0.),spec=pow(max(dot(N,normalize(L+V)),0.),75.);float fres=pow(1.-max(dot(N,V),0.),4.);vec3 color;
#if METAL == 1
vec3 R=reflect(-V,N);float strip=pow(max(0.,cos(R.y*5.+R.x*2.)),16.);color=mix(vec3(.035,.075,.11),vec3(.76,.87,.93),smoothstep(-.15,.7,R.y));color+=strip*.65+spec*.9+fres*vec3(.12,.31,.4);
#else
color=vec3(.45,.055,.12)*(.3+.7*diff)+vec3(.65,.20,.08)*pow(max(0.,-N.z),2.);color+=spec*.9+fres*vec3(.5,.22,.29);color+=vec3(.1,.015,.02)*pow(max(0.,N.z),3.);
#endif
OUT=vec4(color,1);}`;
