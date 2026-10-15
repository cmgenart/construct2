# Parameters

Parameters are **live**. Move a slider, the art hears it. No rebuild, no lecture.

They are not Values (those get baked in). They are not Properties (those choose which code even exists). If you can twist it while the picture is running, it is a parameter.

## Modes

The dropdown next to the header:

| Mode | |
|------|--|
| **Off** | Hide the toys. Schema still exists. |
| **PARAM** | Sliders, colours, choices from `//PARAM-*` lines in your source. |
| **Driver** | A custom HTML page from `parameters/<name>.html` — voice, gamepads, something unwise. |

## If you write code

One marker per line, usually in `defs.js`:

```js
//PARAM-FLOAT:["speed", 0, 2, 0.05]
//PARAM-RGB:["ink"]
```

A description after the marker becomes a tooltip. Types include BUTTON, STRING, NUMBER, BOOLEAN, FLOAT, INT, CHOICE, DROPDOWN, RGB, HSV, HSL, HEX.

In the art:

```js
OnParam((key, value) => {
  if (key === "speed") speed = value;
});
```

The runtime merges posted maps and applies that snapshot when `OnParam` is assigned, including if the art starts again. Assigning `OnParam` asks the host for every stored parameter. A value still sitting on its code default is filled from `ParamDefaults` if the art sends one. Sending out: `SendParams({ key: value })`.

A long string shows the start of the value, `...`, and the end, fitted to the row. Click it to edit in a text window over the UI. Drag the title to move the window. Pin it from the top right to keep it open, and copy the text from the button beside the pin. The window stays tied to that parameter: edits commit as you type, and a new value from the art fills it when the text field is not focused. Click anywhere else to close it, unless it is pinned.

Drivers speak through a small messenger. There is a `parameters/DRIVERS_README.txt` if you are building one. Most people never should.
