/**
 * Draw one subdivided Inkoder stroke. `s` is the width channel (0–61).
 * Half-width is s/3, the same ratio as the original strip.
 * Call after SubDivRelax so width has been interpolated along the curve.
 */
function drawInkStrip(line, col) {
  if (!line || line.length < 2) return;
  const rev = [];
  const norm = V2();
  CBP();
  FoE(line, (p1, n) => {
    const p0 = line[Math.max(0, n - 1)];
    const p2 = line[Math.min(line.length - 1, n + 1)];
    const size = Math.abs(p1.s == null ? 10 : p1.s) / 3;
    norm.set(p0.x - p2.x, p0.y - p2.y);
    const len = norm.len();
    if (len < 1e-6) norm.set(0, -1);
    else norm.div(len);
    const px = -norm.y * size;
    const py = norm.x * size;
    if (n) CLT(p1.x + px, p1.y + py);
    else CMT(p1.x + px, p1.y + py);
    rev.unshift(V2(p1.x - px, p1.y - py));
  });
  FoE(rev, (p) => CLT(p.x, p.y));
  CCP();
  CFS(col || "black");
  CFL();
}
