const countries = [
  { name: "일본", flag: "🇯🇵", aliases: ["일본", "일본국", "japan", "jp", "日本"], theme: "sakura" },
  { name: "프랑스", flag: "🇫🇷", aliases: ["프랑스", "france", "fr"] },
  { name: "대한민국", flag: "🇰🇷", aliases: ["대한민국", "한국", "south korea", "korea", "kr"] },
  { name: "미국", flag: "🇺🇸", aliases: ["미국", "united states", "united states of america", "usa", "us"] },
  { name: "태국", flag: "🇹🇭", aliases: ["태국", "thailand", "th"] },
  { name: "대만", flag: "🇹🇼", aliases: ["대만", "타이완", "taiwan", "tw"] },
  { name: "중국", flag: "🇨🇳", aliases: ["중국", "china", "cn"] },
  { name: "베트남", flag: "🇻🇳", aliases: ["베트남", "vietnam", "viet nam", "vn"] },
  { name: "싱가포르", flag: "🇸🇬", aliases: ["싱가포르", "singapore", "sg"] },
  { name: "영국", flag: "🇬🇧", aliases: ["영국", "united kingdom", "uk", "gb"] },
  { name: "이탈리아", flag: "🇮🇹", aliases: ["이탈리아", "italy", "it"] },
  { name: "스페인", flag: "🇪🇸", aliases: ["스페인", "spain", "es"] },
  { name: "독일", flag: "🇩🇪", aliases: ["독일", "germany", "de"] },
  { name: "호주", flag: "🇦🇺", aliases: ["호주", "오스트레일리아", "australia", "au"] },
  { name: "캐나다", flag: "🇨🇦", aliases: ["캐나다", "canada", "ca"] },
];

export function countryInfo(value = "") {
  const name = value.trim();
  const key = name.normalize("NFKC").toLowerCase().replace(/\s+/g, " ");
  const country = countries.find((item) => item.aliases.includes(key));
  return country
    ? { name: country.name, flag: country.flag, theme: country.theme || null }
    : { name, flag: "🌐", theme: null };
}
