const AsciiLum = (img, cols, x, y) => {
  const i = (y * cols + x) * 4;
  return (img[i] + img[i + 1] + img[i + 2]) / (3 * 255);
};

const BIAS64 =
  ".:-=+*#%@|/\\(){}<>0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi";

const AsciiConvert = (ac, cols, rows, img) => {
  ac._buf.length = rows;
  For(0, rows, (y) => {
    ac._buf[y] = ac._buf[y] || [];
    For(0, cols, (x) => {
      const xm = max(0, x - 1);
      const xp = min(cols - 1, x + 1);
      const ym = max(0, y - 1);
      const yp = min(rows - 1, y + 1);
      let b = ac._mapLum(AsciiLum(img, cols, x, y));
      if (ac._isDark(b)) ac._buf[y][x] = " ";
      else {
        const lum = (x, y) => ac._mapLum(AsciiLum(img, cols, x, y));
        const gx = lum(xp, y) - lum(xm, y);
        const gy = lum(x, yp) - lum(x, ym);
        const mag = sqrt(gx * gx + gy * gy);
        const bi = min(7, floor(b * 8));
        const ai =
          mag < 0.04
            ? 0
            : min(7, floor(((atan2(gy, gx) + PI) / TAU) * 8));
        let ri = bi * 8 + ai;
        ac.jitter > 0 &&
          (ri = Clamp(
            ri + floor((RN.r() - 0.5) * ac.jitter * 8),
            0,
            63,
          ));
        ac._buf[y][x] = BIAS64[ri];
      }
    });
  });
};
