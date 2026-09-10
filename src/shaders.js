export const vertexShader = `
attribute float aSize;
attribute float aPhase;
uniform float uTime;
uniform float uPixelRatio;
uniform float uOpacity;
varying vec3 vColor;
varying float vAlpha;
void main(){
 vColor = color;
 vec4 mv = modelViewMatrix * vec4(position,1.0);
 gl_Position = projectionMatrix * mv;
 float twinkle = 0.78 + 0.22*sin(uTime*0.65+aPhase);
 float worldScale = length(modelMatrix[0].xyz);
 gl_PointSize = clamp(aSize*uPixelRatio*(80.0*worldScale/max(0.1,-mv.z)),1.0,42.0);
 vAlpha = twinkle*uOpacity;
}`;
export const fragmentShader = `
varying vec3 vColor;
varying float vAlpha;
void main(){
 float d=length(gl_PointCoord-0.5)*2.0;
 if(d>1.0) discard;
 float glow=exp(-d*d*5.0)*0.55+exp(-d*d*35.0)*0.45;
 gl_FragColor=vec4(vColor,glow*vAlpha);
}`;
