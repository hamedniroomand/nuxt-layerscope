import sharp from 'sharp';

/** The script fails above this size, after compression. */
export const MAX_PNG_BYTES = 300 * 1024;

/** True when every pixel has the same color: the page did not render. */
export async function isBlank(image: Buffer): Promise<boolean> {
  const { channels } = await sharp(image).stats();
  return channels.every(channel => channel.min === channel.max);
}

/** Lossless PNG, without metadata. */
export async function compressPng(image: Buffer): Promise<Buffer> {
  const png = await sharp(image)
    .png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 })
    .toBuffer();
  return png;
}

export async function toWebp(image: Buffer, width: number): Promise<Buffer> {
  const webp = await sharp(image).resize({ width }).webp({ quality: 88, effort: 6 }).toBuffer();
  return webp;
}
