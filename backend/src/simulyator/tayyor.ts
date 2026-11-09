/**
 * Platformadagi tayyor ssenariylar — har biznesda bor, bazaga nusxalanmaydi.
 *
 * Mijoz har biznesga moslashadi: AI promptiga biznes profili (soha,
 * mahsulotlar, odatiy mijozlar) qo'shiladi, shuning uchun bir xil "Narxga
 * arzishini ko'rsating" ta'lim markazida ham, avtosalonda ham o'rinli bo'ladi.
 */

export type Kayfiyat = 'yumshoq' | 'ortacha' | 'qattiq';
export type Jins = 'ayol' | 'erkak';

export interface SsenariyMalumot {
  nom: string;
  vaziyat: string;
  maqsad: string;
  mijozIsmi: string;
  mijozJinsi: Jins;
  mijozHaqida: string;
  etirozlar: string[];
  kayfiyat: Kayfiyat;
  davomiylikDaq: number;
}

export const TAYYOR_PREFIKS = 'tayyor:';

export const TAYYOR_SSENARIYLAR: (SsenariyMalumot & { kalit: string })[] = [
  {
    kalit: 'tayyor:rozilik',
    nom: 'Gaplashishga rozilik oling',
    vaziyat: 'Kamola ikki kun oldin ariza qoldirgan va hozir ishda band.',
    maqsad: 'Kamoladan hozir qisqa gaplashishga yoki aniq vaqtda qayta qo\'ng\'iroq qilishga rozilik olish.',
    mijozIsmi: 'Kamola',
    mijozJinsi: 'ayol',
    mijozHaqida:
      'Ariza qoldirganini eslaydi, lekin hozir ish joyida, atrofida hamkasblar bor. Birinchi gapi — "hozir gaplasha olmayman". Sotuvchi o\'zini tanishtirmasa yoki uzoq gapirsa, "Telegramga yozib qo\'ying" deb qisqa tugatmoqchi bo\'ladi. Sotuvchi vaqtini hurmat qilsa, 1-2 jumlada nima foyda borligini aytsa va aniq vaqt taklif qilsa — rozi bo\'ladi.',
    etirozlar: ['Hozir ishdaman, gaplasha olmayman', 'Telegramga yozib qo\'ying', 'Keyinroq o\'zim qo\'ng\'iroq qilaman'],
    kayfiyat: 'ortacha',
    davomiylikDaq: 3,
  },
  {
    kalit: 'tayyor:ehtiyoj',
    nom: 'Narxdan oldin ehtiyojni bilib oling',
    vaziyat: 'Aziz darhol "qancha turadi?" deb so\'raydi va qisqa javob kutadi.',
    maqsad: 'Narxni aytishdan oldin 2-3 savol bilan Azizning ehtiyoji va maqsadini aniqlash.',
    mijozIsmi: 'Aziz',
    mijozJinsi: 'erkak',
    mijozHaqida:
      'Shoshib turgan, amaliy odam. Suhbatni "Narxi qancha?" bilan boshlaydi va savollarga avval biroz norozi bo\'ladi ("Shunchaki narxni ayting"). Sotuvchi nega so\'rayotganini tushuntirsa, ehtiyojini ochiq aytadi. Narx savolsiz aytilsa — "qimmat ekan" deb suhbatni tugatishga intiladi.',
    etirozlar: ['Shunchaki narxni ayting', 'Boshqa joyda arzonroq', 'Vaqtim kam'],
    kayfiyat: 'ortacha',
    davomiylikDaq: 5,
  },
  {
    kalit: 'tayyor:arzish',
    nom: 'Narxga arzishini ko\'rsating',
    vaziyat: 'Dilnoza uyi yaqinida arzonroq taklif topgan.',
    maqsad: 'Taklifingiz Dilnoza uchun nega qimmatliroq ekanini uning ehtiyojiga bog\'lab ko\'rsatish.',
    mijozIsmi: 'Dilnoza',
    mijozJinsi: 'ayol',
    mijozHaqida:
      'Taklifni yoqtirgan, lekin uyi yaqinida 20-30% arzonroq variant topgan va unga moyil. Faqat "biz yaxshiroqmiz" degan umumiy gapga ishonmaydi — aniq farq, natija yoki misol so\'raydi. Sotuvchi uning vaziyatiga mos qiymatni ko\'rsatsa, ikkilanib qoladi va keyingi qadamga ochiq bo\'ladi.',
    etirozlar: ['Uyimning yonida arzonroq bor', 'Farqi nimada?', 'Chegirma qilib bera olasizmi?'],
    kayfiyat: 'qattiq',
    davomiylikDaq: 5,
  },
  {
    kalit: 'tayyor:oylab',
    nom: '"O\'ylab ko\'raman" ortidagi shubhani toping',
    vaziyat: 'Sardorga taklif yoqadi, lekin u avval xotini bilan maslahatlashmoqchi.',
    maqsad: '"O\'ylab ko\'raman" ortidagi haqiqiy shubhani aniqlash va keyingi aniq qadamni kelishish.',
    mijozIsmi: 'Sardor',
    mijozJinsi: 'erkak',
    mijozHaqida:
      'Xushmuomala, taklif yoqgan. Har safar "o\'ylab ko\'raman, xotinim bilan maslahatlashay" deydi. Aslida ichida narx va natijaga kafolat bo\'yicha shubha bor, lekin buni o\'zi aytmaydi — faqat sotuvchi ochiq va hurmat bilan so\'rasa ochadi. Bosim o\'tkazilsa, yopilib qoladi.',
    etirozlar: ['O\'ylab ko\'raman', 'Xotinim bilan maslahatlashishim kerak', 'Keyinroq o\'zim xabar beraman'],
    kayfiyat: 'yumshoq',
    davomiylikDaq: 5,
  },
  {
    kalit: 'tayyor:vaqt',
    nom: 'Kun va vaqtni belgilang',
    vaziyat: 'Aziz hamma narsaga rozi, lekin kun tanlashdan qochadi.',
    maqsad: 'Keyingi qadam (uchrashuv, sinov yoki to\'lov) uchun aniq kun va soatni kelishish.',
    mijozIsmi: 'Aziz',
    mijozJinsi: 'erkak',
    mijozHaqida:
      'Hamma narsaga "ha, zo\'r" deydi, lekin kun so\'ralganda "shu haftada bir kun", "vaqtim bo\'lganda" deb aniqlikdan qochadi. Sotuvchi ikkita aniq variant taklif qilsa (masalan, "seshanba 18:00 yoki chorshanba 10:00"), bittasini tanlaydi.',
    etirozlar: ['Shu haftada bir kun kelaman', 'Vaqtim bo\'lganda yozaman', 'Hozir aniq ayta olmayman'],
    kayfiyat: 'yumshoq',
    davomiylikDaq: 5,
  },
  {
    kalit: 'tayyor:qaytarish',
    nom: 'Javob bermay qo\'ygan lidni qaytaring',
    vaziyat: 'Malika ikki marta javob bermagan va ma\'lumotni Telegramga yuborishni so\'raydi.',
    maqsad: 'Malikani suhbatga qaytarish, nega to\'xtaganini bilish va keyingi qadamga rozilik olish.',
    mijozIsmi: 'Malika',
    mijozJinsi: 'ayol',
    mijozHaqida:
      'Avval qiziqqan, keyin ikki qo\'ng\'iroqqa javob bermagan — boshqa ishlar bilan band bo\'lib, qiziqishi sovigan. Darhol "Telegramga yuboring, o\'qib chiqaman" deydi. Sotuvchi ayblamasa, uning avvalgi qiziqishini eslatsa va bitta qisqa savol bersa — suhbatga qaytadi.',
    etirozlar: ['Telegramga yuboring, o\'qib chiqaman', 'Hozir dolzarb emas', 'Esimdan chiqibdi'],
    kayfiyat: 'ortacha',
    davomiylikDaq: 3,
  },
];

export function tayyorSsenariy(kalit: string) {
  return TAYYOR_SSENARIYLAR.find((s) => s.kalit === kalit) ?? null;
}
