const AsciiLum = (img, cols, x, y) => {
  const i = (y * cols + x) * 4;
  return (img[i] + img[i + 1] + img[i + 2]) / (3 * 255);
};

const AsciiEdgeChar = (gx, gy, mag) => {
  if (mag < 0.06) return " ";
  //#<<Ascii>directional:off>
  if (abs(gx) > abs(gy) * 1.5) return "-";
  if (abs(gy) > abs(gx) * 1.5) return "|";
  return gx * gy >= 0 ? "\\" : "/";
  //# 
  //#<<Ascii>directional:on>
  const a = atan2(gy, gx);
  if (abs(gx) <= abs(gy) * 0.45) return "|";
  if (abs(gy) <= abs(gx) * 0.45) return "-";
  if (a > 0.65 && a < 2.45) return "/";
  if (a < -0.65 || a > 2.75) return "\\";
  return "+";
  //# 
};

const AsciiConvert = (ac, cols, rows, img) => {
  ac._buf.length = rows;
  For(0, rows, (y) => {
    ac._buf[y] = ac._buf[y] || [];
    For(0, cols, (x) => {
      const xm = max(0, x - 1);
      const xp = min(cols - 1, x + 1);
      const ym = max(0, y - 1);
      const yp = min(rows - 1, y + 1);
      const lum = (x, y) => ac._mapLum(AsciiLum(img, cols, x, y));
      const gx = lum(xp, y) - lum(xm, y);
      const gy = lum(x, yp) - lum(x, ym);
      let mag = sqrt(gx * gx + gy * gy);
      ac.contrast > 0 && (mag = Clamp(mag * (1 + ac.contrast * 2), 0, 1));
      let ch = AsciiEdgeChar(gx, gy, mag);
      ac.jitter > 0 &&
        mag > 0.04 &&
        RN.r() < ac.jitter * 0.5 &&
        (ch = "+");
      ac._buf[y][x] = ch;
    });
  });
};
