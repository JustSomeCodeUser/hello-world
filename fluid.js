// Adapted from EMBER v3, MIT. See README.md for pinned provenance.
export function createFluid(gl) {
if(!gl.getExtension('EXT_color_buffer_float')) throw Error('此手機缺少浮點渲染支援，仍可測試烘焙動畫。');
const cfg={n:64,scalarScale:2,dt:1/30,iterations:20,curl:5.5,wind:0,cool:.7,bloom:0,source:true,seed:21,buoyancy:2.6,jet:.9,burn:1.05,smoke:.28,drag:.28,sourceWidth:.10};
const W=1.4,H=2.8;
let simTime=0,stepCount=0,touch=[0,0,0,0],state=null,vel=null,pressure=null,div=null,curl=null,programs={};
const vs=`#version 300 es
precision highp float;out vec2 uv;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.-1.,0,1);}`;
const common=`#version 300 es
precision highp float;precision highp sampler2D;in vec2 uv;out vec4 outColor;
uniform sampler2D uVelocity,uState,uPressure,uDivergence,uCurl,uOriginal,uForward,uReverse,uInput,uParticles;
uniform vec2 uGrid,uPhysical,uSize,uDirection;
uniform float uDt,uTime,uSeed,uCurlAmount,uWind,uCool,uBuoyancy,uJet,uBurn,uSmoke,uDrag,uEnabled,uExposure,uBloom,uEmission,uLevel,uRadius,uSootScale;
uniform vec4 uTouch;uniform int uMode;
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
vec2 velocityAt(vec2 p){vec2 e=1./uGrid;return vec2(texture(uVelocity,p-vec2(e.x*.5,0)).x,texture(uVelocity,p-vec2(0,e.y*.5)).y);}
vec2 trace(vec2 p,float dt){vec2 v=velocityAt(p);vec2 m=p-.5*dt*v/uPhysical;return clamp(p-dt*velocityAt(m)/uPhysical,vec2(.00001),vec2(.99999));}
`;
const shaders={
advectVelocity:common+`void main(){vec2 e=1./uGrid;vec2 pu=uv+vec2(e.x*.5,0),pv=uv+vec2(0,e.y*.5);float u=velocityAt(trace(pu,uDt)).x,v=velocityAt(trace(pv,uDt)).y;outColor=vec4(vec2(u,v)*exp(-uDt*uDrag),0,0);}`,
forces:common+`void main(){vec2 e=1./uGrid;vec2 v=texture(uVelocity,uv).xy;vec2 p=uv*uPhysical;vec4 d=texture(uState,uv);float t=uTime+uSeed*.17;
float srcX=.7+.011*sin(t*4.3)+.007*sin(t*7.7);vec2 q=(p-vec2(srcX,.182))/vec2(uRadius,.042);float source=exp(-dot(q,q)*1.4)*uEnabled;
v.y+=uDt*(uBuoyancy*d.r-.22*d.g);
// Inlet excitation is localized; it is not a prescribed flame silhouette.
float x=(p.x-srcX)/.085;float jet=uJet*(1.+.20*sin(t*8.2)+.12*sin(t*13.7));
v=mix(v,vec2(.19*sin(t*3.1)+.085*sin(t*6.7),jet),source*(1.-exp(-uDt*45.)));
v.x+=uDt*uWind*(.18+d.r*.70+d.g*.40);
float eddy=.045*sin(p.y*8.3-t*2.1)*sin(p.x*11.7+t*.9);v.x+=uDt*eddy*min(d.r+d.g,1.0);
vec2 delta=uv-uTouch.xy;float impulse=exp(-dot(delta,delta)/.0028);v+=impulse*uTouch.zw;
// Open top; damp at distant side/bottom boundaries.
float border=smoothstep(0.,.05,uv.x)*smoothstep(0.,.05,1.-uv.x)*smoothstep(0.,.025,uv.y);
v*=mix(.65,1.,border);if(uv.y<e.y) v.y=max(v.y,0.);outColor=vec4(clamp(v,vec2(-5),vec2(5)),0,0);}`,
curl:common+`void main(){vec2 e=1./uGrid;float l=velocityAt(uv-vec2(e.x,0)).y,r=velocityAt(uv+vec2(e.x,0)).y,b=velocityAt(uv-vec2(0,e.y)).x,t=velocityAt(uv+vec2(0,e.y)).x;float h=uPhysical.x/uGrid.x;outColor=vec4((r-l-t+b)/(2.*h),0,0,0);}`,
confinement:common+`void main(){vec2 e=1./uGrid;float l=abs(texture(uCurl,uv-vec2(e.x,0)).r),r=abs(texture(uCurl,uv+vec2(e.x,0)).r),b=abs(texture(uCurl,uv-vec2(0,e.y)).r),t=abs(texture(uCurl,uv+vec2(0,e.y)).r);vec2 n=vec2(r-l,t-b);n/=length(n)+.0001;float c=texture(uCurl,uv).r;float h=uPhysical.x/uGrid.x;vec2 f=vec2(n.y,-n.x)*c*uCurlAmount*h;vec2 v=texture(uVelocity,uv).xy;outColor=vec4(clamp(v+uDt*f,vec2(-5),vec2(5)),0,0);}`,
divergence:common+`void main(){vec2 e=1./uGrid;vec2 c=texture(uVelocity,uv).xy;float l=texture(uVelocity,uv-vec2(e.x,0)).x,b=texture(uVelocity,uv-vec2(0,e.y)).y;float h=uPhysical.x/uGrid.x;outColor=vec4((c.x-l+c.y-b)/h,0,0,0);}`,
pressure:common+`void main(){vec2 e=1./uGrid;float l=texture(uPressure,uv-vec2(e.x,0)).r,r=texture(uPressure,uv+vec2(e.x,0)).r,b=texture(uPressure,uv-vec2(0,e.y)).r,t=texture(uPressure,uv+vec2(0,e.y)).r;float h=uPhysical.x/uGrid.x;float p=(l+r+b+t-h*h*texture(uDivergence,uv).r)*.25;if(uv.y>1.-e.y||uv.x<e.x||uv.x>1.-e.x)p=0.;outColor=vec4(p,0,0,0);}`,
project:common+`void main(){vec2 e=1./uGrid;float c=texture(uPressure,uv).r,r=texture(uPressure,uv+vec2(e.x,0)).r,t=texture(uPressure,uv+vec2(0,e.y)).r;float h=uPhysical.x/uGrid.x;vec2 v=texture(uVelocity,uv).xy-vec2(r-c,t-c)/h;outColor=vec4(v,0,0);}`,
advect:common+`void main(){outColor=texture(uInput,trace(uv,uDt));}`,
correct:common+`void main(){vec2 pos=trace(uv,uDt);vec2 p=pos*uSize-.5;vec2 i=floor(p);vec2 e=1./uSize;vec4 a=texture(uOriginal,(i+.5)*e),b=texture(uOriginal,(i+vec2(1.5,.5))*e),c=texture(uOriginal,(i+vec2(.5,1.5))*e),d=texture(uOriginal,(i+1.5)*e);vec4 lo=min(min(a,b),min(c,d)),hi=max(max(a,b),max(c,d));vec4 v=texture(uForward,uv)+.5*(texture(uOriginal,uv)-texture(uReverse,uv));outColor=clamp(v,lo,hi);}`,
reaction:common+`void main(){vec4 a=texture(uState,uv);float t=uTime+uSeed*.17;float temp=a.r,soot=a.g,fuel=a.b,gas=a.a;
float burnt=min(fuel,fuel*uBurn*uDt*smoothstep(.18,.65,temp));fuel-=burnt;temp+=burnt*.52;soot+=burnt*uSmoke;
temp=max(0.,temp-uDt*(uCool*temp+.12*temp*temp+.022*gas));soot*=exp(-uDt*.17);gas*=exp(-uDt*.08);
vec2 p=uv*uPhysical;float sx=.7+.011*sin(t*4.3)+.007*sin(t*7.7);vec2 q=(p-vec2(sx,.182))/vec2(uRadius,.026);
float source=exp(-dot(q,q)*1.5)*uEnabled;float pulse=1.+.075*sin(t*9.)+.045*sin(t*17.3);float supply=1.-exp(-uDt*60.*source);
temp=mix(temp,1.58*pulse,supply);fuel=mix(fuel,1.0,supply);soot=mix(soot,.055,supply);gas=mix(gas,1.,supply);
float fade=smoothstep(0.,.018,uv.x)*smoothstep(0.,.018,1.-uv.x)*smoothstep(0.,.012,1.-uv.y);outColor=max(vec4(temp,soot,fuel,gas)*fade,vec4(0));}`,
particles:common+`void main(){vec4 p=texture(uParticles,uv);float seed=hash(vec2(floor(uv.x*128.),uSeed));float life=1.3+seed*2.4;if(p.z>life||p.y>.98||p.x<.01||p.x>.99||p.z<.001){p=vec4(.5+(seed-.5)*.10,.065,seed*.05,seed);if(uEnabled<.5)p.y=-10.;}vec2 v=velocityAt(p.xy);p.xy+=uDt*(v+vec2(.035*sin(seed*91.+p.z*3.),.10+seed*.18))/uPhysical;p.z+=uDt;outColor=p;}`,
extract:common+`void main(){vec2 e=1./uSize;vec3 c=(texture(uInput,uv+e*vec2(-.5,-.5)).rgb+texture(uInput,uv+e*vec2(.5,-.5)).rgb+texture(uInput,uv+e*vec2(-.5,.5)).rgb+texture(uInput,uv+e*vec2(.5,.5)).rgb)*.25;float m=max(c.r,max(c.g,c.b));outColor=vec4(uLevel<.5?c*max(0.,m-.8)/max(m,.0001):c,1);}`,
blur:common+`void main(){vec2 e=uDirection/uSize;vec3 c=texture(uInput,uv).rgb*.227027;c+=texture(uInput,uv+e*1.384615).rgb*.316216;c+=texture(uInput,uv-e*1.384615).rgb*.316216;c+=texture(uInput,uv+e*3.230769).rgb*.070270;c+=texture(uInput,uv-e*3.230769).rgb*.070270;outColor=vec4(c,1);}`,
composite:common+`uniform sampler2D uB0,uB1,uB2,uB3;vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}void main(){vec3 c=texture(uInput,uv).rgb;vec3 glow=texture(uB0,uv).rgb*.45+texture(uB1,uv).rgb*.65+texture(uB2,uv).rgb*.8+texture(uB3,uv).rgb*.7;if(uMode==0)c+=uBloom*glow;vec3 outC=pow(aces(c*uExposure),vec3(1./2.2));float vignette=1.-.14*pow(length((uv-.5)*vec2(1.,.8)),1.5);outColor=vec4(outC*vignette,1.);}`
};
function program(vertex,fragment,name){function compile(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){throw Error(name+': '+gl.getShaderInfoLog(s));}return s;}const v=compile(gl.VERTEX_SHADER,vertex),f=compile(gl.FRAGMENT_SHADER,fragment),p=gl.createProgram();gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);gl.deleteShader(v);gl.deleteShader(f);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(name+': '+gl.getProgramInfoLog(p));const uniforms={};for(let i=0;i<gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);i++){const a=gl.getActiveUniform(p,i);uniforms[a.name]={loc:gl.getUniformLocation(p,a.name),type:a.type};}return {p,uniforms};}
function target(w,h,depth=false){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,w,h,0,gl.RGBA,gl.HALF_FLOAT,null);const fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);let rb=null;if(depth){rb=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,rb);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,w,h);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,rb);}if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('RGBA16F framebuffer incomplete');gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|(depth?gl.DEPTH_BUFFER_BIT:0));return {t,fb,w,h,rb};}
function pair(w,h){return {a:target(w,h),b:target(w,h)}}function swap(p){[p.a,p.b]=[p.b,p.a]}
function destroy(t){if(!t)return;if(t.a){destroy(t.a);destroy(t.b);return;}gl.deleteTexture(t.t);gl.deleteFramebuffer(t.fb);if(t.rb)gl.deleteRenderbuffer(t.rb);}
function uniform(p,k,v){const u=p.uniforms[k];if(!u||v==null)return;const l=u.loc;switch(u.type){case gl.FLOAT:gl.uniform1f(l,v);break;case gl.INT:case gl.BOOL:case gl.SAMPLER_2D:gl.uniform1i(l,v);break;case gl.FLOAT_VEC2:gl.uniform2fv(l,v);break;case gl.FLOAT_VEC3:gl.uniform3fv(l,v);break;case gl.FLOAT_VEC4:gl.uniform4fv(l,v);break;case gl.FLOAT_MAT4:gl.uniformMatrix4fv(l,false,v);break;}}
const emptyVAO=gl.createVertexArray();
function use(p,values={},textures={}){gl.useProgram(p.p);for(const [k,v] of Object.entries(values))uniform(p,k,v);let i=0;for(const [k,t] of Object.entries(textures)){if(!p.uniforms[k])continue;gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,t.t||t);uniform(p,k,i++);}}
function pass(name,out,values={},textures={}){const p=programs[name];gl.bindFramebuffer(gl.FRAMEBUFFER,out?out.fb:null);gl.viewport(0,0,out?out.w:canvas.width,out?out.h:canvas.height);gl.bindVertexArray(emptyVAO);use(p,{uGrid:[cfg.n,cfg.n*2],uPhysical:[W,H],uSize:state?[state.a.w,state.a.h]:[1,1],uDt:cfg.dt,uTime:simTime,uSeed:cfg.seed,uCurlAmount:cfg.curl,uWind:cfg.wind,uCool:cfg.cool,uBuoyancy:cfg.buoyancy,uJet:cfg.jet,uBurn:cfg.burn,uSmoke:cfg.smoke,uDrag:cfg.drag,uRadius:cfg.sourceWidth,uEnabled:cfg.source?1:0,uTouch:touch,...values},{uVelocity:vel?.a,uState:state?.a,uPressure:pressure?.a,uDivergence:div,uCurl:curl,...textures});gl.drawArrays(gl.TRIANGLES,0,3);}

const selected=['advectVelocity','forces','curl','confinement','divergence','pressure','project','advect','correct','reaction'];
for(const k of selected)programs[k]=program(vs,shaders[k],k);
const n=cfg.n,d=n*cfg.scalarScale;
state=pair(d,d*2);vel=pair(n,n*2);pressure=pair(n,n*2);div=target(n,n*2);curl=target(n,n*2);
const tmp1=target(d,d*2),tmp2=target(d,d*2);
function step(){
gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);simTime+=cfg.dt;
pass('advectVelocity',vel.b);swap(vel);pass('forces',vel.b);swap(vel);
pass('curl',curl);pass('confinement',vel.b);swap(vel);pass('divergence',div);
for(let i=0;i<cfg.iterations;i++){pass('pressure',pressure.b);swap(pressure);}
pass('project',vel.b);swap(vel);
pass('advect',tmp1,{}, {uInput:state.a});
pass('advect',tmp2,{uDt:-cfg.dt},{uInput:tmp1});
pass('correct',state.b,{}, {uOriginal:state.a,uForward:tmp1,uReverse:tmp2});swap(state);
pass('reaction',state.b);swap(state);stepCount++;
}
return {step,get texture(){return state.a.t},get time(){return simTime},get steps(){return stepCount},config:{...cfg},
stats(){const a=new Float32Array(d*d*2*4);gl.bindFramebuffer(gl.FRAMEBUFFER,state.a.fb);gl.readPixels(0,0,d,d*2,gl.RGBA,gl.FLOAT,a);let max=[0,0,0,0],sum=[0,0,0,0],finite=true;for(let i=0;i<a.length;i++){let k=i%4;finite=finite&&Number.isFinite(a[i]);max[k]=Math.max(max[k],a[i]);sum[k]+=a[i];}return {finite,max,mean:sum.map(v=>v/(d*d*2))};},
dispose(){[state,vel,pressure,div,curl,tmp1,tmp2].forEach(destroy);Object.values(programs).forEach(p=>gl.deleteProgram(p.p));gl.deleteVertexArray(emptyVAO);}};
}
