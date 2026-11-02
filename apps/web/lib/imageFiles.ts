/** For file pickers. The extensions matter: many browsers don't recognise HEIC by its type. */
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

/** Chrome on Windows reports HEIC files with an empty type, so go by the name as well. */
export function isImageFile(file: File) {
  return file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name);
}
