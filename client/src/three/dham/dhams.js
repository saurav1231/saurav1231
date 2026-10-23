// The dhams shown in the 3D hero. `slug` must match a Destination slug in the database,
// so clicking a temple can open that destination's journeys.
// `style` picks the temple builder in Temple.jsx; colours are per temple.
export const DHAMS = [
  {
    slug: 'kedarnath',
    name: 'Kedarnath',
    region: 'Uttarakhand · 3,583 m',
    line: 'Grey stone Jyotirlinga beneath the Garhwal snows.',
    style: 'nagara',
    colors: { stone: '#8d8a97', spire: '#7d7a88', trim: '#5f5c6b' },
  },
  {
    slug: 'varanasi',
    name: 'Kashi Vishwanath',
    region: 'Varanasi · on the Ganga',
    line: 'The golden spire of the eternal city.',
    style: 'nagara',
    colors: { stone: '#e9dcc0', spire: '#d6a43c', trim: '#b9852a', metal: true },
  },
  {
    slug: 'puri',
    name: 'Jagannath Puri',
    region: 'Odisha · Char Dham',
    line: 'White tower crowned by the blue Nila Chakra.',
    style: 'nagara',
    colors: { stone: '#f1ede4', spire: '#f4f1ea', trim: '#c9c2b4' },
    tall: true,
    chakra: true,
  },
  {
    slug: 'amritsar',
    name: 'Golden Temple',
    region: 'Amritsar · Harmandir Sahib',
    line: 'A golden sanctum resting on the pool of nectar.',
    style: 'golden',
    colors: { stone: '#f4f0e8', spire: '#e3b04b', trim: '#c08a2a', metal: true },
  },
  {
    slug: 'rameswaram',
    name: 'Rameswaram',
    region: 'Tamil Nadu · Char Dham',
    line: 'A painted gopuram rising tier upon tier.',
    style: 'gopuram',
    colors: { stone: '#d9c7a8', spire: '#c9693b', trim: '#e4a54c' },
  },
];
