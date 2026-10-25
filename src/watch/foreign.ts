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

/** Han, Tamil and other scripts English doesn't use. */
const SCRIPT = /[஀-௿㐀-鿿豈-﫿]/;

export function looksForeign(text: string): boolean {
  if (SCRIPT.test(text)) return true;
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  if (words.length === 0) return false;
  const malay = words.filter((x) => MALAY.has(x)).length;
  // A Malay word or two in an English line ("lah", "makan") stays as it is.
  return malay >= 3 || (malay >= 2 && malay / words.length >= 0.25);
}
