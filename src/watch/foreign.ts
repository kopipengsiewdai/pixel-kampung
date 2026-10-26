/**
 * Whether a line residents said or thought is mostly not English, so the
 * watch page can offer it in English. Shared by the page and its server.
 * Malay is spotted by its everyday words; Chinese and Tamil by their scripts.
 */

const MALAY = new Set([
  'aku', 'saya', 'kau', 'awak', 'engkau', 'kita', 'kami', 'dia', 'mereka', 'ini', 'itu', 'ni', 'tu',
  'tak', 'tidak', 'bukan', 'belum', 'jangan', 'sudah', 'dah', 'nak', 'mahu', 'mau', 'boleh', 'ada', 'tiada',
  'yang', 'dan', 'dengan', 'untuk', 'dari', 'daripada', 'ke', 'di', 'pada', 'lagi', 'juga', 'pun', 'tapi', 'tetapi',
  'kalau', 'macam', 'mana', 'apa', 'siapa', 'bila', 'kenapa', 'sangat', 'sikit', 'sedikit', 'banyak', 'semua',
  'makan', 'minum', 'nasi', 'duit', 'wang', 'rumah', 'pergi', 'balik', 'datang', 'tunggu', 'tolong', 'terima', 'kasih',
  'sekarang', 'nanti', 'esok', 'hari', 'betul', 'sini', 'situ', 'sana', 'jom', 'mari', 'lapar', 'sakit', 'pening',
  'mentah', 'masak', 'beli', 'jual', 'harga', 'cari', 'kerja', 'emak', 'abang', 'kakak', 'adik',
]);

/** Everyday Hokkien, Teochew and Hakka words, as written in Roman letters. */
const CHINESE = new Set([
  'goa', 'gua', 'lu', 'bo', 'boh', 'mai', 'beh', 'bueh', 'buay', 'liao', 'lor', 'hor', 'chiak', 'jiak', 'png', 'tsiah',
  'aiyo', 'aiya', 'siao', 'kiasu', 'tng', 'khi', 'kiah', 'tio', 'lang', 'kua', 'ka', 'bueh', 'paiseh', 'jialat', 'shiok',
]);
/** Everyday Tamil words, as written in Roman letters. */
const TAMIL = new Set([
  'naan', 'nee', 'neenga', 'enna', 'illa', 'illai', 'irukku', 'sari', 'romba', 'saapadu', 'saapidu', 'vaa', 'poo', 'po', 'panna',
  'pannu', 'nalla', 'appa', 'amma', 'anna', 'akka', 'thambi', 'enakku', 'unakku', 'avan', 'aval', 'inga', 'anga', 'vendam', 'venum',
  'kaasu', 'panam', 'ippo', 'aamaa', 'seri', 'thanni', 'meen', 'kadai', 'veedu', 'maama', 'machan',
]);

/** Han, Tamil and other scripts English doesn't use. */
const SCRIPT = /[஀-௿㐀-鿿豈-﫿]/;

export function looksForeign(text: string): boolean {
  if (SCRIPT.test(text)) return true;
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  if (words.length === 0) return false;
  // A word or two of Malay, Hokkien or Tamil in an English line ("lah", "makan", "aiyo") stays as it is.
  return [MALAY, CHINESE, TAMIL].some((set) => {
    const n = words.filter((x) => set.has(x)).length;
    return n >= 3 || (n >= 2 && n / words.length >= 0.25);
  });
}
