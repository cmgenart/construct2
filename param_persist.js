/**
 * Which param keys are kept out of dev.json (ephemeral / session-only).
 */

function ephemeralParamKeys(schema) {
  const names = [];
  for (const p of schema || []) {
    if (p.type === "PARAM-BUTTON") names.push(p.name);
  }
  return names;
}

function stripEphemeralParamValues(paramValues, schema) {
  const out =
    paramValues && typeof paramValues === "object" && !Array.isArray(paramValues)
      ? { ...paramValues }
      : {};
  for (const k of ephemeralParamKeys(schema)) {
    delete out[k];
  }
  return out;
}

/** Remove keys for deprecated markers still present in source (see param_scan errors). */
function deprecatedParamKeys(scanErrors) {
  const names = [];
  for (const er of scanErrors || []) {
    if (er && typeof er.deprecatedName === "string" && er.deprecatedName) {
      names.push(er.deprecatedName);
    }
  }
  return names;
}

function stripDeprecatedParamValues(paramValues, scanErrors) {
  const out =
    paramValues && typeof paramValues === "object" && !Array.isArray(paramValues)
      ? { ...paramValues }
      : {};
  for (const k of deprecatedParamKeys(scanErrors)) {
    delete out[k];
  }
  return out;
}

function stripPersistedParamValues(paramValues, schema, scanErrors) {
  return stripDeprecatedParamValues(
    stripEphemeralParamValues(paramValues, schema),
    scanErrors,
  );
}

module.exports = {
  ephemeralParamKeys,
  stripEphemeralParamValues,
  deprecatedParamKeys,
  stripDeprecatedParamValues,
  stripPersistedParamValues,
};
