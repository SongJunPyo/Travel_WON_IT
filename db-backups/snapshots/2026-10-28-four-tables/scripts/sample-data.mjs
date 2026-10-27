// 도쿄 신주쿠 시연용 가데이터를 travel_won 테이블 구조에 맞춘 CSV로 만듭니다.
// 매장명·주소·가격·여행자는 모두 가상이고, 상품명만 검색 시연을 위해 실제 브랜드를 씁니다.
// 시드가 고정되어 있어 다시 실행해도 같은 파일이 나옵니다. 사용법: npm run sample-data
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { distanceMeters, normalizeProduct } from "../src/domain.mjs";

const OUT = new URL("../sample-data/", import.meta.url);
const TRAVELERS = 300;
const TODAY = "2026-10-27";
const DEMO_LOCATION = { latitude: 35.6896, longitude: 139.7006 }; // 신주쿠역
const RADIUS = 3000;

let seed = 20261027;
const random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const int = (min, max) => min + Math.floor(random() * (max - min + 1));
const chance = (p) => random() < p;
const pick = (list) => list[Math.floor(random() * list.length)];
const weighted = (list) => {
  let r = random() * list.reduce((sum, x) => sum + (x.w ?? 1), 0);
  for (const x of list) if ((r -= x.w ?? 1) < 0) return x;
  return list.at(-1);
};
const addDays = (date, days) =>
  new Date(Date.parse(date + "T00:00:00Z") + days * 86400000).toISOString().slice(0, 10);
const two = (n) => String(n).padStart(2, "0");

// 지역: inside는 신주쿠역 반경 3km 안, 나머지는 반경 밖입니다.
const AREAS = [
  { name: "니시신주쿠", ward: "신주쿠구", lat: 35.692, lng: 139.695, inside: true, w: 5 },
  { name: "신주쿠", ward: "신주쿠구", lat: 35.691, lng: 139.704, inside: true, w: 6 },
  { name: "가부키초", ward: "신주쿠구", lat: 35.695, lng: 139.703, inside: true, w: 4 },
  { name: "신오쿠보", ward: "신주쿠구", lat: 35.701, lng: 139.7, inside: true, w: 3 },
  { name: "요요기", ward: "시부야구", lat: 35.683, lng: 139.702, inside: true, w: 2 },
  { name: "신주쿠교엔마에", ward: "신주쿠구", lat: 35.688, lng: 139.71, inside: true, w: 2 },
  { name: "다카다노바바", ward: "신주쿠구", lat: 35.712, lng: 139.7035, inside: true, w: 2 },
  { name: "하라주쿠", ward: "시부야구", lat: 35.6705, lng: 139.703, inside: true, w: 3 },
  { name: "요쓰야", ward: "신주쿠구", lat: 35.686, lng: 139.729, inside: true, w: 1 },
  { name: "시부야", ward: "시부야구", lat: 35.659, lng: 139.701, inside: false, w: 4 },
  { name: "이케부쿠로", ward: "도시마구", lat: 35.73, lng: 139.711, inside: false, w: 2 },
  { name: "긴자", ward: "주오구", lat: 35.6717, lng: 139.765, inside: false, w: 2 },
  { name: "아사쿠사", ward: "다이토구", lat: 35.712, lng: 139.796, inside: false, w: 2 },
];
const INSIDE = AREAS.filter((a) => a.inside);
const OUTSIDE = AREAS.filter((a) => !a.inside);

// 상품: [영수증 원문, 한국어 이름, 기준가(엔), 인기 가중치]
const item = ([raw, ko, price, w = 1]) => ({ raw, ko, price, w });
const SNACKS = [
  ["DORITOS ナチョチーズ 60G", "도리토스 나초치즈 60g", 158, 6],
  ["DORITOS コンソメ 60G", "도리토스 콘소메 60g", 158, 4],
  ["DORITOS メキシカンタコス 60G", "도리토스 멕시칸 타코 60g", 158, 2],
  ["カルビー ポテトチップス うすしお 60G", "가루비 감자칩 소금맛 60g", 148, 4],
  ["じゃがりこ サラダ", "자가리코 샐러드맛", 168, 4],
  ["ポッキー チョコレート", "포키 초콜릿", 178, 4],
  ["キットカット 抹茶 ミニ12枚", "킷캣 말차 미니 12개입", 548, 3],
  ["ハイチュウ グレープ", "하이츄 포도맛", 130, 2],
  ["コカ・コーラ 500ML", "코카콜라 500ml", 160, 4],
  ["ポカリスエット 500ML", "포카리스웨트 500ml", 170, 3],
  ["お茶 緑茶 525ML", "녹차 525ml", 160, 4],
  ["EVIAN 500ML", "에비앙 500ml", 140, 2],
  ["天然水 2L", "천연수 2L", 128, 2],
  ["おにぎり 鮭", "주먹밥 연어", 180, 5],
  ["おにぎり ツナマヨ", "주먹밥 참치마요", 160, 5],
  ["たまごサンド", "계란 샌드위치", 298, 4],
  ["からあげ 5個", "가라아게 5개", 238, 3],
  ["カスタードプリン", "커스터드 푸딩", 198, 3],
  ["メロンパン", "멜론빵", 150, 3],
  ["チューハイ レモン 350ML", "레몬 츄하이 350ml", 165, 2],
  ["缶ビール 350ML", "캔맥주 350ml", 248, 3],
  ["カップヌードル", "컵누들", 236, 3],
  ["アイスコーヒー M", "아이스커피 M", 180, 3],
].map(item);
const COSMETICS = [
  ["肌ラボ 極潤 ヒアルロン液 170ML", "하다라보 고쿠쥰 로션 170ml", 1078, 5],
  ["ビオレUV アクアリッチ ウォータリーエッセンス 70G", "비오레 UV 아쿠아리치 선크림 70g", 1080, 5],
  ["メラノCC 薬用しみ集中対策 美容液 20ML", "멜라노CC 비타민C 세럼 20ml", 1078, 4],
  ["キャンメイク マシュマロフィニッシュパウダー", "캔메이크 마시멜로 피니시 파우더", 1034, 3],
  ["キスミー ヒロインメイク マスカラ", "키스미 히로인 마스카라", 1320, 3],
  ["センカ パーフェクトホイップ 120G", "센카 퍼펙트휩 클렌징폼 120g", 715, 4],
  ["ルルルン フェイスマスク 7枚", "룰루룬 페이스 마스크 7매", 770, 3],
  ["DHC 薬用リップクリーム", "DHC 립크림", 770, 3],
  ["ケイト リップモンスター", "케이트 립몬스터", 1540, 3],
  ["キュレル 潤浸保湿 クリーム 40G", "큐렐 수분 크림 40g", 2310, 2],
  ["アネッサ パーフェクトUV 60ML", "아넷사 퍼펙트 UV 선크림 60ml", 3278, 3],
  ["休足時間 18枚", "휴족시간 18매", 658, 4],
  ["ロイヒつぼ膏 156枚", "로이히츠보코 동전파스 156매", 1298, 3],
  ["サンテFX ネオ 12ML", "산테 FX 네오 안약 12ml", 598, 3],
].map(item);
const SOUVENIRS = [
  ["東京ばな奈 8個入", "도쿄 바나나 8개입", 1296, 5],
  ["白い恋人 12枚", "시로이 코이비토 12매", 1188, 3],
  ["抹茶バウムクーヘン", "말차 바움쿠헨", 1620, 3],
  ["ご当地 キーホルダー", "지역 한정 키홀더", 660, 2],
  ["手ぬぐい 富士山", "후지산 데누구이", 1100, 2],
  ["KITKAT 抹茶 大袋", "킷캣 말차 대용량", 1080, 3],
].map(item);
const MENUS = {
  ramen: {
    brands: ["멘야 하루", "라멘 소라", "츠케멘 다이치"],
    mains: [["醤油ラーメン", "쇼유 라멘", 950, 4], ["味玉とんこつラーメン", "아지타마 돈코츠 라멘", 1150, 5], ["つけ麺 並", "츠케멘 보통", 1000, 3]],
    sides: [["チャーシュー丼", "차슈동", 400, 2], ["餃子 6個", "교자 6개", 450, 3], ["生ビール", "생맥주", 600, 2]],
  },
  sushi: {
    brands: ["스시 마루", "회전초밥 우미"],
    mains: [["ランチセット 上", "런치 세트 상", 2200, 3], ["にぎり 盛り合わせ 10貫", "초밥 모둠 10피스", 2800, 3]],
    sides: [["サーモン", "연어 초밥", 220, 4], ["中トロ", "주토로 초밥", 440, 3], ["いくら軍艦", "연어알 군함말이", 330, 2], ["赤だし", "아카다시 된장국", 220, 2]],
  },
  teishoku: {
    brands: ["규동 미나토", "정식당 히나타"],
    mains: [["牛丼 並盛", "규동 보통", 468, 5], ["牛丼 大盛", "규동 곱빼기", 658, 2], ["生姜焼き定食", "생강구이 정식", 890, 3]],
    sides: [["味噌汁", "된장국", 110, 3], ["温泉卵", "온천 달걀", 90, 3]],
  },
  tonkatsu: {
    brands: ["돈카츠 사쿠"],
    mains: [["ロースかつ定食", "로스카츠 정식", 1580, 4], ["ヒレかつ定食", "히레카츠 정식", 1780, 3]],
    sides: [["カツサンド", "카츠샌드", 980, 1], ["生ビール", "생맥주", 600, 1]],
  },
  izakaya: {
    brands: ["이자카야 토리마치", "야키토리 코하쿠"],
    mains: [["焼き鳥 盛り合わせ 5本", "야키토리 모둠 5꼬치", 980, 4], ["唐揚げ", "가라아게", 580, 3]],
    sides: [["枝豆", "에다마메", 380, 3], ["ハイボール", "하이볼", 480, 4], ["生ビール 中", "생맥주 중", 580, 4], ["お通し", "기본 안주", 400, 5]],
    night: true,
  },
  cafe: {
    brands: ["카페 모쿠", "킷사텐 아오이", "커피 스탠드 니시"],
    mains: [["ブレンドコーヒー", "블렌드 커피", 520, 4], ["カフェラテ", "카페라테", 580, 4], ["抹茶ラテ", "말차라테", 620, 3], ["モーニングセット", "모닝 세트", 700, 3]],
    sides: [["ナポリタン", "나폴리탄 스파게티", 1050, 2], ["チーズケーキ", "치즈케이크", 580, 3]],
  },
  yakiniku: {
    brands: ["야키니쿠 호무라"],
    mains: [["ランチ焼肉セット", "런치 야키니쿠 세트", 1500, 3], ["和牛カルビ", "와규 갈비", 1680, 4]],
    sides: [["タン塩", "우설 소금구이", 1280, 3], ["ライス", "공기밥", 280, 4], ["生ビール 中", "생맥주 중", 580, 3]],
    night: true,
  },
  curry: {
    brands: ["카레 하우스 코코로"],
    mains: [["ポークカレー", "포크 카레", 780, 4], ["カツカレー", "카츠 카레", 1100, 4]],
    sides: [["チーズ トッピング", "치즈 토핑", 250, 3], ["ラッシー", "라씨", 300, 2]],
  },
};
for (const menu of Object.values(MENUS)) {
  menu.mains = menu.mains.map(item);
  menu.sides = menu.sides.map(item);
}

// 매장 종류: browse는 PAGE 2 카테고리(없으면 null), ledger는 PAGE 1 가계부 카테고리입니다.
const KINDS = {
  convenience: { browse: null, ledger: "음식", brands: ["데일리마트", "산고 스토어", "모닝마트"], perArea: 2 },
  discount: { browse: null, ledger: "쇼핑", brands: ["메가 디스카운트"], perArea: 0.5 },
  drugstore: { browse: "화장품", ledger: "쇼핑", brands: ["웰케어 드럭", "하나 드럭", "미도리 약국"], perArea: 1.2 },
  souvenir: { browse: null, ledger: "쇼핑", brands: ["오미야게 마켓", "도쿄 기념품관"], perArea: 0.4 },
  clothing: { browse: "의류", ledger: "쇼핑", brands: ["베이직웨어", "스트리트 랩", "빈티지 오쿠라", "스니커 포인트"], perArea: 0.8 },
  attraction: { browse: "명소", ledger: "관광" },
  wellness: { browse: "뷰티·웰니스", ledger: "기타" },
  hotel: { browse: "숙박", ledger: "숙박" },
  activity: { browse: "액티비티", ledger: "관광" },
  rent: { browse: "렌트", ledger: "교통" },
};
const CLOTHES = {
  "베이직웨어": [["ドライ Tシャツ", "드라이 티셔츠", 1500, 5], ["スウェット パーカー", "스웨트 후드", 3990, 3], ["ストレート デニム", "스트레이트 청바지", 4990, 3], ["ソックス 3足", "양말 3켤레", 990, 4], ["ライトダウン ベスト", "경량 패딩 조끼", 3990, 3]],
  "스트리트 랩": [["グラフィック Tシャツ", "그래픽 티셔츠", 3300, 4], ["キャップ", "캡 모자", 2990, 4], ["トートバッグ", "토트백", 1990, 3], ["カーゴパンツ", "카고 바지", 5990, 2]],
  "빈티지 오쿠라": [["古着 シャツ", "빈티지 셔츠", 3300, 4], ["古着 デニムジャケット", "빈티지 데님 재킷", 7700, 2], ["古着 スウェット", "빈티지 스웨트셔츠", 4400, 3]],
  "스니커 포인트": [["スニーカー ローカット", "로우컷 스니커즈", 8990, 4], ["スニーカー ハイカット", "하이컷 스니커즈", 10990, 2], ["シューケア スプレー", "신발 방수 스프레이", 1650, 2]],
};
// 명소·웰니스·숙박·액티비티·렌트 매장은 이름과 지역을 직접 정합니다.
const PLACES = [
  ["attraction", "니시신주쿠 스카이 전망대", "니시신주쿠", [["展望台 入場券 大人", "전망대 입장권 성인", 1200, 5], ["展望台 記念写真", "전망대 기념사진", 1500, 1]]],
  ["attraction", "신주쿠 정원 공원", "신주쿠교엔마에", [["入園料 一般", "정원 입장료 일반", 500, 5]]],
  ["attraction", "도쿄 아트 뮤지엄 신주쿠", "신주쿠", [["企画展 一般", "기획전 일반", 1800, 4], ["音声ガイド", "오디오 가이드", 600, 2], ["図録", "전시 도록", 2500, 1]]],
  ["attraction", "하라주쿠 숲 신사 보물관", "하라주쿠", [["拝観料", "관람료", 500, 4], ["お守り", "부적", 800, 3], ["おみくじ", "오미쿠지", 200, 3]]],
  ["attraction", "가부키초 시네마 타워", "가부키초", [["映画 一般", "영화 일반", 2000, 4], ["ポップコーン M", "팝콘 M", 600, 3]]],
  ["attraction", "시부야 스카이 데크", "시부야", [["展望デッキ 入場券", "전망대 입장권", 2200, 5]]],
  ["attraction", "아사쿠사 전통 공예관", "아사쿠사", [["見学 入場券", "견학 입장권", 1000, 4], ["お守り", "부적", 800, 2]]],
  ["attraction", "긴자 아트 갤러리", "긴자", [["企画展 一般", "기획전 일반", 1500, 4]]],
  ["wellness", "스파 유노하나 신주쿠", "가부키초", [["入館料 大人", "입관료 성인", 2900, 5], ["岩盤浴", "암반욕", 880, 3], ["レンタルタオル", "타월 대여", 300, 3]]],
  ["wellness", "릴랙스 마사지 니시신주쿠", "니시신주쿠", [["ボディ 60分", "전신 마사지 60분", 6000, 4], ["足つぼ 30分", "발 마사지 30분", 3300, 4]]],
  ["wellness", "네일 살롱 하나", "신주쿠", [["ジェルネイル ワンカラー", "젤네일 원컬러", 5500, 4], ["ネイルオフ", "네일 제거", 1650, 2]]],
  ["wellness", "헤어 살롱 키리", "하라주쿠", [["カット", "커트", 4950, 4], ["ヘッドスパ 20分", "헤드스파 20분", 3300, 3]]],
  ["wellness", "센토 마츠노유", "신오쿠보", [["入浴料", "목욕탕 입장료", 550, 5], ["サウナ料金", "사우나 추가", 300, 3]]],
  ["wellness", "릴랙스 마사지 시부야", "시부야", [["ボディ 60分", "전신 마사지 60분", 6500, 4]]],
  ["hotel", "호텔 하루 신주쿠", "신주쿠", [["宿泊料 ツイン 1泊", "트윈룸 1박", 19800, 1]]],
  ["hotel", "니시신주쿠 스테이", "니시신주쿠", [["宿泊料 ダブル 1泊", "더블룸 1박", 14800, 1]]],
  ["hotel", "캡슐 호텔 네무", "가부키초", [["宿泊料 カプセル 1泊", "캡슐 1박", 4800, 1]]],
  ["hotel", "신오쿠보 게스트하우스", "신오쿠보", [["宿泊料 ツイン 1泊", "트윈룸 1박", 9800, 1]]],
  ["hotel", "요요기 레지던스", "요요기", [["宿泊料 スタジオ 1泊", "스튜디오룸 1박", 16500, 1]]],
  ["hotel", "다카다노바바 비즈니스 호텔", "다카다노바바", [["宿泊料 シングル 1泊", "싱글룸 1박", 9200, 1]]],
  ["hotel", "시부야 스트림 호텔", "시부야", [["宿泊料 ツイン 1泊", "트윈룸 1박", 24800, 1]]],
  ["hotel", "이케부쿠로 선 호텔", "이케부쿠로", [["宿泊料 ダブル 1泊", "더블룸 1박", 12800, 1]]],
  ["hotel", "긴자 브리지 호텔", "긴자", [["宿泊料 ツイン 1泊", "트윈룸 1박", 32000, 1]]],
  ["activity", "기모노 체험관 하나 신주쿠", "신주쿠", [["着物レンタル プラン", "기모노 대여 플랜", 4400, 5], ["ヘアセット", "헤어 세팅", 1650, 3]]],
  ["activity", "기모노 체험관 하나 아사쿠사", "아사쿠사", [["着物レンタル プラン", "기모노 대여 플랜", 3900, 5], ["ヘアセット", "헤어 세팅", 1650, 3]]],
  ["activity", "가라오케 마이크 신주쿠", "가부키초", [["ルーム料金 2時間", "룸 요금 2시간", 1800, 5], ["ドリンクバー", "드링크바", 500, 4]]],
  ["activity", "VR 아케이드 신주쿠", "가부키초", [["VRアトラクション 4回券", "VR 어트랙션 4회권", 4400, 4]]],
  ["activity", "쿠킹 클래스 키친 니시", "니시신주쿠", [["ラーメン作り体験", "라멘 만들기 체험", 7500, 3], ["和菓子作り体験", "화과자 만들기 체험", 5500, 3]]],
  ["activity", "닌자 체험 도장", "신주쿠", [["忍者体験 60分", "닌자 체험 60분", 5500, 4]]],
  ["activity", "게임 센터 가부키", "가부키초", [["クレーンゲーム", "크레인 게임", 100, 5], ["プリクラ", "스티커 사진", 500, 4]]],
  ["activity", "배팅 센터 바바", "다카다노바바", [["バッティング 1ゲーム", "배팅 1게임", 300, 5]]],
  ["rent", "시티 렌터카 신주쿠", "신주쿠", [["コンパクトカー 24時間", "소형차 24시간", 8800, 4], ["ETCカード レンタル", "ETC 카드 대여", 330, 3], ["免責補償", "면책 보상", 1100, 3]]],
  ["rent", "e바이크 쉐어 신주쿠", "니시신주쿠", [["電動自転車 1日", "전동 자전거 1일", 2500, 3], ["電動自転車 3時間", "전동 자전거 3시간", 1200, 4]]],
  ["rent", "포켓 와이파이 데스크", "신주쿠", [["ポケットWi-Fi 5日", "포켓 와이파이 5일", 4000, 4], ["モバイルバッテリー レンタル", "보조배터리 대여", 500, 3]]],
  ["rent", "러기지 키퍼 신주쿠", "신주쿠", [["荷物預かり 1日", "짐 보관 1일", 800, 4]]],
  ["rent", "시티 렌터카 시부야", "시부야", [["コンパクトカー 24時間", "소형차 24시간", 9200, 4], ["免責補償", "면책 보상", 1100, 3]]],
];

// 매장 만들기. 같은 지역 안에서 약 400m 이내로 흩어 놓습니다.
const stores = [];
let addressNo = 0;
function addStore(kind, name, area, products) {
  const a = AREAS.find((x) => x.name === area);
  const angle = random() * 2 * Math.PI, meters = random() * 400;
  const latitude = +(a.lat + (meters * Math.sin(angle)) / 111320).toFixed(6);
  const longitude = +(a.lng + (meters * Math.cos(angle)) / (111320 * Math.cos((a.lat * Math.PI) / 180))).toFixed(6);
  // 매장마다 가격을 조금씩 다르게 둡니다(0.92~1.08배).
  const factor = kind === "discount" ? 0.85 + random() * 0.05 : 0.92 + random() * 0.16;
  const round = (p) => (p < 1000 && ["convenience", "discount", "drugstore"].includes(kind) ? Math.round(p) : Math.round(p / 10) * 10);
  stores.push({
    kind, name, area: a, latitude, longitude,
    address: `도쿄 ${a.ward} ${a.name} (가상 주소 ${two(++addressNo)})`,
    products: products.map((p) => ({ ...p, price: Math.max(10, round(p.price * (kind === "hotel" || p.price <= 100 ? 1 : factor))) })),
  });
}
for (const a of AREAS) {
  for (const [kind, spec] of Object.entries(KINDS)) {
    if (!spec.perArea) continue;
    const n = Math.floor(spec.perArea * (a.inside ? 1 : 0.7)) + (chance((spec.perArea * (a.inside ? 1 : 0.7)) % 1) ? 1 : 0);
    const brands = [...spec.brands].sort(() => random() - 0.5);
    for (let i = 0; i < n; i++) {
      const brand = brands[i % brands.length];
      const products =
        kind === "convenience" ? SNACKS
        : kind === "discount" ? [...SNACKS, ...COSMETICS]
        : kind === "drugstore" ? COSMETICS
        : kind === "souvenir" ? SOUVENIRS
        : CLOTHES[brand].map(item);
      addStore(kind, `${brand} ${a.name}${i >= brands.length ? " 2호" : ""}점`, a.name, products);
    }
  }
  for (const [type, menu] of Object.entries(MENUS)) {
    if (!chance(a.inside ? 0.85 : 0.6)) continue;
    const store = `${pick(menu.brands)} ${a.name}점`;
    if (stores.some((s) => s.name === store)) continue;
    addStore("restaurant", store, a.name, [...menu.mains.map((p) => ({ ...p, main: true })), ...menu.sides]);
    stores.at(-1).menu = type;
  }
}
for (const [kind, name, area, products] of PLACES) addStore(kind, name, area, products.map(item));
const storesOf = (kind, area, filter = () => true) => {
  const list = stores.filter((s) => s.kind === kind && filter(s));
  const near = list.filter((s) => s.area === area);
  return near.length && chance(0.8) ? near : list.filter((s) => s.area.inside === area.inside).length ? list.filter((s) => s.area.inside === area.inside) : list;
};

// 여행자 시뮬레이션
const devices = [], trips = [], receipts = [], items = [];
const TRANSPORT = [
  ["交通系ICカード チャージ", "교통카드 충전", () => pick([2000, 3000, 5000])],
  ["タクシー運賃", "택시 요금", () => int(80, 450) * 10],
  ["地下鉄 24時間券", "지하철 24시간권", () => 800],
  ["空港リムジンバス", "공항 리무진버스", () => 3600],
].map(([raw, ko, price]) => ({ raw, ko, price }));
const STORE_TYPES_BY_SLOT = {
  breakfast: () => (chance(0.65) ? ["convenience"] : ["restaurant", (s) => s.menu === "cafe" || s.menu === "teishoku"]),
  lunch: () => ["restaurant", (s) => s.menu !== "izakaya"],
  dinner: () => ["restaurant", (s) => s.menu !== "cafe"],
};

for (let d = 1; d <= TRAVELERS; d++) {
  const party = weighted([{ n: 1, w: 3 }, { n: 2, w: 5 }, { n: 3, w: 1.2 }, { n: 4, w: 0.8 }]).n;
  const shares = chance(0.88);
  const start = addDays("2026-08-01", int(0, 84));
  const nights = int(2, 6);
  const end = addDays(start, nights);
  const rate = (9.0 + random() * 0.6).toFixed(4);
  const shinjukuBase = chance(0.75);
  const hotel = pick(stores.filter((s) => s.kind === "hotel" && s.area.inside === shinjukuBase));
  devices.push({
    id: d,
    // 해시 원문에 공백이 있어 앱 토큰 형식([\w-]{40,160})과 맞지 않으므로, 누구도 가데이터 기기로 로그인할 수 없습니다.
    token_hash: createHash("sha256").update(`sample traveler ${d} of travel_won demo`).digest("hex"),
    is_sample: 1,
    created_at: `${addDays(start, -int(1, 14))} ${two(int(8, 23))}:${two(int(0, 59))}:${two(int(0, 59))}.${String(int(0, 999999)).padStart(6, "0")}`,
  });
  trips.push({
    id: d, device_id: d, city: "도쿄", country: "일본", start_date: start, end_date: end,
    budget_krw: int(12, 50) * 50000, currency: "JPY", rate,
  });
  const receipt = (store, date, hour, lines, kind = store?.kind) => {
    if (date > TODAY || !lines.length) return;
    const merged = new Map();
    for (const l of lines) {
      const prev = merged.get(l.raw);
      merged.set(l.raw, prev ? { ...prev, quantity: prev.quantity + l.quantity } : l);
    }
    const list = [...merged.values()];
    const located = store && store.kind !== "transport";
    const share = located && shares && chance(0.95);
    const spec = KINDS[kind];
    const browse = kind === "discount" ? (list.some((l) => COSMETICS.some((c) => c.raw === l.raw)) ? "화장품" : null)
      : kind === "restaurant" ? "식당" : spec?.browse ?? null;
    const id = receipts.length + 1;
    receipts.push({
      id, device_id: d, trip_id: d,
      store_name: store?.name ?? lines[0].storeName,
      store_address: store?.address ?? lines[0].address,
      latitude: located ? store.latitude : null,
      longitude: located ? store.longitude : null,
      ledger_category: kind === "restaurant" ? "음식" : kind === "transport" ? "교통" : spec.ledger,
      browse_category: browse,
      purchased_date: date,
      currency: "JPY",
      total_minor: list.reduce((sum, l) => sum + l.unitMinor * l.quantity, 0),
      rate,
      share_consent: share ? 1 : 0,
      created_at: `${date} ${two(hour)}:${two(int(0, 59))}:${two(int(0, 59))}.${String(int(0, 999999)).padStart(6, "0")}`,
    });
    for (const l of list)
      items.push({
        id: items.length + 1, receipt_id: id, raw_name: l.raw, name_ko: l.ko,
        normalized_name: normalizeProduct(l.raw), quantity: l.quantity, unit_minor: l.unitMinor,
      });
  };
  // 가끔 할인(약 10%)을 적용한 가격으로 삽니다.
  const line = (p, quantity = 1) => ({ raw: p.raw, ko: p.ko, quantity, unitMinor: chance(0.08) ? Math.round(p.price * 0.9) : p.price });
  const basket = (products, min, max) =>
    Array.from({ length: int(min, max) }, () => line(weighted(products), chance(0.2) ? 2 : 1));

  // 숙박은 체크인 날 한 번에 결제합니다. 숙박세는 객실 요금에 포함합니다.
  const room = hotel.products[0];
  receipt(hotel, start, int(15, 18), [
    { raw: room.raw, ko: room.ko, quantity: nights, unitMinor: room.price },
    ...(chance(0.35) ? [{ raw: "朝食", ko: "조식", quantity: nights * Math.min(party, 2), unitMinor: 1800 }] : []),
  ]);
  if (chance(0.25)) {
    const wifi = stores.find((s) => s.name === "포켓 와이파이 데스크");
    receipt(wifi, start, int(10, 14), [line(wifi.products[0])]);
  }
  for (let day = 0; day <= nights; day++) {
    const date = addDays(start, day);
    const last = day === nights;
    const area = shinjukuBase ? (chance(0.72) ? weighted(INSIDE) : weighted(OUTSIDE)) : chance(0.45) ? weighted(INSIDE) : weighted(OUTSIDE);
    const visit = (kind, filter) => pick(storesOf(kind, area, filter));
    const meal = (slot, hour) => {
      const [kind, filter] = STORE_TYPES_BY_SLOT[slot]();
      const store = visit(kind, filter);
      if (kind === "convenience") return receipt(store, date, hour, basket(store.products, 1, 4));
      const mains = store.products.filter((p) => p.main), sides = store.products.filter((p) => !p.main);
      const lines = [];
      for (let i = 0; i < party; i++) lines.push(line(weighted(mains)));
      for (let i = int(0, Math.min(3, party + 1)); i > 0; i--) lines.push(line(weighted(sides), chance(0.3) ? party : 1));
      receipt(store, date, hour, lines);
    };
    if (chance(0.5)) meal("breakfast", int(7, 10));
    if (!last || chance(0.6)) meal("lunch", int(11, 14));
    if (!last && chance(0.85)) meal("dinner", int(18, 21));
    for (let i = int(0, 2); i > 0; i--) {
      const store = visit("convenience");
      receipt(store, date, int(7, 23), basket(store.products, 1, 5));
    }
    if (last) {
      receipt(null, date, int(9, 12), [{ ...line(TRANSPORT[3]), quantity: party, unitMinor: 3600, storeName: "공항 리무진버스", address: `도쿄 ${area.ward} ${area.name}` }], "transport");
      if (chance(0.5)) {
        const store = visit("souvenir");
        receipt(store, date, int(9, 12), basket(store.products, 1, 4));
      }
      continue;
    }
    if (chance(0.45)) {
      const store = chance(0.7) ? visit("drugstore") : visit("discount");
      // PAGE 2 카테고리는 영수증 단위라, 할인점은 화장품만 산 영수증과 간식만 산 영수증으로 나눕니다.
      const beauty = chance(0.6);
      const products = store.kind === "discount" ? store.products.filter((p) => COSMETICS.some((c) => c.raw === p.raw) === beauty) : store.products;
      receipt(store, date, int(12, 21), basket(products, 1, 6));
    }
    if (chance(0.25)) {
      const store = visit("clothing");
      receipt(store, date, int(11, 20), basket(store.products, 1, 3).map((l) => ({ ...l, quantity: 1 })));
    }
    if (chance(0.2)) {
      const store = visit("souvenir");
      receipt(store, date, int(11, 20), basket(store.products, 1, 4));
    }
    if (chance(0.4)) {
      const store = visit("attraction");
      const lines = [{ ...line(store.products[0]), quantity: party }];
      if (store.products.length > 1 && chance(0.4)) lines.push(line(weighted(store.products.slice(1))));
      receipt(store, date, int(10, 17), lines);
    }
    if (chance(0.25)) {
      const store = visit("activity");
      const main = weighted(store.products);
      const quantity = main.price <= 100 ? int(3, 15) : main.raw.includes("バッティング") ? int(2, 5) : party;
      receipt(store, date, int(13, 22), [{ ...line(main), quantity }]);
    }
    if (chance(0.2)) {
      const store = visit("wellness");
      receipt(store, date, int(14, 22), [{ ...line(store.products[0]), quantity: chance(0.5) ? party : 1 },
        ...(store.products.length > 1 && chance(0.5) ? [line(weighted(store.products.slice(1)))] : [])]);
    }
    if (chance(0.06)) {
      const store = visit("rent", (s) => s.name !== "포켓 와이파이 데스크");
      receipt(store, date, int(9, 12), [line(store.products[0]), ...store.products.slice(1).filter(() => chance(0.5)).map((p) => line(p))]);
    }
    if (chance(0.6)) {
      const t = weighted([{ ...TRANSPORT[0], w: 4 }, { ...TRANSPORT[1], w: 3 }, { ...TRANSPORT[2], w: 2 }]);
      receipt(null, date, int(8, 22), [{ raw: t.raw, ko: t.ko, quantity: 1, unitMinor: t.price(), storeName: t.raw === "タクシー運賃" ? "도쿄 택시" : "교통 발매기", address: `도쿄 ${area.ward} ${area.name}` }], "transport");
    }
  }
}

// 테이블 제약조건과 같은 규칙으로 검사합니다. 하나라도 어기면 파일을 쓰지 않습니다.
// CSV의 빈 칸은 NULL로 읽히므로, NOT NULL 문자열 열(store_address 등)에는 빈 문자열을 두지 않습니다.
const BROWSE = new Set(["식당", "명소", "화장품", "의류", "뷰티·웰니스", "숙박", "액티비티", "렌트"]);
const LEDGER = new Set(["음식", "쇼핑", "교통", "숙박", "관광", "기타"]);
const sums = new Map();
for (const i of items) {
  if (!(i.quantity >= 1 && i.quantity <= 999 && i.unit_minor > 0 && i.raw_name.length <= 160 && i.name_ko.length <= 160 && i.normalized_name.length <= 200))
    throw new Error(`품목 ${i.id} 값 오류`);
  sums.set(i.receipt_id, (sums.get(i.receipt_id) || 0) + i.quantity * i.unit_minor);
}
for (const r of receipts) {
  const t = trips[r.trip_id - 1];
  if (sums.get(r.id) !== r.total_minor || !LEDGER.has(r.ledger_category) || (r.browse_category && !BROWSE.has(r.browse_category))
      || (r.share_consent && r.latitude == null) || r.purchased_date < t.start_date || r.purchased_date > t.end_date
      || r.purchased_date > TODAY || r.store_name.length > 120 || !r.store_address || r.store_address.length > 250)
    throw new Error(`영수증 ${r.id} 값 오류`);
}

const cell = (v) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};
const write = (name, rows) => {
  const columns = Object.keys(rows[0]);
  writeFileSync(new URL(name, OUT), [columns.join(","), ...rows.map((r) => columns.map((c) => cell(r[c])).join(","))].join("\n") + "\n");
};
mkdirSync(OUT, { recursive: true });
write("devices.csv", devices);
write("trips.csv", trips);
write("receipts.csv", receipts);
write("receipt_items.csv", items);

// 요약: PAGE 2 기준(공유 동의 + 신주쿠역 3km 안)으로 몇 건이 보이는지 함께 출력합니다.
const inside = (r) => r.latitude != null && distanceMeters(DEMO_LOCATION, r) <= RADIUS;
const visible = receipts.filter((r) => r.share_consent && inside(r));
const byCategory = {};
for (const r of visible) byCategory[r.browse_category ?? "(카테고리 없음)"] = (byCategory[r.browse_category ?? "(카테고리 없음)"] || 0) + 1;
const visibleIds = new Set(visible.map((r) => r.id));
const doritos = items.filter((i) => visibleIds.has(i.receipt_id) && i.name_ko.includes("도리토스"));
console.log(`매장 ${stores.length}곳 (반경 안 ${stores.filter((s) => distanceMeters(DEMO_LOCATION, s) <= RADIUS).length}곳)`);
console.log(`기기 ${devices.length} · 여행 ${trips.length} · 영수증 ${receipts.length} · 품목 ${items.length}`);
console.log(`PAGE 2에 보이는 영수증(공유 + 반경 3km): ${visible.length}`, byCategory);
console.log(`PAGE 2 "도리토스" 구매 품목: ${doritos.length}건, 매장 ${new Set(doritos.map((i) => receipts[i.receipt_id - 1].store_name)).size}곳`);
