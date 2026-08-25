/* 시트 없이 배정 결과를 미리 봅니다.
   node tools/preview.js [YYYY-MM] */
const R = require('../src/Rotation.gs');

const arg = process.argv[2] || '2026-09';
const [year, month] = arg.split('-').map(Number);

const cfg = {
  anchor: '2026-08-31', dawnDows: [1, 2, 3, 4, 5, 6],
  satDows: [6], doorDows: [3], praiseDows: [6]
};
const rotations = {
  sermon: ['김목사', '이목사', '박전도사', '최목사'],
  broadcast: ['정집사', '김목사', '한집사'],
  satSermon: ['강목사', '조전도사'],
  satBroadcast: ['임집사', '강목사'],
  door: ['오권사', '윤집사'],
  praise: ['서집사', '류집사']
};
const exceptions = [
  { name: '이목사', start: '2026-09-07', end: '2026-09-12', role: R.CE_ROLE.ALL },
  { name: '정집사', start: '2026-09-02', end: '2026-09-02', role: R.CE_ROLE.BROADCAST },
  { name: '휴일', start: '2026-09-16', end: '2026-09-17', role: R.CE_ROLE.ALL }
];

const grid = R.ceMonthGrid(year, month);
const sched = R.ceBuildSchedule(cfg, rotations, exceptions, grid.endIso);

const pad = (s, n) => {
  s = String(s == null ? '' : s);
  let w = 0;
  for (const ch of s) w += ch.charCodeAt(0) > 0x2000 ? 2 : 1;
  return s + ' '.repeat(Math.max(0, n - w));
};

console.log(`\n${year}년 ${month}월 새벽 설교자 및 백업   (기준일 ${cfg.anchor})\n`);
console.log(pad('', 18) + ['월', '화', '수', '목', '금', '토'].map(d => pad(d, 12)).join(''));
for (const week of grid.weeks) {
  const rows = { Date: [], 설교자: [], 방송실: [], '수요현관/토요찬양': [] };
  for (const cell of week) {
    const a = sched.byIso[cell.iso] || {};
    rows.Date.push(cell.inMonth ? cell.day : `(${cell.day})`);
    rows['설교자'].push(a.offSermon ? '[휴일]' : (a.preacher || '-'));
    rows['방송실'].push(a.offBroadcast ? '[휴일]' : (a.broadcast || '-') + (a.swapNote ? '*' : ''));
    const isWed = cfg.doorDows.includes(cell.dow);
    const isSat = cfg.praiseDows.includes(cell.dow);
    rows['수요현관/토요찬양'].push(
      isWed ? (a.offDoor ? '[휴일]' : a.door || '') :
      isSat ? (a.offPraise ? '[휴일]' : a.praise || '') : '');
  }
  console.log('-'.repeat(90));
  for (const label of Object.keys(rows)) {
    console.log(pad(label, 18) + rows[label].map(v => pad(v, 12)).join(''));
  }
}
console.log('-'.repeat(90));
console.log('\n* 설교자와 겹쳐 다음날 방송실과 맞바꾼 자리');
console.log('[휴일] 은 시트에서 빈 칸으로 나옵니다 (직접 입력)');
console.log('토요일은 설교·방송을 별도 명단으로 돌립니다 (강목사·조전도사 / 임집사·강목사)');
console.log('예외: 이목사 9/7~9/12 휴가, 정집사 9/2 방송 제외, 9/16~9/17 휴일\n');
