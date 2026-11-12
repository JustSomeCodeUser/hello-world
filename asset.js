export const ASSET_BUDGET_BYTES = 500000;
export function validateAtlas(m, maxTextureSize) {
  if (m.encoding !== 'display-opaque-planes-v1' || m.frameWidth !== 128 || m.frameHeight !== 256 ||
      m.frames !== 105 || m.fps !== 30 || m.columns !== 16 ||
      m.atlasWidth !== 2048 || m.atlasHeight !== 1792 ||
      m.imageWidth !== 2048 || m.imageHeight !== 3584) throw Error('圖集格式與此版本不相容。');
  if (maxTextureSize < Math.max(m.atlasWidth, m.atlasHeight)) throw Error('此裝置不支援 2048px 圖集。');
  validateDownload(m, m.downloadBytes);
}
export async function decodeAtlas(blob, m) {
  const bitmap=await createImageBitmap(blob,{premultiplyAlpha:'none',colorSpaceConversion:'none'});
  const canvas=document.createElement('canvas');
  try {
    if(bitmap.width!==m.imageWidth||bitmap.height!==m.imageHeight) throw Error('圖集尺寸與描述不符。');
    // Opaque color/alpha planes avoid WebKit's lossy premultiply/unpremultiply round trip.
    // Reconstruct once at load time, then upload one ordinary RGBA8 texture.
    const w=m.atlasWidth,h=m.atlasHeight;canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    if(!ctx) throw Error('無法解碼烘焙素材。');
    ctx.globalCompositeOperation='copy';ctx.imageSmoothingEnabled=false;
    ctx.drawImage(bitmap,0,0,w,h,0,0,w,h);
    const pixels=ctx.getImageData(0,0,w,h).data;
    ctx.drawImage(bitmap,0,h,w,h,0,0,w,h);
    const opacity=ctx.getImageData(0,0,w,h).data;
    for(let i=0;i<pixels.length;i+=4)pixels[i+3]=opacity[i];
    return pixels;
  } finally {bitmap.close();canvas.width=canvas.height=0;}
}
export function validateDownload(m, bytes) {
  if (!Number.isInteger(bytes) || bytes <= 0 || bytes !== m.downloadBytes) throw Error('素材大小與描述不符，請重新整理。');
  if (bytes > ASSET_BUDGET_BYTES) throw Error('烘焙素材超過 500 KB 預算。');
}
