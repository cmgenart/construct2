const AsciiLum = (img, cols, x, y) => {
  const i = (y * cols + x) * 4;
  return (img[i] + img[i + 1] + img[i + 2]) / (3 * 255);
};

const AsciiConvert = (ac, cols, rows, img) => {
  const ramp = " .:-=+*#%@";
  ac._buf.length = rows;
  For(0, rows, (y) => {
    ac._buf[y] = ac._buf[y] || [];
    For(0, cols, (x) => {
      let b = ac._mapLum(AsciiLum(img, cols, x, y));
      let ri = ac._isDark(b)
        ? 0
        : min(ramp.length - 1, floor(b * (ramp.length - 1)));
      ac.jitter > 0 &&
        (ri = Clamp(
          floor(ri + (RN.r() - 0.5) * ac.jitter * ramp.length),
          0,
          ramp.length - 1,
        ));
      ac._buf[y][x] = ramp[ri];
    });
  });
};
