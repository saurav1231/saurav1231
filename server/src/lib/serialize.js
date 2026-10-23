// Helpers that shape DB rows for API responses.

export function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  return rest;
}

export function unitPrice(pkg, departure) {
  return departure?.priceOverride ?? pkg.pricePerPerson;
}

export function departureView(d, pkg) {
  return {
    id: d.id,
    startDate: d.startDate,
    seatsLeft: Math.max(0, d.seatsTotal - d.seatsBooked),
    seatsTotal: d.seatsTotal,
    price: unitPrice(pkg, d),
  };
}
