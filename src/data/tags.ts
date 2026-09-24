// SKEAM's default tags, taken from Steam's Korean "카테고리" menu. Creators
// can still type their own tags; these are what the menu and the register
// helper offer first.

/** "모든 장르 및 테마": one column each, in Steam's order. */
export const TAG_COLUMNS: { name: string; tags: string[] }[] = [
  { name: '액션', tags: ['1인칭 슈팅', '3인칭 슈팅', '핵 앤 슬래시', '아케이드 및 리듬', '플랫폼 게임 및 러너', '숏뎀업', '격투 및 무술'] },
  { name: '어드벤처·캐주얼', tags: ['숨은 그림 및 물체', '캐주얼', '메트로배니아', '퍼즐', '어드벤처 RPG', '비주얼 노벨', '풍부한 스토리'] },
  { name: '롤플레잉', tags: ['액션 RPG', '전략 및 전술 RPG', 'JRPG', '로그라이크 및 로그라이트', '턴제 RPG', '어드벤처 RPG', '파티 기반'] },
  {
    name: '시뮬레이션',
    tags: ['건설 및 자동화 시뮬레이션', '취미 및 직업 시뮬레이션', '연애 시뮬레이션', '농업 및 제작 시뮬레이션', '우주 및 비행 시뮬레이션', '생활 및 몰입형 시뮬레이션', '샌드박스 및 물리 시뮬레이션'],
  },
  { name: '전략', tags: ['턴제 전략', '실시간 전략', '타워 디펜스', '카드 및 보드', '도시 및 정착지 건설', '대전략 및 4X', '군사 전략'] },
  { name: '스포츠·레이싱', tags: ['스포츠 시뮬레이션 및 스포츠 경영', '레이싱', '레이싱 시뮬레이션', '팀 스포츠', '개별 스포츠', '스포츠'] },
  { name: '테마', tags: ['공포', '공상과학 및 사이버펑크', '우주', '오픈 월드', '애니메이션', '생존', '미스터리 및 추리', '성인 전용'] },
]

/** Big picture cards ("선호 카테고리"), with Steam's tint colors. */
export const FEATURED_TAGS: { tag: string; from: string; to: string }[] = [
  { tag: '요리', from: '#f0663a', to: '#b8342a' },
  { tag: '사이버펑크', from: '#f2cc2e', to: '#7a3fa0' },
  { tag: '아이들러', from: '#5f9a2c', to: '#c2c43a' },
  { tag: '미래적', from: '#1d7fd0', to: '#1fb8a2' },
  { tag: '오픈 월드', from: '#d8443e', to: '#7a1c3a' },
  { tag: '생활 및 몰입형 시뮬레이션', from: '#e08a2e', to: '#8a4a1a' },
]

/** The row of small blue pills under the cards. */
export const PILL_TAGS = ['프로그래밍', '성인 전용', '몰입형 시뮬레이션', '공상과학', '1인칭 슈팅', '캐릭터 커스터마이즈', '릴랙싱', '탐험', '분위기 있는', '1인칭', '풍부한 스토리', 'RPG']

/** Every default tag once, for pickers. */
export const DEFAULT_TAGS = [...new Set([...FEATURED_TAGS.map((f) => f.tag), ...PILL_TAGS, ...TAG_COLUMNS.flatMap((c) => c.tags)])]

/** Tint colors for cards whose tag isn't one of the featured six. */
export const TINTS = FEATURED_TAGS.map(({ from, to }) => ({ from, to }))
