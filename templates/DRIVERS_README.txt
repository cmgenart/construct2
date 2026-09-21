Parameter drivers — quick reference
===================================

Open drivers from Construct² dev-ui (Parameters section mode dropdown).
Do not open driver .html files directly in a browser — ParamMessenger is injected at runtime.

Injection guard (required)
--------------------------
  if (typeof ParamMessenger !== 'function') {
    document.body.textContent = 'Open from Construct² dev-ui (ParamMessenger not injected).';
    throw new Error('ParamMessenger missing');
  }

ParamMessenger API
------------------
  const m = new ParamMessenger({
    onMessage(params) {
      // Minimal changed keys only: { speak: 0.5, vol: 1 }
    },
  });

  m.send({ speak: 0.5 });       // bare map; safe up to ~60 fps
  m.sendButton('recalibrate');  // PARAM-BUTTON trigger
  m.getValues();                // full current map
  m.getSchema();                // [{ name, type, low, high, default, value, description, ... }]

Wire format (art / host)
------------------------
Same as PARAM-SPEC: bare { paramName: value } objects.
PARAM-BOOLEAN uses 0 or 1 (not true/false).

Driver-only persistence
-----------------------
Use localStorage / sessionStorage inside the driver iframe for secrets and UI prefs.
The editor does not save driver UI state in dev.json.

Project JSON store (repo files next to the driver)
------------------------------------------------
  await m.readDriverStore('myDriver.memory.json');
  await m.writeDriverStore('myDriver.memory.json', { version: 1, foo: 'bar' });

Filenames must match the mounted driver id, e.g. myDriver.memory.json (index) or
myDriver.<slug>.memory.json (per-persona payload). See PARAMETER-DRIVERS-DESIGN.md §5.6.

Files
-----
  <project>/parameters/<name>.html   — one driver per file
  <project>/parameters/DRIVERS_README.txt — this file (auto-seeded once)

Full design: construct2/docs/PARAMETER-DRIVERS-DESIGN.md
