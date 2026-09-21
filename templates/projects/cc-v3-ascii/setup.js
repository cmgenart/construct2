Canvas(1000, 1000, 0);
CanvasWall("black");

//import<AsciiCore.js>

const src = Layer(0.12);
const ac = AsciiCore(src);
ac.cutoff = 0.08;

OnParam((k, v) => {
  if (k === "cutoff") ac.cutoff = v;
});
