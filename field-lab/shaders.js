'use strict';
// Shader variants are specialized at compile time. Lite never requires float render targets.
const COMMON=`
uniform sampler2D uNoise,uField,uVelocity,uScene,uTrail;
uniform vec2 uResolution,uGrid;uniform float uTime,uStateful,uSource,uAspect;uniform vec4 uTouch;
float n(vec2 p){return texture2D(uNoise,p).r;}
vec2 nn(vec2 p){return texture2D(uNoise,p).gb*2.-1.;}
float fb(vec2 p){return n(p)*.60+n(p*2.03+vec2(.17,.31))*.28+n(p*4.01)*.12;}
float ss(float a,float b,float x){return smoothstep(a,b,x);}
float blob(vec2 p,vec2 c,vec2 r){vec2 d=(p-c)/r;return exp(-dot(d,d));}
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
vec3 grade(vec3 c){return 1.-exp(-max(c,vec3(0.)));}
vec3 bg(vec2 p){return texture2D(uScene,clamp(p,vec2(.001),vec2(.999))).rgb;}
vec2 flowUV(vec2 p,float speed){vec2 q=p*vec2(.62,.44)+vec2(0.,-uTime*speed);return q+nn(q*.57+uTime*.013)*.085;}
float density(vec2 p){
#if STATEFUL == 1
return max(0.,texture2D(uField,clamp(p,vec2(.001),vec2(.999))).a);
#else
float h=max(0.,p.y-.12);float center=.5+sin(h*9.-uTime*.8)*.06*h+nn(vec2(h*.14,uTime*.021)).x*.07*h;
float width=.025+h*.20;float d=blob(p,vec2(center,.40),vec2(width,.43));
float f=fb(flowUV(p,.055));return d*ss(.28,.67,f)*2.5*ss(.10,.17,p.y)*(1.-ss(.78,1.,p.y))*uSource;
#endif
}
vec3 dye(vec2 p){
#if STATEFUL == 1
return max(texture2D(uField,p).rgb,vec3(0.));
#else
vec2 q=p+nn(p*.48+uTime*.012)*.14;float a=atan(q.y-.5,q.x-.5),r=length(q-.5);
float v=fb(vec2(r*.8,a*.10-uTime*.014)+nn(q*.8)*.08);
float b=ss(.30,.66,v)*ss(.05,.18,r)*(1.-ss(.4,.72,r));
return b*mix(vec3(.05,.65,.90),vec3(.9,.15,.38),ss(-.65,.65,sin(a*2.+r*11.-uTime*.36)))*uSource;
#endif
}
`;
const EFFECT_SHADER={
smoke:`void main(){vec2 p=vUv;float d=density(p);float g=density(p+vec2(.008,.008))-d;float a=1.-exp(-d*1.65);vec3 smoke=mix(vec3(.24,.30,.34),vec3(.69,.80,.87),clamp(.55+g*7.,0.,1.));vec3 c=mix(bg(p),smoke,a*.85);float ember=blob(p,vec2(.5,.125),vec2(.022,.012));c+=vec3(1.2,.31,.05)*ember;OUT=vec4(c,1);}`,
steam:`void main(){vec2 p=vUv;float d;
#if STATEFUL == 1
d=density(p);
#else
d=.78*density(vec2(p.x+.16,p.y))+.78*density(vec2(p.x-.16,p.y));
#endif
float a=(1.-exp(-d*1.6))*ss(.13,.30,p.y);vec3 c=mix(bg(p),vec3(.68,.83,.86),a);c+=vec3(.04,.16,.2)*blob(p,vec2(.5,.20),vec2(.3,.05));OUT=vec4(c,1);}`,
fog:`void main(){vec2 p=vUv;vec3 c=bg(p);float fog=0.;
#if STATEFUL == 1
for(int i=0;i<6;i++){float z=(float(i)+.5)/6.;vec2 q=p+vec2(z*.045,z*.08);float d=density(q);fog+=max(0.,d)*.16;}
#else
vec2 q=p*vec2(1.1,.55)+vec2(uTime*.012,-uTime*.006);fog=ss(.30,.69,fb(q+nn(q)*.1))*.85;
#endif
float a=1.-exp(-fog*2.0);a*=ss(.06,.40,p.y)*(1.-ss(.88,1.,p.y));vec3 l=mix(vec3(.16,.27,.30),vec3(.70,.83,.83),p.y);OUT=vec4(mix(c,l,a*.86),1);}`,
poison:`void main(){vec2 p=vUv;float d;
#if STATEFUL == 1
d=density(p);
#else
vec2 q=(p-vec2(.5,.30))*vec2(1.,1.3);q=rot(.2*sin(uTime*.4))*q;d=fb(q*.8+vec2(uTime*.014,-uTime*.021));d=ss(.26,.70,d)*blob(p,vec2(.5,.40),vec2(.36,.33))*2.4*uSource;
#endif
float a=1.-exp(-d*1.2);vec3 col=mix(vec3(.05,.25,.16),vec3(.48,.95,.39),ss(.02,.90,d));OUT=vec4(mix(bg(p),col,a*.8)+vec3(.04,.12,.06)*a,1);}`,
ink:`void main(){vec2 p=vUv;vec3 d=dye(p);float mass=max(d.x,max(d.y,d.z));vec3 c=mix(bg(p),pow(max(d/max(mass,.001),vec3(0.)),vec3(.8)),1.-exp(-mass*3.0));OUT=vec4(c,1);}`,
transition:`void main(){vec2 p=vUv;vec3 d=dye(p);float f;
#if STATEFUL == 1
f=(d.r+d.g+d.b)*.16;
#else
f=fb(p*.7+nn(p*.6+uTime*.015)*.11)*.25;
#endif
float phase=.5+.62*sin(uTime*.45);float mask=ss(phase-.045,phase+.045,p.x+f);vec3 other=mix(vec3(.55,.12,.28),vec3(.92,.63,.23),p.y);other*=.78+.22*sin((p.x+p.y)*14.);float edge=1.-ss(.0,.035,abs(p.x+f-phase));OUT=vec4(mix(bg(p),other,mask)+edge*vec3(.4,.2,.05),1);}`,
vortex:`void main(){vec2 p=vUv,q=(p-.5)*vec2(uAspect,1.);float r=length(q),a=atan(q.y,q.x);float f=fb(vec2(r*.9,a*.11-uTime*.04)+nn(p*.6)*.035);float s=pow(max(0.,sin(a*4.+r*40.-uTime*1.5+f*4.)),9.);float band=ss(.055,.10,r)*(1.-ss(.31,.48,r));vec3 d=dye(p);float e;
#if STATEFUL == 1
e=dot(d,vec3(.35)) * 2.0+s*.2;
#else
e=s*(.4+f)+pow(f,4.)*.35;
#endif
vec3 c=bg(p)+grade(vec3(.15,.9,2.8)*e*band*2.5);c+=vec3(.04,.22,.45)*exp(-abs(r-.12)*22.);OUT=vec4(c,1);}`,
portal:`void main(){vec2 p=vUv,q=(p-.5)*vec2(uAspect,1.);float r=length(q),a=atan(q.y,q.x);float wob=fb(vec2(a*.14-uTime*.035,r*.9))-.5;float ring=exp(-abs(r-.265-wob*.025)*180.);float outer=exp(-abs(r-.265)*22.);float flame=0.;
#if STATEFUL == 1
flame=density(p)*.65;
#else
flame=ss(.34,.75,fb(vec2(a*.35-uTime*.08,r*2.4-uTime*.09)))*exp(-pow((r-.29)/.065,2.));
#endif
vec3 c=bg(p)*(1.-.85*(1.-ss(.22,.25,r)));c+=grade(vec3(3.,.6,.12)*(ring*3.+flame*2.+outer*.17));float sparks=pow(max(0.,sin(a*35.+uTime*2.)),60.)*exp(-abs(r-.33)*110.);OUT=vec4(c+sparks*vec3(1.,.8,.3),1);}`,
energy:`void main(){vec2 p=vUv;float e=0.;
#if STATEFUL == 1
vec3 d=dye(p);e=dot(d,vec3(.4))*2.;
#else
for(int i=0;i<4;i++){float k=float(i);float x=.5+sin(p.y*9.-uTime*1.1+k*1.5)*(.04+.035*k)+nn(vec2(p.y*.1,uTime*.02+k*.13)).x*.03;float w=.003+.002*k;e+=exp(-pow((p.x-x)/w,2.))*(.4+.6*fb(flowUV(p,.08)+k*.1));}e*=ss(.1,.2,p.y)*(1.-ss(.8,.95,p.y));
#endif
vec3 c=bg(p)+grade(vec3(.18,1.1,3.2)*e*3.);OUT=vec4(c,1);}`,
slime:`float thick(vec2 p){
#if STATEFUL == 1
return density(p)*.45;
#else
float a=blob(p,vec2(.43+.10*sin(uTime*.42),.45),vec2(.17,.27));float b=blob(p,vec2(.57,.54+.12*cos(uTime*.31)),vec2(.19,.17));return (a+b)*(.75+.25*fb(p*.7+uTime*.012));
#endif
}void main(){vec2 p=vUv;float h=thick(p);vec2 e=vec2(.003,0);vec2 g=vec2(thick(p+e)-thick(p-e),thick(p+e.yx)-thick(p-e.yx))/.006;vec3 N=normalize(vec3(-g*.14,1.));float m=ss(.11,.18,h);float fres=pow(1.-N.z,3.);vec3 c=bg(p+N.xy*.065);float spec=pow(max(0.,dot(N,normalize(vec3(-.4,.5,1.)))),45.);c=mix(c,c*vec3(.22,.79,.55)+vec3(.01,.07,.04),.35);c+=vec3(.4,.85,.65)*fres*.65+spec*.65;OUT=vec4(mix(bg(p),c,m),1);}`,
glass:`float thick(vec2 p){
#if STATEFUL == 1
return density(p)*.43;
#else
vec2 q=p-.5;q=rot(uTime*.16)*q;float a=blob(q,vec2(-.11,0),vec2(.16,.26));float b=blob(q,vec2(.16,.08),vec2(.14,.18));return a+b;
#endif
}void main(){vec2 p=vUv;float h=thick(p);vec2 e=vec2(.003,0);vec2 g=vec2(thick(p+e)-thick(p-e),thick(p+e.yx)-thick(p-e.yx))/.006;vec3 N=normalize(vec3(-g*.19,1.));float m=ss(.14,.19,h),fres=pow(1.-N.z,3.);vec2 off=N.xy*.08;vec3 c=vec3(bg(p+off*1.04).r,bg(p+off).g,bg(p+off*.96).b);float spec=pow(max(0.,dot(N,normalize(vec3(-.45,.5,1.)))),65.);c+=fres*vec3(.4,.6,.8)*.75+spec*.8;OUT=vec4(mix(bg(p),c,m),1);}`,
heat:`void main(){vec2 p=vUv;float m=blob(p,vec2(.5,.38),vec2(.26,.39));vec2 g;
#if STATEFUL == 1
vec2 e=vec2(.006,0);g=vec2(density(p+e)-density(p-e),density(p+e.yx)-density(p-e.yx))*1.4;
#else
g=nn(p*vec2(1.2,.5)+vec2(0,-uTime*.07))*m*.22*uSource;
#endif
vec3 c=bg(p+g*.035);c+=vec3(.10,.025,0)*blob(p,vec2(.5,.14),vec2(.2,.03));OUT=vec4(c,1);}`,
shield:`float wave(vec2 p){
#if STATEFUL == 1
return (texture2D(uField,p).r-.5)*2.;
#else
vec2 q=p-uTouch.xy;float r=length(q);float t=mod(uTime,3.0);return sin(r*70.-t*11.)*exp(-pow((r-t*.15)/.065,2.))*.16;
#endif
}void main(){vec2 p=vUv,q=(p-.5)*vec2(uAspect,1.);float r=length(q);vec2 e=vec2(.003,0);vec2 g=vec2(wave(p+e)-wave(p-e),wave(p+e.yx)-wave(p-e.yx));float m=1.-ss(.30,.315,r);float edge=exp(-abs(r-.31)*160.);vec3 c=bg(p+g*.55*m);c=mix(c,c*vec3(.76,.93,1.12),m*.3);c+=vec3(.1,.65,1.3)*(abs(wave(p))*.9*m+edge*.8);OUT=vec4(c,1);}`,
wake:`void main(){vec2 p=vUv;vec3 d;
#if STATEFUL == 1
d=dye(p);
#else
vec2 q=p;for(int i=0;i<5;i++){float k=float(i);vec2 center=vec2(.42+mod(k*.13+uTime*.06,.65),.5+sin(k*3.14159)*.1);vec2 v=q-center;float angle=exp(-dot(v,v)*140.)*(mod(k,2.)*2.-1.)*2.8;q=center+rot(angle)*v;}float line=exp(-pow((q.y-.5)/.08,2.));d=line*mix(vec3(.1,.4,.8),vec3(.9,.4,.05),ss(.48,.52,q.y));
#endif
vec3 c=mix(bg(p),d/max(max(d.r,d.g),max(d.b,.01)),1.-exp(-dot(d,vec3(.9))));float obs=1.-ss(.085,.09,length((p-vec2(.30,.50))*vec2(1.,1.5)));c=mix(c,vec3(.11,.16,.20),obs);OUT=vec4(c,1);}`,
water:`float wave(vec2 p){
#if STATEFUL == 1
return (texture2D(uField,p).r-.5)*2.;
#else
float t=uTime;return .025*sin(p.x*32.+t*1.9)+.018*sin(p.y*48.-t*2.3)+.01*sin((p.x+p.y)*67.+t*1.1)+.055*sin(length(p-.5)*65.-t*4.)*exp(-length(p-.5)*4.);
#endif
}void main(){vec2 p=vUv;vec2 e=vec2(.003,0);vec2 g=vec2(wave(p+e)-wave(p-e),wave(p+e.yx)-wave(p-e.yx))/.006;vec3 N=normalize(vec3(-g*.34,1.));vec3 c=bg(p+N.xy*.035)*vec3(.50,.84,.89);float spec=pow(max(dot(N,normalize(vec3(-.4,.55,1.))),0.),80.);float f=pow(1.-N.z,4.);c+=vec3(.68,.87,1.)*(spec*.8+f*.25);OUT=vec4(c,1);}`,
waterfall:`void main(){vec2 p=vUv;float edge=ss(.18,.24,p.x)*(1.-ss(.76,.82,p.x));float d;
#if STATEFUL == 1
d=density(p)*.8;
#else
d=fb(p*vec2(1.8,.6)+vec2(0,uTime*.23));
#endif
vec2 g=nn(p*vec2(1.6,.4)+vec2(0,uTime*.24));float bands=pow(max(0.,sin(p.x*180.+g.x*9.)),4.);float a=(.32+d*.5+bands*.15)*edge*ss(.08,.18,p.y);vec3 c=mix(bg(p),vec3(.3,.65,.72)+bands*.4,a);float foam=fb(p*1.6+uTime*.03)*blob(p,vec2(.5,.13),vec2(.33,.08));c=mix(c,vec3(.8,.94,.95),ss(.15,.5,foam));OUT=vec4(c,1);}`
};
// Quad background, wave update and density transport share the same verified GL plumbing.
