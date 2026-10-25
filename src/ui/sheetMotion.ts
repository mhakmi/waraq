export type SheetPlace = { name: 'expanded' | 'peek' | 'closed'; belowExpanded: number };

const flingSpeed = 1000;
const projectionSeconds = 0.1;

export function peekPosition(sheetHeight: number, peekHeight: number): number {
  'worklet';
  return Math.max(sheetHeight - peekHeight, 0);
}

export function restingPlace(belowExpanded: number, velocityY: number, sheetHeight: number, peekHeight: number): SheetPlace {
  'worklet';
  const peek = peekPosition(sheetHeight, peekHeight);
  if (belowExpanded === 0) {
    return { name: 'expanded', belowExpanded: 0 };
  }
  if (velocityY > flingSpeed) {
    return { name: 'closed', belowExpanded: sheetHeight };
  }
  if (velocityY < -flingSpeed) {
    return { name: 'expanded', belowExpanded: 0 };
  }
  const places: SheetPlace[] = [
    { name: 'expanded', belowExpanded: 0 },
    { name: 'closed', belowExpanded: sheetHeight },
  ];
  if (peek > 0) {
    places.push({ name: 'peek', belowExpanded: peek });
  }
  const projected = belowExpanded + velocityY * projectionSeconds;
  let nearest = places[0];
  for (const place of places) {
    if (Math.abs(place.belowExpanded - projected) < Math.abs(nearest.belowExpanded - projected)) {
      nearest = place;
    }
  }
  return nearest;
}

export function openingPlace(screenReader: boolean, sheetHeight: number, peekHeight: number): SheetPlace {
  'worklet';
  const peek = peekPosition(sheetHeight, peekHeight);
  if (screenReader || peek === 0) {
    return { name: 'expanded', belowExpanded: 0 };
  }
  return { name: 'peek', belowExpanded: peek };
}
