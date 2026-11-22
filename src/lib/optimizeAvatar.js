/**
 * Prépare une image pour le bucket public "avatars" sans dépendance externe.
 * Utilisé uniquement côté navigateur. Les URL existantes sont conservées.
 * Les GIF animés ne sont pas convertis (on évite d'en perdre l'animation).
 */
export async function optimizeAvatar(file, { maxDimension = 512, quality = 0.82 } = {}) {
  if (!(file instanceof File)) throw new Error("Sélectionne une image valide.");
  if (file.size > 20 * 1024 * 1024) {
    throw new Error("Image trop lourde (maximum 20 Mo avant optimisation).");
  }

  const extensions = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
  };
  if (file.type === "image/gif") {
    // Garder l'animation sans transférer d'énormes GIF non compressés.
    if (file.size > 1024 * 1024) {
      throw new Error("GIF trop lourd (maximum 1 Mo). Utilise une image JPG, PNG ou WebP.");
    }
    return { file, extension: "gif" };
  }
  if (!Object.hasOwn(extensions, file.type)) {
    throw new Error("Format non pris en charge. Utilise JPG, PNG, GIF, WebP ou AVIF.");
  }

  const objectUrl = URL.createObjectURL(file);
  let image;
  try {
    image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Impossible de lire l'image sélectionnée."));
      img.src = objectUrl;
    });

    const maxSide = Math.max(image.naturalWidth, image.naturalHeight);
    if (!maxSide) throw new Error("Dimensions de l'image invalides.");
    const ratio = Math.min(1, maxDimension / maxSide);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Optimisation d'image indisponible sur cet appareil.");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    const encode = (type) => new Promise(resolve => canvas.toBlob(resolve, type, quality));
    let blob = await encode("image/webp");

    // Certains navigateurs renvoient du PNG lorsqu'ils ne savent pas encoder le WebP.
    if (blob?.type !== "image/webp" && file.type === "image/jpeg") {
      blob = (await encode("image/jpeg")) || blob;
    }
    if (!blob) blob = await encode("image/png");

    const extension = blob && Object.hasOwn(extensions, blob.type) ? extensions[blob.type] : null;
    if (!extension || (ratio === 1 && file.size <= blob.size)) {
      return { file, extension: extensions[file.type] };
    }
    return { file: new File([blob], `avatar.${extension}`, { type: blob.type }), extension };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
