/** Camera distances remain outside the selected sphere, including on narrow screens. */
export function planetCameraFraming(radius, {fov=44,width=1440,height=960,rings=false,immersive=false}={}) {
  if (!Number.isFinite(radius)||radius<=0) throw new RangeError('Planet radius must be positive');
  const extent=radius*(rings?2.4:1.08);
  const aspect=Math.max(.1,width/Math.max(1,height));
  const safeWidth=immersive?width*.94:width>900?Math.max(width*.35,width-600):width*.9;
  const safeHeight=immersive?height*.88:Math.max(height*.45,height-290);
  const tangent=Math.tan(fov*Math.PI/360);
  const angle=Math.atan(Math.min(tangent*safeHeight/height,tangent*aspect*safeWidth/width)*.82);
  return {minDistance:radius*1.18,focusDistance:extent/Math.sin(Math.max(.04,angle)),extent};
}
export function overviewDistance(radius, {fov=44,width=1440,height=960,immersive=false}={}) {
  const safeWidth=immersive?width*.92:width>900?Math.max(width*.4,width-575):width*.92;
  return Math.max(43,radius/(Math.tan(fov*Math.PI/360)*safeWidth/height)*1.1);
}
