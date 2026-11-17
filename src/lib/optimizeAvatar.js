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

  const allowed = ["image/jpeg", "image/png", "image/webp", "image/avif"];
  if (file.type === "image/gif") {
    // Garder l'animation sans transférer d'énormes GIF non compressés.
    if (file.size > 1024 * 1024) {
      throw new Error("GIF trop lourd (maximum 1 Mo). Utilise une image JPG, PNG ou WebP.");
    }
    return { file, extension: "gif" };
  }
  if (!allowed.includes(file.type)) {
    throw new Error("Format non pris en charge. Utilise JPG, PNG, WebP ou AVIF.");
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

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error("Conversion d'image impossible.")),
        "image/webp",
        quality
      );
    });
    if (blob.type !== "image/webp") throw new Error("Le navigateur ne prend pas en charge la conversion WebP.");

    // Ne jamais augmenter inutilement le poids d'une petite image déjà adaptée.
    if (file.size <= blob.size && ratio === 1) {
      const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" }[file.type];
      return { file, extension };
    }
    return { file: new File([blob], "avatar.webp", { type: "image/webp" }), extension: "webp" };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
