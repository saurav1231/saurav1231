// Seeds destinations, packages, itineraries, departures and an admin user.
// Run: npm run db:seed   (safe to run again: it upserts by slug/email)
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const rupees = (n) => n * 100;

const destinations = [
  { slug: 'varanasi', name: 'Varanasi', state: 'Uttar Pradesh', latitude: 25.3176, longitude: 82.9739, description: 'The eternal city on the Ganga, home of the Kashi Vishwanath temple and the evening Ganga Aarti.' },
  { slug: 'rishikesh', name: 'Rishikesh', state: 'Uttarakhand', latitude: 30.0869, longitude: 78.2676, description: 'Yoga capital of the world, where the Ganga leaves the Himalaya.' },
  { slug: 'kedarnath', name: 'Kedarnath', state: 'Uttarakhand', latitude: 30.7346, longitude: 79.0669, description: 'One of the twelve Jyotirlingas, set at 3,583 m in the Garhwal Himalaya.' },
  { slug: 'badrinath', name: 'Badrinath', state: 'Uttarakhand', latitude: 30.7433, longitude: 79.4938, description: 'Abode of Lord Vishnu on the banks of the Alaknanda.' },
  { slug: 'bodh-gaya', name: 'Bodh Gaya', state: 'Bihar', latitude: 24.6951, longitude: 84.9913, description: 'Where the Buddha attained enlightenment under the Bodhi tree.' },
  { slug: 'amritsar', name: 'Amritsar', state: 'Punjab', latitude: 31.62, longitude: 74.8765, description: 'Harmandir Sahib, the Golden Temple, and its langar that feeds thousands every day.' },
  { slug: 'tirupati', name: 'Tirupati', state: 'Andhra Pradesh', latitude: 13.6288, longitude: 79.4192, description: 'Sri Venkateswara temple on the seven hills of Tirumala.' },
  { slug: 'puri', name: 'Puri', state: 'Odisha', latitude: 19.8135, longitude: 85.8312, description: 'Jagannath Dham on the Bay of Bengal, one of the four Char Dhams.' },
  { slug: 'dharamshala', name: 'Dharamshala', state: 'Himachal Pradesh', latitude: 32.2426, longitude: 76.3213, description: 'McLeod Ganj, seat of the Dalai Lama and Tibetan Buddhist culture.' },
  { slug: 'rameswaram', name: 'Rameswaram', state: 'Tamil Nadu', latitude: 9.2876, longitude: 79.3129, description: 'Ramanathaswamy temple with its legendary pillared corridors.' },
  { slug: 'ujjain', name: 'Ujjain', state: 'Madhya Pradesh', latitude: 23.1765, longitude: 75.7885, description: 'Mahakaleshwar Jyotirlinga and the dawn Bhasma Aarti.' },
  { slug: 'kailash', name: 'Mount Kailash', state: 'Tibet', country: 'China', latitude: 31.0675, longitude: 81.3119, description: 'The sacred mountain revered by four faiths, with holy Lake Mansarovar.' },
];

const packages = [
  {
    slug: 'kashi-ganga-aarti-retreat', title: 'Kashi Awakening: Ganga Aarti Retreat', destination: 'varanasi',
    category: 'Pilgrimage', durationDays: 4, price: 18999, featured: true,
    summary: 'Sunrise boat rides, Kashi Vishwanath darshan and front-row seats at the Dashashwamedh Ganga Aarti.',
    description: 'Experience the oldest living city with a local priest-guide. Walk the ghats at dawn, take part in a Rudrabhishek, explore Sarnath and end each day with the fire ritual on the Ganga.',
    highlights: ['VIP Kashi Vishwanath darshan', 'Private sunrise boat on the Ganga', 'Rudrabhishek puja', 'Sarnath half-day tour'],
    inclusions: ['3 nights riverside heritage hotel', 'Daily sattvic breakfast and dinner', 'All transfers in AC car', 'Priest-guide throughout'],
    exclusions: ['Flights / trains to Varanasi', 'Personal donations at temples'],
    itinerary: [
      ['Arrival and evening Aarti', 'Pick-up from airport/station, check in and witness the Ganga Aarti from a reserved boat.'],
      ['Sunrise boat and darshan', 'Dawn boat ride past 84 ghats, Kashi Vishwanath darshan, old-city walk.'],
      ['Sarnath and Rudrabhishek', 'Visit Sarnath where the Buddha gave his first sermon; evening Rudrabhishek puja.'],
      ['Departure', 'Morning meditation on the ghats and drop-off.'],
    ],
  },
  {
    slug: 'rishikesh-yoga-immersion', title: 'Rishikesh Yoga & Meditation Immersion', destination: 'rishikesh',
    category: 'Yoga Retreat', durationDays: 7, price: 32999, featured: true,
    summary: 'A week of Hatha yoga, pranayama and guided meditation in an ashram by the Ganga.',
    description: 'Reset body and mind with twice-daily yoga, Vedic philosophy talks, sound healing, a forest trek to Kunjapuri for sunrise and evening Aarti at Parmarth Niketan.',
    highlights: ['Twice-daily yoga with certified teachers', 'Kunjapuri sunrise trek', 'Sound-bath and kirtan night', 'Parmarth Niketan Ganga Aarti'],
    inclusions: ['6 nights ashram stay', 'All sattvic meals', 'Yoga mat and kit', 'Dehradun airport transfers'],
    exclusions: ['Flights', 'Ayurvedic massages (available at extra cost)'],
    itinerary: [
      ['Arrive and settle', 'Welcome circle, gentle evening yoga and Aarti.'],
      ['Foundations', 'Hatha basics, pranayama, Vedic philosophy session.'],
      ['Kunjapuri sunrise', 'Pre-dawn drive and short trek to the Kunjapuri temple for sunrise over the Himalaya.'],
      ['Silence day', 'A day of mauna (silence) with walking meditation.'],
      ['Sound and breath', 'Sound healing, kirtan night.'],
      ['Waterfalls and caves', 'Hike to Neer Garh waterfall and Vashishta Gufa meditation cave.'],
      ['Closing ceremony', 'Fire ceremony, certificates and departure.'],
    ],
  },
  {
    slug: 'kedarnath-badrinath-do-dham', title: 'Do Dham Yatra: Kedarnath & Badrinath', destination: 'kedarnath',
    category: 'Char Dham', durationDays: 6, price: 27499, featured: true,
    summary: 'Himalayan pilgrimage to two of the holiest shrines, with helicopter option for Kedarnath.',
    description: 'A carefully paced yatra from Haridwar through Guptkashi to Kedarnath and on to Badrinath and Mana, India\'s last village. Includes registration, ponies on request and oxygen support.',
    highlights: ['Kedarnath Jyotirlinga darshan', 'Badrinath temple and Tapt Kund', 'Mana village and Vyas Gufa', 'Ganga Aarti at Har Ki Pauri'],
    inclusions: ['5 nights hotels and camps', 'Breakfast and dinner', 'Tempo traveller with driver', 'Yatra registration and medical kit'],
    exclusions: ['Helicopter tickets', 'Ponies / palki', 'Lunch'],
    itinerary: [
      ['Haridwar to Guptkashi', 'Drive along the Alaknanda and Mandakini rivers.'],
      ['Trek to Kedarnath', 'Trek 16 km from Gaurikund, evening darshan.'],
      ['Kedarnath to Guptkashi', 'Morning puja and trek down.'],
      ['To Badrinath', 'Drive via Chopta and Joshimath.'],
      ['Badrinath and Mana', 'Temple darshan, Tapt Kund, Mana village.'],
      ['Return to Haridwar', 'Drive back with stop at Devprayag confluence.'],
    ],
  },
  {
    slug: 'buddha-trail-bodh-gaya', title: 'Footsteps of the Buddha', destination: 'bodh-gaya',
    category: 'Meditation', durationDays: 5, price: 22999,
    summary: 'Vipassana sessions under the Bodhi tree, Rajgir, Nalanda ruins and the Vulture Peak.',
    description: 'Guided by a Buddhist scholar, sit in meditation at the Mahabodhi temple, explore the ancient university of Nalanda and climb Vulture Peak where the Buddha taught the Heart Sutra.',
    highlights: ['Morning meditation at Mahabodhi', 'Nalanda university ruins', 'Vulture Peak at sunset', 'Monastery stays'],
    inclusions: ['4 nights monastery guest house', 'All vegetarian meals', 'Scholar guide', 'Gaya transfers'],
    exclusions: ['Flights', 'Camera fees at monuments'],
    itinerary: [
      ['Arrive Bodh Gaya', 'Evening at the Mahabodhi temple.'],
      ['Meditation day', 'Two guided Vipassana sittings, monastery visits.'],
      ['Rajgir', 'Vulture Peak, hot springs and Vishwa Shanti Stupa.'],
      ['Nalanda', 'Ruins and museum of the ancient university.'],
      ['Departure', 'Final sitting under the Bodhi tree.'],
    ],
  },
  {
    slug: 'golden-temple-seva', title: 'Golden Temple Seva Journey', destination: 'amritsar',
    category: 'Pilgrimage', durationDays: 3, price: 11999,
    summary: 'Do seva in the world\'s largest community kitchen and witness the Palki Sahib ceremony.',
    description: 'Stay near Harmandir Sahib, volunteer in the langar, attend the night Palki Sahib ceremony and visit Jallianwala Bagh and the Wagah border.',
    highlights: ['Langar seva', 'Palki Sahib ceremony', 'Wagah border ceremony', 'Old city food walk'],
    inclusions: ['2 nights hotel near the temple', 'Breakfast', 'Local transport', 'Guide'],
    exclusions: ['Flights / trains', 'Lunch and dinner'],
    itinerary: [
      ['Arrival', 'Evening visit to Harmandir Sahib.'],
      ['Seva and Wagah', 'Morning langar seva, afternoon Wagah ceremony, night Palki Sahib.'],
      ['Departure', 'Amrit Vela prayers at dawn and drop-off.'],
    ],
  },
  {
    slug: 'tirupati-balaji-darshan', title: 'Tirumala Balaji Special Darshan', destination: 'tirupati',
    category: 'Pilgrimage', durationDays: 2, price: 8999,
    summary: 'Hassle-free special-entry darshan of Sri Venkateswara with Padmavathi temple visit.',
    description: 'We handle tickets, accommodation and transfers so you can focus on darshan. Includes Tiruchanur Padmavathi temple and Kapila Theertham.',
    highlights: ['Special entry darshan ticket', 'Padmavathi temple', 'Kapila Theertham waterfall'],
    inclusions: ['1 night hotel in Tirupati', 'Breakfast', 'AC car', 'Darshan tickets'],
    exclusions: ['Flights / trains', 'Tonsure and other sevas'],
    itinerary: [
      ['Tirupati and Tiruchanur', 'Arrive, Padmavathi temple, Kapila Theertham.'],
      ['Tirumala darshan', 'Early drive up the ghat road, darshan and return.'],
    ],
  },
  {
    slug: 'jagannath-puri-konark', title: 'Jagannath Puri & Konark Sun Temple', destination: 'puri',
    category: 'Char Dham', durationDays: 4, price: 15999,
    summary: 'Darshan at Jagannath Dham, Konark at sunrise and Chilika lake dolphins.',
    description: 'One of the four Char Dhams on the seashore. Taste the Mahaprasad, visit Konark at sunrise and the Lingaraj temple in Bhubaneswar.',
    highlights: ['Jagannath darshan and Mahaprasad', 'Konark Sun Temple', 'Chilika lake boat ride', 'Lingaraj temple'],
    inclusions: ['3 nights sea-view hotel', 'Breakfast', 'All transfers', 'Guide'],
    exclusions: ['Flights', 'Lunch and dinner'],
    itinerary: [
      ['Bhubaneswar to Puri', 'Lingaraj temple en route, evening on the beach.'],
      ['Jagannath Dham', 'Darshan and Mahaprasad.'],
      ['Konark and Chilika', 'Sunrise at Konark, boat ride on Chilika.'],
      ['Departure', 'Drop at Bhubaneswar.'],
    ],
  },
  {
    slug: 'mcleodganj-tibetan-mindfulness', title: 'Little Lhasa Mindfulness Retreat', destination: 'dharamshala',
    category: 'Meditation', durationDays: 5, price: 19999,
    summary: 'Tibetan Buddhist teachings, Triund trek and singing-bowl sessions in McLeod Ganj.',
    description: 'Learn mindfulness from Tibetan teachers at Tushita, visit the Dalai Lama temple, trek to Triund ridge and join a singing-bowl healing circle.',
    highlights: ['Tushita meditation class', 'Tsuglagkhang temple', 'Triund ridge trek', 'Singing-bowl session'],
    inclusions: ['4 nights boutique guest house', 'Breakfast and dinner', 'Teacher and trek guide', 'Pathankot transfers'],
    exclusions: ['Flights / trains'],
    itinerary: [
      ['Arrive McLeod Ganj', 'Kora walk around the Dalai Lama temple.'],
      ['Tushita', 'Introduction to Buddhist meditation.'],
      ['Triund trek', 'Full-day trek with views of the Dhauladhar range.'],
      ['Healing circle', 'Singing bowls and Tibetan cooking class.'],
      ['Departure', 'Morning sitting and drop-off.'],
    ],
  },
  {
    slug: 'rameswaram-ramayana-trail', title: 'Ramayana Trail: Rameswaram & Dhanushkodi', destination: 'rameswaram',
    category: 'Pilgrimage', durationDays: 3, price: 12499,
    summary: 'Holy bath in 22 theerthams, the pillared corridors and Dhanushkodi\'s land\'s end.',
    description: 'Follow the Ramayana: bathe in the 22 sacred wells of Ramanathaswamy temple, visit Dhanushkodi where the two seas meet and the Pamban bridge.',
    highlights: ['22 theertham snan', 'Ramanathaswamy corridors', 'Dhanushkodi', 'Pamban bridge'],
    inclusions: ['2 nights hotel', 'Breakfast', 'Madurai transfers', 'Guide'],
    exclusions: ['Flights / trains'],
    itinerary: [
      ['Madurai to Rameswaram', 'Meenakshi temple stop, cross Pamban bridge.'],
      ['Theertham snan', '22 wells and temple darshan; Dhanushkodi in the afternoon.'],
      ['Departure', 'Agni Theertham sunrise and drop to Madurai.'],
    ],
  },
  {
    slug: 'mahakal-bhasma-aarti', title: 'Mahakal Bhasma Aarti & Omkareshwar', destination: 'ujjain',
    category: 'Jyotirlinga', durationDays: 3, price: 10999,
    summary: 'Two Jyotirlingas in one trip, with confirmed Bhasma Aarti booking at Mahakaleshwar.',
    description: 'Witness the 4 AM Bhasma Aarti at Mahakaleshwar, walk the Mahakal Lok corridor and drive to Omkareshwar on the Narmada.',
    highlights: ['Bhasma Aarti booking', 'Mahakal Lok corridor', 'Omkareshwar Jyotirlinga', 'Narmada boat ride'],
    inclusions: ['2 nights hotel', 'Breakfast', 'AC car from Indore', 'Aarti booking'],
    exclusions: ['Flights / trains'],
    itinerary: [
      ['Indore to Ujjain', 'Mahakal Lok, Kal Bhairav and Ram Ghat Aarti.'],
      ['Bhasma Aarti and Omkareshwar', '4 AM Aarti, then drive to Omkareshwar.'],
      ['Departure', 'Drop at Indore.'],
    ],
  },
  {
    slug: 'kailash-mansarovar-yatra', title: 'Kailash Mansarovar Yatra', destination: 'kailash',
    category: 'Trek', durationDays: 14, price: 245000, featured: true,
    summary: 'The ultimate pilgrimage: parikrama of Mount Kailash and a holy dip in Lake Mansarovar.',
    description: 'A fully supported yatra via Nepal with acclimatisation days, Tibetan permits, Sherpa support and the 3-day Kailash parikrama over Dolma La pass (5,630 m).',
    highlights: ['3-day Kailash parikrama', 'Lake Mansarovar puja', 'Dolma La pass', 'Pashupatinath darshan in Kathmandu'],
    inclusions: ['All hotels and guest houses', 'All meals in Tibet', 'Tibet permits and visa', 'Sherpa and oxygen support'],
    exclusions: ['Flights to Kathmandu', 'Horses / porters for parikrama', 'Travel insurance'],
    itinerary: Array.from({ length: 14 }, (_, i) => [
      ['Kathmandu', 'Kathmandu', 'Pashupatinath', 'Drive to Kerung', 'Acclimatisation', 'Drive to Saga', 'To Mansarovar', 'Mansarovar puja', 'Parikrama day 1', 'Parikrama day 2: Dolma La', 'Parikrama day 3', 'Return to Saga', 'Return to Kathmandu', 'Departure'][i],
      'Paced for altitude, with our team leader and support vehicle.',
    ]),
  },
];

function upcomingDates(count, firstInDays, gapDays) {
  const dates = [];
  for (let i = 0; i < count; i++) {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + firstInDays + i * gapDays);
    dates.push(d);
  }
  return dates;
}

async function main() {
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@ayana.travel').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@12345';
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: 'ADMIN' },
    create: { name: 'Ayana Admin', email: adminEmail, role: 'ADMIN', passwordHash: await bcrypt.hash(adminPassword, 10) },
  });

  const destIds = {};
  for (const d of destinations) {
    const row = await prisma.destination.upsert({ where: { slug: d.slug }, update: d, create: d });
    destIds[d.slug] = row.id;
  }

  for (const p of packages) {
    const data = {
      title: p.title, summary: p.summary, description: p.description, category: p.category,
      durationDays: p.durationDays, pricePerPerson: rupees(p.price), isFeatured: !!p.featured,
      highlights: p.highlights, inclusions: p.inclusions, exclusions: p.exclusions,
      maxGroupSize: p.slug.startsWith('kailash') ? 8 : 15, destinationId: destIds[p.destination],
    };
    const pkg = await prisma.package.upsert({ where: { slug: p.slug }, update: data, create: { slug: p.slug, ...data } });

    await prisma.itineraryDay.deleteMany({ where: { packageId: pkg.id } });
    await prisma.itineraryDay.createMany({
      data: p.itinerary.map(([title, description], i) => ({ packageId: pkg.id, dayNumber: i + 1, title, description })),
    });

    const hasDepartures = await prisma.departure.count({ where: { packageId: pkg.id } });
    if (!hasDepartures) {
      await prisma.departure.createMany({
        data: upcomingDates(4, 14, 21).map((startDate, i) => ({
          packageId: pkg.id, startDate, seatsTotal: p.slug.startsWith('kailash') ? 16 : 30,
          priceOverride: i === 3 ? Math.round(rupees(p.price) * 1.1) : null, // peak-season pricing example
        })),
      });
    }
  }
  console.log(`Seeded ${destinations.length} destinations, ${packages.length} packages, admin ${adminEmail}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
