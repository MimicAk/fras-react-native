export function isPointInPolygon(point, polygon, extraLeverage = 2.5, minBuffer = 20) {
  console.log("isPointInPolygon",point, polygon, extraLeverage, minBuffer)
  const x = parseFloat(point.latitude);
  const y = parseFloat(point.longitude);
  let inside = false;

  // 1️⃣ Standard ray-casting
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = parseFloat(polygon[i].latitude);
    const yi = parseFloat(polygon[i].longitude);
    const xj = parseFloat(polygon[j].latitude);
    const yj = parseFloat(polygon[j].longitude);

    const intersect =
      (yi > y) !== (yj > y) &&
      x < ((xj - xi) * (y - yi)) / ((yj - yi) + Number.EPSILON) + xi;

    if (intersect) inside = !inside;
  }

  // ✅ If inside polygon
  if (inside) return true;

  // 2️⃣ Dynamic tolerance
  const gpsAccuracy = point.accuracy || 0;
  const toleranceMeters = minBuffer;
  console.log("isPointInPolygon",toleranceMeters);
  // 3️⃣ Edge distance check
  return polygon.some((vertex, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return distanceToSegmentMeters(point, vertex, next) <= toleranceMeters;
  });
}

// 🔹 Distance from point to polygon edge in meters
function distanceToSegmentMeters(p, v, w) {
  const lat1 = parseFloat(v.latitude);
  const lon1 = parseFloat(v.longitude);
  const lat2 = parseFloat(w.latitude);
  const lon2 = parseFloat(w.longitude);
  const latP = parseFloat(p.latitude);
  const lonP = parseFloat(p.longitude);

  const earthRadius = 6371000; // meters
  function toRad(deg) { return (deg * Math.PI) / 180; }

  const φ1 = toRad(lat1), φ2 = toRad(lat2), φP = toRad(latP);
  const λ1 = toRad(lon1), λ2 = toRad(lon2), λP = toRad(lonP);

  const dLat = φ2 - φ1;
  const dLon = λ2 - λ1;

  const t =
    ((φP - φ1) * dLat + (λP - λ1) * dLon) /
    (dLat * dLat + dLon * dLon || 1);

  const tClamped = Math.max(0, Math.min(1, t));

  const closestLat = φ1 + tClamped * dLat;
  const closestLon = λ1 + tClamped * dLon;

  const dLatP = φP - closestLat;
  const dLonP = λP - closestLon;
  const a =
    Math.sin(dLatP / 2) ** 2 +
    Math.cos(φP) *
      Math.cos(closestLat) *
      Math.sin(dLonP / 2) ** 2;

  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
