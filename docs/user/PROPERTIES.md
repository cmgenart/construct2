# Properties

Properties are **forks in the code**. At build time exactly one choice per name survives. The others are deleted. Random is not a filter — it is a walk through the unlocked doors.

Lock a property if you like this hallway.

## In the panel

- Groups (Palette, Debug, …) keep related forks together.
- **Lock** pins a choice at the current level.
- **Random** on a group reshuffles only that group’s unlocked properties. The toolbar **Random** does everyone who is not locked.
- **Debug** stays put on purpose so you do not randomly turn the certificate off in the middle of a thought.

Levels (viewer / collection / piece / …) work like [Values](./VALUES.md): more specific wins when you ask it to.

## If you write code

Preferred:

```js
//#<<Palette>accent:warm>
  CFS(cHSVA(30, 70, 90, 1));
//#

//#<<Palette>accent:cold>
  CFS(cHSVA(210, 70, 90, 1));
//#
```

Older: `//#<Mode:Calm>`. Still parsed; it lands in a base group.

Weight a branch: `{"prob":8}` on the opener line (default weight is 1).

Block form: `/*#<<Group>name:choice>` … `*/`.

The core itself uses Debug properties for **cert** and **canvas input**. Leave those alone until you know you want the flip side gone.
