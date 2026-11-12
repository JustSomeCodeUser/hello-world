export const fullscreen=`#version 300 es
precision highp float;out vec2 uv;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.-1.,0,1);}`;
export function makeProgram(gl,fragment,vertex=fullscreen){
 const compile=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
 const v=compile(gl.VERTEX_SHADER,vertex),f=compile(gl.FRAGMENT_SHADER,fragment),p=gl.createProgram();gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);gl.deleteShader(v);gl.deleteShader(f);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;
}
export function makeTarget(gl,w,h){const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);const fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('RGBA8 framebuffer unavailable');return {texture,fb,w,h};}
export function deleteTarget(gl,t){if(t){gl.deleteFramebuffer(t.fb);gl.deleteTexture(t.texture);}}
const prefix=`#version 300 es
precision highp float;in vec2 uv;out vec4 color;`;
export function createRenderer(gl){
 const vao=gl.createVertexArray();gl.bindVertexArray(vao);
 const material=makeProgram(gl,prefix+`
uniform sampler2D state;uniform int baked;uniform vec2 frames;uniform float blend;
vec3 sampleFrame(float i){vec2 tile=vec2(mod(i,16.),floor(i/16.));vec2 p=tile*vec2(128.,256.)+clamp(uv*vec2(128.,256.),vec2(.5),vec2(127.5,255.5));return texture(state,p/2048.).rgb*vec3(2.,1.,2.);}
float aces(float x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
void main(){vec3 d;if(baked==1)d=mix(sampleFrame(frames.x),sampleFrame(frames.y),blend);else{vec4 v=texture(state,uv);d=vec3(v.r,v.g,v.a);}
float T=d.x,S=d.y,D=d.z;float edge=smoothstep(0.,.02,uv.x)*smoothstep(0.,.02,1.-uv.x)*smoothstep(0.,.04,1.-uv.y);
vec3 fire=mix(mix(vec3(1.,.055,.001),vec3(1.,.32,.014),smoothstep(.25,.72,T)),vec3(1.,.79,.32),smoothstep(.72,1.6,T));
float emission=pow(max(T-.23,0.),2.45)*7.*smoothstep(.005,.07,D);float intensity=aces(emission*.8);
float alpha=(1.-exp(-S*1.68))*edge;vec3 smoke=vec3(.07,.066,.06)+vec3(.3,.08,.012)*exp(-max(0.,uv.y-.10)*5.5);
vec3 rgb=(fire*intensity+smoke*alpha)*edge;
// A small torch stem anchors the effect; identical in both modes.
float stem=(1.-smoothstep(.016,.022,abs(uv.x-.5)))*(1.-smoothstep(.052,.06,uv.y));
rgb=mix(rgb,vec3(.22,.12,.045),stem);alpha=max(alpha,max(intensity*.15*edge,stem));
color=vec4(rgb,alpha);}`);
 const quadVS=`#version 300 es
precision highp float;out vec2 uv;uniform vec2 resolution;uniform float size;uniform int count;uniform int overlap;
void main(){vec2 corners[6]=vec2[6](vec2(0,0),vec2(1,0),vec2(0,1),vec2(0,1),vec2(1,0),vec2(1,1));uv=corners[gl_VertexID];float i=float(gl_InstanceID);float columns=ceil(sqrt(float(count)*resolution.x/resolution.y));float rows=ceil(float(count)/columns);vec2 cell=vec2(mod(i,columns),floor(i/columns));vec2 fraction=vec2(columns>1.?cell.x/(columns-1.):.5,rows>1.?cell.y/(rows-1.):.5);vec2 extent=vec2(size*.5,size);vec2 margin=min(extent*.5+vec2(12.,26.),resolution*.48);vec2 center=mix(margin,resolution-margin,fraction);if(overlap==1)center=resolution*.5+(fraction-.5)*vec2(size*.18,size*.18);vec2 pos=center+(uv-.5)*extent;gl_Position=vec4(pos/resolution*2.-1.,0,1);}`;
 const sprites=makeProgram(gl,prefix+`uniform sampler2D source;void main(){color=texture(source,uv);}`,quadVS);
 const background=makeProgram(gl,prefix+`uniform vec2 pixels;void main(){vec2 q=uv*pixels;float grid=max(1.-smoothstep(0.,.8,mod(q.x,40.)),1.-smoothstep(0.,.8,mod(q.y,40.)));vec3 c=vec3(.026,.035,.029)+grid*.008;float light=exp(-length((uv-.5)*vec2(1.,1.4))*3.);color=vec4(c+vec3(.012,.014,.009)*light,1);}`);
 const blur=makeProgram(gl,prefix+`uniform sampler2D source;uniform vec2 direction;void main(){vec3 c=texture(source,uv).rgb*.227027;c+=(texture(source,uv+direction*1.384615).rgb+texture(source,uv-direction*1.384615).rgb)*.316216;c+=(texture(source,uv+direction*3.230769).rgb+texture(source,uv-direction*3.230769).rgb)*.070270;color=vec4(c,1);}`);
 const final=makeProgram(gl,prefix+`uniform sampler2D source;uniform sampler2D glow;uniform int enabled;void main(){vec3 c=texture(source,uv).rgb;if(enabled==1)c+=texture(glow,uv).rgb*.48;color=vec4(c,1);}`);
 const pack=makeProgram(gl,prefix+`uniform sampler2D source;void main(){vec4 d=texture(source,uv);color=vec4(d.r*.5,d.g,d.a*.5,1);}`);
 const appearance=makeTarget(gl,128,256),packed=makeTarget(gl,128,256);let scene=null,blurA=null,blurB=null;
 function bindTarget(t){gl.bindFramebuffer(gl.FRAMEBUFFER,t?.fb||null);gl.viewport(0,0,t?.w||gl.canvas.width,t?.h||gl.canvas.height);gl.bindVertexArray(vao);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);}
 function texture(p,name,t,unit=0){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(gl.getUniformLocation(p,name),unit);}
 function resize(w,h){if(scene?.w===w&&scene?.h===h)return;[scene,blurA,blurB].forEach(t=>deleteTarget(gl,t));scene=makeTarget(gl,w,h);blurA=makeTarget(gl,Math.max(1,w>>2),Math.max(1,h>>2));blurB=makeTarget(gl,blurA.w,blurA.h);}
 function render(source,mode,time,manifest,settings,cssSize){
  resize(gl.canvas.width,gl.canvas.height);bindTarget(appearance);gl.useProgram(material);texture(material,'state',source);gl.uniform1i(gl.getUniformLocation(material,'baked'),mode==='baked'?1:0);
  const f=(time*manifest.fps)%manifest.frames;gl.uniform2f(gl.getUniformLocation(material,'frames'),Math.floor(f),(Math.floor(f)+1)%manifest.frames);gl.uniform1f(gl.getUniformLocation(material,'blend'),0);gl.drawArrays(gl.TRIANGLES,0,3);
  bindTarget(scene);gl.useProgram(background);gl.uniform2f(gl.getUniformLocation(background,'pixels'),...cssSize);gl.drawArrays(gl.TRIANGLES,0,3);
  gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.useProgram(sprites);texture(sprites,'source',appearance.texture);gl.uniform2f(gl.getUniformLocation(sprites,'resolution'),...cssSize);gl.uniform1f(gl.getUniformLocation(sprites,'size'),settings.size);gl.uniform1i(gl.getUniformLocation(sprites,'count'),settings.count);gl.uniform1i(gl.getUniformLocation(sprites,'overlap'),settings.layout==='overlap'?1:0);gl.drawArraysInstanced(gl.TRIANGLES,0,6,settings.count);
  if(settings.glow==='on'){bindTarget(blurA);gl.useProgram(blur);texture(blur,'source',scene.texture);gl.uniform2f(gl.getUniformLocation(blur,'direction'),1/blurA.w,0);gl.drawArrays(gl.TRIANGLES,0,3);bindTarget(blurB);texture(blur,'source',blurA.texture);gl.uniform2f(gl.getUniformLocation(blur,'direction'),0,1/blurB.h);gl.drawArrays(gl.TRIANGLES,0,3);}
  bindTarget(null);gl.useProgram(final);texture(final,'source',scene.texture);texture(final,'glow',blurB.texture,1);gl.uniform1i(gl.getUniformLocation(final,'enabled'),settings.glow==='on'?1:0);gl.drawArrays(gl.TRIANGLES,0,3);
 }
 function packState(source){bindTarget(packed);gl.useProgram(pack);texture(pack,'source',source);gl.drawArrays(gl.TRIANGLES,0,3);const a=new Uint8Array(128*256*4);gl.readPixels(0,0,128,256,gl.RGBA,gl.UNSIGNED_BYTE,a);return a;}
 return {render,packState};
}
