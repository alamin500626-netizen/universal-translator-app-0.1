export type Lang = { code: string; name: string };

const RAW =
  "bn:Bengali,en:English,ar:Arabic,zh-CN:Chinese (Simplified),zh-TW:Chinese (Traditional),ja:Japanese,ko:Korean,hi:Hindi,ur:Urdu," +
  "fr:French,de:German,es:Spanish,pt:Portuguese,ru:Russian,it:Italian,tr:Turkish,th:Thai,vi:Vietnamese,id:Indonesian,ms:Malay," +
  "nl:Dutch,pl:Polish,uk:Ukrainian,fa:Persian,he:Hebrew,el:Greek,sv:Swedish,da:Danish,fi:Finnish,no:Norwegian," +
  "af:Afrikaans,sq:Albanian,am:Amharic,hy:Armenian,az:Azerbaijani,eu:Basque,be:Belarusian,bs:Bosnian,bg:Bulgarian,ca:Catalan," +
  "ceb:Cebuano,ny:Chichewa,co:Corsican,hr:Croatian,cs:Czech,eo:Esperanto,et:Estonian,tl:Filipino,fy:Frisian,gl:Galician," +
  "ka:Georgian,gu:Gujarati,ht:Haitian Creole,ha:Hausa,haw:Hawaiian,hmn:Hmong,hu:Hungarian,is:Icelandic,ig:Igbo,ga:Irish," +
  "jv:Javanese,kn:Kannada,kk:Kazakh,km:Khmer,rw:Kinyarwanda,ku:Kurdish,ky:Kyrgyz,lo:Lao,la:Latin,lv:Latvian,lt:Lithuanian," +
  "lb:Luxembourgish,mk:Macedonian,mg:Malagasy,ml:Malayalam,mt:Maltese,mi:Maori,mr:Marathi,mn:Mongolian,my:Myanmar (Burmese)," +
  "ne:Nepali,or:Odia,ps:Pashto,pa:Punjabi,ro:Romanian,sm:Samoan,gd:Scots Gaelic,sr:Serbian,st:Sesotho,sn:Shona,sd:Sindhi," +
  "si:Sinhala,sk:Slovak,sl:Slovenian,so:Somali,su:Sundanese,sw:Swahili,tg:Tajik,ta:Tamil,tt:Tatar,te:Telugu,tk:Turkmen," +
  "ug:Uyghur,uz:Uzbek,cy:Welsh,xh:Xhosa,yi:Yiddish,yo:Yoruba,zu:Zulu";

export const LANGS: Lang[] = RAW.split(",").map((p) => {
  const i = p.indexOf(":");
  return { code: p.slice(0, i), name: p.slice(i + 1) };
});

export const POPULAR = ["bn", "en", "ar", "zh", "ja", "ko", "hi", "ur", "fr", "de", "es", "pt", "ru", "it", "tr"];

export const baseCode = (c: string) => c.toLowerCase().split("-")[0];

export function langName(code: string): string {
  if (code === "auto") return "Auto detect";
  return LANGS.find((l) => l.code.toLowerCase() === code.toLowerCase())?.name ?? code;
}

export function nativeName(code: string): string {
  try {
    return new Intl.DisplayNames([code], { type: "language" }).of(code) ?? "";
  } catch {
    return "";
  }
}
