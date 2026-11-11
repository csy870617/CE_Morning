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
  praise: ['서집사', '류집사'],
  holidaySermon: ['한목사'],
  holidayBroadcast: ['노집사'],
  usher: ['고집사', '남집사', '도집사', '마집사', '배집사', '신집사', '양집사']
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

const ushersByWeek = {};
sched.usherWeeks.forEach(w => { ushersByWeek[w.iso] = w; });

console.log(`\n${year}년 ${month}월 새벽 설교자 및 백업   (기준일 ${cfg.anchor})\n`);
console.log(pad('', 18) + ['월', '화', '수', '목', '금', '토'].map(d => pad(d, 12)).join('') +
  '  |  ' + '현관안내(수,토)');
for (const week of grid.weeks) {
  const rows = { Date: [], 설교자: [], 방송실: [], '수요/토요 서브': [] };
  let wedIso = '', wedDay = '', satDay = '';
  for (const cell of week) {
    const a = sched.byIso[cell.iso] || {};
    rows.Date.push(cell.inMonth ? cell.day : `(${cell.day})`);
    rows['설교자'].push(a.preacher || '-');
    rows['방송실'].push((a.broadcast || '-') + (a.swapNote ? '*' : ''));
    const isWed = cfg.doorDows.includes(cell.dow);
    const isSat = cfg.praiseDows.includes(cell.dow);
    rows['수요/토요 서브'].push(isWed ? (a.door || '') : isSat ? (a.praise || '') : '');
    if (isWed) { wedIso = cell.iso; wedDay = cell.day; }
    if (isSat) satDay = cell.day;
  }
  const w = ushersByWeek[wedIso] || { ushers: [] };
  const side = [`(${wedDay},${satDay})`].concat(w.ushers.length ? w.ushers : ['-', '-', '-']);

  console.log('-'.repeat(90));
  Object.keys(rows).forEach((label, i) => {
    console.log(pad(label, 18) + rows[label].map(v => pad(v, 12)).join('') +
      '  |  ' + (side[i] || ''));
  });
}
console.log('-'.repeat(90));
console.log('\n* 설교자와 겹쳐 다음날(같은 요일 묶음) 방송실과 맞바꾼 자리');
console.log('휴일로 잡은 날은 휴일(설교)·휴일(백업) 명단에서 들어갑니다 (한목사 / 노집사)');
console.log('토요일은 설교·방송을 별도 명단으로 돌립니다 (강목사·조전도사 / 임집사·강목사)');
console.log('현관안내는 수요일이 든 주마다 세 명씩 돌아갑니다');
console.log('예외: 이목사 9/7~9/12 휴가, 정집사 9/2 방송 제외, 9/16~9/17 휴일\n');
