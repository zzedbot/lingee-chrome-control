const WIDTH_MIN = 320;
const WIDTH_MAX = 3840;
const HEIGHT_MIN = 240;
const HEIGHT_MAX = 2160;
const SCALE_MIN = 0.5;
const SCALE_MAX = 4;

export function normalizeViewportOptions(value = {}) {
  const width = boundedInteger(value.width, "width", WIDTH_MIN, WIDTH_MAX);
  const height = boundedInteger(value.height, "height", HEIGHT_MIN, HEIGHT_MAX);
  const deviceScaleFactor = value.deviceScaleFactor == null ? 1 : Number(value.deviceScaleFactor);
  if (!Number.isFinite(deviceScaleFactor) || deviceScaleFactor < SCALE_MIN || deviceScaleFactor > SCALE_MAX) {
    throw coded("VIEWPORT_SCALE_INVALID", `deviceScaleFactor must be between ${SCALE_MIN} and ${SCALE_MAX}`);
  }
  if (value.mobile != null && typeof value.mobile !== "boolean") throw coded("VIEWPORT_MOBILE_INVALID", "mobile must be a boolean");
  return { width, height, deviceScaleFactor, mobile: value.mobile === true };
}

export function viewportResult(metrics, override = null) {
  const viewport = metrics?.cssVisualViewport || metrics?.visualViewport || metrics?.cssLayoutViewport || metrics?.layoutViewport || {};
  const width = finiteDimension(viewport.clientWidth, override?.width);
  const height = finiteDimension(viewport.clientHeight, override?.height);
  return {
    width,
    height,
    pageX: finiteNumber(viewport.pageX, 0),
    pageY: finiteNumber(viewport.pageY, 0),
    scale: finiteNumber(viewport.scale, 1),
    deviceScaleFactor: override?.deviceScaleFactor ?? null,
    mobile: override?.mobile === true,
    emulated: override != null
  };
}

function boundedInteger(value, name, minimum, maximum) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw coded("VIEWPORT_DIMENSION_INVALID", `${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return number;
}

function finiteDimension(value, fallback) {
  const number = Number(value);
  if (Number.isFinite(number) && number > 0) return Math.round(number);
  return Number.isFinite(Number(fallback)) ? Math.round(Number(fallback)) : null;
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function coded(code, message) { return Object.assign(new Error(message), { code }); }
